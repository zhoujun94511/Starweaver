import * as THREE from 'three';

/**
 * Shared 3D companion robot & hover-drone factory.
 * Scenes mount the returned Groups on demand and dispose them with the scene subtree,
 * avoiding duplicated robot geometry/rig code across planets.
 */
export function createHoverDroneMesh({ shellMat, darkMat, accentMat, mergeFn = null } = {}) {
  const drone = new THREE.Group();
  const hullMat =
    shellMat ||
    new THREE.MeshPhysicalMaterial({
      color: '#eaf9f6',
      roughness: 0.22,
      metalness: 0.4,
      clearcoat: 0.8
    });
  const bodyDark =
    darkMat || new THREE.MeshStandardMaterial({ color: '#1b2b36', roughness: 0.45, metalness: 0.65 });
  const glowMat =
    accentMat ||
    new THREE.MeshStandardMaterial({
      color: '#66f2dc',
      emissive: '#38d8c0',
      emissiveIntensity: 1.2,
      roughness: 0.25
    });

  // Sleek oblate main hull + dark titanium waist collar
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), hullMat);
  shell.scale.set(1.08, 0.78, 1.18);
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 16), bodyDark);

  // Front visor bezel & twin glowing optical sensors
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.15, 0.14), bodyDark);
  visor.position.set(0, 0.02, 0.33);
  for (const side of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), glowMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(side * 0.09, 0.02, 0.40);
    drone.add(lens);

    // Twin side hover thruster pods + glowing exhaust nozzles
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.28, 10), bodyDark);
    pod.position.set(side * 0.44, -0.02, -0.04);
    pod.rotation.z = side * -0.14;
    const nozzle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.022, 6, 14), glowMat);
    nozzle.rotation.x = Math.PI / 2;
    nozzle.position.set(side * 0.46, -0.17, -0.04);
    drone.add(pod, nozzle);
  }

  // Dorsal antenna & rear stabilizer fin
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.20, 8), bodyDark);
  ant.position.set(0, 0.32, -0.06);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 8), glowMat);
  antTip.position.set(0, 0.43, -0.06);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.22), bodyDark);
  fin.position.set(0, 0.18, -0.32);

  drone.add(shell, waist, visor, ant, antTip, fin);
  if (typeof mergeFn === 'function') {
    mergeFn(drone);
  }
  return drone;
}

/**
 * Shared wheeled utility / cargo rover factory used by planetary settlements.
 */
export function createUtilityRoverBot({
  kind = 'tool',
  x = 0,
  y = 0,
  z = 0,
  materials,
  batchPartsFn,
  boxFn,
  orbFn,
  tailoredFn,
  palette,
  lookAt = [0, 0, 2.2]
}) {
  const { INK, METAL, CREAM, GOLD } = palette;
  const group = new THREE.Group();
  group.name = `companion-${kind}`;
  group.position.set(x, y, z);
  if (lookAt) {
    group.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  }
  group.userData.role = kind;

  const parts = batchPartsFn(group, materials);
  const accent = kind === 'tool' ? '#b78c50' : '#648b89';
  const width = kind === 'tool' ? 0.70 : 1.05;

  parts.add('drive-chassis', boxFn(width, 0.25, 0.72, 0.08), 'metal', INK, 0, 0.27, 0);
  for (const side of [-1, 1]) {
    for (const wheelZ of [-0.23, 0.23]) {
      parts.add(
        'all-terrain-wheel',
        new THREE.CylinderGeometry(0.20, 0.20, 0.13, 12),
        'textile',
        '#26353b',
        side * (width * 0.5 + 0.015),
        0.20,
        wheelZ,
        0,
        0,
        Math.PI / 2
      );
      parts.add(
        'wheel-hub',
        new THREE.CylinderGeometry(0.10, 0.10, 0.145, 10),
        'metal',
        METAL,
        side * (width * 0.5 + 0.015),
        0.20,
        wheelZ,
        0,
        0,
        Math.PI / 2
      );
    }
  }

  if (kind === 'tool') {
    parts.add(
      'tapered-service-shell',
      tailoredFn([
        [0.36, 0.29, 0.24],
        [0.46, 0.34, 0.28],
        [0.88, 0.28, 0.24],
        [1.00, 0.19, 0.17]
      ]),
      'shell',
      CREAM
    );
    parts.add('chest-diag-frame', boxFn(0.42, 0.24, 0.08, 0.03), 'metal', INK, 0, 0.68, 0.26);
    parts.add('chest-diag-screen', boxFn(0.32, 0.14, 0.04, 0.015), 'glass', '#58e8d2', 0, 0.68, 0.295);
    parts.add('backpack-powercell', boxFn(0.36, 0.34, 0.16, 0.04), 'shell', accent, 0, 0.66, -0.26);
    parts.add('inspection-neck', boxFn(0.11, 0.18, 0.12, 0.03), 'metal', INK, 0, 1.07, 0);
  } else {
    parts.add('cargo-deck', boxFn(1.10, 0.13, 0.86, 0.05), 'shell', accent, 0, 0.44, 0);
    parts.add('sealed-transport-case', boxFn(0.82, 0.48, 0.50, 0.075), 'shell', CREAM, 0, 0.71, -0.15);
    parts.add('case-lid', boxFn(0.87, 0.075, 0.54, 0.025), 'shell', accent, 0, 0.975, -0.15);
    for (const side of [-1, 1]) {
      parts.add('case-restraint', boxFn(0.065, 0.53, 0.53, 0.02), 'textile', INK, side * 0.25, 0.72, -0.15);
      parts.add('case-latch', boxFn(0.10, 0.12, 0.04, 0.02), 'metal', GOLD, side * 0.25, 0.73, 0.125);
    }
    parts.add('sensor-collar', boxFn(0.22, 0.08, 0.20, 0.03), 'metal', INK, 0, 0.53, 0.24);
    parts.add('sensor-mast', boxFn(0.085, 0.44, 0.085, 0.02), 'metal', METAL, 0, 0.77, 0.24);
  }
  parts.finish();

  const arms = [];
  if (kind === 'tool') {
    for (const side of [-1, 1]) {
      const armGroup = new THREE.Group();
      armGroup.name = `${kind}-arm-${side < 0 ? 'l' : 'r'}`;
      armGroup.position.set(side * 0.36, 0.86, 0.02);
      const armParts = batchPartsFn(armGroup, materials);
      armParts.add('shoulder-cap', orbFn(0.085), 'metal', accent, 0, 0, 0);
      armParts.add('upper-arm', boxFn(0.08, 0.24, 0.09, 0.025), 'metal', METAL, side * 0.03, -0.14, 0.02, 0.18, 0, side * 0.08);
      armParts.add('forearm-housing', boxFn(0.09, 0.22, 0.10, 0.025), 'shell', CREAM, side * 0.05, -0.30, 0.13, -0.45, 0, 0);
      armParts.add(
        'wrist-emitter',
        new THREE.CylinderGeometry(0.045, 0.045, 0.04, 12),
        'glass',
        '#58e8d2',
        side * 0.05,
        -0.39,
        0.22,
        Math.PI / 2
      );
      armParts.finish();
      group.add(armGroup);
      arms.push({ group: armGroup, side });
    }
  }
  group.userData.arms = arms;

  const head = new THREE.Group();
  head.name = `${kind}-articulated-sensor`;
  head.position.set(0, kind === 'tool' ? 1.24 : 1.08, kind === 'tool' ? 0 : 0.24);
  const sensor = batchPartsFn(head, materials);
  sensor.add('camera-housing', boxFn(0.49, 0.30, 0.36, 0.10), 'shell', CREAM);
  sensor.add('camera-faceplate', boxFn(0.41, 0.21, 0.07, 0.055), 'metal', INK, 0, 0, 0.175);
  sensor.add('sensor-antenna', new THREE.CylinderGeometry(0.012, 0.016, 0.18, 8), 'metal', METAL, -0.16, 0.21, -0.06);
  sensor.add('sensor-antenna-tip', orbFn(0.028), 'glass', '#66ffba', -0.16, 0.31, -0.06);
  for (const side of [-1, 1]) {
    sensor.add(
      'optical-lens',
      new THREE.CylinderGeometry(side < 0 ? 0.068 : 0.052, side < 0 ? 0.068 : 0.052, 0.025, 12),
      'glass',
      '#66f2dc',
      side * 0.095,
      0.01,
      0.225,
      Math.PI / 2
    );
  }
  sensor.finish();
  group.add(head);
  group.userData.sensor = head;
  return group;
}

/**
 * Shared autonomous mining drone fleet factory (ducted rotors, magnetic claws & tractor beam).
 */
export function createMiningDroneFleet({
  count = 2,
  droneShellMat,
  droneChassisMat,
  droneVisorMat,
  droneGlowMat,
  droneBeamMat
}) {
  const hullUpperGeo = new THREE.SphereGeometry(0.26, 16, 12);
  const hullCoreGeo = new THREE.CylinderGeometry(0.24, 0.19, 0.13, 14);
  const visorGeo = new THREE.BoxGeometry(0.26, 0.085, 0.12);
  const eyeGeo = new THREE.SphereGeometry(0.036, 10, 8);
  const antennaStemGeo = new THREE.CylinderGeometry(0.01, 0.014, 0.18, 6);
  const antennaTipGeo = new THREE.SphereGeometry(0.024, 8, 6);
  const armGeo = new THREE.BoxGeometry(0.22, 0.04, 0.06);
  const ductGeo = new THREE.CylinderGeometry(0.13, 0.14, 0.075, 16, 1, true);
  const ductRingGeo = new THREE.TorusGeometry(0.13, 0.016, 8, 18);
  const bladeGeo = new THREE.BoxGeometry(0.21, 0.008, 0.026);
  const clawGeo = new THREE.BoxGeometry(0.035, 0.14, 0.04);
  const beamGeo = new THREE.ConeGeometry(0.16, 0.34, 14, 1, true);
  const cargoGeo = new THREE.OctahedronGeometry(0.115, 0);

  const agents = [];
  for (let di = 0; di < count; di++) {
    const dg = new THREE.Group();

    const upperShell = new THREE.Mesh(hullUpperGeo, droneShellMat);
    upperShell.scale.set(1.05, 0.62, 1.24);
    upperShell.position.y = 0.03;

    const lowerChassis = new THREE.Mesh(hullCoreGeo, droneChassisMat);
    lowerChassis.position.y = -0.055;

    const visor = new THREE.Mesh(visorGeo, droneVisorMat);
    visor.position.set(0, 0.015, 0.255);
    const scannerEye = new THREE.Mesh(eyeGeo, droneGlowMat);
    scannerEye.scale.set(1.4, 0.8, 0.7);
    scannerEye.position.set(0, 0.015, 0.312);

    const antenna = new THREE.Mesh(antennaStemGeo, droneChassisMat);
    antenna.position.set(-0.07, 0.22, -0.1);
    const antennaTip = new THREE.Mesh(antennaTipGeo, droneGlowMat);
    antennaTip.position.set(-0.07, 0.32, -0.1);

    dg.add(upperShell, lowerChassis, visor, scannerEye, antenna, antennaTip);

    const rotors = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, droneChassisMat);
      arm.position.set(side * 0.28, -0.01, -0.02);

      const podGroup = new THREE.Group();
      podGroup.position.set(side * 0.43, 0.0, -0.02);

      const duct = new THREE.Mesh(ductGeo, droneChassisMat);
      const ductGlow = new THREE.Mesh(ductRingGeo, droneGlowMat);
      ductGlow.rotation.x = Math.PI / 2;
      ductGlow.position.y = -0.032;

      const rotorGroup = new THREE.Group();
      const bladeA = new THREE.Mesh(bladeGeo, droneShellMat);
      const bladeB = new THREE.Mesh(bladeGeo, droneShellMat);
      bladeB.rotation.y = Math.PI / 2;
      rotorGroup.add(bladeA, bladeB);
      rotors.push(rotorGroup);

      podGroup.add(duct, ductGlow, rotorGroup);
      dg.add(arm, podGroup);
    }

    for (const side of [-1, 1]) {
      const claw = new THREE.Mesh(clawGeo, droneChassisMat);
      claw.position.set(side * 0.13, -0.15, 0.0);
      claw.rotation.z = side * 0.32;
      dg.add(claw);
    }

    const tractorBeam = new THREE.Mesh(beamGeo, droneBeamMat);
    tractorBeam.position.y = -0.27;

    const cargoNugget = new THREE.Mesh(
      cargoGeo,
      new THREE.MeshStandardMaterial({
        color: di === 0 ? '#9aa8ff' : '#ffd666',
        emissive: di === 0 ? '#2b3da8' : '#8f5f00',
        emissiveIntensity: 1.6
      })
    );
    cargoNugget.position.y = -0.35;

    dg.add(tractorBeam, cargoNugget);
    agents.push({
      group: dg,
      phaseOffset: di * Math.PI,
      rotors,
      cargo: cargoNugget,
      beam: tractorBeam
    });
  }
  return agents;
}

