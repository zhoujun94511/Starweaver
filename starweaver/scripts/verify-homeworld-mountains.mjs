import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHomeworldMountainRangeGeometry, createMountainCameraOccluders } from '../src/scene/homeworldLandscape.js';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../src/data/homeworldData.js';
import { CameraController } from '../src/scene/cameraController.js';

const geometry = createHomeworldMountainRangeGeometry();
const p = geometry.attributes.position;
const count = p.count / 3, solidCount = geometry.userData.closedMassifTriangles;
assert(count <= 70000, 'Background geometry must stay within its mobile triangle budget');
for (const name of ['position', 'normal', 'uv', 'color']) {
  assert(geometry.attributes[name], `Mountain range is missing ${name}`);
  for (const value of geometry.attributes[name].array) assert(Number.isFinite(value));
}

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), normal = new THREE.Vector3();
const vertices = new Map(), vertexIds = [], edges = new Map();
let minimumTriangleRadius = Infinity, solidVolume = 0, cliffArea = 0, degenerateTriangles = 0;
function edgeDistanceSquared(x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, -(x1 * dx + z1 * dz) / length)) : 0;
  return (x1 + dx * t) ** 2 + (z1 + dz * t) ** 2;
}
function projectedTriangleDistance(a, b, c) {
  const ab = a.x * b.z - a.z * b.x, bc = b.x * c.z - b.z * c.x, ca = c.x * a.z - c.z * a.x;
  const area = ab + bc + ca;
  if (Math.abs(area) > 1e-8 && (Math.min(ab, bc, ca) >= 0 || Math.max(ab, bc, ca) <= 0)) return 0;
  return Math.sqrt(Math.min(edgeDistanceSquared(a.x, a.z, b.x, b.z),
    edgeDistanceSquared(b.x, b.z, c.x, c.z), edgeDistanceSquared(c.x, c.z, a.x, a.z)));
}
for (let i = 0; i < p.count; i += 3) {
  a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
  const radius = projectedTriangleDistance(a, b, c);
  assert(Number.isFinite(radius));
  minimumTriangleRadius = Math.min(minimumTriangleRadius, radius);
  assert(radius > HOMEWORLD_CONFIG.playRadius + 1,
    `A background triangle crosses the playable circle at r=${radius}`);
  normal.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
  const doubleArea = normal.length();
  if (doubleArea < 1e-7) degenerateTriangles++;
  if (i / 3 < solidCount) {
    if (Math.abs(normal.y / doubleArea) < 0.30) cliffArea += doubleArea / 2;
    solidVolume += a.dot(e1.crossVectors(b, c)) / 6;
    for (let v = i; v < i + 3; v++) {
      const key = [p.getX(v), p.getY(v), p.getZ(v)].map(value => Math.round(value * 1e4)).join(',');
      if (!vertices.has(key)) vertices.set(key, vertices.size);
      vertexIds.push(vertices.get(key));
    }
  }
}
assert.equal(degenerateTriangles, 0, 'Cliff/cap construction introduced collapsed triangles');
for (let i = 0; i < vertexIds.length; i += 3) {
  for (let j = 0; j < 3; j++) {
    const from = vertexIds[i + j], to = vertexIds[i + (j + 1) % 3];
    const key = from < to ? `${from}:${to}` : `${to}:${from}`;
    const entry = edges.get(key) || { count: 0, winding: 0 };
    entry.count++; entry.winding += from < to ? 1 : -1; edges.set(key, entry);
  }
}
assert([...edges.values()].every(edge => edge.count === 2 && edge.winding === 0),
  'Rock volumes need paired, oppositely wound edges: no open ends or inverted caps');
assert(solidVolume > 0, 'Rock shells must face outwards and enclose a positive volume');
assert(cliffArea > 0, 'The range needs real steep faces rather than only a smooth height plane');

const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
mesh.updateMatrixWorld(true);
const ray = new THREE.Raycaster(), sideHits = [], topHits = [];
for (const part of geometry.userData.massifs) {
  const ground = getHomeworldGroundHeight(part.cx, part.cz) - HOMEWORLD_CONFIG.baseY;
  ray.set(new THREE.Vector3(part.cx, 100, part.cz), new THREE.Vector3(0, -1, 0));
  const top = ray.intersectObject(mesh)[0];
  assert(top && top.point.y > ground + 8 && top.face.normal.y > 0,
    'The summit must be a correctly facing solid surface visible from above');
  topHits.push(top.point.y);
  ray.set(new THREE.Vector3(part.cx, ground - 4, part.cz), new THREE.Vector3(0, 1, 0));
  const bottom = ray.intersectObject(mesh)[0];
  assert(bottom && bottom.face.normal.y < 0 && bottom.point.y < ground - 1,
    'The underside must close the massif below the ground, with outward normals');
  assert(top.point.y - bottom.point.y > 8,
    'The summit and buried underside must enclose rock, not a thin raised sheet');
  if (part.distant) continue;
  const radius = Math.hypot(part.cx, part.cz), direction = new THREE.Vector3(part.cx / radius, 0, part.cz / radius);
  ray.set(direction.clone().multiplyScalar(30).setY(ground + part.height * 0.24), direction);
  const side = ray.intersectObject(mesh)[0];
  assert(side && side.face.normal.dot(direction) < -0.05,
    'A valley-side observer must hit the actual front-facing rock wall');
  sideHits.push({ radius: Math.hypot(side.point.x, side.point.z), normalY: side.face.normal.y });
}
assert(Math.max(...topHits) - Math.min(...topHits) > 20, 'Foreground and distant skyline have collapsed into one elevation');
const cameraOccluders = createMountainCameraOccluders(geometry);
for (const cap of cameraOccluders) {
  assert(cap.cameraOnly && cap.occluder, 'Mountain proxies must remain exclusive to the camera');
  assert(Number.isFinite(cap.maxY) && cap.maxY > cap.minY);
  assert(Math.hypot(cap.x, cap.z) - cap.radius - 0.52 > HOMEWORLD_CONFIG.playRadius,
    'A camera proxy or its lens margin intrudes into the walkable circle');
}
const controller = Object.create(CameraController.prototype);
Object.assign(controller, { state: { isBridgeExtended: () => true },
  _poseLook: new THREE.Vector3(), _posePos: new THREE.Vector3(), distance: 21 });
mesh.position.y = HOMEWORLD_CONFIG.baseY;
mesh.updateMatrixWorld(true);
const target = new THREE.Vector3(), subject = new THREE.Vector3(), delta = new THREE.Vector3();
let edgeSightlines = 0, inwardControls = 0, shortestSafeArm = Infinity, rawMountainObstructions = 0;
for (const radius of [HOMEWORLD_CONFIG.playRadius - 4, HOMEWORLD_CONFIG.playRadius - 0.1]) for (let angleIndex = 0; angleIndex < 36; angleIndex++) {
  const angle = angleIndex / 36 * Math.PI * 2;
  target.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  target.y = getHomeworldGroundHeight(target.x, target.z);
  for (const yawOffset of [0, -Math.PI / 4, Math.PI / 4]) for (const pitch of [0.04, 0.27, 0.8]) {
    controller.yaw = Math.PI / 2 - angle + yawOffset;
    controller.pitch = pitch;
    for (const protectedView of [false, true]) {
      controller.setOccluders(protectedView ? cameraOccluders : []);
      const pose = controller.getDesiredFollowPose(target);
      if (protectedView) shortestSafeArm = Math.min(shortestSafeArm, pose.position.distanceTo(pose.lookAt));
      for (const height of [1.1, 1.8]) {
        subject.copy(target); subject.y += height;
        delta.subVectors(pose.position, subject);
        ray.set(subject, delta.normalize()); ray.near = 0; ray.far = pose.position.distanceTo(subject) - 0.18;
        const hits = ray.intersectObject(mesh);
        if (protectedView) {
          assert.equal(hits.length, 0,
            `The outer-edge camera crosses real rock: r=${radius},angle=${angleIndex},yaw=${yawOffset},pitch=${pitch}`);
          edgeSightlines++;
        } else if (hits.length) rawMountainObstructions++;
      }
    }
  }
  // Looking into the valley must keep the full zoom distance. This catches
  // conservative proxies accidentally forming a high wall around the map.
  controller.setOccluders(cameraOccluders);
  controller.yaw = Math.PI / 2 - angle + Math.PI; controller.pitch = 0.27;
  const inward = controller.getDesiredFollowPose(target);
  assert(Math.abs(inward.position.distanceTo(inward.lookAt) - 21) < 1e-5);
  inwardControls++;
}
assert(rawMountainObstructions > 0, 'The boundary regression must actually exercise rock intersections');
console.log(JSON.stringify({ mountainTriangles: count, closedRockTriangles: solidCount,
  closedRockVolumes: geometry.userData.massifs.length * 3,
  openRockEdges: 0, solidVolume, steepCliffArea: cliffArea, minimumTriangleRadius,
  summitHeightRange: [Math.min(...topHits), Math.max(...topHits)], valleySideHits: sideHits,
  cameraOnlyRockProxies: cameraOccluders.length, rawMountainObstructions,
  protectedEdgeSightlines: edgeSightlines, inwardZoomControls: inwardControls, shortestSafeArm }, null, 2));
geometry.dispose(); mesh.material.dispose();
