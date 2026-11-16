import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHomeworldLandscape } from '../src/scene/homeworldLandscape.js';
import { buildHomeworldEnhancements } from '../src/scene/homeworldBuilder.js';
import { RobotController } from '../src/entities/robotController.js';
import { GameState } from '../src/state/gameState.js';
import {
  HOMEWORLD_CONFIG, HOMEWORLD_ROUTES, HOMEWORLD_DISTRICTS,
  getHomeworldGroundHeight
} from '../src/data/homeworldData.js';

// CPU geometry/physics regression; no browser, GPU, device actions or screenshots.
// Fixtures below are the actual bank-route, floating-fern and overhead head
// penetrations reproduced during the motherworld inspection.
const group = new THREE.Group();
group.position.y = HOMEWORLD_CONFIG.baseY;
const colliders = [];
buildHomeworldLandscape(group, colliders);
buildHomeworldEnhancements(group, colliders);
group.updateMatrixWorld(true);
const meshes = [];
let geometryVertices = 0;
group.traverse(object => {
  if (!object.isMesh) return;
  meshes.push(object);
  const geometry = object.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  assert.ok(position && normal, `${object.name}: positions/normals required`);
  assert.equal(normal.count, position.count, `${object.name}: normal count differs from vertices`);
  geometryVertices += position.count;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  assert.ok(materials.every(Boolean), `${object.name}: missing material`);
  if (materials.some(m => m.userData.homeworldPbr || m.map || m.normalMap)) {
    assert.equal(geometry.getAttribute('uv')?.count, position.count,
      `${object.name}: mapped surface lost its UVs`);
  }
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    for (const value of attribute.array) {
      assert.ok(Number.isFinite(value), `${object.name}: non-finite ${name}`);
    }
  }
  for (const index of geometry.index?.array || []) {
    assert.ok(Number.isInteger(index) && index >= 0 && index < position.count,
      `${object.name}: index outside actual vertex buffer`);
  }
  if (object.isInstancedMesh) {
    for (const value of object.instanceMatrix.array) {
      assert.ok(Number.isFinite(value), `${object.name}: invalid instance transform`);
    }
  }
});

// Match RobotController's foot-height filtering; overhead caps deliberately
// activate below their physical mesh to protect the head during flight.
function activeAtHeight(collider, footY) {
  return collider.minY > 200 && footY >= collider.minY &&
    (collider.maxY === undefined || footY <= collider.maxY) &&
    (!collider.activeFn || collider.activeFn());
}
function surfaceClearance(x, z, footY) {
  return Math.min(...colliders.filter(c => activeAtHeight(c, footY))
    .map(c => Math.hypot(x - c.x, z - c.z) - c.radius));
}
const routeChecks = HOMEWORLD_ROUTES.map((route, routeIndex) => {
  let minimumBodyClearance = Infinity, samples = 0;
  for (let segment = 1; segment < route.length; segment++) {
    const [ax, az] = route[segment - 1], [bx, bz] = route[segment];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.1);
    for (let i = 0; i <= steps; i++) {
      const x = ax + (bx - ax) * i / steps, z = az + (bz - az) * i / steps;
      const clearance = surfaceClearance(x, z, getHomeworldGroundHeight(x, z)) - 0.62;
      assert.ok(clearance >= -1e-6,
        `Route ${routeIndex} blocked for Milo at ${x},${z}: ${clearance}m`);
      minimumBodyClearance = Math.min(minimumBodyClearance, clearance);
      samples++;
    }
  }
  return { route: routeIndex, samples, minimumBodyClearance };
});
const districtChecks = HOMEWORLD_DISTRICTS.map(district => {
  const { approachX: x, approachZ: z } = district;
  const clearance = surfaceClearance(x, z, getHomeworldGroundHeight(x, z));
  assert.ok(clearance >= 0.9, `${district.id}: no 0.9m standing area at its interaction point`);
  return { id: district.id, standingRadius: clearance };
});

// Check transformed vertices, rather than merely testing instance origins.
// The former fern had its first vertex 12cm above its root transform.
const vegetationChecks = [];
const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
for (const name of ['homeworld-irregular-ferns', 'homeworld-irregular-river-sedges']) {
  const mesh = group.getObjectByName(name);
  assert.ok(mesh?.isInstancedMesh && mesh.count > 0, `${name}: missing vegetation batch`);
  const positions = mesh.geometry.getAttribute('position');
  let lowestRootGap = Infinity, highestRootGap = -Infinity;
  for (let instance = 0; instance < mesh.count; instance++) {
    mesh.getMatrixAt(instance, matrix);
    matrix.premultiply(mesh.matrixWorld);
    let rootGap = Infinity, leafHeight = -Infinity;
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix);
      const gap = vertex.y - getHomeworldGroundHeight(vertex.x, vertex.z);
      rootGap = Math.min(rootGap, gap);
      leafHeight = Math.max(leafHeight, gap);
    }
    assert.ok(rootGap <= 0.01 && rootGap >= -0.08,
      `${name}[${instance}]: root floats or is buried (${rootGap}m)`);
    assert.ok(leafHeight > 0.1, `${name}[${instance}]: all leaves are buried`);
    lowestRootGap = Math.min(lowestRootGap, rootGap);
    highestRootGap = Math.max(highestRootGap, rootGap);
  }
  vegetationChecks.push({ name, instances: mesh.count, lowestRootGap, highestRootGap });
}

// Canvas only supplies visor/shadow artwork in Node; geometry and all collision,
// animation, support-height and mesh synchronization code remain unmodified.
function installCanvasStub() {
  if (typeof globalThis.document !== 'undefined') return () => {};
  const noop = () => {}, gradient = { addColorStop: noop };
  const context = Object.fromEntries(['save', 'restore', 'scale', 'translate', 'rotate',
    'clearRect', 'fillRect', 'strokeRect', 'beginPath', 'closePath', 'moveTo', 'lineTo',
    'arc', 'ellipse', 'roundRect', 'fill', 'stroke', 'fillText'].map(name => [name, noop]));
  Object.assign(context, { createLinearGradient: () => gradient, createRadialGradient: () => gradient });
  globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => context }) };
  return () => { delete globalThis.document; };
}
const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
function realSurfacePoint(x, z, materialName) {
  const candidates = meshes.filter(mesh => mesh.material.name === materialName);
  ray.set(new THREE.Vector3(x, HOMEWORLD_CONFIG.baseY + 20, z), down);
  ray.near = 0; ray.far = 30;
  const hit = ray.intersectObjects(candidates, false)[0];
  assert.ok(hit, `Missing actual ${materialName} geometry at ${x},${z}`);
  return { point: hit.point.clone(), candidates };
}
function poseRobot(foot, obstacles) {
  const scene = new THREE.Scene();
  const robot = new RobotController(scene, new GameState(), { playStep() {}, playBarrierBump() {} });
  robot.worldPlane = 'homeworld';
  robot.position.copy(foot);
  robot.yaw = Math.PI;
  robot.syncPositionToMesh();
  robot.update(0, 0, { x: 0, z: 0, fly: false }, 0, obstacles);
  scene.updateMatrixWorld(true);
  const head = robot.headGroup.children.find(child => {
    if (!child.isMesh) return false;
    child.geometry.computeBoundingBox();
    const size = child.geometry.boundingBox.getSize(new THREE.Vector3());
    return Math.abs(size.x - 0.94) < 1e-5 && Math.abs(size.y - 0.72) < 1e-5;
  });
  assert.ok(head, 'Real Milo head shell not found');
  return { position: robot.position.clone(), headBox: new THREE.Box3().setFromObject(head) };
}
function assertHeadClearsRealGeometry(headBox, candidates, label) {
  // Sample actual obstacle triangles through the real head envelope, so moving
  // past one cached witness point cannot hide penetration into another edge.
  for (const tx of [0.2, 0.5, 0.8]) for (const tz of [0.2, 0.5, 0.8]) {
    ray.set(new THREE.Vector3(THREE.MathUtils.lerp(headBox.min.x, headBox.max.x, tx),
      headBox.max.y + 1e-4, THREE.MathUtils.lerp(headBox.min.z, headBox.max.z, tz)), down);
    ray.near = 0; ray.far = headBox.max.y - headBox.min.y + 2e-4;
    assert.equal(ray.intersectObjects(candidates, false).length, 0,
      `${label}: actual overhead mesh still enters Milo's head`);
  }
}
const restoreCanvas = installCanvasStub();
const overheadChecks = [];
try {
  const solar = realSurfacePoint(5.9, 36.12, 'photovoltaic-cells');
  const shade = realSurfacePoint(33.65, 6.2, 'titanium-copper');
  const fixtures = [
    ...[0.8, 1.0, 1.2].map(height => ({ label: `solar-foot+${height}`,
      foot: new THREE.Vector3(5.9, getHomeworldGroundHeight(5.9, 35.4) + height, 36.6),
      surface: solar, missingCap: c => c.id === 'hw_energy_solar_panel_-1' })),
    { label: 'nursery-shade-midspan', foot: new THREE.Vector3(33.65, shade.point.y - 1.4, 6.5),
      surface: shade, missingCap: c => c.id.startsWith('hw_nursery_shade_6.2_') }
  ];
  for (const { label, foot, surface, missingCap } of fixtures) {
    const caps = colliders.filter(missingCap);
    assert.ok(caps.length > 0, `${label}: missing height-limited cap`);
    for (const cap of caps) {
      assert.ok(cap.minY > getHomeworldGroundHeight(cap.x, cap.z) + 0.1,
        `${label}: overhead protection incorrectly blocks ground-level walking`);
      assert.ok(cap.occluderMinY > cap.minY + 2,
        `${label}: camera must use the physical beam height, not the foot activation height`);
    }
    const broken = poseRobot(foot, colliders.filter(c => !missingCap(c)));
    assert.ok(broken.headBox.containsPoint(surface.point),
      `${label}: negative control must reproduce the original real-mesh head penetration`);
    const fixed = poseRobot(foot, colliders);
    assert.ok(fixed.position.distanceTo(foot) > 0.2, `${label}: controller did not resolve penetration`);
    assert.ok(!fixed.headBox.containsPoint(surface.point), `${label}: witness point remains inside the head`);
    assertHeadClearsRealGeometry(fixed.headBox, surface.candidates, label);
    overheadChecks.push({ fixture: label, resolvedDistance: fixed.position.distanceTo(foot) });
  }
} finally {
  restoreCanvas();
}

console.log(JSON.stringify({ landscapeGeometryFinite: true, meshes: meshes.length,
  geometryVertices, routes: routeChecks, districts: districtChecks,
  vegetation: vegetationChecks, actualControllerAndMeshRegressions: overheadChecks }, null, 2));
