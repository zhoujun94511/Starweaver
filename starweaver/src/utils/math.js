// Deterministic PRNG, procedural 2D value/FBM noise, and composable biome terrain height registry.
import { WORLD_CONFIG } from '../data/worldConfig.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function dist2D(x1, z1, x2, z2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return Math.hypot(dx, dz);
}

function hash2D(ix, iz) {
  let n = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2D(ix, iz);
  const b = hash2D(ix + 1, iz);
  const c = hash2D(ix, iz + 1);
  const d = hash2D(ix + 1, iz + 1);

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

export function fbm2D(x, z, octaves = 4) {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, z * frequency);
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

/**
 * Composable Biome Height Modifiers Registry.
 * Adding a new directional or diagonal sector only requires registering a pure modifier function here,
 * keeping each biome isolated without tangling orthogonal conditionals.
 */
export const BIOME_HEIGHT_MODIFIERS = [
  // East (+X > 20): Whispering Ridge gentle sandstone elevation
  function eastWhisperingRidge(x, z, h) {
    if (x <= 20) return h;
    const eastBlend = smoothstep(22, 52, x) * smoothstep(38, 12, Math.abs(z));
    return h + eastBlend * 4.2;
  },

  // South (+Z > 20): Dry Canyon sunken basin & immediate canyon side walls (scoped to |x| < 42)
  function southDryCanyon(x, z, h) {
    if (z <= 20) return h;
    const southAdvance = smoothstep(22, 36, z);
    const canyonFloor = smoothstep(26, 8, Math.abs(x));
    let nextH = h - southAdvance * canyonFloor * 2.4;
    const canyonWall =
      smoothstep(15, 28, Math.abs(x)) *
      smoothstep(42, 29, Math.abs(x)) *
      smoothstep(95, 72, z);
    nextH += southAdvance * canyonWall * 4.5;
    return nextH;
  },

  // North (-Z < -20): Basalt Geothermal Vent Terrace
  function northGeothermalField(x, z, h) {
    if (z >= -20) return h;
    const northBlend = smoothstep(-22, -45, z) * smoothstep(36, 12, Math.abs(x));
    return h + northBlend * 1.8;
  },

  // West (-X < -20): Ancient Relay Gorge & Hard-Light Chasm
  function westRelayGorge(x, z, h, bridgeExtended) {
    if (x >= -20) return h;
    const gorgeFloor = smoothstep(-22, -32, x) * smoothstep(28, 10, Math.abs(z));
    let nextH = lerp(h, 0.6, gorgeFloor * 0.75);
    // The hard-light chasm is the narrow west corridor around z=0.  Keep this
    // gate scoped to that corridor: the northwest mothership field also uses
    // x values in this range, but its crater floor must remain walkable.
    if (x < -38.5 && x > -51.5 && Math.abs(z) < 11.5) {
      const chasmDepthFactor =
        smoothstep(-38.5, -41.0, x) * smoothstep(-51.5, -49.0, x);
      if (bridgeExtended && Math.abs(z) < 3.4) {
        return 0.72;
      }
      nextH -= chasmDepthFactor * 9.5;
    }
    return nextH;
  },

  // Southeast Diagonal (+X > 12, +Z > 12): Saltstone Pass & Mirror-Flat Crystalline Salt Pan around (58, 58)
  function southeastCrystallineSaltFlats(x, z, h) {
    if (x <= 12 || z <= 12) return h;
    const uDiag = (x + z) * 0.70710678;
    const vDiag = (x - z) * 0.70710678;

    const passMask =
      smoothstep(19, 28, uDiag) *
      smoothstep(74, 56, uDiag) *
      smoothstep(10.5, 4.8, Math.abs(vDiag));
    const passTargetY = lerp(0.12, -0.55, smoothstep(26, 50, uDiag));

    const rSalt = Math.hypot(x - 58.0, z - 58.0);
    // Exact flat evaporite basin floor (y = -0.55m) across rSalt <= 18.5m so planar reflection pool never clips dunes!
    const panFlat = smoothstep(26.5, 18.5, rSalt);

    let nextH = lerp(h, passTargetY, passMask * 0.92);
    nextH = lerp(nextH, -0.55, panFlat);
    return nextH;
  },

  // Northwest Diagonal (-X < -12, -Z < -12): Mothership Wreckage Pass & Sunken Impact Crater around (-56, -56)
  function northwestMothershipGraveyard(x, z, h) {
    if (x >= -12 || z >= -12) return h;
    const uDiag = (-x - z) * 0.70710678;
    const vDiag = (-x + z) * 0.70710678;

    const passMask =
      smoothstep(19, 28, uDiag) *
      smoothstep(74, 56, uDiag) *
      smoothstep(10.5, 4.8, Math.abs(vDiag));
    const passTargetY = lerp(0.15, -0.35, smoothstep(26, 48, uDiag));

    const rWreck = Math.hypot(x + 56.0, z + 56.0);
    const craterFlat = smoothstep(25.0, 14.5, rWreck);
    const craterRim = Math.exp(-Math.pow((rWreck - 22.0) / 3.8, 2)) * 1.45 * smoothstep(5.5, 11.5, Math.abs(vDiag));

    let nextH = lerp(h, passTargetY, passMask * 0.92);
    nextH = lerp(nextH, -0.42, craterFlat * 0.88) + craterRim;
    return nextH;
  }
];

export function getTerrainHeight(x, z, bridgeExtended = true) {
  const rHub = Math.hypot(x, z);
  const hubFlat = smoothstep(14, 28, rHub);

  // Base rolling desert dunes
  let h = (fbm2D(x * 0.035 + 11.3, z * 0.035 - 4.7, 3) - 0.48) * 3.2 * hubFlat;

  // Slight crater rim ring around r ~ 23, smoothed along cardinal, southeast & northwest route passes!
  const craterRim = Math.exp(-Math.pow((rHub - 23) / 4.2, 2)) * 1.15;
  const seDiag = x > 0 && z > 0 ? Math.exp(-Math.pow(((x - z) * 0.70710678) / 5.5, 2)) : 0;
  const nwDiag = x < 0 && z < 0 ? Math.exp(-Math.pow(((-x + z) * 0.70710678) / 5.5, 2)) : 0;
  const routeCorridor =
    Math.exp(-Math.pow(z / 5.5, 2)) +
    Math.exp(-Math.pow(x / 5.5, 2)) +
    seDiag +
    nwDiag;
  h += craterRim * clamp(1 - routeCorridor * 0.85, 0.1, 1);

  for (let i = 0; i < BIOME_HEIGHT_MODIFIERS.length; i++) {
    h = BIOME_HEIGHT_MODIFIERS[i](x, z, h, bridgeExtended);
  }

  // Outer world boundary mountains driven by WORLD_CONFIG (pushed beyond diagonal sectors)
  const boundaryRise = smoothstep(
    WORLD_CONFIG.boundaryRiseInner,
    WORLD_CONFIG.boundaryRiseOuter,
    rHub
  );
  h += boundaryRise * 11.5;

  return h;
}

export function findPlatformAt(platforms, x, z, margin = 0) {
  for (let i = 0; i < platforms.length; i++) {
    const p = platforms[i];
    if (Math.hypot(x - p.x, z - p.z) <= p.radius + margin) {
      return p;
    }
  }
  return null;
}
