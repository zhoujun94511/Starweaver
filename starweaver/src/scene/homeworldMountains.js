import * as THREE from 'three';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../data/homeworldData.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';
import { fbm2D, mulberry32, smoothstep } from '../utils/math.js';

const groundY = (x, z) => getHomeworldGroundHeight(x, z) - HOMEWORLD_CONFIG.baseY;

const MASSIF_SECTION = [
  [-1.00, 0.00], [-0.87, 0.07], [-0.71, 0.21], [-0.59, 0.29],
  [-0.50, 0.32], [-0.45, 0.56], [-0.38, 0.60], [-0.30, 0.65],
  [-0.25, 0.81], [-0.14, 0.85], [-0.04, 0.99], [0.06, 0.96],
  [0.18, 0.82], [0.29, 0.76], [0.38, 0.52], [0.49, 0.48],
  [0.62, 0.31], [0.77, 0.16], [1.00, 0.00],
  [1.00, -0.12], [-1.00, -0.12]
];

function massifColors(geometry, distant = false) {
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.count * 3);
  const alpineGranite = new THREE.Color('#7f8a8f');
  const shadowSlate = new THREE.Color('#2d3d4a');
  const deepRavine = new THREE.Color('#1d2a36');
  const warmCliff = new THREE.Color('#9c9689');
  const foothillForest = new THREE.Color('#2d593a');
  const alpineMeadow = new THREE.Color('#537d46');
  const snowCap = new THREE.Color('#eef4fa');
  const glacierBlue = new THREE.Color('#9bb9d4');
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    const up = Math.max(0, ny);
    const localHeight = y - groundY(x, z);
    const macro = fbm2D(x * 0.065 + 3.1, z * 0.065 - 5.7, 3);
    const crack = fbm2D(x * 0.26 + y * 0.07, z * 0.26 - y * 0.08, 3);
    // 3D directional sun-facet illumination & ravine cavity ambient occlusion
    const sunDot = nx * 0.50 + ny * 0.66 + nz * 0.38;
    const facetSun = smoothstep(-0.52, 0.84, sunDot);
    const cavityAO = smoothstep(-0.42, 0.38, ny) * (0.70 + 0.30 * smoothstep(0.5, 11.0, localHeight));
    // Non-periodic domain-warped mineral variation (zero horizontal sin(y) zebra stripes!)
    const rockVar = fbm2D(x * 0.11 + macro * 2.4, z * 0.11 - y * 0.06, 3);
    color.copy(deepRavine).lerp(shadowSlate, cavityAO);
    color.lerp(alpineGranite, (0.28 + crack * 0.44) * (0.45 + 0.55 * facetSun));
    color.lerp(warmCliff, smoothstep(0.32, 0.78, rockVar) * (0.22 + 0.44 * facetSun));

    // Lush emerald forest & alpine turf across lower foothills and gentle ledges
    const forestBand = (1 - smoothstep(4.5, 16.0 + macro * 4.5, localHeight)) * smoothstep(0.20, 0.72, up + 0.18);
    color.lerp(foothillForest, forestBand * 0.78);
    const highTurf = smoothstep(0.42, 0.85, up) * (1 - smoothstep(10, 22, localHeight));
    color.lerp(alpineMeadow, highTurf * (0.38 + 0.28 * facetSun));

    // Crisp sunlit snow-peaks & glacier-blue shadowed saddles on high summits!
    const snowLine = (distant ? 18.2 : 16.2) + (macro - 0.5) * 5.5 - up * 4.2;
    const snowMask = smoothstep(snowLine, snowLine + 5.5, localHeight) * smoothstep(0.12, 0.56, up + 0.16);
    if (snowMask > 0.005) {
      const snowCol = glacierBlue.clone().lerp(snowCap, smoothstep(0.22, 0.82, facetSun * 0.65 + up * 0.35));
      color.lerp(snowCol, snowMask * 0.92);
    }

    color.multiplyScalar((0.76 + 0.30 * facetSun) * (0.86 + crack * 0.20));
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function mountainGeometry(cx, cz, width, depth, height, seed, distant = false) {
  const random = mulberry32(seed), radialLength = Math.hypot(cx, cz);
  const rx = cx / radialLength, rz = cz / radialLength, tx = -rz, tz = rx;
  const positions = [], uvs = [], indices = [];
  const peakHeights = [0.05, 0.35, 0.63, 0.46, 0.88, 0.69, 0.79, 0.51, 0.72, 0.42, 0.05];
  const primaryPeak = 3 + Math.floor(random() * 4);
  peakHeights[primaryPeak] = 1.03;
  for (let i = 1; i < peakHeights.length - 1; i++) {
    if (i !== primaryPeak) peakHeights[i] *= 0.85 + random() * 0.28;
  }
  function skyline(u) {
    const q = Math.min(peakHeights.length - 1.00001, u * (peakHeights.length - 1));
    const i = Math.floor(q), f = q - i;
    // Broken linear crests and saddles avoid the old Gaussian/round-cone shape.
    return peakHeights[i] * (1 - f) + peakHeights[i + 1] * f;
  }
  function addSpine({ length, halfWidth, segments, angle = 0, offsetX = 0, offsetZ = 0,
    heightScale = 1, branch = false, variant = 0 }) {
    const cosine = Math.cos(angle), sine = Math.sin(angle);
    const ringStart = positions.length / 3, count = MASSIF_SECTION.length;
    const endContours = [];
    for (let row = 0; row <= segments; row++) {
      const u = row / segments, along = (u * 2 - 1) * length;
      const crest = branch ? (0.09 + Math.pow(u, 0.80) * 0.72) : skyline(u);
      const wandering = Math.sin(u * 5.7 + seed) * halfWidth * 0.10 +
        (fbm2D(u * 5.0 + seed, variant + 2.7, 2) - 0.5) * halfWidth * 0.15;
      const widthScale = branch ? (0.22 + Math.sin(u * Math.PI * 0.85) * 0.78) :
        (0.38 + Math.pow(Math.sin(u * Math.PI), 0.45) * 0.62);
      const contour = [];
      let previousCross = -Infinity;
      for (let column = 0; column < count; column++) {
        const [v, fraction] = MASSIF_SECTION[column];
        const burial = fraction < 0;
        const horizontal = v * halfWidth * widthScale;
        const gullyWarp = fbm2D(along * 0.11 + seed, fraction * 1.4 + variant, 3);
        const ridgeNoise = 1 - Math.abs(fbm2D(along * 0.24 + gullyWarp * 2.2 + seed, fraction * 1.1 + variant, 3) * 2 - 1);
        const gully = Math.pow(Math.max(0, ridgeNoise), 2.2);
        const scarpMask = smoothstep(0.14, 0.52, fraction) * (1 - smoothstep(0.84, 1.0, fraction));
        // Natural non-periodic ravine carving + domain-warped ridge spurs (no corrugated sine ribs).
        const ledgeWarp = fbm2D(along * 0.16 + fraction * 2.1, seed * 0.3 + variant, 2) - 0.5;
        const erosion = Math.sign(v) * Math.min(1, halfWidth * widthScale * 0.14) *
          (gully * 1.15 * scarpMask + ledgeWarp * 0.42 * scarpMask);
        let cross = horizontal + wandering - erosion;
        if (!burial) {
          // Keep the eroded section simple even at a narrow spur's tip. An
          // unchecked radial gully can fold the cap contour through itself.
          cross = Math.max(previousCross + halfWidth * widthScale * 0.008, cross);
          previousCross = cross;
        }
        const lx = offsetX + along * cosine - cross * sine;
        const lz = offsetZ + along * sine + cross * cosine;
        const x = cx + lx * tx + lz * rx, z = cz + lx * tz + lz * rz;
        const ground = groundY(x, z);
        const fine = (fbm2D(x * 0.82 + seed, z * 0.82 + fraction * 1.7, 2) - 0.5) * 0.48;
        const y = burial ? ground - 2.4 : ground - 0.32 +
          height * heightScale * crest * fraction + fine * Math.min(1, crest * 4) * smoothstep(0, 0.22, fraction) -
          gully * 0.45 * scarpMask;
        positions.push(x, y, z);
        uvs.push(along * 0.20, (horizontal + y) * 0.20);
        if (row === 0 || row === segments) contour.push(new THREE.Vector2(cross, y));
        if (row < segments) {
          const nextColumn = (column + 1) % count;
          const a = ringStart + row * count + column, b = a + count;
          const aNext = ringStart + row * count + nextColumn, bNext = aNext + count;
          indices.push(a, bNext, b, a, aNext, bNext);
        }
      }
      if (row === 0 || row === segments) endContours.push(contour);
    }
    // Concave, shelf-bearing end contours need proper triangulation; a centre
    // fan would bridge the cliff recesses and expose inverted slivers.
    for (const end of [0, 1]) {
      const triangles = THREE.ShapeUtils.triangulateShape(endContours[end], []);
      const start = ringStart + end * segments * count;
      for (const [a, b, c] of triangles) {
        if (end) indices.push(start + c, start + b, start + a);
        else indices.push(start + a, start + b, start + c);
      }
    }
  }
  addSpine({ length: width, halfWidth: depth, segments: 72 });
  // Intersecting, rotated subsidiary ridges project toward the valley, so the
  // main wall has real foreground buttresses and shadowed re-entrants.
  for (let i = 0; i < 2; i++) {
    addSpine({ length: depth * 0.42, halfWidth: width * (0.14 + i * 0.012), segments: 24,
      angle: Math.PI / 2 + (i ? -0.28 : 0.24), offsetX: width * (i ? 0.44 : -0.36),
      offsetZ: -depth * 0.31, heightScale: i ? 0.66 : 0.73, branch: true, variant: 8 + i * 13 });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // Tangent/radial coordinates form a reflected XZ basis. Reverse the winding
  // so both the top cliffs and the two cap faces point out of the rock volume.
  for (let i = 0; i < indices.length; i += 3) {
    const swap = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = swap;
  }
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.massif = { cx, cz, width, depth, height, seed, distant, closedSpines: 3 };
  return massifColors(geometry, distant);
}

/** Exported for real triangle/surface white-box checks, not a runtime updater. */
export function createHomeworldMountainRangeGeometry() {
  // Foreground escarpments overlap in depth; the northern backbone is taller
  // and farther away. Widths/heights and summit locations are deliberately
  // unequal, unlike a ring of repeated solitary cones.
  const parts = [
    [-78, -78, 34, 20, 29, 71], [85, -67, 36, 19, 32, 42],
    [105, 14, 32, 20, 27, 31], [-105, 22, 36, 20, 25, 59],
    [-67, 91, 38, 22, 34, 83], [69, 91, 36, 22, 29, 97],
    [-6, -152, 56, 22, 62, 19, true], [-112, -130, 44, 24, 52, 113, true]
  ];
  const entries = parts.map(args => ({ geo: mountainGeometry(...args) }));
  const closedMassifTriangles = entries.reduce((sum, entry) => sum + entry.geo.index.count / 3, 0);
  // A buried continuation of the meadow fills the gaps below the distant
  // skyline. Its inner boundary stays beyond all walkable terrain (r>82),
  // unlike the old rectangular mountain sheets covering the valley floor.
  const apron = new THREE.RingGeometry(84.5, 176, 160, 8);
  apron.rotateX(-Math.PI / 2);
  const p = apron.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    const shoulder = smoothstep(88, 120, r) * (1 - smoothstep(140, 176, r));
    p.setY(i, groundY(x, z) - 0.44 + shoulder *
      (fbm2D(x * 0.047 + 4, z * 0.047 - 3, 3) * 2.3));
  }
  apron.computeVertexNormals();
  entries.push({ geo: massifColors(apron) });
  const geometry = mergeTransformedGeometries(entries);
  for (const entry of entries) entry.geo.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.massifs = parts.map(([cx, cz, width, depth, height, seed, distant = false]) =>
    ({ cx, cz, width, depth, height, seed, distant }));
  geometry.userData.closedMassifTriangles = closedMassifTriangles;
  return geometry;
}

/**
 * Build-time, camera-only proxies for the reachable front of the rock volumes.
 * Rasterising the actual top triangles avoids a surrounding cylinder/high wall
 * and does not put these decorative mountains into the robot's physics list.
 * The small overlapping cells preserve the ravines and the open skyline gaps.
 */
export function createMountainCameraOccluders(geometry) {
  const step = 2, reach = 118, side = reach * 2 / step + 1;
  const top = new Float32Array(side * side); top.fill(-Infinity);
  const p = geometry.attributes.position;
  const triangleVertices = geometry.userData.closedMassifTriangles * 3;
  const indexAt = value => Math.max(0, Math.min(side - 1, value));
  for (let i = 0; i < triangleVertices; i += 3) {
    const ax = p.getX(i), az = p.getZ(i), ay = p.getY(i);
    const bx = p.getX(i + 1), bz = p.getZ(i + 1), by = p.getY(i + 1);
    const cx = p.getX(i + 2), cz = p.getZ(i + 2), cy = p.getY(i + 2);
    const dx1 = bx - ax, dz1 = bz - az, dx2 = cx - ax, dz2 = cz - az;
    const determinant = dx1 * dz2 - dz1 * dx2;
    // Bottoms and vertical cut faces do not define the visible top envelope.
    if (determinant >= -1e-7) continue;
    const minX = indexAt(Math.ceil((Math.min(ax, bx, cx) + reach) / step));
    const maxX = indexAt(Math.floor((Math.max(ax, bx, cx) + reach) / step));
    const minZ = indexAt(Math.ceil((Math.min(az, bz, cz) + reach) / step));
    const maxZ = indexAt(Math.floor((Math.max(az, bz, cz) + reach) / step));
    for (let iz = minZ; iz <= maxZ; iz++) for (let ix = minX; ix <= maxX; ix++) {
      const dx = ix * step - reach - ax, dz = iz * step - reach - az;
      const u = (dx * dz2 - dz * dx2) / determinant;
      const v = (dx1 * dz - dz1 * dx) / determinant;
      if (u < -1e-5 || v < -1e-5 || u + v > 1.00001) continue;
      const y = ay + (by - ay) * u + (cy - ay) * v;
      top[iz * side + ix] = Math.max(top[iz * side + ix], y);
    }
  }
  const result = [];
  // Small cells use their own real surface height. A neighbourhood maximum
  // would raise phantom high walls along low scree/clear grazing sightlines.
  for (let iz = 1; iz < side - 1; iz++) for (let ix = 1; ix < side - 1; ix++) {
    const x = ix * step - reach, z = iz * step - reach, distance = Math.hypot(x, z);
    if (distance < HOMEWORLD_CONFIG.playRadius + 1.5 || distance > 116) continue;
    const height = top[iz * side + ix];
    const floor = groundY(x, z);
    if (height < floor + 0.35) continue;
    // Even the solver's lens dilation remains outside the walkable circle.
    const radius = Math.min(1.2, distance - HOMEWORLD_CONFIG.playRadius - 0.8);
    result.push({ id: `hw_camera_rock_${ix}_${iz}`, cameraOnly: true, x, z, radius,
      minY: HOMEWORLD_CONFIG.baseY + floor - 2.4,
      occluderMinY: HOMEWORLD_CONFIG.baseY + floor - 2.4,
      maxY: HOMEWORLD_CONFIG.baseY + height + 0.12, occluder: true });
  }
  return result;
}
