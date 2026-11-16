import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  HOMEWORLD_CONFIG, HOMEWORLD_DISTRICTS, HOMEWORLD_ROUTES, HOMEWORLD_ELEVATED_PLATFORMS,
  getHomeworldGroundHeight, getHomeworldRiverZ, getHomeworldRiverSurfaceHeight, getHomeworldRouteDistance
} from '../data/homeworldData.js';
import {
  createSculptedBoulderGeometry, createHostRockOutcropGeometry, createStratifiedMesaGeometry
} from '../graphics/proceduralMeshes.js';
import { createHomeworldSurfaceMaterial } from '../graphics/homeworldMaterials.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';
import { fbm2D, mulberry32, smoothstep } from '../utils/math.js';

import { createHomeworldMountainRangeGeometry, createMountainCameraOccluders } from './homeworldMountains.js';
import { createHomeworldLeafGeometry, staticBatches } from './homeworldDistricts.js';
export { createHomeworldLeafGeometry };
import { buildDistricts, buildRiverwalk, cylinderBetween, valleyStoneGeometry, stoneBounds } from './homeworldDistricts.js';
export { createHomeworldMountainRangeGeometry, createMountainCameraOccluders };
const TAU = Math.PI * 2;
const groundY = (x, z) => getHomeworldGroundHeight(x, z) - HOMEWORLD_CONFIG.baseY;

/**
 * A support-matched meadow. Rings at the two landing-pad radii preserve the
 * actual collision ramp instead of covering it with an unrelated raised disc.
 * The render surface never displaces in the shader: feet and shadows share the
 * exact same height source as the robot controller.
 */
export function createHomeworldGroundGeometry() {
  // Refine the two river/bridge wedges rather than quadrupling the entire
  // island mesh. Every ring shares the same angular grid, so there are no
  // T-junctions or cracks at the change in density.
  const angles = [];
  for (let i = 0; i < 224; i++) {
    const a = i / 224 * TAU;
    const divisions = a > 0.75 && a < 1.30 || a > 1.60 && a < 2.20 ? 3 : 1;
    for (let j = 0; j < divisions; j++) angles.push(a + j / divisions / 224 * TAU);
  }
  angles.push(TAU);
  const segments = angles.length - 1;
  const radii = [HOMEWORLD_CONFIG.padBlendRadius];
  for (let r = 7.0; r < 24.0; r += 0.6) radii.push(r);
  for (let r = 24.0; r <= 47.0; r += 0.55) radii.push(r);
  for (let r = 48.0; r <= HOMEWORLD_CONFIG.terrainRadius; r += 1.0) radii.push(r);
  if (radii[radii.length - 1] < HOMEWORLD_CONFIG.terrainRadius) radii.push(HOMEWORLD_CONFIG.terrainRadius);
  const positions = [], uvs = [], colors = [], indices = [];
  for (const radius of radii) {
    for (let j = 0; j <= segments; j++) {
      const a = angles[j];
      const x = Math.cos(a) * radius;
      const z = HOMEWORLD_CONFIG.padCenterZ + Math.sin(a) * radius;
      positions.push(x, groundY(x, z) - 0.004, z);
      uvs.push(x * 0.38, z * 0.38);
      const routeDist = getHomeworldRouteDistance(x, z);
      let trail = 1 - smoothstep(1.15, 2.25, routeDist);
      const verge = (1 - smoothstep(1.85, 3.6, routeDist)) * (1 - trail);
      for (const district of HOMEWORLD_DISTRICTS) {
        trail = Math.max(trail, 1 - smoothstep(3.8, 5.6, Math.hypot(x - district.x, z - district.z)));
      }
      colors.push(1 + trail * 0.38, 1 + verge * 0.28, 1);
    }
  }
  for (let row = 0; row < radii.length - 1; row++) {
    for (let j = 0; j < segments; j++) {
      const a = row * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, b + 1, b, a, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.heightSource = 'getHomeworldGroundHeight';
  return geometry;
}

function meadowMaterial(pbrLibrary) {
  const material = createHomeworldSurfaceMaterial(pbrLibrary, {
    name: 'meadow-soil-surface', surface: 'sand', color: '#3b7346',
    roughness: 0.88, metalness: 0, vertexColors: true,
    normalStrength: 0.24, worldScale: 0.85, weathering: 0.08, moss: 0.28
  });
  const surfaceCompile = material.onBeforeCompile;
  const surfaceKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${surfaceKey.call(material)}_meadow_v7`;
  material.onBeforeCompile = (shader, renderer) => {
    surfaceCompile.call(material, shader, renderer);
    shader.fragmentShader = `
      float meadowHash(vec2 p) {
        p = fract(p * vec2(0.1031, 0.11369));
        p += dot(p, p.yx + 19.19);
        return fract((p.x + p.y) * p.x);
      }
      float meadowNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(meadowHash(i), meadowHash(i + vec2(1, 0)), f.x),
          mix(meadowHash(i + vec2(0, 1)), meadowHash(i + vec2(1)), f.x), f.y);
      }
      ` + shader.fragmentShader
      // Break unidirectional desert sand-ripple stripes by blending two rotated UV domains on the meadow!
      .replace(
        'vec3 hwAlbedo = texture2D(map, hwSurfaceUv).rgb;',
        `vec2 mRotA = mat2(0.82, -0.57, 0.57, 0.82) * hwSurfaceUv;
         vec2 mRotB = mat2(-0.61, 0.79, -0.79, -0.61) * (hwSurfaceUv * 0.43) + vec2(0.31, 0.17);
         vec3 hwAlbedo = mix(texture2D(map, mRotA).rgb, texture2D(map, mRotB).rgb, 0.5);`
      )
      .replace(
        'texture2D( normalMap, hwSurfaceUv )',
        'mix(texture2D( normalMap, mat2(0.82, -0.57, 0.57, 0.82) * hwSurfaceUv ), texture2D( normalMap, mat2(-0.61, 0.79, -0.79, -0.61) * (hwSurfaceUv * 0.43) ), 0.5)'
      )
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 meadowXZ = vHwWorldPosition.xz;
        float meadowMacro = meadowNoise(meadowXZ * 0.14 + 5.3);
        float meadowPatch = meadowNoise(meadowXZ * 0.42 + 15.7);
        float meadowMottle = meadowNoise(mat2(0.8, -0.6, 0.6, 0.8) * meadowXZ * 2.8);
        float meadowClover = meadowNoise(meadowXZ * 8.5 + 3.1);
        vec3 lushDeep = vec3(0.06, 0.24, 0.11);
        vec3 lushSunlit = vec3(0.14, 0.42, 0.18);
        vec3 cloverWarm = vec3(0.18, 0.48, 0.21);
        vec3 turfCol = mix(lushDeep, lushSunlit, smoothstep(0.20, 0.78, meadowPatch * 0.68 + meadowMacro * 0.32));
        turfCol = mix(turfCol, cloverWarm, smoothstep(0.56, 0.86, meadowClover) * 0.34);
        // 3D sun-facing hillock slope relief & subtle topographic terrace contours
        float hillSun = clamp(dot(normalize(vHwWorldNormal), normalize(vec3(0.52, 0.74, 0.42))) * 0.5 + 0.5, 0.0, 1.0);
        float hillContour = smoothstep(0.15, 0.85, sin((vHwWorldPosition.y - uHwSurface.w) * 4.2 + meadowMacro * 2.4) * 0.5 + 0.5);
        diffuseColor.rgb *= turfCol * (0.98 + 0.26 * hillSun) * (0.92 + 0.12 * hillContour);
        diffuseColor.rgb *= 0.88 + meadowMottle * 0.22;

        // Damp moss & shoreline pebbles along both the crystal pond and emerald riverbanks
        float meadowBankDistance = length(meadowXZ - vec2(11.4, -4.6));
        float pondBank = 1.0 - smoothstep(4.35, 5.85 + meadowMottle * 0.45, meadowBankDistance);
        float riverCenterZ = 39.0 + sin(meadowXZ.x * 0.07) * 2.0;
        float riverBank = (1.0 - smoothstep(1.5, 4.4, abs(meadowXZ.y - riverCenterZ))) * smoothstep(-40.0, -32.0, meadowXZ.x) * (1.0 - smoothstep(38.0, 46.0, meadowXZ.x));
        float wetShore = max(pondBank, riverBank * 0.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.11, 0.23, 0.16), wetShore * 0.56);

        // Flower-lined verge & sculpted limestone flagstone path along colony routes
        float meadowVerge = smoothstep(1.01, 1.24, vColor.g);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.44, 0.20), meadowVerge * 0.32);

        float meadowTrail = smoothstep(1.02, 1.32, vColor.r);
        float stoneBlock = smoothstep(0.05, 0.16, abs(fract(meadowXZ.x * 0.85 + meadowMottle * 0.12) - 0.5)) *
                           smoothstep(0.05, 0.16, abs(fract(meadowXZ.y * 0.85 - meadowMottle * 0.10) - 0.5));
        vec3 limestonePaver = mix(vec3(0.46, 0.49, 0.43), vec3(0.76, 0.78, 0.71), 0.28 + 0.72 * stoneBlock) * (0.92 + meadowMottle * 0.14);
        diffuseColor.rgb = mix(diffuseColor.rgb, limestonePaver, meadowTrail * 0.90);
      `).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        roughnessFactor = clamp(roughnessFactor * 0.74 + (0.86 + meadowMottle * 0.10) * 0.22 - wetShore * 0.18, 0.42, 0.98);
        roughnessFactor = mix(roughnessFactor, 0.72, meadowTrail * 0.78);
        vec2 meadowSlope = vec2(
          meadowNoise(meadowXZ * 9.5 + vec2(0.09, 0.0)) - meadowNoise(meadowXZ * 9.5 - vec2(0.09, 0.0)),
          meadowNoise(meadowXZ * 9.5 + vec2(0.0, 0.09)) - meadowNoise(meadowXZ * 9.5 - vec2(0.0, 0.09)));
        vec2 hummockSlope = vec2(
          meadowNoise(meadowXZ * 1.85 + vec2(0.22, 0.0)) - meadowNoise(meadowXZ * 1.85 - vec2(0.22, 0.0)),
          meadowNoise(meadowXZ * 1.85 + vec2(0.0, 0.22)) - meadowNoise(meadowXZ * 1.85 - vec2(0.0, 0.22)));
        vec2 totalSlope = meadowSlope * 0.16 + hummockSlope * 0.26;
        normal = normalize(normal + mat3(viewMatrix) * vec3(totalSlope.x, 0.0, totalSlope.y));
      `);
  };
  return material;
}


function mergeLandscapeArchitecture(parent, animatedRoots) {
  parent.updateMatrixWorld(true);
  const inverse = parent.matrixWorld.clone().invert();
  const parts = new Map();
  parent.traverse(object => {
    if (!object.isMesh || !object.name.startsWith('homeworld-static-')) return;
    for (let ancestor = object.parent; ancestor && ancestor !== parent; ancestor = ancestor.parent) {
      if (animatedRoots.has(ancestor)) return;
    }
    if (!parts.has(object.material)) parts.set(object.material, []);
    parts.get(object.material).push({ object, geo: object.geometry,
      matrix: new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld) });
  });
  const originals = new Set();
  for (const [material, entries] of parts) {
    if (entries.length < 2) continue;
    const mesh = new THREE.Mesh(mergeTransformedGeometries(entries), material);
    mesh.name = `homeworld-static-${material.name || material.type}`;
    mesh.castShadow = !material.userData.nonShadowCaster;
    mesh.receiveShadow = !material.userData.noShadowReceive;
    mesh.geometry.computeBoundingSphere();
    for (const entry of entries) {
      entry.object.removeFromParent();
      originals.add(entry.geo);
    }
    parent.add(mesh);
  }
  for (const geometry of originals) geometry.dispose();
}

function buildValleyGeology(parent, colliders, batch, m) {
  const shelves = [
    [-22, 22, 3.6, 2.8, 531], [-30, 3, 2.9, 1.9, 876], [39, -16, 3.3, 2.4, 671],
    [-4, -28, 3.0, 1.7, 419], [37, 26, 2.8, 1.65, 827],
    // Outer valley stepped foothill knolls & terraced limestone bluffs (clear of all routes, districts & welcome camera)
    [-39, -3, 4.1, 3.3, 913], [-17, -33, 3.8, 2.8, 617], [23, -29, 4.0, 3.1, 743],
    [43, -4, 3.8, 3.0, 509], [44, 21, 3.5, 2.6, 683], [-35, 28, 3.9, 3.0, 791],
    [4, -38, 3.6, 2.5, 859]
  ];
  for (const [x, z, radius, height, seed] of shelves) {
    const geometry = valleyStoneGeometry(createStratifiedMesaGeometry(radius * 0.46, radius, height, seed, true), seed);
    const bounds = stoneBounds(geometry), y = groundY(x, z) - 0.24;
    batch.add(geometry, m.rock, [x, y, z], [0, seed * 0.37, 0]);
    // Secondary upper stepped crown shelf for multi-tiered 3D hill silhouette
    const capGeo = valleyStoneGeometry(
      createStratifiedMesaGeometry(radius * 0.26, radius * 0.56, height * 0.62, seed + 37, true),
      seed + 37
    );
    const capOffX = Math.cos(seed * 0.7) * radius * 0.16;
    const capOffZ = Math.sin(seed * 0.7) * radius * 0.16;
    batch.add(capGeo, m.rock, [x + capOffX, y + height * 0.58, z + capOffZ], [0, seed * 0.83, 0]);
    colliders.push({ id: `hw_bedrock_shelf_${seed}`, x, z, radius: bounds.radius + 0.08,
      minY: HOMEWORLD_CONFIG.baseY + y + bounds.minY - 0.1,
      maxY: HOMEWORLD_CONFIG.baseY + y + bounds.maxY + height * 0.28, occluder: true });
  }
  const random = mulberry32(74832);
  const rocks = [
    valleyStoneGeometry(createSculptedBoulderGeometry(718, 'craggy'), 718),
    valleyStoneGeometry(createSculptedBoulderGeometry(239, 'slab'), 239)
  ];
  const placements = [[], []];
  // Individual rocks occur in talus families and riverbank pockets. Their
  // sculpture is shared; only transforms and muted lichen colours are instanced.
  for (let i = 0; i < 38; i++) {
    const a = random() * TAU, r = i < 24 ? 25 + random() * 24 : 52 + random() * 24;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (getHomeworldRouteDistance(x, z) < 4.3 ||
      HOMEWORLD_DISTRICTS.some(d => Math.hypot(x - d.x, z - d.z) < 7.4) ||
      Math.abs(z - getHomeworldRiverZ(x)) < 6.5) continue;
    placements[i % 2].push({ x, z, s: 0.55 + random() * 0.42, yaw: random() * TAU, solid: true });
  }
  for (let i = 0; i < 22; i++) {
    const x = -32 + i * 3.2;
    if (Math.abs(x + 12) < 4.2 || Math.abs(x - 26) < 4.2 || Math.abs(x - 8) < 3.0) continue;
    const side = i % 2 ? -1 : 1;
    placements[i % 2].push({ x, z: getHomeworldRiverZ(x) + side * (1.65 + random() * 0.35),
      s: 0.32 + random() * 0.35, yaw: random() * TAU, solid: true });
  }
  const dummy = new THREE.Object3D();
  placements.forEach((items, type) => {
    const geometry = rocks[type], bounds = stoneBounds(geometry);
    const mesh = new THREE.InstancedMesh(geometry, m.rock, items.length);
    mesh.name = `homeworld-sculpted-bank-rocks-${type}`;
    items.forEach((p, i) => {
      const y = groundY(p.x, p.z) - 0.10;
      dummy.position.set(p.x, y, p.z);
      dummy.rotation.set(0.06, p.yaw, -0.035);
      dummy.scale.set(p.s * 1.10, p.s * 0.65, p.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      colliders.push({ id: `hw_valley_rock_${type}_${i}`, x: p.x, z: p.z,
        radius: bounds.radius * p.s * 1.10 + 0.08,
        minY: HOMEWORLD_CONFIG.baseY + y + bounds.minY * p.s * 0.65 - 0.10,
        maxY: HOMEWORLD_CONFIG.baseY + y + bounds.maxY * p.s * 0.65 + 0.10, occluder: true });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  });
  // Fine gravel exposes at most 18mm above the walking support. It adds a
  // silhouette and contact texture without inventing unsupported stepping tops.
  const pebble = new THREE.IcosahedronGeometry(1, 1);
  const pp = pebble.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
    const noise = 0.80 + fbm2D(x * 3.7 + 17, z * 3.7 + y * 1.3, 2) * 0.38;
    pp.setXYZ(i, x * noise, Math.max(-0.38, y * noise * 0.56), z * noise);
  }
  pebble.computeVertexNormals();
  valleyStoneGeometry(pebble, 237);
  const gravelPositions = [];
  for (let i = 0; i < 260; i++) {
    const a = random() * TAU, r = 7.2 + random() * 43;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (getHomeworldRouteDistance(x, z) < 1.8 || Math.hypot(x, z + 2.2) < 7.0 ||
      HOMEWORLD_DISTRICTS.some(d => Math.hypot(x - d.approachX, z - d.approachZ) < 1.2) ||
      Math.hypot(x - 11.4, z + 4.6) < 5.0 || Math.abs(z - getHomeworldRiverZ(x)) < 2.0) continue;
    gravelPositions.push([x, z, 0.06 + random() * 0.15, random() * TAU]);
  }
  const gravel = new THREE.InstancedMesh(pebble, m.rock, gravelPositions.length);
  gravel.name = 'homeworld-gravel-contact-layer';
  const top = stoneBounds(pebble).maxY;
  gravelPositions.forEach(([x, z, s, yaw], i) => {
    dummy.position.set(x, groundY(x, z) + 0.018 - top * s * 0.42, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(s, s * 0.42, s);
    dummy.updateMatrix();
    gravel.setMatrixAt(i, dummy.matrix);
  });
  gravel.instanceMatrix.needsUpdate = true;
  gravel.receiveShadow = true;
  gravel.computeBoundingSphere();
  parent.add(gravel);
}

function wetlandFrondGeometry() {
  const positions = [], uvs = [];
  const triangle = (a, b, c) => {
    positions.push(...a, ...b, ...c);
    uvs.push(0.5, 0, 0, 0.5, 1, 1);
  };
  for (let frond = 0; frond < 5; frond++) {
    const a = frond / 5 * TAU + Math.sin(frond * 2.7) * 0.25;
    const reach = 0.42 + (frond % 3) * 0.09, h = 0.45 + (frond % 2) * 0.12;
    // Keep the basal petiole attached to the soil. Starting only at the first
    // leaf node leaves the entire frond visibly hovering above sloped ground.
    triangle([-0.009, -0.01, 0], [0.009, -0.01, 0],
      [Math.cos(a) * reach / 7, Math.sin(Math.PI * 0.67 / 7) * h, Math.sin(a) * reach / 7]);
    for (let i = 0; i < 6; i++) {
      const t = (i + 1) / 7, nt = (i + 2) / 7;
      const x = Math.cos(a) * reach * t, z = Math.sin(a) * reach * t;
      const y = Math.sin(t * Math.PI * 0.67) * h;
      const next = [Math.cos(a) * reach * nt, Math.sin(nt * Math.PI * 0.67) * h, Math.sin(a) * reach * nt];
      triangle([x - 0.009, y, z], [x + 0.009, y, z], next);
      for (const side of [-1, 1]) {
        const direction = a + side * 1.0;
        const length = (0.06 + Math.sin(t * Math.PI) * 0.16) * (frond === 2 ? 0.75 : 1);
        const end = [x + Math.cos(direction) * length, y + 0.045, z + Math.sin(direction) * length];
        const left = [x + Math.cos(direction + 1.2) * length * 0.30, y + 0.015,
          z + Math.sin(direction + 1.2) * length * 0.30];
        const right = [x + Math.cos(direction - 1.2) * length * 0.30, y - 0.01,
          z + Math.sin(direction - 1.2) * length * 0.30];
        triangle([x, y, z], left, end);
        triangle([x, y, z], end, right);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function buildWetlandUnderstory(parent, batch, m) {
  const random = mulberry32(46178), fernPlacements = [], reedPlacements = [];
  const patches = [[-23, 13], [-24, -14], [-6, 25], [21, 26], [32, -2], [8, -14]];
  for (let i = 0; i < 150; i++) {
    const patch = patches[i % patches.length], a = random() * TAU, r = random() * 3.8;
    const x = patch[0] + Math.cos(a) * r, z = patch[1] + Math.sin(a) * r;
    if (getHomeworldRouteDistance(x, z) < 2.0 ||
      HOMEWORLD_DISTRICTS.some(d => Math.hypot(x - d.x, z - d.z) < 5.5)) continue;
    fernPlacements.push([x, z, 0.58 + random() * 0.54, random() * TAU]);
  }
  for (let i = 0; i < 180; i++) {
    const x = -33 + random() * 70;
    if (Math.abs(x + 12) < 3.7 || Math.abs(x - 26) < 3.7 || Math.abs(x - 8) < 3.0) continue;
    const z = getHomeworldRiverZ(x) + (i % 2 ? -1 : 1) * (2.9 + random() * 0.9);
    if (getHomeworldRouteDistance(x, z) < 1.7) continue;
    reedPlacements.push([x, z, 0.7 + random() * 0.65, random() * TAU]);
  }
  const fern = wetlandFrondGeometry();
  const reedPositions = [];
  for (let blade = 0; blade < 7; blade++) {
    const a = blade / 7 * TAU, r = 0.04 + (blade % 3) * 0.035;
    const h = 0.40 + (blade % 4) * 0.11;
    for (let i = 0; i < 3; i++) {
      const t = i / 3, nt = (i + 1) / 3;
      const x = Math.cos(a) * (r + t * t * 0.16), z = Math.sin(a) * (r + t * t * 0.16);
      const nx = Math.cos(a) * (r + nt * nt * 0.16), nz = Math.sin(a) * (r + nt * nt * 0.16);
      const w = (1 - t) * 0.024, nw = (1 - nt) * 0.024;
      reedPositions.push(x - w, t * h, z, x + w, t * h, z, nx + nw, nt * h, nz,
        x - w, t * h, z, nx + nw, nt * h, nz, nx - nw, nt * h, nz);
    }
  }
  const reeds = new THREE.BufferGeometry();
  reeds.setAttribute('position', new THREE.Float32BufferAttribute(reedPositions, 3));
  const reedUvs = [];
  for (let i = 0; i < reedPositions.length; i += 3) reedUvs.push(0.5 + reedPositions[i] * 1.4, reedPositions[i + 1] / 0.75);
  reeds.setAttribute('uv', new THREE.Float32BufferAttribute(reedUvs, 2));
  reeds.computeVertexNormals();
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  for (const [geometry, placements, name] of [[fern, fernPlacements, 'ferns'], [reeds, reedPlacements, 'river-sedges']]) {
    const mesh = new THREE.InstancedMesh(geometry, m.crop, placements.length);
    mesh.name = `homeworld-irregular-${name}`;
    placements.forEach(([x, z, s, yaw], i) => {
      dummy.position.set(x, groundY(x, z) - 0.005, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(s, s * (0.85 + i % 3 * 0.08), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(i % 5 === 0 ? '#1b542d' : i % 2 ? '#29703c' : '#3a8848'));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    parent.add(mesh);
  }

  // Mid-layer 3D emerald meadow shrubs on open slopes (clear of routes, plaza & welcome sightlines)
  const shrubPositions = [];
  for (let i = 0; i < 160 && shrubPositions.length < 76; i++) {
    const a = random() * TAU, r = 13.5 + random() * 38.0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (getHomeworldRouteDistance(x, z) < 2.4 || Math.hypot(x, z - 2.2) < 12.5 ||
      HOMEWORLD_DISTRICTS.some(d => Math.hypot(x - d.approachX, z - d.approachZ) < 2.6) ||
      Math.hypot(x - 11.4, z + 4.6) < 5.6 || Math.abs(z - getHomeworldRiverZ(x)) < 3.2) continue;
    shrubPositions.push([x, z, 0.48 + random() * 0.42, random() * TAU]);
  }
  const shrubGeo = new THREE.DodecahedronGeometry(0.52, 1);
  const sp = shrubGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const px = sp.getX(i), py = sp.getY(i), pz = sp.getZ(i);
    const n = 0.84 + fbm2D(px * 2.9 + 7, pz * 2.9 + py * 1.7, 2) * 0.34;
    sp.setXYZ(i, px * n * 1.18, Math.max(-0.18, py * n * 0.72), pz * n * 1.18);
  }
  shrubGeo.computeVertexNormals();
  const shrubs = new THREE.InstancedMesh(shrubGeo, m.crop, shrubPositions.length);
  shrubs.name = 'homeworld-lush-shrubs';
  shrubPositions.forEach(([x, z, s, yaw], i) => {
    dummy.position.set(x, groundY(x, z) + 0.14 * s, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(s, s * (0.78 + (i % 3) * 0.12), s);
    dummy.updateMatrix();
    shrubs.setMatrixAt(i, dummy.matrix);
    shrubs.setColorAt(i, color.set(i % 3 === 0 ? '#164d2b' : i % 3 === 1 ? '#226939' : '#2f7f44'));
  });
  shrubs.instanceMatrix.needsUpdate = true;
  shrubs.castShadow = false;
  shrubs.receiveShadow = true;
  shrubs.computeBoundingSphere();
  parent.add(shrubs);

  const fallenLeaf = createHomeworldLeafGeometry();
  for (let i = 0; i < 60; i++) {
    const patch = patches[i % patches.length], x = patch[0] + (random() - 0.5) * 4.5,
      z = patch[1] + (random() - 0.5) * 4.5;
    if (getHomeworldRouteDistance(x, z) < 1.5) continue;
    batch.add(fallenLeaf, m.crop, [x, groundY(x, z) + 0.006, z], [0, random() * TAU, 0],
      [0.12 + random() * 0.08, 0.015, 0.18 + random() * 0.18]);
  }
}

function buildGrove(parent, colliders, batch, materials) {
  const random = mulberry32(420113);
  const leafTransforms = [];
  const positions = [
    [-16.5, -1.5], [-13.5, 7.8], [-5.6, -15.2], [6.4, -14.8],
    [16.8, -0.8], [14.2, 8.6], [-17.2, -11.5], [17.5, -10.5], [0.5, 15.8],
    [-37, -12], [-25, -25], [-36, -28], [33, 17], [39, 8], [29, 2],
    [-4, 29], [17, 29], [-7, 49],
    // Outer valley perimeter grove framing the alpine foothills (all > 4.5m clear of routes & welcome sightlines!)
    [-25.5, 7.5], [-33.5, 15.0], [-19.5, 22.5], [25.5, -14.5],
    [35.5, -6.5], [41.5, 18.5], [34.5, 31.0], [-22.5, 36.5],
    [18.5, 48.0], [-25.0, 46.5],
    // Gateway & outer meadow tree framing (r = 54..74, clear of platforms & aerial rings!)
    [-16.5, -64.5], [16.5, -64.5], [-29.0, -56.0], [29.0, -56.0],
    [-11.0, -73.0], [11.0, -73.0], [-56.0, 10.0], [58.0, -16.0],
    [-48.0, 42.0], [24.0, 62.0], [-24.0, 62.0], [4.0, 68.0]
  ];
  const canopyPalettes = [
    ['#0f3d23', '#195732', '#267342', '#3a8f52'],
    ['#114424', '#1e6036', '#2c7d45', '#449956'],
    ['#134832', '#1d6245', '#2a7c58', '#429a6d'],
    ['#154626', '#215f33', '#2f7a44', '#499453']
  ];
  const burlGeo = new THREE.DodecahedronGeometry(0.18, 1);
  const treeCanopies = positions.map(([x, z], index) => ({ id: `hw_tree_canopy_${index}`,
    x, z, radius: 0, minY: Infinity, maxY: -Infinity }));
  for (let index = 0; index < positions.length; index++) {
    const [x, z] = positions[index];
    const base = groundY(x, z);
    const h = 3.8 + random() * 1.25;
    const bend = 0.18 + random() * 0.18;
    const root = [x, base - 0.04, z];
    const joint = [x + bend, base + h * 0.44, z - 0.14];
    const crown = [x - 0.06, base + h * 0.86, z + 0.10];
    cylinderBetween(batch, materials.bark, root, joint, 0.34, 0.21, 8);
    cylinderBetween(batch, materials.bark, joint, crown, 0.21, 0.075, 7);
    // 3D organic bark collar burls at primary trunk forks
    batch.add(burlGeo, materials.bark, joint, [index * 0.4, index * 0.9, 0], [1.18, 0.82, 1.12]);
    batch.add(burlGeo, materials.bark, crown, [0.3, index * 0.6, 0.2], [0.72, 0.58, 0.72]);
    for (let r = 0; r < 5; r++) {
      const a = r / 5 * TAU + index;
      cylinderBetween(batch, materials.bark, [x + Math.cos(a) * 0.64, base - 0.02, z + Math.sin(a) * 0.64],
        [x + bend * 0.4, base + 0.68, z - 0.05], 0.065, 0.155, 6);
    }
    const pal = canopyPalettes[index % canopyPalettes.length];
    for (let limb = 0; limb < 7; limb++) {
      const a = limb / 7 * TAU + index * 0.7;
      const y = base + h * (0.43 + (limb % 3) * 0.12);
      const reach = 1.28 + random() * 0.68;
      const start = [x + 0.12, y, z];
      const elbow = [x + Math.cos(a) * reach * 0.65, y + h * 0.22, z + Math.sin(a) * reach * 0.65];
      const end = [x + Math.cos(a) * reach, y + h * 0.31, z + Math.sin(a) * reach];
      cylinderBetween(batch, materials.bark, start, elbow, 0.125, 0.075, 6);
      cylinderBetween(batch, materials.bark, elbow, end, 0.075, 0.024, 5);
      // Interior sub-canopy shadow-core leaf clusters tucked along the inner limb (strictly inside outer twig envelope!)
      for (let inner = 0; inner < 4; inner++) {
        const ia = a + (inner - 1.5) * 0.52;
        leafTransforms.push({
          treeIndex: index,
          position: [
            elbow[0] * 0.65 + end[0] * 0.35 + Math.cos(ia) * 0.08,
            elbow[1] * 0.65 + end[1] * 0.35 + 0.04,
            elbow[2] * 0.65 + end[2] * 0.35 + Math.sin(ia) * 0.08
          ],
          rotation: [-0.22 + (inner % 2) * 0.32, ia, (inner - 1.5) * 0.18],
          scale: [0.88, 0.95, 0.62],
          color: pal[0]
        });
      }
      for (let twig = 0; twig < 3; twig++) {
        const t = 0.32 + twig * 0.28;
        const fan = a + (twig % 2 ? -0.72 : 0.72);
        const tip = [elbow[0] + (end[0] - elbow[0]) * t + Math.cos(fan) * 0.42,
          elbow[1] + (end[1] - elbow[1]) * t + 0.16,
          elbow[2] + (end[2] - elbow[2]) * t + Math.sin(fan) * 0.42];
        cylinderBetween(batch, materials.bark,
          [elbow[0] + (end[0] - elbow[0]) * t, elbow[1] + (end[1] - elbow[1]) * t,
            elbow[2] + (end[2] - elbow[2]) * t], tip, 0.026, 0.009, 4);
        for (let leaf = 0; leaf < 12; leaf++) {
          const angle = leaf / 12 * TAU + random() * 0.35;
          leafTransforms.push({ treeIndex: index, position: [tip[0] + Math.cos(angle) * 0.14,
            tip[1] + random() * 0.22, tip[2] + Math.sin(angle) * 0.14],
          rotation: [-0.48 + random() * 0.76, angle, (random() - 0.5) * 0.45],
          scale: [1.02 + random() * 0.38, 1, 0.64 + random() * 0.40],
          color: pal[1 + (leaf % 3)] });
        }
      }
    }
    colliders.push({ id: `hw_tree_${index}`, x, z, radius: 0.65,
      minY: HOMEWORLD_CONFIG.baseY + base - 1, maxY: HOMEWORLD_CONFIG.baseY + base + h + 0.7 });
  }
  const leaves = new THREE.InstancedMesh(createHomeworldLeafGeometry(), materials.leaf, leafTransforms.length);
  leaves.name = 'homeworld-branch-leaf-canopies';
  const dummy = new THREE.Object3D(), color = new THREE.Color(), leafVertex = new THREE.Vector3();
  const leafPositions = leaves.geometry.attributes.position;
  leafTransforms.forEach((leaf, i) => {
    dummy.position.fromArray(leaf.position);
    dummy.rotation.fromArray(leaf.rotation);
    dummy.scale.fromArray(leaf.scale);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
    leaves.setColorAt(i, color.set(leaf.color));
    const canopy = treeCanopies[leaf.treeIndex];
    for (let k = 0; k < leafPositions.count; k++) {
      leafVertex.fromBufferAttribute(leafPositions, k).applyMatrix4(dummy.matrix);
      canopy.radius = Math.max(canopy.radius, Math.hypot(leafVertex.x - canopy.x, leafVertex.z - canopy.z));
      canopy.minY = Math.min(canopy.minY, HOMEWORLD_CONFIG.baseY + leafVertex.y);
      canopy.maxY = Math.max(canopy.maxY, HOMEWORLD_CONFIG.baseY + leafVertex.y);
    }
  });
  leaves.instanceMatrix.needsUpdate = true;
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  leaves.computeBoundingSphere();
  leaves.userData.treeCanopies = treeCanopies;
  treeCanopies.forEach((canopy, index) => {
    const trunk = colliders.find(collider => collider.id === `hw_tree_${index}`);
    trunk.occluder = true;
    // Camera-only crown caps leave the .65m walking collision unchanged.
    // Bounds are measured from every transformed leaf vertex at build time;
    // a small branch margin avoids grazing twigs at the leaf envelope.
    trunk.cameraCanopy = { x: canopy.x, z: canopy.z, radius: canopy.radius + 0.10,
      minY: canopy.minY - 0.12, maxY: canopy.maxY + 0.08 };
  });
  parent.add(leaves);
  return treeCanopies;
}

function buildHabitat(parent, colliders, m) {
  const house = new THREE.Group();
  house.name = 'homeworld-survey-habitat';
  house.position.set(-10.5, 0, -7.8);
  const parts = staticBatches(house);
  const profile = [[3.0, 0.02], [3.20, 0.24], [3.22, 0.75], [3.15, 1.4],
    [2.92, 2.12], [2.48, 2.78], [1.78, 3.28], [0.8, 3.63], [0, 3.7]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  // Segmented insulated pressure shell, with narrow exposed titanium seams.
  for (let i = 0; i < 12; i++) {
    parts.add(new THREE.LatheGeometry(profile, 5, i / 12 * TAU + 0.018, TAU / 12 - 0.036), m.wall);
  }
  parts.add(new THREE.LatheGeometry(profile.map(p => new THREE.Vector2(Math.max(0, p.x - 0.025), p.y)), 64), m.dark);
  for (const y of [0.28, 1.42, 2.80]) {
    const r = y < 1 ? 3.22 : y < 2 ? 3.15 : 2.46;
    parts.add(new THREE.TorusGeometry(r, 0.045, 6, 64), m.trim, [0, y, 0], [Math.PI / 2, 0, 0]);
  }
  // External load ribs follow the real shell profile rather than decorative rings.
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    const curve = new THREE.CatmullRomCurve3(profile.slice(0, -1).map(p =>
      new THREE.Vector3(Math.cos(a) * (p.x + 0.045), p.y, Math.sin(a) * (p.x + 0.045))));
    parts.add(new THREE.TubeGeometry(curve, 18, 0.048, 5, false), m.trim);
  }
  const annexProfile = profile.map(p => new THREE.Vector2(p.x * 0.59, p.y * 0.63));
  parts.add(new THREE.LatheGeometry(annexProfile, 40), m.wall, [-3.1, 0, 2.6]);
  parts.add(new THREE.CylinderGeometry(1.9, 1.94, 0.2, 40), m.dark, [-3.1, 0.1, 2.6]);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    parts.add(new RoundedBoxGeometry(0.45, 0.58, 0.6, 2, 0.06), m.dark,
      [Math.cos(a) * 3.06, 0.29, Math.sin(a) * 3.06], [0, -a, 0]);
  }
  const entry = new THREE.Group();
  entry.position.set(2.05, 0, 2.05);
  entry.rotation.y = Math.PI / 4;
  const entryParts = staticBatches(entry);
  entryParts.add(new RoundedBoxGeometry(2.12, 2.64, 1.64, 4, 0.19), m.wall, [0, 1.32, 0]);
  entryParts.add(new RoundedBoxGeometry(1.70, 2.24, 0.11, 4, 0.13), m.dark, [0, 1.17, 0.86]);
  entryParts.add(new RoundedBoxGeometry(1.38, 1.94, 0.08, 3, 0.10), m.trim, [0, 1.14, 0.93]);
  entryParts.add(new RoundedBoxGeometry(1.19, 1.76, 0.045, 3, 0.07), m.dark, [0, 1.12, 0.98]);
  for (const x of [-0.31, 0.31]) {
    entryParts.add(new RoundedBoxGeometry(0.50, 1.57, 0.025, 3, 0.04), m.wall, [x, 1.10, 1.015]);
    entryParts.add(new RoundedBoxGeometry(0.30, 0.48, 0.025, 2, 0.05), m.window, [x, 1.52, 1.04]);
  }
  entryParts.add(new THREE.BoxGeometry(1.22, 0.045, 0.035), m.warm, [0, 2.18, 1.04]);
  entryParts.add(new RoundedBoxGeometry(0.16, 0.30, 0.04, 2, 0.03), m.dark, [0.94, 1.12, 0.91]);
  entryParts.add(new THREE.BoxGeometry(0.085, 0.075, 0.015), m.signal, [0.94, 1.18, 0.94]);
  entryParts.finish();
  house.add(entry);
  // Recessed wide observation windows with individual mullions and sun hoods.
  for (const a of [-0.7, 1.85, 2.82]) {
    const x = Math.sin(a) * 2.93, z = Math.cos(a) * 2.93;
    parts.add(new RoundedBoxGeometry(1.34, 0.81, 0.20, 3, 0.13), m.dark, [x, 1.55, z], [0, a, 0]);
    parts.add(new RoundedBoxGeometry(1.08, 0.57, 0.045, 3, 0.09), m.window,
      [x + Math.sin(a) * 0.12, 1.55, z + Math.cos(a) * 0.12], [0, a, 0]);
    parts.add(new THREE.BoxGeometry(0.035, 0.60, 0.055), m.trim,
      [x + Math.sin(a) * 0.16, 1.55, z + Math.cos(a) * 0.16], [0, a, 0]);
    parts.add(new RoundedBoxGeometry(1.51, 0.10, 0.50, 2, 0.04), m.trim, [x, 2.01, z], [0, a, 0]);
  }
  // Service equipment has legible mechanical connections: return pipes, flanged
  // housings, louvres and an inclined photovoltaic roof with individual cells.
  parts.add(new RoundedBoxGeometry(1.28, 1.3, 0.72, 3, 0.10), m.dark, [-2.9, 0.85, -1.7]);
  for (let i = 0; i < 7; i++) {
    parts.add(new THREE.BoxGeometry(1.05, 0.055, 0.13), m.trim, [-2.9, 0.48 + i * 0.13, -2.10]);
  }
  const pipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.3, 0.5, -1.7), new THREE.Vector3(-3.65, 0.5, -1.4),
    new THREE.Vector3(-3.65, 0.38, 0.7), new THREE.Vector3(-2.9, 0.38, 1.5)]);
  parts.add(new THREE.TubeGeometry(pipeCurve, 14, 0.09, 7, false), m.trim);
  const solar = new THREE.Group();
  solar.position.set(-1.1, 3.22, -1.45);
  solar.rotation.x = -0.33;
  const solarParts = staticBatches(solar);
  solarParts.add(new RoundedBoxGeometry(3.9, 0.13, 2.2, 2, 0.05), m.trim);
  for (let ix = 0; ix < 8; ix++) {
    for (let iz = 0; iz < 4; iz++) {
      solarParts.add(new THREE.BoxGeometry(0.44, 0.025, 0.48), m.solar,
        [-1.67 + ix * 0.48, 0.078, -0.78 + iz * 0.52]);
    }
  }
  solarParts.finish();
  house.add(solar);
  parts.add(new THREE.CylinderGeometry(0.085, 0.12, 2.0, 8), m.dark, [-1.2, 3.35, -1.4]);
  parts.add(new THREE.CylinderGeometry(0.09, 0.15, 5.7, 10), m.trim, [-3.2, 2.85, -3.2]);
  parts.add(new RoundedBoxGeometry(0.34, 0.37, 0.74, 3, 0.10), m.wall, [-3.2, 5.72, -3.15]);
  parts.finish();
  const rotor = new THREE.Group();
  rotor.name = 'homeworld-wind-turbine';
  rotor.position.set(-3.2, 5.72, -2.72);
  const rotorParts = staticBatches(rotor);
  rotorParts.add(new THREE.SphereGeometry(0.18, 12, 8), m.trim);
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.075, 0.12);
  bladeShape.bezierCurveTo(-0.16, 0.65, -0.28, 1.45, -0.04, 1.8);
  bladeShape.bezierCurveTo(0.07, 1.2, 0.13, 0.53, 0.075, 0.12);
  bladeShape.closePath();
  const blade = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.025, bevelEnabled: true,
    bevelSegments: 1, steps: 1, bevelSize: 0.012, bevelThickness: 0.01, curveSegments: 8 });
  for (let i = 0; i < 3; i++) rotorParts.add(blade, m.wall, [0, 0, 0], [0, 0, i * TAU / 3]);
  rotorParts.finish();
  house.add(rotor);
  parent.add(house);
  colliders.push({ id: 'hw_habitat_main', x: -10.5, z: -7.8, radius: 3.55,
    minY: 419, maxY: 424, occluder: true });
  colliders.push({ id: 'hw_habitat_annex', x: -13.6, z: -5.2, radius: 1.96,
    minY: 419, maxY: 422.6, occluder: true });
  colliders.push({ id: 'hw_habitat_entry', x: -7.95, z: -5.25, radius: 1.0,
    minY: 419, maxY: 422.65, occluder: true });
  colliders.push({ id: 'hw_habitat_turbine', x: -13.7, z: -11.0, radius: 0.20,
    minY: 419, maxY: 426.0, occluder: true });
  return rotor;
}

function buildPadAndPaths(batch, m) {
  const { padRadius, padBlendRadius, padCenterZ } = HOMEWORLD_CONFIG;
  const supportY = HOMEWORLD_CONFIG.padY - HOMEWORLD_CONFIG.baseY;
  const deckY = supportY - 0.003;
  // The meadow has a real hole here. Single, disjoint top regions remove depth fighting.
  batch.add(new THREE.CircleGeometry(5.38, 96), m.pad,
    [0, deckY, padCenterZ], [-Math.PI / 2, 0, 0]);
  const rampProfile = [new THREE.Vector2(padBlendRadius, 0), new THREE.Vector2(padRadius, deckY)];
  batch.add(new THREE.LatheGeometry(rampProfile, 96), m.padLine, [0, 0, padCenterZ]);
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * TAU;
    const sector = new THREE.RingGeometry(5.38, padRadius, 12, 1, a, TAU / 16);
    batch.add(sector, i % 4 === 0 ? m.padSeam : m.padInset, [0, deckY, padCenterZ], [-Math.PI / 2, 0, 0]);
    batch.add(new THREE.BoxGeometry(0.028, 0.002, 0.60), m.padLine,
      [Math.cos(a) * 5.74, supportY - 0.001, padCenterZ + Math.sin(a) * 5.74], [0, Math.PI / 2 - a, 0]);
    if (i % 2 === 0) batch.add(new THREE.BoxGeometry(0.32, 0.002, 0.055), m.signal,
      [Math.cos(a) * 5.68, supportY - 0.001, padCenterZ + Math.sin(a) * 5.68], [0, -a, 0]);
  }
  for (const r of [4.92, 5.14]) batch.add(new THREE.RingGeometry(r, r + 0.035, 64), m.padLine,
    [0, deckY + 0.002, padCenterZ], [-Math.PI / 2, 0, 0]);
  // Stencilled touchdown brackets and short chevrons, kept below hull contact.
  for (const side of [-1, 1]) {
    batch.add(new THREE.BoxGeometry(0.07, 0.002, 1.25), m.marking, [side * 3.05, supportY - 0.001, -1.2]);
    batch.add(new THREE.BoxGeometry(0.95, 0.002, 0.07), m.marking, [side * 2.61, supportY - 0.001, -0.57]);
    for (let i = 0; i < 3; i++) batch.add(new THREE.BoxGeometry(0.12, 0.002, 0.4), m.marking,
      [side * (3.3 + i * 0.27), supportY - 0.001, 0.35], [0, -side * 0.45, 0]);
  }
  // Double-line numeral 01 formed from geometry
  for (const [x, z, w, d] of [[-0.42, 1.3, 0.5, 0.06], [-0.42, 2.1, 0.5, 0.06],
    [-0.69, 1.7, 0.06, 0.86], [-0.15, 1.7, 0.06, 0.86], [0.55, 1.7, 0.07, 0.86]]) {
    batch.add(new THREE.BoxGeometry(w, 0.002, d), m.marking, [x, supportY - 0.001, z]);
  }
  const slabs = [[-2.2, 4.2, 0.9], [-4.5, 2.8, 0.82], [-6.8, 0.5, 0.85], [-8.2, -2.2, 0.9],
    [2.6, 4.2, 0.88], [5.4, 3.2, 0.82], [7.8, 1.4, 0.85]];
  for (let i = 0; i < slabs.length; i++) {
    const [x, z, r] = slabs[i];
    batch.add(new RoundedBoxGeometry(r * 1.8, 0.12, r * 1.15, 2, 0.08), m.path,
      [x, groundY(x, z) - 0.05, z], [0, i < 4 ? -0.60 : 0.5, 0]);
    batch.add(new THREE.BoxGeometry(r * 1.3, 0.008, 0.028), m.trim,
      [x, groundY(x, z) + 0.014, z], [0, i < 4 ? -0.60 : 0.5, 0]);
  }

  // Sculpted limestone stepping-stone walkway network connecting Landing Pad -> Observatory, Nursery, Power Station & River Bridges!
  // Seated flush with terrain support (zero unsupported lip, zero blocking colliders) so routes look genuinely built & lived-in.
  const placedPavers = [];
  const routeSlabGeo = new RoundedBoxGeometry(1.42, 0.08, 0.86, 1, 0.05);
  const routeInlayGeo = new THREE.BoxGeometry(1.08, 0.005, 0.032);
  for (const route of HOMEWORLD_ROUTES) {
    for (let s = 1; s < route.length; s++) {
      const [ax, az] = route[s - 1], [bx, bz] = route[s];
      const segLen = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const steps = Math.max(1, Math.floor(segLen / 2.05));
      for (let k = 0; k < steps; k++) {
        const t = (k + 0.5) / steps;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        // Skip landing pad apron & wooden river bridge planks
        if (Math.hypot(px, pz - padCenterZ) < padBlendRadius + 1.2) continue;
        if (Math.abs(pz - getHomeworldRiverZ(px)) < 4.7 && (Math.abs(px + 12) < 2.2 || Math.abs(px - 26) < 2.2)) continue;
        if (placedPavers.some(([ox, oz]) => Math.hypot(px - ox, pz - oz) < 1.35)) continue;
        placedPavers.push([px, pz]);
        const py = groundY(px, pz);
        batch.add(routeSlabGeo, m.path, [px, py - 0.032, pz], [0, yaw, 0]);
        if (k % 2 === 0) {
          batch.add(routeInlayGeo, m.trim, [px, py + 0.011, pz], [0, yaw, 0]);
        }
      }
    }
  }
  // Circular limestone plazas around each of the 3 district consoles
  for (const dist of HOMEWORLD_DISTRICTS) {
    const py = groundY(dist.approachX, dist.approachZ);
    batch.add(new THREE.CylinderGeometry(1.85, 1.98, 0.06, 24), m.path,
      [dist.approachX, py - 0.025, dist.approachZ]);
    batch.add(new THREE.RingGeometry(1.62, 1.74, 32), m.marking,
      [dist.approachX, py + 0.008, dist.approachZ], [-Math.PI / 2, 0, 0]);
  }
}

function buildPondAndDetails(parent, colliders, batch, m) {
  const shape = new THREE.Shape();
  const bank = [];
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * TAU;
    const radius = 4.65 + Math.sin(a * 3 + 0.5) * 0.18 + Math.sin(a * 7) * 0.10;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius * 0.90;
    bank.push([11.4 + x, -4.6 + z]);
    if (i === 0) shape.moveTo(x, -z); else shape.lineTo(x, -z);
  }
  shape.closePath();
  const water = new THREE.Mesh(new THREE.ShapeGeometry(shape, 48), m.water);
  water.name = 'homeworld-rockpool';
  water.rotation.x = -Math.PI / 2;
  water.position.set(11.4, 0.012, -4.6);
  parent.add(water);
  colliders.push({ id: 'hw_pond', x: 11.4, z: -4.6, radius: 4.6, minY: 419, maxY: 422 });
  const boulder = valleyStoneGeometry(createSculptedBoulderGeometry(4831, 'slab'), 4831);
  const bankBounds = stoneBounds(boulder);
  for (let i = 0; i < bank.length; i++) {
    const [x, z] = bank[i];
    const a = i / bank.length * TAU;
    const patch = fbm2D(x * 1.3 + 7.2, z * 1.3 - 8.1, 2);
    if (patch < 0.33 || i % 3 === 1) continue;
    // Taller shore stones sit within the pond exclusion, not on the footpath.
    const sx = x - Math.cos(a) * 0.28, sz = z - Math.sin(a) * 0.28;
    const scale = 0.32 + patch * 0.47;
    batch.add(boulder, m.rock, [sx, groundY(sx, sz) - 0.015, sz],
      [0.08, a + (i % 3) * 0.4, 0.05], [scale, scale * 0.64, scale * 0.82]);
    colliders.push({ id: `hw_pond_bank_rock_${i}`, x: sx, z: sz,
      radius: bankBounds.radius * scale + 0.08, minY: 419.7,
      maxY: 420.1 + bankBounds.maxY * scale * 0.64 });
  }
  // This flush shoreline boardwalk is outside the pond collider. The old raised
  // bridge invited movement into the water exclusion and hid the robot's feet.
  const originX = 7.0, originZ = 1.3, yaw = -0.5;
  for (let i = 0; i < 11; i++) {
    const x = originX + Math.cos(yaw) * (i - 5) * 0.29;
    const z = originZ - Math.sin(yaw) * (i - 5) * 0.29;
    batch.add(new RoundedBoxGeometry(0.265, 0.12, 1.15, 2, 0.025), m.path,
      [x, groundY(x, z) - 0.045, z], [0, yaw, 0]);
  }
  for (const [x, z] of [
    [-4.2, 6.2], [4.2, 6.2], [-7.4, -1.8], [6.4, 0.8],
    // Pathside warm garden lanterns guiding along the three district avenues (all > 1.8m clear of route centerlines!)
    [-16.2, 3.6], [-24.5, -6.2], [14.8, 17.6], [28.2, 16.4], [6.2, 27.6], [-9.2, 35.8], [23.2, 35.8]
  ]) {
    const base = groundY(x, z);
    batch.add(new THREE.CylinderGeometry(0.08, 0.16, 0.16, 8), m.dark, [x, base + 0.08, z]);
    batch.add(new THREE.CylinderGeometry(0.042, 0.065, 1.12, 8), m.trim, [x, base + 0.65, z]);
    batch.add(new RoundedBoxGeometry(0.26, 0.45, 0.26, 3, 0.045), m.dark, [x, base + 1.42, z]);
    batch.add(new RoundedBoxGeometry(0.20, 0.30, 0.20, 2, 0.035), m.warm, [x, base + 1.41, z]);
    for (const offset of [-0.07, 0.07]) {
      batch.add(new THREE.BoxGeometry(0.025, 0.36, 0.28), m.trim, [x + offset, base + 1.42, z]);
    }
    colliders.push({ id: `hw_lantern_${x}_${z}`, x, z, radius: 0.25,
      minY: HOMEWORLD_CONFIG.baseY + base - 1, maxY: HOMEWORLD_CONFIG.baseY + base + 1.65 });
  }
  return water;
}

function buildUndergrowth(parent, m) {
  const random = mulberry32(28621);
  const blade = new THREE.BufferGeometry();
  // 5-blade 3D arched grass tuft with root-to-tip vertex AO gradient
  const bladePos = [];
  const bladeUv = [];
  const bladeCol = [];
  const tuftSpecs = [
    [0.0, 0.0, 0.0, 0.036, 0.25, 0.055],
    [-0.028, 0.035, 2.1, 0.032, 0.20, 0.065],
    [0.032, -0.028, 4.2, 0.032, 0.19, 0.060],
    [-0.042, -0.032, 1.1, 0.028, 0.16, 0.075],
    [0.038, 0.036, 5.3, 0.028, 0.22, 0.070]
  ];
  for (const [ox, oz, ang, halfW, h, lean] of tuftSpecs) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const px = -sa * halfW, pz = ca * halfW;
    const mx = ox + ca * lean * 0.42, mz = oz + sa * lean * 0.42, my = h * 0.52;
    const tx = ox + ca * lean, tz = oz + sa * lean, ty = h;
    // Lower quad (2 triangles) + upper tip triangle
    bladePos.push(
      ox - px, 0, oz - pz,
      ox + px, 0, oz + pz,
      mx + px * 0.68, my, mz + pz * 0.68,
      ox - px, 0, oz - pz,
      mx + px * 0.68, my, mz + pz * 0.68,
      mx - px * 0.68, my, mz - pz * 0.68,
      mx - px * 0.68, my, mz - pz * 0.68,
      mx + px * 0.68, my, mz + pz * 0.68,
      tx, ty, tz
    );
    bladeUv.push(
      0, 0, 1, 0, 1, 0.52,
      0, 0, 1, 0.52, 0, 0.52,
      0, 0.52, 1, 0.52, 0.5, 1
    );
    const rootC = [0.54, 0.64, 0.52];
    const midC = [0.88, 0.96, 0.82];
    const tipC = [1.16, 1.20, 0.92];
    bladeCol.push(
      ...rootC, ...rootC, ...midC,
      ...rootC, ...midC, ...midC,
      ...midC, ...midC, ...tipC
    );
  }
  blade.setAttribute('position', new THREE.Float32BufferAttribute(bladePos, 3));
  blade.setAttribute('uv', new THREE.Float32BufferAttribute(bladeUv, 2));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(bladeCol, 3));
  blade.computeVertexNormals();
  const transforms = [];
  for (let i = 0; i < 4200; i++) {
    const a = random() * TAU;
    const r = i < 900 ? 7.1 + random() * 18.5 : Math.sqrt(500 + random() * 5500);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (getHomeworldRouteDistance(x, z) < 1.65 ||
      HOMEWORLD_DISTRICTS.some(d => Math.hypot(x - d.x, z - d.z) < 5.1) ||
      Math.abs(z - getHomeworldRiverZ(x)) < 3.4 ||
      Math.hypot(x, z + 2.2) < 7.0 || Math.hypot(x - 11.4, z + 4.6) < 5.2 ||
      Math.hypot(x + 10.5, z + 7.8) < 4.5 || Math.abs(z - 7.9) < 1.1 && Math.abs(x) < 5.0 ||
      Math.hypot(x - 11.8, z - 8.2) < 7.0 || Math.hypot(x - 21.2, z - 4.2) < 5.0) continue;
    transforms.push([x, groundY(x, z) + 0.002, z, random() * TAU, 0.65 + random() * 0.7]);
  }
  const grass = new THREE.InstancedMesh(blade, m.leaf, transforms.length);
  grass.name = 'homeworld-wild-meadow-tufts';
  const dummy = new THREE.Object3D(), color = new THREE.Color();
  transforms.forEach(([x, y, z, rotation, scale], i) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    grass.setMatrixAt(i, dummy.matrix);
    grass.setColorAt(i, color.set(i % 7 === 0 ? '#76b858' : i % 3 === 0 ? '#4e9654' : '#3b824c'));
  });
  grass.instanceMatrix.needsUpdate = true;
  grass.receiveShadow = true;
  grass.computeBoundingSphere();
  parent.add(grass);
}

function buildWildflowerMeadow(parent, flowerMat) {
  const random = mulberry32(88421);
  // 5-petal cupped 3D blossom cluster + green stem & basal leaves in a single BufferGeometry (1 draw call for 720 clusters!)
  const positions = [], normals = [], uvs = [], colors = [];
  const pushTri = (a, b, c, ca, cb, cc) => {
    positions.push(...a, ...b, ...c);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    uvs.push(0.5, 0, 0, 1, 1, 1);
    colors.push(...ca, ...cb, ...cc);
  };
  for (let b = 0; b < 3; b++) {
    const ba = (b / 3) * TAU + 0.4;
    const ox = Math.cos(ba) * (b === 0 ? 0.0 : 0.14);
    const oz = Math.sin(ba) * (b === 0 ? 0.0 : 0.14);
    const h = b === 0 ? 0.27 : 0.21 + (b % 2) * 0.04;
    // Slender 3D stem triangle from root to blossom calyx
    pushTri(
      [ox * 0.35 - 0.012, 0.0, oz * 0.35],
      [ox * 0.35 + 0.012, 0.0, oz * 0.35],
      [ox, h, oz],
      [0.24, 0.48, 0.24],
      [0.24, 0.48, 0.24],
      [0.42, 0.72, 0.38]
    );
    for (let p = 0; p < 5; p++) {
      const pa = (p / 5) * TAU + b * 0.5;
      const rOut = 0.092;
      const c0 = [ox, h, oz];
      const p1 = [ox + Math.cos(pa - 0.38) * rOut, h + 0.038, oz + Math.sin(pa - 0.38) * rOut];
      const p2 = [ox + Math.cos(pa + 0.38) * rOut, h + 0.038, oz + Math.sin(pa + 0.38) * rOut];
      pushTri(c0, p1, p2, [1.15, 0.92, 0.45], [1.0, 1.0, 1.0], [0.96, 0.96, 0.98]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const flowerSpots = [];
  const palette = ['#ffd45e', '#fff6df', '#72e8ff', '#ff8ca8', '#c6a1ff'];
  for (let i = 0; i < 1600 && flowerSpots.length < 720; i++) {
    const a = random() * TAU;
    const r = i < 520 ? 7.3 + random() * 20.0 : 12.0 + random() * 38.0;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const routeD = getHomeworldRouteDistance(x, z);
    if (routeD < 1.55) continue;
    // Concentrate 60% of wildflowers cheerfully along path verges, pond banks & greenhouse meadows!
    const nearVerge = routeD < 4.8 || Math.hypot(x - 11.4, z + 4.6) < 7.8 || Math.hypot(x - 21.2, z - 4.2) < 9.5;
    if (!nearVerge && random() > 0.36) continue;
    if (HOMEWORLD_DISTRICTS.some(d => Math.hypot(x - d.x, z - d.z) < 4.5)) continue;
    if (Math.abs(z - getHomeworldRiverZ(x)) < 2.8 || Math.hypot(x, z + 2.2) < 7.1 ||
        Math.hypot(x - 11.4, z + 4.6) < 5.0 || Math.hypot(x + 10.5, z + 7.8) < 4.4 ||
        Math.hypot(x - 11.8, z - 8.2) < 6.8 || Math.hypot(x - 21.2, z - 4.2) < 4.9) continue;
    flowerSpots.push([x, groundY(x, z) - 0.01, z, random() * TAU, 0.78 + random() * 0.58, palette[i % palette.length]]);
  }
  const flowers = new THREE.InstancedMesh(geo, flowerMat, flowerSpots.length);
  flowers.name = 'homeworld-wildflower-clusters';
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  flowerSpots.forEach(([x, y, z, rot, sc, hex], idx) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.setScalar(sc);
    dummy.updateMatrix();
    flowers.setMatrixAt(idx, dummy.matrix);
    flowers.setColorAt(idx, col.set(hex));
  });
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  flowers.receiveShadow = true;
  flowers.computeBoundingSphere();
  parent.add(flowers);
  return flowers;
}

function createHomeworldWaterMaterial(pbrLibrary, waterUniforms) {
  const mat = new THREE.MeshPhysicalMaterial({
    name: 'homeworld-flowing-water',
    color: '#126466',
    roughness: 0.18,
    metalness: 0.08,
    clearcoat: 0.45,
    clearcoatRoughness: 0.14,
    transparent: true,
    opacity: 0.92,
    normalMap: pbrLibrary?.sand?.normalMap || null,
    normalScale: new THREE.Vector2(0.06, 0.06)
  });
  mat.customProgramCacheKey = () => 'hw_emerald_water_v3';
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHwWaterTime = waterUniforms.uTime;
    shader.uniforms.uHwSunDir = waterUniforms.uSunDir;
    shader.uniforms.uHwSunColor = waterUniforms.uSunColor;
    shader.uniforms.uHwSunsetFactor = waterUniforms.uSunsetFactor;
    shader.uniforms.uHwNightFactor = waterUniforms.uNightFactor;
    shader.uniforms.uReflMap = waterUniforms.uReflMap;
    shader.uniforms.uReflMatrix = waterUniforms.uReflMatrix;
    shader.uniforms.uReflActive = waterUniforms.uReflActive;
    shader.vertexShader =
      `varying vec3 vWaterWorldPos;\nvarying vec2 vWaterUv;\n` +
      shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWaterUv = uv;`
      );
    shader.fragmentShader =
      `varying vec3 vWaterWorldPos;\nvarying vec2 vWaterUv;\nuniform float uHwWaterTime;\nuniform vec3 uHwSunDir;\nuniform vec3 uHwSunColor;\nuniform float uHwSunsetFactor;\nuniform float uHwNightFactor;\nuniform sampler2D uReflMap;\nuniform mat4 uReflMatrix;\nuniform float uReflActive;\n
      float hwWNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)), dot(i + vec2(1, 0), vec2(127.1, 311.7)),
          dot(i + vec2(0, 1), vec2(127.1, 311.7)), dot(i + vec2(1, 1), vec2(127.1, 311.7)))) * 43758.5453);
        return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
      }\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 wxz = vWaterWorldPos.xz;
          float flowT = uHwWaterTime;
          float w1 = hwWNoise(wxz * vec2(1.15, 1.65) + vec2(-flowT * 0.65, flowT * 0.18));
          float w2 = hwWNoise(mat2(0.8, -0.6, 0.6, 0.8) * wxz * 2.6 - vec2(flowT * 0.42, flowT * 0.31));
          float ripple = w1 * 0.6 + w2 * 0.4;

          // Shallow emerald-jade rim to deep sapphire-teal pool/channel core, tinted by sunset & starry night
          float pondR = length(wxz - vec2(11.4, -4.6));
          float isPond = step(pondR, 6.2);
          float edgeFactor = isPond > 0.5
            ? smoothstep(2.4, 4.55, pondR)
            : abs(vWaterUv.y - 0.5) * 2.0;

          vec3 deepWater = mix(vec3(0.04, 0.24, 0.32), vec3(0.14, 0.18, 0.34), uHwSunsetFactor * 0.65);
          deepWater = mix(deepWater, vec3(0.02, 0.08, 0.18), uHwNightFactor * 0.82);
          vec3 shallowJade = mix(vec3(0.11, 0.48, 0.46), vec3(0.42, 0.34, 0.40), uHwSunsetFactor * 0.55);
          shallowJade = mix(shallowJade, vec3(0.06, 0.24, 0.34), uHwNightFactor * 0.72);
          vec3 waterBase = mix(deepWater, shallowJade, smoothstep(0.15, 0.92, edgeFactor));

          // Soft whitewater foam along riverbanks & churning downstream of the waterwheel (x ~ 8.4, z ~ 39)!
          float wheelWake = (1.0 - smoothstep(0.5, 4.8, length(wxz - vec2(8.4, 39.0)))) * (1.0 - isPond);
          float bankFoam = smoothstep(0.82, 0.99, edgeFactor + (ripple - 0.5) * 0.22) * 0.36;
          float wakeFoam = smoothstep(0.42, 0.76, ripple + wheelWake * 0.45) * wheelWake * 0.64;
          float caustic = smoothstep(0.64, 0.90, ripple) * 0.12;
          // Cascading downward whitewater streaks on elevated waterfall curtain (y > 420.2)
          float isCascade = smoothstep(420.15, 421.1, vWaterWorldPos.y);
          float fallStreak = hwWNoise(vec2((vWaterWorldPos.x + vWaterWorldPos.z) * 2.8, vWaterWorldPos.y * 1.45 + uHwWaterTime * 3.8));
          float cascadeFoam = isCascade * smoothstep(0.36, 0.78, fallStreak) * 0.62;

          diffuseColor.rgb = waterBase + vec3(0.10, 0.24, 0.24) * caustic * (1.0 - uHwNightFactor * 0.5);
          vec3 foamTint = mix(vec3(0.80, 0.92, 0.94), vec3(0.95, 0.78, 0.66), uHwSunsetFactor * 0.55);
          foamTint = mix(foamTint, vec3(0.42, 0.60, 0.78), uHwNightFactor * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, foamTint, clamp(bankFoam + wakeFoam + cascadeFoam, 0.0, 0.78));
          diffuseColor.a = mix(0.92, 0.42, smoothstep(0.76, 1.0, edgeFactor) * (1.0 - isCascade));`
        )
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          {
            vec2 gUv = vWaterWorldPos.xz * 2.4 + vec2(-uHwWaterTime * 0.75, uHwWaterTime * 0.24);
            float g1 = hwWNoise(gUv) - 0.5;
            float g2 = hwWNoise(gUv * 1.9 + 4.1) - 0.5;
            vec3 ripN = normalize(vec3(g1 * 0.28, 1.0, g2 * 0.28));
            vec3 vDir = normalize(cameraPosition - vWaterWorldPos);
            vec3 sDir = normalize(uHwSunDir);
            float fresnel = pow(1.0 - max(dot(ripN, vDir), 0.0), 2.8);

            // Real-time planar mirror reflection + atmospheric sunset/starfield water sheen
            vec3 skyRefl = mix(vec3(0.58, 0.82, 0.96), vec3(1.0, 0.54, 0.36), uHwSunsetFactor);
            skyRefl = mix(skyRefl, vec3(0.10, 0.22, 0.42), uHwNightFactor);
            if (uReflActive > 0.5) {
              vec4 rc = uReflMatrix * vec4(vWaterWorldPos, 1.0);
              if (rc.w > 0.001) {
                vec2 ruv = rc.xy / rc.w + ripN.xz * 0.032;
                if (ruv.x > 0.01 && ruv.x < 0.99 && ruv.y > 0.01 && ruv.y < 0.99) {
                  vec3 sampled = texture2D(uReflMap, ruv).rgb;
                  skyRefl = mix(skyRefl, sampled, 0.86);
                }
              }
            }
            float mirrorBoost = clamp(0.08 + fresnel * 0.34 + uHwSunsetFactor * 0.10 + uHwNightFactor * 0.12, 0.0, 0.46);
            reflectedLight.indirectSpecular += skyRefl * mirrorBoost;

            float sunSparkle = pow(max(dot(ripN, normalize(sDir + vDir)), 0.0), 150.0) * (1.05 + uHwSunsetFactor * 0.65 + uHwNightFactor * 0.40);
            reflectedLight.directSpecular += uHwSunColor * sunSparkle;
          }`
        );
  };
  return mat;
}

function buildOuterValleyOutposts(colliders, batch, m) {
  // 1. Southwest Garden Pavilion (-46, 36)
  {
    const px = -46, pz = 36;
    const py = groundY(px, pz);
    batch.add(new RoundedBoxGeometry(5.8, 0.36, 4.8, 2, 0.08), m.dark, [px, py + 0.14, pz], [0, 0.45, 0]);
    for (const sx of [-2.1, 2.1]) {
      for (const sz of [-1.7, 1.7]) {
        const lx = px + sx * Math.cos(0.45) - sz * Math.sin(0.45);
        const lz = pz + sx * Math.sin(0.45) + sz * Math.cos(0.45);
        batch.add(new THREE.CylinderGeometry(0.14, 0.18, 2.9, 8), m.trim, [lx, py + 1.6, lz]);
      }
    }
    batch.add(new RoundedBoxGeometry(5.4, 0.22, 4.4, 2, 0.08), m.wall, [px, py + 3.1, pz], [0, 0.45, 0]);
    batch.add(new THREE.OctahedronGeometry(0.32, 0), m.warm, [px, py + 3.55, pz]);
    colliders.push({ id: 'hw_outer_pavilion', x: px, z: pz, radius: 3.1, minY: 419, maxY: 426, occluder: true });
  }
  // 2. Southeast Wind-Relay Outpost (54, 18)
  for (let i = 0; i < 2; i++) {
    const px = 54 + i * 6.2, pz = 18 - i * 4.5;
    const py = groundY(px, pz);
    batch.add(new RoundedBoxGeometry(2.2, 0.42, 2.2, 2, 0.06), m.dark, [px, py + 0.18, pz]);
    batch.add(new THREE.CylinderGeometry(0.24, 0.42, 5.2, 10), m.wall, [px, py + 2.8, pz]);
    batch.add(new THREE.CylinderGeometry(0.42, 0.42, 0.85, 10), m.trim, [px, py + 5.4, pz], [Math.PI / 2, 0, 0.5]);
    batch.add(new THREE.OctahedronGeometry(0.24, 0), m.signal, [px, py + 6.05, pz]);
    colliders.push({ id: `hw_outer_relay_${i}`, x: px, z: pz, radius: 1.35, minY: 419, maxY: 428, occluder: true });
  }
  // 3. Northeast Cliffside Overlook (50, -40)
  {
    const px = 50, pz = -40;
    const py = groundY(px, pz);
    batch.add(new RoundedBoxGeometry(6.4, 0.45, 5.0, 2, 0.08), m.dark, [px, py + 0.18, pz], [0, -0.65, 0]);
    batch.add(new RoundedBoxGeometry(5.4, 0.25, 4.0, 2, 0.06), m.path, [px, py + 0.44, pz], [0, -0.65, 0]);
    batch.add(new THREE.CylinderGeometry(0.18, 0.22, 1.55, 8), m.trim, [px, py + 1.25, pz]);
    batch.add(new THREE.OctahedronGeometry(0.28, 0), m.warm, [px, py + 2.22, pz]);
    colliders.push({ id: 'hw_outer_overlook', x: px, z: pz, radius: 3.7, minY: 419, maxY: 426, occluder: true });
  }
  // 4. Northwest Standing Cairn Circle (-54, -8)
  {
    const cx = -54, cz = -8;
    const cy = groundY(cx, cz);
    batch.add(new THREE.CylinderGeometry(3.2, 3.5, 0.24, 16), m.dark, [cx, cy + 0.08, cz]);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + 0.3;
      const sx = cx + Math.cos(a) * 2.6, sz = cz + Math.sin(a) * 2.6;
      const h = 1.6 + (i % 3) * 0.55;
      batch.add(new RoundedBoxGeometry(0.75, h, 0.55, 2, 0.08), m.rock, [sx, groundY(sx, sz) + h * 0.45, sz], [0, -a, 0]);
    }
    batch.add(new THREE.OctahedronGeometry(0.36, 0), m.signal, [cx, cy + 1.35, cz]);
    colliders.push({ id: 'hw_outer_cairn_hub', x: cx, z: cz, radius: 3.1, minY: 419, maxY: 425, occluder: true });
  }
}

function buildOuterAerialLandmarks(parent, colliders, batch, m, waterExcludes = null) {
  for (const plat of HOMEWORLD_ELEVATED_PLATFORMS) {
    const baseLocalY = groundY(plat.x, plat.z);
    const topLocalY = plat.topY - HOMEWORLD_CONFIG.baseY;
    // Stop rock pillar 0.42m below topLocalY so it never coplanar-overlaps deckGeo (eliminates Z-fighting!)
    const height = Math.max(2.0, topLocalY - baseLocalY + 0.9 - 0.42);
    const pillarGeo = new THREE.CylinderGeometry(plat.radius * 0.92, plat.radius * 1.18, height, 14);
    const colAttr = new Float32Array(pillarGeo.attributes.position.count * 3);
    for (let i = 0; i < pillarGeo.attributes.position.count; i++) {
      colAttr[i * 3] = 0.72;
      colAttr[i * 3 + 1] = 0.77;
      colAttr[i * 3 + 2] = 0.72;
    }
    pillarGeo.setAttribute('color', new THREE.BufferAttribute(colAttr, 3));
    batch.add(pillarGeo, m.rock, [plat.x, baseLocalY + height * 0.5 - 0.9, plat.z]);
    colliders.push({
      id: `hw_platform_pillar_${plat.id}`,
      x: plat.x,
      z: plat.z,
      radius: plat.radius * 1.14,
      minY: HOMEWORLD_CONFIG.baseY + baseLocalY - 1.2,
      maxY: plat.topY - 0.15,
      occluder: true
    });
    const deckGeo = new THREE.CylinderGeometry(plat.radius, plat.radius * 1.03, 0.42, 24);
    batch.add(deckGeo, m.path, [plat.x, topLocalY - 0.21, plat.z]);
    const rimGeo = new THREE.TorusGeometry(plat.radius * 0.94, 0.14, 8, 28);
    rimGeo.rotateX(Math.PI / 2);
    batch.add(rimGeo, m.trim, [plat.x, topLocalY + 0.04, plat.z]);
    const beaconGeo = new THREE.CylinderGeometry(0.24, 0.34, 0.95, 10);
    batch.add(beaconGeo, m.warm, [plat.x + plat.radius * 0.62, topLocalY + 0.48, plat.z - plat.radius * 0.42]);

    if (plat.id === 'hw_plat_waterfall' || plat.id === 'hw_plat_astrolabe' || plat.id === 'hw_plat_arch') {
      const steleGeo = new THREE.BoxGeometry(0.46, 1.35, 0.24);
      batch.add(steleGeo, m.dark, [plat.x, topLocalY + 0.68, plat.z]);
      const prismGeo = new THREE.OctahedronGeometry(0.24, 0);
      batch.add(prismGeo, m.signal, [plat.x, topLocalY + 1.58, plat.z]);
    }

    if (plat.id === 'hw_plat_waterfall') {
      // 3D projecting spillway chute & parabolic curved waterfall curtain outside the flared pillar!
      const dirX = -0.62;
      const dirZ = 0.785;
      const yaw = Math.atan2(dirX, dirZ);
      const lipDist = plat.radius * 1.02;
      const lipX = plat.x + dirX * lipDist;
      const lipZ = plat.z + dirZ * lipDist;
      // Stone spillway trough + raised side curbs projecting clear of the rock wall
      batch.add(new RoundedBoxGeometry(2.8, 0.34, 2.4, 2, 0.06), m.dark, [lipX, topLocalY - 0.12, lipZ], [0, yaw, 0]);
      for (const side of [-1, 1]) {
        const perpX = dirZ * side * 1.25;
        const perpZ = -dirX * side * 1.25;
        batch.add(new RoundedBoxGeometry(0.32, 0.52, 2.35, 2, 0.05), m.trim, [lipX + perpX, topLocalY + 0.08, lipZ + perpZ], [0, yaw, 0]);
      }
      // Curved 3D parabolic waterfall curtain (10x10 subdivided arc, zero intersection with pillar)
      const poolDist = plat.radius * 1.54;
      const poolCenterX = plat.x + dirX * poolDist;
      const poolCenterZ = plat.z + dirZ * poolDist;
      const poolGround = groundY(poolCenterX, poolCenterZ);
      const poolWaterY = poolGround + 0.36;
      const startY = topLocalY + 0.02;
      const dropH = Math.max(3.0, startY - poolWaterY);

      const cols = 10;
      const rows = 10;
      const fallPos = [];
      const fallUv = [];
      const fallIdx = [];
      for (let r = 0; r <= rows; r++) {
        const t = r / rows;
        // Parabolic trajectory: projects forward from spillway lip as it falls
        const forward = 0.65 + Math.pow(t, 0.75) * 2.15;
        const y = startY - Math.pow(t, 1.35) * dropH;
        const halfW = 1.05 + t * 0.45;
        const bulge = Math.sin(t * Math.PI) * 0.18;
        for (let c = 0; c <= cols; c++) {
          const u = c / cols;
          const across = (u * 2 - 1) * halfW;
          const archZ = Math.cos((u * 2 - 1) * Math.PI * 0.5) * bulge;
          const localZ = forward + archZ;
          const wx = lipX + dirX * localZ + dirZ * across;
          const wz = lipZ + dirZ * localZ - dirX * across;
          fallPos.push(wx, y, wz);
          fallUv.push(u, 1 - t);
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const a = r * (cols + 1) + c;
          const b = a + cols + 1;
          fallIdx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
      const fallGeo = new THREE.BufferGeometry();
      fallGeo.setAttribute('position', new THREE.Float32BufferAttribute(fallPos, 3));
      fallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(fallUv, 2));
      fallGeo.setIndex(fallIdx);
      fallGeo.computeVertexNormals();
      const fallMesh = new THREE.Mesh(fallGeo, m.water);
      fallMesh.name = 'hw-cascade-waterfall-curtain';
      parent.add(fallMesh);
      waterExcludes?.push(fallMesh);

      // Raised stone-rimmed plunge basin + foam splash ring
      const basinRim = new THREE.TorusGeometry(3.85, 0.42, 8, 28);
      basinRim.rotateX(Math.PI / 2);
      batch.add(basinRim, m.rock, [poolCenterX, poolGround + 0.18, poolCenterZ]);
      const poolGeo = new THREE.CircleGeometry(3.65, 28);
      poolGeo.rotateX(-Math.PI / 2);
      const poolMesh = new THREE.Mesh(poolGeo, m.water);
      poolMesh.position.set(poolCenterX, poolWaterY, poolCenterZ);
      poolMesh.name = 'hw-cascade-waterfall-pool';
      parent.add(poolMesh);
      waterExcludes?.push(poolMesh);
      const foamRing = new THREE.TorusGeometry(1.45, 0.16, 6, 22);
      foamRing.rotateX(Math.PI / 2);
      batch.add(foamRing, m.wall, [poolCenterX - dirX * 0.25, poolWaterY + 0.04, poolCenterZ - dirZ * 0.25]);
    } else if (plat.id === 'hw_plat_arch') {
      // Ceremonial Emerald North Gateway: stepped plinths, flanked energy pylons, twin-arch & suspended crest
      batch.add(new RoundedBoxGeometry(10.6, 0.45, 5.4, 2, 0.08), m.dark, [plat.x, topLocalY + 0.12, plat.z]);
      batch.add(new RoundedBoxGeometry(9.2, 0.36, 4.4, 2, 0.08), m.wall, [plat.x, topLocalY + 0.42, plat.z]);
      for (const side of [-1, 1]) {
        const px = plat.x + side * 3.15;
        batch.add(new RoundedBoxGeometry(1.75, 1.35, 2.5, 3, 0.10), m.dark, [px, topLocalY + 0.95, plat.z]);
        batch.add(new RoundedBoxGeometry(1.15, 5.4, 1.85, 3, 0.12), m.wall, [px, topLocalY + 3.4, plat.z], [0, 0, side * 0.12]);
        batch.add(new RoundedBoxGeometry(0.42, 5.9, 2.15, 2, 0.06), m.trim, [px + side * 0.45, topLocalY + 3.55, plat.z], [0, 0, side * 0.14]);
        batch.add(new THREE.BoxGeometry(0.18, 4.2, 0.22), m.signal, [px - side * 0.58, topLocalY + 3.3, plat.z + 0.55], [0, 0, side * 0.12]);
        batch.add(new THREE.BoxGeometry(0.18, 4.2, 0.22), m.signal, [px - side * 0.58, topLocalY + 3.3, plat.z - 0.55], [0, 0, side * 0.12]);
        colliders.push({
          id: `hw_arch_pylon_${side > 0 ? 'r' : 'l'}`,
          x: px,
          z: plat.z,
          radius: 1.35,
          minY: HOMEWORLD_CONFIG.baseY + topLocalY - 0.1,
          maxY: HOMEWORLD_CONFIG.baseY + topLocalY + 6.2,
          occluder: true
        });
        // Flanking approach bollards & lantern posts outside and inside the gateway
        for (const zOff of [-3.4, 3.4]) {
          const bx = plat.x + side * 4.4;
          const bz = plat.z + zOff;
          const bGround = groundY(bx, bz);
          batch.add(new RoundedBoxGeometry(0.95, 1.1, 0.95, 2, 0.08), m.dark, [bx, bGround + 0.45, bz]);
          batch.add(new THREE.CylinderGeometry(0.16, 0.22, 1.4, 8), m.trim, [bx, bGround + 1.55, bz]);
          batch.add(new THREE.OctahedronGeometry(0.24, 0), m.warm, [bx, bGround + 2.42, bz]);
          colliders.push({
            id: `hw_arch_bollard_${side > 0 ? 'r' : 'l'}_${zOff > 0 ? 's' : 'n'}`,
            x: bx,
            z: bz,
            radius: 0.65,
            minY: HOMEWORLD_CONFIG.baseY + bGround - 0.2,
            maxY: HOMEWORLD_CONFIG.baseY + bGround + 2.7
          });
        }
      }
      // Twin-layered arch lintel + central suspended star-crest medallion
      batch.add(new THREE.TorusGeometry(2.85, 0.26, 8, 28, Math.PI), m.trim, [plat.x, topLocalY + 5.35, plat.z]);
      batch.add(new THREE.TorusGeometry(2.35, 0.11, 6, 24, Math.PI), m.warm, [plat.x, topLocalY + 5.35, plat.z]);
      batch.add(new THREE.TorusGeometry(0.88, 0.08, 6, 20), m.warm, [plat.x, topLocalY + 6.55, plat.z]);
      batch.add(new THREE.OctahedronGeometry(0.42, 0), m.signal, [plat.x, topLocalY + 6.55, plat.z]);
      batch.add(new THREE.BoxGeometry(4.8, 0.08, 0.28), m.signal, [plat.x, topLocalY + 0.62, plat.z]);
    } else if (plat.id === 'hw_plat_astrolabe') {
      const astroGeo = new THREE.TorusGeometry(1.55, 0.12, 8, 24);
      batch.add(astroGeo, m.trim, [plat.x, topLocalY + 2.2, plat.z], [0.42, 0.55, 0]);
      const orbGeo = new THREE.OctahedronGeometry(0.45, 0);
      batch.add(orbGeo, m.warm, [plat.x, topLocalY + 2.2, plat.z]);
    }
  }
}

/**
 * Build-only, offline emerald-valley environment. The small return interface is
 * consumed by SpacecraftBuilder; no per-frame allocations or listeners are added.
 */
export function buildHomeworldLandscape(parent, colliders, pbrLibrary = null) {
  const mat = (name, options) => {
    if (name === 'warm-luminaire' || name === 'recessed-guidance' || name === 'botanical-sample') {
      const material = new THREE.MeshStandardMaterial(options);
      material.name = name;
      return material;
    }
    const specs = {
      'pressure-shell': ['hull_white', 0.7, 0.16, 0.10],
      'titanium-copper': ['brushed_copper', 1.4, 0.18, 0.04],
      graphite: ['titanium_dark', 1.25, 0.15, 0.05],
      'landing-deck': ['station_deck', 0.85, 0.08, 0.02],
      'deck-panels': ['station_deck', 0.85, 0.09, 0.02],
      'deck-service-panels': ['titanium_dark', 0.85, 0.12, 0.02],
      'deck-inlays': ['hull_white', 0.8, 0.06, 0],
      'walkway-limestone': ['rock', 1.15, 0.18, 0.12],
      'ochre-stencil': ['hull_white', 0.7, 0.05, 0],
      'habitat-glass': ['titanium_dark', 1.8, 0.03, 0],
      'photovoltaic-cells': ['titanium_dark', 2.0, 0.03, 0],
      'grove-bark': ['rock', 1.7, 0.18, 0.22],
      'folded-leaves': ['sand', 2.7, 0.02, 0],
      'nursery-leaves': ['sand', 2.7, 0.02, 0],
      'shore-stone': ['rock', 1.15, 0.18, 0.20],
      'weathered-valley-ridges': ['rock', 0.45, 0.20, 0.26]
    };
    const [surface, worldScale, weathering, moss] = specs[name] || ['hull_white', 0.8, 0.12, 0.04];
    const { normalMap: _normalMap, normalScale, ...properties } = options;
    return createHomeworldSurfaceMaterial(pbrLibrary, { name, surface, worldScale, weathering, moss,
      normalStrength: normalScale?.x ?? (surface === 'rock' ? 0.30 : 0.16), ...properties });
  };
  const waterUniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(38, 66, 32).normalize() },
    uSunColor: { value: new THREE.Color('#fff6df') },
    uSunsetFactor: { value: 0 },
    uNightFactor: { value: 0 },
    uReflMap: { value: null },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflActive: { value: 0 }
  };
  const m = {
    wall: mat('pressure-shell', { color: '#d4ddd6', roughness: 0.44, metalness: 0.22,
      normalMap: pbrLibrary?.hull_white?.normalMap || null, normalScale: new THREE.Vector2(0.10, 0.10) }),
    trim: mat('titanium-copper', { color: '#b09670', roughness: 0.38, metalness: 0.74 }),
    dark: mat('graphite', { color: '#243c44', roughness: 0.54, metalness: 0.58 }),
    pad: mat('landing-deck', { color: '#a8b8b8', roughness: 0.76, metalness: 0.20,
      normalMap: pbrLibrary?.hull_white?.normalMap || null, normalScale: new THREE.Vector2(0.035, 0.035) }),
    padInset: mat('deck-panels', { color: '#849e99', roughness: 0.80, metalness: 0.22 }),
    padSeam: mat('deck-service-panels', { color: '#3b5452', roughness: 0.84, metalness: 0.18 }),
    padLine: mat('deck-inlays', { color: '#8ca398', roughness: 0.84, metalness: 0.12,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    path: mat('walkway-limestone', { color: '#bfc7b8', roughness: 0.82, metalness: 0.03,
      normalMap: pbrLibrary?.rock?.normalMap || null, normalScale: new THREE.Vector2(0.12, 0.12) }),
    marking: mat('ochre-stencil', { color: '#e0cb92', roughness: 0.80, metalness: 0.06,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    warm: mat('warm-luminaire', { color: '#f7e4ba', emissive: '#ffaa44', emissiveIntensity: 0.85, roughness: 0.32 }),
    signal: mat('recessed-guidance', { color: '#8ef0ce', emissive: '#22c998', emissiveIntensity: 0.55, roughness: 0.45 }),
    window: mat('habitat-glass', { color: '#4c7d82', emissive: '#e8b86d', emissiveIntensity: 0.42, roughness: 0.16, metalness: 0.64 }),
    solar: mat('photovoltaic-cells', { color: '#244466', roughness: 0.22, metalness: 0.70 }),
    bark: mat('grove-bark', { color: '#6e5942', roughness: 0.78,
      normalMap: pbrLibrary?.rock?.normalMap || null, normalScale: new THREE.Vector2(0.62, 0.62) }),
    leaf: mat('folded-leaves', { color: '#e4eed8', roughness: 0.68, vertexColors: true, side: THREE.DoubleSide,
      normalMap: pbrLibrary?.sand?.normalMap || null, normalScale: new THREE.Vector2(0.24, 0.24) }),
    crop: mat('nursery-leaves', { color: '#64a862', roughness: 0.68, vertexColors: true, side: THREE.DoubleSide,
      normalMap: pbrLibrary?.sand?.normalMap || null, normalScale: new THREE.Vector2(0.22, 0.22) }),
    rock: mat('shore-stone', { color: '#9ea899', roughness: 0.78, vertexColors: true,
      normalMap: pbrLibrary?.rock?.normalMap || null, normalScale: new THREE.Vector2(0.58, 0.58) }),
    water: createHomeworldWaterMaterial(pbrLibrary, waterUniforms)
  };
  for (const key of ['pad', 'padInset', 'padSeam', 'padLine', 'marking', 'signal']) m[key].userData.nonShadowCaster = true;
  m.signal.userData.noShadowReceive = true;
  const meadow = new THREE.Mesh(createHomeworldGroundGeometry(), meadowMaterial(pbrLibrary));
  meadow.name = 'homeworld-support-matched-meadow';
  meadow.receiveShadow = true;
  parent.add(meadow);
  const batch = staticBatches(parent);
  const ridgeGeometry = createHomeworldMountainRangeGeometry();
  const cameraOccluders = createMountainCameraOccluders(ridgeGeometry);
  const ridges = new THREE.Mesh(ridgeGeometry,
    mat('weathered-valley-ridges', { color: '#eef2f5', roughness: 0.74, vertexColors: true,
      normalMap: pbrLibrary?.rock?.normalMap || null, normalScale: new THREE.Vector2(0.68, 0.68) }));
  ridges.name = 'homeworld-sculpted-valley-ridges';
  ridges.receiveShadow = true;
  // These background volumes are outside the walkable/shadow receiver domain;
  // rendering them again into the tight player shadow atlas wastes phone GPU.
  ridges.castShadow = false;
  parent.add(ridges);
  buildPadAndPaths(batch, m);
  const turbineRotor = buildHabitat(parent, colliders, m);
  const pondMesh = buildPondAndDetails(parent, colliders, batch, m);
  const districts = buildDistricts(parent, colliders, batch, m);
  const waterExcludes = [];
  const riverMesh = buildRiverwalk(parent, colliders, batch, m);
  if (riverMesh) waterExcludes.push(riverMesh);
  buildValleyGeology(parent, colliders, batch, m);
  buildOuterValleyOutposts(colliders, batch, m);
  buildOuterAerialLandmarks(parent, colliders, batch, m, waterExcludes);
  buildWetlandUnderstory(parent, batch, m);
  const treeCanopies = buildGrove(parent, colliders, batch, m);
  buildUndergrowth(parent, m);
  batch.finish();
  const animatedSet = new Set([turbineRotor, districts.energyRotor, districts.observatoryHoloRig, districts.nurseryBioRig]);
  mergeLandscapeArchitecture(parent, animatedSet);
  const flowerMaterial = mat('botanical-sample', { color: '#ffffff', roughness: 0.58, vertexColors: true, side: THREE.DoubleSide });
  buildWildflowerMeadow(parent, flowerMaterial);
  return { turbineRotor, flowerMaterial, waterUniforms, pondMesh, riverMesh, waterExcludes, meadow, treeCanopies, cameraOccluders, ...districts };
}
