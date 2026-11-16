import * as THREE from 'three';

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap'
];

function disposeMaterial(mat, sharedMaterials, sharedTextures) {
  if (!mat || (sharedMaterials && sharedMaterials.has(mat))) return 0;
  for (let i = 0; i < TEXTURE_SLOTS.length; i++) {
    const tex = mat[TEXTURE_SLOTS[i]];
    if (tex && typeof tex.dispose === 'function' && (!sharedTextures || !sharedTextures.has(tex))) {
      tex.dispose();
    }
  }
  if (typeof mat.dispose === 'function') {
    mat.dispose();
    return 1;
  }
  return 0;
}

/**
 * Disposes exclusive GPU geometries, materials, and textures in a scene subtree
 * following Three.js resource-disposal guidelines while preserving shared assets.
 */
export function disposeObjectSubtree(root, { sharedMaterials = null, sharedTextures = null, renderer = null } = {}) {
  if (!root) return { geometries: 0, materials: 0 };
  const geometries = new Set();
  const materials = new Set();

  root.traverse((obj) => {
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      geometries.add(obj.geometry);
    }
    const mat = obj.material;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) {
        if (mat[i]) materials.add(mat[i]);
      }
    } else if (mat) {
      materials.add(mat);
    }
  });

  let disposedGeo = 0;
  for (const geo of geometries) {
    geo.dispose();
    disposedGeo++;
  }

  let disposedMat = 0;
  for (const mat of materials) {
    disposedMat += disposeMaterial(mat, sharedMaterials, sharedTextures);
  }

  root.clear();
  if (root.parent) {
    root.parent.remove(root);
  }
  if (renderer && renderer.renderLists && typeof renderer.renderLists.dispose === 'function') {
    renderer.renderLists.dispose();
  }
  return { geometries: disposedGeo, materials: disposedMat };
}

export const LEGACY_PLANE_THRESHOLD_Y = 200;

export function tagWorldEntries(entries, worldPlane) {
  if (!Array.isArray(entries)) return entries;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i]) entries[i].worldPlane = worldPlane;
  }
  return entries;
}

export function isHomeworldContext(state, fallbackY = 0) {
  if (fallbackY > LEGACY_PLANE_THRESHOLD_Y) return true;
  if (state && typeof state.activeWorldPlane === 'string') {
    return state.activeWorldPlane === 'homeworld';
  }
  return false;
}

export function isHomeworldCollider(col) {
  if (col && typeof col.worldPlane === 'string') {
    return col.worldPlane === 'homeworld';
  }
  return col?.minY !== undefined && col.minY > LEGACY_PLANE_THRESHOLD_Y;
}

/**
 * Declarative multi-world lifecycle manager:
 * Lazily mounts worlds on demand and unmounts/disposes inactive exclusive worlds
 * when transitioning to another planetary plane.
 */
export class WorldManager {
  constructor() {
    this._adapters = new Map();
    this._mounted = new Set();
    this.activeWorldId = null;
  }

  register(id, adapter) {
    this._adapters.set(id, adapter);
    return this;
  }

  isMounted(id) {
    return this._mounted.has(id);
  }

  mount(id, ctx = {}) {
    const adapter = this._adapters.get(id);
    if (!adapter) return false;
    if (!this._mounted.has(id)) {
      adapter.mount?.(ctx);
      this._mounted.add(id);
    }
    this.activeWorldId = id;
    return true;
  }

  unload(id, ctx = {}) {
    if (!this._mounted.has(id)) return false;
    const adapter = this._adapters.get(id);
    adapter?.unmount?.(ctx);
    this._mounted.delete(id);
    if (this.activeWorldId === id) {
      this.activeWorldId = null;
    }
    return true;
  }

  switchTo(id, ctx = {}, { unloadOthers = false } = {}) {
    if (unloadOthers) {
      for (const mountedId of Array.from(this._mounted)) {
        if (mountedId !== id) {
          this.unload(mountedId, ctx);
        }
      }
    }
    return this.mount(id, ctx);
  }
}
