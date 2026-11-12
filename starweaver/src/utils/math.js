// Deterministic PRNG, procedural 2D value/FBM noise, and terrain height utilities.

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
 * Computes exact procedural ground height across Kharis desert planet:
 * - Central Crash Basin (0, 0): flat & readable hub around r < 22
 * - East Whispering Ridge (+X): gentle ascending mesa/ridge trail
 * - South Dry Canyon (+Z): sunken canyon floor flanked by red-rock walls
 * - West Ancient Relay Gorge (-X): split by a deep chasm at x in [-51, -39] bridged at z in [-4.5, 4.5]
 * - North Geothermal Vent Field (-Z): volcanic basalt terrace with warm vents
 */
export function getTerrainHeight(x, z, bridgeExtended = true) {
  const rHub = Math.hypot(x, z);
  const hubFlat = smoothstep(14, 28, rHub);

  // Base rolling desert dunes
  let h = (fbm2D(x * 0.035 + 11.3, z * 0.035 - 4.7, 3) - 0.48) * 3.2 * hubFlat;

  // Slight crater rim ring around r ~ 23
  const craterRim = Math.exp(-Math.pow((rHub - 23) / 4.2, 2)) * 1.15;
  // Keep 4 cardinal route corridors smooth through the crater rim!
  const routeCorridor =
    Math.exp(-Math.pow(z / 5.5, 2)) + // East & West corridors
    Math.exp(-Math.pow(x / 5.5, 2));  // North & South corridors
  h += craterRim * clamp(1 - routeCorridor * 0.85, 0.1, 1);

  // East Region (+X > 24): Whispering Ridge gentle elevation
  if (x > 20) {
    const eastBlend = smoothstep(22, 52, x) * smoothstep(38, 12, Math.abs(z));
    h += eastBlend * 4.2;
  }

  // South Region (+Z > 22): Dry Canyon sunken basin with side walls
  if (z > 20) {
    const southAdvance = smoothstep(22, 36, z);
    const canyonFloor = smoothstep(26, 8, Math.abs(x));
    h -= southAdvance * canyonFloor * 2.4;
    const canyonWall = smoothstep(15, 28, Math.abs(x)) * smoothstep(95, 72, z);
    h += southAdvance * canyonWall * 4.5;
  }

  // North Region (-Z < -22): Geothermal Vent Terrace
  if (z < -20) {
    const northBlend = smoothstep(-22, -45, z) * smoothstep(36, 12, Math.abs(x));
    h += northBlend * 1.8;
  }

  // West Region (-X < -22): Relay Gorge & Chasm at x in [-50, -40]
  if (x < -20) {
    const gorgeFloor = smoothstep(-22, -32, x) * smoothstep(28, 10, Math.abs(z));
    h = lerp(h, 0.6, gorgeFloor * 0.75);

    // Chasm trench centered at x = -45, width ~ 9 units
    if (x < -38.5 && x > -51.5) {
      const chasmDepthFactor =
        smoothstep(-38.5, -41.0, x) * smoothstep(-51.5, -49.0, x);
      const onBridgeDeck = bridgeExtended && Math.abs(z) < 3.4;
      if (onBridgeDeck) {
        return 0.72;
      }
      h -= chasmDepthFactor * 9.5;
    }
  }

  // Outer world boundary mountains (r > 92)
  const boundaryRise = smoothstep(88, 106, rHub);
  h += boundaryRise * 11.0;

  return h;
}
