import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';
import { HOMEWORLD_CONFIG, HOMEWORLD_UPDRAFT_THERMALS, HOMEWORLD_AERIAL_RINGS, getHomeworldGroundHeight } from '../data/homeworldData.js';
import { createHomeworldLeafGeometry } from './homeworldLandscape.js';
import { buildHomeworldResidents, updateHomeworldResidents } from './homeworldCharacters.js';
import { createHomeworldSurfaceMaterial } from '../graphics/homeworldMaterials.js';
import { buildUpdraftVisuals, updateUpdraftVisuals } from './updraftVisuals.js';

const localGroundY = (x, z) => getHomeworldGroundHeight(x, z) - HOMEWORLD_CONFIG.baseY;

function supportMatchedDisc(radius, x, z, lift = 0.004) {
  const geometry = new THREE.RingGeometry(0, radius, 64, Math.ceil(radius * 4));
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    positions.setY(i, localGroundY(x + positions.getX(i), z + positions.getZ(i)) + lift);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A closed pressure-shell section, including its two cut faces. Profiles are
// counter-clockwise in radius/height space. Adjacent profile edges keep their
// own normals (folded seams stay crisp), while the circular sweep stays smooth.
function pressureSection(profile, start, sweep, segments = 12) {
  const positions = [], uvs = [], indices = [];
  const count = profile.length;
  for (let edge = 0; edge < count; edge++) {
    const a = profile[edge], b = profile[(edge + 1) % count];
    const offset = positions.length / 3;
    for (let i = 0; i <= segments; i++) {
      const angle = start + sweep * i / segments;
      for (const [r, y] of [a, b]) {
        positions.push(Math.sin(angle) * r, y, Math.cos(angle) * r);
        uvs.push(angle * Math.max(r, 0.1) / 2.8, y / 2.8);
      }
      if (i < segments) {
        const k = offset + i * 2;
        indices.push(k, k + 2, k + 3, k, k + 3, k + 1);
      }
    }
  }
  const contour = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const end of [0, 1]) {
    const angle = start + sweep * end, offset = positions.length / 3;
    for (const [r, y] of profile) {
      positions.push(Math.sin(angle) * r, y, Math.cos(angle) * r);
      uvs.push(r / 2.8, y / 2.8);
    }
    for (const [a, b, c] of triangles) {
      if (end) indices.push(offset + c, offset + b, offset + a);
      else indices.push(offset + a, offset + b, offset + c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function shellProfile(points, thickness) {
  // The exposed face and its parallel inner skin are joined by solid edge
  // reveals; grazing views therefore never expose a paper-thin roof edge.
  const inner = points.map(([r, y], i) => {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)];
    const dr = after[0] - before[0], dy = after[1] - before[1];
    const length = Math.hypot(dr, dy) || 1;
    return [r - thickness * dy / length, y + thickness * dr / length];
  });
  return [...points, ...inner.reverse()];
}

function roundedOutline(width, height, radius) {
  const shape = new THREE.Shape(), x = -width / 2, y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function pressureDoorFrame(width, height, border, depth,
  openingWidth = width - border * 2, openingHeight = height - border * 2) {
  const outline = roundedOutline(width, height, 0.32);
  const hole = roundedOutline(openingWidth, openingHeight, 0.22);
  outline.holes.push(new THREE.Path(hole.getPoints(8).reverse()));
  const geometry = new THREE.ExtrudeGeometry(outline, {
    depth, bevelEnabled: true, bevelSegments: 2, steps: 1,
    bevelSize: 0.035, bevelThickness: 0.035, curveSegments: 5
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

// Only called for wholly static landmark subtrees. Residents, drones and beacon
// rings keep their independent transforms; architectural panels share draws.
function mergeLandmarkParts(group, sources = [group], opaqueOnly = false) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const parts = new Map();
  for (const source of sources) {
    source.updateMatrixWorld(true);
    source.traverse(object => {
      if (!object.isMesh || object.isInstancedMesh || Array.isArray(object.material)) return;
      // Architectural glass keeps its own sort centre. All opaque parts can
      // share draws across the connected settlement, with identical transforms.
      if (opaqueOnly && object.material.transparent) return;
      if (!parts.has(object.material)) parts.set(object.material, []);
      parts.get(object.material).push({ object, geo: object.geometry,
        matrix: new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld) });
    });
  }
  const originals = new Set();
  for (const [material, entries] of parts) {
    const merged = new THREE.Mesh(mergeTransformedGeometries(entries), material);
    merged.castShadow = entries.some(entry => entry.object.castShadow);
    merged.receiveShadow = entries.some(entry => entry.object.receiveShadow);
    merged.renderOrder = Math.max(...entries.map(entry => entry.object.renderOrder));
    merged.name = 'homeworld-landmark-batch';
    merged.userData.architecturalParts = entries.flatMap(entry =>
      entry.object.userData.architecturalParts || (entry.object.name ? [entry.object.name] : []));
    for (const entry of entries) {
      entry.object.removeFromParent();
      originals.add(entry.geo);
    }
    group.add(merged);
  }
  for (const geometry of originals) geometry.dispose();
}

// The homeworld is intentionally built as a small, coherent settlement instead of a
// collection of isolated props.  All geometry is generated offline and shared where
// possible so the ending meadow remains pleasant on a phone GPU.
export function buildHomeworldEnhancements(homeworldGroup, colliders, pbrLibrary = null) {
  const anim = { hoverBots: [], vaneGroups: [], beaconRings: [], monumentStarRig: null };
  const staticDecorations = new THREE.Group();
  staticDecorations.name = 'homeworld-static-streetscape';
  homeworldGroup.add(staticDecorations);
  const surface = (name, source, color, roughness, metalness, weathering = 0.10, moss = 0.03) =>
    createHomeworldSurfaceMaterial(pbrLibrary, { name, surface: source, color, roughness, metalness,
      normalStrength: 0.12, worldScale: 0.50, weathering, moss });
  const ivory = surface('colony-pressure-ceramic', 'hull_white', '#dde7e0', 0.42, 0.22);
  const ceramic = surface('colony-insulated-sill', 'hull_white', '#a4bfb4', 0.60, 0.14, 0.14, 0.05);
  const teal = surface('colony-painted-structural-alloy', 'titanium_dark', '#3b7872', 0.40, 0.56);
  const copper = surface('colony-aged-return-manifold', 'brushed_copper', '#c99b68', 0.38, 0.72, 0.12, 0.01);
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#b4fcef', emissive: '#22cfa8', emissiveIntensity: 0.26,
    roughness: 0.12, metalness: 0.18, clearcoat: 0.82, clearcoatRoughness: 0.10,
    transmission: 0, transparent: true, opacity: 0.48, depthWrite: false
  });
  glass.name = 'colony-sealed-architectural-glazing';
  anim.colonyGlassMat = glass;
  const pathMat = surface('colony-weathered-deck', 'station_deck', '#b5ccc5', 0.64, 0.18, 0.14, 0.04);
  const dark = surface('colony-recessed-machinery', 'titanium_dark', '#243d45', 0.48, 0.72, 0.08, 0.01);
  const cyan = new THREE.MeshStandardMaterial({ color: '#9ef5dc', emissive: '#2bc49f', emissiveIntensity: 1.15, roughness: 0.28 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: '#39885b', roughness: 0.84, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: '#58a864', roughness: 0.80, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: '#86c470', roughness: 0.78, side: THREE.DoubleSide })
  ];

  const add = (mesh, x, y, z, parent = staticDecorations) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.material !== glass;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Small fin bevels are subpixel at the normal follow distance; a single
  // smooth chamfer is sufficient there, while the large silhouette keeps two.
  const rounded = (w, h, d, radius = 0.06) => new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) < 0.13 ? 1 : 2, radius);
  const pipe = (points, radius, material, parent, name) => {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, radius, 7, false), material);
    mesh.name = name;
    add(mesh, 0, 0, 0, parent);
    return mesh;
  };
  const sector = (parent, material, profile, start, sweep, name, segments = 12) => {
    const mesh = new THREE.Mesh(pressureSection(profile, start, sweep, segments), material);
    mesh.name = name;
    if (material.transparent) mesh.renderOrder = 2;
    return add(mesh, 0, 0, 0, parent);
  };

  // The civic terminal uses the ship's pressure-vessel construction: opaque
  // roof petals, a recessed observation belt and a separately framed airlock.
  // Its closed envelope stays inside the existing 6.1 m collision footprint.
  const commons = new THREE.Group();
  commons.name = 'homeworld-commons';
  commons.position.set(11.8, 0, 8.2);
  const commonsBase = new THREE.Mesh(supportMatchedDisc(7.2, 11.8, 8.2, 0.003), ceramic);
  add(commonsBase, 0, 0, 0, commons);
  const commonsDeck = new THREE.Mesh(supportMatchedDisc(6.25, 11.8, 8.2, 0.010), ivory);
  add(commonsDeck, 0, 0, 0, commons);
  const commonsGlass = new THREE.Group();
  commonsGlass.name = 'homeworld-commons-glazing';
  commons.add(commonsGlass);
  const civicRoof = [[5.38, 2.72], [5.35, 2.89], [5.16, 3.24], [4.78, 3.63],
    [4.18, 4.05], [3.42, 4.43], [2.57, 4.71], [1.65, 4.89], [0.58, 4.96]];
  const civicRoofProfile = shellProfile(civicRoof, 0.15);
  const civicRibProfile = shellProfile([[5.43, 0.30], [5.43, 2.70], [5.42, 2.92],
    [5.23, 3.30], [4.85, 3.70], [4.25, 4.12], [3.49, 4.50], [2.62, 4.78], [1.68, 4.96], [0.58, 5.03]], 0.17);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, start = a - Math.PI / 12 + 0.018, sweep = Math.PI / 6 - 0.036;
    sector(commons, ivory, civicRoofProfile, start, sweep, 'commons-pressure-roof-petal');
    sector(commons, teal, civicRibProfile, a - Math.PI / 12 - 0.010, 0.020, 'commons-load-bearing-rib', 2);
    if (i !== 9) {
      sector(commons, ceramic, [[5.36, 0.08], [5.43, 0.18], [5.43, 0.84], [5.30, 1.02],
        [5.08, 1.02], [5.08, 0.08]], start, sweep, 'commons-sill-pressure-skin');
      sector(commonsGlass, glass, [[5.24, 1.04], [5.24, 2.66], [5.17, 2.66], [5.17, 1.04]],
        start + 0.014, sweep - 0.028, 'commons-recessed-observation-window');
      sector(commons, copper, [[5.30, 0.98], [5.30, 1.07], [5.12, 1.07], [5.12, 0.98]],
        start, sweep, 'commons-window-sill');
      sector(commons, teal, [[5.31, 2.59], [5.40, 2.70], [5.40, 2.78], [5.14, 2.78], [5.14, 2.59]],
        start, sweep, 'commons-window-head-reveal');
    }
    const footing = add(new THREE.Mesh(rounded(0.68, 0.32, 0.74), dark),
      Math.sin(a - Math.PI / 12) * 5.29, 0.15, Math.cos(a - Math.PI / 12) * 5.29, commons);
    footing.rotation.y = a - Math.PI / 12;
    footing.name = 'commons-bearing-shoe';
    // Real fasteners sit in the rib shoe, rather than floating above the deck.
    for (const side of [-1, 1]) {
      const bolt = add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 6), copper),
        0, 0.183, side * 0.23, footing);
      bolt.name = 'commons-anchor-bolt';
    }
  }
  sector(commons, dark, [[0.58, 4.77], [0.58, 4.94], [0.04, 4.94], [0.04, 4.77]],
    0, Math.PI * 2, 'commons-vent-cap', 28);
  const door = new THREE.Group();
  door.name = 'commons-airlock';
  door.position.set(-5.24, 0, 0);
  door.rotation.y = -Math.PI / 2;
  commons.add(door);
  const civicBulkhead = add(new THREE.Mesh(pressureDoorFrame(3.06, 2.96, 0.16, 0.12, 1.97, 2.57), ceramic),
    0, 1.50, -0.045, door);
  civicBulkhead.name = 'commons-airlock-integrated-bulkhead';
  const civicDoorFrame = add(new THREE.Mesh(pressureDoorFrame(2.32, 2.92, 0.20, 0.29), ivory), 0, 1.50, 0.15, door);
  civicDoorFrame.name = 'commons-airlock-solid-frame';
  const civicSeal = add(new THREE.Mesh(pressureDoorFrame(1.97, 2.57, 0.08, 0.08), dark), 0, 1.50, 0.025, door);
  civicSeal.name = 'commons-airlock-recessed-gasket';
  const civicDoor = add(new THREE.Mesh(rounded(1.79, 2.39, 0.12, 0.10), teal), 0, 1.50, -0.09, door);
  civicDoor.name = 'commons-airlock-pressure-door';
  for (const side of [-1, 1]) {
    const pane = add(new THREE.Mesh(rounded(0.56, 0.50, 0.035, 0.07), dark), side * 0.37, 1.93, -0.007, door);
    pane.name = 'commons-door-inset-vision-panel';
    const hinge = add(new THREE.Mesh(rounded(0.15, 0.29, 0.20, 0.035), copper), side * 0.99, 1.07, 0.17, door);
    hinge.name = 'commons-door-latch';
  }
  add(new THREE.Mesh(rounded(0.035, 2.07, 0.025, 0.01), copper), 0, 1.45, -0.011, door);
  const civicLintel = add(new THREE.Mesh(rounded(2.54, 0.19, 0.63, 0.06), teal), 0, 3.03, 0.16, door);
  civicLintel.name = 'commons-airlock-weather-hood';
  // Two recessed service cassettes flank the airlock. Louver blades reveal a
  // dark cavity; they are structural geometry, never painted-on black bars.
  for (const side of [-1, 1]) {
    const housing = add(new THREE.Mesh(rounded(0.60, 0.91, 0.25), teal), side * 1.49, 1.55, -0.04, door);
    housing.name = 'commons-service-cassette';
    add(new THREE.Mesh(rounded(0.43, 0.69, 0.025, 0.02), dark), side * 1.49, 1.55, 0.097, door);
    for (let j = 0; j < 6; j++) {
      const blade = add(new THREE.Mesh(rounded(0.43, 0.052, 0.08, 0.015), copper), side * 1.49, 1.28 + j * 0.105, 0.12, door);
      blade.rotation.x = 0.35;
    }
  }
  // A flush service conduit follows the rear shell and returns into a sealed
  // manifold. Its elbows and clamps share the furnace's industrial language.
  pipe([[2.2, 0.49, -4.72], [2.2, 1.0, -4.72], [2.05, 2.72, -4.66],
    [1.55, 3.18, -4.55], [0.95, 3.18, -4.55]], 0.075, copper, commons, 'commons-thermal-return');
  for (const [x, z] of [[-2.15, 3.5], [2.15, -3.5]]) {
    const kiosk = add(new THREE.Mesh(rounded(1.32, 1.02, 0.62, 0.10), teal), x, 0.59, z, commons);
    kiosk.name = 'commons-interior-workstation';
    const screen = add(new THREE.Mesh(rounded(0.95, 0.41, 0.045, 0.025), dark), x, 0.81, z + (z > 0 ? -0.33 : 0.33), commons);
    screen.rotation.x = z > 0 ? 0.16 : -0.16;
  }
  mergeLandmarkParts(commonsGlass);
  homeworldGroup.add(commons);
  colliders.push({ id: 'hw_commons', x: 11.8, z: 8.2, radius: 6.1, minY: 419, maxY: 426.5, occluder: true });

  // Solarium: a low pressure greenhouse, not another civic dome. The greenhouse
  // glazing is partitioned into sealed trapezoids under an opaque crown, with
  // independent foundation shoes, irrigation manifolds and a southwest airlock.
  const solarium = new THREE.Group();
  solarium.name = 'homeworld-solarium';
  const solGround = localGroundY(21.2, 4.2);
  solarium.position.set(21.2, solGround, 4.2);
  const solBase = new THREE.Mesh(supportMatchedDisc(5.0, 21.2, 4.2, 0.010), ceramic);
  add(solBase, 0, -solGround, 0, solarium);
  const solGlass = new THREE.Group();
  solGlass.name = 'homeworld-solarium-glazing';
  solarium.add(solGlass);
  sector(solarium, dark, [[3.98, -0.27], [4.05, -0.10], [4.05, 0.38], [3.91, 0.52],
    [0.035, 0.52], [0.035, -0.27]], 0, Math.PI * 2, 'solarium-level-hydroponic-foundation', 64);
  const greenhouseFace = [[4.02, 0.66], [4.01, 1.47], [3.77, 2.22], [3.31, 2.94], [2.67, 3.54], [1.87, 3.98], [1.04, 4.21]];
  const greenhouseShell = shellProfile(greenhouseFace, 0.065);
  const greenhouseRib = shellProfile(greenhouseFace.map(([r, y]) => [r + 0.07, y + 0.025]), 0.16);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2, start = a - Math.PI / 10 + 0.023, sweep = Math.PI / 5 - 0.046;
    if (i !== 8) sector(solGlass, glass, greenhouseShell, start, sweep, 'solarium-sealed-glazing');
    else {
      const upperGlass = shellProfile([[3.45, 2.72], ...greenhouseFace.slice(3)], 0.065);
      const jambGlass = shellProfile([...greenhouseFace.slice(0, 3), [3.45, 2.72]], 0.065);
      sector(solGlass, glass, upperGlass, start, sweep, 'solarium-airlock-transom');
      sector(solGlass, glass, jambGlass, start, a - 0.225 - start, 'solarium-airlock-side-glazing', 3);
      sector(solGlass, glass, jambGlass, a + 0.225, start + sweep - a - 0.225, 'solarium-airlock-side-glazing', 3);
    }
    sector(solarium, ivory, greenhouseRib, a - Math.PI / 10 - 0.014, 0.028, 'solarium-pressure-frame', 2);
    sector(solarium, teal, [[4.06, 0.13], [4.16, 0.25], [4.16, 0.57], [4.03, 0.72],
      [3.76, 0.72], [3.76, 0.13]], start, sweep, 'solarium-insulated-knee-wall');
    const radial = a - Math.PI / 10;
    const gx = 21.2 + Math.sin(radial) * 3.91, gz = 4.2 + Math.cos(radial) * 3.91;
    const footGround = localGroundY(gx, gz) - solGround;
    const anchorTop = Math.max(0.70, footGround + 0.18), anchorBottom = footGround - 0.06;
    const foot = add(new THREE.Mesh(rounded(0.54, anchorTop - anchorBottom, 0.64, 0.06), dark),
      Math.sin(radial) * 3.91, (anchorTop + anchorBottom) / 2, Math.cos(radial) * 3.91, solarium);
    foot.rotation.y = radial;
    foot.name = 'solarium-terrain-seated-anchor';
  }
  sector(solarium, ivory, shellProfile([[1.15, 4.16], [0.96, 4.31], [0.59, 4.39], [0.04, 4.41]], 0.16),
    0, Math.PI * 2, 'solarium-insulated-crown', 32);
  // Two narrow secondary glazing rails follow the curved envelope exactly.
  for (const [r, y] of [[3.87, 2.10], [2.83, 3.44]]) {
    sector(solarium, copper, [[r, y], [r, y + 0.065], [r - 0.105, y + 0.065], [r - 0.105, y]],
      0, Math.PI * 2, 'solarium-glazing-lap-joint', 64);
  }
  const solAirlock = new THREE.Group();
  solAirlock.name = 'solarium-airlock';
  const solAngle = 8 / 10 * Math.PI * 2;
  solAirlock.position.set(Math.sin(solAngle) * 3.68, 0, Math.cos(solAngle) * 3.68);
  solAirlock.rotation.y = solAngle;
  solarium.add(solAirlock);
  const solFrame = add(new THREE.Mesh(pressureDoorFrame(1.83, 2.48, 0.16, 0.27), ivory), 0, 1.47, 0.16, solAirlock);
  solFrame.name = 'solarium-airlock-frame';
  const solHood = add(new THREE.Mesh(rounded(1.99, 0.16, 0.84, 0.04), ivory), 0, 2.77, -0.10, solAirlock);
  solHood.name = 'solarium-airlock-shell-connection';
  const solDoor = add(new THREE.Mesh(rounded(1.47, 2.11, 0.12, 0.10), teal), 0, 1.47, -0.02, solAirlock);
  solDoor.name = 'solarium-airlock-pressure-door';
  add(new THREE.Mesh(rounded(0.95, 0.66, 0.035, 0.09), dark), 0, 1.88, 0.058, solAirlock);
  for (const side of [-1, 1]) {
    const reveal = add(new THREE.Mesh(rounded(0.16, 2.25, 0.59, 0.04), ivory), side * 0.86, 1.47, 0, solAirlock);
    reveal.name = 'solarium-airlock-jamb-reveal';
    const hatch = add(new THREE.Mesh(rounded(0.17, 0.25, 0.16, 0.035), copper), side * 0.75, 1.20, 0.23, solAirlock);
    hatch.name = 'solarium-airlock-latch';
  }
  // Actual irrigation pipework links the planter annulus to a low service box.
  pipe([[2.75, 0.74, -2.76], [2.83, 1.2, -2.78], [2.64, 1.44, -2.76],
    [2.28, 1.44, -2.72]], 0.065, copper, solarium, 'solarium-irrigation-return');
  const pump = add(new THREE.Mesh(rounded(0.83, 0.61, 0.46, 0.08), teal), 2.33, 0.54, -2.66, solarium);
  pump.rotation.y = -0.78;
  pump.name = 'solarium-irrigation-pump';
  mergeLandmarkParts(solGlass);
  // A shared, merged undergrowth bed keeps the greenhouse readable at a distance.
  const leafGeo = createHomeworldLeafGeometry();
  const leaves = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = 1.05 + (i % 4) * 0.35;
    for (let j = 0; j < 7; j++) leaves.push({ geo: leafGeo,
      position: [Math.cos(a) * r, 0.52 + (i % 3) * 0.12, Math.sin(a) * r],
      rotation: [-0.8, j / 7 * Math.PI * 2 + a, 0], scale: 0.65 + (i % 3) * 0.14 });
  }
  const leafMesh = new THREE.Mesh(mergeTransformedGeometries(leaves), leafMats[1]);
  leafMesh.castShadow = true;
  solarium.add(leafMesh);
  leafGeo.dispose();
  homeworldGroup.add(solarium);
  colliders.push({ id: 'hw_solarium', x: 21.2, z: 4.2, radius: 4.35, minY: 419, maxY: 425.2, occluder: true });

  // A real promenade establishes scale and directs the player through the district.
  const promenadeGeometry = new THREE.PlaneGeometry(12.5, 1.75, 32, 4);
  promenadeGeometry.rotateX(-Math.PI / 2);
  promenadeGeometry.rotateY(-0.14);
  const promenadePositions = promenadeGeometry.attributes.position;
  for (let i = 0; i < promenadePositions.count; i++) {
    promenadePositions.setY(i, localGroundY(17.0 + promenadePositions.getX(i), 6.0 + promenadePositions.getZ(i)) + 0.012);
  }
  promenadeGeometry.computeVertexNormals();
  const promenade = new THREE.Mesh(promenadeGeometry, pathMat);
  add(promenade, 17.0, 0, 6.0);
  // Short flush engineering inlays follow the same gently rising meadow.
  for (let i = 0; i < 18; i++) {
    const x = 11.1 + i * 0.65, z = 6.0 + (x - 17.0) * 0.141;
    const inlay = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.004, 0.055), copper);
    inlay.rotation.y = -0.14;
    add(inlay, x, localGroundY(x, z) + 0.016, z);
  }
  for (const x of [12.0, 15.4, 18.8, 22.2]) {
    const planter = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.32, 0.72, 3, 0.1), ceramic);
    const z = 7.18 - (x - 12) * 0.08;
    const y = localGroundY(x, z);
    add(planter, x, y + 0.18, z);
    const plantParts = [];
    const plantLeaf = createHomeworldLeafGeometry();
    for (let j = 0; j < 9; j++) plantParts.push({ geo: plantLeaf,
      position: [0, 0.06 + (j % 3) * 0.04, 0], rotation: [-0.9, j / 9 * Math.PI * 2, 0], scale: 0.72 });
    const plant = new THREE.Mesh(mergeTransformedGeometries(plantParts), leafMats[Math.round(x / 3) % leafMats.length]);
    plantLeaf.dispose();
    add(plant, x, y + 0.34, z);
    colliders.push({ id: `hw_promenade_planter_${x}`, x, z, radius: 0.75,
      minY: 419 + y, maxY: 421.2 + y });
  }

  // Sculpted Emerald Gateway Archway + Promenade Benches + Starweaver Homecoming Monument!
  const transit = new THREE.Group();
  transit.position.set(2.8, 0, 13.6);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.24, 10, 48, Math.PI), teal);
  arch.scale.y = 0.55;
  add(arch, 0, 6.4, 0, transit);
  const archTrim = new THREE.Mesh(new THREE.TorusGeometry(7.38, 0.075, 8, 48, Math.PI * 0.92), copper);
  archTrim.scale.y = 0.55;
  archTrim.rotation.z = Math.PI * 0.04;
  add(archTrim, 0, 6.42, 0, transit);
  for (const x of [-7.2, 7.2]) {
    const p = new THREE.Mesh(new RoundedBoxGeometry(0.62, 6.4, 0.62, 3, 0.1), ivory);
    add(p, x, 3.2, 0, transit);
    const basePlinth = new THREE.Mesh(new RoundedBoxGeometry(0.96, 0.52, 0.96, 2, 0.08), dark);
    add(basePlinth, x, 0.26, 0, transit);
    const capCollar = new THREE.Mesh(new RoundedBoxGeometry(0.78, 0.22, 0.78, 2, 0.05), copper);
    add(capCollar, x, 5.72, 0, transit);
  }
  const rail = new THREE.Mesh(new RoundedBoxGeometry(15.0, 0.20, 0.30, 3, 0.06), copper);
  add(rail, 0, 5.7, 0, transit);
  const archCrest = new THREE.Mesh(new RoundedBoxGeometry(2.8, 0.14, 0.36, 2, 0.04), cyan);
  add(archCrest, 0, 10.35, 0, transit);
  homeworldGroup.add(transit);
  colliders.push({ id: 'hw_transit_left', x: -4.4, z: 13.6, radius: 0.7, minY: 419, maxY: 427.5, occluder: true });
  colliders.push({ id: 'hw_transit_right', x: 10.0, z: 13.6, radius: 0.7, minY: 419, maxY: 427.5, occluder: true });

  // Colony Promenade Benches overlooking the pond & flower beds
  for (const [bx, bz, byaw] of [[9.8, 2.2, -0.55], [16.5, 3.8, -0.14]]) {
    const by = localGroundY(bx, bz);
    const seat = new THREE.Mesh(rounded(1.55, 0.10, 0.52, 0.03), ivory);
    seat.rotation.y = byaw;
    add(seat, bx, by + 0.44, bz);
    const back = new THREE.Mesh(rounded(1.52, 0.34, 0.08, 0.025), copper);
    back.rotation.y = byaw;
    add(back, bx - Math.sin(byaw) * 0.22, by + 0.66, bz - Math.cos(byaw) * 0.22);
    for (const s of [-0.58, 0.58]) {
      const leg = new THREE.Mesh(rounded(0.12, 0.44, 0.46, 0.02), dark);
      leg.rotation.y = byaw;
      add(leg, bx + Math.cos(byaw) * s, by + 0.22, bz - Math.sin(byaw) * s);
    }
    colliders.push({ id: `hw_bench_${bx}`, x: bx, z: bz, radius: 0.82, minY: 419 + by, maxY: 421.1 + by });
  }

  // Pioneer Homecoming Monument Obelisk at West Plaza (-9.5, 14.5) — awakens with a golden starlight crest upon completing Mira's Watch!
  const monX = -9.5, monZ = 14.5;
  const monY = localGroundY(monX, monZ);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.82, 0.22, 8), pathMat), monX, monY + 0.11, monZ);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.32, 0.34, 8), dark), monX, monY + 0.38, monZ);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.68, 2.65, 6), ivory), monX, monY + 1.85, monZ);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.50, 0.50, 0.14, 6), copper), monX, monY + 1.15, monZ);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 6), teal), monX, monY + 2.45, monZ);

  const monumentStarRig = new THREE.Group();
  monumentStarRig.name = 'homeworld-monument-star-crest';
  monumentStarRig.position.set(monX, monY + 3.68, monZ);
  const starGoldMat = new THREE.MeshStandardMaterial({
    name: 'colony-monument-gold',
    color: '#ffe484', emissive: '#ffaa28', emissiveIntensity: 0.65, roughness: 0.22, metalness: 0.65
  });
  const starCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), starGoldMat);
  starCore.scale.set(1.0, 1.46, 1.0);
  const starRaysH = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), starGoldMat);
  starRaysH.scale.set(2.35, 0.36, 0.36);
  const starRaysZ = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 0), starGoldMat);
  starRaysZ.scale.set(0.36, 0.36, 2.35);
  const starHalo = new THREE.Mesh(new THREE.TorusGeometry(0.64, 0.036, 8, 32), starGoldMat);
  starHalo.rotation.x = Math.PI * 0.35;
  const innerHalo = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.026, 8, 28), starGoldMat);
  innerHalo.rotation.y = Math.PI * 0.28;
  innerHalo.rotation.z = Math.PI * 0.32;
  monumentStarRig.add(starCore, starRaysH, starRaysZ, starHalo, innerHalo);
  monumentStarRig.userData.goldMat = starGoldMat;
  monumentStarRig.userData.innerHalo = innerHalo;
  homeworldGroup.add(monumentStarRig);
  anim.monumentStarRig = monumentStarRig;
  colliders.push({ id: 'hw_monument_obelisk', x: monX, z: monZ, radius: 1.55,
    minY: 419 + monY, maxY: 424.2 + monY, occluder: true });

  // Residents share the colony crew's tailored equipment and PBR batches,
  // with working poses at the survey approach, utility node and grow beds.
  anim.residents = buildHomeworldResidents(homeworldGroup, colliders);

  // Maintenance drones orbiting the promenade are animated in a single update pass.
  const droneShell = new THREE.MeshPhysicalMaterial({ color: '#eaf9f6', roughness: 0.22, metalness: 0.4, clearcoat: 0.8 });
  for (const [x, z, phase] of [[7.0, 6.0, 0.6], [14.5, 9.4, 2.0], [22.8, 7.2, 3.4]]) {
    const drone = new THREE.Group();
    drone.position.set(x, 1.3, z);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), droneShell);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.07, 8, 20), cyan);
    ring.rotation.x = Math.PI / 2;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), cyan);
    eye.position.z = 0.38;
    drone.add(shell, ring, eye);
    mergeLandmarkParts(drone);
    homeworldGroup.add(drone);
    anim.hoverBots.push({ group: drone, baseY: 1.3, phase, mode: 'drone' });
  }

  // Low profile beacons are landmarks and avoid placing more tall occluders around
  // the 6.2 m landing pad. Their rings animate rather than spawning particles.
  for (const [x, z] of [[4.6, 10.8], [18.3, 11.7], [25.2, 1.0]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.35, 10), dark);
    add(post, x, 0.68, z);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 8, 18), cyan);
    ring.rotation.x = Math.PI / 2;
    const base = localGroundY(x, z);
    post.position.y = base + 0.68;
    add(ring, x, base + 1.42, z, homeworldGroup);
    anim.beaconRings.push(ring);
    colliders.push({ id: `hw_beacon_${x}`, x, z, radius: 0.22,
      minY: 419 + base, maxY: 421.6 + base });
  }

  // Water-recovery spine: a maintainable heat exchanger, with folded ceramic
  // armor, recessed radiator fins and continuous copper return lines. All
  // ground-level equipment stays inside its existing 1 m collision cylinder;
  // the old wide, uncollidable decorative sails are deliberately retired.
  const utility = new THREE.Group();
  utility.name = 'homeworld-utility-spine';
  utility.position.set(5.8, 0, 17.4);
  sector(utility, dark, [[0.84, 0.0], [0.94, 0.10], [0.94, 0.24], [0.79, 0.34],
    [0.69, 0.34], [0.69, 0]], 0, Math.PI * 2, 'utility-chamfered-ground-plinth', 32);
  const coreProfile = [[0.57, 0.29], [0.66, 0.43], [0.66, 2.20], [0.57, 2.39],
    [0.39, 2.48], [0.03, 2.48], [0.03, 0.29]];
  sector(utility, dark, coreProfile, 0, Math.PI * 2, 'utility-pressure-manifold', 28);
  const armorProfile = shellProfile([[0.73, 0.35], [0.80, 0.52], [0.80, 1.90],
    [0.73, 2.28], [0.57, 2.46], [0.17, 2.54]], 0.11);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2;
    sector(utility, i % 2 ? ivory : ceramic, armorProfile, a + 0.13, Math.PI / 2 - 0.26,
      'utility-removable-pressure-armor', 12);
    // The slotted areas between armor petals have real inset fins.
    const finGroup = new THREE.Group();
    finGroup.rotation.y = a;
    utility.add(finGroup);
    for (let j = 0; j < 11; j++) {
      const fin = add(new THREE.Mesh(rounded(0.22, 0.045, 0.12, 0.012), copper), 0, 0.65 + j * 0.12, 0.745, finGroup);
      fin.name = 'utility-recessed-radiator-fin';
    }
    for (const y of [0.45, 2.21]) {
      const lock = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.065, 6), copper),
        Math.sin(a + 0.28) * 0.81, y, Math.cos(a + 0.28) * 0.81, utility);
      lock.rotation.x = Math.PI / 2;
      lock.rotation.z = -a - 0.28;
      lock.name = 'utility-quarter-turn-catch';
    }
  }
  // The front service door is set behind its gasket, with a recessed sight
  // gauge and a handwheel that can be read from the engineer's working pose.
  const serviceFrame = add(new THREE.Mesh(pressureDoorFrame(0.66, 1.17, 0.075, 0.10), teal), 0, 1.23, -0.78, utility);
  serviceFrame.rotation.y = Math.PI;
  serviceFrame.name = 'utility-recessed-service-frame';
  const serviceDoor = add(new THREE.Mesh(rounded(0.48, 0.97, 0.06, 0.06), dark), 0, 1.23, -0.77, utility);
  serviceDoor.name = 'utility-recessed-service-hatch';
  add(new THREE.Mesh(rounded(0.09, 0.59, 0.025, 0.025), cyan), -0.13, 1.32, -0.818, utility);
  const handwheel = add(new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 6, 16), copper), 0.10, 1.02, -0.835, utility);
  handwheel.name = 'utility-service-handwheel';
  for (const x of [-0.58, 0.58]) {
    pipe([[x * 0.75, 0.44, -0.40], [x, 0.52, -0.42], [x, 1.90, -0.42],
      [x * 0.75, 2.25, -0.40]], 0.057, copper, utility, 'utility-continuous-return-pipe');
    for (const y of [0.59, 1.91]) {
      const flange = add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.065, 12), teal), x, y, -0.42, utility);
      flange.name = 'utility-pipe-flange';
    }
  }
  // A folded fin stack is enclosed by a perimeter carrier, rather than a pair
  // of neon paper sails. Its narrow silhouette remains below the old height cap.
  const neck = add(new THREE.Mesh(rounded(0.40, 0.80, 0.34, 0.06), teal), 0, 2.84, 0, utility);
  neck.name = 'utility-radiator-bearing';
  const radiatorFrame = add(new THREE.Mesh(pressureDoorFrame(1.34, 1.35, 0.11, 0.20), ivory), 0, 3.65, 0, utility);
  radiatorFrame.name = 'utility-folded-radiator-carrier';
  for (let j = 0; j < 10; j++) {
    const blade = add(new THREE.Mesh(rounded(1.08, 0.048, 0.34, 0.012), dark), 0, 3.16 + j * 0.11, 0, utility);
    blade.rotation.x = -0.35;
    blade.name = 'utility-heat-exchanger-blade';
  }
  for (const x of [-0.50, 0.50]) {
    pipe([[x, 2.34, 0], [x, 2.85, 0], [x, 3.08, 0.02], [x, 4.14, 0.02]],
      0.035, copper, utility, 'utility-radiator-feed');
  }
  homeworldGroup.add(utility);
  colliders.push({ id: 'hw_utility_spine', x: 5.8, z: 17.4, radius: 1.0, minY: 419, maxY: 424.8, occluder: true });

  // Small modular grow-beds around the solarium keep the lushness grounded in
  // visible infrastructure rather than isolated decorative spheres.
  const growBedMat = new THREE.MeshStandardMaterial({ color: '#214e4b', roughness: 0.72, metalness: 0.18 });
  const growSoilMat = new THREE.MeshStandardMaterial({ color: '#4d3e30', roughness: 0.92, metalness: 0.04 });
  const growLeafMat = new THREE.MeshStandardMaterial({ color: '#68a462', roughness: 0.74 });
  const growCrownMat = new THREE.MeshStandardMaterial({ color: '#94cb72', roughness: 0.66 });
  for (let i = 0; i < 5; i++) {
    const bed = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.18, 0.72, 3, 0.08), growBedMat);
    const soil = new THREE.Mesh(new RoundedBoxGeometry(1.16, 0.05, 0.58, 2, 0.04), growSoilMat);
    const bx = 14.8 + i * 1.7;
    const bz = 10.1 + Math.sin(i * 0.9) * 0.55;
    const by = localGroundY(bx, bz);
    add(bed, bx, by + 0.10, bz);
    add(soil, bx, by + 0.19, bz);
    for (let j = 0; j < 3; j++) {
      const px = bx - 0.36 + j * 0.36;
      const pz = bz + (j % 2 ? 0.09 : -0.09);
      const py = by + 0.22;
      const core = new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.18, 3, 7), growCrownMat);
      core.position.set(px, py + 0.14, pz);
      core.rotation.z = (j - 1) * 0.16;
      core.castShadow = true;
      staticDecorations.add(core);
      for (let frond = 0; frond < 4; frond++) {
        const fa = (frond / 4) * Math.PI * 2 + (i + j) * 0.45;
        const leaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.042, 0.20, 3, 6), frond % 2 === 0 ? growLeafMat : growCrownMat);
        leaf.position.set(px + Math.cos(fa) * 0.08, py + 0.11 + (frond % 2) * 0.03, pz + Math.sin(fa) * 0.08);
        leaf.rotation.set(Math.sin(fa) * 0.52, fa, -Math.cos(fa) * 0.52);
        leaf.scale.set(1.18, 1.0, 0.58);
        leaf.castShadow = true;
        staticDecorations.add(leaf);
      }
    }
    colliders.push({ id: `hw_growbed_${i}`, x: bx, z: bz, radius: 0.76,
      minY: 419 + by, maxY: 420.7 + by });
  }
  const settlementBatch = new THREE.Group();
  settlementBatch.name = 'homeworld-settlement-static';
  homeworldGroup.add(settlementBatch);
  homeworldGroup.updateMatrixWorld(true);
  mergeLandmarkParts(settlementBatch, [commons, solarium, transit, utility, staticDecorations], true);

  // Updraft Thermal Columns (shared visual helper, zero per-frame allocations)
  const updraftMat = new THREE.MeshBasicMaterial({
    color: '#6fffe0',
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const updraftBeamMat = new THREE.MeshBasicMaterial({
    color: '#6fffe0',
    transparent: true,
    opacity: 0.14,
    depthWrite: false
  });
  anim.updraftRings = buildUpdraftVisuals(homeworldGroup, HOMEWORLD_UPDRAFT_THERMALS, localGroundY, {
    prefix: 'hw-updraft',
    ringRadius: 1.6,
    beamHeight: 16,
    sharedRingMat: updraftMat,
    sharedBeamMat: updraftBeamMat
  });

  // 8 Emerald Valley Aerial Photon Rings
  const ringPendingMat = new THREE.MeshStandardMaterial({
    color: '#52ffb8',
    emissive: '#1fe89c',
    emissiveIntensity: 1.35,
    roughness: 0.25,
    metalness: 0.45
  });
  const ringClearedMat = new THREE.MeshStandardMaterial({
    color: '#ffe078',
    emissive: '#ffaa28',
    emissiveIntensity: 1.75,
    roughness: 0.22,
    metalness: 0.65
  });
  anim.ringPendingMat = ringPendingMat;
  anim.ringClearedMat = ringClearedMat;
  anim.aerialRings = [];
  const photonRingGeo = new THREE.TorusGeometry(2.35, 0.16, 10, 28);
  for (let i = 0; i < HOMEWORLD_AERIAL_RINGS.length; i++) {
    const r = HOMEWORLD_AERIAL_RINGS[i];
    const ringMesh = new THREE.Mesh(photonRingGeo, ringPendingMat);
    ringMesh.position.set(r.x, r.yOffset, r.z);
    ringMesh.rotation.y = (i * 0.68) % Math.PI;
    ringMesh.name = `hw-aerial-ring-${r.id}`;
    homeworldGroup.add(ringMesh);
    anim.aerialRings.push({ id: r.id, mesh: ringMesh, baseY: r.yOffset, phase: i * 0.8 });
  }

  // Waterfall Mist & Bioluminescent Star-Flora (Nursery Transplant)
  anim.waterfallMist = [];
  const mistGeo = new THREE.TorusGeometry(2.1, 0.22, 6, 20);
  mistGeo.rotateX(Math.PI / 2);
  const mistMat = new THREE.MeshBasicMaterial({
    color: '#dffeff',
    transparent: true,
    opacity: 0.28,
    depthWrite: false
  });
  const wfBaseY = localGroundY(46.4, 48.4);
  for (let k = 0; k < 4; k++) {
    const mist = new THREE.Mesh(mistGeo, mistMat);
    mist.position.set(46.4 + (k % 2 ? 0.35 : -0.35), wfBaseY + 0.25 + k * 0.38, 48.4);
    mist.name = `hw-waterfall-mist-${k}`;
    homeworldGroup.add(mist);
    anim.waterfallMist.push({ mesh: mist, baseY: wfBaseY + 0.25 + k * 0.38, phase: k * 0.25 });
  }

  anim.nurseryFloraGroup = new THREE.Group();
  anim.nurseryFloraGroup.name = 'hw-nursery-starflora';
  anim.nurseryFloraGroup.visible = false;
  const floraMat = new THREE.MeshStandardMaterial({
    color: '#ff96e8',
    emissive: '#e855ff',
    emissiveIntensity: 1.65,
    roughness: 0.25
  });
  const floraGeo = new THREE.OctahedronGeometry(0.18, 0);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    const fx = 34 + Math.cos(ang) * (2.6 + (i % 2) * 1.4);
    const fz = 8 + Math.sin(ang) * (2.4 + (i % 3) * 1.1);
    const fy = localGroundY(fx, fz) + 0.35;
    const flower = new THREE.Mesh(floraGeo, floraMat);
    flower.position.set(fx, fy, fz);
    flower.userData.baseY = fy;
    anim.nurseryFloraGroup.add(flower);
  }
  homeworldGroup.add(anim.nurseryFloraGroup);
  return anim;
}

export function updateHomeworldEnhancements(anim, elapsed, dt, opts = {}) {
  if (!anim) return;
  const {
    surveyCompleted = false,
    atmoMode = 'dawn',
    flightRingsMap = null,
    skyTrialHitSet = null,
    nurseryBloomed = false
  } = opts;
  if (anim.residents) updateHomeworldResidents(anim.residents, elapsed);
  for (let i = 0; i < anim.hoverBots.length; i++) {
    const item = anim.hoverBots[i];
    item.group.position.y = item.baseY + Math.sin(elapsed * 2.4 + item.phase) * 0.18;
    item.group.rotation.y += dt * 0.9;
  }
  for (let i = 0; i < anim.beaconRings.length; i++) {
    anim.beaconRings[i].rotation.z = elapsed * (0.7 + i * 0.12);
    anim.beaconRings[i].scale.setScalar(0.92 + Math.sin(elapsed * 2.2 + i) * 0.08);
  }
  if (anim.monumentStarRig) {
    const isNight = atmoMode === 'night';
    const isSunset = atmoMode === 'sunset';
    const spinSpeed = surveyCompleted ? (isNight ? 1.85 : isSunset ? 1.65 : 1.45) : 0.35;
    anim.monumentStarRig.rotation.y = elapsed * spinSpeed;
    const innerHalo = anim.monumentStarRig.userData.innerHalo;
    if (innerHalo) {
      innerHalo.rotation.x = -elapsed * (spinSpeed * 1.25);
    }
    const pulseScale = surveyCompleted && (isSunset || isNight)
      ? 1.0 + Math.sin(elapsed * 2.8) * (isNight ? 0.09 : 0.05)
      : 1.0;
    anim.monumentStarRig.scale.setScalar(pulseScale);
    const goldMat = anim.monumentStarRig.userData.goldMat;
    if (goldMat) {
      const baseCompleted = isNight
        ? 3.75 + Math.sin(elapsed * 3.2) * 0.35
        : isSunset
          ? 2.95 + Math.sin(elapsed * 2.6) * 0.22
          : 2.15;
      const targetEmissive = surveyCompleted ? baseCompleted : 0.55;
      if (Math.abs(goldMat.emissiveIntensity - targetEmissive) > 0.01) {
        goldMat.emissiveIntensity = targetEmissive;
      }
    }
  }
  updateUpdraftVisuals(anim.updraftRings, elapsed, 0.42);
  if (anim.aerialRings) {
    for (let i = 0; i < anim.aerialRings.length; i++) {
      const item = anim.aerialRings[i];
      const cleared = Boolean(flightRingsMap && flightRingsMap[item.id]);
      const targetMat = cleared ? anim.ringClearedMat : anim.ringPendingMat;
      if (item.mesh.material !== targetMat) {
        item.mesh.material = targetMat;
      }
      if (skyTrialHitSet) {
        const hitThisTrial = skyTrialHitSet.has(item.id);
        item.mesh.scale.setScalar(hitThisTrial ? 0.78 : 1.14 + Math.sin(elapsed * 5.2 + item.phase) * 0.14);
        item.mesh.rotation.y += dt * (hitThisTrial ? 0.45 : 2.1);
      } else {
        item.mesh.scale.setScalar(1.0);
        item.mesh.rotation.y += dt * (cleared ? 0.55 : 0.95);
      }
      item.mesh.position.y = item.baseY + Math.sin(elapsed * 1.9 + item.phase) * 0.24;
    }
  }
  if (anim.waterfallMist) {
    for (let i = 0; i < anim.waterfallMist.length; i++) {
      const m = anim.waterfallMist[i];
      const c = (elapsed * 0.65 + m.phase) % 1;
      m.mesh.scale.setScalar(0.68 + c * 0.92);
      m.mesh.position.y = (m.baseY ?? m.mesh.position.y) + c * 0.55;
      m.mesh.rotation.y = elapsed * (i % 2 ? 0.45 : -0.45);
    }
  }
  if (anim.colonyGlassMat) {
    const targetGlassEmissive = atmoMode === 'night' ? 0.62 : atmoMode === 'sunset' ? 0.44 : 0.26;
    if (Math.abs(anim.colonyGlassMat.emissiveIntensity - targetGlassEmissive) > 0.01) {
      anim.colonyGlassMat.emissiveIntensity = targetGlassEmissive;
      anim.colonyGlassMat.emissive.set(
        atmoMode === 'night' ? '#4de6b8' : atmoMode === 'sunset' ? '#ff9d5c' : '#22cfa8'
      );
    }
  }
  if (anim.nurseryFloraGroup) {
    anim.nurseryFloraGroup.visible = Boolean(nurseryBloomed);
    if (nurseryBloomed) {
      const children = anim.nurseryFloraGroup.children;
      for (let i = 0; i < children.length; i++) {
        const c = children[i];
        c.position.y = c.userData.baseY + Math.sin(elapsed * 2.4 + i * 0.9) * 0.08;
        c.rotation.y = elapsed * 1.2 + i;
      }
    }
  }
}
