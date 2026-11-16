import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildHomeworldEnhancements } from '../src/scene/homeworldBuilder.js';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../src/data/homeworldData.js';

const library = Object.fromEntries(['hull_white', 'titanium_dark', 'brushed_copper', 'station_deck', 'rock']
  .map(name => [name, { map: new THREE.Texture(), normalMap: new THREE.Texture(), ormMap: new THREE.Texture() }]));
const transforms = Object.values(library).flatMap(pbr => Object.values(pbr))
  .map(texture => [texture, texture.offset.clone(), texture.repeat.clone(), texture.rotation]);
const group = new THREE.Group();
group.position.y = HOMEWORLD_CONFIG.baseY;
const colliders = [];
buildHomeworldEnhancements(group, colliders, library);
group.updateMatrixWorld(true);
const meshes = [], materials = new Set();
let vertices = 0, triangles = 0, opaqueDraws = 0, glassDraws = 0;
group.traverse(object => {
  if (!object.isMesh) return;
  materials.add(object.material);
  const position = object.geometry.getAttribute('position');
  for (const attribute of Object.values(object.geometry.attributes)) {
    for (const value of attribute.array) assert.ok(Number.isFinite(value), `${object.name}: non-finite geometry`);
  }
  vertices += position.count;
  triangles += (object.geometry.index?.count || position.count) / 3;
  if (!object.isSkinnedMesh) meshes.push(object);
  if (object.material.name === 'colony-sealed-architectural-glazing') {
    assert.equal(object.material.transmission, 0, 'Glazing must not request a full-scene transmission replay');
    assert.equal(object.material.depthWrite, false, 'Independent glazing must not erase the opposite observation panels');
    assert.equal(object.renderOrder, 2, 'Glazing keeps its explicit order after static merging');
    assert.equal(object.castShadow, false, 'Thin glazing must not become an opaque shadow roof after merging');
    glassDraws++;
  } else if (object.parent?.name === 'homeworld-settlement-static') opaqueDraws++;
});
const surfaces = [...materials].filter(material => material.userData.homeworldPbr);
for (const material of surfaces) {
  const source = library[material.userData.homeworldPbr.surface];
  assert.equal(material.map, source.map, `${material.name}: albedo must reuse the existing bake`);
  assert.equal(material.normalMap, source.normalMap, `${material.name}: normal must reuse the existing bake`);
  assert.equal(material.roughnessMap, source.ormMap, `${material.name}: ORM must reuse the existing bake`);
}
for (const [texture, offset, repeat, rotation] of transforms) {
  assert.ok(texture.offset.equals(offset) && texture.repeat.equals(repeat) && texture.rotation === rotation,
    'Motherworld materials must not alter shared ship/desert texture transforms');
}
assert.equal(glassDraws, 2, 'Each building must retain one independently sorted glazing batch');
assert.ok(opaqueDraws <= 14, 'Static architectural detail must stay merged by its shared palette');

const opaque = meshes.filter(mesh => !mesh.material.transparent);
const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), direction = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3(), normal = new THREE.Vector3();
const shoes = opaque.filter(mesh => mesh.material.name === 'colony-recessed-machinery');
const structuralRibs = opaque.filter(mesh => mesh.material.name === 'colony-painted-structural-alloy');
let minimumBearingOverlap = Infinity;
for (let i = 0; i < 12; i++) {
  const a = i * Math.PI / 6 - Math.PI / 12;
  const x = 11.8 + Math.sin(a) * 5.29, z = 8.2 + Math.cos(a) * 5.29;
  // Observe each actual shoe top from above and the actual rib base from below.
  // Separate material batches prevent the neighboring deck/rib from masking a
  // gap between these surfaces after static architectural merging.
  origin.set(x, 420.40, z); direction.set(0, -1, 0);
  ray.set(origin, direction); ray.near = 0; ray.far = 0.50;
  const shoeTop = ray.intersectObjects(shoes, false)[0]?.point.y;
  origin.y = 420.20; direction.set(0, 1, 0);
  ray.set(origin, direction); ray.far = 0.20;
  const ribBottom = ray.intersectObjects(structuralRibs, false)[0]?.point.y;
  assert.ok(Number.isFinite(shoeTop) && Number.isFinite(ribBottom), 'Bearing contact surfaces must both exist');
  assert.ok(shoeTop >= ribBottom + 0.005, 'A load-bearing rib must enter its shoe without a visible air gap');
  minimumBearingOverlap = Math.min(minimumBearingOverlap, shoeTop - ribBottom);
  origin.set(x, 419.90, z); direction.set(0, 1, 0);
  ray.set(origin, direction); ray.far = 0.11;
  const shoeBottom = ray.intersectObjects(shoes, false)[0]?.point.y;
  assert.ok(Number.isFinite(shoeBottom) && shoeBottom <= 420.005,
    'The shoe must reach the civic deck instead of hovering above it');
}
function firstHit(x, y, z, dx, dz, far = 10) {
  origin.set(x, y, z); direction.set(dx, 0, dz).normalize();
  ray.set(origin, direction); ray.near = 0; ray.far = far;
  const hit = ray.intersectObjects(opaque, false)[0];
  assert.ok(hit, `Pressure envelope is open at ${x},${y},${z}`);
  normalMatrix.getNormalMatrix(hit.object.matrixWorld);
  normal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
  return { distance: hit.distance, material: hit.object.material.name, normalDot: normal.dot(direction) };
}

// Raycast both faces of each petal at the same height. A thin single surface,
// inverted contour or omitted cut face cannot pass this pressure-shell check.
let minimumShellThickness = Infinity;
for (let i = 0; i < 12; i++) {
  const angle = i * Math.PI / 6, sx = Math.sin(angle), sz = Math.cos(angle);
  const outer = firstHit(11.8 + sx * 8, 423.5, 8.2 + sz * 8, -sx, -sz);
  const inner = firstHit(11.8, 423.5, 8.2, sx, sz);
  assert.equal(outer.material, 'colony-pressure-ceramic', 'The observation belt must have an opaque pressure roof');
  assert.equal(inner.material, 'colony-pressure-ceramic', 'The roof must have a visible inner skin');
  assert.ok(outer.normalDot < -0.25 && inner.normalDot < -0.25, 'Both shell faces must face their respective observers');
  const thickness = 8 - outer.distance - inner.distance;
  assert.ok(thickness > 0.12 && thickness < 0.45, `Roof lost its physical thickness: ${thickness}`);
  minimumShellThickness = Math.min(minimumShellThickness, thickness);
}

// The closed airlocks communicate their depth from a playable approach: the
// central pressure door sits behind the outer frame, with no flat façade mask.
const civicDoor = firstHit(3.8, 421.5, 8.2, 1, 0);
const civicFrame = firstHit(3.8, 421.5, 7.12, 1, 0);
const civicRecess = civicDoor.distance - civicFrame.distance;
assert.ok(civicRecess > 0.23 && civicRecess < 0.45, `Civic door is not recessed: ${civicRecess}`);
const solAngle = 8 / 10 * Math.PI * 2, sx = Math.sin(solAngle), sz = Math.cos(solAngle);
const solY = getHomeworldGroundHeight(21.2, 4.2) + 1.47;
const solDoor = firstHit(21.2 + sx * 7, solY, 4.2 + sz * 7, -sx, -sz);
const solFrame = firstHit(21.2 + sx * 7 + sz * 0.84, solY, 4.2 + sz * 7 - sx * 0.84, -sx, -sz);
const solRecess = solDoor.distance - solFrame.distance;
assert.ok(solRecess > 0.18 && solRecess < 0.40, `Greenhouse door is not recessed: ${solRecess}`);

for (let i = 0; i < 10; i++) {
  const a = i * Math.PI / 5 - Math.PI / 10;
  const x = 21.2 + Math.sin(a) * 3.91, z = 4.2 + Math.cos(a) * 3.91;
  const ground = getHomeworldGroundHeight(x, z);
  origin.set(x, ground - 0.20, z); direction.set(0, 1, 0);
  ray.set(origin, direction); ray.near = 0; ray.far = 0.205;
  assert.ok(ray.intersectObjects(opaque, false).length > 0,
    'A greenhouse bearing/foundation must enter the local ground rather than hover above its slope');
}

// Low-level machinery remains fully inside the old collider. This specifically
// prevents the former sail/base geometry from extending into the resident path.
const utility = colliders.find(collider => collider.id === 'hw_utility_spine');
for (let i = 0; i < 24; i++) {
  const a = i / 24 * Math.PI * 2, sx = Math.sin(a), sz = Math.cos(a);
  for (const height of [0.12, 0.65, 1.23, 1.9, 2.4, 3.65, 4.15]) {
    origin.set(utility.x + sx * 1.10, 420 + height, utility.z + sz * 1.10);
    direction.set(-sx, 0, -sz);
    ray.set(origin, direction); ray.near = 0; ray.far = 0.099;
    assert.equal(ray.intersectObjects(opaque, false).length, 0,
      'Utility geometry projects beyond the collider into the working approach');
  }
}

console.log(JSON.stringify({ architecturalGeometryFinite: true, vertices, triangles,
  sharedBakedSurfaces: surfaces.length, opaqueSettlementDraws: opaqueDraws, independentGlazingDraws: glassDraws,
  minimumRoofThickness: minimumShellThickness, minimumBearingOverlap,
  civicDoorRecess: civicRecess, greenhouseDoorRecess: solRecess }, null, 2));
