import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WORLD_FACILITIES } from '../data/gameData.js';
import { createFloatingBadgeTexture, createIndustrialSpecPlateTexture } from '../graphics/textures.js';
import { applyWorldWeathering } from '../graphics/gpuMaterialBaker.js';
import { getTerrainHeight } from '../utils/math.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';

export function buildDesertStations(world) {
  const steelMat = applyWorldWeathering(
    new THREE.MeshStandardMaterial({
      map: world.textures.metalMap,
      aoMap: world.textures.metalOrm,
      aoMapIntensity: 0.95,
      roughnessMap: world.textures.metalOrm,
      metalnessMap: world.textures.metalOrm,
      normalMap: world.textures.metalNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      color: '#8899b0',
      roughness: 1.0,
      metalness: 0.85
    }),
    { dustAmount: 0.18, macroContrast: 0.10, groundSkirt: 0.35, keyTag: 'station_steel_v2' }
  );
  const darkIronMat = applyWorldWeathering(
    new THREE.MeshStandardMaterial({
      map: world.textures.titaniumMap || null,
      aoMap: world.textures.titaniumOrm || null,
      aoMapIntensity: 0.9,
      roughnessMap: world.textures.titaniumOrm || null,
      metalnessMap: world.textures.titaniumOrm || null,
      normalMap: world.textures.titaniumNormal || null,
      color: world.textures.titaniumMap ? '#ffffff' : '#262f3d',
      roughness: world.textures.titaniumOrm ? 1.0 : 0.5,
      metalness: world.textures.titaniumOrm ? 1.0 : 0.72
    }),
    { dustAmount: 0.22, macroContrast: 0.08, groundSkirt: 0.4, keyTag: 'station_iron_v2' }
  );
  const copperMat = new THREE.MeshStandardMaterial({
    map: world.textures.copperMap || null,
    aoMap: world.textures.copperOrm || null,
    roughnessMap: world.textures.copperOrm || null,
    metalnessMap: world.textures.copperOrm || null,
    normalMap: world.textures.copperNormal || null,
    color: world.textures.copperMap ? '#ffffff' : '#de8142',
    roughness: world.textures.copperOrm ? 1.0 : 0.26,
    metalness: world.textures.copperOrm ? 1.0 : 0.85
  });
  const deckPlateMat = applyWorldWeathering(
    new THREE.MeshStandardMaterial({
      map: world.textures.deckMap || world.textures.metalMap,
      aoMap: world.textures.deckOrm || null,
      roughnessMap: world.textures.deckOrm || null,
      metalnessMap: world.textures.deckOrm || null,
      normalMap: world.textures.deckNormal || world.textures.metalNormal,
      color: world.textures.deckMap ? '#ffffff' : '#4a5568',
      roughness: world.textures.deckOrm ? 1.0 : 0.48,
      metalness: world.textures.deckOrm ? 1.0 : 0.78
    }),
    { dustAmount: 0.32, macroContrast: 0.1, groundSkirt: 0.5, keyTag: 'station_deck_v2' }
  );

  // 1. Detailed Solar Smelting Furnace (East-side of Hub)
  const fCfg = WORLD_FACILITIES.furnace;
  const fGroup = new THREE.Group();
  const fy = getTerrainHeight(fCfg.x, fCfg.z, false);
  fGroup.position.set(fCfg.x, fy, fCfg.z);

  world._staticAoEntries.push({
    w: 4.6,
    h: 4.6,
    x: fCfg.x,
    y: fy + 0.03,
    z: fCfg.z
  });

  const fIronGeos = [];
  const plinthGeo = new THREE.CylinderGeometry(1.62, 1.82, 0.38, 16);
  const hearthGeo = new RoundedBoxGeometry(1.06, 0.96, 0.52, 3, 0.08);
  const roofCapGeo = new THREE.CylinderGeometry(0.98, 1.06, 0.08, 20);
  fIronGeos.push(plinthGeo, hearthGeo, roofCapGeo);
  const mergedFurnaceIron = mergeTransformedGeometries([
    { geo: plinthGeo, position: [0, 0.19, 0] },
    { geo: hearthGeo, position: [0, 1.08, 1.04] },
    { geo: roofCapGeo, position: [0, 2.09, 0] }
  ]);
  for (const g of fIronGeos) g.dispose();
  if (mergedFurnaceIron) {
    const fIronMesh = new THREE.Mesh(mergedFurnaceIron, darkIronMat);
    fIronMesh.castShadow = true;
    fIronMesh.receiveShadow = true;
    fGroup.add(fIronMesh);
  }

  // Kiln chamber with armor ribs (tapered frustum: r=1.28 at y=0.36 -> r=1.06 at y=2.08)
  const kiln = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.28, 1.72, 20), steelMat);
  kiln.position.y = 1.22;
  kiln.castShadow = true;
  fGroup.add(kiln);

  // Exact frustum-fitted copper bands (flush at y=0.72 -> r=1.234, y=1.68 -> r=1.111),
  // side pipes with top/bottom return elbows into the kiln wall, rear-offset exhaust stack,
  // and front-left solar mirror turret mast!
  const bandLowGeo = new THREE.TorusGeometry(1.245, 0.058, 10, 28);
  const bandHighGeo = new THREE.TorusGeometry(1.12, 0.058, 10, 28);
  const pipeGeo = new THREE.CylinderGeometry(0.095, 0.095, 1.16, 10);
  const pipeElbowGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.34, 10);
  const pipeCapGeo = new THREE.SphereGeometry(0.108, 10, 8);
  const chimneyCollarGeo = new THREE.CylinderGeometry(0.48, 0.56, 0.16, 16);
  const chimneyGeo = new THREE.CylinderGeometry(0.32, 0.44, 0.96, 16);
  const chimneyRimGeo = new THREE.TorusGeometry(0.33, 0.045, 8, 20);
  const dishBaseGeo = new THREE.CylinderGeometry(0.26, 0.32, 0.22, 14);
  const dishMastGeo = new THREE.CylinderGeometry(0.11, 0.15, 0.98, 12);
  const dishJointGeo = new THREE.SphereGeometry(0.16, 12, 10);
  const hearthBezelGeo = new THREE.TorusGeometry(0.39, 0.055, 10, 24);

  const mergedFurnaceCopper = mergeTransformedGeometries([
    { geo: bandLowGeo, position: [0, 0.72, 0], rotation: [Math.PI / 2, 0, 0] },
    { geo: bandHighGeo, position: [0, 1.68, 0], rotation: [Math.PI / 2, 0, 0] },
    // Framed circular porthole bezel around the molten crucible core!
    { geo: hearthBezelGeo, position: [0, 1.08, 1.29] },
    // Left & right thermal manifold pipes + sealed elbow joints into kiln body
    { geo: pipeGeo, position: [-1.24, 1.18, -0.08] },
    { geo: pipeCapGeo, position: [-1.24, 1.76, -0.08] },
    { geo: pipeElbowGeo, position: [-1.10, 1.76, -0.08], rotation: [0, 0, Math.PI / 2] },
    { geo: pipeCapGeo, position: [-1.24, 0.60, -0.08] },
    { geo: pipeElbowGeo, position: [-1.12, 0.60, -0.08], rotation: [0, 0, Math.PI / 2] },

    { geo: pipeGeo, position: [1.24, 1.18, -0.08] },
    { geo: pipeCapGeo, position: [1.24, 1.76, -0.08] },
    { geo: pipeElbowGeo, position: [1.10, 1.76, -0.08], rotation: [0, 0, Math.PI / 2] },
    { geo: pipeCapGeo, position: [1.24, 0.60, -0.08] },
    { geo: pipeElbowGeo, position: [1.12, 0.60, -0.08], rotation: [0, 0, Math.PI / 2] },

    // Rear-right exhaust chimney stack seated solidly into iron roof cap
    { geo: chimneyCollarGeo, position: [0.34, 2.13, -0.44] },
    { geo: chimneyGeo, position: [0.34, 2.63, -0.44] },
    { geo: chimneyRimGeo, position: [0.34, 3.11, -0.44], rotation: [Math.PI / 2, 0, 0] },

    // Dedicated articulated turret mast supporting the parabolic solar concentrator dish
    { geo: dishBaseGeo, position: [-0.42, 2.14, 0.20] },
    { geo: dishMastGeo, position: [-0.42, 2.67, 0.20] },
    { geo: dishJointGeo, position: [-0.42, 3.17, 0.20] }
  ]);
  for (const g of [
    bandLowGeo,
    bandHighGeo,
    hearthBezelGeo,
    pipeGeo,
    pipeElbowGeo,
    pipeCapGeo,
    chimneyCollarGeo,
    chimneyGeo,
    chimneyRimGeo,
    dishBaseGeo,
    dishMastGeo,
    dishJointGeo
  ]) {
    g.dispose();
  }
  if (mergedFurnaceCopper) {
    const copperMesh = new THREE.Mesh(mergedFurnaceCopper, copperMat);
    copperMesh.castShadow = true;
    fGroup.add(copperMesh);
  }

  // Parabolic gold solar concentrator assembly seated cleanly on the articulated turret joint
  const dishAssembly = new THREE.Group();
  dishAssembly.position.set(-0.42, 3.17, 0.20);
  dishAssembly.rotation.set(0.42, 0.24, -0.26);

  const mirrorHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.18, 0.16, 16),
    darkIronMat
  );
  mirrorHub.position.y = 0.04;

  const mirrorPts = [
    new THREE.Vector2(0.01, 0.10),
    new THREE.Vector2(0.46, 0.18),
    new THREE.Vector2(0.92, 0.40)
  ];
  const mirrorDish = new THREE.Mesh(
    new THREE.LatheGeometry(mirrorPts, 28),
    new THREE.MeshStandardMaterial({
      color: '#ffdb7d',
      roughness: 0.14,
      metalness: 0.92,
      side: THREE.DoubleSide
    })
  );
  mirrorDish.castShadow = true;

  const focalStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.035, 0.52, 8),
    darkIronMat
  );
  focalStrut.position.y = 0.36;
  const focalReceiver = new THREE.Mesh(
    new THREE.SphereGeometry(0.095, 12, 10),
    new THREE.MeshStandardMaterial({
      color: '#ffd275',
      emissive: '#ff7b00',
      emissiveIntensity: 2.0,
      roughness: 0.2
    })
  );
  focalReceiver.position.y = 0.62;

  dishAssembly.add(mirrorHub, mirrorDish, focalStrut, focalReceiver);
  fGroup.add(dishAssembly);

  world.furnaceCoreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 18, 14),
    new THREE.MeshStandardMaterial({
      color: '#ffb84d',
      emissive: '#ff6f00',
      emissiveIntensity: 2.4,
      roughness: 0.2
    })
  );
  world.furnaceCoreMesh.scale.set(1.0, 1.0, 0.55);
  world.furnaceCoreMesh.position.set(0, 1.08, 1.24);
  fGroup.add(world.furnaceCoreMesh);

  world.furnaceLight = new THREE.PointLight('#ff8c2b', 2.4, 9.5);
  world.furnaceLight.position.set(0, 1.25, 1.45);
  fGroup.add(world.furnaceLight);

  // Industrial diamond-tread operator deck + riveted thermal hazard plaque on Solar Furnace
  const fDeck = new THREE.Mesh(
    new THREE.CylinderGeometry(2.15, 2.28, 0.08, 24),
    deckPlateMat
  );
  fDeck.position.y = 0.04;
  fDeck.receiveShadow = true;
  fGroup.add(fDeck);

  // Phase-Change Storage Battery Bank seated flush on rear-left furnace deck (visible once 'battery' is crafted!)
  world.furnaceBatteryGroup = new THREE.Group();
  world.furnaceBatteryGroup.position.set(-0.88, 0.08, -0.78);
  world.furnaceBatteryGroup.rotation.y = -0.58;
  const batCabinet = new THREE.Mesh(
    new RoundedBoxGeometry(0.62, 0.86, 0.44, 3, 0.05),
    darkIronMat
  );
  batCabinet.position.y = 0.43;
  batCabinet.castShadow = true;
  const batBusbar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 0.56, 10),
    copperMat
  );
  batBusbar.rotation.z = Math.PI / 2;
  batBusbar.position.set(0.36, 0.52, 0.08);
  world.furnaceBatteryGlowMat = new THREE.MeshStandardMaterial({
    color: '#ffd24d',
    emissive: '#ffaa00',
    emissiveIntensity: 1.9,
    roughness: 0.2
  });
  for (let bi = 0; bi < 3; bi++) {
    const cellBar = new THREE.Mesh(
      new RoundedBoxGeometry(0.42, 0.11, 0.06, 2, 0.02),
      world.furnaceBatteryGlowMat
    );
    cellBar.position.set(0, 0.24 + bi * 0.21, 0.21);
    world.furnaceBatteryGroup.add(cellBar);
  }
  world.furnaceBatteryGroup.add(batCabinet, batBusbar);
  world.furnaceBatteryGroup.visible = world.state.hasEquipment('battery');
  fGroup.add(world.furnaceBatteryGroup);

  const fPlateTex = createIndustrialSpecPlateTexture({
    header: 'SOLAR CRUCIBLE',
    code: 'UNIT SC-1420 · KHARIS',
    specA: 'CORE TEMP: 1,420 C',
    specB: 'CAUTION: MOLTEN SLAG',
    accent: '#ffad3b'
  });
  const fPlateMount = new THREE.Mesh(
    new RoundedBoxGeometry(0.72, 0.44, 0.16, 2, 0.03),
    darkIronMat
  );
  fPlateMount.position.set(0.82, 1.18, 0.78);
  fPlateMount.rotation.set(-0.125, 0.68, 0);
  const fPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.38),
    new THREE.MeshStandardMaterial({
      map: fPlateTex,
      roughness: 0.42,
      metalness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
  fPlate.position.z = 0.085;
  fPlateMount.add(fPlate);
  fGroup.add(fPlateMount);

  // Floating holographic Station Name Badge above Solar Furnace!
  const furnaceBadgeTex = createFloatingBadgeTexture('太阳能熔炼炉', '原矿 → 铁板/铜锭/透镜', '#ffad42');
  const furnaceBadgeMat = new THREE.SpriteMaterial({
    map: furnaceBadgeTex,
    transparent: true,
    depthTest: true
  });
  const furnaceBadge = new THREE.Sprite(furnaceBadgeMat);
  furnaceBadge.position.set(0, 4.42, 0);
  furnaceBadge.scale.set(3.4, 1.02, 1);
  fGroup.add(furnaceBadge);
  world.stationBadges.push({
    sprite: furnaceBadge,
    mat: furnaceBadgeMat,
    tex: furnaceBadgeTex,
    x: fCfg.x,
    z: fCfg.z,
    baseW: 3.4,
    baseH: 1.02,
    zh: ['🔥 太阳能熔炼炉', '原矿 → 铁板 / 紫铜锭 / 透镜'],
    en: ['🔥 Solar Furnace', 'Smelt Raw Ore → Plates & Ingots']
  });

  world.groups.dynamic.add(fGroup);
  world.colliders.push({ id: 'furnace', x: fCfg.x, z: fCfg.z, radius: fCfg.radius });

  // 2. Precision Fabrication Station (West-side of Hub)
  const fabCfg = WORLD_FACILITIES.fabricator;
  const fabGroup = new THREE.Group();
  const fabY = getTerrainHeight(fabCfg.x, fabCfg.z, false);
  fabGroup.position.set(fabCfg.x, fabY, fabCfg.z);

  world._staticAoEntries.push({
    w: 4.8,
    h: 3.8,
    x: fabCfg.x,
    y: fabY + 0.03,
    z: fabCfg.z
  });

  const bench = new THREE.Mesh(
    new RoundedBoxGeometry(2.6, 0.96, 1.85, 4, 0.1),
    steelMat
  );
  bench.position.y = 0.48;
  bench.castShadow = true;
  bench.receiveShadow = true;
  fabGroup.add(bench);

  // Holographic build plate with concentric glowing rings
  const holoBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.74, 0.82, 0.1, 24),
    darkIronMat
  );
  holoBase.position.set(0.15, 1.01, 0.1);
  const holoPad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.13, 24),
    new THREE.MeshStandardMaterial({
      color: '#66f0ff',
      emissive: '#00a8e8',
      emissiveIntensity: 2.0,
      roughness: 0.18
    })
  );
  holoPad.position.set(0.15, 1.03, 0.1);
  fabGroup.add(holoBase, holoPad);

  // Slanted operator display terminal mounted on bench stanchion
  const consolePost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.085, 0.34, 10),
    copperMat
  );
  consolePost.position.set(-0.92, 1.09, 0.44);
  const sideConsole = new THREE.Mesh(
    new RoundedBoxGeometry(0.55, 0.42, 0.12, 3, 0.04),
    new THREE.MeshStandardMaterial({
      color: '#6cf5ff',
      emissive: '#0c8ab8',
      emissiveIntensity: 1.5
    })
  );
  sideConsole.position.set(-0.92, 1.25, 0.48);
  sideConsole.rotation.x = -0.55;
  fabGroup.add(consolePost, sideConsole);

  // Articulated robotic assembly arm + fabrication laser beam (fully connected post -> shoulder -> boom -> wrist -> emitter)
  world.fabricatorArm = new THREE.Group();
  world.fabricatorArm.position.set(-0.68, 0.96, -0.45);
  const postCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.27, 0.10, 16),
    copperMat
  );
  postCollar.position.y = 0.05;
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.18, 1.18, 12),
    new THREE.MeshStandardMaterial({ color: '#3b88b8', metalness: 0.7, roughness: 0.3 })
  );
  post.position.y = 0.59;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 12), copperMat);
  joint.position.y = 1.18;

  // Boom angled cleanly from shoulder (0, 1.18, 0) to wrist (0.83, 1.18, 0.55) directly over holo build pad!
  const boomYaw = Math.atan2(0.55, 0.83);
  const boomLen = Math.hypot(0.83, 0.55);
  const boom = new THREE.Mesh(
    new RoundedBoxGeometry(boomLen + 0.16, 0.16, 0.19, 3, 0.04),
    steelMat
  );
  boom.position.set(0.83 * 0.5, 1.18, 0.55 * 0.5);
  boom.rotation.y = -boomYaw;

  const wristDrop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.10, 0.22, 12),
    copperMat
  );
  wristDrop.position.set(0.83, 1.09, 0.55);

  const emitterHead = new THREE.Mesh(
    new THREE.ConeGeometry(0.13, 0.28, 12),
    new THREE.MeshStandardMaterial({
      color: '#75f7ff',
      emissive: '#00ccff',
      emissiveIntensity: 2.2
    })
  );
  emitterHead.position.set(0.83, 0.92, 0.55);
  emitterHead.rotation.x = Math.PI;

  world.fabricatorLaser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.06, 0.78, 8),
    new THREE.MeshBasicMaterial({
      color: '#70f8ff',
      transparent: true,
      opacity: 0.85
    })
  );
  world.fabricatorLaser.position.set(0.83, 0.45, 0.55);
  world.fabricatorLaser.visible = false;

  world.fabricatorArm.add(postCollar, post, joint, boom, wristDrop, emitterHead, world.fabricatorLaser);
  fabGroup.add(world.fabricatorArm);

  // Industrial diamond-tread platform + CAD spec plaque + cyan holographic fill light
  const fabDeck = new THREE.Mesh(
    new RoundedBoxGeometry(3.25, 0.08, 2.55, 2, 0.03),
    deckPlateMat
  );
  fabDeck.position.y = 0.04;
  fabDeck.receiveShadow = true;
  fabGroup.add(fabDeck);

  const fabPlateTex = createIndustrialSpecPlateTexture({
    header: 'PRECISION GANTRY',
    code: 'UNIT FAB-02 · LASER CAD',
    specA: 'TOLERANCE: 0.005 MM',
    specB: 'CLASS-IV PHOTONIC BEAM',
    accent: '#4ee8ff'
  });
  const fabPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.76, 0.44),
    new THREE.MeshStandardMaterial({
      map: fabPlateTex,
      roughness: 0.4,
      metalness: 0.68,
      polygonOffset: true,
      polygonOffsetFactor: -2
    })
  );
  fabPlate.position.set(0, 0.52, 0.935);
  fabGroup.add(fabPlate);

  const fabLight = new THREE.PointLight('#3be8ff', 1.45, 7.2);
  fabLight.position.set(0.15, 1.55, 0.45);
  fabGroup.add(fabLight);

  // Floating holographic Station Name Badge above Fabrication Station!
  const fabBadgeTex = createFloatingBadgeTexture('精密制造台', '板材/锭 → 飞船修复总成', '#5ce8ff');
  const fabBadgeMat = new THREE.SpriteMaterial({
    map: fabBadgeTex,
    transparent: true,
    depthTest: true
  });
  const fabBadge = new THREE.Sprite(fabBadgeMat);
  fabBadge.position.set(0, 3.25, 0);
  fabBadge.scale.set(3.4, 1.02, 1);
  fabGroup.add(fabBadge);
  world.stationBadges.push({
    sprite: fabBadge,
    mat: fabBadgeMat,
    tex: fabBadgeTex,
    x: fabCfg.x,
    z: fabCfg.z,
    baseW: 3.4,
    baseH: 1.02,
    zh: ['⚙️ 精密制造台', '精炼板材 → 合成飞船核心模块'],
    en: ['⚙️ Fabrication Station', 'Assemble Ship Repair Modules']
  });

  world.groups.dynamic.add(fabGroup);
  // Capsule-like 3-circle collider matching the 2.6m x 1.85m rectangular workbench so corners never clip!
  world.colliders.push(
    { id: 'fabricator', x: fabCfg.x, z: fabCfg.z, radius: 1.18 },
    { id: 'fabricator_w', x: fabCfg.x - 0.72, z: fabCfg.z, radius: 1.02 },
    { id: 'fabricator_e', x: fabCfg.x + 0.72, z: fabCfg.z, radius: 1.02 }
  );

  // 3. Declarative Field Dual-Mode Workstations (Dry Canyon, Salt Flats & Mothership Wreckage)
  world.purifierRings = [];
  const fieldStations = WORLD_FACILITIES.stations.filter((st) => st.stationKind === 'both');
  for (const pCfg of fieldStations) {
    const pGroup = new THREE.Group();
    const py = getTerrainHeight(pCfg.x, pCfg.z, false);
    pGroup.position.set(pCfg.x, py, pCfg.z);

    world._staticAoEntries.push({
      w: 3.6,
      h: 3.6,
      x: pCfg.x,
      y: py + 0.03,
      z: pCfg.z
    });

    const pBase = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.42, 0.88, 16), steelMat);
    pBase.position.y = 0.44;
    pBase.castShadow = true;
    pGroup.add(pBase);

    const pCoreCol = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.48, 0.44, 16),
      darkIronMat
    );
    pCoreCol.position.y = 1.04;
    pGroup.add(pCoreCol);
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2;
      const spoke = new THREE.Mesh(
        new RoundedBoxGeometry(0.56, 0.12, 0.14, 2, 0.03),
        darkIronMat
      );
      spoke.position.set(Math.cos(ang) * 0.48, 0.94, Math.sin(ang) * 0.48);
      spoke.rotation.y = -ang;
      const pProng = new THREE.Mesh(
        new RoundedBoxGeometry(0.16, 0.46, 0.18, 2, 0.03),
        copperMat
      );
      pProng.position.set(Math.cos(ang) * 0.76, 1.02, Math.sin(ang) * 0.76);
      pProng.rotation.y = -ang;
      pGroup.add(spoke, pProng);
    }

    const accentHex = pCfg.accentColor || '#52ffb8';
    const ringMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.095, 12, 28),
      new THREE.MeshStandardMaterial({
        color: accentHex,
        emissive: accentHex,
        emissiveIntensity: 1.85
      })
    );
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 1.18;
    pGroup.add(ringMesh);
    world.purifierRings.push(ringMesh);
    if (pCfg.id === 'outpost_purifier') {
      world.purifierRing = ringMesh;
    }

    const badgeZh = pCfg.badgeZh || ['🧪 前哨便携一体台', '支持现场熔炼 + 维生组装'];
    const badgeEn = pCfg.badgeEn || ['🧪 Outpost Workbench', 'Field Smelter & Fabricator'];
    const outBadgeTex = createFloatingBadgeTexture(badgeZh[0], badgeZh[1], accentHex);
    const outBadgeMat = new THREE.SpriteMaterial({
      map: outBadgeTex,
      transparent: true,
      depthTest: true
    });
    const outBadge = new THREE.Sprite(outBadgeMat);
    outBadge.position.set(0, 2.85, 0);
    outBadge.scale.set(3.3, 0.99, 1);
    pGroup.add(outBadge);
    world.stationBadges.push({
      sprite: outBadge,
      mat: outBadgeMat,
      tex: outBadgeTex,
      x: pCfg.x,
      z: pCfg.z,
      baseW: 3.3,
      baseH: 0.99,
      zh: badgeZh,
      en: badgeEn
    });

    world.groups.dynamic.add(pGroup);
    world.colliders.push({ id: pCfg.id, x: pCfg.x, z: pCfg.z, radius: pCfg.radius });
  }
}
