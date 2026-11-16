import * as THREE from 'three';
import { clamp, fbm2D, lerp, mulberry32 } from '../utils/math.js';

/**
 * Procedural 3D Geological & Mineral Mesh Sculptor — 100% Offline.
 * Generates crisp faceted non-indexed geometries with baked vertex-color cavity AO
 * for stratified desert mesas, sandstone arches, craggy boulders, hexagonal terminated
 * crystal spires, host-rock ore outcrops, twisted hull wreckage, and rosette desert flora.
 */

function finalizeFacetedGeometry(indexedOrRawGeo) {
  const geo = indexedOrRawGeo.index ? indexedOrRawGeo.toNonIndexed() : indexedOrRawGeo;
  geo.computeVertexNormals();
  return geo;
}

/**
 * 1. Smoothly Sculpted High-Detail Stratified Desert Mesa / Canyon Cliff Butte
 * Uses indexed smooth vertex normals (56x28 segments) + multi-band sedimentary strata shelves
 * + deep erosion gullies + baked cavity AO vertex colors (zero blocky low-poly facets!).
 */
export function createStratifiedMesaGeometry(
  topRadius = 7,
  bottomRadius = 13,
  height = 22,
  seed = 101,
  tightSilhouette = false,
  buriedBaseOverride = null
) {
  // Horizon/canyon mesas are intentionally sunk into the procedural terrain.
  // The terrain can dip several metres across a wide cliff footprint; leaving
  // the stock cylinder cap at y=0 exposes a dark underside through those dips
  // (the visible "floating/clipping" seam).  Extend only the non-climbable
  // silhouettes below the ground while keeping the plateau top unchanged.
  const buriedBaseDepth =
    buriedBaseOverride !== null ? buriedBaseOverride : tightSilhouette ? 0 : 3.5;
  const radialSegs = 56;
  const heightSegs = 28;
  const baseGeo = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    radialSegs,
    heightSegs,
    false
  );
  baseGeo.translate(0, height * 0.5, 0);

  const rand = mulberry32(seed);
  const ox = rand() * 50;
  const oz = rand() * 50;
  const asymAngle = rand() * Math.PI * 2;

  const pos = baseGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const cTalus = new THREE.Color('#deb084');
  const cMidRock = new THREE.Color('#bd6648');
  const cWarmLayer = new THREE.Color('#e08b5c');
  const cDarkBand = new THREE.Color('#6e3326');
  const cCapRock = new THREE.Color('#e6a273');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const hNorm = clamp(y / height, 0, 1);
    const r = Math.hypot(x, z);

    if (r > 0.001) {
      // Use exact periodic cos/sin of theta so seam at theta = +-PI is 100% seamless!
      const theta = Math.atan2(z, x);
      const nx = Math.cos(theta) * 2.1 + ox;
      const nz = Math.sin(theta) * 2.1 + oz;

      const gully = fbm2D(nx * 1.5, nz * 1.5 + hNorm * 0.8, 4);
      const fineCrag = fbm2D(nx * 3.6 + 7.3, nz * 3.6 + hNorm * 2.4, 2);

      // Sharp terraced canyon shelves (smooth plateau steps)
      const terraceSteps = 6.0;
      const tScaled = hNorm * terraceSteps + gully * 0.45;
      const shelfStep = (Math.sin(tScaled * Math.PI * 2) * 0.048) * (1 - Math.pow(1 - hNorm, 2.5));

      const lobeAmp = tightSilhouette ? 0.28 : 1.0;
      const lobe =
        1.0 +
        lobeAmp * (
          0.24 * Math.cos(theta * 2 + asymAngle) +
          0.15 * Math.sin(theta * 3 - asymAngle * 0.7) +
          0.08 * Math.cos(theta * 5 + asymAngle * 1.3)
        );

      // Wide sweeping talus sand-apron on horizon cliffs; tighter tapered skirt on climbable sky-spires!
      const talusFlare =
        Math.pow(1 - clamp(hNorm / 0.34, 0, 1), 2.2) * (tightSilhouette ? 0.10 : 0.38);

      const gullyAmp = tightSilhouette ? 0.14 : 0.34;
      const baseScale = tightSilhouette ? 0.92 : 0.8;
      const dispFactor =
        lobe * (baseScale + gully * gullyAmp + (fineCrag - 0.5) * 0.06 + shelfStep + talusFlare);

      x *= dispFactor;
      z *= dispFactor;

      if (!tightSilhouette && hNorm > 0.95) {
        const capNoise = fbm2D(nx * 1.2, nz * 1.2, 2);
        y += (capNoise - 0.45) * height * 0.06;
      }

      pos.setXYZ(i, x, y, z);

      // Rich Grand-Canyon multi-band sedimentary coloring + deep gully AO
      tmp.copy(cMidRock);
      const warmWave = Math.sin(hNorm * 15.0 + gully * 1.4) * 0.5 + 0.5;
      tmp.lerp(cWarmLayer, warmWave * 0.52);

      if (hNorm < 0.3) {
        tmp.lerp(cTalus, Math.pow(1 - hNorm / 0.3, 1.4));
      } else if (hNorm > 0.88) {
        tmp.lerp(cCapRock, (hNorm - 0.88) / 0.12);
      }
      const darkSeam = Math.pow(Math.max(0, Math.sin(hNorm * 11.0 + gully * 3.2)), 2.0);
      tmp.lerp(cDarkBand, darkSeam * 0.22);

      const cavityAO = clamp(0.72 + gully * 0.42, 0.62, 1.1);
      tmp.multiplyScalar(cavityAO);
    } else {
      const capNoise = fbm2D(ox, oz, 2);
      pos.setY(i, y + (capNoise - 0.4) * height * 0.05);
      tmp.copy(cCapRock);
    }

    if (buriedBaseDepth > 0) {
      // Preserve the cap and skyline while tapering the buried extension into
      // the lower third of the wall so no hard horizontal cut is introduced.
      const buryWeight = Math.pow(1 - hNorm, 1.35);
      y -= buriedBaseDepth * buryWeight;
      pos.setY(i, y);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  baseGeo.computeVertexNormals();
  return baseGeo;
}

/**
 * 2. Sculpted Faceted Desert Boulders (Multiple Distinct Geological Archetypes)
 * - 'craggy': Angular fractured canyon rock
 * - 'slab': Tilted sedimentary desert sandstone slab
 * - 'hoodoo': Wind-carved desert pillar rock (narrower waist, broader cap)
 * - 'basalt': Hexagonal volcanic prism cluster
 */
export function createSculptedBoulderGeometry(seed = 1, style = 'craggy') {
  if (style === 'basalt') {
    return createBasaltClusterGeometry(seed);
  }

  const rand = mulberry32(seed);
  const ox = rand() * 40;
  const oz = rand() * 40;

  const baseGeo = new THREE.IcosahedronGeometry(1.0, 2);
  const pos = baseGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // Randomize 3 planar fracture directions for sharp angular rock planes
  const planes = Array.from({ length: 4 }, () =>
    new THREE.Vector3(rand() - 0.5, (rand() - 0.2) * 0.9, rand() - 0.5).normalize()
  );

  const cBase = new THREE.Color('#ffffff');
  const cShadow = new THREE.Color('#9c7662');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
    const n = fbm2D(v.x * 1.9 + ox, v.z * 1.9 + v.y * 1.3 + oz, 3);

    // Carve planar rock facets so it looks chiseled rather than lumpy potato!
    let facetCut = 1.0;
    for (const pl of planes) {
      const d = v.dot(pl);
      if (d > 0.52) {
        facetCut = Math.min(facetCut, 0.52 / d);
      }
    }

    let rScale = (0.76 + n * 0.42) * facetCut;

    if (style === 'slab') {
      v.multiply(new THREE.Vector3(1.45, 0.52, 1.15));
      // Shear slant like tilted desert bedrock strata
      v.x += v.y * 0.48;
      const step = Math.floor((v.y + 0.6) * 4.0) * 0.06;
      rScale += step;
    } else if (style === 'hoodoo') {
      v.multiply(new THREE.Vector3(0.85, 1.55, 0.85));
      // Wind-eroded narrow neck near lower-middle, wider cap on top!
      const waist = 1.0 - 0.34 * Math.exp(-Math.pow((v.y + 0.25) / 0.48, 2));
      v.x *= waist;
      v.z *= waist;
    }

    v.multiplyScalar(rScale);
    // Flatten underside slightly so boulders sit firmly in sand instead of floating spheres
    if (v.y < -0.42) {
      v.y = -0.42 + (v.y + 0.42) * 0.25;
    }

    pos.setXYZ(i, v.x, v.y, v.z);

    const ao = clamp(0.68 + (v.y + 0.5) * 0.28 + (n - 0.45) * 0.3, 0.55, 1.08);
    tmp.copy(cShadow).lerp(cBase, clamp(ao, 0, 1));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return finalizeFacetedGeometry(baseGeo);
}

/**
 * Hexagonal Volcanic Basalt Column Cluster (Merged single BufferGeometry)
 */
export function createBasaltClusterGeometry(seed = 77) {
  const rand = mulberry32(seed);
  const cols = [
    { x: 0, z: 0, r: 0.46, h: 2.3 },
    { x: 0.58, z: 0.28, r: 0.4, h: 1.65 },
    { x: -0.52, z: 0.34, r: 0.42, h: 1.85 },
    { x: 0.12, z: -0.58, r: 0.38, h: 1.35 },
    { x: -0.42, z: -0.44, r: 0.36, h: 1.1 },
    { x: 0.62, z: -0.36, r: 0.34, h: 0.95 }
  ];

  const posList = [];
  const colList = [];
  const cTop = new THREE.Color('#7a6880');
  const cSide = new THREE.Color('#4f4257');
  const cBase = new THREE.Color('#302636');
  const tmp = new THREE.Color();

  for (const c of cols) {
    const g = new THREE.CylinderGeometry(c.r * 0.96, c.r, c.h, 6, 1, false);
    // Tilt slightly for natural volcanic column splay
    g.rotateX((rand() - 0.5) * 0.1);
    g.rotateZ((rand() - 0.5) * 0.1);
    g.translate(c.x, c.h * 0.5 - 0.15, c.z);

    const ng = g.toNonIndexed();
    const p = ng.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      posList.push(vx, vy, vz);

      const hn = clamp(vy / c.h, 0, 1);
      tmp.copy(cBase).lerp(cSide, smoothLerp(0, 0.5, hn)).lerp(cTop, smoothLerp(0.7, 1.0, hn));
      colList.push(tmp.r, tmp.g, tmp.b);
    }
    g.dispose();
    ng.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(posList, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colList, 3));
  merged.computeVertexNormals();
  return merged;
}

/**
 * 3. True Hexagonal Terminated Quartz Crystal Spire Geometry!
 * Exact 6-sided prism shaft + 6-faceted asymmetric pyramid crown for crisp gemstone specular glints.
 */
export function createHexCrystalGeometry(
  radius = 0.22,
  shaftHeight = 0.72,
  crownHeight = 0.36,
  asymmetry = 0.16
) {
  const sides = 6;
  const ringBottom = [];
  const ringShoulder = [];

  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    // Slight natural face width variation so crystal looks organic
    const rVar = i % 2 === 0 ? 1.0 : 0.88;
    const bx = Math.cos(a) * radius * rVar;
    const bz = Math.sin(a) * radius * rVar;
    ringBottom.push(new THREE.Vector3(bx, 0, bz));

    // Slight taper + asymmetric shoulder height on each face!
    const shOffset = Math.sin(a * 2.0 + 0.7) * crownHeight * asymmetry;
    ringShoulder.push(
      new THREE.Vector3(bx * 0.88, shaftHeight + shOffset, bz * 0.88)
    );
  }

  const apex = new THREE.Vector3(
    radius * asymmetry * 0.35,
    shaftHeight + crownHeight,
    -radius * asymmetry * 0.25
  );
  const baseCenter = new THREE.Vector3(0, 0, 0);

  const verts = [];
  const colors = [];
  const cBase = new THREE.Color('#8cb8cc');
  const cMid = new THREE.Color('#ffffff');
  const cTip = new THREE.Color('#ffffff');

  const pushTri = (a, b, c, ca, cb, cc) => {
    verts.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    colors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b, cc.r, cc.g, cc.b);
  };

  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const b0 = ringBottom[i];
    const b1 = ringBottom[next];
    const s0 = ringShoulder[i];
    const s1 = ringShoulder[next];

    // Prism vertical quad (2 crisp triangles)
    pushTri(b0, b1, s1, cBase, cBase, cMid);
    pushTri(b0, s1, s0, cBase, cMid, cMid);

    // Terminated pyramid crown facet
    pushTri(s0, s1, apex, cMid, cMid, cTip);

    // Bottom cap
    pushTri(baseCenter, b1, b0, cBase, cBase, cBase);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 4. Sculpted Craggy Host-Rock Outcrop Bed (Replaces flat circular checker disc under resource nodes!)
 */
export function createHostRockOutcropGeometry(radius = 1.18, height = 0.46, seed = 303) {
  const rand = mulberry32(seed);
  const ox = rand() * 30;
  const oz = rand() * 30;

  const baseGeo = new THREE.CylinderGeometry(radius * 0.58, radius * 1.12, height, 14, 3, false);
  baseGeo.translate(0, height * 0.42, 0);

  const pos = baseGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSandRim = new THREE.Color('#c99268');
  const cHostRock = new THREE.Color('#6e584d');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const r = Math.hypot(x, z);

    if (r > 0.01) {
      const a = Math.atan2(z, x);
      const jag =
        0.82 +
        0.28 * Math.sin(a * 3 + ox) +
        0.18 * Math.cos(a * 5 - oz) +
        (fbm2D(x * 2.2 + ox, z * 2.2 + oz, 2) - 0.5) * 0.35;
      x *= jag;
      z *= jag;
      if (y > height * 0.35) {
        y += (fbm2D(x * 2.8 + oz, z * 2.8 + ox, 2) - 0.45) * 0.24;
      }
    } else if (y > 0.1) {
      y += 0.12;
    }

    pos.setXYZ(i, x, y, z);

    const hn = clamp(y / height, 0, 1);
    tmp.copy(cSandRim).lerp(cHostRock, clamp(hn * 1.25, 0, 1));
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  baseGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return finalizeFacetedGeometry(baseGeo);
}

/**
 * 5. Smoothly Sculpted Natural Wind-Carved Sandstone Archway (Indexed smooth normals!)
 */
export function createSandstoneArchGeometry(
  spanWidth = 14.0,
  archHeight = 8.8,
  thickness = 2.1,
  seed = 909
) {
  const arcSegs = 44;
  const radialSegs = 20;
  const rand = mulberry32(seed);
  const ox = rand() * 25;
  const oz = rand() * 25;

  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  const cTalus = new THREE.Color('#dca476');
  const cMid = new THREE.Color('#c26b4a');
  const cUpper = new THREE.Color('#d9865b');
  const cSeam = new THREE.Color('#733526');
  const tmp = new THREE.Color();

  for (let i = 0; i <= arcSegs; i++) {
    const u = i / arcSegs;
    const angle = Math.PI * (1 - u);
    const cx = Math.cos(angle) * (spanWidth * 0.5);
    const cy = Math.sin(angle) * archHeight - 0.65;

    const tx = Math.sin(angle) * (spanWidth * 0.5);
    const ty = Math.cos(angle) * archHeight;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = -ty / tLen;
    const ny = tx / tLen;

    // Flared base buttresses + graceful weathered keystone arch
    const baseFlare = Math.pow(Math.abs(u - 0.5) * 2.0, 3.0) * 0.45;
    const archTaper = 1.0 - 0.36 * Math.sin(u * Math.PI) + baseFlare;
    const rTube = thickness * archTaper;

    for (let j = 0; j <= radialSegs; j++) {
      const v = j / radialSegs;
      const phi = v * Math.PI * 2;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      const nVal = fbm2D(u * 5.5 + ox + cosP * 0.9, sinP * 0.9 + oz, 3);
      const strata = Math.sin(cy * 2.1 + nVal * 1.8) * 0.09;
      const rad = rTube * (0.84 + nVal * 0.3 + strata);

      const px = cx + nx * cosP * rad * 0.9;
      const py = cy + ny * cosP * rad * 0.9;
      const pz = sinP * rad * 1.28;

      positions.push(px, py, pz);
      uvs.push(u * 6.0, v * 2.0);

      const hn = clamp(py / archHeight, 0, 1);
      const seam = Math.pow(Math.max(0, Math.sin(py * 2.8 + nVal * 2.0)), 3.0);
      tmp.copy(cTalus)
        .lerp(cMid, clamp(hn * 1.8, 0, 1))
        .lerp(cUpper, clamp((hn - 0.55) * 2.2, 0, 1))
        .lerp(cSeam, seam * 0.48);
      tmp.multiplyScalar(clamp(0.72 + nVal * 0.42, 0.6, 1.1));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < arcSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setIndex(indices);
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

/**
 * 6. Rosette Alien Agave / Desert Succulent Geometry (Single merged BufferGeometry for Instancing!)
 * 7 curved fleshy leaves radiating around a glowing amber spore-bud core!
 */
export function createAlienAgaveGeometry() {
  const posList = [];
  const colList = [];
  const cLeafBase = new THREE.Color('#2c6e58');
  const cLeafTip = new THREE.Color('#7be0a8');
  const cCore = new THREE.Color('#ffd269');
  const tmp = new THREE.Color();

  const leafCount = 7;
  for (let k = 0; k < leafCount; k++) {
    const yaw = (k / leafCount) * Math.PI * 2;
    const tilt = 0.52 + (k % 2) * 0.22;
    const leafGeo = new THREE.ConeGeometry(0.24, 1.05, 5, 3);
    leafGeo.scale(1.0, 1.0, 0.36);
    leafGeo.translate(0, 0.5, 0);

    // Bend leaf outward gracefully
    const lp = leafGeo.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const ly = lp.getY(i);
      lp.setZ(i, lp.getZ(i) + ly * ly * 0.28);
    }
    leafGeo.rotateX(tilt);
    leafGeo.rotateY(yaw);

    const nl = leafGeo.toNonIndexed();
    const p = nl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vy = p.getY(i);
      const vz = p.getZ(i);
      posList.push(vx, vy, vz);
      tmp.copy(cLeafBase).lerp(cLeafTip, clamp(vy / 0.9, 0, 1));
      colList.push(tmp.r, tmp.g, tmp.b);
    }
    leafGeo.dispose();
    nl.dispose();
  }

  // Central glowing desert flower bud
  const bud = new THREE.OctahedronGeometry(0.22, 1);
  bud.translate(0, 0.38, 0);
  const nb = bud.index ? bud.toNonIndexed() : bud;
  const bp = nb.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    posList.push(bp.getX(i), bp.getY(i), bp.getZ(i));
    colList.push(cCore.r, cCore.g, cCore.b);
  }
  bud.dispose();
  if (nb !== bud) nb.dispose();

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posList, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colList, 3));
  geo.computeVertexNormals();
  return geo;
}

function smoothLerp(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
