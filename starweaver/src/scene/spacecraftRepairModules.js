import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { REPAIR_TARGETS } from '../data/gameData.js';
import { createAscentShield, createThrusterPlume } from '../graphics/launchEffects.js';
import { getTerrainHeight } from '../utils/math.js';

export function buildSpacecraftRepairModules(builder) {
  const darkFrameMat =
    builder._sharedDarkTitaniumMat ||
    new THREE.MeshStandardMaterial({
      color: '#2c374a',
      roughness: 0.42,
      metalness: 0.7
    });

  // 1. Power Core Bay (Starboard +X, +Z — inner housing deeply embedded into curved forward fuselage!)
  builder.powerBayGroup = new THREE.Group();
  builder.powerBayGroup.position.set(2.12, 1.78, 2.45);
  const powerHousing = new THREE.Mesh(
    new RoundedBoxGeometry(1.28, 1.02, 1.32, 4, 0.1),
    darkFrameMat
  );
  powerHousing.position.x = -0.28;
  builder.powerCoreCell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.86, 18),
    new THREE.MeshStandardMaterial({
      color: '#ffd266',
      emissive: '#ff9900',
      emissiveIntensity: 2.2,
      roughness: 0.2
    })
  );
  builder.powerCoreCell.rotation.x = Math.PI / 2;
  builder.powerCoreCell.position.x = 0.26;

  // Coaxial containment rings around power core (powerCoreCell is rotated PI/2 around X, so local Y is world Z!)
  for (const cy of [-0.24, 0.24]) {
    const cRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.315, 0.045, 8, 18),
      darkFrameMat
    );
    cRing.rotation.x = Math.PI / 2;
    cRing.position.set(0, cy, 0);
    builder.powerCoreCell.add(cRing);
  }

  builder.powerSparkBulb = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22, 1),
    new THREE.MeshBasicMaterial({ color: '#ff6238' })
  );
  builder.powerSparkBulb.position.x = 0.4;
  builder.powerBayGroup.add(powerHousing, builder.powerCoreCell, builder.powerSparkBulb);
  builder.hullPivot.add(builder.powerBayGroup);

  // 2. Seat the communications gimbal on the sculpted roof, rather than a
  // guessed height which buried the pedestal and folded dish in the hull.
  builder.commsPivot = new THREE.Group();
  builder.fuselage.updateWorldMatrix(true, false);
  const roofRay = new THREE.Raycaster(
    new THREE.Vector3(-0.62, builder.baseGroundY + 12, 0.55), new THREE.Vector3(0, -1, 0));
  const roofHit = roofRay.intersectObject(builder.fuselage, false)[0];
  const roofY = roofHit ? builder.hullPivot.worldToLocal(roofHit.point).y : 4.38;
  builder.commsPivot.position.set(-0.62, roofY + 0.14, 0.55);
  const mastBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.44, 0.34, 14),
    darkFrameMat
  );
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.18, 0.84, 12),
    darkFrameMat
  );
  mast.position.y = 0.46;
  const mastJoint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), darkFrameMat);
  mastJoint.position.y = 0.90;

  builder.commsDishHead = new THREE.Group();
  builder.commsDishHead.position.y = 0.92;

  // Smooth parabolic dish via LatheGeometry
  const dishPts = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(0.45, 0.08),
    new THREE.Vector2(0.82, 0.26),
    new THREE.Vector2(1.05, 0.48)
  ];
  const dishGeo = new THREE.LatheGeometry(dishPts, 24);
  const dishBowl = new THREE.Mesh(
    dishGeo,
    new THREE.MeshStandardMaterial({
      color: '#e8f1fc',
      metalness: 0.65,
      roughness: 0.24,
      side: THREE.DoubleSide
    })
  );
  builder.commsDishBowl = dishBowl;
  const feedStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.72, 8),
    darkFrameMat
  );
  feedStrut.position.y = 0.36;

  builder.commsTipLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 10),
    new THREE.MeshStandardMaterial({
      color: '#75f6ff',
      emissive: '#00ccff',
      emissiveIntensity: 2.4
    })
  );
  builder.commsTipLight.position.y = 0.72;
  builder.commsDishHead.add(dishBowl, feedStrut, builder.commsTipLight);
  builder.commsPivot.add(mastBase, mast, mastJoint, builder.commsDishHead);
  builder.hullPivot.add(builder.commsPivot);

  for (let i = 0; i < 3; i++) {
    const sRing = new THREE.Mesh(
      new THREE.RingGeometry(0.36, 0.44, 32),
      new THREE.MeshBasicMaterial({
        color: '#6cf5ff',
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      })
    );
    sRing.rotation.x = Math.PI / 2;
    sRing.visible = false;
    builder.commsPivot.add(sRing);
    builder.signalRings.push(sRing);
  }

  // 3. Port Bio-Dome Life-Support Terrarium (-X)
  builder.lifeDomeGroup = new THREE.Group();
  builder.lifeDomeGroup.position.set(-2.22, 2.25, -0.45);
  builder.bioDomeGlass = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 24, 18),
    new THREE.MeshPhysicalMaterial({
      color: '#7a5c43',
      emissive: '#171008',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.68,
      roughness: 0.1,
      clearcoat: 1.0
    })
  );

  // Lush glowing bio-terrarium sprout with flower bud inside!
  builder.bioSprout = new THREE.Group();
  const soilBed = new THREE.Mesh(
    new THREE.CylinderGeometry(0.48, 0.42, 0.18, 14),
    new THREE.MeshStandardMaterial({ color: '#5c3d28', roughness: 0.9 })
  );
  soilBed.position.y = -0.22;
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.06, 0.5, 8),
    new THREE.MeshStandardMaterial({
      color: '#47f08b',
      emissive: '#148f47',
      emissiveIntensity: 0.8
    })
  );
  const leafGeo = new THREE.SphereGeometry(0.18, 12, 10);
  const leafMat = new THREE.MeshStandardMaterial({
    color: '#66ffa6',
    emissive: '#19a855',
    emissiveIntensity: 0.9,
    roughness: 0.3
  });
  const leafL = new THREE.Mesh(leafGeo, leafMat);
  leafL.scale.set(1.45, 0.38, 0.85);
  leafL.position.set(-0.18, 0.12, 0);
  leafL.rotation.z = 0.35;
  const leafR = leafL.clone();
  leafR.position.set(0.18, 0.16, 0);
  leafR.rotation.z = -0.35;
  const bud = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#fff28c' })
  );
  bud.position.y = 0.32;

  builder.bioSprout.add(soilBed, stem, leafL, leafR, bud);
  builder.bioSprout.rotation.z = Math.PI / 2;
  builder.bioSprout.visible = false;

  builder.coolantPipeMat = new THREE.MeshStandardMaterial({
    color: '#4e5b6e',
    emissive: '#000000',
    emissiveIntensity: 1.5,
    metalness: 0.55,
    roughness: 0.25
  });
  const flange = new THREE.Mesh(
    new THREE.TorusGeometry(0.92, 0.1, 12, 28),
    builder.coolantPipeMat
  );
  flange.rotation.y = Math.PI / 2;

  builder.lifeDomeGroup.add(builder.bioDomeGlass, builder.bioSprout, flange);
  builder.hullPivot.add(builder.lifeDomeGroup);

  // 4. Forward Nose Astrogation Star-Projector (+Z tip)
  builder.navNoseGroup = new THREE.Group();
  builder.navNoseGroup.position.set(0, 2.25, 7.25);
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.08, 10, 24),
    new THREE.MeshStandardMaterial({ color: '#e6b84c', metalness: 0.85, roughness: 0.22 })
  );
  builder.navLens = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 20, 16),
    new THREE.MeshStandardMaterial({
      color: '#4c5566',
      emissive: '#141820',
      emissiveIntensity: 1.8,
      roughness: 0.15,
      metalness: 0.3
    })
  );
  builder.navHoloProjector = new THREE.Group();
  builder.navHoloProjector.position.z = 1.05;
  const hRing1 = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.032, 8, 36),
    new THREE.MeshBasicMaterial({ color: '#ffe478' })
  );
  const hRing2 = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.028, 8, 32),
    new THREE.MeshBasicMaterial({ color: '#6cf5ff' })
  );
  hRing2.rotation.x = Math.PI / 3;
  const hStar = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.2, 0),
    new THREE.MeshBasicMaterial({ color: '#fff8cc' })
  );
  builder.navHoloProjector.add(hRing1, hRing2, hStar);
  builder.navHoloProjector.visible = false;
  builder.navNoseGroup.add(bezel, builder.navLens, builder.navHoloProjector);
  builder.hullPivot.add(builder.navNoseGroup);

  // 5. Twin Aft Magnetic Plasma Thrusters (-Z stern)
  // Fuselage tail pole sits at z = -4.85; anchoring engineGroup at z = -4.78 caps the Lathe pole pinch
  // with a heavy titanium aft bulkhead + twin recessed thruster sockets (zero floating discs before Lv.5 repair!)
  builder.engineGroup = new THREE.Group();
  builder.engineGroup.position.set(0, 2.25, -4.78);
  builder.engineNozzles = [];
  builder.enginePlumes = [];

  const aftBulkhead = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.68, 0.36, 28),
    darkFrameMat
  );
  aftBulkhead.rotation.x = Math.PI / 2;
  aftBulkhead.scale.set(1.04, 1.0, 0.90);
  aftBulkhead.position.set(0, 0, 0.06);
  aftBulkhead.castShadow = true;

  const aftRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.44, 0.075, 10, 28),
    darkFrameMat
  );
  aftRim.scale.set(1.04, 0.90, 1.0);
  aftRim.position.set(0, 0, -0.10);
  builder.engineGroup.add(aftBulkhead, aftRim);

  // 6. Dorsal Photonic Orbital Heat-Shield Array (seated deeply into aft-mid dorsal fuselage spine)
  builder.shieldBayGroup = new THREE.Group();
  builder.shieldBayGroup.position.set(0.58, 3.72, -1.55);
  const shieldSocketPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.58, 0.44, 16),
    darkFrameMat
  );
  shieldSocketPedestal.position.y = -0.08;
  const shieldSocketRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.45, 0.055, 10, 24),
    darkFrameMat
  );
  shieldSocketRim.rotation.x = Math.PI / 2;
  shieldSocketRim.position.y = 0.14;

  builder.shieldCrownVisual = new THREE.Group();
  builder.shieldCrownVisual.position.y = 0.16;
  const crownPrismMat = new THREE.MeshStandardMaterial({
    color: '#6dfce8',
    emissive: '#0ea896',
    emissiveIntensity: 1.9,
    roughness: 0.12,
    metalness: 0.35
  });
  const centerSpire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.24, 0.58, 6),
    crownPrismMat
  );
  centerSpire.position.y = 0.26;
  builder.shieldCrownVisual.add(centerSpire);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const fin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.11, 0.36, 6),
      crownPrismMat
    );
    fin.position.set(Math.cos(a) * 0.26, 0.16, Math.sin(a) * 0.26);
    fin.rotation.z = -Math.cos(a) * 0.32;
    fin.rotation.x = Math.sin(a) * 0.32;
    builder.shieldCrownVisual.add(fin);
  }
  builder.shieldHaloRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.68, 0.032, 8, 32),
    new THREE.MeshBasicMaterial({
      color: '#8afff2',
      transparent: true,
      opacity: 0.85
    })
  );
  builder.shieldHaloRing.rotation.x = Math.PI / 2;
  builder.shieldHaloRing.position.y = 0.38;
  builder.shieldCrownVisual.add(builder.shieldHaloRing);
  builder.shieldCrownVisual.visible = false;

  builder.shieldBayGroup.add(shieldSocketPedestal, shieldSocketRim, builder.shieldCrownVisual);
  builder.hullPivot.add(builder.shieldBayGroup);

  // 7. Quantum Hyperdrive Ring Assembly (Level 7 Finale — articulated twin-pylon orbital jump ring!)
  builder.hyperdriveMountGroup = new THREE.Group();
  builder.hyperdriveMountGroup.position.set(0, 2.35, -2.55);
  for (const sx of [-1.85, 1.85]) {
    const strut = new THREE.Mesh(
      new RoundedBoxGeometry(0.65, 0.24, 0.42, 2, 0.04),
      darkFrameMat
    );
    strut.position.set(sx, 0, 0);
    builder.hyperdriveMountGroup.add(strut);
  }

  builder.hyperdriveRingGroup = new THREE.Group();
  const outerJumpTorus = new THREE.Mesh(
    new THREE.TorusGeometry(2.65, 0.14, 12, 48),
    darkFrameMat
  );
  const innerJumpGlow = new THREE.Mesh(
    new THREE.TorusGeometry(2.48, 0.065, 10, 48),
    new THREE.MeshStandardMaterial({
      color: '#d49eff',
      emissive: '#8833ff',
      emissiveIntensity: 2.4,
      roughness: 0.15
    })
  );
  builder.hyperdriveRingGroup.add(outerJumpTorus, innerJumpGlow);
  for (let nodeIdx = 0; nodeIdx < 8; nodeIdx++) {
    const a = (nodeIdx / 8) * Math.PI * 2;
    const emitter = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: nodeIdx % 2 === 0 ? '#70f8ff' : '#e0a8ff' })
    );
    emitter.position.set(Math.cos(a) * 2.56, Math.sin(a) * 2.56, 0);
    builder.hyperdriveRingGroup.add(emitter);
  }
  builder.hyperdriveRingGroup.visible = false;
  builder.hyperdriveMountGroup.add(builder.hyperdriveRingGroup);
  builder.hullPivot.add(builder.hyperdriveMountGroup);

  // 8. Translucent Photonic Re-Entry / Ascent Deflector Dome + Hyperspace Star-Streak Tunnel (for Launch Cutscene!)
  builder.ascentShieldDome = createAscentShield();
  builder.ascentShieldDomeMat = builder.ascentShieldDome.material;
  builder.ascentShieldDome.position.set(0, 2.25, 2.8);
  builder.ascentShieldDome.visible = false;
  builder.hullPivot.add(builder.ascentShieldDome);

  builder._buildHyperspaceTunnel();

  // Lathe bell nozzle profile (embeds 20cm deep into aft bulkhead socket -> flares cleanly to aft exit)
  const bellProfile = [
    new THREE.Vector2(0.42, -0.22),
    new THREE.Vector2(0.44, 0.05),
    new THREE.Vector2(0.58, 0.48),
    new THREE.Vector2(0.76, 0.94),
    new THREE.Vector2(0.86, 1.26)
  ];
  const bellGeo = new THREE.LatheGeometry(bellProfile, 24);
  bellGeo.rotateX(-Math.PI / 2);

  const socketCollarGeo = new THREE.TorusGeometry(0.46, 0.068, 10, 24);
  const socketCavityGeo = new THREE.CylinderGeometry(0.44, 0.40, 0.28, 20);
  socketCavityGeo.rotateX(Math.PI / 2);

  for (const side of [-0.72, 0.72]) {
    // Permanent hull-mounted thruster mount collar & dark recessed socket (visible on stern before Lv.5 repair!)
    const mountCollar = new THREE.Mesh(socketCollarGeo, darkFrameMat);
    mountCollar.position.set(side, 0, -0.12);

    const socketWell = new THREE.Mesh(
      socketCavityGeo,
      new THREE.MeshStandardMaterial({
        color: '#111722',
        roughness: 0.78,
        metalness: 0.48
      })
    );
    socketWell.position.set(side, 0, -0.02);
    builder.engineGroup.add(mountCollar, socketWell);

    // Repaired thruster bell assembly (hidden as a single unit until Level 5 Propulsion is installed!)
    const bell = new THREE.Group();
    bell.position.set(side, 0, -0.06);

    const bellShell = new THREE.Mesh(
      bellGeo,
      new THREE.MeshStandardMaterial({
        color: '#4e5d78',
        metalness: 0.82,
        roughness: 0.25,
        side: THREE.DoubleSide
      })
    );
    bellShell.castShadow = true;

    // Copper root mounting flange + cooling coil ring on nozzle exterior
    const rootFlange = new THREE.Mesh(
      new THREE.TorusGeometry(0.46, 0.052, 8, 22),
      new THREE.MeshStandardMaterial({ color: '#d98448', metalness: 0.82, roughness: 0.26 })
    );
    rootFlange.position.z = -0.08;

    const coil = new THREE.Mesh(
      new THREE.TorusGeometry(0.66, 0.055, 8, 22),
      new THREE.MeshStandardMaterial({ color: '#d98448', metalness: 0.8, roughness: 0.28 })
    );
    coil.position.z = -0.68;

    // Glowing plasma injector disc seated INSIDE the bell (moves & hides WITH the bell — never floats!)
    const coreGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 20),
      new THREE.MeshBasicMaterial({ color: '#ff75d8', side: THREE.DoubleSide })
    );
    coreGlow.position.set(0, 0, -1.12);

    bell.add(bellShell, rootFlange, coil, coreGlow);

    const plumeGroup = createThrusterPlume(side < 0 ? 0 : Math.PI);
    plumeGroup.position.set(side, 0, -1.38);

    builder.engineGroup.add(bell, plumeGroup);
    builder.engineNozzles.push({ bell, coreGlow });
    builder.enginePlumes.push(plumeGroup);
  }
  builder.hullPivot.add(builder.engineGroup);

  // Low-profile flush Repair Target Holographic Floor Pads (zero wheel clipping when driven over)
  for (const target of Object.values(REPAIR_TARGETS)) {
    const padGroup = new THREE.Group();
    const baseRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.56, 0.64, 0.035, 20),
      darkFrameMat
    );
    const glowDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.048, 20),
      new THREE.MeshStandardMaterial({
        color: '#ff9d3b',
        emissive: '#ff6a00',
        emissiveIntensity: 1.8,
        roughness: 0.25
      })
    );
    padGroup.add(baseRing, glowDisc);
    const gy = getTerrainHeight(target.position.x, target.position.z, false);
    padGroup.position.set(target.position.x, gy - builder.baseGroundY + 0.018, target.position.z);
    builder.group.add(padGroup);
    builder.repairMarkers.set(target.id, { group: padGroup, glowDisc });
  }
}
