import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _mat4 = new THREE.Matrix4();

/**
 * Safely merges heterogeneous BufferGeometries (indexed & non-indexed, with or without UVs / vertex colors)
 * into a single static BufferGeometry to dramatically cut WebGL draw calls on mobile GPUs.
 *
 * @param {Array<{ geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, position?: [number,number,number], rotation?: [number,number,number], scale?: [number,number,number]|number }>} entries
 * @returns {THREE.BufferGeometry|null}
 */
export function mergeTransformedGeometries(entries) {
  if (!entries || entries.length === 0) return null;

  const prepared = [];
  let needUv = false;
  let needColor = false;

  for (const item of entries) {
    if (!item || !item.geo) continue;
    const g = item.geo.index ? item.geo.toNonIndexed() : item.geo.clone();

    if (item.matrix) {
      g.applyMatrix4(item.matrix);
    } else {
      const p = item.position || [0, 0, 0];
      const r = item.rotation || [0, 0, 0];
      const s = item.scale;
      _pos.set(p[0], p[1], p[2]);
      _euler.set(r[0], r[1], r[2]);
      _quat.setFromEuler(_euler);
      if (typeof s === 'number') {
        _scale.set(s, s, s);
      } else if (Array.isArray(s)) {
        _scale.set(s[0], s[1], s[2]);
      } else {
        _scale.set(1, 1, 1);
      }
      _mat4.compose(_pos, _quat, _scale);
      g.applyMatrix4(_mat4);
    }

    if (!g.hasAttribute('normal')) {
      g.computeVertexNormals();
    }
    if (g.hasAttribute('uv')) needUv = true;
    if (g.hasAttribute('color')) needColor = true;
    prepared.push(g);
  }

  if (prepared.length === 0) return null;

  for (const g of prepared) {
    const count = g.attributes.position.count;

    if (needUv && !g.hasAttribute('uv')) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    if (needColor && !g.hasAttribute('color')) {
      const white = new Float32Array(count * 3);
      white.fill(1.0);
      g.setAttribute('color', new THREE.Float32BufferAttribute(white, 3));
    }

    // Strip any mismatched extra attributes (e.g. uv1, tangent) so mergeGeometries never fails
    for (const key of Object.keys(g.attributes)) {
      if (
        key !== 'position' &&
        key !== 'normal' &&
        (key !== 'uv' || !needUv) &&
        (key !== 'color' || !needColor)
      ) {
        g.deleteAttribute(key);
      }
    }
  }

  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) {
    g.dispose();
  }
  return merged;
}
