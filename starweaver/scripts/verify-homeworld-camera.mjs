import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SpacecraftBuilder } from '../src/scene/spacecraftBuilder.js';
import { HOMEWORLD_CONFIG } from '../src/data/homeworldData.js';
import { buildHomeworldLandscape } from '../src/scene/homeworldLandscape.js';
import { buildHomeworldEnhancements } from '../src/scene/homeworldBuilder.js';
import { CameraController } from '../src/scene/cameraController.js';
import { cameraCylinderEntry } from '../src/utils/cameraOcclusion.js';

const ship = Object.create(SpacecraftBuilder.prototype);
Object.assign(ship, {
  homeworldGroup: new THREE.Group(), group: new THREE.Group(), hullPivot: new THREE.Group(),
  environments: null, skyDome: null, scene: new THREE.Scene(),
  _cutCamPos: new THREE.Vector3(), _cutCamLook: new THREE.Vector3(),
  launchGroundWash: { visible: false, material: { uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } } } },
  setThrusterPlumes() {},
  _applyRobotExitPose(robot) { robot.position.set(HOMEWORLD_CONFIG.spawnX, 420, HOMEWORLD_CONFIG.spawnZ); }
});
ship.scene.fog = new THREE.FogExp2();
ship._homeworldCameraPose = { position: ship._cutCamPos, lookAt: ship._cutCamLook };
const group = new THREE.Group();
const robot = { group, position: group.position, bodyPivot: new THREE.Group(), headGroup: new THREE.Group(),
  leftArm: new THREE.Group(), rightArm: new THREE.Group(), triggerAction() {} };
const projected = new THREE.Vector3();
const previous = new THREE.Vector3();
let samples = 0, maximumHorizontal = 0, maximumVertical = 0, maximumFrameTravel = 0;

function projectionBounds(camera, minX, maxX, minZ, maxZ) {
  for (let corner = 0; corner < 8; corner++) {
    projected.set(corner & 1 ? maxX : minX, 420 + (corner & 2 ? 2.4 : 0), corner & 4 ? maxZ : minZ).project(camera);
    assert.ok(Math.abs(projected.x) <= 0.80001, `Party leaves horizontal frame at aspect ${camera.aspect}`);
    assert.ok(Math.abs(projected.y) <= 0.72001, `Boots/hands enter the letterbox at aspect ${camera.aspect}`);
    assert.ok(projected.z > -1 && projected.z < 1, 'Party must remain in front of the lens');
    maximumHorizontal = Math.max(maximumHorizontal, Math.abs(projected.x));
    maximumVertical = Math.max(maximumVertical, Math.abs(projected.y));
    samples++;
  }
}

function apply(camera, pose) {
  camera.position.copy(pose.position);
  camera.lookAt(pose.lookAt);
  camera.updateMatrixWorld(true);
}

for (const aspect of [0.40, 390 / 844, 0.60, 1.0, 4 / 3, 16 / 9, 2.56]) {
  const fov = aspect < 0.85 ? 66 : aspect < 1.15 ? 58 : aspect < 1.45 ? 53 : aspect > 2.25 ? 46 : 50;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 600);
  const end = ship.applyCutsceneFrame(1, 0, robot, camera);
  const endPosition = end.position.clone(), endLook = end.lookAt.clone();
  const first = ship.applyHomeworldWelcomeFrame(0, robot, camera);
  assert.ok(first.position.distanceTo(endPosition) < 1e-8, 'Landing and welcome cameras must share the same endpoint');
  assert.ok(first.lookAt.distanceTo(endLook) < 1e-8, 'Landing and welcome aim must not cut on the first frame');
  previous.copy(first.position);
  for (let frame = 0; frame <= 440; frame++) {
    const age = frame * 0.02;
    const pose = ship.applyHomeworldWelcomeFrame(age, robot, camera);
    const travel = pose.position.distanceTo(previous);
    assert.ok(travel < 0.45, 'Welcome camera movement must remain continuous');
    maximumFrameTravel = Math.max(maximumFrameTravel, travel);
    previous.copy(pose.position);
    apply(camera, pose);
    // Mira and Milo stay in view through the salute; all four crew members,
    // Milo and the extended hand/boot envelope fit before applause starts.
    const reveal = THREE.MathUtils.smoothstep(age, 1.8, 2.65);
    projectionBounds(camera, -4.35, THREE.MathUtils.lerp(1, 4.5, reveal), 4.45,
      THREE.MathUtils.lerp(8.4, 9.2, reveal));
  }
  const before = ship.applyCutsceneFrame(0.58 + 0.42 * (0.64 - 1e-7), 0, robot, camera).position.clone();
  const after = ship.applyCutsceneFrame(0.58 + 0.42 * (0.64 + 1e-7), 0, robot, camera).position.clone();
  assert.ok(before.distanceTo(after) < 0.0001, 'The approach-to-party camera join must not jump');
}

console.log(JSON.stringify({ passed: true, aspectRatios: 7, projectedCorners: samples,
  maximumHorizontalNdc: maximumHorizontal, maximumVerticalNdc: maximumVertical,
  maximumCameraTravelPer20ms: maximumFrameTravel, exactLandingWelcomeJoin: true }, null, 2));

const meadow = new THREE.Group();
meadow.position.y = HOMEWORLD_CONFIG.baseY;
const sceneColliders = [];
buildHomeworldLandscape(meadow, sceneColliders);
buildHomeworldEnhancements(meadow, sceneColliders);
meadow.updateMatrixWorld(true);
const obstacles = [];
meadow.traverse(object => {
  if (!object.isMesh || object.isSkinnedMesh || !object.castShadow || object.material.transparent) return;
  let ancestor = object.parent;
  while (ancestor && ancestor !== meadow) {
    if (ancestor.userData.role) return;
    ancestor = ancestor.parent;
  }
  obstacles.push(object);
});
const ray = new THREE.Raycaster();
const direction = new THREE.Vector3();
const destination = new THREE.Vector3();
let geometryRays = 0;
const subjects = [[HOMEWORLD_CONFIG.spawnX, HOMEWORLD_CONFIG.spawnZ], [-3.3, 7.4], [-1.3, 8.2], [1.4, 8.2], [3.5, 7.3]];
for (const aspect of [0.40, 390 / 844, 0.60, 1, 4 / 3, 16 / 9, 2.56]) {
  const fov = aspect < 0.85 ? 66 : aspect < 1.15 ? 58 : aspect < 1.45 ? 53 : aspect > 2.25 ? 46 : 50;
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 600);
  const pose = ship.applyHomeworldWelcomeFrame(8.8, robot, camera);
  for (const [x, z] of subjects) for (const height of [1.1, 1.8]) {
    destination.set(x, 420 + height, z);
    direction.subVectors(destination, pose.position);
    const distance = direction.length();
    ray.set(pose.position, direction.normalize());
    ray.near = 0; ray.far = distance - 0.18;
    const hits = ray.intersectObjects(obstacles, false);
    assert.equal(hits.length, 0, `A real tree/structure blocks ${x},${z} at aspect ${aspect}: ${hits[0]?.object.name}`);
    geometryRays++;
  }
  const controller = Object.create(CameraController.prototype);
  Object.assign(controller, { camera, state: { isBridgeExtended: () => true },
    currentPos: new THREE.Vector3(), currentLookAt: new THREE.Vector3(), _safePosScratch: new THREE.Vector3() });
  controller.setOccluders(sceneColliders);
  controller.update(1 / 60, robot.position, pose);
  assert.ok(controller.currentPos.distanceTo(pose.position) < 0.00001,
    'The locked shot must also clear runtime canopy/building caps without cropping the party');
}

const crown = sceneColliders.find(c => c.id === 'hw_tree_8').cameraCanopy;
assert.ok(crown && crown.radius > 0.65, 'Camera foliage caps must cover real leaves, not just the trunk');
assert.ok(cameraCylinderEntry(0.5, crown.minY - 2, 11, 0.5, crown.maxY + 0.5, 17,
  crown.x, crown.z, crown.radius, crown.minY, crown.maxY) < 1,
  'A sightline entering a crown from below must be rejected');
console.log(JSON.stringify({ actualGeometrySightlines: geometryRays,
  foliageInstances: meadow.getObjectByName('homeworld-branch-leaf-canopies').count,
  fixedWelcomeAndEnding: true, runtimeCapsClear: true }, null, 2));

const roamCamera = new THREE.PerspectiveCamera(66, 390 / 844, 0.1, 600);
const roam = Object.create(CameraController.prototype);
Object.assign(roam, { camera: roamCamera, state: { isBridgeExtended: () => true },
  currentPos: new THREE.Vector3(0, 424.8, 18),
  currentLookAt: new THREE.Vector3(0, 421.58, HOMEWORLD_CONFIG.spawnZ),
  _safePosScratch: new THREE.Vector3(), _desiredLook: new THREE.Vector3(),
  _posePos: new THREE.Vector3(), _poseLook: new THREE.Vector3(),
  _occlusionFrac: 1, yaw: 0, pitch: 0.27, distance: 11.2, showcase: null });
roam.setOccluders(sceneColliders);
function assertCurrentViewClear() {
  destination.set(0, 421.58, HOMEWORLD_CONFIG.spawnZ);
  direction.subVectors(destination, roam.currentPos);
  ray.set(roam.currentPos, direction.clone().normalize());
  ray.far = direction.length() - 0.18;
  assert.equal(ray.intersectObjects(obstacles, false).length, 0,
    'Free-roam/showcase smoothing must not carry the final camera behind real foliage');
}
for (let frame = 0; frame < 90; frame++) {
  roam.update(1 / 60, robot.position);
  if (frame % 10 === 0) assertCurrentViewClear();
}
roam.triggerShowcase(new THREE.Vector3(0, 421.58, HOMEWORLD_CONFIG.spawnZ), new THREE.Vector3(0, 3.4, 10.5), 12);
for (let frame = 0; frame < 90; frame++) {
  roam.update(1 / 60, robot.position);
  if (frame % 10 === 0) assertCurrentViewClear();
}
console.log('Free-roam and automatic showcase: final smoothed sightlines clear real tree geometry.');
