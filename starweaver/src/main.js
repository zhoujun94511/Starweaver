import * as THREE from 'three';
import {
  EQUIPMENT_DEFS,
  LEVELS,
  REGIONS,
  WORLD_FACILITIES,
  WORLD_MECHANISMS
} from './data/gameData.js';
import { HOMEWORLD_SCENIC_VIEWS } from './data/homeworldActivities.js';
import { GameState } from './state/gameState.js';
import { SoundEngine } from './audio/soundEngine.js';
import { createPlanetEnvironments } from './graphics/environment.js';
import { PostProcessingPipeline } from './graphics/postProcessing.js';
import { ParticleSystem } from './graphics/particleSystem.js';
import { WeatherParticles } from './graphics/weatherParticles.js';
import { WorldBuilder } from './scene/worldBuilder.js';
import { SpacecraftBuilder } from './scene/spacecraftBuilder.js';
import { WorldManager, tagWorldEntries } from './scene/worldLifecycle.js';
import { RobotController } from './entities/robotController.js';
import { CameraController } from './scene/cameraController.js';
import { InteractionSystem } from './systems/interactionSystem.js';
import { HomeworldActivitySystem } from './systems/homeworldActivitySystem.js';
import { GuidanceSystem } from './systems/guidanceSystem.js';
import { AtmosphereSystem } from './systems/atmosphereSystem.js';
import { HudController } from './ui/hudController.js';
import { TouchControls } from './ui/touchControls.js';
import { RenderActivity } from './utils/renderActivity.js';
import {
  applyDebugBootTarget,
  createDebugActions,
  parseDebugBootParams
} from './debug/debugActions.js';
import { DebugPanel } from './debug/debugPanel.js';

function setBootSplashProgress(pct, statusText) {
  const fill = document.getElementById('boot-splash-fill');
  if (fill) fill.style.width = `${pct}%`;
  const status = document.getElementById('boot-splash-status');
  if (status && statusText) status.textContent = statusText;
}

function dismissBootSplash() {
  const splash = document.getElementById('boot-splash');
  if (!splash) return;
  splash.classList.add('fade-out');
  setTimeout(() => {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  }, 460);
}

class LittleBotHomeboundApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.hudRoot = document.getElementById('hud-root');
    setBootSplashProgress(28, 'Booting Starweaver systems…');

    this.state = new GameState();
    this._debugBoot = parseDebugBootParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
    if (this._debugBoot.nosave) {
      this.state.storageAvailable = false;
    }
    this._debugTimeScale = 1;
    this._debugFps = 60;
    this._debugActions = null;
    this._debugPanel = null;
    this._f9LastTapAt = 0;
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
    setBootSplashProgress(48, 'Sculpting Kharis desert & ruins…');
    this.particles = new ParticleSystem(this.scene);
    this.world = new WorldBuilder(this.scene, this.state, this.renderer);
    setBootSplashProgress(68, 'Assembling Starweaver hull…');
    this.spacecraft = new SpacecraftBuilder(
      this.scene,
      this.state,
      this.environments,
      this.world.skyDome,
      this.world.pbrLibrary,
      { deferHomeworld: true }
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

    this._desertColliders = tagWorldEntries([
      ...this.world.colliders,
      ...this.spacecraft.getColliders()
    ], 'desert');
    this.allColliders = [...this._desertColliders];
    this.cameraCtrl.setOccluders(this.allColliders);

    const setDesertGroupsVisible = (visible) => {
      if (!this.world?.groups) return;
      for (const g of Object.values(this.world.groups)) {
        if (g) g.visible = visible;
      }
    };

    this.worldManager = new WorldManager()
      .register('desert', {
        mount: () => {
          setDesertGroupsVisible(true);
          if (this.postProcessing) this.postProcessing.planeBaseY = 0;
          this.allColliders.length = 0;
          this.allColliders.push(...this._desertColliders);
          this.cameraCtrl.setOccluders(this.allColliders);
        },
        unmount: () => {
          setDesertGroupsVisible(false);
        }
      })
      .register('homeworld', {
        mount: () => {
          const built = this.spacecraft.ensureHomeworldScene();
          if (this.postProcessing && this.spacecraft.homeworldGroup && this.state.activeWorldPlane === 'homeworld') {
            this.postProcessing.planeBaseY = this.spacecraft.homeworldGroup.position.y;
          }
          if (built) {
            const hwCols = tagWorldEntries(this.spacecraft.getHomeworldDynamicColliders(), 'homeworld');
            const hwOccs = tagWorldEntries(this.spacecraft.homeworldCameraOccluders, 'homeworld');
            this.allColliders.length = 0;
            this.allColliders.push(...this._desertColliders, ...hwCols);
            this.cameraCtrl.setOccluders([...this.allColliders, ...hwOccs]);
            this._registerHomeworldPlanarReflection();
          }
        },
        unmount: () => {
          const hwVisuals = this.spacecraft.homeworldActivityVisuals;
          if (hwVisuals && this.world.planarReflection) {
            this.world.planarReflection.unregisterWaterSurface(hwVisuals.pondMesh);
            if (Array.isArray(hwVisuals.waterExcludes)) {
              for (const wm of hwVisuals.waterExcludes) {
                this.world.planarReflection.unregisterExcludedObject(wm);
              }
            } else if (hwVisuals.riverMesh) {
              this.world.planarReflection.unregisterExcludedObject(hwVisuals.riverMesh);
            }
          }
          if (this.spacecraft.disposeHomeworldScene(this.renderer)) {
            this.allColliders.length = 0;
            this.allColliders.push(...this._desertColliders);
            this.cameraCtrl.setOccluders(this.allColliders);
          }
        }
      });
    this.worldManager.mount('desert');

    if (this.world.planarReflection) {
      if (this.robot.guideRig) {
        this.world.planarReflection.registerExcludedObject(this.robot.guideRig);
      }
      if (this.robot.headlampCone) {
        this.world.planarReflection.registerExcludedObject(this.robot.headlampCone);
      }
      this.world.planarReflection.registerExcludedObject(this.weatherParticles.sandMesh);
      this.world.planarReflection.registerExcludedObject(this.weatherParticles.starDustMesh);
      this._registerHomeworldPlanarReflection();
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
      flightDuration: 22.4,
      duration: 31.2,
      chimePlayed: false,
      liftoffBurstPlayed: false,
      touchdownBurstPlayed: false
    };
    this.inHomeworldRoam = false;
    this._desertPausedAt = null;

    this.hud = new HudController(this.hudRoot, this.state, this.sound, {
      onStartMission: () => {
        this.sound.ensureContext();
        this.inHomeworldRoam = false;
        this._desertPausedAt = null;
        this.hud.setHomeworldRoamVisible(false);
        this.homeworldActivities?.resetTransientState();
        if (this.world?.desertMoteCooldowns) this.world.desertMoteCooldowns = {};
        this.robot.aerialBoostTimer = 0;
        this.robot.inUpdraft = false;
        this.state.resetState(true);
        this.worldManager.switchTo('desert', {}, { unloadOthers: true });
        this.atmosphere.resetForNewMission();
        this.beginIntroCutscene();
      },
      onContinueMission: () => {
        this.sound.ensureContext();
        this.inHomeworldRoam = false;
    this._desertPausedAt = null;
        this.hud.setHomeworldRoamVisible(false);
        this.state.load();
        this.atmosphere.restoreFromState();
        const resumeOnHomeworld = Boolean(
          this.state.launchedHome &&
            (this.state.activeWorldPlane === 'homeworld' ||
              (this.state.activeWorldPlane !== 'desert' && this.state.homeworldSurvey.accepted))
        );
        if (this.state.launchedHome) {
          this.state.syncPostGameWorldTransition(resumeOnHomeworld ? 'homeworld' : 'desert');
        }
        this.sound.setMuted(this.state.settings.muted);
        this._applyGraphicsQuality(this.state.settings.quality);
        this.cameraCtrl.clearShowcase();
        this.robot.clearIntroSleepPose();
        if (resumeOnHomeworld) {
          this._enterHomeworldRoam();
          this.hud.renderAll();
          return;
        }
        this.spacecraft.restoreDesertPlacement(this.robot);
        this.interaction?.resetScanCache();
        this.guidance?.invalidateCache();
        this.atmosphere.update(0.016, this._totalElapsed, this.camera, true);
        this.cameraCtrl.snapToPose(
          this.cameraCtrl.getDesiredFollowPose(this.robot.position)
        );
        this.hud.noteWorldFocus('desert', this.robot.position.x, this.robot.position.z);
        this.hud.setHudVisible(true);
        this.hud.renderAll();
        const initWp = this.guidance?.resolveActiveWaypoint(this.robot.position) || null;
        const initNear = this.interaction?.scanNearest(0) || null;
        this.hud.updateFrame(0, initNear, null, initWp, this.robot.jetFuel);
        if (this.state.launchedHome) {
          this.hud.showToast(
            this.state.lang === 'zh'
              ? '已进入通关自由探索模式 —— 可继续寻回日志，或前往舷梯返回翡翠母星！'
              : 'Post-Game Free Roam Active — explore Kharis-4 or board the ramp to return to Homeworld!',
            'celebrate'
          );
        }
      },
      onSkipIntro: () => {
        this.finishIntroCutscene();
      },
      onSkipLaunch: () => {
        this.finishLaunchCutscene();
      },
      onCloseStation: () => {
        this.cameraCtrl.clearStationFocus();
      },
      onUnstuck: () => {
        this.keys.clear();
        this.touchControls?.resetInputState();
        this.cameraCtrl.clearPointers();
        this.cameraCtrl.clearShowcase();
        if (this.inHomeworldRoam) {
          this.robot.teleportToHomeworldMeadow();
        } else {
          this.robot.teleportToHubSafe();
        }
        this.cameraCtrl.snapToPose(this.cameraCtrl.getDesiredFollowPose(this.robot.position));
        this._sceneRevision++;
      },
      onResetGame: () => {
        this.cutscene.active = false;
        this.inHomeworldRoam = false;
        this._desertPausedAt = null;
        this.hud.setHomeworldRoamVisible(false);
        this.homeworldActivities?.resetTransientState();
        if (this.world?.desertMoteCooldowns) this.world.desertMoteCooldowns = {};
        this.robot.aerialBoostTimer = 0;
        this.robot.inUpdraft = false;
        this.cameraCtrl.clearShowcase();
        this.state.resetState(true);
        this.worldManager.switchTo('desert', {}, { unloadOthers: true });
        this.atmosphere.resetForNewMission();
        this.beginIntroCutscene();
      },
      onQualityChange: (q) => {
        this._applyGraphicsQuality(q);
      },
      onWalkHomeworld: () => {
        this._enterHomeworldRoam();
      },
      onHomeworldJournal: () => {
        this.hud.openHomeworldJournal(this.homeworldActivities);
      },
      onHomeworldView: () => {
        if (!this.state.homeworldSurvey.completed) return;
        this.hud.closeModal();
        this._hwScenicIdx = ((this._hwScenicIdx ?? -1) + 1) % HOMEWORLD_SCENIC_VIEWS.length;
        const v = HOMEWORLD_SCENIC_VIEWS[this._hwScenicIdx];
        this.cameraCtrl.triggerShowcase(
          new THREE.Vector3(v.look[0], v.look[1], v.look[2]),
          new THREE.Vector3(v.offset[0], v.offset[1], v.offset[2]),
          9.5
        );
        this.hud.showToast(this.state.text(v.title), 'celebrate');
      },
      onReplayLaunch: () => {
        this.inHomeworldRoam = false;
        this.hud.setHomeworldRoamVisible(false);
        this.beginLaunchCutscene();
      },
      onFreeRoam: () => {
        this.cutscene.active = false;
        this.introCutscene.active = false;
        this.inHomeworldRoam = false;
        this.keys.clear();
        this.touchControls?.resetInputState();
        this.cameraCtrl.clearPointers();
        this.cameraCtrl.clearShowcase();
        this.cameraCtrl.clearStationFocus();
        this.hud.closeModal();
        this.homeworldActivities?.resetTransientState();
        this.robot.aerialBoostTimer = 0;
        this.robot.inUpdraft = false;
        // Synchronize full post-game sandbox state & activeWorldPlane ('desert') first!
        this.state.syncPostGameWorldTransition('desert');
        this.worldManager.switchTo('desert', {}, { unloadOthers: true });
        this.spacecraft.restoreDesertPlacement(this.robot);
        this.robot.clearIntroSleepPose();
        this.interaction?.resetScanCache();
        this.guidance?.invalidateCache();
        // Planet changes are discontinuous world-space transfers. Snap both
        // camera state and rendered camera in the same event as the robot;
        // damping from Y=420 reveals the square desert terrain from orbit.
        this.cameraCtrl.yaw = 0.44;
        this.cameraCtrl.pitch = 0.27;
        this.cameraCtrl.distance = 11.2;
        this.cameraCtrl.snapToPose(this.cameraCtrl.getDesiredFollowPose(this.robot.position));
        this.atmosphere.update(0.016, this._totalElapsed, this.camera, false);
        this.world.updateShadowFollow(0, this.robot.position, this.renderer, true);
        // Crucial: update HUD world focus ('desert' + crash_site region) BEFORE
        // toggling Homeworld Roam off and calling renderAll() so _sceneLevelDef()
        // and regional cargo/step indicators immediately reflect Kharis-4!
        this.hud.noteWorldFocus('desert', this.robot.position.x, this.robot.position.z);
        this.hud.setHomeworldRoamVisible(false);
        this.hud.setHudVisible(true);
        if (this._desertPausedAt !== null) {
          const awayDt = Math.max(0, (this._totalElapsed || 0) - this._desertPausedAt);
          this._desertPausedAt = null;
          this.state.fastForward(awayDt);
        }
        this.hud.renderAll();
        const desertWp = this.guidance?.resolveActiveWaypoint(this.robot.position) || null;
        const desertNear = this.interaction?.scanNearest(0) || null;
        this.world.update(0.016, this._totalElapsed, desertNear, desertWp, this.robot.position);
        this.hud.updateFrame(0, desertNear, null, desertWp, this.robot.jetFuel);
        this._sceneRevision++;
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
        openStationModal: (mode, facility = null) => {
          this.sound.playModalOpen();
          const stFacility =
            facility ||
            WORLD_FACILITIES.stations.find((s) => s.stationKind === mode) ||
            WORLD_FACILITIES.fabricator;
          this.cameraCtrl.setStationFocus(stFacility);
          this.hud.openStationModal(mode, stFacility);
        },
        openInspectModal: (title, body) => {
          this.sound.playModalOpen();
          this.hud.openInspectModal(title, body);
        },
        showToast: (msg, style) => this.hud.showToast(msg, style),
        startLaunchSequence: () => {
          const wasAlreadyLaunched = Boolean(this.state.launchedHome);
          const res = this.state.triggerLaunchAndCompleteGame();
          if (res.ok) {
            if (wasAlreadyLaunched) {
              this._enterHomeworldRoam();
              this.hud.showToast(
                this.state.lang === 'zh'
                  ? '已搭乘星织号重返翡翠母星家园！'
                  : 'Returned to Homeworld Emerald Valley aboard Starweaver!',
                'celebrate'
              );
            } else {
              this.beginLaunchCutscene();
            }
          }
        }
      },
      this.particles
    );

    this.homeworldActivities = new HomeworldActivitySystem(this.state, this.robot, this.sound, {
      showToast: (text, style) => this.hud.showToast(text, style),
      openInspect: (title, body) => this.hud.openInspectModal(title, body),
      openJournal: () => this.hud.openHomeworldJournal(this.homeworldActivities),
      openCalibration: action => this.hud.openHomeworldCalibration(action),
      onCelebrate: (x, z, tag) => {
        if (this.particles) {
          this.particles.emitCelebrationSparkles(x, z, 420.2);
        }
        if (tag === 'completed') {
          this.sound.playHomecomingChime();
        }
      }
    });

    this.touchControls = new TouchControls(this.hudRoot, this.state, this.sound, {
      onPrimaryAction: () => {
        if (this.inHomeworldRoam && !this.hud.isBlockingGameplay()) {
          this.homeworldActivities.triggerPrimary();
          return;
        }
        if (
          !this.inHomeworldRoam &&
          !this.hud.isBlockingGameplay() &&
          !this.cutscene.active &&
          !this.introCutscene.active
        ) {
          this.interaction.triggerPrimaryInteract();
        }
      },
      onInspectAction: () => {
        if (this.inHomeworldRoam && !this.hud.isBlockingGameplay()) {
          this.homeworldActivities.triggerInspect();
          return;
        }
        if (
          !this.inHomeworldRoam &&
          !this.hud.isBlockingGameplay() &&
          !this.cutscene.active &&
          !this.introCutscene.active
        ) {
          this.interaction.triggerInspect();
        }
      },
      onSonarAction: () => {
        if (
          !this.inHomeworldRoam &&
          !this.hud.isBlockingGameplay() &&
          !this.cutscene.active &&
          !this.introCutscene.active
        ) {
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
    if (this._debugBoot.active) {
      this.ensureDebugPanel(false);
      applyDebugBootTarget(this, this._debugBoot, this._debugActions);
    }

    this._lastTime = performance.now();
    this._lastRenderTick = this._lastTime;
    this._lastRafNow = this._lastTime;
    this._smoothedRafMs = 16.67;
    this._rafPhaseSkip = false;
    this._renderActivity = new RenderActivity();
    this._sceneRevision = 0;
    this._totalElapsed = 0;
    this._loop = this._loop.bind(this);
    setBootSplashProgress(100, 'Welcome aboard!');
    requestAnimationFrame((t) => {
      this._loop(t);
      dismissBootSplash();
    });
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
    this._sceneRevision = (this._sceneRevision || 0) + 1;
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

    this.state.setWorldPlane('desert', false);
    this.spacecraft.restoreDesertPlacement(this.robot);
    this.robot.clearIntroSleepPose();
    this.interaction?.resetScanCache();
    this.guidance?.invalidateCache();
    this.atmosphere.update(0.016, this._totalElapsed, this.camera, false);
    this.cameraCtrl.yaw = 0.44;
    this.cameraCtrl.pitch = 0.27;
    this.cameraCtrl.distance = 11.2;
    this.cameraCtrl.snapToPose(
      this.cameraCtrl.getDesiredFollowPose(this.robot.position)
    );

    this.state.markProgress();
    this.interaction.idleAccumSeconds = 0;
    this.hud.noteWorldFocus('desert', this.robot.position.x, this.robot.position.z);
    this.hud.setHudVisible(true);
    this.hud.renderAll();
    this.hud.showToast(this.state.ui('miloBootToast'), 'celebrate');
    this.sound.playRobotChirp('happy');
  }

  ensureDebugPanel(expand = false) {
    if (!this._debugActions) {
      this._debugActions = createDebugActions(this);
      if (typeof window !== 'undefined') {
        window.__STARWEAVER_DEBUG__ = this._debugActions;
      }
    }
    if (!this._debugPanel) {
      this._debugPanel = new DebugPanel(this.hudRoot, this._debugActions, this.state, {
        showPillWhenCollapsed: this._debugBoot.active
      });
      this._debugPanel.setExpanded(false);
    }
    if (expand) {
      this._debugPanel.setExpanded(true);
    }
    return this._debugPanel;
  }

  _registerHomeworldPlanarReflection() {
    if (!this.world?.planarReflection) return;
    const hwVisuals = this.spacecraft.homeworldActivityVisuals;
    if (hwVisuals && hwVisuals.pondMesh) {
      this.world.planarReflection.registerWaterSurface(
        hwVisuals.pondMesh,
        hwVisuals.waterUniforms,
        26.0
      );
    }
    if (hwVisuals && Array.isArray(hwVisuals.waterExcludes)) {
      for (const wm of hwVisuals.waterExcludes) {
        this.world.planarReflection.registerExcludedObject(wm);
      }
    } else if (hwVisuals && hwVisuals.riverMesh) {
      this.world.planarReflection.registerExcludedObject(hwVisuals.riverMesh);
    }
  }

  _ensureHomeworldReady() {
    this.worldManager.mount('homeworld');
  }

  beginLaunchCutscene() {
    this.worldManager.mount('desert');
    this._ensureHomeworldReady();
    this.keys.clear();
    this.inHomeworldRoam = false;
    this.hud.setHomeworldRoamVisible(false);
    if (this.touchControls) this.touchControls.setGameplayVisible(false);
    this.cameraCtrl.clearPointers();
    this.cameraCtrl.clearShowcase();
    this.introCutscene.active = false;
    this.cameraCtrl.clearStationFocus();

    this.cutscene.active = true;
    this.cutscene.elapsed = 0;
    this.cutscene.chimePlayed = false;
    this.cutscene.liftoffBurstPlayed = false;
    this.cutscene.touchdownBurstPlayed = false;
    this.spacecraft.prepareBoarding(this.robot);
    this.hud.closeModal();
    this.hud.setHudVisible(false);
    this.hud.setIntroOverlay(true, 0, this.state.ui('launchSub1'), 4, 'launch');
    this.sound.playLaunchSequence(2.5);
  }

  finishLaunchCutscene() {
    if (!this.cutscene.active) return;
    this._ensureHomeworldReady();
    this.keys.clear();
    this.cutscene.active = false;
    this.hud.setIntroOverlay(false);
    this.spacecraft.applyCutsceneFrame(1.0, this._totalElapsed, this.robot);
    this.atmosphere.applyCutsceneOverride('launch', this.camera, 1.0);
    this.hud.openEndingModal();
  }

  _enterHomeworldRoam() {
    if (this._desertPausedAt === null) {
      this._desertPausedAt = this._totalElapsed || 0;
    }
    this.worldManager.switchTo('homeworld', {}, { unloadOthers: true });
    this.cutscene.active = false;
    this.introCutscene.active = false;
    this.inHomeworldRoam = true;
    this.keys.clear();
    this.touchControls?.resetInputState();
    this.cameraCtrl.clearPointers();
    this.cameraCtrl.clearShowcase();
    this.cameraCtrl.clearStationFocus();
    this.hud.closeModal();
    this.hud.setIntroOverlay(false);
    this.state.setWorldPlane('homeworld');
    if (this.postProcessing && this.spacecraft.homeworldGroup) {
      this.postProcessing.planeBaseY = this.spacecraft.homeworldGroup.position.y;
    }
    this.spacecraft.enterHomeworldFreeRoam(this.robot);
    this.interaction?.resetScanCache();
    this.guidance?.invalidateCache();
    this.atmosphere.updateHomeworld(0.016, this._totalElapsed, this.camera, true);
    this.cameraCtrl.yaw = 0.0;
    this.cameraCtrl.pitch = 0.25;
    this.cameraCtrl.distance = 10.5;
    this.cameraCtrl.snapToPose(this.cameraCtrl.getDesiredFollowPose(this.robot.position));
    this.hud.noteWorldFocus('homeworld', this.robot.position.x, this.robot.position.z);
    this.hud.setHudVisible(false);
    this.hud.setHomeworldRoamVisible(true);
    this.hud.renderAll();
    const hwWaypoint = this.homeworldActivities?.nextObjective() || null;
    const hwTarget = this.homeworldActivities?.scanNearest() || null;
    if (hwWaypoint) {
      this.hud.updateHomeworldObjective(hwWaypoint);
    }
    this.hud.updateFrame(0, hwTarget, null, hwWaypoint, this.robot.jetFuel);
    this._sceneRevision++;
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
        this._sceneRevision++;
      });
    });

    // Unlock Web Audio on first touch/pointer gesture (required on iOS Safari & Android Chrome!)
    window.addEventListener(
      'pointerdown',
      () => {
        this.sound.unlockFromGesture();
      },
      { passive: true }
    );

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.sound.handleVisibilityChange(document.hidden);
        if (document.hidden) {
          this.keys.clear();
          if (this.touchControls) this.touchControls.resetInputState();
          if (this.cameraCtrl && this.cameraCtrl.clearPointers) this.cameraCtrl.clearPointers();
          if (this.hud.activeModal !== 'title') {
            this.state.save(true);
          }
        } else {
          const now = performance.now();
          this._sceneRevision++;
          this._lastTime = now;
          this._lastRafNow = now;
          this._lastRenderTick = now;
          this._rafPhaseSkip = false;
        }
      });
    }

    window.addEventListener('keydown', (e) => {
      this.sound.unlockFromGesture();
      const code = e.code;
      if (code === 'F9') {
        e.preventDefault();
        if (this._debugPanel && this._debugPanel.expanded) {
          this._debugPanel.setExpanded(false);
          this._f9LastTapAt = 0;
          return;
        }
        const now = performance.now();
        if (now - this._f9LastTapAt <= 3000) {
          this._f9LastTapAt = 0;
          this.ensureDebugPanel(true);
        } else {
          this._f9LastTapAt = now;
        }
        return;
      }
      this.keys.add(code);

      if (this.introCutscene.active) {
        if (code === 'Space' || code === 'Escape' || code === 'Enter') {
          e.preventDefault();
          this.keys.delete(code);
          this.finishIntroCutscene();
        }
        return;
      }

      if (this.cutscene.active) {
        if (code === 'Space' || code === 'Escape' || code === 'Enter') {
          e.preventDefault();
          this.keys.delete(code);
          this.finishLaunchCutscene();
        }
        return;
      }

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

      if (code === 'KeyC') {
        if (this.inHomeworldRoam) {
          e.preventDefault();
          if (!this.hud.isBlockingGameplay()) this.hud.openHomeworldJournal(this.homeworldActivities);
          return;
        }
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

      if (code === 'KeyG') {
        this.sound.playUiClick();
        this.state.setGuideArrow(this.state.settings.guideArrow === false);
        return;
      }

      if (code === 'Space') {
        // Prevent focused HUD buttons from firing when player holds Space for Jetpack!
        e.preventDefault();
        return;
      }

      if (code === 'KeyU') {
        e.preventDefault();
        this.cameraCtrl.clearShowcase();
        if (this.inHomeworldRoam) {
          this.robot.teleportToHomeworldMeadow();
        } else {
          this.robot.teleportToHubSafe();
        }
        return;
      }

      if (this.inHomeworldRoam) {
        if (code === 'KeyE') {
          e.preventDefault();
          this.homeworldActivities.triggerPrimary();
        } else if (code === 'KeyF') {
          e.preventDefault();
          this.homeworldActivities.triggerInspect();
        }
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

    // Measure native VSync RAF cadence so 60Hz/90Hz screens ALWAYS render 1:1 with zero beat-skipping,
    // while 120Hz/144Hz ProMotion/gaming panels cleanly integer-halve (1:2 = 60/72 FPS) to save battery!
    const rawRafDt = now - this._lastRafNow;
    this._lastRafNow = now;
    if (rawRafDt > 4.0 && rawRafDt < 45.0) {
      this._smoothedRafMs += (rawRafDt - this._smoothedRafMs) * 0.12;
    }

    const isIdleModal =
      this.hud.activeModal === 'pause' ||
      this.hud.activeModal === 'level_complete';
    if (!this._renderActivity.shouldRender(document.hidden, isIdleModal, this._sceneRevision, this.state.versionTick)) {
      this._lastTime = now;
      return;
    }

    if (this._smoothedRafMs < 9.5 && !isIdleModal) {
      // True >105Hz display (e.g., 120Hz / 144Hz): integer 1:2 VSync division -> rock-solid 60Hz/72Hz!
      this._rafPhaseSkip = !this._rafPhaseSkip;
      if (this._rafPhaseSkip) return;
    } else {
      // Native 60Hz (~16.7ms) or 90Hz (~11.1ms): render every single VSync frame with ZERO jitter drops!
      this._rafPhaseSkip = false;
    }

    this._lastRenderTick = now;
    this.stepFrame(now);
  }

  stepFrame(now = performance.now()) {
    const isIdlePaused =
      this.hud.activeModal === 'pause' ||
      this.hud.activeModal === 'level_complete';
    const dt = isIdlePaused
      ? 0
      : Math.min(0.05, Math.max(0.001, (now - this._lastTime) / 1000));
    this._lastTime = now;
    if (!isIdlePaused) {
      this._totalElapsed += dt;
      this._debugFps = this._debugFps * 0.9 + (1 / Math.max(0.001, dt)) * 0.1;
    }
    if (this._debugPanel) {
      this._debugPanel.update(dt);
    }

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

    // 3. Final 4-Act Homecoming Launch Cutscene & Scenic Ending Meadow View
    if (this.cutscene.active || this.hud.activeModal === 'ending') {
      let t = 1;
      if (this.cutscene.active) {
        this.cutscene.elapsed += dt;
        t = Math.min(1, this.cutscene.elapsed / this.cutscene.flightDuration);

        if (t >= 0.855 && !this.cutscene.chimePlayed) {
          this.cutscene.chimePlayed = true;
          this.sound.playHomecomingChime();
        }

        const actIdx = t < 0.20 ? 0 : t < 0.44 ? 1 : t < 0.58 ? 2 : 3;
        const subKey =
          actIdx === 0
            ? 'launchSub1'
            : actIdx === 1
              ? 'launchSub2'
              : actIdx === 2
                ? 'launchSub3'
                : 'launchSub4';
        this.hud.setIntroOverlay(true, actIdx, this.state.ui(t >= 1 ? 'homecomingWelcome' : subKey), 4, 'launch');
      } else {
        this.hud.setIntroOverlay(false);
      }

      this.world.skyDome.uniforms.uTime.value = this._totalElapsed;
      this.spacecraft.update(dt, this._totalElapsed, 'launch');
      this.robot.update(dt, this._totalElapsed, this._zeroMoveVec, 0, [], true, null);
      this.particles.update(dt, false, { ambient: t < 0.58 });
      let camOverride = this.spacecraft.applyCutsceneFrame(
        t,
        this._totalElapsed,
        this.robot,
        this.camera
      );
      if (!this.cutscene.active || this.cutscene.elapsed >= this.cutscene.flightDuration) {
        camOverride = this.spacecraft.applyHomeworldWelcomeFrame(
          this.cutscene.active ? this.cutscene.elapsed - this.cutscene.flightDuration :
            this.cutscene.duration - this.cutscene.flightDuration,
          this.robot, this.camera
        );
      }
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

      if (this.cutscene.active && this.cutscene.elapsed >= this.cutscene.duration) {
        this.cutscene.active = false;
        this.hud.setIntroOverlay(false);
        this.hud.openEndingModal();
      }
      return;
    }

    // 3.5 Walkable Homeworld Emerald Meadow Free-Stroll Loop!
    if (this.inHomeworldRoam) {
      const blocked = this.hud.isBlockingGameplay();
      const isHardPaused = this.hud.activeModal === 'pause';
      const homeworldWaypoint = this.homeworldActivities.nextObjective();
      if (this.touchControls) {
        this.touchControls.setGameplayVisible(!blocked);
      }
      if (!blocked) {
        if (this.keys.has('KeyQ')) this.cameraCtrl.rotateByKey(-1, dt);
        if (this.keys.has('KeyR')) this.cameraCtrl.rotateByKey(1, dt);
      }

      const moveVec = this._readMoveVector();
      this.robot.update(
        dt,
        this._totalElapsed,
        moveVec,
        this.cameraCtrl.yaw,
        this.allColliders,
        blocked,
        blocked || this.state.homeworldSurvey.completed ? null : homeworldWaypoint
      );
      const homeworldTarget = blocked ? null : this.homeworldActivities.scanNearest();
      if (!blocked) {
        this.homeworldActivities.checkAerialCourse(dt);
      }
      if (this.touchControls && !blocked) {
        this.touchControls.updateContext(homeworldTarget, { homeworldRoam: true });
      }
      this.world.skyDome.uniforms.uTime.value = this._totalElapsed;
      this.spacecraft.skyTrialHitSet = this.homeworldActivities.skyTrialActive
        ? this.homeworldActivities.skyTrialRingsHit
        : null;
      this.spacecraft.update(dt, this._totalElapsed, false);
      this.cameraCtrl.update(dt, this.robot.position, null);
      this.atmosphere.updateHomeworld(dt, this._totalElapsed, this.camera, isHardPaused);
      this.world.updateShadowFollow(dt, this.robot.position, this.renderer, false);
      if (this.world.planarReflection) {
        this.world.planarReflection.update(this._totalElapsed, this.camera, false);
      }
      if (!isHardPaused) {
        this.particles.update(dt, false, { ambient: false });
      }
      this.hud.noteWorldFocus('homeworld', this.robot.position.x, this.robot.position.z);
      this.hud.updateHomeworldObjective(homeworldWaypoint);
      const hwZh = this.state.lang === 'zh';
      const hwAerialStatus = this.homeworldActivities.skyTrialActive
        ? (hwZh
            ? `⏱ 翡翠穿环竞速 ${this.homeworldActivities.skyTrialRingsHit.size}/8 · ${this.homeworldActivities.skyTrialElapsed.toFixed(1)}s`
            : `⏱ Sky-Trial ${this.homeworldActivities.skyTrialRingsHit.size}/8 • ${this.homeworldActivities.skyTrialElapsed.toFixed(1)}s`)
        : this.robot.inUpdraft
          ? (hwZh ? '↑ 热气流升力 · 燃料充能中' : '↑ Thermal Updraft • Fuel Recharging')
          : this.robot.aerialBoostTimer > 0
            ? (hwZh ? '✦ 光子环加速中' : '✦ Photon Ring Boost')
            : '';
      this.hud.updateFrame(dt, homeworldTarget, null, homeworldWaypoint, this.robot.jetFuel, hwAerialStatus);
      this.sound.updateSpatial(dt, this.robot.position, false, true);
      this.postProcessing.render(dt, this._totalElapsed);
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
      this.state.update(dt * this._debugTimeScale);
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

    const nearest = blocked ? null : this.interaction.scanNearest(dt);
    if (!blocked) {
      this.interaction.updateDesertAerialMotes(dt, this.world);
    }
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
    this.hud.noteWorldFocus(this.robot.worldPlane, this.robot.position.x, this.robot.position.z);
    const dZh = this.state.lang === 'zh';
    const dAerialStatus = this.state.sonarResonanceTimer > 0
      ? (dZh
          ? `⚡ 声呐谐振暴击 ${this.state.sonarResonanceTimer.toFixed(1)}s`
          : `⚡ Sonar Resonance ${this.state.sonarResonanceTimer.toFixed(1)}s`)
      : this.robot.inUpdraft
        ? (dZh ? '↑ 热气流升力 · 燃料充能中' : '↑ Thermal Updraft • Fuel Recharging')
        : this.robot.aerialBoostTimer > 0
          ? (dZh ? '✦ 空中星尘加速中' : '✦ Sky-Mote Boost')
          : '';
    this.hud.updateFrame(dt, nearest, idleHint, activeWaypoint, this.robot.jetFuel, dAerialStatus);
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
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__LBH_APP__ = new LittleBotHomeboundApp();
    });
  });
});
