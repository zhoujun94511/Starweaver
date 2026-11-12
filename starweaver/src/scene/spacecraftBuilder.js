import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PREFLIGHT_CHECKS, REPAIR_TARGETS } from '../data/gameData.js';
import {
  createMetalHullPBR,
  createScorchDecalTexture,
  createVisorCanvas
} from '../graphics/textures.js';
import { getTerrainHeight, lerp, clamp, smoothstep } from '../utils/math.js';

export class SpacecraftBuilder {
  constructor(scene, state, environments = null, skyDome = null) {
    this.scene = scene;
    this.state = state;
    this.environments = environments;
    this.skyDome = skyDome;

    this.group = new THREE.Group();
    this.group.name = 'spacecraft';
    this.baseGroundY = getTerrainHeight(0, 0, false);
    this.group.position.set(0, this.baseGroundY, 0);
    this.scene.add(this.group);

    // Crash site ground details stay anchored on desert floor even when ship lifts off!
    this.crashSiteDecals = new THREE.Group();
    this.crashSiteDecals.position.set(0, this.baseGroundY, 0);
    this.scene.add(this.crashSiteDecals);

    // Hull pivot tilts slightly when crashed and levels out when propulsion/struts are restored
    this.hullPivot = new THREE.Group();
    this.group.add(this.hullPivot);

    this.hullPBR = createMetalHullPBR(256);
    this.repairMarkers = new Map();
    this.preflightMeshes = new Map();
    this.signalRings = [];
    this._lastRepairKey = '';

    // Pre-allocated scratch vectors/colors for zero-GC cutscene playback
    this._cutCamPos = new THREE.Vector3();
    this._cutCamLook = new THREE.Vector3();
    this._skyDesertCol = new THREE.Color('#e5b487');
    this._skySpaceCol = new THREE.Color('#091126');

    this._buildCrashSkidAndBerms();
    this._buildShipHull();
    this._buildRepairModules();
    this._buildPreflightAndRamp();
    this._buildHomeworldScene();
  }

  getColliders() {
    return [
      { id: 'ship_aft', x: 0, z: -3.9, radius: 2.55, activeFn: () => this.group.visible },
      { id: 'ship_mid', x: 0, z: 0.0, radius: 2.75, activeFn: () => this.group.visible },
      { id: 'ship_fwd', x: 0, z: 3.7, radius: 2.35, activeFn: () => this.group.visible }
    ];
  }

  _buildCrashSkidAndBerms() {
    // Scorched desert skid mark trailing behind the crashed Starweaver
    const scorchTex = createScorchDecalTexture(256);
    const scorchMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(9.5, 19.0),
      new THREE.MeshBasicMaterial({
        map: scorchTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.78
      })
    );
    scorchMesh.rotation.x = -Math.PI / 2;
    scorchMesh.position.set(-0.2, 0.04, -3.2);
    this.crashSiteDecals.add(scorchMesh);

    // Plowed sand berms pushed up along both flanks of the hull
    const bermMat = new THREE.MeshStandardMaterial({
      color: '#cf9363',
      roughness: 0.94,
      metalness: 0.02
    });
    for (const [bx, bz, sx, sz, rotY] of [
      [-3.5, 1.4, 1.1, 4.2, 0.18],
      [3.6, 1.2, 1.0, 3.8, -0.16],
      [0.2, 7.6, 2.8, 1.1, 0.05]
    ]) {
      const berm = new THREE.Mesh(new THREE.SphereGeometry(0.68, 14, 10), bermMat);
      berm.scale.set(sx, 0.38, sz);
      const by = getTerrainHeight(bx, bz, false) - this.baseGroundY;
      berm.position.set(bx, by + 0.05, bz);
      berm.rotation.y = rotY;
      berm.receiveShadow = true;
      this.crashSiteDecals.add(berm);
    }
  }

  _buildShipHull() {
    const hullMat = new THREE.MeshStandardMaterial({
      map: this.hullPBR.map,
      normalMap: this.hullPBR.normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: '#eef3fa',
      roughness: 0.3,
      metalness: 0.62
    });
    const darkTitaniumMat = new THREE.MeshStandardMaterial({
      color: '#2b3648',
      roughness: 0.42,
      metalness: 0.72
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: '#eb7d3c',
      roughness: 0.34,
      metalness: 0.38
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: '#d98448',
      roughness: 0.28,
      metalness: 0.82
    });

    // 1. Sleek curved fuselage sculpted via SplineCurve + LatheGeometry!
    const profilePoints = new THREE.SplineCurve([
      new THREE.Vector2(0.01, -4.85),
      new THREE.Vector2(1.65, -4.75),
      new THREE.Vector2(2.15, -3.6),
      new THREE.Vector2(2.32, -1.2),
      new THREE.Vector2(2.26, 1.5),
      new THREE.Vector2(1.92, 3.8),
      new THREE.Vector2(1.22, 5.75),
      new THREE.Vector2(0.45, 7.05),
      new THREE.Vector2(0.01, 7.35)
    ]).getPoints(36);

    const fuselageGeo = new THREE.LatheGeometry(profilePoints, 32);
    fuselageGeo.rotateX(Math.PI / 2);
    const fuselage = new THREE.Mesh(fuselageGeo, hullMat);
    fuselage.scale.set(1.04, 0.92, 1.0);
    fuselage.position.set(0, 2.25, 0);
    fuselage.castShadow = true;
    fuselage.receiveShadow = true;
    this.hullPivot.add(fuselage);

    // Thermal shield belly plate along lower hull
    const bellyGeo = fuselageGeo.clone();
    const belly = new THREE.Mesh(bellyGeo, darkTitaniumMat);
    belly.scale.set(0.98, 0.52, 0.96);
    belly.position.set(0, 1.48, -0.05);
    this.hullPivot.add(belly);

    // Structural fuselage armor rings / collar ribs
    for (const [rz, radius, mat] of [
      [-3.1, 2.18, darkTitaniumMat],
      [-0.4, 2.34, accentMat],
      [2.1, 2.15, darkTitaniumMat],
      [4.6, 1.62, copperMat]
    ]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.085, 12, 32), mat);
      rib.scale.set(1.04, 0.92, 1.0);
      rib.position.set(0, 2.25, rz);
      rib.castShadow = true;
      this.hullPivot.add(rib);
    }

    // 2. Beveled swept delta wings via ExtrudeGeometry!
    const wingShape = new THREE.Shape();
    wingShape.moveTo(1.6, 1.1);
    wingShape.lineTo(4.45, -0.85);
    wingShape.lineTo(4.45, -2.35);
    wingShape.lineTo(1.5, -2.75);
    wingShape.closePath();

    const extrudeOpts = {
      depth: 0.2,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.08,
      bevelSegments: 3
    };
    const rightWingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeOpts);
    rightWingGeo.rotateX(Math.PI / 2);

    const rightWing = new THREE.Mesh(rightWingGeo, hullMat);
    rightWing.position.set(0, 1.62, -0.3);
    rightWing.castShadow = true;
    rightWing.receiveShadow = true;

    const leftWing = rightWing.clone();
    leftWing.scale.x = -1;
    this.hullPivot.add(rightWing, leftWing);

    // Wing leading-edge orange trim & wingtip RCS thruster pods + nav lights
    for (const side of [-1, 1]) {
      const podGroup = new THREE.Group();
      podGroup.position.set(side * 4.48, 1.55, -1.55);

      const podBody = new THREE.Mesh(
        new RoundedBoxGeometry(0.48, 0.44, 2.35, 4, 0.14),
        accentMat
      );
      podBody.castShadow = true;
      const rcsRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.4, 14),
        darkTitaniumMat
      );
      rcsRing.rotation.x = Math.PI / 2;
      rcsRing.position.z = -1.15;

      // Aviation nav light: Port (-X) = warm rose, Starboard (+X) = emerald cyan
      const navBulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 8),
        new THREE.MeshBasicMaterial({ color: side < 0 ? '#ff5c7a' : '#4df7b8' })
      );
      navBulb.position.set(side * 0.22, 0.05, 1.12);

      podGroup.add(podBody, rcsRing, navBulb);
      this.hullPivot.add(podGroup);
    }

    // 3. Twin canted V-tail vertical stabilizers with beveled airfoils
    const finShape = new THREE.Shape();
    finShape.moveTo(0, 0);
    finShape.lineTo(-1.8, 0);
    finShape.lineTo(-2.5, 2.05);
    finShape.lineTo(-1.3, 2.15);
    finShape.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.05,
      bevelSegments: 2
    });
    finGeo.rotateY(Math.PI / 2);

    for (const side of [-1, 1]) {
      const vFin = new THREE.Mesh(finGeo, accentMat);
      vFin.position.set(side * 1.15, 3.25, -2.15);
      vFin.rotation.z = -side * 0.28;
      vFin.castShadow = true;
      this.hullPivot.add(vFin);
    }

    // 4. Articulated dual-strut hydraulic landing gear
    const strutCoords = [
      [-1.85, 2.45],
      [1.85, 2.45],
      [-2.1, -2.55],
      [2.1, -2.55]
    ];
    for (const [lx, lz] of strutCoords) {
      const lg = new THREE.Group();
      lg.position.set(lx, 0, lz);
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 0.95, 12),
        darkTitaniumMat
      );
      upper.position.y = 1.15;
      const piston = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.85, 12),
        copperMat
      );
      piston.position.y = 0.55;
      const pad = new THREE.Mesh(
        new RoundedBoxGeometry(0.95, 0.18, 1.15, 3, 0.06),
        darkTitaniumMat
      );
      pad.position.y = 0.09;
      pad.castShadow = true;
      lg.add(upper, piston, pad);
      this.hullPivot.add(lg);
    }

    // 5. Recessed Panoramic Cockpit Canopy + Detailed Interior Bridge
    const canopyGroup = new THREE.Group();
    canopyGroup.position.set(0, 3.15, 2.55);

    this.cockpitGlassMat = new THREE.MeshPhysicalMaterial({
      color: '#1b2b40',
      emissive: '#050b14',
      emissiveIntensity: 0.4,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      transparent: true,
      opacity: 0.84
    });
    const canopyGlass = new THREE.Mesh(
      new THREE.SphereGeometry(1.36, 24, 18),
      this.cockpitGlassMat
    );
    canopyGlass.scale.set(1.04, 0.68, 1.48);
    canopyGroup.add(canopyGlass);

    // Metallic canopy arch frames
    const arch1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.36, 0.065, 10, 28, Math.PI),
      darkTitaniumMat
    );
    arch1.scale.set(1.06, 0.7, 1.0);
    arch1.position.z = 0.45;
    const arch2 = arch1.clone();
    arch2.position.z = -0.45;
    canopyGroup.add(arch1, arch2);

    // Pilot seat & illuminated holographic instrument screens inside cockpit
    const pilotSeat = new THREE.Mesh(
      new RoundedBoxGeometry(0.68, 0.72, 0.55, 3, 0.08),
      darkTitaniumMat
    );
    pilotSeat.position.set(0, -0.12, -0.2);
    canopyGroup.add(pilotSeat);

    this.cockpitConsoleGlow = new THREE.Group();
    const centerScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.75, 0.34),
      new THREE.MeshBasicMaterial({ color: '#ffd875', side: THREE.DoubleSide })
    );
    centerScreen.position.set(0, 0.12, 0.85);
    centerScreen.rotation.x = -0.42;

    const sideScreenL = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.28),
      new THREE.MeshBasicMaterial({ color: '#5ef2ff', side: THREE.DoubleSide })
    );
    sideScreenL.position.set(-0.55, 0.1, 0.72);
    sideScreenL.rotation.set(-0.35, 0.45, 0);

    const sideScreenR = sideScreenL.clone();
    sideScreenR.position.x = 0.55;
    sideScreenR.rotation.y = -0.45;

    this.cockpitConsoleGlow.add(centerScreen, sideScreenL, sideScreenR);
    this.cockpitConsoleGlow.visible = false;
    canopyGroup.add(this.cockpitConsoleGlow);

    this.hullPivot.add(canopyGroup);

    // Exterior recessed hull light strips (illuminate cleanly when Power restored)
    this.hullStripMat = new THREE.MeshStandardMaterial({
      color: '#253040',
      emissive: '#000000',
      emissiveIntensity: 1.6,
      roughness: 0.2
    });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new RoundedBoxGeometry(0.12, 0.16, 6.4, 2, 0.04),
        this.hullStripMat
      );
      strip.position.set(side * 2.28, 2.25, 0.15);
      this.hullPivot.add(strip);
    }
  }

  _buildRepairModules() {
    const darkFrameMat = new THREE.MeshStandardMaterial({
      color: '#2c374a',
      roughness: 0.42,
      metalness: 0.7
    });

    // 1. Power Core Bay (Starboard +X, +Z)
    this.powerBayGroup = new THREE.Group();
    this.powerBayGroup.position.set(2.12, 1.72, 2.45);
    const powerHousing = new THREE.Mesh(
      new RoundedBoxGeometry(0.72, 1.02, 1.32, 4, 0.1),
      darkFrameMat
    );
    this.powerCoreCell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.86, 18),
      new THREE.MeshStandardMaterial({
        color: '#ffd266',
        emissive: '#ff9900',
        emissiveIntensity: 2.2,
        roughness: 0.2
      })
    );
    this.powerCoreCell.rotation.x = Math.PI / 2;
    this.powerCoreCell.position.x = 0.26;

    // Containment rings around power core
    for (const cz of [-0.24, 0.24]) {
      const cRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.045, 8, 18),
        darkFrameMat
      );
      cRing.position.set(0.26, 0, cz);
      this.powerCoreCell.add(cRing);
    }

    this.powerSparkBulb = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.22, 1),
      new THREE.MeshBasicMaterial({ color: '#ff6238' })
    );
    this.powerSparkBulb.position.x = 0.4;
    this.powerBayGroup.add(powerHousing, this.powerCoreCell, this.powerSparkBulb);
    this.hullPivot.add(this.powerBayGroup);

    // 2. Dorsal Deep-Space Communications Array
    this.commsPivot = new THREE.Group();
    this.commsPivot.position.set(-0.72, 3.98, 0.55);
    const mastBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 0.26, 14),
      darkFrameMat
    );
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.82, 12),
      darkFrameMat
    );
    mast.position.y = 0.45;

    this.commsDishHead = new THREE.Group();
    this.commsDishHead.position.y = 0.92;

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
    const feedStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.68, 8),
      darkFrameMat
    );
    feedStrut.position.y = 0.34;

    this.commsTipLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshStandardMaterial({
        color: '#75f6ff',
        emissive: '#00ccff',
        emissiveIntensity: 2.4
      })
    );
    this.commsTipLight.position.y = 0.72;
    this.commsDishHead.add(dishBowl, feedStrut, this.commsTipLight);
    this.commsPivot.add(mastBase, mast, this.commsDishHead);
    this.hullPivot.add(this.commsPivot);

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
      this.commsPivot.add(sRing);
      this.signalRings.push(sRing);
    }

    // 3. Port Bio-Dome Life-Support Terrarium (-X)
    this.lifeDomeGroup = new THREE.Group();
    this.lifeDomeGroup.position.set(-2.22, 2.25, -0.45);
    this.bioDomeGlass = new THREE.Mesh(
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
    this.bioSprout = new THREE.Group();
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

    this.bioSprout.add(soilBed, stem, leafL, leafR, bud);
    this.bioSprout.rotation.z = Math.PI / 2;
    this.bioSprout.visible = false;

    this.coolantPipeMat = new THREE.MeshStandardMaterial({
      color: '#4e5b6e',
      emissive: '#000000',
      emissiveIntensity: 1.5,
      metalness: 0.55,
      roughness: 0.25
    });
    const flange = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.1, 12, 28),
      this.coolantPipeMat
    );
    flange.rotation.y = Math.PI / 2;

    this.lifeDomeGroup.add(this.bioDomeGlass, this.bioSprout, flange);
    this.hullPivot.add(this.lifeDomeGroup);

    // 4. Forward Nose Astrogation Star-Projector (+Z tip)
    this.navNoseGroup = new THREE.Group();
    this.navNoseGroup.position.set(0, 2.25, 7.25);
    const bezel = new THREE.Mesh(
      new THREE.TorusGeometry(0.44, 0.08, 10, 24),
      new THREE.MeshStandardMaterial({ color: '#e6b84c', metalness: 0.85, roughness: 0.22 })
    );
    this.navLens = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 20, 16),
      new THREE.MeshStandardMaterial({
        color: '#4c5566',
        emissive: '#141820',
        emissiveIntensity: 1.8,
        roughness: 0.15,
        metalness: 0.3
      })
    );
    this.navHoloProjector = new THREE.Group();
    this.navHoloProjector.position.z = 1.05;
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
    this.navHoloProjector.add(hRing1, hRing2, hStar);
    this.navHoloProjector.visible = false;
    this.navNoseGroup.add(bezel, this.navLens, this.navHoloProjector);
    this.hullPivot.add(this.navNoseGroup);

    // 5. Twin Aft Magnetic Plasma Thrusters (-Z stern)
    this.engineGroup = new THREE.Group();
    this.engineGroup.position.set(0, 2.22, -4.68);
    this.engineNozzles = [];
    this.enginePlumes = [];

    // Lathe bell nozzle profile
    const bellProfile = [
      new THREE.Vector2(0.42, 0),
      new THREE.Vector2(0.56, 0.45),
      new THREE.Vector2(0.76, 0.95),
      new THREE.Vector2(0.88, 1.32)
    ];
    const bellGeo = new THREE.LatheGeometry(bellProfile, 24);
    bellGeo.rotateX(-Math.PI / 2);

    for (const side of [-0.96, 0.96]) {
      const bell = new THREE.Mesh(
        bellGeo,
        new THREE.MeshStandardMaterial({
          color: '#4e5d78',
          metalness: 0.82,
          roughness: 0.25,
          side: THREE.DoubleSide
        })
      );
      bell.position.set(side, 0, 0);

      // Cooling coil ring on nozzle exterior
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.68, 0.055, 8, 22),
        new THREE.MeshStandardMaterial({ color: '#d98448', metalness: 0.8, roughness: 0.28 })
      );
      coil.position.z = -0.72;
      bell.add(coil);

      const coreGlow = new THREE.Mesh(
        new THREE.CircleGeometry(0.74, 20),
        new THREE.MeshBasicMaterial({ color: '#2b2433', side: THREE.DoubleSide })
      );
      coreGlow.position.set(side, 0, -1.24);

      // Dual-layered glowing plasma exhaust plume (bright white-cyan core + magenta sheath)
      const plumeGroup = new THREE.Group();
      plumeGroup.position.set(side, 0, -1.3);
      const outerCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.72, 3.8, 18, 1, true),
        new THREE.MeshBasicMaterial({
          color: '#ff66d4',
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      outerCone.rotation.x = -Math.PI / 2;
      outerCone.position.z = -1.9;

      const innerCone = new THREE.Mesh(
        new THREE.ConeGeometry(0.38, 2.5, 14),
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0.95,
          depthWrite: false
        })
      );
      innerCone.rotation.x = -Math.PI / 2;
      innerCone.position.z = -1.25;

      plumeGroup.add(outerCone, innerCone);
      plumeGroup.visible = false;

      this.engineGroup.add(bell, coreGlow, plumeGroup);
      this.engineNozzles.push({ bell, coreGlow });
      this.enginePlumes.push(plumeGroup);
    }
    this.hullPivot.add(this.engineGroup);

    // Repair Target Holographic Floor Pads
    for (const target of Object.values(REPAIR_TARGETS)) {
      const padGroup = new THREE.Group();
      const baseRing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.56, 0.65, 0.1, 20),
        darkFrameMat
      );
      const glowDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(0.42, 0.42, 0.13, 20),
        new THREE.MeshStandardMaterial({
          color: '#ff9d3b',
          emissive: '#ff6a00',
          emissiveIntensity: 1.8,
          roughness: 0.25
        })
      );
      padGroup.add(baseRing, glowDisc);
      const gy = getTerrainHeight(target.position.x, target.position.z, false);
      padGroup.position.set(target.position.x, gy - this.baseGroundY + 0.06, target.position.z);
      this.group.add(padGroup);
      this.repairMarkers.set(target.id, { group: padGroup, glowDisc });
    }
  }

  _buildPreflightAndRamp() {
    for (const chk of PREFLIGHT_CHECKS) {
      const cy = getTerrainHeight(chk.position.x, chk.position.z, false);
      const pGroup = new THREE.Group();
      pGroup.position.set(chk.position.x, cy - this.baseGroundY, chk.position.z);

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.22, 0.72, 10),
        new THREE.MeshStandardMaterial({ color: '#394659', metalness: 0.6, roughness: 0.4 })
      );
      stem.position.y = 0.36;

      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.26, 0),
        new THREE.MeshStandardMaterial({
          color: '#ffd257',
          emissive: '#ff9900',
          emissiveIntensity: 1.8
        })
      );
      beacon.position.y = 0.92;
      pGroup.add(stem, beacon);
      pGroup.visible = false;
      this.group.add(pGroup);
      this.preflightMeshes.set(chk.id, { group: pGroup, beacon });
    }

    // Illuminated Boarding Ramp with side guide rails
    this.boardingRamp = new THREE.Group();
    const deck = new THREE.Mesh(
      new RoundedBoxGeometry(1.36, 0.14, 2.9, 3, 0.04),
      new THREE.MeshStandardMaterial({
        color: '#4b5c73',
        metalness: 0.65,
        roughness: 0.35
      })
    );
    const railMat = new THREE.MeshStandardMaterial({
      color: '#6cf7ff',
      emissive: '#00b7ff',
      emissiveIntensity: 1.9
    });
    for (const rx of [-0.62, 0.62]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 2.85), railMat);
      rail.position.set(rx, 0.11, 0);
      this.boardingRamp.add(rail);
    }
    this.boardingRamp.add(deck);
    this.boardingRamp.position.set(2.92, 0.68, 1.5);
    this.boardingRamp.rotation.z = -0.38;
    this.boardingRamp.visible = false;
    this.hullPivot.add(this.boardingRamp);
  }

  _buildHomeworldScene() {
    this.homeworldGroup = new THREE.Group();
    this.homeworldGroup.name = 'homeworld-ending';
    this.homeworldGroup.position.set(0, 420, 0);
    this.homeworldGroup.visible = false;
    this.scene.add(this.homeworldGroup);

    // Rolling emerald meadow with outer hill rim
    const meadow = new THREE.Mesh(
      new THREE.CylinderGeometry(52, 54, 2.0, 48),
      new THREE.MeshStandardMaterial({ color: '#47c472', roughness: 0.86, metalness: 0.02 })
    );
    meadow.position.y = -1.0;
    meadow.receiveShadow = true;
    this.homeworldGroup.add(meadow);

    // Decorative landing pad with concentric beacon ring
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(6.0, 6.4, 0.2, 36),
      new THREE.MeshStandardMaterial({ color: '#e3ecf5', roughness: 0.42, metalness: 0.35 })
    );
    pad.position.y = 0.09;
    pad.receiveShadow = true;
    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(4.7, 5.05, 36),
      new THREE.MeshBasicMaterial({ color: '#52ffb8', side: THREE.DoubleSide })
    );
    padRing.rotation.x = -Math.PI / 2;
    padRing.position.y = 0.21;
    this.homeworldGroup.add(pad, padRing);

    // Cozy Architectural Habitat Cottage with warm glowing windows & roof ring
    const cottageGroup = new THREE.Group();
    cottageGroup.position.set(-9.8, 0, -7.2);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(3.5, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.54),
      new THREE.MeshStandardMaterial({ color: '#fff9ee', roughness: 0.45 })
    );
    dome.castShadow = true;
    const roofTrim = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.14, 10, 28),
      new THREE.MeshStandardMaterial({ color: '#ff9b42', roughness: 0.35 })
    );
    roofTrim.rotation.x = Math.PI / 2;
    roofTrim.position.y = 2.55;
    const doorGlow = new THREE.Mesh(
      new RoundedBoxGeometry(1.35, 1.95, 0.4, 4, 0.15),
      new THREE.MeshStandardMaterial({
        color: '#ffe078',
        emissive: '#ffaa22',
        emissiveIntensity: 1.6
      })
    );
    doorGlow.position.set(2.3, 0.95, 2.1);
    doorGlow.rotation.y = 0.72;
    cottageGroup.add(dome, roofTrim, doorGlow);
    this.homeworldGroup.add(cottageGroup);

    // Sparkling crystal pond with stone bank
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 32),
      new THREE.MeshPhysicalMaterial({
        color: '#4ad4ff',
        roughness: 0.06,
        metalness: 0.15,
        clearcoat: 1.0
      })
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(10.8, 0.06, -5.2);
    this.homeworldGroup.add(pond);

    // Multi-layered stylized canopy trees & meadow blossoms
    const treePositions = [
      [-14.5, -1.5], [-12.2, 6.2], [-5.2, -13.5],
      [6.2, -13.2], [14.5, -0.8], [12.5, 7.2], [-15.5, -10.2]
    ];
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7d5036', roughness: 0.85 });
    const crownMat1 = new THREE.MeshStandardMaterial({ color: '#2eb865', roughness: 0.72 });
    const crownMat2 = new THREE.MeshStandardMaterial({ color: '#5ce085', roughness: 0.68 });

    for (const [tx, tz] of treePositions) {
      const tg = new THREE.Group();
      tg.position.set(tx, 0, tz);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.9, 10), trunkMat);
      trunk.position.y = 0.95;
      trunk.castShadow = true;

      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.45, 1), crownMat1);
      c1.position.y = 2.35;
      c1.castShadow = true;
      const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 1), crownMat2);
      c2.position.set(0.35, 3.25, 0.2);
      c2.castShadow = true;
      tg.add(trunk, c1, c2);
      this.homeworldGroup.add(tg);
    }

    // Expressive Companion Bots with happy glowing LED visors, ears & antennas!
    const happyVisor = createVisorCanvas();
    happyVisor.drawMood('celebrate', false);

    this.companionBots = [];
    for (const [bx, bz, col] of [
      [-4.8, 5.2, '#4ad8ff'],
      [4.9, 5.0, '#ff8ec0']
    ]) {
      const bg = new THREE.Group();
      bg.position.set(bx, 0, bz);
      bg.lookAt(0, 0, 2.2);

      const shellMat = new THREE.MeshPhysicalMaterial({
        color: '#f8fafd',
        roughness: 0.22,
        clearcoat: 0.9
      });
      const trimMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.32 });

      const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 20, 16), shellMat);
      body.position.y = 0.65;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.07, 10, 22), trimMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.88;
      const head = new THREE.Mesh(
        new RoundedBoxGeometry(0.76, 0.62, 0.68, 5, 0.22),
        shellMat
      );
      head.position.y = 1.28;
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.54, 0.28),
        new THREE.MeshBasicMaterial({ map: happyVisor.texture })
      );
      face.position.set(0, 1.28, 0.35);
      const ant = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 10, 8),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.8 })
      );
      ant.position.set(0, 1.72, 0);

      bg.add(body, band, head, face, ant);
      this.homeworldGroup.add(bg);
      this.companionBots.push(bg);
    }
  }

  setThrusterPlumes(active, scale = 1.0) {
    for (const p of this.enginePlumes) {
      p.visible = active;
      p.scale.set(1, 1, scale);
    }
  }

  update(dt, elapsed, inCutscene = false) {
    const r = this.state.repairs;

    const targetRoll = r.repair_propulsion ? 0 : -0.085;
    const targetPitch = r.repair_propulsion ? 0 : 0.035;
    this.hullPivot.rotation.z += (targetRoll - this.hullPivot.rotation.z) * Math.min(1, dt * 4);
    this.hullPivot.rotation.x += (targetPitch - this.hullPivot.rotation.x) * Math.min(1, dt * 4);

    // Only re-apply ship system material colors when repair bitmask actually changes!
    const repairKey = `${r.repair_power ? 1 : 0}${r.repair_comms ? 1 : 0}${r.repair_lifesupport ? 1 : 0}${r.repair_nav ? 1 : 0}${r.repair_propulsion ? 1 : 0}`;
    if (this._lastRepairKey !== repairKey) {
      this._lastRepairKey = repairKey;

      this.powerCoreCell.visible = r.repair_power;
      this.powerSparkBulb.visible = !r.repair_power;
      this.cockpitConsoleGlow.visible = r.repair_power;
      this.cockpitGlassMat.color.set(r.repair_power ? '#ffd982' : '#1b2b40');
      this.cockpitGlassMat.emissive.set(r.repair_power ? '#b87414' : '#050b14');
      this.hullStripMat.color.set(r.repair_power ? '#70f6ff' : '#253040');
      this.hullStripMat.emissive.set(r.repair_power ? '#00b7ff' : '#000000');

      this.bioSprout.visible = r.repair_lifesupport;
      this.bioDomeGlass.material.color.set(r.repair_lifesupport ? '#78ffe4' : '#7a5c43');
      this.bioDomeGlass.material.emissive.set(r.repair_lifesupport ? '#0c6b58' : '#171008');
      this.coolantPipeMat.color.set(r.repair_lifesupport ? '#5af7ff' : '#4e5b6e');
      this.coolantPipeMat.emissive.set(r.repair_lifesupport ? '#00a8cc' : '#000000');

      this.navHoloProjector.visible = r.repair_nav;
      this.navLens.material.color.set(r.repair_nav ? '#ffe478' : '#4c5566');
      this.navLens.material.emissive.set(r.repair_nav ? '#cc9200' : '#141820');

      for (const nz of this.engineNozzles) {
        nz.bell.visible = r.repair_propulsion;
        nz.coreGlow.material.color.set(r.repair_propulsion ? '#ff75d8' : '#2b2433');
      }
    }

    if (!r.repair_power) {
      this.powerSparkBulb.scale.setScalar(0.72 + Math.sin(elapsed * 18) * 0.32);
      this.powerSparkBulb.rotation.y = elapsed * 6;
    }

    // 2. Communications Visuals
    if (r.repair_comms) {
      this.commsDishHead.rotation.x = -0.5;
      this.commsDishHead.rotation.y = elapsed * 1.1;
      this.commsTipLight.visible = true;
      this.signalRings.forEach((ring, idx) => {
        ring.visible = true;
        const phase = (elapsed * 0.75 + idx * 0.33) % 1;
        ring.position.y = 1.15 + phase * 2.6;
        ring.scale.setScalar(0.5 + phase * 2.1);
        ring.material.opacity = (1 - phase) * 0.65;
      });
    } else {
      this.commsDishHead.rotation.x = 1.18;
      this.commsTipLight.visible = false;
      this.signalRings.forEach((ring) => {
        ring.visible = false;
      });
    }

    if (r.repair_nav) {
      this.navHoloProjector.rotation.z = elapsed * 1.3;
      this.navHoloProjector.rotation.y = Math.sin(elapsed * 0.9) * 0.35;
    }

    if (!inCutscene) {
      this.setThrusterPlumes(false);
    }

    // Update repair ground markers (dirty-checked!)
    for (const [rId, mObj] of this.repairMarkers.entries()) {
      const target = REPAIR_TARGETS[rId];
      const repaired = Boolean(r[rId]);
      const activeForLevel = target.level <= this.state.currentLevel;
      mObj.group.visible = activeForLevel && !inCutscene;
      const stateTag = repaired
        ? 2
        : this.state.getItemCount(target.requiredItem) > 0
          ? 1
          : 0;
      if (mObj._stateTag !== stateTag) {
        mObj._stateTag = stateTag;
        if (stateTag === 2) {
          mObj.glowDisc.material.color.set('#52ffb8');
          mObj.glowDisc.material.emissive.set('#0ca860');
        } else if (stateTag === 1) {
          mObj.glowDisc.material.color.set('#66f7ff');
          mObj.glowDisc.material.emissive.set('#00b7ff');
        } else {
          mObj.glowDisc.material.color.set('#ff9d3b');
          mObj.glowDisc.material.emissive.set('#e65c00');
        }
      }
    }

    // Update Pre-Flight Checkpoints & Boarding Ramp
    const showPreflight = r.repair_propulsion && !inCutscene;
    for (const [chkId, pObj] of this.preflightMeshes.entries()) {
      pObj.group.visible = showPreflight;
      if (showPreflight) {
        pObj.beacon.rotation.y = elapsed * 2.2;
      }
      const done = Boolean(this.state.preflightDone[chkId]);
      if (pObj._lastDone !== done) {
        pObj._lastDone = done;
        pObj.beacon.material.color.set(done ? '#52ffb8' : '#ffd257');
        pObj.beacon.material.emissive.set(done ? '#0da862' : '#cc7a00');
      }
    }
    this.boardingRamp.visible =
      this.state.canLaunchSpacecraft() || inCutscene === 'launch';

    if (this.homeworldGroup.visible) {
      this.companionBots.forEach((bot, i) => {
        bot.position.y = Math.abs(Math.sin(elapsed * 7 + i * 1.4)) * 0.28;
      });
    }
  }

  applyCutsceneFrame(t, elapsed, robot) {
    if (t < 0.22) {
      const p = t / 0.22;
      this.homeworldGroup.visible = false;
      if (this.environments) this.scene.environment = this.environments.desert;
      if (this.skyDome) this.skyDome.setMode('desert', 0);
      this.scene.fog.color.set('#e5b487');
      this.scene.fog.density = 0.0068;

      this.group.position.set(0, this.baseGroundY + Math.sin(elapsed * 45) * 0.03 * p, 0);
      robot.group.visible = p < 0.65;
      robot.group.position.set(lerp(3.2, 0.8, p), this.baseGroundY + lerp(0.1, 1.8, p), 1.6);
      this.setThrusterPlumes(true, 0.4 + p * 1.1);

      return {
        position: this._cutCamPos.set(11.5, 5.5, 11.5),
        lookAt: this._cutCamLook.set(0, 2.5, 0)
      };
    }

    if (t < 0.58) {
      const p = (t - 0.22) / 0.36;
      this.homeworldGroup.visible = false;
      robot.group.visible = false;

      if (this.skyDome) this.skyDome.setMode('desert', clamp(p * 1.35, 0, 1));
      this.scene.fog.color
        .copy(this._skyDesertCol)
        .lerp(this._skySpaceCol, clamp(p * 1.35, 0, 1));
      this.scene.fog.density = lerp(0.0068, 0.0008, p);

      const climbY = this.baseGroundY + Math.pow(p, 2.1) * 95;
      this.group.position.set(0, climbY, p * 18);
      this.hullPivot.rotation.x = -0.28 * Math.sin(p * Math.PI);
      this.setThrusterPlumes(true, 1.45 + Math.sin(elapsed * 30) * 0.25);

      return {
        position: this._cutCamPos.set(13 - p * 4, climbY + 4.5, p * 18 - 14),
        lookAt: this._cutCamLook.set(0, climbY + 2.2, p * 18 + 2)
      };
    }

    const p = (t - 0.58) / 0.42;
    this.homeworldGroup.visible = true;
    if (this.environments) this.scene.environment = this.environments.homeworld;
    if (this.skyDome) {
      this.skyDome.group.position.y = 420;
      this.skyDome.setMode('homeworld', 0);
    }
    this.scene.fog.color.set('#bceeff');
    this.scene.fog.density = 0.0028;

    const homeY = 420;
    const landFactor = 1 - Math.pow(1 - clamp(p * 1.45, 0, 1), 2.5);
    const shipY = lerp(homeY + 18, homeY + 0.16, landFactor);
    this.group.position.set(0, shipY, -1.5);
    this.hullPivot.rotation.set(0, 0, 0);
    this.setThrusterPlumes(p < 0.62, Math.max(0.1, 1 - p * 1.5));

    if (p >= 0.65) {
      robot.group.visible = true;
      robot.group.position.set(0, homeY + Math.abs(Math.sin(elapsed * 9)) * 0.32, 4.4);
      robot.group.rotation.y = 0;
      robot.triggerAction('celebrate', 0.5);
    } else {
      robot.group.visible = false;
    }

    return {
      position: this._cutCamPos.set(Math.sin(p * 0.8) * 9.5, homeY + 5.2, 13.5),
      lookAt: this._cutCamLook.set(0, homeY + 1.8, 1.5)
    };
  }

  /**
   * 3-Act Intro Cutscene (~11.0s):
   * - Act 1 (0.00 -> 0.30): Starweaver atmospheric descent & sandy basin crash-landing
   * - Act 2 (0.30 -> 0.66): Milo lying in sand -> chest core & OLED eyes reboot -> hops up!
   * - Act 3 (0.66 -> 1.00): Panoramic sweep of intact Solar Furnace & Fabricator -> seamless blend into follow camera!
   */
  applyIntroCutsceneFrame(t, elapsed, robot, finalFollowPose) {
    this.homeworldGroup.visible = false;
    if (this.environments) this.scene.environment = this.environments.desert;
    if (this.skyDome) {
      this.skyDome.group.position.y = 0;
      this.skyDome.setMode('desert', 0);
    }
    this.scene.fog.color.set('#edc095');
    this.scene.fog.density = 0.0034;

    // Ensure Milo sits at hub spawn
    const rx = 4.8;
    const rz = 5.8;
    const ry = getTerrainHeight(rx, rz, false);
    robot.position.set(rx, ry, rz);

    if (t < 0.3) {
      // Act 1: Starweaver streaks down from upper sky & skids to rest at (0, baseGroundY, 0)
      const p = clamp(t / 0.25, 0, 1);
      const easeOut = 1 - Math.pow(1 - p, 2.6);
      const shipY = lerp(this.baseGroundY + 30, this.baseGroundY, easeOut);
      const shipZ = lerp(-34, 0, easeOut);
      this.group.position.set(0, shipY, shipZ);
      this.hullPivot.rotation.x = lerp(0.32, 0.035, easeOut);
      this.hullPivot.rotation.z = lerp(0.14, -0.085, easeOut);

      // Sputtering emergency retro-plume before touchdown
      this.setThrusterPlumes(p < 0.94, 0.65 + Math.sin(elapsed * 50) * 0.35);

      // Keep Milo tucked inside ship until touchdown, then lying powered-down beside hull
      robot.group.visible = p >= 0.88;
      robot.yaw = Math.PI * 0.85;
      robot.setIntroSleepPose(1.0, 'sleep');

      // Subtle impact camera shake right around touchdown (t = 0.24..0.30)
      const shakeAmt = t > 0.23 ? Math.exp(-(t - 0.23) * 38) * 0.42 : 0;
      const sx = Math.sin(elapsed * 65) * shakeAmt;
      const sy = Math.cos(elapsed * 58) * shakeAmt;

      return {
        position: this._cutCamPos.set(
          16.5 + sx,
          this.baseGroundY + lerp(11.5, 5.8, easeOut) + sy,
          15.5
        ),
        lookAt: this._cutCamLook.set(0, shipY + 2.1, shipZ + 1.2)
      };
    }

    // Ship is now resting in crash crater
    this.group.position.set(0, this.baseGroundY, 0);
    this.setThrusterPlumes(false);
    robot.group.visible = true;

    if (t < 0.66) {
      // Act 2: Close-up on Milo rebooting in the sand!
      const p = (t - 0.3) / 0.36;
      if (p < 0.32) {
        // Powered down in sand
        robot.yaw = Math.PI * 0.12;
        robot.setIntroSleepPose(1.0, 'sleep');
      } else if (p < 0.72) {
        // Rebooting: eyes blink open, body rights itself smoothly
        const wakeP = smoothstep(0.32, 0.72, p);
        const blinkMoment = p > 0.42 && p < 0.48;
        robot.yaw = lerp(Math.PI * 0.12, Math.PI * 0.35, wakeP);
        robot.setIntroSleepPose(1.0 - wakeP, blinkMoment ? 'normal' : 'happy');
      } else {
        // Cheerful little wake-up hop & curious look toward the Starweaver!
        const hopP = (p - 0.72) / 0.28;
        robot.yaw = lerp(Math.PI * 0.35, Math.PI * 0.85, smoothstep(0, 1, hopP));
        robot.setIntroSleepPose(0, 'celebrate');
        robot.bodyPivot.position.y = Math.abs(Math.sin(hopP * Math.PI * 2)) * 0.26;
      }

      return {
        position: this._cutCamPos.set(
          rx + lerp(2.3, 3.1, p),
          ry + lerp(1.25, 1.85, p),
          rz + lerp(2.8, 3.6, p)
        ),
        lookAt: this._cutCamLook.set(rx - 0.35, ry + 1.08, rz - 0.35)
      };
    }

    // Act 3: Survey the intact Solar Furnace & Fabricator, then blend seamlessly to player follow cam!
    const p = (t - 0.66) / 0.34;
    robot.yaw = Math.PI * 0.85;
    robot.clearIntroSleepPose();

    const blend = smoothstep(0.22, 1.0, p);
    this._cutCamPos.set(11.5, this.baseGroundY + 6.8, 16.5).lerp(finalFollowPose.position, blend);
    this._cutCamLook.set(1.2, this.baseGroundY + 2.0, 2.0).lerp(finalFollowPose.lookAt, blend);

    return {
      position: this._cutCamPos,
      lookAt: this._cutCamLook
    };
  }

  restoreDesertPlacement(robot) {
    this.homeworldGroup.visible = false;
    if (this.environments) this.scene.environment = this.environments.desert;
    if (this.skyDome) {
      this.skyDome.group.position.y = 0;
      this.skyDome.setMode('desert', 0);
    }
    this.scene.fog.color.set('#edc095');
    this.scene.fog.density = 0.0034;
    this.group.position.set(0, this.baseGroundY, 0);
    this.setThrusterPlumes(false);
    robot.group.visible = true;
    robot.teleportToHubSafe();
  }
}
