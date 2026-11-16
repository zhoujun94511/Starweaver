import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AtmosphereSystem } from '../src/systems/atmosphereSystem.js';
import { GameState } from '../src/state/gameState.js';
import { createSkyDome } from '../src/graphics/skyDome.js';
import { PostProcessingPipeline } from '../src/graphics/postProcessing.js';

const state = new GameState();
state.currentLevel = 2;
const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.FogExp2();
const environments = { desert: {}, desertNight: {} };
const world = {
  skyDome: createSkyDome({ isMobile: true }),
  sunLight: new THREE.DirectionalLight(),
  hemiLight: new THREE.HemisphereLight(),
  _sunOffset: new THREE.Vector3(42, 64, 28),
  isCoarseMobileDevice: () => true,
  planarReflection: { sharedUniforms: {
    uSunDir: { value: new THREE.Vector3() },
    uNightFactor: { value: 0 },
    uWeatherClarity: { value: 1 }
  } }
};
const robot = { headlamp: 0, setNightHeadlamp(value) { this.headlamp = value; } };
const weather = { storm: 0, night: 0,
  update(elapsed, camera, storm, night) { this.storm = storm; this.night = night; } };
const exposure = { resets: 0, resetExposure() { this.resets++; } };
const atmosphere = new AtmosphereSystem({ state, scene, environments, world, robot,
  postProcessing: exposure, sound: null, weatherParticles: weather });
const camera = new THREE.PerspectiveCamera();
const dt = 1 / 60;

function weights() {
  return [atmosphere.nightFactor, atmosphere.overcastWeight, atmosphere.sandstormWeight];
}
function clock() {
  return [atmosphere.cyclePhase, atmosphere.playElapsed, atmosphere.weatherTimer];
}
function paintPaused(expectExposureReset = false) {
  const previousResets = exposure.resets;
  atmosphere.update(dt, 1, camera, true);
  assert.equal(exposure.resets - previousResets, Number(expectExposureReset),
    'Only explicit paused environment changes may reset exposure');
}

// Enter pause midway through a natural transition. Merely opening the menu,
// rotating the phone or changing quality must not finish that transition.
state.setTimeMode('night');
state.setWeatherMode('sandstorm');
atmosphere.update(dt, 0, camera, false);
assert.equal(exposure.resets, 0, 'Active transitions must preserve smooth exposure adaptation');
assert(atmosphere.nightFactor > 0 && atmosphere.nightFactor < 0.2);
assert(atmosphere.sandstormWeight > 0 && atmosphere.sandstormWeight < 0.1);
const enteringWeights = weights(), enteringClock = clock();
paintPaused();
assert.deepEqual(weights(), enteringWeights, 'Pause entry must freeze the current visual blend');
state.setQuality('low');
paintPaused();
assert.deepEqual(weights(), enteringWeights, 'Unrelated preferences must not advance the visual blend');
assert.deepEqual(clock(), enteringClock, 'Paused paints must not advance cycle, play time or weather schedule');

// A changed manual time mode is fully reflected in one on-demand paint, while
// an unchanged weather blend remains frozen at its previous value.
state.setTimeMode('day');
paintPaused(true);
assert.equal(atmosphere.nightFactor, 0);
assert.equal(scene.environment, environments.desert);
assert.deepEqual(weights().slice(1), enteringWeights.slice(1));
state.setTimeMode('night');
paintPaused(true);
assert.equal(atmosphere.nightFactor, 1);
assert.equal(world.skyDome.uniforms.uNightFactor.value, 1);
assert.equal(scene.environment, environments.desertNight, 'The PMREM must switch during the paused paint');
assert.equal(world.planarReflection.sharedUniforms.uNightFactor.value, 1);
assert.equal(robot.headlamp, 1);
assert.equal(weather.night, 1);

// A weather selection similarly settles all linked fog, sky, particles and
// reflection fallback inputs in the same paint without changing time of day.
state.setWeatherMode('clear');
paintPaused(true);
assert.deepEqual(weights(), [1, 0, 0]);
assert.equal(scene.fog.density, 0.0012);
state.setWeatherMode('sandstorm');
paintPaused(true);
assert.deepEqual(weights(), [1, 0.65, 1]);
assert.equal(world.skyDome.uniforms.uDustVeil.value, 1);
assert.equal(weather.storm, 1);
assert.equal(world.planarReflection.sharedUniforms.uWeatherClarity.value, 0.2);
assert(Math.abs(scene.fog.density - (0.0012 + 0.65 * 0.0008 + 0.0052)) < 1e-12);
state.setWeatherMode('overcast');
paintPaused(true);
assert.deepEqual(weights(), [1, 1, 0]);
atmosphere.dynamicTarget = 'clear';
state.setWeatherMode('dynamic');
paintPaused(true);
assert.deepEqual(weights(), [1, 0, 0], 'Returning to dynamic weather must resolve its current scheduled target');
state.setTimeMode('cycle');
paintPaused(true);
assert.equal(atmosphere.nightFactor, 0, 'Returning to the stored morning phase must resolve its current time target');
assert.deepEqual(clock(), enteringClock);

// Resume and active preference changes keep the original exponential damping;
// the next pause freezes that partial blend instead of jumping to its endpoint.
state.setTimeMode('night');
state.setWeatherMode('sandstorm');
atmosphere.update(dt, 2, camera, false);
assert(atmosphere.nightFactor > 0 && atmosphere.nightFactor < 0.2);
assert(atmosphere.sandstormWeight > 0 && atmosphere.sandstormWeight < 0.1);
const resumedWeights = weights();
paintPaused();
assert.deepEqual(weights(), resumedWeights);
atmosphere.update(dt, 3, camera, false);
assert(atmosphere.nightFactor > resumedWeights[0] && atmosphere.nightFactor < 1);
assert(atmosphere.sandstormWeight > resumedWeights[2] && atmosphere.sandstormWeight < 1);

// Drive the actual post pipeline and its real uniforms. A renderer substitute
// records render commands; no GPU result or visual exposure value is assumed.
const savedWindow = globalThis.window;
let pipeline;
try {
  globalThis.window = { innerWidth: 320, innerHeight: 200,
    matchMedia: () => ({ matches: false }) };
  const renderer = {
    capabilities: { isWebGL2: true },
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1,
    getPixelRatio: () => 1,
    setRenderTarget() {}, clear() {}, render() {}
  };
  pipeline = new PostProcessingPipeline(renderer, scene, camera);
  assert(pipeline.enabled && pipeline.rt, 'The real HDR pipeline must initialize in the fixture');
  pipeline.frameIndex = 10;
  pipeline.render(dt, 3);
  assert(pipeline.passes.adapt.uniforms.uRate.value > 0 && pipeline.passes.adapt.uniforms.uRate.value < 1);
  pipeline.resetExposure();
  pipeline.resetExposure();
  pipeline.render(dt, 4);
  assert.equal(pipeline.passes.adapt.uniforms.uRate.value, 1, 'Reset must fully adapt exposure in the next HDR paint');
  assert.equal(pipeline.passes.adapt.uniforms.uVisRate.value, 1, 'Glare visibility must settle in the same paint');
  assert.equal(pipeline._exposureResetPending, false, 'A rendered HDR reset must be consumed');
  pipeline.render(dt, 5);
  assert(pipeline.passes.adapt.uniforms.uRate.value < 1, 'The following frame must return to gradual adaptation');
  pipeline.setQuality('low');
  pipeline.resetExposure();
  pipeline.render(dt, 6);
  assert.equal(pipeline._exposureResetPending, true, 'Direct rendering must retain the request until HDR resumes');
  pipeline.setQuality('high');
  pipeline.render(dt, 7);
  assert.equal(pipeline.passes.adapt.uniforms.uRate.value, 1);
  assert.equal(pipeline._exposureResetPending, false);
} finally {
  if (savedWindow === undefined) delete globalThis.window;
  else globalThis.window = savedWindow;
}

console.log(JSON.stringify({ passed: true, pausedModeChangesSettleInOnePaint: true,
  pauseEntryAndUnrelatedRepaintsFreezeBlend: true, probesSkyFogParticlesAndReflectionSynchronized: true,
  pausedClocksFrozen: true, activeTransitionsRemainSmooth: true,
  exposureResetOnlyForPausedModeChanges: true, realPipelineConsumesExposureReset: true }));
