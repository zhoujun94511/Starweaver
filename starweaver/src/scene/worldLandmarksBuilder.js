import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ELEVATED_PLATFORMS, WORLD_FACILITIES } from '../data/gameData.js';
import { createFloatingBadgeTexture, createIndustrialSpecPlateTexture } from '../graphics/textures.js';
import {
  createBasaltClusterGeometry,
  createHexCrystalGeometry,
  createHostRockOutcropGeometry
} from '../graphics/proceduralMeshes.js';
import { clamp, getTerrainHeight, smoothstep } from '../utils/math.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';

export function buildRelayBridgeAndPylons(world) {
  // Custom GLSL Scrolling Photonic Energy Bridge Deck!
  world.bridgeUniforms = {
    uTime: { value: 0 }
  };
  const bridgeMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: world.bridgeUniforms,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main() {
        // Edge rails + scrolling photonic chevrons toward west star-field
        float edge = smoothstep(0.36, 0.49, abs(vUv.y - 0.5));
        float chevron = sin((vUv.x * 18.0 + uTime * 3.5) + abs(vUv.y - 0.5) * 8.0) * 0.5 + 0.5;
        float grid = step(0.86, fract(vUv.x * 14.0)) + step(0.88, fract(vUv.y * 8.0));

        vec3 baseCol = vec3(0.12, 0.78, 1.0);
        vec3 brightCol = vec3(0.65, 0.98, 1.0);
        vec3 col = mix(baseCol, brightCol, chevron * 0.55 + edge * 0.8 + clamp(grid, 0.0, 1.0) * 0.35);
        float alpha = 0.62 + edge * 0.35 + chevron * 0.14;
        gl_FragColor = vec4(col * 1.45, clamp(alpha, 0.0, 0.96));
      }
    `
  });

  const bridgeGeo = new THREE.PlaneGeometry(13.6, 6.2);
  bridgeGeo.rotateX(-Math.PI / 2);
  world.bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
  world.bridgeMesh.position.set(-45.0, 0.7, 0);
  world.groups.dynamic.add(world.bridgeMesh);

  const pierMat = new THREE.MeshStandardMaterial({
    color: '#48455e',
    roughness: 0.55,
    metalness: 0.55
  });
  const pierEntries = [];
  const pierBoxGeo = new RoundedBoxGeometry(1.3, 1.25, 7.1, 3, 0.08);
  const pylonPedestalGeo = new THREE.CylinderGeometry(0.85, 1.12, 1.55, 12);
  const pylonNeckGeo = new THREE.CylinderGeometry(0.20, 0.30, 0.68, 12);
  const pylonJointGeo = new THREE.SphereGeometry(0.24, 12, 10);
  const obsBaseGeo = new THREE.CylinderGeometry(1.12, 1.48, 1.65, 14);
  const obsMastGeo = new THREE.CylinderGeometry(0.28, 0.38, 0.62, 14);

  for (const px of [-38.3, -51.7]) {
    // Top surface flush at y = 0.04 + 0.625 = 0.665 (right beneath y=0.70 hard-light deck — zero wheel clipping!)
    pierEntries.push({
      geo: pierBoxGeo,
      position: [px, 0.04, 0]
    });
    world.colliders.push(
      { id: `bridge_pier_${px}_n`, x: px, z: -3.35, radius: 0.52 },
      { id: `bridge_pier_${px}_s`, x: px, z: 3.35, radius: 0.52 }
    );
  }

  const mirrorFrameGeo = new RoundedBoxGeometry(1.56, 1.14, 0.18, 3, 0.05);
  const mirrorBackingGeo = new RoundedBoxGeometry(0.56, 0.52, 0.22, 2, 0.04);
  const mirrorFrameMat = new THREE.MeshStandardMaterial({
    color: '#ffe082',
    emissive: '#8f5b00',
    emissiveIntensity: 1.2,
    metalness: 0.88,
    roughness: 0.16
  });

  for (const pCfg of WORLD_FACILITIES.pylons) {
    const plat = pCfg.platformId
      ? ELEVATED_PLATFORMS.find((pl) => pl.id === pCfg.platformId)
      : null;
    const py = plat ? plat.topY : getTerrainHeight(pCfg.x, pCfg.z, false);
    const pg = new THREE.Group();
    pg.position.set(pCfg.x, py, pCfg.z);

    pierEntries.push(
      {
        geo: pylonPedestalGeo,
        position: [pCfg.x, py + 0.77, pCfg.z]
      },
      {
        geo: pylonNeckGeo,
        position: [pCfg.x, py + 1.82, pCfg.z]
      },
      {
        geo: pylonJointGeo,
        position: [pCfg.x, py + 2.15, pCfg.z]
      }
    );

    const mirrorHead = new THREE.Group();
    mirrorHead.position.y = 2.15;
    const mirrorFrame = new THREE.Mesh(mirrorFrameGeo, mirrorFrameMat);
    mirrorFrame.position.z = 0.10;
    const mirrorBacking = new THREE.Mesh(mirrorBackingGeo, pierMat);
    mirrorBacking.position.z = -0.02;
    mirrorHead.add(mirrorBacking, mirrorFrame);
    mirrorHead.rotation.set(0.55, 1.1, 0.35);

    // 3D Conduit Cable spanning cleanly from Pylon base (even atop Sky-Spire!) to Bridge Pier
    const endVec = new THREE.Vector3(-38.3 - pCfg.x, 0.45 - py, 0 - pCfg.z);
    const startVec = new THREE.Vector3(0, 0.18, 0);
    const diffVec = endVec.clone().sub(startVec);
    const len = diffVec.length();
    const cableMat = new THREE.MeshStandardMaterial({
      color: '#ff7b3b',
      emissive: '#cc4400',
      emissiveIntensity: 1.6
    });
    const cable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, len, 10),
      cableMat
    );
    cable.position.copy(startVec).addScaledVector(diffVec, 0.5);
    cable.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      diffVec.clone().normalize()
    );

    pg.add(mirrorHead, cable);
    world.groups.dynamic.add(pg);
    world.pylonVisuals.set(pCfg.id, { group: pg, mirrorHead, mirrorFrame, cableMat, y: py });
    world.colliders.push({
      id: pCfg.id,
      x: pCfg.x,
      z: pCfg.z,
      radius: 1.05,
      minY: plat ? plat.topY - 0.5 : undefined
    });
  }

  // Ancient Observatory Dish across the bridge (azimuth turntable + elevation yoke + focal horn)
  const obs = WORLD_FACILITIES.observatory;
  const oy = getTerrainHeight(obs.x, obs.z, false);
  const obsGroup = new THREE.Group();
  obsGroup.position.set(obs.x, oy, obs.z);

  pierEntries.push(
    {
      geo: obsBaseGeo,
      position: [obs.x, oy + 0.82, obs.z]
    },
    {
      geo: obsMastGeo,
      position: [obs.x, oy + 1.80, obs.z]
    }
  );

  const mergedPiers = mergeTransformedGeometries(pierEntries);
  pierBoxGeo.dispose();
  pylonPedestalGeo.dispose();
  pylonNeckGeo.dispose();
  pylonJointGeo.dispose();
  obsBaseGeo.dispose();
  obsMastGeo.dispose();
  if (mergedPiers) {
    const m = new THREE.Mesh(mergedPiers, pierMat);
    m.castShadow = true;
    m.receiveShadow = true;
    world.groups.static.add(m);
  }

  world.observatoryTurntable = new THREE.Group();
  world.observatoryTurntable.position.y = 2.08;

  const obsHub = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 12), pierMat);
  const dishPts = [
    new THREE.Vector2(0.02, 0.14),
    new THREE.Vector2(0.75, 0.30),
    new THREE.Vector2(1.48, 0.68)
  ];
  world.observatoryDishTop = new THREE.Mesh(
    new THREE.LatheGeometry(dishPts, 28),
    new THREE.MeshStandardMaterial({
      color: '#b5c4ff',
      emissive: '#1f2b5c',
      emissiveIntensity: 1.1,
      side: THREE.DoubleSide,
      metalness: 0.72,
      roughness: 0.22
    })
  );
  const dishTiltGroup = new THREE.Group();
  dishTiltGroup.rotation.x = 0.48;

  const obsFeedRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.055, 0.88, 10),
    pierMat
  );
  obsFeedRod.position.y = 0.56;
  const obsFeedBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 12, 10),
    new THREE.MeshStandardMaterial({
      color: '#7ef4ff',
      emissive: '#1d7aff',
      emissiveIntensity: 1.8
    })
  );
  obsFeedBulb.position.y = 1.02;

  dishTiltGroup.add(world.observatoryDishTop, obsFeedRod, obsFeedBulb);
  world.observatoryTurntable.add(obsHub, dishTiltGroup);
  obsGroup.add(world.observatoryTurntable);

  world.groups.dynamic.add(obsGroup);
  world.colliders.push({ id: 'observatory_dish', x: obs.x, z: obs.z, radius: obs.radius });
}

export function buildOutpostAndVentLandmarks(world) {
  // Geodesic Research Outpost Dome Tent in Dry Canyon (South)
  const tentX = -4.2;
  const tentZ = 50.5;
  const ty = getTerrainHeight(tentX, tentZ, false);
  const tentGroup = new THREE.Group();
  tentGroup.position.set(tentX, ty, tentZ);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.62, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    new THREE.MeshStandardMaterial({
      color: '#eef4ec',
      roughness: 0.55,
      metalness: 0.12
    })
  );
  dome.castShadow = true;
  // Geodesic structural wireframe hemisphere + grounded base ring (no underground stray triangles!)
  const geoWire = new THREE.Mesh(
    new THREE.SphereGeometry(2.65, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({
      color: '#2da67c',
      wireframe: true,
      roughness: 0.4
    })
  );
  const domeRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.63, 0.09, 10, 32),
    new THREE.MeshStandardMaterial({ color: '#3b4a5e', metalness: 0.6, roughness: 0.42 })
  );
  domeRing.rotation.x = Math.PI / 2;
  domeRing.position.y = 0.06;

  const airlock = new THREE.Mesh(
    new RoundedBoxGeometry(1.55, 1.48, 1.16, 3, 0.08),
    new THREE.MeshStandardMaterial({ color: '#3b4a5e', metalness: 0.55, roughness: 0.45 })
  );
  airlock.position.set(2.02, 0.74, 0.76);
  airlock.rotation.y = 0.36;
  airlock.castShadow = true;

  const commMast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.07, 1.35, 8),
    new THREE.MeshStandardMaterial({ color: '#475569', metalness: 0.65, roughness: 0.38 })
  );
  commMast.position.set(-0.65, 2.75, -0.45);
  const commBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({
      color: '#6fffe0',
      emissive: '#10b981',
      emissiveIntensity: 2.0
    })
  );
  commBeacon.position.set(-0.65, 3.45, -0.45);
  const airlockLight = new THREE.Mesh(
    new RoundedBoxGeometry(0.68, 0.12, 0.14, 2, 0.03),
    new THREE.MeshStandardMaterial({
      color: '#fff1b8',
      emissive: '#ffb74d',
      emissiveIntensity: 1.7
    })
  );
  airlockLight.position.set(2.35, 1.34, 1.24);
  airlockLight.rotation.y = 0.36;

  tentGroup.add(dome, geoWire, domeRing, airlock, commMast, commBeacon, airlockLight);
  world.groups.static.add(tentGroup);
  world.colliders.push(
    { id: 'outpost_tent', x: tentX, z: tentZ, radius: 2.72, maxY: ty + 3.0, occluder: true },
    { id: 'outpost_airlock', x: tentX + 2.15, z: tentZ + 0.8, radius: 0.92, maxY: ty + 1.8 }
  );

  // Basalt Geothermal Vent Chimneys + Hexagonal Basalt Column Pillars in North Region
  const basaltGeo = createBasaltClusterGeometry(515);
  const basaltMat = new THREE.MeshStandardMaterial({
    map: world.textures.rockMap,
    normalMap: world.textures.rockNormal,
    vertexColors: true,
    roughness: 0.8,
    metalness: 0.12
  });
  const basaltEntries = [];

  const basaltPillars = [
    [-15.5, -31.0, 1.45, 0.3],
    [15.8, -34.5, 1.55, 1.8],
    [-16.8, -47.0, 1.7, 2.5],
    [16.5, -51.5, 1.6, 0.9],
    [-14.2, -60.5, 1.5, 4.1],
    [14.5, -62.0, 1.65, 5.2]
  ];
  for (const [bx, bz, bScale, bRot] of basaltPillars) {
    const by = getTerrainHeight(bx, bz, false);
    basaltEntries.push({
      geo: basaltGeo,
      position: [bx, by - 0.1, bz],
      rotation: [0, bRot, 0],
      scale: [bScale, bScale * 1.25, bScale]
    });
    world.colliders.push({ id: `basalt_${bx}_${bz}`, x: bx, z: bz, radius: bScale * 1.05 });
  }

  const ventCoords = [
    [-4.2, -39.0],
    [5.0, -47.0],
    [-5.8, -54.5]
  ];
  const ventConeGeo = createHostRockOutcropGeometry(1.52, 2.05, 808);
  const ventThroatGeo = new THREE.CylinderGeometry(0.56, 0.35, 0.4, 12);
  const ventShardGeo = createHexCrystalGeometry(0.14, 0.35, 0.2, 0.18);
  const glowMat = new THREE.MeshStandardMaterial({
    color: '#ff78d8',
    emissive: '#ff2ba6',
    emissiveIntensity: 2.6
  });
  const ventGlowEntries = [];

  ventCoords.forEach(([vx, vz], idx) => {
    const vy = getTerrainHeight(vx, vz, false);
    basaltEntries.push({
      geo: ventConeGeo,
      position: [vx, vy, vz]
    });
    ventGlowEntries.push({
      geo: ventThroatGeo,
      position: [vx, vy + 1.65, vz]
    });
    for (let c = 0; c < 4; c++) {
      const ca = (c / 4) * Math.PI * 2 + idx;
      ventGlowEntries.push({
        geo: ventShardGeo,
        position: [vx + Math.cos(ca) * 0.62, vy + 1.52, vz + Math.sin(ca) * 0.62],
        rotation: [Math.sin(ca) * 0.35, ca, -Math.cos(ca) * 0.35]
      });
    }
    world.colliders.push({ id: `vent_${idx}`, x: vx, z: vz, radius: 1.35 });
  });

  const mergedNorthBasalt = mergeTransformedGeometries(basaltEntries);
  const mergedVentGlow = mergeTransformedGeometries(ventGlowEntries);
  basaltGeo.dispose();
  ventConeGeo.dispose();
  ventThroatGeo.dispose();
  ventShardGeo.dispose();
  if (mergedNorthBasalt) {
    const m = new THREE.Mesh(mergedNorthBasalt, basaltMat);
    m.castShadow = true;
    m.receiveShadow = true;
    world.groups.static.add(m);
  }
  if (mergedVentGlow) {
    world.groups.static.add(new THREE.Mesh(mergedVentGlow, glowMat));
  }

  // Half-Buried Ancient Star-Relay Monolith Rings in West Gorge & Star-Field!
  const ruinStoneMat = new THREE.MeshStandardMaterial({
    map: world.textures.rockMap,
    normalMap: world.textures.rockNormal,
    color: '#6d688a',
    roughness: 0.68,
    metalness: 0.28
  });
  const runeGoldMat = new THREE.MeshStandardMaterial({
    color: '#ffe078',
    emissive: '#ffaa00',
    emissiveIntensity: 1.85,
    metalness: 0.8,
    roughness: 0.2
  });
  const ruinStoneEntries = [];
  const ruinGoldEntries = [];
  const monolithTempGeos = [];
  const plinthGeo = new RoundedBoxGeometry(1.9, 1.4, 1.9, 2, 0.12);
  const obeliskGeo = new THREE.CylinderGeometry(0.42, 0.62, 3.3, 6);
  const obeliskRingGeo = new THREE.TorusGeometry(0.52, 0.075, 6, 16);
  monolithTempGeos.push(plinthGeo, obeliskGeo, obeliskRingGeo);

  for (const [rx, rz, radius, tiltX, tiltZ, rotY] of [
    [-45.0, -11.5, 5.2, 0.28, -0.15, 0.15],
    [-64.5, 11.2, 6.4, -0.22, 0.32, 0.85]
  ]) {
    const ry = getTerrainHeight(rx, rz, false);
    const archG = new THREE.TorusGeometry(radius, 0.48, 8, 28, Math.PI * 1.25);
    const trimG = new THREE.TorusGeometry(radius + 0.02, 0.12, 6, 28, Math.PI * 1.2);
    monolithTempGeos.push(archG, trimG);
    ruinStoneEntries.push({
      geo: archG,
      position: [rx, ry + 0.6, rz],
      rotation: [tiltX, rotY, tiltZ]
    });
    ruinGoldEntries.push({
      geo: trimG,
      position: [rx, ry + 0.6, rz],
      rotation: [tiltX, rotY, tiltZ]
    });

    // Anchored stone footing plinths at both arch ends
    const cosR = Math.cos(rotY);
    const sinR = Math.sin(rotY);
    for (const side of [-1, 1]) {
      const px = rx + cosR * radius * side;
      const pz = rz - sinR * radius * side;
      const py = getTerrainHeight(px, pz, false);
      ruinStoneEntries.push({
        geo: plinthGeo,
        position: [px, py + 0.55, pz],
        rotation: [0, rotY + side * 0.2, 0]
      });
      world.colliders.push({
        id: `monolith_plinth_${rx}_${side}`,
        x: px,
        z: pz,
        radius: 1.15,
        maxY: py + 1.5,
        occluder: true
      });
    }

    // Tilted broken rune obelisk flanking the monolith ring
    const ox = rx - sinR * 3.4 - cosR * 2.2;
    const oz = rz - cosR * 3.4 + sinR * 2.2;
    const oy = getTerrainHeight(ox, oz, false);
    ruinStoneEntries.push({
      geo: obeliskGeo,
      position: [ox, oy + 1.35, oz],
      rotation: [0.18, rotY + 0.4, -0.22]
    });
    ruinGoldEntries.push({
      geo: obeliskRingGeo,
      position: [ox, oy + 2.15, oz],
      rotation: [Math.PI * 0.5 + 0.18, rotY + 0.4, -0.22]
    });
    world.colliders.push({
      id: `monolith_obelisk_${rx}`,
      x: ox,
      z: oz,
      radius: 0.85,
      maxY: oy + 3.2
    });
  }
  const mergedRuinStone = mergeTransformedGeometries(ruinStoneEntries);
  const mergedRuinGold = mergeTransformedGeometries(ruinGoldEntries);
  for (const g of monolithTempGeos) g.dispose();
  if (mergedRuinStone) {
    const m = new THREE.Mesh(mergedRuinStone, ruinStoneMat);
    m.castShadow = true;
    world.groups.static.add(m);
  }
  if (mergedRuinGold) {
    world.groups.static.add(new THREE.Mesh(mergedRuinGold, runeGoldMat));
  }

  // 4. Northwest Mothership Wreckage Field ("Dawnstrider" Hull Ribs + Overhead Wing Canopy!)
  buildMothershipWreckageAndDrones(world);
}

export function buildMothershipWreckageAndDrones(world) {
  const wreckHullMat = new THREE.MeshStandardMaterial({
    map: world.textures.metalMap,
    normalMap: world.textures.metalNormal,
    color: '#9aa6c4',
    roughness: 0.38,
    metalness: 0.76,
    side: THREE.DoubleSide
  });
  const wreckQuantumMat = new THREE.MeshStandardMaterial({
    color: '#c48eff',
    emissive: '#6a24cc',
    emissiveIntensity: 2.0,
    roughness: 0.2
  });

  const hullEntries = [];
  const glowEntries = [];
  const wreckGeos = [];

  // Three colossal arched hull ribs spanning the NW crater (Milo drives freely right underneath!)
  const ribSpecs = [
    { x: -48.5, z: -48.5, r: 8.6, rotY: Math.PI * 0.25, tilt: 0.12 },
    { x: -56.0, z: -56.0, r: 10.2, rotY: Math.PI * 0.25, tilt: -0.08 },
    { x: -62.8, z: -62.8, r: 8.2, rotY: Math.PI * 0.25, tilt: 0.16 }
  ];
  for (const rib of ribSpecs) {
    const gy = getTerrainHeight(rib.x, rib.z, false);
    const ribGeo = new THREE.TorusGeometry(rib.r, 0.56, 8, 28, Math.PI);
    const stripGeo = new THREE.TorusGeometry(rib.r + 0.04, 0.12, 6, 28, Math.PI * 0.92);
    wreckGeos.push(ribGeo, stripGeo);
    hullEntries.push({
      geo: ribGeo,
      position: [rib.x, gy - 0.35, rib.z],
      rotation: [rib.tilt, rib.rotY, 0]
    });
    glowEntries.push({
      geo: stripGeo,
      position: [rib.x, gy - 0.35, rib.z],
      rotation: [rib.tilt, rib.rotY + 0.04, 0]
    });

    // Grounded rib footing colliders at the two ends of the half-torus (center corridor 15m+ wide!)
    const cosR = Math.cos(rib.rotY);
    const sinR = Math.sin(rib.rotY);
    world.colliders.push(
      {
        id: `wreck_rib_${rib.x}_a`,
        x: rib.x + cosR * rib.r,
        z: rib.z - sinR * rib.r,
        radius: 1.05,
        maxY: gy + 4.5,
        occluder: true
      },
      {
        id: `wreck_rib_${rib.x}_b`,
        x: rib.x - cosR * rib.r,
        z: rib.z + sinR * rib.r,
        radius: 1.05,
        maxY: gy + 4.5,
        occluder: true
      }
    );

    // Structural armor gusset plates along upper arch so ribs read as heavy spacecraft frames
    const gussetGeo = new RoundedBoxGeometry(1.38, 0.92, 1.24, 2, 0.08);
    wreckGeos.push(gussetGeo);
    const ribBaseY = gy - 0.35;
    for (const u of [0.28 * Math.PI, 0.5 * Math.PI, 0.72 * Math.PI]) {
      const local = new THREE.Vector3(
        rib.r * Math.cos(u),
        rib.r * Math.sin(u),
        0
      ).applyEuler(new THREE.Euler(rib.tilt, rib.rotY, 0));
      hullEntries.push({
        geo: gussetGeo,
        position: [rib.x + local.x, ribBaseY + local.y, rib.z + local.z],
        rotation: [rib.tilt, rib.rotY, u - Math.PI * 0.5]
      });
    }

    // The arc itself is solid hull, not just two ground footings. Add sparse
    // height-banded capsules along the span so jetpack flight and the camera
    // spring arm cannot pass through the elevated rib while ground traversal
    // remains open underneath it.
    for (let seg = 1; seg < 7; seg++) {
      const u = (seg / 7) * Math.PI;
      const local = new THREE.Vector3(
        rib.r * Math.cos(u),
        rib.r * Math.sin(u),
        0
      ).applyEuler(new THREE.Euler(rib.tilt, rib.rotY, 0));
      const arcY = ribBaseY + local.y;
      world.colliders.push({
        id: `wreck_rib_${rib.x}_arc_${seg}`,
        x: rib.x + local.x,
        z: rib.z + local.z,
        radius: 1.12,
        minY: arcY - 0.95,
        maxY: arcY + 0.95,
        occluder: true,
        occluderMinY: arcY - 0.95
      });
    }
  }

  // Overhead Dorsal Spine Keel & Fractured Hull Shell Plates bridging the 3 ribs high above the corridor
  const spineCenterY = getTerrainHeight(-56.0, -56.0, false);
  const keelBeamGeo = new RoundedBoxGeometry(2.35, 0.92, 22.8, 3, 0.14);
  const hullShellPlateGeo = new RoundedBoxGeometry(5.8, 0.36, 4.4, 3, 0.08);
  const spineGlowGeo = new RoundedBoxGeometry(0.42, 0.24, 20.6, 2, 0.05);
  wreckGeos.push(keelBeamGeo, hullShellPlateGeo, spineGlowGeo);

  hullEntries.push(
    {
      geo: keelBeamGeo,
      position: [-56.0, spineCenterY + 9.45, -56.0],
      rotation: [0.05, -Math.PI * 0.25, 0.06]
    },
    {
      geo: hullShellPlateGeo,
      position: [-49.8, spineCenterY + 8.05, -47.2],
      rotation: [0.14, -Math.PI * 0.25, -0.34]
    },
    {
      geo: hullShellPlateGeo,
      position: [-54.2, spineCenterY + 8.95, -58.6],
      rotation: [-0.08, -Math.PI * 0.25, 0.32]
    },
    {
      geo: hullShellPlateGeo,
      position: [-61.8, spineCenterY + 7.75, -60.2],
      rotation: [0.12, -Math.PI * 0.25, -0.38]
    }
  );
  glowEntries.push({
    geo: spineGlowGeo,
    position: [-56.0, spineCenterY + 8.92, -56.0],
    rotation: [0.05, -Math.PI * 0.25, 0.06]
  });

  // Crashed Port & Starboard Mothership Thruster Nacelles half-buried along outer flanks
  const nacelleBodyGeo = new THREE.CylinderGeometry(1.32, 1.62, 4.4, 14);
  const nacelleBellGeo = new THREE.CylinderGeometry(1.18, 1.76, 1.55, 14);
  const nacelleGlowGeo = new THREE.TorusGeometry(1.26, 0.11, 8, 24);
  wreckGeos.push(nacelleBodyGeo, nacelleBellGeo, nacelleGlowGeo);

  const nacelleSpecs = [
    { id: 'wreck_nacelle_port', x: -68.5, z: -55.0, yaw: 0.72, pitch: 0.28 },
    { id: 'wreck_nacelle_stbd', x: -55.5, z: -69.5, yaw: 0.88, pitch: -0.24 }
  ];
  for (const nac of nacelleSpecs) {
    const ny = getTerrainHeight(nac.x, nac.z, false);
    hullEntries.push(
      {
        geo: nacelleBodyGeo,
        position: [nac.x, ny + 1.05, nac.z],
        rotation: [Math.PI * 0.5 + nac.pitch, nac.yaw, 0.14]
      },
      {
        geo: nacelleBellGeo,
        position: [nac.x + Math.sin(nac.yaw) * 2.55, ny + 0.68, nac.z + Math.cos(nac.yaw) * 2.55],
        rotation: [Math.PI * 0.5 + nac.pitch, nac.yaw, 0.14]
      }
    );
    glowEntries.push({
      geo: nacelleGlowGeo,
      position: [nac.x + Math.sin(nac.yaw) * 2.15, ny + 0.82, nac.z + Math.cos(nac.yaw) * 2.15],
      rotation: [nac.pitch, nac.yaw, 0]
    });
    world.colliders.push({
      id: nac.id,
      x: nac.x,
      z: nac.z,
      radius: 2.15,
      maxY: ny + 3.0,
      occluder: true
    });
  }

  // Overhead fractured Mothership Starboard Wing Canopy (minY=3.4..maxY=5.2 so Milo walks underneath AND camera spring-arm respects thickness!)
  const wingSlabGeo = new RoundedBoxGeometry(9.6, 0.52, 6.4, 3, 0.08);
  const wingSparGeo = new RoundedBoxGeometry(9.2, 0.28, 0.55, 2, 0.05);
  const wingEdgeGlowGeo = new RoundedBoxGeometry(8.8, 0.14, 0.18, 2, 0.04);
  const wingStrutGeo = new THREE.CylinderGeometry(0.42, 0.58, 4.4, 10);
  const reactorBaseGeo = new THREE.CylinderGeometry(1.45, 1.85, 0.48, 12);
  const reactorRingGeo = new THREE.TorusGeometry(1.52, 0.085, 8, 28);
  const reactorCoreGeo = new THREE.OctahedronGeometry(1.02, 1);
  wreckGeos.push(
    wingSlabGeo,
    wingSparGeo,
    wingEdgeGlowGeo,
    wingStrutGeo,
    reactorBaseGeo,
    reactorRingGeo,
    reactorCoreGeo
  );

  const wy = getTerrainHeight(-54.5, -47.0, false);
  const reactorGroundY = getTerrainHeight(-55.8, -56.2, false);
  hullEntries.push(
    {
      geo: wingSlabGeo,
      position: [-54.5, wy + 4.05, -47.0],
      rotation: [0.06, 0.65, -0.08]
    },
    {
      geo: wingSparGeo,
      position: [-54.5, wy + 4.38, -47.0],
      rotation: [0.06, 0.65, -0.08]
    },
    {
      geo: wingStrutGeo,
      position: [-57.8, wy + 2.0, -44.8]
    },
    {
      geo: reactorBaseGeo,
      position: [-55.8, reactorGroundY + 0.24, -56.2]
    },
    {
      geo: reactorRingGeo,
      position: [-55.8, reactorGroundY + 1.48, -56.2],
      rotation: [0.58, 0.42, 0.15]
    },
    {
      geo: reactorRingGeo,
      position: [-55.8, reactorGroundY + 1.48, -56.2],
      rotation: [-0.62, -0.55, 0.32]
    }
  );
  glowEntries.push(
    {
      geo: reactorCoreGeo,
      position: [-55.8, reactorGroundY + 1.48, -56.2]
    },
    {
      geo: wingEdgeGlowGeo,
      position: [-54.5, wy + 3.82, -47.0],
      rotation: [0.06, 0.65, -0.08]
    }
  );

  world.colliders.push(
    {
      id: 'wreck_wing_strut',
      x: -57.8,
      z: -44.8,
      radius: 0.82,
      maxY: wy + 4.4,
      occluder: true
    },
    {
      id: 'wreck_wing_canopy',
      x: -54.5,
      z: -47.0,
      radius: 4.4,
      minY: wy + 3.45,
      maxY: wy + 4.65,
      occluder: true,
      occluderMinY: wy + 3.45
    },
    {
      id: 'wreck_reactor_core',
      x: -55.8,
      z: -56.2,
      radius: 1.35,
      maxY: wy + 2.8
    }
  );

  const mergedWreckHull = mergeTransformedGeometries(hullEntries);
  const mergedWreckGlow = mergeTransformedGeometries(glowEntries);
  for (const g of wreckGeos) g.dispose();
  if (mergedWreckHull) {
    const m = new THREE.Mesh(mergedWreckHull, wreckHullMat);
    m.castShadow = true;
    m.receiveShadow = true;
    world.groups.static.add(m);
  }
  if (mergedWreckGlow) {
    world.groups.static.add(new THREE.Mesh(mergedWreckGlow, wreckQuantumMat));
  }

  // 5. Post-Game Planetary Climate Telemetry Beacons across 5 Biomes
  const bPedestalGeo = new THREE.CylinderGeometry(0.28, 0.44, 0.95, 10);
  const bMastGeo = new THREE.CylinderGeometry(0.06, 0.09, 1.15, 8);
  const bOrbGeo = new THREE.OctahedronGeometry(0.24, 1);
  const bRingGeo = new THREE.TorusGeometry(0.42, 0.032, 8, 22);
  const bFrameMat = new THREE.MeshStandardMaterial({
    color: '#3b4a5e',
    metalness: 0.68,
    roughness: 0.34
  });

  for (const bn of WORLD_FACILITIES.weather_beacons) {
    const by = getTerrainHeight(bn.x, bn.z, false);
    const bg = new THREE.Group();
    bg.position.set(bn.x, by, bn.z);

    const ped = new THREE.Mesh(bPedestalGeo, bFrameMat);
    ped.position.y = 0.47;
    const mast = new THREE.Mesh(bMastGeo, bFrameMat);
    mast.position.y = 1.45;

    const orbMat = new THREE.MeshStandardMaterial({
      color: '#6b7c93',
      emissive: '#182838',
      emissiveIntensity: 1.2,
      roughness: 0.2
    });
    const orb = new THREE.Mesh(bOrbGeo, orbMat);
    orb.position.y = 2.12;
    const ring = new THREE.Mesh(bRingGeo, orbMat);
    ring.position.y = 2.12;
    ring.rotation.x = Math.PI / 3;

    bg.add(ped, mast, orb, ring);
    bg.visible = false;
    world.groups.dynamic.add(bg);
    world.beaconVisuals.set(bn.id, { group: bg, orb, ring, orbMat, _lastActive: null });
    world.colliders.push({
      id: bn.id,
      x: bn.x,
      z: bn.z,
      radius: 0.58,
      activeFn: () => Boolean(world.state.launchedHome)
    });
  }

  // 6. Camp Autonomous Mining Drone Pad & Hovering Helper Drones (beside Fabricator at -10.8, -1.2)
  world.droneBayGroup = new THREE.Group();
  const dpx = -10.8;
  const dpz = -1.2;
  const dpy = getTerrainHeight(dpx, dpz, false);
  world.droneBayGroup.position.set(dpx, dpy, dpz);

  const padDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.52, 0.12, 24),
    bFrameMat
  );
  padDisc.position.y = 0.06;
  const padHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.95, 1.12, 28),
    new THREE.MeshBasicMaterial({ color: '#66ffba', side: THREE.DoubleSide })
  );
  padHalo.rotation.x = -Math.PI / 2;
  padHalo.position.y = 0.13;
  world.droneBayGroup.add(padDisc, padHalo);

  const droneShellMat = new THREE.MeshStandardMaterial({
    color: '#f2f7ff',
    roughness: 0.24,
    metalness: 0.35
  });
  const droneChassisMat = new THREE.MeshStandardMaterial({
    color: '#252c38',
    roughness: 0.38,
    metalness: 0.72
  });
  const droneVisorMat = new THREE.MeshStandardMaterial({
    color: '#0b1320',
    roughness: 0.14,
    metalness: 0.85
  });
  const droneGlowMat = new THREE.MeshStandardMaterial({
    color: '#66ffba',
    emissive: '#0ec47a',
    emissiveIntensity: 2.0
  });
  const droneBeamMat = new THREE.MeshBasicMaterial({
    color: '#5effb8',
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  });

  // Shared geometries across both autonomous mining drones
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

  for (let di = 0; di < 2; di++) {
    const dg = new THREE.Group();

    // 1. Streamlined two-tone fuselage (white ceramic upper shell + dark titanium chassis)
    const upperShell = new THREE.Mesh(hullUpperGeo, droneShellMat);
    upperShell.scale.set(1.05, 0.62, 1.24);
    upperShell.position.y = 0.03;

    const lowerChassis = new THREE.Mesh(hullCoreGeo, droneChassisMat);
    lowerChassis.position.y = -0.055;

    // 2. Forward optical visor + glowing scanner eye (clear front orientation)
    const visor = new THREE.Mesh(visorGeo, droneVisorMat);
    visor.position.set(0, 0.015, 0.255);
    const scannerEye = new THREE.Mesh(eyeGeo, droneGlowMat);
    scannerEye.scale.set(1.4, 0.8, 0.7);
    scannerEye.position.set(0, 0.015, 0.312);

    // 3. Top micro-telemetry antenna
    const antenna = new THREE.Mesh(antennaStemGeo, droneChassisMat);
    antenna.position.set(-0.07, 0.22, -0.1);
    const antennaTip = new THREE.Mesh(antennaTipGeo, droneGlowMat);
    antennaTip.position.set(-0.07, 0.32, -0.1);

    dg.add(upperShell, lowerChassis, visor, scannerEye, antenna, antennaTip);

    // 4. Symmetric side ducted thrusters with spinning micro-rotors
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

    // 5. Underslung magnetic claws + tractor beam + spinning ore crystal
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
    world.droneBayGroup.add(dg);
    world.droneAgents.push({
      group: dg,
      phaseOffset: di * Math.PI,
      rotors,
      cargo: cargoNugget,
      beam: tractorBeam
    });
  }

  world.droneBayGroup.visible = world.state.hasEquipment('drone_fleet');
  world.groups.dynamic.add(world.droneBayGroup);
}
