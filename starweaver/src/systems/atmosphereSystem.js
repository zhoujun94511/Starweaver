import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from '../utils/math.js';
import { KHARIS_PLANET_DIR } from '../graphics/skyDome.js';
import { WORLD_ATMOSPHERE_PROFILES } from './atmosphereProfiles.js';

/**
 * Authoritative Planetary Day-Night Cycle & 3-State Desert Weather Orchestrator.
 * - Time of Day: Smooth 7-minute Kharis-4 orbital cycle (Azure Twin-Sun Day <-> Golden-Ruby Twilight <-> Starry Milky Way & Giant Ringed Planet Night),
 *   plus manual lock modes ('cycle' | 'day' | 'night').
 * - Weather: Natural Kharis-4 desert progression ('dynamic' | 'clear' | 'overcast' | 'sandstorm').
 *   Protects Level 1 onboarding with clear skies for the first 150s of active play!
 * - Performance Guardrails:
 *   1. Pre-baked static Day & Night PMREM probes swapped cleanly at twilight (0.00ms runtime IBL cost).
 *   2. Step-quantized solar shadow angles + azimuth-matched Planet Moonlight shadow handoff.
 */
const CYCLE_SECONDS = 420.0; // 7 minutes per full planetary rotation
const INITIAL_CYCLE_PHASE = 0.14;

export class AtmosphereSystem {
  constructor({ state, scene, environments, world, robot, postProcessing, sound, weatherParticles }) {
    this.state = state;
    this.scene = scene;
    this.environments = environments;
    this.world = world;
    this.robot = robot;
    this.postProcessing = postProcessing;
    this.sound = sound;
    this.weatherParticles = weatherParticles;

    // Start at bright morning-forenoon (phase = 0.14 in [0..1])
    this.cyclePhase = INITIAL_CYCLE_PHASE;
    this.nightFactor = 0.0;
    const initOrbitalAngle = (INITIAL_CYCLE_PHASE - 0.03) * Math.PI * 2;
    this._sunAltitudeSin = clamp(Math.sin(initOrbitalAngle) + 0.18, -0.85, 0.96);
    this._sunAzimuth = 0.35 + INITIAL_CYCLE_PHASE * Math.PI * 1.65;
    this._twilightAmt = 0.0;
    this.overcastWeight = 0.0;
    this.sandstormWeight = 0.0;
    this._resolvedTimeMode = (state.settings && state.settings.timeMode) || 'cycle';
    this._resolvedWeatherMode = (state.settings && state.settings.weatherMode) || 'dynamic';

    // Dynamic weather state machine
    this.playElapsed = 0;
    this.dynamicTarget = 'clear';
    this.weatherTimer = 95.0;
    this._weatherRoll = 0;

    // Single-source-of-truth celestial & shadow vectors (zero per-frame GC!)
    this._sunDir = new THREE.Vector3(42, 64, 28).normalize();
    this._twinDir = new THREE.Vector3(68, 46, 54).normalize();
    this._planetDir = KHARIS_PLANET_DIR.clone();

    // Planet moonlight shadow offset: exact same horizontal azimuth as KHARIS_PLANET_DIR,
    // with safe ~33 deg shadow elevation so shadow frustum stays razor-sharp without horizon stretching!
    const pHorizLen = Math.hypot(this._planetDir.x, this._planetDir.z) || 1;
    const moonElevSin = 0.545;
    const moonElevCos = Math.sqrt(1 - moonElevSin * moonElevSin);
    this._planetMoonOffset = new THREE.Vector3(
      (this._planetDir.x / pHorizLen) * moonElevCos * 78,
      moonElevSin * 78,
      (this._planetDir.z / pHorizLen) * moonElevCos * 78
    );

    this._defaultDayShadowOffset = new THREE.Vector3(42, 64, 28);
    this._homeworldShadowOffset = new THREE.Vector3(38, 66, 32);
    this._homeworldSunsetShadowOffset = new THREE.Vector3(-54, 28, 42);
    this._activeShadowOffset = new THREE.Vector3(42, 64, 28);
    this._volLightDir = new THREE.Vector3();
    this._quantizedStep = -1;
    this._usingNightEnv = false;
    this._homeworldSunsetBlend = 0.0;
    this._homeworldNightBlend = 0.0;
    this._resolvedHomeworldAtmo = 'dawn';

    const dp = WORLD_ATMOSPHERE_PROFILES.desert;
    const hp = WORLD_ATMOSPHERE_PROFILES.homeworld;

    this._cDayZenith = new THREE.Color(dp.zenithDay);
    this._cDuskZenith = new THREE.Color(dp.zenithDusk);
    this._cStormZenith = new THREE.Color(dp.zenithStorm);
    this._cHomeDawnZenith = new THREE.Color(hp.zenithDawn);
    this._cHomeSunsetZenith = new THREE.Color(hp.zenithSunset);

    this._cDayMid = new THREE.Color(dp.midDay);
    this._cDuskMid = new THREE.Color(dp.midDusk);
    this._cOvercastMid = new THREE.Color(dp.overcastMid);
    this._cStormMid = new THREE.Color(dp.stormMid);
    this._cHomeDawnMid = new THREE.Color(hp.midDawn);
    this._cHomeSunsetMid = new THREE.Color(hp.midSunset);

    this._cDayHorSun = new THREE.Color(dp.horSunDay);
    this._cDuskHorSun = new THREE.Color(dp.horSunDusk);
    this._cStormHorSun = new THREE.Color(dp.horSunStorm);
    this._cHomeDawnHorSun = new THREE.Color(hp.horSunDawn);
    this._cHomeSunsetHorSun = new THREE.Color(hp.horSunSunset);

    this._cDayHorAway = new THREE.Color(dp.horAwayDay);
    this._cDuskHorAway = new THREE.Color(dp.horAwayDusk);
    this._cStormHorAway = new THREE.Color(dp.horAwayStorm);
    this._cHomeDawnHorAway = new THREE.Color(hp.horAwayDawn);
    this._cHomeSunsetHorAway = new THREE.Color(hp.horAwaySunset);

    this._cHomeDawnGroundHaze = new THREE.Color(hp.groundHazeDawn);
    this._cHomeSunsetGroundHaze = new THREE.Color(hp.groundHazeSunset);
    this._cHomeDawnCloudCool = new THREE.Color(hp.cloudCoolDawn);
    this._cHomeSunsetCloudCool = new THREE.Color(hp.cloudCoolSunset);
    this._cHomeDawnCloudDark = new THREE.Color(hp.cloudDarkDawn);
    this._cHomeSunsetCloudDark = new THREE.Color(hp.cloudDarkSunset);

    this._cSunNoon = new THREE.Color(dp.sunNoon);
    this._cSunDusk = new THREE.Color(dp.sunDusk);
    this._cMoonCol = new THREE.Color(dp.moon);
    this._cHomeSun = new THREE.Color(hp.sunDawn);
    this._cHomeSunsetSun = new THREE.Color(hp.sunSunset);
    this._cHomeMoonCol = new THREE.Color(hp.moon);

    this._cHemiSkyDay = new THREE.Color(dp.hemiSkyDay);
    this._cHemiSkyNight = new THREE.Color(dp.hemiSkyNight);
    this._cHemiSkyStorm = new THREE.Color(dp.hemiSkyStorm);
    this._cHemiSkyHome = new THREE.Color(hp.hemiSkyDawn);
    this._cHemiSkyHomeSunset = new THREE.Color(hp.hemiSkySunset);
    this._cHemiSkyHomeNight = new THREE.Color(hp.hemiSkyNight);

    this._cHemiGndDay = new THREE.Color(dp.hemiGndDay);
    this._cHemiGndNight = new THREE.Color(dp.hemiGndNight);
    this._cHemiGndHome = new THREE.Color(hp.hemiGndDawn);
    this._cHemiGndHomeSunset = new THREE.Color(hp.hemiGndSunset);
    this._cHemiGndHomeNight = new THREE.Color(hp.hemiGndNight);

    this._cFogDay = new THREE.Color(dp.fogDay);
    this._cFogDusk = new THREE.Color(dp.fogDusk);
    this._cFogNight = new THREE.Color(dp.fogNight);
    this._cFogStorm = new THREE.Color(dp.fogStorm);
    this._cFogHomeDawn = new THREE.Color(hp.fogDawn);
    this._cFogHomeSunset = new THREE.Color(hp.fogSunset);
    this._cFogHomeNight = new THREE.Color(hp.fogNight);

    this._tmpColA = new THREE.Color();
    this._tmpColB = new THREE.Color();

    this.restoreFromState();
  }

  /**
   * Cleanly resets all planetary cycle & weather weights when starting or resetting a mission,
   * guaranteeing a crisp clear daylight onboarding regardless of prior session or title idle time!
   */
  resetForNewMission() {
    this.cyclePhase = INITIAL_CYCLE_PHASE;
    this.nightFactor = 0.0;
    this.overcastWeight = 0.0;
    this.sandstormWeight = 0.0;
    this.playElapsed = 0;
    this.dynamicTarget = 'clear';
    this.weatherTimer = 95.0;
    this._weatherRoll = 0;
    this._quantizedStep = -1;
    this._usingNightEnv = false;
    this._syncStateClock();
    if (this.state && typeof this.state.setSolarEnv === 'function') {
      this.state.setSolarEnv(0, 0, 0);
    }
  }

  /**
   * Restores persisted orbital cycle phase & active play timer when loading a saved game.
   */
  restoreFromState() {
    if (!this.state || !this.state.envClock) return;
    const { cyclePhase, playElapsed } = this.state.envClock;
    if (Number.isFinite(cyclePhase) && cyclePhase >= 0 && cyclePhase < 1) {
      this.cyclePhase = cyclePhase;
    }
    if (Number.isFinite(playElapsed) && playElapsed >= 0) {
      this.playElapsed = playElapsed;
    }
    this._quantizedStep = -1;
  }

  _syncStateClock() {
    if (!this.state) return;
    this.state.setEnvClock(this.cyclePhase, this.playElapsed);
  }

  /**
   * Resets & harmonizes lighting, probes, shadows, and post-processing for cutscenes
   * (Intro Crash or Launch Ascent / Homeworld Meadow Ending).
   */
  applyCutsceneOverride(mode, camera, progress = 0) {
    if (this.weatherParticles) {
      this.weatherParticles.update(0, camera, 0, 0);
    }
    if (this.robot && this.robot.setNightHeadlamp) {
      this.robot.setNightHeadlamp(0);
    }
    if (this.sound && this.sound.setWeatherIntensity) {
      this.sound.setWeatherIntensity(0, 0);
    }

    if (mode === 'intro') {
      if (this.postProcessing) {
        this.postProcessing.planeBaseY = WORLD_ATMOSPHERE_PROFILES.desert.planeBaseY;
      }
      this.nightFactor = 0.0;
      this.overcastWeight = 0.0;
      this.sandstormWeight = 0.0;
      this._quantizedStep = -901;

      if (this.world && this.world.skyDome) {
        const skyU = this.world.skyDome.uniforms;
        skyU.uNightFactor.value = 0.0;
        skyU.uDustVeil.value = 0.16;
        skyU.uCloudCoverage.value = 0.50;
        skyU.uPlanetDir.value.copy(this._planetDir);
      }
      if (this.environments && this.environments.desert && this.scene.environment !== this.environments.desert) {
        this.scene.environment = this.environments.desert;
      }
      this._usingNightEnv = false;
      this.scene.environmentIntensity = 0.96;

      if (this.world) {
        this.world.sunLight.color.copy(this._cSunNoon);
        this.world.sunLight.intensity = 2.6;
        this._syncWorldShadowOffset(this._defaultDayShadowOffset);
        this.world.hemiLight.color.copy(this._cHemiSkyDay);
        this.world.hemiLight.groundColor.copy(this._cHemiGndDay);
        this.world.hemiLight.intensity = 0.56;
      }
      this._applyCutscenePostAndWater(this._defaultDayShadowOffset, this._cSunNoon, 0.0026, 0.18);
      return;
    }

    if (mode === 'launch') {
      const isHomeworld = progress >= 0.58;
      this._quantizedStep = isHomeworld ? -903 : -902;
      if (this.postProcessing) {
        this.postProcessing.planeBaseY = isHomeworld
          ? WORLD_ATMOSPHERE_PROFILES.homeworld.planeBaseY
          : WORLD_ATMOSPHERE_PROFILES.desert.planeBaseY;
      }

      if (!isHomeworld) {
        // Act 1 & Act 2: Radiant desert liftoff & orbital climb
        const spaceFade = progress >= 0.22 ? clamp((progress - 0.22) / 0.36, 0, 1) : 0;
        if (this.environments && this.environments.desert && this.scene.environment !== this.environments.desert) {
          this.scene.environment = this.environments.desert;
        }
        this._usingNightEnv = false;
        this.scene.environmentIntensity = lerp(0.96, 0.72, spaceFade);

        if (this.world) {
          this.world.sunLight.color.copy(this._cSunNoon);
          this.world.sunLight.intensity = 2.58;
          this._syncWorldShadowOffset(this._defaultDayShadowOffset);
          this.world.hemiLight.color.copy(this._cHemiSkyDay);
          this.world.hemiLight.groundColor.copy(this._cHemiGndDay);
          this.world.hemiLight.intensity = lerp(0.58, 0.38, spaceFade);
        }
        this._applyCutscenePostAndWater(
          this._defaultDayShadowOffset,
          this._cSunNoon,
          lerp(0.0024, 0.0004, spaceFade),
          0.16 * (1 - spaceFade)
        );
      } else {
        // Act 3 & Ending Modal: Sunlit Homeworld Meadow at Y = 420!
        if (this.environments && this.environments.homeworld && this.scene.environment !== this.environments.homeworld) {
          this.scene.environment = this.environments.homeworld;
        }
        this._usingNightEnv = false;
        this.scene.environmentIntensity = 1.0;

        if (this.world) {
          this.world.sunLight.color.copy(this._cHomeSun);
          this.world.sunLight.intensity = 2.68;
          this._syncWorldShadowOffset(this._homeworldShadowOffset);
          this.world.hemiLight.color.copy(this._cHemiSkyHome);
          this.world.hemiLight.groundColor.copy(this._cHemiGndHome);
          this.world.hemiLight.intensity = 0.68;
        }
        this._applyCutscenePostAndWater(this._homeworldShadowOffset, this._cHomeSun, 0.00065, 0.14);
      }
    }
  }

  _applyCutscenePostAndWater(lightOffset, lightColor, sigma, flareStrength) {
    this._volLightDir.copy(lightOffset).normalize();
    if (this.postProcessing && this.postProcessing.passes) {
      const volU = this.postProcessing.passes.volumetric.uniforms;
      const gradeU = this.postProcessing.passes.grade.uniforms;
      volU.uSunDir.value.copy(this._volLightDir);
      volU.uSunColor.value.copy(lightColor);
      volU.uSigma.value = sigma;
      this.postProcessing._sunDirNorm.copy(this._volLightDir);
      gradeU.uFlareStrength.value = flareStrength;
      gradeU.uBloomStrength.value = 0.30;
      gradeU.uBaseExposure.value = 1.04;
    }
    if (this.world && this.world.planarReflection) {
      this.world.planarReflection.sharedUniforms.uSunDir.value.copy(this._volLightDir);
      this.world.planarReflection.sharedUniforms.uNightFactor.value = 0.0;
      this.world.planarReflection.sharedUniforms.uWeatherClarity.value = 1.0;
    }
  }

  /**
   * Drives the Emerald Valley Homeworld atmosphere across 3 curated modes:
   * - 'dawn': Radiant golden-azure morning (default baseline contrasting desert storms)
   * - 'sunset': Golden-crimson twilight over the alpine peaks & mirror pond (unlocked at 100% Watch + 3+ Climate Beacons)
   * - 'night': Starry Milky Way & colossal ringed planet night sky with glowing monument star-crest & valley lanterns
   */
  updateHomeworld(dt, elapsed, camera, isPaused = false) {
    const mode =
      this.state && typeof this.state.getHomeworldAtmosphere === 'function'
        ? this.state.getHomeworldAtmosphere()
        : 'dawn';
    const modeChanged = mode !== this._resolvedHomeworldAtmo;
    this._resolvedHomeworldAtmo = mode;
    if (isPaused && modeChanged) {
      this.postProcessing?.resetExposure?.();
    }

    const targetSunset = mode === 'sunset' ? 1.0 : 0.0;
    const targetNight = mode === 'night' ? 1.0 : 0.0;
    const snapPaused = isPaused && modeChanged;

    this._homeworldSunsetBlend = snapPaused
      ? targetSunset
      : damp(this._homeworldSunsetBlend, targetSunset, 3.2, dt);
    this._homeworldNightBlend = snapPaused
      ? targetNight
      : damp(this._homeworldNightBlend, targetNight, 3.2, dt);

    const sBlend = clamp(this._homeworldSunsetBlend, 0, 1);
    const nBlend = clamp(this._homeworldNightBlend, 0, 1);
    const skyNightK = clamp(nBlend + sBlend * 0.22, 0, 1);

    this.nightFactor = skyNightK;
    this.overcastWeight = 0.0;
    this.sandstormWeight = 0.0;

    // 1. Celestial Sun / Planet Shadow Offset & Direction
    this._activeShadowOffset
      .copy(this._homeworldShadowOffset)
      .lerp(this._homeworldSunsetShadowOffset, sBlend)
      .lerp(this._planetMoonOffset, nBlend);
    this._sunDir.copy(this._activeShadowOffset).normalize();

    const stepCode = mode === 'night' ? -912 : mode === 'sunset' ? -911 : -910;
    if (this._quantizedStep !== stepCode || sBlend > 0.01 || nBlend > 0.01) {
      this._quantizedStep = stepCode;
      this._syncWorldShadowOffset(this._activeShadowOffset);
    }

    // 2. SkyDome Uniforms
    if (this.world && this.world.skyDome) {
      const skyU = this.world.skyDome.uniforms;
      skyU.uIsHomeworld.value = 1.0;
      skyU.uSpaceBlend.value = 0.0;
      skyU.uDustVeil.value = 0.0;
      skyU.uNightFactor.value = skyNightK;
      skyU.uCloudCoverage.value = lerp(0.42, 0.48, sBlend) * (1.0 - nBlend * 0.45);
      skyU.uSunDir.value.copy(this._sunDir);
      skyU.uPlanetDir.value.copy(this._planetDir);

      skyU.uZenithColor.value
        .copy(this._cHomeDawnZenith)
        .lerp(this._cHomeSunsetZenith, sBlend);
      skyU.uMidSkyColor.value
        .copy(this._cHomeDawnMid)
        .lerp(this._cHomeSunsetMid, sBlend);
      skyU.uHorizonColor.value
        .copy(this._cHomeDawnHorSun)
        .lerp(this._cHomeSunsetHorSun, sBlend);
      skyU.uHorizonAway.value
        .copy(this._cHomeDawnHorAway)
        .lerp(this._cHomeSunsetHorAway, sBlend);
      skyU.uGroundHaze.value
        .copy(this._cHomeDawnGroundHaze)
        .lerp(this._cHomeSunsetGroundHaze, sBlend);
      skyU.uSunColor.value
        .copy(this._cHomeSun)
        .lerp(this._cHomeSunsetSun, sBlend)
        .lerp(this._cHomeMoonCol, nBlend);
      skyU.uCloudCool.value
        .copy(this._cHomeDawnCloudCool)
        .lerp(this._cHomeSunsetCloudCool, sBlend);
      skyU.uCloudDark.value
        .copy(this._cHomeDawnCloudDark)
        .lerp(this._cHomeSunsetCloudDark, sBlend);
    }

    // 3. Static PMREM Environment Probe Handoff
    const wantNightEnv = nBlend >= 0.55;
    if (this.environments) {
      if (wantNightEnv && this.environments.desertNight) {
        if (this.scene.environment !== this.environments.desertNight) {
          this.scene.environment = this.environments.desertNight;
        }
        this._usingNightEnv = true;
      } else if (this.environments.homeworld) {
        if (this.scene.environment !== this.environments.homeworld) {
          this.scene.environment = this.environments.homeworld;
        }
        this._usingNightEnv = false;
      }
    }
    this.scene.environmentIntensity = lerp(lerp(1.0, 0.92, sBlend), 0.78, nBlend);

    // 4. Directional Sun / Moonlight & Hemisphere Fill
    if (this.world) {
      this._tmpColA
        .copy(this._cHomeSun)
        .lerp(this._cHomeSunsetSun, sBlend)
        .lerp(this._cHomeMoonCol, nBlend);
      this.world.sunLight.color.copy(this._tmpColA);
      this.world.sunLight.intensity = lerp(lerp(2.68, 2.38, sBlend), 1.48, nBlend);

      this.world.hemiLight.color
        .copy(this._cHemiSkyHome)
        .lerp(this._cHemiSkyHomeSunset, sBlend)
        .lerp(this._cHemiSkyHomeNight, nBlend);
      this.world.hemiLight.groundColor
        .copy(this._cHemiGndHome)
        .lerp(this._cHemiGndHomeSunset, sBlend)
        .lerp(this._cHemiGndHomeNight, nBlend);
      this.world.hemiLight.intensity = lerp(lerp(0.68, 0.62, sBlend), 0.44, nBlend);
    }

    // 5. Exponential Distance Fog
    if (this.scene && this.scene.fog) {
      this._tmpColB
        .copy(this._cFogHomeDawn)
        .lerp(this._cFogHomeSunset, sBlend)
        .lerp(this._cFogHomeNight, nBlend);
      this.scene.fog.color.copy(this._tmpColB);
      if (this.scene.background) {
        this.scene.background.copy(this._tmpColB);
      }
      this.scene.fog.density = lerp(lerp(0.00055, 0.00068, sBlend), 0.00062, nBlend);
    }

    // 6. Post-Processing Volumetric God-Rays, Flare, Bloom & Planar Water Reflections
    this._volLightDir.copy(nBlend > 0.55 ? this._planetDir : this._sunDir).normalize();
    if (this.postProcessing && this.postProcessing.passes) {
      const volU = this.postProcessing.passes.volumetric.uniforms;
      const gradeU = this.postProcessing.passes.grade.uniforms;
      volU.uSunDir.value.copy(this._volLightDir);
      if (this.world && this.world.sunLight) {
        volU.uSunColor.value.copy(this.world.sunLight.color);
      }
      volU.uSigma.value = lerp(lerp(0.00065, 0.00125, sBlend), 0.00085, nBlend);
      this.postProcessing._sunDirNorm.copy(this._volLightDir);
      gradeU.uFlareStrength.value = lerp(lerp(0.14, 0.22, sBlend), 0.04, nBlend);
      gradeU.uBloomStrength.value = lerp(lerp(0.30, 0.38, sBlend), 0.46, nBlend);
      gradeU.uBaseExposure.value = lerp(lerp(1.04, 1.08, sBlend), 1.18, nBlend);
    }

    if (this.world && this.world.planarReflection) {
      this.world.planarReflection.sharedUniforms.uSunDir.value.copy(this._volLightDir);
      this.world.planarReflection.sharedUniforms.uNightFactor.value = skyNightK;
      this.world.planarReflection.sharedUniforms.uWeatherClarity.value = 1.0;
    }

    // 7. Homeworld Water Shader Uniforms & Milo's Night Headlamp
    const hwWaterU =
      this.world?.spacecraft?.homeworldActivityVisuals?.waterUniforms || null;
    if (hwWaterU) {
      if (hwWaterU.uSunDir) hwWaterU.uSunDir.value.copy(this._volLightDir);
      if (hwWaterU.uSunColor && this.world?.sunLight) {
        hwWaterU.uSunColor.value.copy(this.world.sunLight.color);
      }
      if (hwWaterU.uSunsetFactor) hwWaterU.uSunsetFactor.value = sBlend;
      if (hwWaterU.uNightFactor) hwWaterU.uNightFactor.value = nBlend;
    }

    if (this.robot && this.robot.setNightHeadlamp) {
      const nightLamp = smoothstep(0.35, 0.82, nBlend);
      this.robot.setNightHeadlamp(nightLamp, nightLamp);
    }
    if (this.weatherParticles) {
      this.weatherParticles.update(elapsed, camera, 0, nBlend * 0.65);
    }
    if (this.sound && this.sound.setWeatherIntensity) {
      this.sound.setWeatherIntensity(0, 0);
    }
  }

  update(dt, elapsed, camera, isPaused = false, { isTitle = false } = {}) {
    const timeMode = (this.state.settings && this.state.settings.timeMode) || 'cycle';
    const weatherMode = (this.state.settings && this.state.settings.weatherMode) || 'dynamic';
    const timeModeChanged = timeMode !== this._resolvedTimeMode;
    const weatherModeChanged = weatherMode !== this._resolvedWeatherMode;
    this._resolvedTimeMode = timeMode;
    this._resolvedWeatherMode = weatherMode;
    if (isPaused && (timeModeChanged || weatherModeChanged)) {
      this.postProcessing?.resetExposure?.();
    }

    // Title screen never consumes the 150s Level 1 clear-sky onboarding timer or triggers background storms!
    if (!isPaused && !isTitle) {
      this.playElapsed += dt;

      if (timeMode === 'cycle') {
        this.cyclePhase = (this.cyclePhase + dt / CYCLE_SECONDS) % 1.0;
      }

      if (weatherMode === 'dynamic') {
        this._tickDynamicWeatherSchedule(dt);
      }

      this._syncStateClock();
    } else if (!isPaused && isTitle && timeMode === 'cycle') {
      // Gentle scenic sun drift on title screen without advancing onboarding timer
      this.cyclePhase = (this.cyclePhase + (dt * 0.35) / CYCLE_SECONDS) % 1.0;
    }

    // 1. Resolve Target Day/Twilight/Night Phase & Sun Altitude
    let targetSunAltitudeSin = 0.78;
    let targetSunAzimuth = 0.58;
    let targetNight = 0.0;
    let targetTwilight = 0.0;

    if (timeMode === 'day') {
      targetSunAltitudeSin = 0.78;
      targetSunAzimuth = 0.58;
      targetNight = 0.0;
      targetTwilight = 0.0;
    } else if (timeMode === 'night') {
      targetSunAltitudeSin = -0.45;
      targetSunAzimuth = 2.6;
      targetNight = 1.0;
      targetTwilight = 0.0;
    } else {
      const orbitalAngle = (this.cyclePhase - 0.03) * Math.PI * 2;
      targetSunAltitudeSin = clamp(Math.sin(orbitalAngle) + 0.18, -0.85, 0.96);
      targetSunAzimuth = 0.35 + this.cyclePhase * Math.PI * 1.65;
      targetNight = smoothstep(0.12, -0.18, targetSunAltitudeSin);
      targetTwilight =
        smoothstep(0.34, 0.05, Math.abs(targetSunAltitudeSin - 0.02)) * (1.0 - targetNight * 0.65);
    }

    const blendRate = timeMode === 'cycle' ? 1.6 : 1.15;
    // Paused scenes paint only on demand. Settle an explicit preference change
    // in that one paint, while preserving the exact in-flight blend on ordinary
    // pause entry, resize and other settings changes. Active play stays smooth.
    if (isPaused) {
      if (timeModeChanged) {
        this.nightFactor = targetNight;
        this._sunAltitudeSin = targetSunAltitudeSin;
        this._sunAzimuth = targetSunAzimuth;
        this._twilightAmt = targetTwilight;
      }
    } else {
      this.nightFactor = damp(this.nightFactor, targetNight, blendRate, dt);
      this._sunAltitudeSin = damp(this._sunAltitudeSin, targetSunAltitudeSin, blendRate, dt);
      this._sunAzimuth = damp(this._sunAzimuth, targetSunAzimuth, blendRate, dt);
      // Pass naturally through dusk/dawn twilight whenever the sun sweeps across the horizon
      const horizonTwilight =
        smoothstep(0.36, 0.04, Math.abs(this._sunAltitudeSin - 0.02)) * (1.0 - this.nightFactor * 0.55);
      this._twilightAmt = damp(
        this._twilightAmt,
        Math.max(targetTwilight, horizonTwilight),
        blendRate * 1.6,
        dt
      );
    }

    const sunAltitudeSin = this._sunAltitudeSin;
    const sunAzimuth = this._sunAzimuth;
    const twilightAmt = this._twilightAmt;

    // 2. Resolve Target Weather Weights (Title screen stays clear & welcoming unless user explicitly locked a weather mode)
    const activeWeather =
      weatherMode === 'dynamic'
        ? isTitle
          ? 'clear'
          : this.dynamicTarget
        : weatherMode;
    const targetOvercast = activeWeather === 'overcast' ? 1.0 : activeWeather === 'sandstorm' ? 0.65 : 0.0;
    const targetStorm = activeWeather === 'sandstorm' ? 1.0 : 0.0;
    const wRate = weatherMode === 'dynamic' ? 0.55 : 3.2;

    if (isPaused) {
      if (weatherModeChanged) {
        this.overcastWeight = targetOvercast;
        this.sandstormWeight = targetStorm;
      }
    } else {
      this.overcastWeight = damp(this.overcastWeight, targetOvercast, wRate, dt);
      this.sandstormWeight = damp(this.sandstormWeight, targetStorm, wRate, dt);
    }

    // 3. Compute Sun & Twin-Star Vectors
    const clampedSinY = Math.max(-0.35, sunAltitudeSin);
    const cosY = Math.sqrt(Math.max(0.04, 1.0 - clampedSinY * clampedSinY));
    this._sunDir.set(Math.cos(sunAzimuth) * cosY, clampedSinY, Math.sin(sunAzimuth) * cosY).normalize();
    this._twinDir
      .set(
        Math.cos(sunAzimuth + 0.46) * cosY,
        clamp(clampedSinY - 0.14, -0.4, 0.85),
        Math.sin(sunAzimuth + 0.46) * cosY
      )
      .normalize();

    // 4. Update SkyDome Uniforms (including single-source-of-truth KHARIS_PLANET_DIR)
    const skyU = this.world.skyDome.uniforms;
    skyU.uNightFactor.value = this.nightFactor;
    skyU.uDustVeil.value = this.sandstormWeight;
    skyU.uCloudCoverage.value = clamp(
      0.44 + this.overcastWeight * 0.42 + this.sandstormWeight * 0.2,
      0.2,
      0.95
    );
    skyU.uSunDir.value.copy(this._sunDir);
    skyU.uTwinDir.value.copy(this._twinDir);
    skyU.uPlanetDir.value.copy(this._planetDir);

    // Horizon & Sky Color Grading across Noon -> Sunset -> Overcast -> Sandstorm
    this._tmpColA.copy(this._cDayZenith).lerp(this._cDuskZenith, twilightAmt);
    this._tmpColA.lerp(this._cOvercastMid, this.overcastWeight * 0.38);
    this._tmpColA.lerp(this._cStormZenith, this.sandstormWeight * 0.75);
    skyU.uZenithColor.value.copy(this._tmpColA);

    this._tmpColA.copy(this._cDayMid).lerp(this._cDuskMid, twilightAmt * 0.85);
    this._tmpColA.lerp(this._cOvercastMid, this.overcastWeight * 0.55);
    this._tmpColA.lerp(this._cStormMid, this.sandstormWeight * 0.82);
    skyU.uMidSkyColor.value.copy(this._tmpColA);

    this._tmpColA.copy(this._cDayHorSun).lerp(this._cDuskHorSun, twilightAmt);
    this._tmpColA.lerp(this._cStormHorSun, this.sandstormWeight * 0.7);
    skyU.uHorizonColor.value.copy(this._tmpColA);

    this._tmpColA.copy(this._cDayHorAway).lerp(this._cDuskHorAway, twilightAmt * 0.8);
    this._tmpColA.lerp(this._cStormHorAway, this.sandstormWeight * 0.78);
    skyU.uHorizonAway.value.copy(this._tmpColA);

    this._tmpColA.copy(this._cSunNoon).lerp(this._cSunDusk, twilightAmt);
    skyU.uSunColor.value.copy(this._tmpColA);

    // 5. Direct-Reference PMREM Probe Sync (immune to external cutscene/free-roam overrides!)
    if (this.environments) {
      const wantNightProbe = Boolean(this.nightFactor >= 0.54 && this.environments.desertNight);
      const desiredEnv = wantNightProbe ? this.environments.desertNight : this.environments.desert;
      if (desiredEnv && this.scene.environment !== desiredEnv) {
        this.scene.environment = desiredEnv;
      }
      this._usingNightEnv = wantNightProbe;

      const dayEnvInt = lerp(0.96, 0.62, Math.max(this.overcastWeight * 0.6, this.sandstormWeight * 0.85));
      const nightEnvInt = lerp(0.46, 0.30, this.sandstormWeight);
      // Softly dip IBL intensity across the 0.54 PMREM swap so cubemap switching never pops
      const probeCrossDip = 1.0 - 0.42 * Math.exp(-Math.pow((this.nightFactor - 0.54) / 0.10, 2));
      this.scene.environmentIntensity = lerp(dayEnvInt, nightEnvInt, this.nightFactor) * probeCrossDip;
    }

    // 6. Step-Quantized Directional Sun <-> Azimuth-Matched Planet Moonlight Shadow Handoff
    const weatherDim = 1.0 - this.overcastWeight * 0.42 - this.sandstormWeight * 0.52;
    if (this.nightFactor < 0.56) {
      const shadowSinY = Math.max(0.28, sunAltitudeSin);
      const shadowCosY = Math.sqrt(Math.max(0.05, 1.0 - shadowSinY * shadowSinY));
      const qStep = Math.round(sunAzimuth * 40 + sunAltitudeSin * 40);
      if (qStep !== this._quantizedStep) {
        this._quantizedStep = qStep;
        this._activeShadowOffset.set(
          Math.cos(sunAzimuth) * shadowCosY * 78,
          shadowSinY * 78,
          Math.sin(sunAzimuth) * shadowCosY * 78
        );
        this._syncWorldShadowOffset(this._activeShadowOffset);
      }

      const dayFade = smoothstep(0.55, 0.08, this.nightFactor);
      this.world.sunLight.color.copy(this._cSunNoon).lerp(this._cSunDusk, twilightAmt);
      this.world.sunLight.intensity = 2.60 * dayFade * weatherDim;
    } else {
      // Starry Night Giant Ringed Planet Moonlight Key Light (azimuth matches KHARIS_PLANET_DIR!)
      if (this._quantizedStep !== -999) {
        this._quantizedStep = -999;
        this._activeShadowOffset.copy(this._planetMoonOffset);
        this._syncWorldShadowOffset(this._planetMoonOffset);
      }
      const moonFade = smoothstep(0.57, 0.94, this.nightFactor);
      this.world.sunLight.color.copy(this._cMoonCol);
      this.world.sunLight.intensity = 0.94 * moonFade * (1.0 - this.sandstormWeight * 0.45);
    }

    // Hemisphere Sky/Ground Fill & Distance Fog
    this._tmpColA
      .copy(this._cHemiSkyDay)
      .lerp(this._cHemiSkyStorm, this.sandstormWeight * 0.7)
      .lerp(this._cHemiSkyNight, this.nightFactor);
    this.world.hemiLight.color.copy(this._tmpColA);

    this._tmpColB.copy(this._cHemiGndDay).lerp(this._cHemiGndNight, this.nightFactor);
    this.world.hemiLight.groundColor.copy(this._tmpColB);
    this.world.hemiLight.intensity =
      lerp(0.56 + this.overcastWeight * 0.22, 0.34, this.nightFactor) + twilightAmt * 0.14;

    if (this.scene.fog) {
      this._tmpColA
        .copy(this._cFogDay)
        .lerp(this._cFogDusk, twilightAmt * 0.75)
        .lerp(this._cFogStorm, this.sandstormWeight * 0.85)
        .lerp(this._cFogNight, this.nightFactor * (1.0 - this.sandstormWeight * 0.45));
      this.scene.fog.color.copy(this._tmpColA);
      this.scene.background.copy(this._tmpColA);
      this.scene.fog.density =
        0.0012 + this.overcastWeight * 0.0008 + this.sandstormWeight * 0.0052;
    }

    // 7. Sync Post-Processing Volumetric Scattering, Lens Flare & Planar Brine Reflections
    // Uses true celestial sun/planet vectors (NOT clamped shadow elevation) so sunset rays & water glints align with sky!
    if (this.nightFactor < 0.56) {
      this._volLightDir.set(
        this._sunDir.x,
        Math.max(-0.03, this._sunDir.y),
        this._sunDir.z
      ).normalize();
    } else {
      this._volLightDir.copy(this._planetDir);
    }

    if (this.postProcessing && this.postProcessing.passes) {
      const volU = this.postProcessing.passes.volumetric.uniforms;
      const gradeU = this.postProcessing.passes.grade.uniforms;

      volU.uSunDir.value.copy(this._volLightDir);
      this.postProcessing._sunDirNorm.copy(this._sunDir);

      volU.uSigma.value =
        0.0026 + this.overcastWeight * 0.0016 + this.sandstormWeight * 0.0064;
      volU.uSunColor.value.copy(this.world.sunLight.color);

      const baseFlare =
        this.postProcessing.quality === 'ultra'
          ? 0.26
          : this.postProcessing.quality === 'high'
            ? 0.2
            : 0.08;
      gradeU.uFlareStrength.value =
        baseFlare *
        (1.0 - this.nightFactor) *
        (1.0 - this.overcastWeight * 0.82) *
        (1.0 - this.sandstormWeight * 0.92);

      gradeU.uBloomStrength.value = lerp(0.30, 0.42, this.nightFactor);
      gradeU.uBaseExposure.value = lerp(1.04, 1.16, this.nightFactor);
    }

    if (this.world.planarReflection) {
      this.world.planarReflection.sharedUniforms.uSunDir.value.copy(this._volLightDir);
      this.world.planarReflection.sharedUniforms.uNightFactor.value = this.nightFactor;
      const weatherClarity = clamp(
        1.0 - this.overcastWeight * 0.42 - this.sandstormWeight * 0.68,
        0.2,
        1.0
      );
      this.world.planarReflection.sharedUniforms.uWeatherClarity.value = weatherClarity;
    }

    // Sync live atmospheric weights into GameState for dynamic Solar Furnace smelting multiplier
    if (this.state && typeof this.state.setSolarEnv === 'function' && !isTitle) {
      this.state.setSolarEnv(
        this.nightFactor,
        this.overcastWeight,
        this.sandstormWeight
      );
    }

    // 8. Drive Milo's Automatic Night / Sandstorm Headlamp, GPU Weather Particles & Wind Audio
    if (this.robot && this.robot.setNightHeadlamp) {
      const isMobile =
        this.world && typeof this.world.isCoarseMobileDevice === 'function'
          ? this.world.isCoarseMobileDevice()
          : false;
      const nightLamp = smoothstep(0.32, 0.78, this.nightFactor);
      const coneStrength = isTitle
        ? 0
        : clamp(Math.max(nightLamp, this.sandstormWeight * 0.65), 0, 1);
      // On mobile daytime sandstorms, keep the atmospheric visor beam cone WITHOUT activating the full-scene PBR SpotLight!
      const spotStrength = isTitle
        ? 0
        : isMobile
          ? nightLamp
          : coneStrength;
      this.robot.setNightHeadlamp(spotStrength, coneStrength);
    }

    if (this.weatherParticles) {
      this.weatherParticles.update(elapsed, camera, this.sandstormWeight, this.nightFactor);
    }

    if (this.sound && this.sound.setWeatherIntensity) {
      this.sound.setWeatherIntensity(
        isTitle ? 0 : this.sandstormWeight,
        isTitle ? 0 : this.overcastWeight
      );
    }
  }

  _syncWorldShadowOffset(newOffset) {
    if (!this.world || !this.world._sunOffset) return;
    if (this.world._sunOffset.distanceToSquared(newOffset) > 0.25) {
      this.world._sunOffset.copy(newOffset);
      this.world._lastShadowFocusX = NaN;
      this.world._shadowDirty = true;
    }
  }

  _tickDynamicWeatherSchedule(dt) {
    // Keep Clear skies during first 150s of Level 1 active play so new players orient effortlessly!
    if (this.state.currentLevel === 1 && this.playElapsed < 150) {
      this.dynamicTarget = 'clear';
      return;
    }

    this.weatherTimer -= dt;
    if (this.weatherTimer > 0) return;

    this._weatherRoll = (this._weatherRoll + 1) % 5;
    // Balanced non-fatiguing desert cycle: Clear -> Overcast -> Clear -> Sandstorm -> Clear
    if (this._weatherRoll === 1) {
      this.dynamicTarget = 'overcast';
      this.weatherTimer = 68.0;
    } else if (this._weatherRoll === 3) {
      this.dynamicTarget = 'sandstorm';
      this.weatherTimer = 54.0;
    } else {
      this.dynamicTarget = 'clear';
      this.weatherTimer = 92.0;
    }
  }
}
