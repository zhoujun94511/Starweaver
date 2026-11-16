import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlanarReflectionSystem } from '../src/graphics/planarReflection.js';

// Exercise the real Three.js camera, transformed pool geometry and reflection
// update. The renderer records rasterization requests without requiring WebGL.
function fixture(poolOptions = { x: 0, y: 0, z: 0 }) {
  const renderer = {
    draws: 0,
    target: null,
    shadowMap: { autoUpdate: false },
    toneMapping: THREE.ACESFilmicToneMapping,
    getDrawingBufferSize(target) { return target.set(800, 600); },
    getRenderTarget() { return this.target; },
    setRenderTarget(target) { this.target = target; },
    clear() {},
    render() { this.draws++; }
  };
  const scene = new THREE.Scene();
  const reflection = new PlanarReflectionSystem(renderer, scene);
  reflection.setQuality('ultra', true);
  const pool = reflection.createBrinePool(poolOptions);
  scene.add(pool);
  const camera = new THREE.PerspectiveCamera(55, 4 / 3, 0.1, 600);
  return { renderer, scene, reflection, pool, camera };
}

function aim(camera, position, target) {
  camera.position.fromArray(position);
  camera.lookAt(...target);
  camera.updateMatrixWorld(true);
}

let checks = 0;
function expectRasterization(f, expected, message, force = true) {
  const previous = f.renderer.draws;
  f.reflection.update(checks * 0.016, f.camera, force);
  assert.equal(f.renderer.draws - previous, expected ? 1 : 0, message);
  assert.equal(f.reflection.sharedUniforms.uReflActive.value, expected ? 1 : 0, message);
  checks++;
}

const basic = fixture();
aim(basic.camera, [0, 8, 16], [0, 0, 0]);
expectRasterization(basic, true, 'A pool in front of the camera must reflect');
aim(basic.camera, [0, 8, 16], [0, 8, 40]);
expectRasterization(basic, false, 'Turning away must stop the second scene render');
assert.equal(basic.reflection.activePool, null);
assert.equal(basic.pool.material.uniforms.uIsCurrentPlane.value, 0);
aim(basic.camera, [0, 8, 16], [0, 0, 0]);
expectRasterization(basic, true, 'Turning back must immediately restore reflection');

const edge = fixture({ x: 22, y: 0, z: 0, radiusX: 25, radiusZ: 5, rotationY: 0 });
aim(edge.camera, [0, 6, 20], [0, 0, 0]);
edge.scene.updateMatrixWorld(true);
const centerNdc = edge.pool.position.clone().project(edge.camera);
assert(centerNdc.x > 1, 'Fixture must keep the large pool center outside the viewport');
const ray = new THREE.Raycaster();
ray.setFromCamera(new THREE.Vector2(0, 0), edge.camera);
assert(ray.intersectObject(edge.pool).length > 0, 'The actual large pool edge must remain visible');
expectRasterization(edge, true, 'A visible edge must reflect even with its center offscreen');

const transformed = fixture({ x: -100, y: 0, z: 0, radiusX: 4, radiusZ: 2 });
const parent = new THREE.Group();
parent.position.set(200, 4, -5);
parent.scale.setScalar(2);
transformed.scene.add(parent);
parent.add(transformed.pool);
transformed.pool.rotation.y = Math.PI / 3;
transformed.pool.scale.set(0.6, 1, 2.5);
aim(transformed.camera, [0, 12, 17], [0, 4, -5]);
expectRasterization(transformed, true, 'Parent translation, rotation and scale must transform visibility bounds');
assert(Math.abs(transformed.reflection.virtualCamera.position.y + 4) < 1e-9,
  'The mirror plane must use the transformed pool height');
const actualBounds = transformed.pool.geometry.boundingSphere.clone().applyMatrix4(transformed.pool.matrixWorld);
assert(actualBounds.center.distanceTo(transformed.reflection._poolWorldBounds.center) < 1e-9);
assert(Math.abs(actualBounds.radius - transformed.reflection._poolWorldBounds.radius) < 1e-9);
parent.visible = false;
expectRasterization(transformed, false, 'A pool under a hidden parent must not reflect');
parent.visible = true;
transformed.pool.visible = false;
expectRasterization(transformed, false, 'An individually hidden pool must not reflect');

const choice = fixture({ x: 0, y: 0, z: 20 });
const frontPool = choice.reflection.createBrinePool({ x: 0, y: 0, z: -10 });
choice.scene.add(frontPool);
aim(choice.camera, [0, 5, 5], [0, 0, -10]);
expectRasterization(choice, true, 'A nearer pool behind the camera must not hide a farther visible pool');
assert.equal(choice.reflection.activePool.mesh, frontPool);

basic.reflection.sharedUniforms.uWeatherClarity.value = 0.40;
expectRasterization(basic, false, 'Heavy sandstorms must retain the existing reflection bypass');
basic.reflection.sharedUniforms.uWeatherClarity.value = 1;
aim(basic.camera, [0, 425, 16], [0, 420, 0]);
expectRasterization(basic, false, 'Homeworld must never rasterize the desert mirror');
aim(basic.camera, [0, 8, 16], [0, 0, 0]);
for (const quality of ['low', 'medium', 'high']) {
  basic.reflection.setQuality(quality, true);
  expectRasterization(basic, false, `Mobile ${quality} must retain its reflection bypass`);
}
basic.reflection.setQuality('ultra', true);
expectRasterization(basic, true, 'Mobile Ultra must still render visible pools');

// Returning from a culled view must render immediately even on an otherwise
// skipped half-rate frame; the next frame may reuse that valid reflection.
aim(basic.camera, [0, 8, 16], [0, 8, 40]);
expectRasterization(basic, false, 'The away view must invalidate the active pool', false);
aim(basic.camera, [0, 8, 16], [0, 0, 0]);
expectRasterization(basic, true, 'Half-rate scheduling must not delay reappearance', false);
const scratchObjects = [basic.reflection._viewProjection, basic.reflection._mainFrustum,
  basic.reflection._poolWorldBounds, basic.reflection._poolWorldPos];
basic.reflection.update(1, basic.camera, false);
for (const [index, name] of ['_viewProjection', '_mainFrustum', '_poolWorldBounds', '_poolWorldPos'].entries()) {
  assert.equal(basic.reflection[name], scratchObjects[index],
    'Frustum math must reuse the constructor scratch objects');
}

console.log(JSON.stringify({ passed: true, checks, frontBackAndReturn: true,
  largePoolEdgeVisibleWithOffscreenCenter: true, transformedBoundsAndHeight: true,
  hiddenAncestors: true, nearestVisiblePool: true, qualityWeatherAndHomeworldBypasses: true }));
