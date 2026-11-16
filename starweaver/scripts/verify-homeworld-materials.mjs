import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHomeworldSurfaceMaterial } from '../src/graphics/homeworldMaterials.js';

// Test shared asset ownership and the actual r170 shader integration. GPU
// compilation is checked separately on the connected phone and desktop.
const texture = () => {
  const t = new THREE.DataTexture(new Uint8Array([180, 190, 200, 255]), 1, 1);
  t.repeat.set(3, 2); t.offset.set(0.2, 0.4); t.rotation = 0.3;
  return t;
};
const pbr = { map: texture(), ormMap: texture(), normalMap: texture() };
const snapshot = Object.values(pbr).map(t => [t.uuid, ...t.repeat, ...t.offset, t.rotation, t.version]);
const library = { rock: pbr, hull_white: pbr, station_deck: pbr };
const materials = ['rock', 'hull_white', 'station_deck'].map(surface =>
  createHomeworldSurfaceMaterial(library, { surface, worldScale: 0.7 }));
for (const m of materials) {
  assert.equal(m.map, pbr.map);
  assert.equal(m.normalMap, pbr.normalMap);
  for (const key of ['aoMap', 'roughnessMap', 'metalnessMap']) assert.equal(m[key], pbr.ormMap);
  assert.equal(m.transparent, false);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  m.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uHwSurface.value.w, 420, 'Contact weathering must use the meadow world plane');
  assert.match(shader.fragmentShader, /getTangentFrame\([^;]*hwSurfaceUv/s,
    'Normal tangent frame must follow the same projection as albedo/ORM');
  assert.match(shader.fragmentShader, /texture2D\(\s*normalMap, hwSurfaceUv\s*\)/);
  for (const channel of ['roughnessMap', 'metalnessMap', 'aoMap']) {
    assert.match(shader.fragmentShader, new RegExp(`texture2D\\(\\s*${channel}, hwSurfaceUv\\s*\\)`));
  }
  assert.match(shader.vertexShader, /hwObjectNormal \/= vec3\(dot\(instanceMatrix/,
    'Nonuniform instance scale needs inverse-scale normal correction');
  assert.match(shader.vertexShader, /inverseTransformDirection\(normalMatrix/);
  assert.doesNotMatch(shader.fragmentShader, /discard/);
}
assert.deepEqual(Object.values(pbr).map(t => [t.uuid, ...t.repeat, ...t.offset, t.rotation, t.version]), snapshot,
  'Motherworld materials must not mutate textures still owned by the desert/ship');
const noLibrary = createHomeworldSurfaceMaterial(null);
assert.equal(noLibrary.map, null, 'Geometry white-box runs must work without a GPU texture library');
for (const m of [...materials, noLibrary]) m.dispose();
for (const t of Object.values(pbr)) t.dispose();
console.log('Homeworld materials: shared PBR assets, coherent world-space channels and Y=420 weathering passed.');
