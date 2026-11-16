import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  HOMEWORLD_CONFIG, HOMEWORLD_DISTRICTS,
  getHomeworldGroundHeight, getHomeworldRiverZ, getHomeworldRiverSurfaceHeight, getHomeworldRouteDistance
} from '../data/homeworldData.js';
import { createHostRockOutcropGeometry, createSculptedBoulderGeometry } from '../graphics/proceduralMeshes.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';
import { fbm2D, smoothstep } from '../utils/math.js';

const TAU = Math.PI * 2;
const groundY = (x, z) => getHomeworldGroundHeight(x, z) - HOMEWORLD_CONFIG.baseY;

/** All build-time parts are merged by material, excluding the single rotor. */
export function staticBatches(parent) {
  const batches = new Map();
  return {
    add(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1) {
      if (!batches.has(material)) batches.set(material, []);
      batches.get(material).push({ geo: geometry, position, rotation, scale });
    },
    finish() {
      const originals = new Set();
      for (const [material, entries] of batches) {
        const mesh = new THREE.Mesh(mergeTransformedGeometries(entries), material);
        mesh.name = `homeworld-static-${material.name || material.type}`;
        mesh.castShadow = !material.userData.nonShadowCaster;
        mesh.receiveShadow = !material.userData.noShadowReceive;
        parent.add(mesh);
        for (const entry of entries) originals.add(entry.geo);
      }
      for (const geometry of originals) geometry.dispose();
      batches.clear();
    }
  };
}

export function cylinderBetween(batch, material, from, to, radiusA, radiusB, sides = 7) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const direction = b.clone().sub(a);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  const euler = new THREE.Euler().setFromQuaternion(quaternion);
  batch.add(new THREE.CylinderGeometry(radiusB, radiusA, direction.length(), sides), material,
    a.add(b).multiplyScalar(0.5).toArray(), [euler.x, euler.y, euler.z]);
}

export function valleyStoneGeometry(geometry, seed = 1) {
  // Reuse the desert's carved silhouettes and cavity detail, while replacing
  // its baked red sediment palette with layered 3D limestone, directional sun-facets,
  // overhang crevice occlusion, and lush emerald moss caps on upper ledges!
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const py = p.getY(i);
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const spanY = Math.max(0.2, maxY - minY);
  const colors = new Float32Array(p.count * 3);
  const limestone = new THREE.Color('#cbcbb8');
  const sunlitCrest = new THREE.Color('#e2dfd0');
  const seam = new THREE.Color('#5a635a');
  const shadowFace = new THREE.Color('#475456');
  const lichen = new THREE.Color('#54854d');
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
    const hNorm = clamp01((y - minY) / spanY);
    const grain = fbm2D(x * 2.7 + seed, z * 2.7 - seed + y * 0.8, 3);
    const layers = Math.sin(y * 11.5 + grain * 3.1) * 0.5 + 0.5;
    const sunDot = nx * 0.52 + ny * 0.66 + nz * 0.38;
    const facetSun = smoothstep(-0.48, 0.82, sunDot);
    const overhangAO = smoothstep(-0.45, 0.25, ny) * (0.72 + 0.28 * hNorm);

    color.copy(shadowFace).lerp(limestone, facetSun * 0.78 + 0.14);
    color.lerp(sunlitCrest, smoothstep(0.45, 0.92, facetSun) * hNorm * 0.45);
    color.lerp(seam, smoothstep(0.28, 0.76, layers) * 0.42);
    // Emerald moss & highland lichen carpeting upward-facing rock shelves
    const mossMask = smoothstep(0.24, 0.82, ny) * smoothstep(0.20, 0.66, grain + hNorm * 0.25);
    color.lerp(lichen, mossMask * 0.68);
    color.multiplyScalar(overhangAO * (0.74 + grain * 0.36));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function stoneBounds(geometry) {
  const p = geometry.attributes.position;
  let radius = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    radius = Math.max(radius, Math.hypot(p.getX(i), p.getZ(i)));
    minY = Math.min(minY, p.getY(i));
    maxY = Math.max(maxY, p.getY(i));
  }
  return { radius, minY, maxY };
}

function addDistrictConsole(parent, colliders, batch, m, district, x, z) {
  const y = groundY(x, z);
  const yaw = Math.atan2(district.approachX - x, district.approachZ - z);
  const local = (lx, ly, lz) => [x + Math.cos(yaw) * lx + Math.sin(yaw) * lz,
    y + ly, z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  batch.add(new RoundedBoxGeometry(0.94, 1.05, 0.58, 3, 0.10), m.dark, local(0, 0.54, 0), [0, yaw, 0]);
  batch.add(new RoundedBoxGeometry(1.05, 0.12, 0.69, 3, 0.05), m.wall, local(0, 1.11, 0), [0, yaw, 0]);
  batch.add(new RoundedBoxGeometry(0.70, 0.38, 0.035, 3, 0.04), m.window,
    local(0, 0.81, 0.31), [0, yaw, 0]);
  for (let i = 0; i < 3; i++) batch.add(new THREE.BoxGeometry(0.14, 0.025, 0.025), m.marking,
    local(-0.21 + i * 0.21, 0.51, 0.32), [0, yaw, 0]);
  batch.add(new RoundedBoxGeometry(0.80, 0.48, 0.035, 3, 0.055), m.trim,
    local(0, 0.81, 0.305), [0, yaw, 0]);
  batch.add(new RoundedBoxGeometry(0.67, 0.35, 0.025, 3, 0.035), m.window,
    local(0, 0.81, 0.335), [0, yaw, 0]);
  const bolt = new THREE.CylinderGeometry(0.018, 0.018, 0.018, 6).rotateX(Math.PI / 2);
  for (const sx of [-0.37, 0.37]) for (const sy of [0.61, 1.01]) {
    batch.add(bolt, m.dark, local(sx, sy, 0.335), [0, yaw, 0]);
  }
  for (const sx of [-0.41, 0.41]) {
    batch.add(new THREE.BoxGeometry(0.035, 0.70, 0.035), m.trim,
      local(sx, 0.53, 0.31), [0, yaw, 0]);
  }
  for (let i = 0; i < 5; i++) batch.add(new THREE.BoxGeometry(0.48, 0.025, 0.035), m.trim,
    local(0, 0.21 + i * 0.045, -0.31), [0, yaw, 0]);
  const grip = new THREE.CatmullRomCurve3([new THREE.Vector3(...local(-0.29, 0.49, 0.35)),
    new THREE.Vector3(...local(-0.22, 0.43, 0.41)), new THREE.Vector3(...local(0.22, 0.43, 0.41)),
    new THREE.Vector3(...local(0.29, 0.49, 0.35))]);
  batch.add(new THREE.TubeGeometry(grip, 12, 0.022, 6, false), m.trim);
  // Identifiable hardware interface + glowing status beacon & approach ring!
  const sigMat = m.signal.clone();
  const light = new THREE.Mesh(new RoundedBoxGeometry(0.18, 0.09, 0.035, 2, 0.015), sigMat);
  light.position.fromArray(local(0.31, 1.13, 0.36));
  light.rotation.y = yaw;
  light.name = `homeworld-activity-light-${district.id}`;
  light.userData.homeworldActivity = district.id;

  const approachY = groundY(district.approachX, district.approachZ);
  const padHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.08, 32).rotateX(-Math.PI / 2),
    sigMat
  );
  padHalo.position.set(district.approachX, approachY + 0.018, district.approachZ);
  padHalo.name = `homeworld-activity-halo-${district.id}`;

  const group = new THREE.Group();
  group.name = `homeworld-activity-${district.id}`;
  group.add(light, padHalo);
  parent.add(group);
  colliders.push({ id: `hw_console_${district.id}`, x, z, radius: 0.44,
    minY: 419 + y, maxY: 421.25 + y, occluder: true });
  return { light, padHalo, local, yaw, y };
}

function addDistrictCraftsmanship(colliders, batch, m) {
  const slab = valleyStoneGeometry(createSculptedBoulderGeometry(309, 'slab'), 309);
  const obsY = groundY(-31, -19.2);
  const footing = valleyStoneGeometry(createHostRockOutcropGeometry(0.98, 0.30, 812), 812);
  const footingBounds = stoneBounds(footing);
  batch.add(footing, m.rock, [-31, obsY - 0.09, -19.2]);
  const mount = colliders.find(c => c.id === 'hw_observatory_mount');
  mount.radius = Math.max(mount.radius, footingBounds.radius + 0.35);
  // The equatorial drive has bearing plates, a toothed fine-adjustment gear,
  // retained fasteners and a visible sealed motor, all sharing existing batches.
  for (const side of [-1, 1]) {
    const x = -31 + side * 0.64;
    batch.add(new THREE.CylinderGeometry(0.39, 0.39, 0.10, 28), m.trim,
      [x, obsY + 1.94, -19.2], [0, 0, Math.PI / 2]);
    batch.add(new THREE.CylinderGeometry(0.24, 0.24, 0.13, 20), m.dark,
      [x + side * 0.07, obsY + 1.94, -19.2], [0, 0, Math.PI / 2]);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      batch.add(new THREE.BoxGeometry(0.10, 0.075, 0.10), m.trim,
        [x, obsY + 1.94 + Math.cos(a) * 0.39, -19.2 + Math.sin(a) * 0.39], [a, 0, 0]);
    }
  }
  batch.add(new RoundedBoxGeometry(0.38, 0.46, 0.68, 3, 0.07), m.wall, [-31.65, obsY + 1.62, -19.5]);
  for (let i = 0; i < 5; i++) batch.add(new THREE.BoxGeometry(0.29, 0.025, 0.045), m.dark,
    [-31.65, obsY + 1.47 + i * 0.065, -19.13]);
  const axis = new THREE.Vector3(0, 0.95, 2.8).normalize();
  const opticalRotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis));
  const lensRing = new THREE.TorusGeometry(0.415, 0.025, 7, 40).rotateX(Math.PI / 2);
  batch.add(lensRing, m.dark, [-31, obsY + 3.02, -17.88], [opticalRotation.x, opticalRotation.y, opticalRotation.z]);
  for (const z of [-20.35, -18.55]) {
    const y = obsY + 2.05 + (z + 20.7) / 2.8 * 0.95;
    batch.add(new THREE.BoxGeometry(0.055, 0.045, 0.50), m.dark, [-30.47, y, z], [0.32, 0, 0]);
  }

  for (let row = 0; row < 3; row++) {
    const x = 31.7 + row * 1.8, z = 8.5 + row * 0.35, y = groundY(x, z);
    for (const sx of [-0.53, 0.53]) for (const sz of [-1.62, 1.62]) {
      batch.add(slab, m.rock, [x + sx, groundY(x + sx, z + sz) - 0.055, z + sz],
        [0, row + sx, 0], [0.23, 0.16, 0.29]);
    }
    for (let panel = 0; panel < 6; panel++) {
      for (const side of [-1, 1]) {
        batch.add(new THREE.BoxGeometry(0.022, 0.27, 0.050), m.dark,
          [x + side * 0.70, y + 0.19, z - 1.55 + panel * 0.62]);
        batch.add(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 6), m.trim,
          [x + side * 0.67, y + 0.36, z - 1.55 + panel * 0.62]);
      }
    }
    for (let emitter = 0; emitter < 5; emitter++) {
      batch.add(new THREE.CylinderGeometry(0.023, 0.035, 0.11, 7), m.dark,
        [x - 0.50, y + 1.16, z - 1.25 + emitter * 0.62]);
    }
    const returnPipe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + 0.55, y + 0.18, z - 1.7), new THREE.Vector3(x + 0.55, y + 0.18, z - 2.2),
      new THREE.Vector3(x - 0.55, y + 0.18, z - 2.2), new THREE.Vector3(x - 0.55, y + 0.45, z - 1.65)]);
    batch.add(new THREE.TubeGeometry(returnPipe, 14, 0.032, 7, false), m.trim);
    const bed = colliders.find(c => c.id === `hw_nursery_bed_${row}`);
    bed.radius = Math.max(bed.radius, 2.32);
  }
  const py = groundY(32.8, 5.6);
  batch.add(new THREE.CylinderGeometry(0.48, 0.48, 0.10, 20), m.trim,
    [32.8, py + 1.26, 6.05], [Math.PI / 2, 0, 0]);
  batch.add(new THREE.CylinderGeometry(0.36, 0.36, 0.115, 20), m.window,
    [32.8, py + 1.26, 6.08], [Math.PI / 2, 0, 0]);
  batch.add(new THREE.BoxGeometry(0.025, 0.23, 0.02), m.marking,
    [32.84, py + 1.29, 6.145], [0, 0, -0.55]);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    batch.add(new THREE.BoxGeometry(0.018, 0.045, 0.016), m.marking,
      [32.8 + Math.sin(a) * 0.28, py + 1.26 + Math.cos(a) * 0.28, 6.145], [0, 0, -a]);
  }

  const ey = groundY(8, 35.4);
  batch.add(new RoundedBoxGeometry(2.25, 0.19, 1.46, 3, 0.04), m.path, [8, ey + 0.07, 35.4]);
  for (const side of [-1, 1]) {
    batch.add(new RoundedBoxGeometry(0.12, 2.05, 0.16, 2, 0.035), m.trim,
      [8 + side * 0.94, ey + 1.15, 34.68]);
    for (const sz of [-0.55, 0.55]) batch.add(slab, m.rock,
      [8 + side * 0.86, groundY(8 + side * 0.86, 35.4 + sz) - 0.055, 35.4 + sz],
      [0, side, 0], [0.30, 0.18, 0.26]);
    const sx = 8 + side * 2.1, sy = groundY(sx, 35.4);
    cylinderBetween(batch, m.trim, [sx - 0.28, sy + 0.26, 35.4], [sx, sy + 1.5, 35.4], 0.035, 0.035, 6);
    cylinderBetween(batch, m.trim, [sx + 0.28, sy + 0.26, 35.4], [sx, sy + 1.5, 35.4], 0.035, 0.035, 6);
    for (let cell = 0; cell < 6; cell++) {
      const localZ = -0.84 + cell * 0.32;
      batch.add(new THREE.BoxGeometry(1.57, 0.014, 0.018), m.trim,
        [sx, sy + 2.7 + 0.057 * Math.cos(0.23) - localZ * Math.sin(0.23),
          35.4 + 0.057 * Math.sin(0.23) + localZ * Math.cos(0.23)], [0.23, 0, 0]);
    }
    const support = colliders.find(c => c.id === `hw_energy_solar_${side}`);
    support.radius = 0.38;
  }
  for (let vent = 0; vent < 9; vent++) batch.add(new THREE.BoxGeometry(1.63, 0.028, 0.12), m.dark,
    [8, ey + 2.32, 34.91 + vent * 0.12]);
  const ry = getHomeworldRiverSurfaceHeight(8) - HOMEWORLD_CONFIG.baseY;
  for (const x of [7.45, 9.35]) {
    batch.add(new THREE.TorusGeometry(0.52, 0.035, 7, 32), m.dark, [x, ry + 0.30, 39], [0, Math.PI / 2, 0]);
    for (let bolt = 0; bolt < 10; bolt++) {
      const a = bolt / 10 * TAU;
      batch.add(new THREE.CylinderGeometry(0.035, 0.035, 0.045, 6), m.dark,
        [x, ry + 0.30 + Math.cos(a) * 0.50, 39 + Math.sin(a) * 0.50], [0, 0, Math.PI / 2]);
    }
  }
  const cabinet = colliders.find(c => c.id === 'hw_energy_switchgear');
  cabinet.radius = Math.max(cabinet.radius, 1.42);
}

export function buildDistricts(parent, colliders, batch, m) {
  const activityLights = {};
  let energyStageLights = null;
  let energyRotor = null;
  const [observatory, nursery, energy] = HOMEWORLD_DISTRICTS;
  const by = groundY(observatory.x, observatory.z);
  const obs = addDistrictConsole(parent, colliders, batch, m, observatory, -30.3, -18.0);
  activityLights.observatory = obs.light;
  // Survey telescope: a tapered optical train on a braced equatorial pier,
  // separate lens baffles, drive housing and a cabled star-catalogue cabinet.
  batch.add(new THREE.CylinderGeometry(0.52, 0.82, 0.25, 16), m.dark, [-31, by + 0.12, -19.2]);
  batch.add(new THREE.CylinderGeometry(0.22, 0.38, 1.65, 12), m.trim, [-31, by + 1.02, -19.2]);
  batch.add(new RoundedBoxGeometry(1.15, 0.50, 0.78, 3, 0.13), m.dark, [-31, by + 1.94, -19.2]);
  const rear = [-31, by + 2.05, -20.7], front = [-31, by + 3.0, -17.9];
  cylinderBetween(batch, m.wall, rear, front, 0.50, 0.39, 24);
  const opticalAxis = new THREE.Vector3(...front).sub(new THREE.Vector3(...rear)).normalize();
  const opticalRotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), opticalAxis));
  for (const t of [0.10, 0.72, 0.94]) {
    batch.add(new THREE.CylinderGeometry(0.51 - t * 0.08, 0.51 - t * 0.08, 0.10, 24), m.trim,
      [rear[0], rear[1] + (front[1] - rear[1]) * t, rear[2] + (front[2] - rear[2]) * t],
      [opticalRotation.x, opticalRotation.y, opticalRotation.z]);
  }
  batch.add(new THREE.CylinderGeometry(0.345, 0.345, 0.025, 24), m.solar, front,
    [opticalRotation.x, opticalRotation.y, opticalRotation.z]);
  for (const side of [-1, 1]) {
    cylinderBetween(batch, m.trim, [-31 + side * 0.70, by + 0.12, -19.4],
      [-31 + side * 0.18, by + 1.65, -19.2], 0.06, 0.05, 6);
  }
  const obsCable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-31.4, by + 1.8, -19.5), new THREE.Vector3(-31.8, by + 0.45, -19.2),
    new THREE.Vector3(-31.3, groundY(-31.3, -18.5) + 0.05, -18.5),
    new THREE.Vector3(-30.6, obs.y + 0.15, -18.1)]);
  batch.add(new THREE.TubeGeometry(obsCable, 14, 0.035, 6, false), m.dark);
  colliders.push({ id: 'hw_observatory_mount', x: -31, z: -19.5, radius: 1.05,
    minY: 419 + by, maxY: 423.55 + by, occluder: true });
  // The engraved reference dial + stepped stone observation terrace gives the hill a grand astronomical presence!
  batch.add(new THREE.CylinderGeometry(3.55, 3.85, 0.14, 32), m.path, [-31, by - 0.05, -19.0]);
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * TAU, x = -31 + Math.cos(a) * 3.4, z = -19 + Math.sin(a) * 3.4;
    batch.add(new THREE.BoxGeometry(0.065, 0.006, i % 6 === 0 ? 0.44 : 0.20), m.marking,
      [x, groundY(x, z) + 0.022, z], [0, Math.PI / 2 - a, 0]);
  }
  // Animated Holographic Astrolabe Orrery above Observatory (unfolds & shines once Milo records the star chart!)
  const observatoryHoloRig = new THREE.Group();
  observatoryHoloRig.name = 'homeworld-observatory-orrery';
  observatoryHoloRig.position.set(-31.0, by + 3.85, -19.1);
  const orreryGoldMat = new THREE.MeshStandardMaterial({
    name: 'homeworld-orrery-gold',
    color: '#ffe285', emissive: '#ffaa22', emissiveIntensity: 1.85, roughness: 0.2, metalness: 0.4
  });
  const orreryCyanMat = new THREE.MeshStandardMaterial({
    name: 'homeworld-orrery-cyan',
    color: '#6ef7ff', emissive: '#00c8ff', emissiveIntensity: 1.9, roughness: 0.2, metalness: 0.3
  });
  const outerAstrolabe = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.032, 8, 40), orreryGoldMat);
  outerAstrolabe.rotation.x = Math.PI * 0.34;
  const innerAstrolabe = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.026, 8, 32), orreryCyanMat);
  innerAstrolabe.rotation.y = Math.PI * 0.28;
  const kharisHoloSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), orreryGoldMat);
  const kharisHoloRing = new THREE.Mesh(new THREE.RingGeometry(0.30, 0.44, 28), orreryCyanMat);
  kharisHoloRing.rotation.x = Math.PI * 0.42;
  kharisHoloSphere.add(kharisHoloRing);
  observatoryHoloRig.add(outerAstrolabe, innerAstrolabe, kharisHoloSphere);
  observatoryHoloRig.visible = false;
  parent.add(observatoryHoloRig);

  const nurse = addDistrictConsole(parent, colliders, batch, m, nursery, 29.5, 9.7);
  activityLights.nursery = nurse.light;
  const leaf = createHomeworldLeafGeometry();
  for (let row = 0; row < 3; row++) {
    const x = 31.7 + row * 1.8, z = 8.5 + row * 0.35;
    const base = groundY(x, z);
    batch.add(new RoundedBoxGeometry(1.38, 0.38, 3.8, 3, 0.09), m.wall, [x, base + 0.19, z]);
    batch.add(new RoundedBoxGeometry(1.16, 0.04, 3.54, 2, 0.05), m.bark, [x, base + 0.39, z]);
    for (let plant = 0; plant < 6; plant++) {
      for (let petal = 0; petal < 7; petal++) batch.add(leaf, m.crop,
        [x + (plant % 2 ? 0.30 : -0.30), base + 0.41, z - 1.24 + Math.floor(plant / 2) * 1.2],
        [-0.85, petal / 7 * TAU + row, 0], [0.66, 0.72, 0.68 + row * 0.06]);
    }
    // Overhead drip-rails, couplings and return lines connect each grow bed to
    // the working pump, rather than floating decorative foliage over the lawn.
    cylinderBetween(batch, m.trim, [x - 0.50, base + 0.40, z - 1.55],
      [x - 0.50, base + 1.22, z - 1.55], 0.027, 0.027, 6);
    cylinderBetween(batch, m.trim, [x - 0.50, base + 1.22, z - 1.55],
      [x - 0.50, base + 1.22, z + 1.55], 0.027, 0.027, 6);
    colliders.push({ id: `hw_nursery_bed_${row}`, x, z, radius: 1.93,
      minY: 419 + base, maxY: 421.4 + base });
  }
  const pumpY = groundY(32.8, 5.6);
  batch.add(new RoundedBoxGeometry(1.1, 1.75, 0.76, 3, 0.13), m.dark, [32.8, pumpY + 0.88, 5.6]);
  batch.add(new THREE.CylinderGeometry(0.34, 0.34, 1.3, 16), m.trim, [33.7, pumpY + 0.74, 5.6]);
  for (let i = 0; i < 5; i++) batch.add(new THREE.BoxGeometry(0.75, 0.045, 0.10), m.trim,
    [32.8, pumpY + 0.43 + i * 0.17, 6.02]);
  colliders.push({ id: 'hw_nursery_pump', x: 33.1, z: 5.6, radius: 1.0,
    minY: 419 + pumpY, maxY: 422 + pumpY, occluder: true });
  // Ribbed open shade canopy is light enough to reveal the planted beds.
  for (const z of [6.2, 10.8]) {
    for (const x of [30.8, 36.5]) {
      const y = groundY(x, z);
      cylinderBetween(batch, m.trim, [x, y, z], [x, y + 2.9, z], 0.055, 0.045, 7);
      colliders.push({ id: `hw_nursery_canopy_${x}_${z}`, x, z, radius: 0.14,
        minY: 419 + y, maxY: 423.1 + y, occluder: true });
    }
    const a = new THREE.Vector3(30.8, groundY(30.8, z) + 2.9, z);
    const b = new THREE.Vector3(33.65, groundY(33.65, z) + 3.5, z);
    const c = new THREE.Vector3(36.5, groundY(36.5, z) + 2.9, z);
    const archCurve = new THREE.CatmullRomCurve3([a, b, c]);
    const arch = new THREE.TubeGeometry(archCurve, 14, 0.055, 6, false);
    batch.add(arch, m.trim);
    // Separate short caps follow the real curved beam. A single large cylinder
    // would close the whole nursery airspace; the posts alone leave a head-sized
    // hole when jumping or flying through the middle of the overhead structure.
    const vertices = arch.attributes.position, vertex = new THREE.Vector3();
    for (let segment = 0; segment < 7; segment++) {
      const centre = archCurve.getPointAt((segment * 2 + 1) / 14);
      let minY = Infinity, maxY = -Infinity, radius = 0;
      for (let ring = segment * 2; ring <= segment * 2 + 2; ring++) for (let side = 0; side <= 6; side++) {
        vertex.fromBufferAttribute(vertices, ring * 7 + side);
        minY = Math.min(minY, vertex.y);
        maxY = Math.max(maxY, vertex.y);
        radius = Math.max(radius, Math.hypot(vertex.x - centre.x, vertex.z - centre.z));
      }
      colliders.push({ id: `hw_nursery_shade_${z}_${segment}`, x: centre.x, z: centre.z,
        radius: radius + 0.04, minY: HOMEWORLD_CONFIG.baseY + minY - 2.25,
        maxY: HOMEWORLD_CONFIG.baseY + maxY + 0.10, occluder: true,
        occluderMinY: HOMEWORLD_CONFIG.baseY + minY,
        occluderMaxY: HOMEWORLD_CONFIG.baseY + maxY });
    }
  }
  // Bio-Spectrum Growth Halo Rig above Eastern Nursery (illuminates in emerald-gold once Milo collects readings!)
  const nurseryBioRig = new THREE.Group();
  nurseryBioRig.name = 'homeworld-nursery-bio-halo';
  const nurseCenterY = groundY(33.5, 8.85);
  nurseryBioRig.position.set(33.5, nurseCenterY + 2.55, 8.85);
  const bioGlowMat = new THREE.MeshStandardMaterial({
    name: 'homeworld-nursery-glow',
    color: '#6effb8', emissive: '#14d97e', emissiveIntensity: 1.9, roughness: 0.2
  });
  const bioRingA = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.032, 8, 36), bioGlowMat);
  bioRingA.rotation.x = Math.PI / 2;
  const bioRingB = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.025, 8, 28), bioGlowMat);
  bioRingB.rotation.x = Math.PI / 2;
  bioRingB.position.y = 0.32;
  const bioSeedCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), bioGlowMat);
  bioSeedCore.position.y = 0.18;
  nurseryBioRig.add(bioRingA, bioRingB, bioSeedCore);
  nurseryBioRig.visible = false;
  parent.add(nurseryBioRig);

  const power = addDistrictConsole(parent, colliders, batch, m, energy, 8.0, 33.1);
  activityLights.energy = power.light;
  const ey = groundY(8, 35.4);
  batch.add(new RoundedBoxGeometry(2.05, 2.25, 1.3, 4, 0.13), m.wall, [8, ey + 1.13, 35.4]);
  batch.add(new RoundedBoxGeometry(1.70, 1.92, 0.06, 3, 0.08), m.dark, [8, ey + 1.11, 34.71]);
  for (let i = 0; i < 3; i++) {
    batch.add(new RoundedBoxGeometry(0.40, 1.38, 0.055, 2, 0.04), m.trim,
      [7.47 + i * 0.53, ey + 1.15, 34.66]);
    batch.add(new THREE.BoxGeometry(0.22, 0.035, 0.09), m.marking,
      [7.47 + i * 0.53, ey + 0.78 + i * 0.17, 34.61]);
  }
  const stages = new THREE.InstancedMesh(new RoundedBoxGeometry(0.14, 0.065, 0.025, 2, 0.01), m.signal.clone(), 3);
  stages.name = 'homeworld-energy-calibration-indicators';
  const matrix = new THREE.Matrix4(), stageColor = new THREE.Color('#b09a62');
  for (let i = 0; i < 3; i++) {
    matrix.makeTranslation(7.47 + i * 0.53, ey + 1.95, 34.60);
    stages.setMatrixAt(i, matrix);
    stages.setColorAt(i, stageColor);
  }
  stages.instanceMatrix.needsUpdate = true;
  parent.add(stages);
  energyStageLights = stages;
  const riverY = getHomeworldRiverSurfaceHeight(8) - HOMEWORLD_CONFIG.baseY;
  const inlet = new THREE.CatmullRomCurve3([
    new THREE.Vector3(8.7, ey + 0.7, 35.8), new THREE.Vector3(9.1, ey + 0.7, 37.0),
    new THREE.Vector3(9.1, riverY + 0.25, 39.3)]);
  batch.add(new THREE.TubeGeometry(inlet, 20, 0.18, 10, false), m.trim);
  batch.add(new THREE.CylinderGeometry(0.51, 0.51, 1.8, 20), m.dark,
    [8.4, riverY + 0.3, 39.0], [0, 0, Math.PI / 2]);
  for (const x of [7.45, 9.35]) {
    batch.add(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 24), m.trim,
      [x, riverY + 0.3, 39], [0, 0, Math.PI / 2]);
  }
  const wheel = new THREE.Group();
  wheel.name = 'homeworld-energy-waterwheel';
  wheel.position.set(8.4, riverY + 0.3, 39);
  const wheelParts = staticBatches(wheel);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    wheelParts.add(new RoundedBoxGeometry(1.6, 0.085, 0.24, 2, 0.02), m.padInset,
      [0, Math.cos(a) * 0.46, Math.sin(a) * 0.46], [a, 0, 0]);
  }
  wheelParts.finish();
  parent.add(wheel);
  energyRotor = wheel;
  colliders.push({ id: 'hw_energy_switchgear', x: 8, z: 35.4, radius: 1.3,
    minY: 419 + ey, maxY: 422.6 + ey, occluder: true });
  colliders.push({ id: 'hw_energy_inlet', x: 9.0, z: 37.0, radius: 0.30,
    minY: 419 + ey, maxY: 421.0 + ey });
  colliders.push({ id: 'hw_energy_generator', x: 8.4, z: 39.0, radius: 0.85,
    minY: 419.4 + riverY, maxY: 421.1 + riverY });
  for (const side of [-1, 1]) {
    const x = 8 + side * 2.1, z = 35.4, y = groundY(x, z);
    batch.add(new THREE.CylinderGeometry(0.055, 0.09, 2.7, 8), m.trim, [x, y + 1.35, z]);
    const panel = new RoundedBoxGeometry(1.7, 0.09, 2.1, 2, 0.04);
    batch.add(panel, m.solar, [x, y + 2.7, z], [0.23, 0, 0]);
    colliders.push({ id: `hw_energy_solar_${side}`, x, z, radius: 0.22,
      minY: 419 + y, maxY: 423 + y, occluder: true });
    // The pole and overhead panel occupy different height bands. Physics tests
    // foot height, so activate the canopy early enough to protect the head,
    // while keeping ordinary walking beneath the overhang possible.
    const vertices = panel.attributes.position, vertex = new THREE.Vector3();
    const tilt = new THREE.Matrix4().makeRotationX(0.23);
    let minY = Infinity, maxY = -Infinity, radius = 0;
    for (let i = 0; i < vertices.count; i++) {
      vertex.fromBufferAttribute(vertices, i).applyMatrix4(tilt);
      minY = Math.min(minY, vertex.y + y + 2.7);
      maxY = Math.max(maxY, vertex.y + y + 2.7);
      radius = Math.max(radius, Math.hypot(vertex.x, vertex.z));
    }
    colliders.push({ id: `hw_energy_solar_panel_${side}`, x, z, radius: radius + 0.04,
      minY: HOMEWORLD_CONFIG.baseY + minY - 2.25,
      maxY: HOMEWORLD_CONFIG.baseY + maxY + 0.10, occluder: true,
      occluderMinY: HOMEWORLD_CONFIG.baseY + minY,
      occluderMaxY: HOMEWORLD_CONFIG.baseY + maxY });
  }
  addDistrictCraftsmanship(colliders, batch, m);
  return {
    activityLights,
    energyStageLights,
    energyRotor,
    observatoryHoloRig,
    nurseryBioRig,
    valleyLampMat: m.warm,
    powerIndicator: activityLights.energy
  };
}

export function buildRiverwalk(parent, colliders, batch, m) {
  const positions = [], indices = [], uvs = [];
  const count = 160;
  for (let i = 0; i <= count; i++) {
    const x = -40 + i / count * 84;
    const z = getHomeworldRiverZ(x), y = getHomeworldRiverSurfaceHeight(x) - HOMEWORLD_CONFIG.baseY;
    for (const side of [-1, 1]) {
      positions.push(x, y, z + side * 1.6);
      uvs.push(i / 12, side > 0 ? 1 : 0);
    }
    if (i < count) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const river = new THREE.Mesh(geometry, m.water);
  river.name = 'homeworld-river-current';
  parent.add(river);
  // The two bridges inherit terrain support; every plank is individually
  // conformed to it, while the riverbed remains lower on both sides.
  for (const bx of [-12, 26]) {
    const bz = getHomeworldRiverZ(bx);
    for (let i = 0; i < 35; i++) {
      const z = bz - 4.5 + i * 0.27;
      const plank = new THREE.PlaneGeometry(1.80, 0.235, 4, 1);
      plank.rotateX(-Math.PI / 2);
      const p = plank.attributes.position;
      for (let k = 0; k < p.count; k++) p.setXYZ(k, bx + p.getX(k),
        groundY(bx + p.getX(k), z + p.getZ(k)) + 0.013, z + p.getZ(k));
      plank.computeVertexNormals();
      batch.add(plank, m.path);
    }
    for (const side of [-1, 1]) {
      const x = bx + side * 1.03;
      const ends = [];
      for (const offset of [-4.25, 0, 4.25]) {
        const z = bz + offset, y = groundY(bx, z);
        cylinderBetween(batch, m.trim, [x, y - 0.1, z], [x, y + 0.92, z], 0.055, 0.045, 7);
        ends.push(new THREE.Vector3(x, y + 0.86, z));
        colliders.push({ id: `hw_river_bridge_${bx}_${side}_${offset}`, x, z, radius: 0.10,
          minY: 419 + y, maxY: 421 + y });
      }
      batch.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ends), 18, 0.035, 6, false), m.trim);
    }
    // Shaped stone wing walls anchor the bridge to its bank. The low masonry
    // follows the existing support field; the clear walking lane stays intact.
    for (const side of [-1, 1]) for (const bankSide of [-1, 1]) {
      const x = bx + side * 2.6;
      const wing = valleyStoneGeometry(createHostRockOutcropGeometry(0.70, 0.32,
        Math.round(bx * 3 + side * 17 + bankSide * 5 + 200)), 619);
      const bounds = stoneBounds(wing), radius = bounds.radius * 1.30 + 0.04;
      let bankReach = 3.35;
      // The northern loop meets the eastern bridge diagonally. Tuck only a
      // conflicting abutment into its bank rather than blocking that approach.
      for (let i = 0; i < 7 && getHomeworldRouteDistance(x, bz + bankSide * bankReach) < radius + 0.86; i++) {
        bankReach -= 0.4;
      }
      const z = bz + bankSide * bankReach, y = groundY(x, z) - 0.07;
      batch.add(wing, m.rock, [x, y, z], [0, bankSide * 0.12, 0], [1.30, 1, 0.48]);
      colliders.push({ id: `hw_bridge_wing_${bx}_${side}_${bankSide}`, x, z,
        radius,
        minY: 419 + y, maxY: HOMEWORLD_CONFIG.baseY + y + bounds.maxY + 0.04, occluder: true });
    }
  }
  for (let x = -38; x <= 42; x += 2.5) {
    if (Math.abs(x + 12) < 2.6 || Math.abs(x - 26) < 2.6) continue;
    const z = getHomeworldRiverZ(x), y = getHomeworldRiverSurfaceHeight(x) - HOMEWORLD_CONFIG.baseY;
    colliders.push({ id: `hw_river_${x}`, x, z, radius: 1.6,
      minY: 419 + y, maxY: 421.3 + y });
  }
  // A few recessed route bollards mark the fork and the approach to each
  // functioning station. All share the existing scene materials and draw batch.
  for (const [x, z] of [[-18, -2.0], [-25.3, -11.0], [4.8, 21.7], [21.7, 19.9], [0.4, 26.6], [4.6, 33.5]]) {
    const y = groundY(x, z);
    batch.add(new RoundedBoxGeometry(0.26, 0.82, 0.22, 2, 0.04), m.dark, [x, y + 0.41, z]);
    batch.add(new THREE.BoxGeometry(0.12, 0.035, 0.025), m.marking, [x, y + 0.68, z + 0.13]);
    colliders.push({ id: `hw_route_marker_${x}_${z}`, x, z, radius: 0.16,
      minY: 419 + y, maxY: 421 + y });
  }
  return river;
}


export function createHomeworldLeafGeometry() {
  // 3-layer 3D volumetric botanical cluster within the exact [x: ±0.28, y: -0.06..0.09, z: 0..1.0]
  // envelope so camera sightline & canopy occlusion bounds remain 100% invariant while trees
  // gain rich cross-arched 3D thickness, raised midrib keels, and internal crown AO gradients!
  const positions = [
    // Layer 0 (vertices 0..8): Lower cupped shadow frond
    0, 0, 0,
    -0.20, 0.025, 0.22,
    -0.28, 0.01, 0.53,
    -0.16, -0.025, 0.82,
    0, -0.06, 1.0,
    0.16, -0.025, 0.82,
    0.28, 0.01, 0.53,
    0.20, 0.025, 0.22,
    0, 0.09, 0.48,
    // Layer 1 (vertices 9..15): Upper sunlit cross-arched frond (tilted for 3D profile volume)
    0, 0.032, 0.08,
    -0.19, 0.082, 0.30,
    -0.22, 0.048, 0.66,
    0, 0.018, 0.90,
    0.22, 0.052, 0.66,
    0.19, 0.082, 0.30,
    0, 0.088, 0.50,
    // Layer 2 (vertices 16..19): Central vertical 3D midrib keel & leaflet tuft
    0, -0.015, 0.14,
    0, 0.088, 0.44,
    0, -0.022, 0.78,
    0, 0.056, 0.82
  ];
  const uvs = [
    // Layer 0
    0.5, 0, 0.143, 0.22, 0, 0.53, 0.214, 0.82, 0.5, 1,
    0.786, 0.82, 1, 0.53, 0.857, 0.22, 0.5, 0.48,
    // Layer 1
    0.5, 0.08, 0.16, 0.30, 0.10, 0.66, 0.5, 0.90,
    0.90, 0.66, 0.84, 0.30, 0.5, 0.50,
    // Layer 2
    0.5, 0.14, 0.5, 0.44, 0.5, 0.78, 0.5, 0.82
  ];
  const colors = [
    // Layer 0: Deep interior basal AO -> mid emerald rim -> bright apex
    0.66, 0.74, 0.68,
    0.80, 0.88, 0.78,
    0.86, 0.94, 0.82,
    0.92, 0.98, 0.86,
    0.98, 1.02, 0.90,
    0.92, 0.98, 0.86,
    0.86, 0.94, 0.82,
    0.80, 0.88, 0.78,
    1.04, 1.08, 0.95,
    // Layer 1: Sunlit upper cross-frond
    0.78, 0.86, 0.76,
    1.06, 1.10, 0.94,
    1.04, 1.08, 0.92,
    1.08, 1.12, 0.96,
    1.04, 1.08, 0.92,
    1.06, 1.10, 0.94,
    1.14, 1.16, 0.98,
    // Layer 2: Central 3D keel highlight
    0.74, 0.82, 0.72,
    1.15, 1.18, 0.98,
    0.84, 0.92, 0.80,
    1.10, 1.14, 0.96
  ];
  const indices = [];
  for (let i = 0; i < 8; i++) indices.push(8, i, (i + 1) % 8);
  for (let i = 0; i < 6; i++) indices.push(15, 9 + i, 9 + ((i + 1) % 6));
  indices.push(16, 17, 18, 17, 19, 18);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
