// Authoritative homeworld plane constants.  Keep this in data so robot, camera and
// scene builders use exactly the same landing-pad seam and meadow height.
import { findPlatformAt } from '../utils/math.js';

export const HOMEWORLD_CONFIG = Object.freeze({
  baseY: 420.0,
  padY: 420.02,
  spawnX: 0,
  spawnZ: 6.9,
  padCenterX: 0.0,
  padCenterZ: -2.2,
  padRadius: 6.2,
  padBlendRadius: 6.65,
  playRadius: 82,
  terrainRadius: 98,
  // A clean crystal-air veil separates the far snow peaks from valley-side cliffs without washing out foreground turf.
  fogDensity: 0.00145
});

export const HOMEWORLD_ELEVATED_PLATFORMS = Object.freeze([
  Object.freeze({
    id: 'hw_plat_waterfall',
    x: 49,
    z: 45,
    radius: 5.0,
    topY: 420.0 + 10.2,
    style: 'terrace'
  }),
  Object.freeze({
    id: 'hw_plat_astrolabe',
    x: -54,
    z: -36,
    radius: 4.8,
    topY: 420.0 + 12.6,
    style: 'terrace'
  }),
  Object.freeze({
    id: 'hw_plat_arch',
    x: 0,
    z: -62,
    radius: 5.2,
    topY: 420.0 + 11.4,
    style: 'arch'
  }),
  Object.freeze({
    id: 'hw_plat_solarium_step',
    x: 34,
    z: -38,
    radius: 3.9,
    topY: 420.0 + 7.6,
    style: 'terrace'
  })
]);

export function getHomeworldElevatedPlatformAt(x, z, margin = 0) {
  return findPlatformAt(HOMEWORLD_ELEVATED_PLATFORMS, x, z, margin);
}

export const HOMEWORLD_UPDRAFT_THERMALS = Object.freeze([
  Object.freeze({ id: 'hw_updraft_waterfall', x: 43, z: 39, radius: 3.2, baseOffset: 0, topOffset: 22, color: '#66f7ff' }),
  Object.freeze({ id: 'hw_updraft_astrolabe', x: -41, z: -27, radius: 3.0, baseOffset: 0, topOffset: 23, color: '#ffd266' }),
  Object.freeze({ id: 'hw_updraft_arch', x: -16, z: -52, radius: 3.0, baseOffset: 0, topOffset: 22, color: '#78ffc8' }),
  Object.freeze({ id: 'hw_updraft_meadow', x: 25, z: -24, radius: 2.9, baseOffset: 0, topOffset: 19, color: '#6effb8' })
]);

export const HOMEWORLD_AERIAL_RINGS = Object.freeze([
  Object.freeze({ id: 'hw_ring_1', x: 11.4, yOffset: 11.8, z: -4.6, rotY: 0.45, radius: 2.5 }),
  Object.freeze({ id: 'hw_ring_2', x: 28.0, yOffset: 14.5, z: -26.0, rotY: 0.85, radius: 2.5 }),
  Object.freeze({ id: 'hw_ring_3', x: 0.0, yOffset: 18.6, z: -60.0, rotY: 1.57, radius: 2.7 }),
  Object.freeze({ id: 'hw_ring_4', x: -34.0, yOffset: 19.2, z: -46.0, rotY: 2.35, radius: 2.5 }),
  Object.freeze({ id: 'hw_ring_5', x: -53.0, yOffset: 20.4, z: -22.0, rotY: 3.05, radius: 2.6 }),
  Object.freeze({ id: 'hw_ring_6', x: -32.0, yOffset: 14.8, z: 16.0, rotY: 3.85, radius: 2.5 }),
  Object.freeze({ id: 'hw_ring_7', x: 14.0, yOffset: 13.6, z: 39.0, rotY: 4.55, radius: 2.5 }),
  Object.freeze({ id: 'hw_ring_8', x: 46.0, yOffset: 17.8, z: 42.0, rotY: 5.35, radius: 2.7 })
]);

export const HOMEWORLD_DISTRICTS = Object.freeze([
  Object.freeze({ id: 'observatory', x: -31, z: -19, approachX: -29.5, approachZ: -16.9 }),
  Object.freeze({ id: 'nursery', x: 31, z: 9, approachX: 28.4, approachZ: 10.6 }),
  Object.freeze({ id: 'energy', x: 8, z: 34, approachX: 8, approachZ: 31.6 })
]);

export const HOMEWORLD_ROUTES = Object.freeze([
  [[0, 6.9], [-5, 4.8], [-9, 4], [-13, 1], [-18.5, 1], [-20.5, -5], [-22, -11], [-29.5, -16.9]],
  [[0, 6.9], [0, 10.8], [3, 14.5], [3, 20.5], [12, 21], [24, 18], [28.4, 10.6]],
  [[3, 20.5], [0, 24.5], [4, 29], [8, 31.6]],
  [[8, 31.6], [1, 31], [-12, 32], [-12, 44], [8, 46], [26, 44], [26, 34], [27, 27], [24, 18]]
]);

export function getHomeworldRouteDistance(x, z) {
  let nearest = Infinity;
  for (const route of HOMEWORLD_ROUTES) {
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
      nearest = Math.min(nearest, Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t));
    }
  }
  return nearest;
}

function transition(a, b, value) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function getHomeworldRiverZ(x) {
  return 39 + Math.sin(x * 0.07) * 2;
}

function valleyHeight(x, z) {
  const radius = Math.hypot(x, z);
  const outskirts = transition(21, 29, radius);
  const observationSlope = 2.1 * Math.exp(-(((x + 31) / 16) ** 2) - ((z + 19) / 13) ** 2);
  const nurseryShelf = 0.65 * Math.exp(-(((x - 34) / 19) ** 2) - ((z - 8) / 18) ** 2);
  const riverValley = 0.5 * Math.exp(-(((x - 8) / 27) ** 2) - ((z - 39) / 13) ** 2);
  return Math.max(0, (radius - 19.5) * 0.09) + outskirts * (observationSlope + nurseryShelf - riverValley);
}

export function getHomeworldRiverSurfaceHeight(x) {
  return HOMEWORLD_CONFIG.baseY + valleyHeight(x, getHomeworldRiverZ(x)) - 0.45;
}

export function getHomeworldGroundHeight(x, z) {
  const rPad = Math.hypot(x - HOMEWORLD_CONFIG.padCenterX, z - HOMEWORLD_CONFIG.padCenterZ);
  if (rPad <= HOMEWORLD_CONFIG.padRadius) return HOMEWORLD_CONFIG.padY;
  if (rPad < HOMEWORLD_CONFIG.padBlendRadius) {
    const f = (rPad - HOMEWORLD_CONFIG.padRadius) /
      (HOMEWORLD_CONFIG.padBlendRadius - HOMEWORLD_CONFIG.padRadius);
    return HOMEWORLD_CONFIG.padY * (1 - f) + HOMEWORLD_CONFIG.baseY * f;
  }
  const channel = (1 - transition(1.2, 6.2, Math.abs(z - getHomeworldRiverZ(x)))) *
    transition(-44, -34, x) * (1 - transition(40, 49, x));
  // Both footbridges keep the bank's continuous support height. A walking robot
  // never relies on an unrelated decorative deck floating over a lower collider.
  const bridge = Math.max(1 - transition(0.95, 4.2, Math.abs(x + 12)),
    1 - transition(0.95, 4.2, Math.abs(x - 26)));
  return HOMEWORLD_CONFIG.baseY + valleyHeight(x, z) - channel * 0.68 * (1 - bridge);
}
