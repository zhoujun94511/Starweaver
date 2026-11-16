import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  buildHomeworldCharacters, resetHomeworldCeremony, startHomeworldCeremony,
  notifyHomeworldPlayerArrived, updateHomeworldCharacters
} from '../src/scene/homeworldCharacters.js';

const parent = new THREE.Group();
parent.position.y = 420;
const colliders = [];
const { crew, bots, ceremony } = buildHomeworldCharacters(parent, colliders);
const captain = crew.find(f => f.role === 'captain');
const botanist = crew.find(f => f.role === 'botanist');
const vertex = new THREE.Vector3();
const leftHand = new THREE.Vector3();
const rightHand = new THREE.Vector3();
let sampledFootVertices = 0;
let minSole = Infinity;
let maxCaptainTravel = 0;
let sampledSkinVertices = 0;
let maximumSkinRadius = 0;
let maximumSkinY = -Infinity;

function poseAt(time, totalElapsed = 10000) {
  ceremony.elapsed = time;
  updateHomeworldCharacters(crew, bots, totalElapsed, 0, ceremony);
  parent.updateMatrixWorld(true);
  for (const figure of crew) figure.rig.skeleton.update();
}

function checkSkinAndSupport() {
  for (const figure of crew) {
    assert.equal(figure.group.position.y, figure.groundY, 'Whole bodies must not bounce');
    assert.equal(figure.collider.x, figure.group.position.x, 'Collider must follow the crew');
    assert.equal(figure.collider.z, figure.group.position.z, 'Collider must follow the crew');
    const travel = Math.hypot(figure.group.position.x - figure.baseX, figure.group.position.z - figure.baseZ);
    assert.ok(travel <= 0.12001, 'Crew movement must stay outside the disembark corridor');
    maxCaptainTravel = Math.max(maxCaptainTravel, travel);
    let lowestLeft = Infinity, lowestRight = Infinity;
    const rig = figure.rig;
    for (const bone of rig.bones) {
      assert.ok(bone.matrixWorld.elements.every(Number.isFinite), 'Bone transforms must remain finite');
    }
    for (const mesh of rig.meshes) {
      assert.ok(mesh.isSkinnedMesh, 'Role hardware must follow the articulated body');
      const p = mesh.geometry.attributes.position;
      const index = mesh.geometry.attributes.skinIndex;
      const weight = mesh.geometry.attributes.skinWeight;
      for (let i = 0; i < p.count; i++) {
        const sum = weight.getX(i) + weight.getY(i) + weight.getZ(i) + weight.getW(i);
        assert.ok(Math.abs(sum - 1) < 0.000001, 'Skin weights must be normalised');
        assert.ok(index.getX(i) < rig.bones.length && index.getY(i) < rig.bones.length,
          'Skin indices must refer to the current rig');
        vertex.fromBufferAttribute(p, i);
        mesh.applyBoneTransform(i, vertex).applyMatrix4(mesh.matrixWorld);
        assert.ok(vertex.toArray().every(Number.isFinite), 'Deformed vertices must remain finite');
        const radius = Math.hypot(vertex.x - figure.group.position.x, vertex.z - figure.group.position.z);
        assert.ok(radius < 1.25, 'Skin bounds must stay inside the local welcoming pose envelope');
        assert.ok(vertex.y >= 419.999 && vertex.y < 422.35, 'Skin transforms must use the current world plane');
        maximumSkinRadius = Math.max(maximumSkinRadius, radius);
        maximumSkinY = Math.max(maximumSkinY, vertex.y);
        sampledSkinVertices++;
        const foot = index.getX(i);
        if (foot !== rig.indices.footL && foot !== rig.indices.footR) continue;
        assert.ok(vertex.y >= 419.999, 'Boots must not penetrate the meadow');
        assert.ok(vertex.y < 420.27, 'Shoe height plus a small step must stay near the ground');
        if (foot === rig.indices.footL) lowestLeft = Math.min(lowestLeft, vertex.y);
        else lowestRight = Math.min(lowestRight, vertex.y);
        sampledFootVertices++;
      }
    }
    const support = Math.min(lowestLeft, lowestRight);
    assert.ok(support <= 420.025, 'At least one sole must remain in contact during each small step');
    minSole = Math.min(minSole, support);
  }
}

startHomeworldCeremony(ceremony);
poseAt(3.4);
assert.equal(ceremony.stage, 'attention');
assert.equal(captain.group.position.x, captain.baseX, 'Captain must wait for Milo before approaching');
captain.rig.wristR.getWorldPosition(rightHand);
assert.ok(rightHand.y < 421.2, 'Captain must not salute an empty ramp');
notifyHomeworldPlayerArrived(ceremony);
const arrival = ceremony.arrivedAt;
notifyHomeworldPlayerArrived(ceremony);
assert.equal(ceremony.arrivedAt, arrival, 'Arrival notification must be idempotent');

for (const age of [0, 0.65, 1.1, 1.7, 2.6, 3.2, 4.1, 4.5, 5.5, 6.2, 7.5, 9, 14]) {
  poseAt(arrival + age);
  checkSkinAndSupport();
  if (age === 1.7) {
    captain.rig.wristR.getWorldPosition(rightHand);
    assert.ok(rightHand.y > 421.65, 'The captain salute must reach the helmet');
    assert.ok(captain.torso.rotation.x > 0.03, 'Salute must include a short body acknowledgement');
  }
}

poseAt(arrival + 3.85 + 1 / 1.65);
botanist.rig.wristL.getWorldPosition(leftHand);
botanist.rig.wristR.getWorldPosition(rightHand);
assert.ok(leftHand.distanceTo(rightHand) < 0.19, 'Applause must bring both palms together');
assert.ok(Math.abs(botanist.elbowL.rotation.x) + Math.abs(botanist.elbowL.rotation.z) > 0.1,
  'Applause must articulate the elbow');
poseAt(arrival + 20);
assert.equal(ceremony.stage, 'settled', 'The welcome must resolve rather than loop forever');

function replay(totalElapsed) {
  resetHomeworldCeremony(ceremony);
  assert.equal(ceremony.elapsed, 0);
  assert.equal(ceremony.stage, 'standby');
  assert.equal(captain.group.position.x, captain.baseX);
  assert.equal(captain.group.position.z, captain.baseZ);
  startHomeworldCeremony(ceremony);
  for (let frame = 0; frame < 360; frame++) {
    if (frame === 200) notifyHomeworldPlayerArrived(ceremony);
    updateHomeworldCharacters(crew, bots, totalElapsed + frame / 60, 1 / 60, ceremony);
  }
  parent.updateMatrixWorld(true);
  return crew.flatMap(figure => [figure.group.position.x, figure.group.position.z,
    ...figure.rig.bones.flatMap(bone => bone.quaternion.toArray())]);
}

assert.deepEqual(replay(0), replay(98765), 'Replay poses must not depend on the application elapsed clock');
resetHomeworldCeremony(ceremony);
poseAt(0);
checkSkinAndSupport();
console.log(JSON.stringify({
  passed: true, sampledFootVertices, sampledSkinVertices, minimumSoleY: minSole,
  maximumSkinRadius, maximumSkinY,
  maximumCrewTravel: maxCaptainTravel, roleDraws: crew.map(f => f.rig.meshes.length),
  ceremonyStages: ['standby', 'landing-confirmed', 'attention', 'acknowledge',
    'captain-salute', 'invitation', 'welcome-response', 'settled']
}, null, 2));
