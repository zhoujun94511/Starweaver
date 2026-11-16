import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../data/homeworldData.js';
import { createUtilityRoverBot } from '../entities/companionBotFactory.js';

const CREAM = '#d6d9c9';
const INK = '#263741';
const METAL = '#87979b';
const GOLD = '#bd9756';
const GLASS = '#173a48';
const colonyMaterials = new WeakMap();

// Each material is shared by the entire welcoming party. Role colours live in
// vertex attributes, so straps, seams and equipment do not each cost a draw.
function characterMaterials(pbrLibrary) {
  const hull = pbrLibrary?.hull_white;
  const alloy = pbrLibrary?.titanium_dark;
  return {
    shell: new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.43, metalness: 0.22,
      clearcoat: 0.36, clearcoatRoughness: 0.27,
      map: hull?.map || null, normalMap: hull?.normalMap || null,
      normalScale: new THREE.Vector2(0.15, 0.15)
    }),
    textile: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, metalness: 0.03
    }),
    metal: new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.37, metalness: 0.76,
      normalMap: alloy?.normalMap || null,
      normalScale: new THREE.Vector2(0.18, 0.18)
    }),
    glass: new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.16, metalness: 0.38,
      clearcoat: 0.8, clearcoatRoughness: 0.1,
      emissive: '#24424b', emissiveIntensity: 0.18
    })
  };
}

function materialsFor(homeworldGroup, pbrLibrary) {
  if (!colonyMaterials.has(homeworldGroup)) {
    colonyMaterials.set(homeworldGroup, characterMaterials(pbrLibrary));
  }
  return colonyMaterials.get(homeworldGroup);
}

function batchParts(group, materials, rig = null) {
  const buckets = new Map();
  const transform = new THREE.Object3D();
  const tint = new THREE.Color();
  let joint = 0;
  let secondJoint = 0;
  let blendLow = 0;
  let blendHigh = 0;
  let frameX = 0;
  let frameY = 0;
  let frameZ = 0;
  return {
    bind(name, secondName = null, low = 0, high = 0) {
      joint = rig ? rig.indices[name] : 0;
      secondJoint = secondName ? rig.indices[secondName] : joint;
      blendLow = low;
      blendHigh = high;
    },
    frame(x = 0, y = 0, z = 0) {
      frameX = x;
      frameY = y;
      frameZ = z;
    },
    add(name, geometry, key, color, x = 0, y = 0, z = 0,
      rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
      transform.position.set(x + frameX, y + frameY, z + frameZ);
      transform.rotation.set(rx, ry, rz);
      transform.scale.set(sx, sy, sz);
      transform.updateMatrix();
      // Rounded boxes and extrusions are not indexed; normalise all sources
      // before merging to keep batching independent of geometry constructors.
      let geo = geometry;
      if (geometry.index) {
        geo = geometry.toNonIndexed();
        geometry.dispose();
      }
      geo.applyMatrix4(transform.matrix);
      tint.set(color);
      const colours = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < colours.length; i += 3) {
        colours[i] = tint.r;
        colours[i + 1] = tint.g;
        colours[i + 2] = tint.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
      if (rig) {
        const count = geo.attributes.position.count;
        const indices = new Uint16Array(count * 4);
        const weights = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
          const blend = joint === secondJoint ? 0 :
            THREE.MathUtils.smoothstep(geo.attributes.position.getY(i), blendLow, blendHigh);
          indices[i * 4] = joint;
          indices[i * 4 + 1] = secondJoint;
          weights[i * 4] = 1 - blend;
          weights[i * 4 + 1] = blend;
        }
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
        geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
      }
      if (!buckets.has(key)) buckets.set(key, { geometries: [], names: [] });
      buckets.get(key).geometries.push(geo);
      buckets.get(key).names.push(name);
    },
    finish() {
      for (const [key, bucket] of buckets) {
        const geometry = mergeGeometries(bucket.geometries, false);
        if (!geometry) throw new Error(`Homeworld character batch failed: ${group.name}/${key}`);
        const mesh = rig ? new THREE.SkinnedMesh(geometry, materials[key]) : new THREE.Mesh(geometry, materials[key]);
        mesh.name = `${group.name}-${key}`;
        mesh.userData.parts = bucket.names;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (rig) {
          // Hands can extend beyond the tailored coat's rest bounds. The party
          // is small and its parent owns visibility, so avoid stale skin bounds.
          mesh.frustumCulled = false;
          rig.meshes.push(mesh);
        }
        group.add(mesh);
        for (const source of bucket.geometries) source.dispose();
      }
    }
  };
}

const box = (x, y, z, bevel = 0.04) =>
  new RoundedBoxGeometry(x, y, z, 2, bevel);
const orb = (r) => new THREE.SphereGeometry(r, 12, 8);

// A tailored silhouette: elliptical sections taper through waist, shoulder,
// knee and ankle instead of unmodified cylinders and identical pill limbs.
function tailored(sections, segments = 14) {
  // Arm sections are authored from shoulder down, while jackets/helmets run
  // from feet up. Canonicalise Y order so both expose outward-facing surfaces.
  const rings = sections[0][0] > sections[sections.length - 1][0]
    ? sections.slice().reverse() : sections;
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let j = 0; j < rings.length; j++) {
    const [y, rx, rz, cx = 0, cz = 0] = rings[j];
    for (let i = 0; i <= segments; i++) {
      const a = i / segments * Math.PI * 2;
      vertices.push(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz);
      uvs.push(i / segments, j / (rings.length - 1));
      if (j && i) {
        const p = j * (segments + 1) + i;
        indices.push(p - 1, p - segments - 1, p - segments - 2,
          p - 1, p, p - segments - 1);
      }
    }
  }
  for (const [row, reverse] of [[0, false], [rings.length - 1, true]]) {
    const start = row * (segments + 1);
    for (let i = 1; i < segments - 1; i++) {
      if (reverse) indices.push(start, start + i + 1, start + i);
      else indices.push(start, start + i, start + i + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normals = geometry.attributes.normal;
  for (let row = 0; row < rings.length; row++) {
    const first = row * (segments + 1);
    const last = first + segments;
    const nx = normals.getX(first) + normals.getX(last);
    const ny = normals.getY(first) + normals.getY(last);
    const nz = normals.getZ(first) + normals.getZ(last);
    const length = Math.hypot(nx, ny, nz) || 1;
    normals.setXYZ(first, nx / length, ny / length, nz / length);
    normals.setXYZ(last, nx / length, ny / length, nz / length);
  }
  return geometry;
}

function clothPanel(points, depth = 0.035) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelSegments: 2, steps: 1,
    bevelSize: 0.014, bevelThickness: 0.012, curveSegments: 6
  });
}

function addHelmet(parts, role, colour) {
  parts.add('sculpted-helmet', tailored([
    [1.55, 0.22, 0.21], [1.60, 0.29, 0.26],
    [1.79, 0.35, 0.30], [1.98, 0.31, 0.27],
    [2.08, 0.21, 0.20], [2.11, 0.08, 0.09]
  ]), 'shell', CREAM);
  parts.add('sealed-dark-face-recess', box(0.57, 0.32, 0.16, 0.10), 'metal', INK, 0, 1.80, 0.25);
  parts.add('smoked-panoramic-visor', box(0.49, 0.24, 0.075, 0.085), 'glass', GLASS, 0, 1.81, 0.335);
  parts.add('lower-jaw-guard', box(0.43, 0.085, 0.12, 0.025), 'shell', colour, 0, 1.62, 0.265);
  parts.add('collar-seal', tailored([[1.49, 0.24, 0.20], [1.57, 0.25, 0.21]]), 'metal', INK);
  for (const side of [-1, 1]) {
    parts.add('communications-ear', new THREE.CylinderGeometry(0.115, 0.12, 0.07, 12),
      'metal', METAL, side * 0.328, 1.81, -0.015, 0, 0, Math.PI / 2);
    parts.add('ear-cap', new THREE.CylinderGeometry(0.081, 0.087, 0.075, 12),
      'shell', colour, side * 0.358, 1.81, -0.015, 0, 0, Math.PI / 2);
  }
  parts.add('crown-identity-inlay', box(0.10, 0.045, 0.29, 0.015), 'metal',
    role === 'captain' ? GOLD : METAL, 0, 2.075, 0.035, 0.12);
}

function limbSolver(upper, lower, end) {
  return {
    upper, lower, end,
    lengthA: lower.position.length(), lengthB: end.position.length(),
    restA: lower.position.clone().normalize(), restB: end.position.clone().normalize(),
    direction: new THREE.Vector3(), bend: new THREE.Vector3(),
    upperDirection: new THREE.Vector3(), lowerDirection: new THREE.Vector3(),
    inverse: new THREE.Quaternion(), orientation: new THREE.Quaternion(), angles: new THREE.Euler()
  };
}

function createCrewRig(group, role) {
  const rig = { bones: [], indices: {}, meshes: [] };
  const bone = (name, parent, x, y, z) => {
    const joint = new THREE.Bone();
    joint.name = `${role}-${name}`;
    joint.position.set(x, y, z);
    parent.add(joint);
    rig.indices[name] = rig.bones.length;
    rig.bones.push(joint);
    rig[name] = joint;
    return joint;
  };
  bone('hips', group, 0, 0.83, 0);
  bone('torso', rig.hips, 0, 0, 0);
  bone('head', rig.torso, 0, 0.72, 0);
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? 'L' : 'R';
    bone(`arm${suffix}`, rig.torso, side * 0.39, 0.56, 0);
    bone(`elbow${suffix}`, rig[`arm${suffix}`], 0, -0.31, 0.015);
    bone(`wrist${suffix}`, rig[`elbow${suffix}`], 0, -0.325, 0.03);
    bone(`thigh${suffix}`, rig.hips, side * 0.18, 0, 0);
    bone(`knee${suffix}`, rig[`thigh${suffix}`], 0, -0.35, 0);
    bone(`foot${suffix}`, rig[`knee${suffix}`], 0, -0.37, 0);
  }
  rig.leftArm = limbSolver(rig.armL, rig.elbowL, rig.wristL);
  rig.rightArm = limbSolver(rig.armR, rig.elbowR, rig.wristR);
  rig.leftLeg = limbSolver(rig.thighL, rig.kneeL, rig.footL);
  rig.rightLeg = limbSolver(rig.thighR, rig.kneeR, rig.footR);
  return rig;
}

// Closed-form two-bone IK. Every scratch value belongs to the rig; ceremony
// playback allocates no temporary vectors, quaternions, arrays or pose objects.
function solveLimb(limb, x, y, z, poleX, poleY, poleZ) {
  const direction = limb.direction.set(x, y, z).sub(limb.upper.position);
  const distance = THREE.MathUtils.clamp(direction.length(), 0.025,
    limb.lengthA + limb.lengthB - 0.0001);
  direction.normalize();
  const bend = limb.bend.set(poleX, poleY, poleZ);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 0.00001) bend.set(1, 0, 0).addScaledVector(direction, -direction.x);
  bend.normalize();
  const along = (limb.lengthA * limb.lengthA - limb.lengthB * limb.lengthB + distance * distance) /
    (2 * distance);
  const height = Math.sqrt(Math.max(0, limb.lengthA * limb.lengthA - along * along));
  const upper = limb.upperDirection.copy(direction).multiplyScalar(along).addScaledVector(bend, height);
  const lower = limb.lowerDirection.copy(direction).multiplyScalar(distance).sub(upper);
  upper.normalize();
  limb.upper.quaternion.setFromUnitVectors(limb.restA, upper);
  limb.inverse.copy(limb.upper.quaternion).invert();
  lower.applyQuaternion(limb.inverse).normalize();
  limb.lower.quaternion.setFromUnitVectors(limb.restB, lower);
}

function orientLimbEnd(limb, pitch = 0, yaw = 0, roll = 0) {
  limb.inverse.copy(limb.upper.quaternion).multiply(limb.lower.quaternion).invert();
  limb.orientation.setFromEuler(limb.angles.set(pitch, yaw, roll));
  limb.end.quaternion.copy(limb.inverse).multiply(limb.orientation);
}

function createArm(parts, rig, side, role, colour) {
  const suffix = side < 0 ? 'L' : 'R';
  const arm = rig[`arm${suffix}`];
  parts.frame(side * 0.39, 1.39, 0);
  parts.bind(`arm${suffix}`);
  parts.add('joint-socket', orb(0.135), 'metal', INK);
  parts.add('upper-sleeve', tailored([
    [-0.04, 0.13, 0.13], [-0.14, 0.12, 0.12],
    [-0.29, 0.10, 0.095], [-0.32, 0.085, 0.09]
  ], 10), 'shell', colour);
  parts.bind(`elbow${suffix}`);
  parts.add('elbow-articulation', orb(0.095), 'metal', METAL, 0, -0.31, 0.015);
  parts.add('tapered-forearm', tailored([
    [-0.33, 0.093, 0.09], [-0.42, 0.11, 0.10, 0, 0.025],
    [-0.55, 0.082, 0.083, 0, 0.04]
  ], 10), 'shell', CREAM);
  parts.add('cuff', box(0.18, 0.07, 0.18, 0.025), 'metal', GOLD, 0, -0.54, 0.035);
  parts.bind(`wrist${suffix}`);
  parts.add('glove', box(0.16, 0.17, 0.18, 0.045), 'metal', INK, 0, -0.635, 0.045);
  parts.add('knuckle-plate', box(0.12, 0.075, 0.035, 0.015), 'shell', colour, 0, -0.635, 0.14);
  parts.add('glove-thumb', orb(0.045), 'metal', INK, side * -0.085, -0.61, 0.095, 0, 0, side * 0.25, 0.65, 1.35, 0.75);
  if (role === 'engineer' && side < 0) {
    // Two-tone sci-fi torque wrench with rubberized grip, cyan torque ring & wide gold C-jaw
    parts.add('wrench-grip', box(0.068, 0.16, 0.082, 0.018), 'textile', INK, 0, -0.73, 0.17);
    parts.add('wrench-shaft', box(0.048, 0.22, 0.058, 0.012), 'metal', METAL, 0, -0.57, 0.17);
    parts.add('wrench-collar', new THREE.CylinderGeometry(0.042, 0.042, 0.045, 10), 'glass', '#58e8d2', 0, -0.47, 0.17);
    parts.add('wrench-head-base', box(0.16, 0.065, 0.075, 0.015), 'metal', GOLD, 0, -0.42, 0.17);
    parts.add('wrench-jaw-left', box(0.048, 0.11, 0.075, 0.012), 'metal', GOLD, -0.058, -0.35, 0.17, 0, 0, -0.15);
    parts.add('wrench-jaw-right', box(0.048, 0.11, 0.075, 0.012), 'metal', GOLD, 0.058, -0.35, 0.17, 0, 0, 0.15);
  }
  parts.frame();
  return arm;
}

function addCommandOutfit(parts) {
  parts.add('command-shoulder-mantle', tailored([
    [1.31, 0.32, 0.23], [1.48, 0.46, 0.29], [1.52, 0.30, 0.22]
  ]), 'textile', '#334e5b');
  for (const side of [-1, 1]) {
    parts.add('coat-tail', clothPanel([[side * 0.04, 1.22], [side * 0.31, 1.28],
      [side * 0.36, 0.66], [side * 0.10, 0.72]]), 'textile', '#344c57', 0, 0, -0.25);
    parts.add('ivory-lapel', clothPanel([[side * 0.04, 1.16], [side * 0.09, 1.49],
      [side * 0.28, 1.42], [side * 0.17, 1.13]]), 'shell', CREAM, 0, 0, 0.233);
    parts.add('rank-epaulette', box(0.22, 0.045, 0.14, 0.015), 'metal', GOLD, side * 0.33, 1.49, 0.075);
    for (let n = 0; n < 3; n++) {
      parts.add('rank-bars', box(0.08, 0.018, 0.018, 0.005), 'metal', GOLD,
        side * 0.25, 1.36 - n * 0.045, 0.275);
    }
  }
  parts.add('command-comm-pad', box(0.14, 0.09, 0.032, 0.012), 'metal', INK, 0.15, 1.24, 0.265);
  parts.add('command-comm-led', box(0.08, 0.032, 0.018, 0.006), 'glass', '#58e8d2', 0.15, 1.24, 0.28);
  parts.add('ship-crest', clothPanel([[0, 0.065], [-0.05, -0.04], [0.05, -0.04]], 0.015),
    'metal', GOLD, -0.17, 1.24, 0.285);
}

function addEngineeringRig(parts) {
  parts.add('load-bearing-backpack', box(0.60, 0.63, 0.30, 0.08), 'metal', INK, 0, 1.23, -0.36);
  for (const side of [-1, 1]) {
    parts.add('rig-rail', box(0.07, 0.76, 0.07, 0.018), 'metal', METAL, side * 0.25, 1.26, -0.54);
    parts.add('harness', box(0.075, 0.63, 0.05, 0.02), 'textile', INK, side * 0.22, 1.20, 0.255, 0, 0, side * -0.10);
    parts.add('cargo-pocket', box(0.20, 0.24, 0.13, 0.035), 'textile', '#85755d', side * 0.34, 0.88, -0.18);
  }
  // Folded manipulator sits above one shoulder and ends in a recognisable claw.
  parts.add('manipulator-upright', box(0.12, 0.67, 0.13, 0.035), 'metal', METAL, 0.39, 1.60, -0.37, 0, 0, -0.15);
  parts.add('manipulator-elbow', orb(0.125), 'metal', INK, 0.44, 1.91, -0.37);
  parts.add('manipulator-folded-forearm', box(0.40, 0.10, 0.12, 0.025), 'shell', '#bd8f4c', 0.57, 1.96, -0.30, 0, -0.25, 0.12);
  for (const s of [-1, 1]) {
    parts.add('manipulator-gripper', box(0.07, 0.19, 0.075, 0.015), 'metal', METAL,
      0.75 + s * 0.06, 1.87, -0.25, 0, 0, s * 0.27);
  }
  parts.add('work-apron', clothPanel([[-0.24, 1.12], [0.24, 1.12], [0.22, 0.69], [-0.20, 0.67]]),
    'textile', '#806c50', 0, 0, 0.25);
  parts.add('apron-tool-sleeve', box(0.14, 0.26, 0.045, 0.02), 'metal', METAL, 0.12, 0.91, 0.31);
}

function addBotanyPack(parts) {
  parts.add('field-sample-satchel', box(0.37, 0.50, 0.28, 0.075), 'textile', '#8a8b68', -0.40, 0.99, -0.32);
  parts.add('sample-pack-flap', box(0.40, 0.11, 0.31, 0.035), 'shell', CREAM, -0.40, 1.24, -0.31);
  parts.add('bio-scanner-housing', box(0.22, 0.15, 0.04, 0.018), 'metal', INK, 0.0, 1.19, 0.255);
  parts.add('bio-scanner-screen', box(0.16, 0.09, 0.02, 0.008), 'glass', '#5ee69c', 0.0, 1.19, 0.275);
  for (const side of [-1, 1]) {
    parts.add('pack-shoulder-clip', box(0.065, 0.16, 0.035, 0.012), 'textile', '#556e58', side * 0.22, 1.38, 0.235);
  }
  parts.add('life-support-sample-frame', box(0.49, 0.62, 0.20, 0.06), 'metal', INK, 0, 1.21, -0.33);
  for (const x of [-0.15, 0.15]) {
    parts.add('amber-specimen-window', box(0.22, 0.43, 0.17, 0.065), 'glass', '#877c3f', x, 1.27, -0.49);
    for (const y of [1.05, 1.49]) {
      parts.add('specimen-pod-seal', box(0.24, 0.075, 0.20, 0.025), 'shell', CREAM, x, y, -0.49);
    }
  }
  // Mounted behind the right hip so the open/clapping forearm path remains
  // clear; the offset side silhouette still exposes its specimen window.
  parts.add('field-specimen-capsule', box(0.23, 0.39, 0.23, 0.075), 'glass', '#627e57', 0.53, 0.93, -0.23);
  for (const y of [0.73, 1.14]) parts.add('capsule-seal', box(0.25, 0.065, 0.25, 0.025), 'metal', GOLD, 0.53, y, -0.23);
  parts.add('specimen-sprout', orb(0.085), 'shell', '#5c8159', 0.53, 1.03, -0.10, 0, 0, -0.45, 0.55, 1.3, 0.4);
  parts.add('field-collar', tailored([[1.39, 0.35, 0.255], [1.49, 0.33, 0.24]]), 'textile', '#8e9f83');
}

function addNavigationKit(parts) {
  parts.add('navigator-half-mantle', clothPanel([[-0.10, 1.50], [-0.45, 1.42],
    [-0.46, 0.83], [-0.16, 0.66], [0.01, 1.17]]), 'textile', '#55566f', 0, 0, -0.22);
  parts.add('star-chart-terminal', box(0.46, 0.34, 0.085, 0.045), 'metal', METAL, -0.40, 1.03, 0.30, -0.48, 0.12, -0.12);
  // Etched constellation lines remain readable in daylight without a neon disc.
  parts.add('star-chart-screen', box(0.39, 0.27, 0.025, 0.025), 'glass', '#284c57', -0.40, 1.045, 0.35, -0.48, 0.12, -0.12);
  for (let i = 0; i < 4; i++) {
    parts.add('chart-star', orb(0.018), 'metal', '#d8c79c',
      -0.53 + i * 0.08, 1.09 + Math.sin(i * 2) * 0.06, 0.40);
    if (i < 3) parts.add('chart-coordinate', box(0.08, 0.012, 0.008, 0.003), 'metal', '#9daea7',
      -0.49 + i * 0.08, 1.08, 0.40, 0, 0, i % 2 ? -0.6 : 0.6);
  }
  parts.add('navigation-spine', box(0.18, 0.62, 0.20, 0.055), 'metal', INK, 0.10, 1.27, -0.32);
  parts.add('survey-antenna', box(0.035, 0.50, 0.035, 0.012), 'metal', METAL, 0.20, 1.80, -0.30, 0, 0, -0.14);
  parts.add('survey-receiver', box(0.21, 0.13, 0.08, 0.035), 'shell', CREAM, 0.23, 2.04, -0.30);
  parts.add('chest-route-insignia', clothPanel([[-0.10, 0.03], [0, 0.10], [0.10, 0.03], [0, -0.07]], 0.015),
    'metal', GOLD, 0.12, 1.29, 0.26);
}

function createCrew(spec, index, materials) {
  const group = new THREE.Group();
  group.name = `homeworld-crew-${spec.role}`;
  group.position.set(spec.x, getHomeworldGroundHeight(spec.x, spec.z) - HOMEWORLD_CONFIG.baseY, spec.z);
  group.lookAt(0, 0, 1.5);
  group.userData.role = spec.role;
  group.userData.rigType = 'colony-biped';
  const rig = createCrewRig(group, spec.role);
  const parts = batchParts(group, materials, rig);
  for (const side of [-1, 1]) {
    const x = side * 0.18;
    const suffix = side < 0 ? 'L' : 'R';
    parts.bind(`knee${suffix}`, `thigh${suffix}`, 0.40, 0.56);
    parts.add('tailored-trouser-leg', tailored([
      [0.14, 0.105, 0.12], [0.30, 0.13, 0.14],
      [0.45, 0.125, 0.135], [0.62, 0.155, 0.16], [0.83, 0.16, 0.16]
    ], 12), 'textile', spec.trouser, x, 0, 0);
    parts.bind(`knee${suffix}`);
    parts.add('sculpted-shin-guard', box(0.20, 0.25, 0.12, 0.045), 'shell', CREAM, x, 0.30, 0.115, -0.06);
    parts.add('floating-knee-plate', box(0.22, 0.15, 0.085, 0.035), 'shell', spec.colour, x, 0.49, 0.13);
    parts.bind(`foot${suffix}`);
    parts.add('boot', box(0.27, 0.18, 0.43, 0.055), 'metal', INK, x, 0.11, 0.07);
    parts.add('sole', box(0.28, 0.045, 0.44, 0.018), 'metal', '#18282f', x, 0.033, 0.07);
  }
  parts.bind('hips');
  parts.add('waist-underlayer', tailored([[0.72, 0.29, 0.20], [0.90, 0.31, 0.21]]), 'textile', INK);
  parts.bind('hips', 'torso', 0.84, 0.98);
  parts.add('tailored-pressure-jacket', tailored([
    [0.82, 0.27, 0.20], [0.98, 0.29, 0.22],
    [1.26, 0.37, 0.25], [1.42, 0.36, 0.24], [1.48, 0.25, 0.19]
  ]), 'shell', spec.colour);
  parts.bind('hips');
  parts.add('utility-belt', tailored([[0.85, 0.305, 0.225], [0.92, 0.31, 0.23]]), 'textile', INK);
  parts.add('belt-buckle', box(0.12, 0.10, 0.04, 0.02), 'metal', GOLD, 0, 0.885, 0.24);
  parts.bind('torso');
  parts.add('sternum-insert', box(0.26, 0.30, 0.055, 0.055), 'textile', INK, 0, 1.27, 0.25);
  parts.bind('head');
  addHelmet(parts, spec.role, spec.colour);
  parts.bind('torso');
  if (spec.role === 'captain') addCommandOutfit(parts);
  else if (spec.role === 'engineer') addEngineeringRig(parts);
  else if (spec.role === 'botanist') addBotanyPack(parts);
  else addNavigationKit(parts);
  const armL = createArm(parts, rig, -1, spec.role, spec.colour);
  const armR = createArm(parts, rig, 1, spec.role, spec.colour);
  parts.finish();
  group.updateMatrixWorld(true);
  rig.skeleton = new THREE.Skeleton(rig.bones);
  for (const mesh of rig.meshes) mesh.bind(rig.skeleton, mesh.matrixWorld);
  return { group, armL, armR, elbowL: rig.elbowL, elbowR: rig.elbowR,
    head: rig.head, torso: rig.torso, rig, phase: index * 1.73, role: spec.role,
    baseX: spec.x, baseZ: spec.z, baseYaw: group.rotation.y,
    groundY: group.position.y, index };
}

function createUtilityBot(kind, x, z, materials) {
  const bot = createUtilityRoverBot({
    kind,
    x,
    y: getHomeworldGroundHeight(x, z) - HOMEWORLD_CONFIG.baseY,
    z,
    materials,
    batchPartsFn: batchParts,
    boxFn: box,
    orbFn: orb,
    tailoredFn: tailored,
    palette: { INK, METAL, CREAM, GOLD },
    lookAt: [0, 0, 2.2]
  });
  bot.name = `homeworld-companion-${kind}`;
  return bot;
}

export function buildHomeworldCharacters(homeworldGroup, colliders, pbrLibrary = null) {
  const materials = materialsFor(homeworldGroup, pbrLibrary);
  const specs = [
    { role: 'captain', x: -3.4, z: 7.4, colour: '#59717b', trouser: '#384b55' },
    { role: 'engineer', x: -1.65, z: 8.0, colour: '#bc9155', trouser: '#62645a' },
    { role: 'botanist', x: 1.75, z: 8.0, colour: '#849c80', trouser: '#536b5f' },
    { role: 'navigator', x: 3.5, z: 7.3, colour: '#7c7f99', trouser: '#4c5566' }
  ];
  const crew = specs.map((spec, index) => {
    const figure = createCrew(spec, index, materials);
    homeworldGroup.add(figure.group);
    const ground = getHomeworldGroundHeight(spec.x, spec.z);
    figure.collider = { id: `hw_crew_${index}`, x: spec.x, z: spec.z,
      // The captain's 12 cm invitation step stays inside this padded envelope
      // even for consumers that cached the original collider registry.
      radius: spec.role === 'engineer' || spec.role === 'captain' ? 0.78 : spec.role === 'botanist' ? 0.74 : 0.66,
      minY: ground - 1, maxY: ground + 2.5 };
    colliders.push(figure.collider);
    return figure;
  });
  const bots = [createUtilityBot('tool', -5.2, 5.4, materials), createUtilityBot('cargo', 5.2, 5.2, materials)];
  for (const bot of bots) {
    homeworldGroup.add(bot);
    const ground = getHomeworldGroundHeight(bot.position.x, bot.position.z);
    const col = { id: `hw_bot_${bot.position.x}`, x: bot.position.x, z: bot.position.z,
      radius: bot.userData.role === 'cargo' ? 0.84 : 0.67, minY: ground - 1, maxY: ground + 2.2 };
    bot.userData.collider = col;
    bot.userData.homeX = bot.position.x;
    bot.userData.homeZ = bot.position.z;
    bot.userData.homeYaw = bot.rotation.y;
    colliders.push(col);
  }
  const ceremony = createHomeworldCeremony(crew, bots);
  Object.defineProperty(crew, 'ceremony', { value: ceremony });
  resetHomeworldCeremony(ceremony);
  return { crew, bots, ceremony };
}

export function createHomeworldCeremony(crew, bots) {
  return { crew, bots, active: false, elapsed: 0, arrivedAt: -1,
    playerX: HOMEWORLD_CONFIG.spawnX, playerZ: HOMEWORLD_CONFIG.spawnZ,
    stage: 'standby' };
}

export function resetHomeworldCeremony(ceremony) {
  if (!ceremony) return;
  ceremony.active = false;
  ceremony.elapsed = 0;
  ceremony.arrivedAt = -1;
  ceremony.playerX = HOMEWORLD_CONFIG.spawnX;
  ceremony.playerZ = HOMEWORLD_CONFIG.spawnZ;
  ceremony.stage = 'standby';
  updateHomeworldCharacters(ceremony.crew, ceremony.bots, 0, 0, ceremony);
}

export function startHomeworldCeremony(ceremony) {
  if (!ceremony || ceremony.active) return;
  ceremony.active = true;
  ceremony.elapsed = 0;
  ceremony.arrivedAt = -1;
  ceremony.stage = 'landing-confirmed';
}

export function notifyHomeworldPlayerArrived(ceremony, x = HOMEWORLD_CONFIG.spawnX, z = HOMEWORLD_CONFIG.spawnZ) {
  if (!ceremony || !ceremony.active || ceremony.arrivedAt >= 0) return;
  ceremony.arrivedAt = ceremony.elapsed;
  ceremony.playerX = x;
  ceremony.playerZ = z;
  ceremony.stage = 'acknowledge';
}

const ease = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;
const shortAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const gesture = (t, riseStart, riseEnd, fallStart, fallEnd) =>
  ease(t, riseStart, riseEnd) * (1 - ease(t, fallStart, fallEnd));

function poseLegs(figure, rightZ = 0, leftZ = 0, rightLift = 0, leftLift = 0) {
  const rig = figure.rig;
  const ankleY = 0.11 - rig.hips.position.y;
  solveLimb(rig.leftLeg, -0.18, ankleY + leftLift, leftZ, 0, 0, 1);
  solveLimb(rig.rightLeg, 0.18, ankleY + rightLift, rightZ, 0, 0, 1);
  orientLimbEnd(rig.leftLeg);
  orientLimbEnd(rig.rightLeg);
}

function poseArms(figure, lx, ly, lz, rx, ry, rz,
  leftPitch = 0, leftYaw = 0, leftRoll = 0,
  rightPitch = 0, rightYaw = 0, rightRoll = 0) {
  const rig = figure.rig;
  solveLimb(rig.leftArm, lx, ly - 0.83, lz, -0.8, -0.25, 0.5);
  solveLimb(rig.rightArm, rx, ry - 0.83, rz, 0.8, -0.25, 0.5);
  orientLimbEnd(rig.leftArm, leftPitch, leftYaw, leftRoll);
  orientLimbEnd(rig.rightArm, rightPitch, rightYaw, rightRoll);
}

export function buildHomeworldResidents(homeworldGroup, colliders) {
  const materials = materialsFor(homeworldGroup);
  // Background inhabitants perform local jobs; they do not duplicate the
  // landing party's celebration or populate blocked architectural interiors.
  const specs = [
    { role: 'navigator', activity: 'survey', x: -8.6, z: 8.0,
      targetX: 11.8, targetZ: 8.2, colour: '#697a88', trouser: '#435565' },
    { role: 'engineer', activity: 'repair', x: 5.8, z: 15.2,
      targetX: 5.8, targetZ: 17.4, colour: '#a18b62', trouser: '#5e6158' },
    { role: 'botanist', activity: 'inspect-specimen', x: 19.9, z: 11.9,
      targetX: 19.9, targetZ: 10.3, colour: '#7a987d', trouser: '#51685d' }
  ];
  return specs.map((spec, index) => {
    const resident = createCrew(spec, index, materials);
    resident.group.name = `homeworld-resident-${spec.role}`;
    resident.group.rotation.set(0, Math.atan2(spec.targetX - spec.x, spec.targetZ - spec.z), 0);
    resident.group.userData.activity = spec.activity;
    resident.activity = spec.activity;
    resident.armL.rotation.x = spec.activity === 'repair' ? -1.05 : -0.67;
    resident.armR.rotation.x = spec.activity === 'repair' ? -0.84 : -0.48;
    resident.armL.rotation.z = -0.10;
    resident.armR.rotation.z = 0.10;
    homeworldGroup.add(resident.group);
    const ground = getHomeworldGroundHeight(spec.x, spec.z);
    colliders.push({ id: `hw_resident_${spec.role}`, x: spec.x, z: spec.z,
      radius: spec.role === 'engineer' ? 0.78 : spec.role === 'botanist' ? 0.74 : 0.66,
      minY: ground - 1, maxY: ground + 2.5 });
    return resident;
  });
}

export function updateHomeworldResidents(residents, elapsed) {
  for (const resident of residents) {
    const phase = elapsed * 0.70 + resident.phase;
    const motion = Math.sin(phase) * 0.035;
    resident.rig.hips.position.y = 0.83;
    resident.torso.rotation.set(0.015 + motion * 0.2, 0, 0);
    resident.head.rotation.set(resident.activity === 'survey' ? 0.10 : 0.16,
      Math.sin(phase * 0.42) * 0.045, 0);
    poseLegs(resident);
    if (resident.activity === 'repair') {
      poseArms(resident, -0.28, 1.14 + motion, 0.45, 0.30, 1.17 - motion, 0.43);
    } else if (resident.activity === 'survey') {
      poseArms(resident, -0.66, 1.03, 0.33, 0.10, 1.17 + motion, 0.47);
    } else {
      poseArms(resident, -0.12, 1.18, 0.45, 0.40, 1.13 + motion, 0.38);
    }
  }
}

export function updateHomeworldCharacters(crew, bots, elapsed, dt = 0, ceremony = crew.ceremony) {
  // totalElapsed is intentionally excluded from the ceremony. Landing/replay
  // owns a resettable clock; opening the menu or replaying never changes who
  // happens to be midway through a wave when the ship touches down.
  if (ceremony?.active) ceremony.elapsed += THREE.MathUtils.clamp(dt, 0, 0.1);
  const clock = ceremony ? ceremony.elapsed : 0;
  const active = Boolean(ceremony?.active);
  const arrived = Boolean(ceremony && ceremony.arrivedAt >= 0);
  const arrivalAge = arrived ? Math.max(0, clock - ceremony.arrivedAt) : -1;
  const attention = active ? ease(clock, 0.10, 1.05) : 0;
  if (ceremony?.active) {
    ceremony.stage = !arrived ? (clock < 0.75 ? 'landing-confirmed' : 'attention') :
      arrivalAge < 0.70 ? 'acknowledge' : arrivalAge < 2.6 ? 'captain-salute' :
        arrivalAge < 5.6 ? 'invitation' : arrivalAge < 8.5 ? 'welcome-response' : 'settled';
  }
  const settled = Boolean(ceremony?.active && ceremony.stage === 'settled');
  const idleAmt = !active ? 1.0 : settled ? ease(arrivalAge, 8.5, 9.4) : 0.0;
  const idleClock = elapsed;

  for (const figure of crew) {
    const rig = figure.rig;
    const breath = Math.sin(clock * 1.10 + figure.phase);
    const idleWave = Math.sin(idleClock * 1.65 + figure.phase);
    const idleSway = Math.cos(idleClock * 0.95 + figure.phase * 1.3);
    const idleNod = Math.sin(idleClock * 0.72 + figure.phase * 0.8);
    const playerYaw = Math.atan2((ceremony?.playerX ?? HOMEWORLD_CONFIG.spawnX) - figure.baseX,
      (ceremony?.playerZ ?? HOMEWORLD_CONFIG.spawnZ) - figure.baseZ);
    const bodyTurn = attention * (0.60 + (arrived ? ease(arrivalAge, 0.15, 1.15) * 0.40 : 0));
    figure.group.position.set(figure.baseX, figure.groundY, figure.baseZ);
    figure.group.rotation.set(0, figure.baseYaw + shortAngle(playerYaw - figure.baseYaw) * bodyTurn, 0);
    rig.hips.position.y = 0.83;
    figure.torso.rotation.set(
      breath * 0.007 + idleAmt * (0.018 + idleWave * 0.022),
      Math.sin(clock * 0.39 + figure.phase) * 0.008 + idleAmt * idleSway * 0.045,
      idleAmt * idleSway * 0.018
    );
    figure.head.rotation.set(
      breath * 0.008 + idleAmt * (0.025 + idleNod * 0.045),
      shortAngle(playerYaw - figure.group.rotation.y) * attention * 0.78 +
        Math.sin(clock * 0.46 + figure.phase) * 0.025 +
        idleAmt * Math.sin(idleClock * 0.62 + figure.phase) * 0.14,
      idleAmt * idleSway * 0.032
    );

    let lx = -0.47, ly = 0.79, lz = 0.09;
    let rx = 0.47, ry = 0.79, rz = 0.09;
    let leftPitch = 0, leftYaw = 0, leftRoll = -0.06;
    let rightPitch = 0, rightYaw = 0, rightRoll = 0.06;
    let rightFootZ = 0, leftFootZ = 0, rightLift = 0, leftLift = 0;
    const waitFade = arrived ? 1 - ease(arrivalAge, 0, 0.7) : 1;

    if (idleAmt > 0.001) {
      if (figure.role === 'captain') {
        lx = mix(lx, -0.42 + idleSway * 0.02, idleAmt);
        ly = mix(ly, 0.92 + idleWave * 0.025, idleAmt);
        lz = mix(lz, 0.22, idleAmt);
        rx = mix(rx, 0.44 - idleSway * 0.02, idleAmt);
        ry = mix(ry, 0.86 + idleWave * 0.03, idleAmt);
        rz = mix(rz, 0.16 + Math.max(0, idleNod) * 0.05, idleAmt);
      } else if (figure.role === 'engineer') {
        lx = mix(lx, -0.40, idleAmt);
        ly = mix(ly, 1.02 + idleWave * 0.02, idleAmt);
        lz = mix(lz, 0.28, idleAmt);
        rx = mix(rx, 0.43 + idleSway * 0.025, idleAmt);
        ry = mix(ry, 0.88 - idleWave * 0.025, idleAmt);
        rz = mix(rz, 0.18, idleAmt);
      } else if (figure.role === 'botanist') {
        lx = mix(lx, -0.34, idleAmt);
        ly = mix(ly, 1.06 + idleWave * 0.025, idleAmt);
        lz = mix(lz, 0.34, idleAmt);
        rx = mix(rx, 0.36 + idleSway * 0.02, idleAmt);
        ry = mix(ry, 1.00 - idleWave * 0.02, idleAmt);
        rz = mix(rz, 0.30, idleAmt);
      } else {
        lx = mix(lx, -0.52, idleAmt);
        ly = mix(ly, 1.04 + idleWave * 0.02, idleAmt);
        lz = mix(lz, 0.34, idleAmt);
        rx = mix(rx, 0.38 - idleSway * 0.02, idleAmt);
        ry = mix(ry, 0.96 + idleWave * 0.025, idleAmt);
        rz = mix(rz, 0.24, idleAmt);
      }
    }

    if (figure.role === 'captain') {
      if (arrived) {
        const advance = ease(arrivalAge, 0.65, 1.45);
        const leadFoot = ease(arrivalAge, 0.53, 1.28);
        const catchupFoot = ease(arrivalAge, 3.95, 4.75);
        const step = 0.12 * advance;
        figure.group.position.x += Math.sin(playerYaw) * step;
        figure.group.position.z += Math.cos(playerYaw) * step;
        rig.hips.position.y = 0.83 - advance * 0.014;
        rightFootZ = 0.14 * leadFoot - step;
        leftFootZ = 0.12 * catchupFoot - step;
        rightLift = Math.sin(leadFoot * Math.PI) * 0.025;
        leftLift = Math.sin(catchupFoot * Math.PI) * 0.022;
        const salute = gesture(arrivalAge, 0.85, 1.45, 2.05, 2.65);
        const invite = gesture(arrivalAge, 2.45, 3.15, 4.55, 5.45);
        const nod = gesture(arrivalAge, 1.45, 1.8, 2.02, 2.45);
        rx = mix(rx, 0.27, salute);
        ry = mix(ry, 1.84, salute);
        rz = mix(rz, 0.35, salute);
        rightRoll = mix(rightRoll, -Math.PI * 0.5, salute);
        rx = mix(rx, 0.73, invite);
        ry = mix(ry, 1.19, invite);
        rz = mix(rz, 0.31, invite);
        rightPitch = -Math.PI * 0.5 * invite;
        rightRoll = mix(rightRoll, -0.55, invite);
        lx = mix(lx, -0.18, salute * 0.40);
        ly = mix(ly, 1.05, salute * 0.40);
        lz = mix(lz, 0.30, salute * 0.40);
        figure.torso.rotation.x += nod * 0.085;
        figure.head.rotation.x += nod * 0.10;
      }
    } else if (figure.role === 'engineer') {
      // The occupied hand keeps its tool lowered; only the free hand waves.
      lx = -0.48; ly = 1.02; lz = 0.24;
      const preWave = gesture(clock, 0.95, 1.55, 2.10, 2.70) * waitFade;
      const welcome = arrived ? gesture(arrivalAge, 1.80, 2.45, 3.65, 4.35) : 0;
      const wave = Math.max(preWave, welcome);
      const waveClock = welcome > 0 ? arrivalAge - 2.45 : clock - 1.55;
      rx = mix(rx, 0.59 + Math.sin(waveClock * 4.9) * 0.055, wave);
      ry = mix(ry, 1.83 + Math.cos(waveClock * 4.9) * 0.035, wave);
      rz = mix(rz, 0.24, wave);
      rightRoll = mix(rightRoll, Math.PI + Math.sin(waveClock * 4.9) * 0.15, wave);
      figure.head.rotation.z = wave * -0.035;
    } else if (figure.role === 'botanist') {
      const applause = arrived ? gesture(arrivalAge, 3.15, 3.85, 6.10, 6.85) : 0;
      const beat = Math.max(0, arrivalAge - 3.85);
      const spread = (1 - Math.cos(beat * Math.PI * 2 * 1.65)) * 0.5;
      const palmX = 0.085 + spread * 0.15;
      lx = mix(lx, -palmX, applause);
      rx = mix(rx, palmX, applause);
      ly = mix(ly, 1.28, applause); ry = mix(ry, 1.28, applause);
      lz = mix(lz, 0.48, applause); rz = mix(rz, 0.48, applause);
      leftYaw = Math.PI * 0.5 * applause;
      rightYaw = -Math.PI * 0.5 * applause;
      figure.head.rotation.x += applause * 0.035;
    } else {
      // The navigator acknowledges the traveller over the chart rather than
      // matching the engineer's timing, height or sweeping arc.
      lx = -0.66; ly = 1.03; lz = 0.33;
      const preWave = gesture(clock, 0.50, 1.10, 1.50, 2.10) * waitFade;
      const welcome = arrived ? gesture(arrivalAge, 4.10, 4.80, 6.30, 7.05) : 0;
      const wave = Math.max(preWave, welcome);
      const waveClock = welcome > 0 ? arrivalAge - 4.80 : clock - 1.10;
      rx = mix(rx, 0.54 + Math.sin(waveClock * 4.0) * 0.04, wave);
      ry = mix(ry, 1.72, wave);
      rz = mix(rz, 0.29, wave);
      rightRoll = mix(rightRoll, Math.PI + Math.sin(waveClock * 4.0) * 0.13, wave);
    }
    if (arrived && arrivalAge > 6.8) {
      // A shared acknowledgement resolves the ceremony into individual idle
      // poses; there is no nine-second loop that restarts the whole crowd.
      const acknowledge = gesture(arrivalAge, 6.85 + figure.index * 0.12,
        7.20 + figure.index * 0.12, 7.45 + figure.index * 0.12, 7.90 + figure.index * 0.12);
      figure.head.rotation.x += acknowledge * 0.09;
    }
    poseLegs(figure, rightFootZ, leftFootZ, rightLift, leftLift);
    poseArms(figure, lx, ly, lz, rx, ry, rz,
      leftPitch, leftYaw, leftRoll, rightPitch, rightYaw, rightRoll);
    if (figure.collider) {
      figure.collider.x = figure.group.position.x;
      figure.collider.z = figure.group.position.z;
    }
  }
  const botPatrols = [
    [[-5.2, 5.4], [-7.8, 9.8], [-6.2, 14.2], [-2.8, 10.6]],
    [[5.2, 5.2], [2.0, 9.2], [1.5, 15.8], [4.2, 14.5]]
  ];
  for (let i = 0; i < bots.length; i++) {
    const bot = bots[i];
    const sensor = bots[i].userData.sensor;
    const botClock = active && !settled ? clock : elapsed;
    const roamBlend = !active ? 1.0 : settled ? ease(arrivalAge, 8.8, 10.4) : 0.0;
    if (roamBlend > 0.001) {
      const path = botPatrols[i % botPatrols.length];
      const cycle = (elapsed * 0.055 + i * 0.35) % 1;
      const segF = cycle * path.length;
      const idxA = Math.floor(segF) % path.length;
      const idxB = (idxA + 1) % path.length;
      const segT = segF - Math.floor(segF);
      const pA = path[idxA];
      const pB = path[idxB];
      const targetX = mix(pA[0], pB[0], segT);
      const targetZ = mix(pA[1], pB[1], segT);
      const hx = bot.userData.homeX ?? bot.position.x;
      const hz = bot.userData.homeZ ?? bot.position.z;
      const nx = mix(hx, targetX, roamBlend);
      const nz = mix(hz, targetZ, roamBlend);
      bot.position.x = nx;
      bot.position.z = nz;
      bot.position.y = getHomeworldGroundHeight(nx, nz) - HOMEWORLD_CONFIG.baseY;
      const moveYaw = Math.atan2(pB[0] - pA[0], pB[1] - pA[1]);
      const hy = bot.userData.homeYaw ?? 0;
      bot.rotation.y = hy + shortAngle(moveYaw - hy) * roamBlend;
      if (bot.userData.collider) {
        bot.userData.collider.x = nx;
        bot.userData.collider.z = nz;
        const gY = HOMEWORLD_CONFIG.baseY + bot.position.y;
        bot.userData.collider.minY = gY - 1;
        bot.userData.collider.maxY = gY + 2.2;
      }
    } else if (bot.userData.homeX !== undefined) {
      bot.position.x = bot.userData.homeX;
      bot.position.z = bot.userData.homeZ;
      bot.position.y = getHomeworldGroundHeight(bot.position.x, bot.position.z) - HOMEWORLD_CONFIG.baseY;
      bot.rotation.y = bot.userData.homeYaw ?? 0;
      if (bot.userData.collider) {
        bot.userData.collider.x = bot.position.x;
        bot.userData.collider.z = bot.position.z;
      }
    }
    if (sensor) {
      const acknowledge = arrived ? gesture(arrivalAge, 0.35 + i * 0.25, 0.70 + i * 0.25,
        1.0 + i * 0.25, 1.45 + i * 0.25) : 0;
      sensor.rotation.y = Math.sin(botClock * 0.85 + i * 2.2) * (active && !settled ? 0.09 : 0.24);
      sensor.rotation.x = attention * -0.035 + acknowledge * 0.11 + Math.sin(botClock * 1.4 + i) * 0.045;
    }
    const botArms = bots[i].userData.arms;
    if (botArms && botArms.length) {
      for (const arm of botArms) {
        arm.group.rotation.x = Math.sin(botClock * 1.65 + arm.side * 0.9) * 0.10;
        arm.group.rotation.z = arm.side * (0.04 + Math.cos(botClock * 1.2) * 0.04);
      }
    }
  }
}
