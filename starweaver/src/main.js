import * as THREE from 'three';
import { REGIONS, WORLD_FACILITIES } from './data/gameData.js';
import { GameState } from './state/gameState.js';
import { SoundEngine } from './audio/soundEngine.js';
import { createPlanetEnvironments } from './graphics/environment.js';
import { PostProcessingPipeline } from './graphics/postProcessing.js';
import { ParticleSystem } from './graphics/particleSystem.js';
import { WeatherParticles } from './graphics/weatherParticles.js';
import { WorldBuilder } from './scene/worldBuilder.js';
import { SpacecraftBuilder } from './scene/spacecraftBuilder.js';
import { RobotController } from './entities/robotController.js';
import { CameraController } from './scene/cameraController.js';
import { InteractionSystem } from './systems/interactionSystem.js';
import { GuidanceSystem } from './systems/guidanceSystem.js';
import { AtmosphereSystem } from './systems/atmosphereSystem.js';
import { HudController } from './ui/hudController.js';
import { TouchControls } from './ui/touchControls.js';

class LittleBotHomeboundApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.hudRoot = document.getElementById('hud-root');

    this.state = new GameState();
    this.sound = new SoundEngine();

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      this._computeAdaptiveFov(window.innerWidth, window.innerHeight),
      Math.max(0.4, window.innerWidth / Math.max(1, window.innerHeight)),
      0.2,
      450
    );

    this.renderer = this._createRenderer(this.canvas);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    // 1. Procedural IBL Environment Maps
    this.environments = createPlanetEnvironments(this.renderer);
    this.scene.environment = this.environments.desert;
    this.scene.environmentIntensity = 0.96;

    // 2. Scene Builders & Pooled Particle System (with shared GPU 1024px PBR Library)
    this.particles = new ParticleSystem(this.scene);
    this.world = new WorldBuilder(this.scene, this.state, this.renderer);
    this.spacecraft = new SpacecraftBuilder(
      this.scene,
      this.state,
      this.environments,
      this.world.skyDome,
      this.world.pbrLibrary
    );
    this.robot = new RobotController(
      this.scene,
      this.state,
      this.sound,
      this.particles,
      this.world.pbrLibrary
    );
    this.cameraCtrl = new CameraController(this.camera, this.canvas, this.state);

    // 3. Next-Gen Multi-Pass Post-Processing Pipeline (SSAO + Volumetric + Karis Bloom + AgX/ACES)
    this.postProcessing = new PostProcessingPipeline(
      this.renderer,
      this.scene,
      this.camera,
      this.world
    );

    // 4. GPU Stateless Weather Particles & Dynamic Day-Night / 3-State Weather Orchestrator
    this.weatherParticles = new WeatherParticles(this.scene, {
      isMobile: this.world.isCoarseMobileDevice()
    });
    this.atmosphere = new AtmosphereSystem({
      state: this.state,
      scene: this.scene,
      environments: this.environments,
      world: this.world,
      robot: this.robot,
      postProcessing: this.postProcessing,
      sound: this.sound,
      weatherParticles: this.weatherParticles
    });

    this.allColliders = [
      ...this.world.colliders,
      ...this.spacecraft.getColliders()
    ];
    this.cameraCtrl.setOccluders(this.allColliders);

    if (this.world.planarReflection) {
      if (this.robot.guideRig) {
        this.world.planarReflection.registerExcludedObject(this.robot.guideRig);
      }
      if (this.robot.headlampCone) {
        this.world.planarReflection.registerExcludedObject(this.robot.headlampCone);
      }
      this.world.planarReflection.registerExcludedObject(this.weatherParticles.sandMesh);
      this.world.planarReflection.registerExcludedObject(this.weatherParticles.starDustMesh);
    }

    // Automatic GPU driver safety fallback for custom PCSS shadow chunk
    if (this.renderer.debug) {
      this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
        try {
          const fsSrc = gl.getShaderSource(fs) || '';
          if (fsSrc.includes('STARWEAVER_PCSS_SHADOW')) {
            this.world.fallbackDisablePcss(this.renderer);
          }
        } catch {
          // Ignore shader source inspection failure
        }
      };
    }

    this.introCutscene = {
      active: false,
      elapsed: 0,
      duration: 10.6,
      impactTriggered: false,
      wakeTriggered: false
    };

    this.cutscene = {
      active: false,
      elapsed: 0,
      duration: 9.2,
      chimePlayed: false
    };

    this.hud = new HudController(this.hudRoot, this.state, this.sound, {
      onStartMission: () => {
        this.sound.ensureContext();
        this.state.resetState(true);
        this.atmosphere.resetForNewMission();
        this.beginIntroCutscene();
      },
      onContinueMission: () => {
        this.sound.ensureContext();
        this.state.load();
        this.atmosphere.restoreFromState();
        if (this.state.launchedHome) {
          // Align post-game saved continue with full sandbox exploration state
          this.state.equipment.drill = true;
          this.state.equipment.jetpack = true;
          this.state.pylonsAligned.pylon_north = true;
          this.state.pylonsAligned.pylon_south = true;
          this.state.save();
        }
        this.sound.setMuted(this.state.settings.muted);
        this._applyGraphicsQuality(this.state.settings.quality);
        this.cameraCtrl.clearShowcase();
        this.spacecraft.restoreDesertPlacement(this.robot);
        this.robot.clearIntroSleepPose();
        this.atmosphere.update(0.016, this._totalElapsed, this.camera, true);
        this.cameraCtrl.snapToPose(
          this.cameraCtrl.getDesiredFollowPose(this.robot.position)
        );
        this.hud.setHudVisible(true);
        this.hud.renderAll();
        if (this.state.launchedHome) {
          this.hud.showToast(
            this.state.lang === 'zh'
              ? '已进入通关自由探索模式 —— 可继续寻回日志，或前往舷梯重温返航！'
              : 'Post-Game Free Roam Active — explore Kharis-4 or board the ramp to replay liftoff!',
            'celebrate'
          );
        }
      },
      onSkipIntro: () => {
        this.finishIntroCutscene();
      },
      onCloseStation: () => {
        this.cameraCtrl.clearStationFocus();
      },
      onUnstuck: () => {
        this.cameraCtrl.clearShowcase();
        this.robot.teleportToHubSafe();
      },
      onResetGame: () => {
        this.cutscene.active = false;
        this.cameraCtrl.clearShowcase();
        this.state.resetState(true);
        this.atmosphere.resetForNewMission();
        this.beginIntroCutscene();
      },
      onQualityChange: (q) => {
        this._applyGraphicsQuality(q);
      },
      onReplayLaunch: () => {
        this.beginLaunchCutscene();
      },
      onFreeRoam: () => {
        this.cutscene.active = false;
        // Ensure full sandbox access in Post-Game Free Roam!
        this.state.equipment.drill = true;
        this.state.equipment.jetpack = true;
        this.state.pylonsAligned.pylon_north = true;
        this.state.pylonsAligned.pylon_south = true;
        this.state.save();
        this.spacecraft.restoreDesertPlacement(this.robot);
        this.robot.clearIntroSleepPose();
        this.atmosphere.update(0.016, this._totalElapsed, this.camera, false);
        this.hud.setHudVisible(true);
        this.hud.renderAll();
      },
      onDismissHint: () => {
        this.interaction.dismissIdleHint();
      },
      onTriggerSonar: () => {
        if (!this.hud.isBlockingGameplay()) {
          this.interaction.triggerSonarPulse();
        }
      }
    });

    this.guidance = new GuidanceSystem(this.state);

    this.robot.onGateBump = (regionId) => {
      const reg = REGIONS[regionId];
      if (!reg) return;
      const msg = this.state.ui('promptLockedGate', {
        region: this.state.text(reg.name),
        prevLevel: Math.max(1, reg.unlockLevel - 1)
      });
      this.hud.showToast(msg, 'warn');
    };
    this.robot.onChasmBump = () => {
      this.hud.showToast(this.state.ui('promptChasmShear'), 'warn');
    };

    this.interaction = new InteractionSystem(
      this.state,
      this.sound,
      this.robot,
      this.cameraCtrl,
      {
        openStationModal: (mode) => {
          this.sound.playModalOpen();
          const stFacility =
            mode === 'both'
              ? WORLD_FACILITIES.outpost_purifier
              : mode === 'furnace'
                ? WORLD_FACILITIES.furnace
                : WORLD_FACILITIES.fabricator;
          this.cameraCtrl.setStationFocus(stFacility);
          this.hud.openStationModal(mode);
        },
        openInspectModal: (title, body) => {
          this.sound.playModalOpen();
          this.hud.openInspectModal(title, body);
        },
        showToast: (msg, style) => this.hud.showToast(msg, style),
        startLaunchSequence: () => {
          const res = this.state.triggerLaunchAndCompleteGame();
          if (res.ok) {
            this.beginLaunchCutscene();
          }
        }
      },
      this.particles
    );

    this.touchControls = new TouchControls(this.hudRoot, this.state, this.sound, {
      onPrimaryAction: () => {
        if (!this.hud.isBlockingGameplay() && !this.cutscene.active && !this.introCutscene.active) {
          this.interaction.triggerPrimaryInteract();
        }
      },
      onInspectAction: () => {
        if (!this.hud.isBlockingGameplay() && !this.cutscene.active && !this.introCutscene.active) {
          this.interaction.triggerInspect();
        }
      },
      onSonarAction: () => {
        if (!this.hud.isBlockingGameplay() && !this.cutscene.active && !this.introCutscene.active) {
          this.interaction.triggerSonarPulse();
        }
      },
      onTouchModeChange: () => {
        this.hud.syncResponsiveDrawers();
        this.hud.renderAll();
      }
    });

    this.keys = new Set();
    this._resizeRaf = 0;
    this._moveVecScratch = { x: 0, z: 0, fly: false };
    this._zeroMoveVec = { x: 0, z: 0, fly: false };
    this._titleCamPose = {
      position: new THREE.Vector3(),
      lookAt: new THREE.Vector3(0, 2.2, 0.8)
    };
    this._bindInputs();

    const hasSave = this.state.hasSavedGame();
    if (hasSave) {
      this.state.load();
      this.sound.setMuted(this.state.settings.muted);
    }
    this._applyGraphicsQuality(this.state.settings.quality);
    this.hud.openTitleModal(hasSave);

    this._lastTime = performance.now();
    this._lastRenderTick = this._lastTime;
    this._totalElapsed = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _createRenderer(canvas) {
    try {
      return new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
    } catch {
      return new THREE.WebGLRenderer({
        canvas,
        antialias: false
      });
    }
  }

  _applyGraphicsQuality(quality) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.world.applyQuality(quality, this.renderer);
    // Crucial: renderer.setSize MUST be called after renderer.setPixelRatio to update WebGL drawingBuffer,
    // and EffectComposer MUST receive the updated pixelRatio so mobile Retina renders at full sharpness!
    this.renderer.setSize(w, h);
    this.postProcessing.setQuality(quality);
    this.postProcessing.resize(w, h, this.renderer.getPixelRatio());
    this.particles.setEnabled(quality !== 'low');
    if (this.weatherParticles) {
      this.weatherParticles.setEnabled(quality !== 'low');
    }
  }

  beginIntroCutscene() {
    this.keys.clear();
    if (this.touchControls) this.touchControls.setGameplayVisible(false);
    this.cameraCtrl.clearPointers();
    this.cameraCtrl.clearShowcase();
    this.cutscene.active = false;
    this.introCutscene.active = true;
    this.introCutscene.elapsed = 0;
    this.introCutscene.impactTriggered = false;
    this.introCutscene.wakeTriggered = false;

    this.cameraCtrl.clearStationFocus();
    this.hud.closeModal();
    this.hud.setHudVisible(false);
    this.hud.setIntroOverlay(true, 0, this.state.ui('introSub1'));
    this.sound.playIntroDescentWhoosh();
  }

  finishIntroCutscene() {
    if (!this.introCutscene.active) return;
    this.keys.clear();
    this.introCutscene.active = false;
    this.hud.setIntroOverlay(false);

    this.spacecraft.restoreDesertPlacement(this.robot);
    this.robot.clearIntroSleepPose();
    this.atmosphere.update(0.016, this._totalElapsed, this.camera, false);
    this.cameraCtrl.yaw = 0.44;
    this.cameraCtrl.pitch = 0.27;
    this.cameraCtrl.distance = 11.2;
    this.cameraCtrl.snapToPose(
      this.cameraCtrl.getDesiredFollowPose(this.robot.position)
    );

    this.state.markProgress();
    this.interaction.idleAccumSeconds = 0;
    this.hud.setHudVisible(true);
    this.hud.renderAll();
    this.hud.showToast(this.state.ui('miloBootToast'), 'celebrate');
    this.sound.playRobotChirp('happy');
  }

  beginLaunchCutscene() {
    this.keys.clear();
    if (this.touchControls) this.touchControls.setGameplayVisible(false);
    this.cameraCtrl.clearPointers();
    this.cameraCtrl.clearShowcase();
    this.introCutscene.active = false;
    this.hud.setIntroOverlay(false);
    this.cameraCtrl.clearStationFocus();

    this.cutscene.active = true;
    this.cutscene.elapsed = 0;
    this.cutscene.chimePlayed = false;
    this.hud.closeModal();
    this.hud.setHudVisible(false);
    this.sound.playLaunchSequence();
  }

  _computeAdaptiveFov(w, h) {
    const aspect = w / Math.max(1, h);
    // Widen vertical FOV automatically on narrow/square/tablet screens so horizontal field of view is never cropped;
    // slightly tighten on 21:9+ ultrawide monitors to prevent edge fisheye stretching!
    if (aspect < 0.85) return 66;
    if (aspect < 1.15) return 58;
    if (aspect < 1.45) return 53;
    if (aspect > 2.25) return 46;
    return 50;
  }

  _bindInputs() {
    // Coalesce rapid mobile orientation/address-bar resize bursts into single RAF pass!
    window.addEventListener('resize', () => {
      if (this._resizeRaf) return;
      this._resizeRaf = requestAnimationFrame(() => {
        this._resizeRaf = 0;
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        this.camera.aspect = w / h;
        this.camera.fov = this._computeAdaptiveFov(w, h);
        this.camera.updateProjectionMatrix();
        this.world.syncPixelRatio(this.state.settings.quality, this.renderer);
        this.renderer.setSize(w, h);
        this.postProcessing.resize(w, h, this.renderer.getPixelRatio());
      });
    });

    // Unlock Web Audio on first touch/pointer gesture (required on iOS Safari & Android Chrome!)
    window.addEventListener(
      'pointerdown',
      () => {
        this.sound.ensureContext();
      },
      { passive: true }
    );

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.sound.handleVisibilityChange(document.hidden);
        if (document.hidden) {
          this.keys.clear();
          if (this.touchControls) this.touchControls.resetInputState();
          if (this.hud.activeModal !== 'title') {
            this.state.save(true);
          }
        } else {
          this._lastTime = performance.now();
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      this.sound.ensureContext();
      const code = e.code;
      this.keys.add(code);

      if (this.introCutscene.active) {
        if (code === 'Space' || code === 'Escape' || code === 'Enter') {
          e.preventDefault();
          this.keys.delete(code);
          this.finishIntroCutscene();
        }
        return;
      }

      if (this.cutscene.active) return;

      if (code === 'Escape' || code === 'KeyP') {
        if (this.hud.activeModal === 'title' || this.hud.activeModal === 'ending') return;
        if (this.hud.activeModal) {
          this.hud.closeModal();
        } else {
          this.sound.playModalOpen();
          this.hud.openPauseModal();
        }
        return;
      }

      if (code === 'KeyG') {
        this.sound.playUiClick();
        this.state.setGuideArrow(this.state.settings.guideArrow === false);
        return;
      }

      if (code === 'KeyC') {
        if (this.hud.activeModal === 'station') {
          this.hud.closeModal();
        } else if (!this.hud.isBlockingGameplay()) {
          this.sound.playModalOpen();
          this.cameraCtrl.clearStationFocus();
          this.hud.openRecipeGuide();
        }
        return;
      }

      if (this.hud.isBlockingGameplay()) return;

      if (code === 'Space') {
        // Prevent focused HUD buttons from firing when player holds Space for Jetpack!
        e.preventDefault();
        return;
      }

      if (code === 'KeyV') {
        e.preventDefault();
        this.interaction.triggerSonarPulse();
      } else if (code === 'KeyE') {
        e.preventDefault();
        this.interaction.triggerPrimaryInteract();
      } else if (code === 'KeyF') {
        e.preventDefault();
        this.interaction.triggerInspect();
      } else if (code === 'KeyU') {
        this.robot.teleportToHubSafe();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  _readMoveVector() {
    let x = 0;
    let z = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;

    if (this.touchControls) {
      x += this.touchControls.moveVec.x;
      z += this.touchControls.moveVec.z;
    }
    const mag = Math.hypot(x, z);
    if (mag > 1) {
      x /= mag;
      z /= mag;
    }

    this._moveVecScratch.x = x;
    this._moveVecScratch.z = z;
    this._moveVecScratch.fly =
      this.keys.has('Space') || Boolean(this.touchControls && this.touchControls.flyHeld);
    return this._moveVecScratch;
  }

  _loop(now) {
    requestAnimationFrame(this._loop);

    // Intelligent ProMotion / High-Refresh Thermal Frame Pacer:
    // Caps 120Hz/144Hz screens cleanly to 60 FPS during active play (~15.2ms threshold avoids 60Hz VSync beat skipping),
    // and relaxes low-quality mobile / title / paused modals to ~45-30 FPS to slash SoC heat by >50%!
    const isMobile = this.world.isCoarseMobileDevice();
    const isIdleModal =
      this.hud.activeModal === 'pause' ||
      this.hud.activeModal === 'level_complete';
    const isTitle = this.hud.activeModal === 'title';

    let minFrameMs = 15.2; // 60 FPS cap on 120Hz/144Hz devices (never drops frames on native 60Hz!)
    if (isIdleModal) {
      minFrameMs = 31.5; // ~30 FPS when paused
    } else if (isMobile && (this.state.settings.quality === 'low' || isTitle)) {
      minFrameMs = 21.0; // ~45 FPS thermal-saver on mobile Low Quality or Title orbit
    }

    if (now - this._lastRenderTick < minFrameMs) {
      return;
    }
    this._lastRenderTick = now;
    this.stepFrame(now);
  }

  stepFrame(now = performance.now()) {
    const dt = Math.min(0.05, Math.max(0.001, (now - this._lastTime) / 1000));
    this._lastTime = now;
    this._totalElapsed += dt;

    // 1. Scenic Title Screen Gentle Camera Orbit
    if (this.hud.activeModal === 'title') {
      if (this.touchControls) this.touchControls.setGameplayVisible(false);
      const orbitAngle = this._totalElapsed * 0.12 + 0.55;
      this._titleCamPose.position.set(
        Math.sin(orbitAngle) * 16.5,
        5.6,
        Math.cos(orbitAngle) * 16.5 + 1.5
      );
      this.world.update(dt, this._totalElapsed, null, null);
      this.spacecraft.update(dt, this._totalElapsed, false);
      this.particles.update(dt, false);
      this.cameraCtrl.update(dt, this.robot.position, this._titleCamPose);
      this.atmosphere.update(dt, this._totalElapsed, this.camera, false, { isTitle: true });
      this.world.updateShadowFollow(dt, null, this.renderer, false);
      if (this.world.planarReflection) {
        this.world.planarReflection.update(this._totalElapsed, this.camera, false);
      }
      this.postProcessing.render(dt, this._totalElapsed);
      return;
    }

    // 2. 3-Act Opening Crash & Reboot Cutscene
    if (this.introCutscene.active) {
      this.introCutscene.elapsed += dt;
      const t = Math.min(
        1,
        this.introCutscene.elapsed / this.introCutscene.duration
      );

      if (t >= 0.24 && !this.introCutscene.impactTriggered) {
        this.introCutscene.impactTriggered = true;
        this.particles.emitCrashImpact(0, 0);
      }
      if (t >= 0.42 && !this.introCutscene.wakeTriggered) {
        this.introCutscene.wakeTriggered = true;
        this.sound.playIntroWakeup();
        this.particles.emitWheelDust(4.8, this.robot.position.y, 5.8, 0);
      }

      const actIdx = t < 0.3 ? 0 : t < 0.66 ? 1 : 2;
      const subKey = actIdx === 0 ? 'introSub1' : actIdx === 1 ? 'introSub2' : 'introSub3';
      this.hud.setIntroOverlay(true, actIdx, this.state.ui(subKey));

      const finalFollowPose = this.cameraCtrl.getDesiredFollowPose(
        this.robot.position
      );
      const camOverride = this.spacecraft.applyIntroCutsceneFrame(
        t,
        this._totalElapsed,
        this.robot,
        finalFollowPose
      );

      this.atmosphere.applyCutsceneOverride('intro', this.camera);
      this.world.update(dt, this._totalElapsed, null, null);
      this.world.updateShadowFollow(dt, null, this.renderer, true);
      this.spacecraft.update(dt, this._totalElapsed, 'intro');
      this.particles.update(dt, false);
      this.sound.updateSpatial(dt, this.robot.position, false, true);
      this.cameraCtrl.update(dt, this.robot.position, camOverride);
      if (this.world.planarReflection) {
        this.world.planarReflection.update(this._totalElapsed, this.camera, true);
      }
      this.postProcessing.render(dt, this._totalElapsed);

      if (t >= 1) {
        this.finishIntroCutscene();
      }
      return;
    }

    // 3. Final Homecoming Launch Cutscene & Ending Meadow View
    if (this.cutscene.active || this.hud.activeModal === 'ending') {
      let t = 1;
      if (this.cutscene.active) {
        this.cutscene.elapsed += dt;
        t = Math.min(1, this.cutscene.elapsed / this.cutscene.duration);
        if (t >= 0.6 && !this.cutscene.chimePlayed) {
          this.cutscene.chimePlayed = true;
          this.sound.playHomecomingChime();
        }
      }

      this.world.skyDome.uniforms.uTime.value = this._totalElapsed;
      this.spacecraft.update(dt, this._totalElapsed, 'launch');
      this.robot.update(dt, this._totalElapsed, this._zeroMoveVec, 0, [], true, null);
      const camOverride = this.spacecraft.applyCutsceneFrame(
        t,
        this._totalElapsed,
        this.robot
      );
      this.atmosphere.applyCutsceneOverride('launch', this.camera, t);
      this.world.updateShadowFollow(
        dt,
        this.spacecraft.group.position,
        this.renderer,
        this.cutscene.active
      );
      this.sound.updateSpatial(dt, this.robot.position, false, true);
      this.cameraCtrl.update(dt, this.robot.position, camOverride);
      if (this.world.planarReflection) {
        this.world.planarReflection.update(this._totalElapsed, this.camera, this.cutscene.active);
      }
      this.postProcessing.render(dt, this._totalElapsed);

      if (this.cutscene.active && t >= 1) {
        this.cutscene.active = false;
        this.hud.openEndingModal();
      }
      return;
    }

    // 4. Standard Active Gameplay Loop (including live 3D station workbench view!)
    const blocked = this.hud.isBlockingGameplay();
    if (this.touchControls) {
      this.touchControls.setGameplayVisible(!blocked);
    }
    const isHardPaused =
      this.hud.activeModal === 'pause' ||
      this.hud.activeModal === 'level_complete';

    if (!blocked) {
      if (this.keys.has('KeyQ')) this.cameraCtrl.rotateByKey(-1, dt);
      if (this.keys.has('KeyR')) this.cameraCtrl.rotateByKey(1, dt);
    }

    if (!isHardPaused) {
      this.state.update(dt);
    }

    const activeWaypoint = blocked
      ? null
      : this.guidance.resolveActiveWaypoint(this.robot.position);

    const moveVec = this._readMoveVector();
    this.robot.update(
      dt,
      this._totalElapsed,
      moveVec,
      this.cameraCtrl.yaw,
      this.allColliders,
      blocked,
      activeWaypoint
    );

    const nearest = blocked ? null : this.interaction.scanNearest();
    const idleHint = blocked ? null : this.interaction.getIdleHintIfDue(dt);

    this.world.update(
      dt,
      this._totalElapsed,
      nearest,
      activeWaypoint,
      this.robot.position
    );
    this.cameraCtrl.update(dt, this.robot.position, null);
    this.atmosphere.update(dt, this._totalElapsed, this.camera, isHardPaused);
    this.world.updateShadowFollow(dt, this.robot.position, this.renderer, false);
    this.spacecraft.update(dt, this._totalElapsed, false);
    if (!isHardPaused) {
      this.particles.update(dt, this.state.craftingQueue.length > 0);
    }
    this.sound.updateSpatial(
      dt,
      this.robot.position,
      this.state.craftingQueue.length > 0 && !isHardPaused,
      false
    );
    this.hud.updateFrame(dt, nearest, idleHint, activeWaypoint, this.robot.jetFuel);
    if (this.touchControls && !blocked) {
      this.touchControls.updateContext(nearest);
    }

    if (this.world.planarReflection) {
      this.world.planarReflection.update(this._totalElapsed, this.camera, false);
    }
    this.postProcessing.render(dt, this._totalElapsed);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__LBH_APP__ = new LittleBotHomeboundApp();
});
