import * as THREE from 'three';
import { buildSpacecraftRepairModules } from './spacecraftRepairModules.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { PREFLIGHT_CHECKS, REPAIR_TARGETS } from '../data/gameData.js';
import {
  createHullRegistryDecalTexture,
  createIndustrialSpecPlateTexture,
  createMetalHullPBR,
  createScorchDecalTexture
} from '../graphics/textures.js';
import { applyWorldWeathering } from '../graphics/gpuMaterialBaker.js';
import { getTerrainHeight, lerp, clamp, smoothstep } from '../utils/math.js';
import { buildHomeworldEnhancements, updateHomeworldEnhancements } from './homeworldBuilder.js';
import {
  buildHomeworldCharacters, updateHomeworldCharacters,
  resetHomeworldCeremony as resetColonyCeremony,
  startHomeworldCeremony as startColonyCeremony,
  notifyHomeworldPlayerArrived as notifyColonyPlayerArrived
} from './homeworldCharacters.js';
import { buildHomeworldLandscape } from './homeworldLandscape.js';
import { disposeObjectSubtree, isHomeworldContext } from './worldLifecycle.js';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../data/homeworldData.js';
import { createThrusterPlume, updateThrusterPlume, createAscentShield, createLaunchGroundWash } from '../graphics/launchEffects.js';

export class SpacecraftBuilder {
  constructor(scene, state, environments = null, skyDome = null, pbrLibrary = null, opts = {}) {
    this.scene = scene;
    this.state = state;
    this.environments = environments;
    this.skyDome = skyDome;
    this.pbrLibrary = pbrLibrary;
    this.homeworldGroup = null;

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

    this.hullPBR = this.pbrLibrary ? this.pbrLibrary.hull_white : createMetalHullPBR(256);
    this.repairMarkers = new Map();
    this.preflightMeshes = new Map();
    this.signalRings = [];
    this.homeworldColliders = [];
    this.homeworldCameraOccluders = [];
    this.homeworldActivityVisuals = null;
    this.homeworldEnhancements = null;
    this.crewFigures = [];
    this.warpTunnelLines = null;
    this._repairIds = Object.keys(REPAIR_TARGETS);
    this._lastRepairKey = -1;
    this._boardingStart = new THREE.Vector3(4.45, this.baseGroundY, 1.5);
    this._boardingBackExtent = 0.95;
    this._boardingInsideX = 0.95;
    this._boardingBounds = new THREE.Box3();
    this._boardingPartBounds = new THREE.Box3();
    this._boardingInverse = new THREE.Matrix4();
    this._boardingPartMatrix = new THREE.Matrix4();
    this._exitPoint = new THREE.Vector3();
    this._exitTangent = new THREE.Vector3();
    this._exitBefore = new THREE.Vector3();
    this._exitAfter = new THREE.Vector3();
    this._exitWalk = new THREE.CatmullRomCurve3([
      new THREE.Vector3(4.45, 0, -0.7), new THREE.Vector3(4.3, 0, 2.8),
      new THREE.Vector3(2.5, 0, 6.1), new THREE.Vector3(HOMEWORLD_CONFIG.spawnX, 0, HOMEWORLD_CONFIG.spawnZ)
    ], false, 'centripetal');

    // Pre-allocated scratch vectors/colors for zero-GC cutscene playback
    this._cutCamPos = new THREE.Vector3();
    this._cutCamLook = new THREE.Vector3();
    this._homeworldCameraPose = { position: this._cutCamPos, lookAt: this._cutCamLook };
    this._skyDesertCol = new THREE.Color('#e5b487');
    this._skySpaceCol = new THREE.Color('#091126');

    this._buildCrashSkidAndBerms();
    this._buildShipHull();
    this._buildRepairModules();
    this._buildPreflightAndRamp();
    if (!opts.deferHomeworld) {
      this._buildHomeworldScene();
    }
    this.launchGroundWash = createLaunchGroundWash();
    this.crashSiteDecals.add(this.launchGroundWash);
  }

  getColliders() {
    const desertShipVis = () => this.group.visible && this.group.position.y < 100;
    const rampVis = () =>
      desertShipVis() && this.boardingRamp && this.boardingRamp.visible;
    const homeVis = () => Boolean(this.homeworldGroup && this.homeworldGroup.visible);
    return [
      // Main fuselage spine + aft twin thruster bells + tapered nose cone (occludes camera too)
      { id: 'ship_thrusters', x: 0, z: -5.05, radius: 1.92, maxY: 4.4, occluder: true, activeFn: desertShipVis },
      { id: 'ship_aft', x: 0, z: -3.35, radius: 2.52, maxY: 4.6, occluder: true, activeFn: desertShipVis },
      { id: 'ship_mid', x: 0, z: 0.0, radius: 2.68, maxY: 4.8, occluder: true, activeFn: desertShipVis },
      { id: 'ship_fwd', x: 0, z: 3.35, radius: 2.32, maxY: 4.4, occluder: true, activeFn: desertShipVis },
      { id: 'ship_nose', x: 0, z: 5.75, radius: 1.42, maxY: 3.6, occluder: true, activeFn: desertShipVis },
      { id: 'ship_nav_lens', x: 0, z: 7.25, radius: 0.56, minY: this.baseGroundY - 0.1, maxY: 2.85, occluder: true, occluderMinY: 1.7, activeFn: desertShipVis },
      { id: 'ship_comms', x: -0.62, z: 0.55, radius: 1.2,
        minY: this.baseGroundY + this.commsPivot.position.y - 2.25,
        maxY: this.baseGroundY + this.commsPivot.position.y + 2.2,
        occluder: true, occluderMinY: this.baseGroundY + this.commsPivot.position.y, activeFn: desertShipVis },

      // Swept delta wings (port & starboard) + wingtip RCS pods — height-capped at y=2.38 so jetpack can fly over,
      // and marked as thickness-aware camera occluders (occluderMinY..maxY) so camera never clips through wings!
      { id: 'ship_wing_l_in', x: -2.45, z: -1.15, radius: 1.48, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },
      { id: 'ship_wing_l_out', x: -3.65, z: -1.82, radius: 1.05, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },
      { id: 'ship_pod_l_fwd', x: -4.48, z: -0.92, radius: 0.52, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },
      { id: 'ship_pod_l_aft', x: -4.48, z: -2.18, radius: 0.52, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },

      { id: 'ship_wing_r_in', x: 2.45, z: -1.15, radius: 1.48, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },
      { id: 'ship_wing_r_out', x: 3.65, z: -1.82, radius: 1.05, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },
      { id: 'ship_pod_r_fwd', x: 4.48, z: -0.92, radius: 0.52, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },
      { id: 'ship_pod_r_aft', x: 4.48, z: -2.18, radius: 0.52, maxY: 2.38, occluder: true, occluderMinY: 0.95, activeFn: desertShipVis },

      // Extended boarding ramp side guard + outer sand berm colliders (desert plane only)
      { id: 'ship_berm_l', x: -4.9, z: -4.6, radius: 1.05, maxY: 1.2, activeFn: desertShipVis },
      { id: 'ship_berm_r', x: 4.9, z: -4.6, radius: 1.05, maxY: 1.2, activeFn: desertShipVis },
      { id: 'ship_berm_fwd', x: 0.0, z: 8.35, radius: 1.15, maxY: 1.2, activeFn: desertShipVis },
      { id: 'ship_ramp_mid', x: 2.85, z: 1.5, radius: 0.85, maxY: 1.8, activeFn: rampVis },

      // Homeworld Meadow Colliders (active when strolling Homeworld at Y = 420, ship parked at z = -2.2!)
      { id: 'hw_ship_thrusters', x: 0, z: -7.25, radius: 1.92, minY: 419, maxY: 424.4, occluder: true, activeFn: homeVis },
      { id: 'hw_ship_aft', x: 0, z: -5.8, radius: 2.6, minY: 419, maxY: 425.2, occluder: true, activeFn: homeVis },
      { id: 'hw_ship_mid', x: 0, z: -2.2, radius: 2.75, minY: 419, maxY: 425.4, occluder: true, activeFn: homeVis },
      { id: 'hw_ship_fwd', x: 0, z: 1.4, radius: 2.25, minY: 419, maxY: 424.6, occluder: true, activeFn: homeVis },
      { id: 'hw_ship_nose', x: 0, z: 3.55, radius: 1.42, minY: 419, maxY: 423.62, occluder: true, activeFn: homeVis },
      { id: 'hw_ship_nav_lens', x: 0, z: 5.05, radius: 0.56, minY: HOMEWORLD_CONFIG.baseY - 0.1, maxY: 422.87, occluder: true, occluderMinY: 421.72, activeFn: homeVis },
      { id: 'hw_ship_comms', x: -0.62, z: -1.65, radius: 1.2,
        minY: HOMEWORLD_CONFIG.padY + this.commsPivot.position.y - 2.25,
        maxY: HOMEWORLD_CONFIG.padY + this.commsPivot.position.y + 2.2,
        occluder: true, occluderMinY: HOMEWORLD_CONFIG.padY + this.commsPivot.position.y, activeFn: homeVis },
      // Homeworld Starweaver swept delta wings + wingtip RCS pods (matching desert wing colliders shifted to z = -2.2)
      { id: 'hw_ship_wing_l_in', x: -2.45, z: -3.35, radius: 1.48, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_wing_l_out', x: -3.65, z: -4.02, radius: 1.05, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_pod_l_fwd', x: -4.48, z: -3.12, radius: 0.52, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_pod_l_aft', x: -4.48, z: -4.38, radius: 0.52, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_wing_r_in', x: 2.45, z: -3.35, radius: 1.48, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_wing_r_out', x: 3.65, z: -4.02, radius: 1.05, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_pod_r_fwd', x: 4.48, z: -3.12, radius: 0.52, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_ship_pod_r_aft', x: 4.48, z: -4.38, radius: 0.52, minY: 419, maxY: 422.4, occluder: true, occluderMinY: 420.95, activeFn: homeVis },
      { id: 'hw_cottage_main', x: -10.5, z: -7.8, radius: 3.75, minY: 419, maxY: 424.8, occluder: true, activeFn: homeVis },
      { id: 'hw_cottage_annex', x: -13.6, z: -5.2, radius: 2.25, minY: 419, maxY: 423.8, occluder: true, activeFn: homeVis },
      ...this.homeworldColliders.map((c) => {
        c.activeFn = homeVis;
        return c;
      })
    ];
  }

  getHomeworldDynamicColliders() {
    const homeVis = () => Boolean(this.homeworldGroup && this.homeworldGroup.visible);
    return this.homeworldColliders.map((c) => {
      c.activeFn = homeVis;
      return c;
    });
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

    // Plowed sand berms pushed out beyond the tail skid trail (flush low profile + collider-safe placement)
    const bermMat = new THREE.MeshStandardMaterial({
      map: this.pbrLibrary ? this.pbrLibrary.sand.map : null,
      normalMap: this.pbrLibrary ? this.pbrLibrary.sand.normalMap : null,
      color: '#cf9363',
      roughness: 0.94,
      metalness: 0.02
    });
    for (const [bx, bz, sx, sz, rotY] of [
      [-4.9, -4.6, 1.15, 2.6, 0.22],
      [4.9, -4.6, 1.15, 2.6, -0.22],
      [0.0, 8.35, 2.2, 0.95, 0.04]
    ]) {
      const berm = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), bermMat);
      berm.scale.set(sx, 0.22, sz);
      const by = getTerrainHeight(bx, bz, false) - this.baseGroundY;
      berm.position.set(bx, by - 0.03, bz);
      berm.rotation.y = rotY;
      berm.receiveShadow = true;
      this.crashSiteDecals.add(berm);
    }
  }

  _buildShipHull() {
    const lib = this.pbrLibrary;
    const hullMat = applyWorldWeathering(
      new THREE.MeshStandardMaterial({
        map: this.hullPBR.map,
        aoMap: this.hullPBR.ormMap || null,
        aoMapIntensity: 0.95,
        roughnessMap: this.hullPBR.ormMap || null,
        metalnessMap: this.hullPBR.ormMap || null,
        normalMap: this.hullPBR.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        color: '#f4f8fd',
        roughness: this.hullPBR.ormMap ? 1.0 : 0.3,
        metalness: this.hullPBR.ormMap ? 1.0 : 0.62
      }),
      { dustAmount: 0.14, macroContrast: 0.09, groundSkirt: 0.28, keyTag: 'ship_hull_v2' }
    );
    const darkTitaniumMat = applyWorldWeathering(
      new THREE.MeshStandardMaterial({
        map: lib ? lib.titanium_dark.map : null,
        aoMap: lib ? lib.titanium_dark.ormMap : null,
        roughnessMap: lib ? lib.titanium_dark.ormMap : null,
        metalnessMap: lib ? lib.titanium_dark.ormMap : null,
        normalMap: lib ? lib.titanium_dark.normalMap : null,
        normalScale: new THREE.Vector2(0.75, 0.75),
        color: lib ? '#ffffff' : '#2b3648',
        roughness: lib ? 1.0 : 0.42,
        metalness: lib ? 1.0 : 0.72
      }),
      { dustAmount: 0.16, macroContrast: 0.08, groundSkirt: 0.32, keyTag: 'ship_tit_v2' }
    );
    const accentMat = applyWorldWeathering(
      new THREE.MeshStandardMaterial({
        map: lib ? lib.painted_orange.map : null,
        aoMap: lib ? lib.painted_orange.ormMap : null,
        roughnessMap: lib ? lib.painted_orange.ormMap : null,
        metalnessMap: lib ? lib.painted_orange.ormMap : null,
        normalMap: lib ? lib.painted_orange.normalMap : null,
        normalScale: new THREE.Vector2(0.7, 0.7),
        color: lib ? '#ffffff' : '#eb7d3c',
        roughness: lib ? 1.0 : 0.34,
        metalness: lib ? 1.0 : 0.38
      }),
      { dustAmount: 0.12, macroContrast: 0.08, groundSkirt: 0.2, keyTag: 'ship_orange_v2' }
    );
    const copperMat = new THREE.MeshStandardMaterial({
      map: lib ? lib.brushed_copper.map : null,
      aoMap: lib ? lib.brushed_copper.ormMap : null,
      roughnessMap: lib ? lib.brushed_copper.ormMap : null,
      metalnessMap: lib ? lib.brushed_copper.ormMap : null,
      normalMap: lib ? lib.brushed_copper.normalMap : null,
      color: lib ? '#ffffff' : '#d98448',
      roughness: lib ? 1.0 : 0.28,
      metalness: lib ? 1.0 : 0.82
    });
    this._sharedDarkTitaniumMat = darkTitaniumMat;

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
    this.fuselage = fuselage;
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

    // 4. Articulated dual-strut hydraulic landing gear (telescopic pistons keep all 4 foot pads flush on sand even under crash tilt!)
    this.landingStruts = [];
    const strutCoords = [
      [-1.85, 2.45],
      [1.85, 2.45],
      [-2.1, -2.55],
      [2.1, -2.55]
    ];
    for (const [lx, lz] of strutCoords) {
      const lg = new THREE.Group();
      lg.position.set(lx, 0, lz);
      const wellHousing = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.26, 0.42, 14),
        darkTitaniumMat
      );
      wellHousing.position.y = 1.92;
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.19, 0.19, 1.32, 12),
        darkTitaniumMat
      );
      upper.position.y = 1.34;
      upper.castShadow = true;
      const piston = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 1.0, 12),
        copperMat
      );
      piston.position.y = 0.55;
      const pad = new THREE.Mesh(
        new RoundedBoxGeometry(0.95, 0.18, 1.15, 3, 0.06),
        darkTitaniumMat
      );
      pad.position.y = 0.09;
      pad.castShadow = true;
      lg.add(wellHousing, upper, piston, pad);
      this.hullPivot.add(lg);
      const groundOffset = getTerrainHeight(lx, lz, false) - this.baseGroundY;
      this.landingStruts.push({ lx, lz, piston, pad, groundOffset });
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

    // 6. Weathered Aerospace Hull Registry & Mission Livery Decals (`SW-04 · STARWEAVER`)
    const registryTex = createHullRegistryDecalTexture();
    const registryMat = new THREE.MeshStandardMaterial({
      map: registryTex,
      transparent: true,
      depthWrite: false,
      roughness: 0.38,
      metalness: 0.22,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3
    });
    for (const side of [-1, 1]) {
      const decalPlane = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 0.78), registryMat);
      decalPlane.position.set(side * 2.24, 2.68, 0.65);
      decalPlane.rotation.y = side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      decalPlane.rotation.z = -side * 0.05;
      this.hullPivot.add(decalPlane);
    }

    const bayPlateTex = createIndustrialSpecPlateTexture({
      header: 'AUX FUSION BAY',
      code: 'STARWEAVER · SYS-01',
      specA: 'OUTPUT: 48.0 MW',
      specB: 'INSERT CORE TO BOOT',
      accent: '#ff9638'
    });
    const bayPlateMount = new THREE.Mesh(
      new RoundedBoxGeometry(0.52, 0.38, 0.64, 2, 0.03),
      darkTitaniumMat
    );
    bayPlateMount.position.set(1.96, 2.40, 2.45);
    bayPlateMount.rotation.y = 0.14;
    bayPlateMount.rotation.z = -0.10;
    const bayPlate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.60, 0.34),
      new THREE.MeshStandardMaterial({
        map: bayPlateTex,
        roughness: 0.42,
        metalness: 0.65,
        polygonOffset: true,
        polygonOffsetFactor: -3
      })
    );
    bayPlate.position.x = 0.265;
    bayPlate.rotation.y = Math.PI * 0.5;
    bayPlateMount.add(bayPlate);
    this.hullPivot.add(bayPlateMount);
  }

  _buildRepairModules() {
    return buildSpacecraftRepairModules(this);
  }
  _buildPreflightAndRamp() {
    for (const chk of PREFLIGHT_CHECKS) {
      const cy = getTerrainHeight(chk.position.x, chk.position.z, false);
      const pGroup = new THREE.Group();
      pGroup.position.set(chk.position.x, cy - this.baseGroundY, chk.position.z);

      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.22, 0.76, 10),
        new THREE.MeshStandardMaterial({ color: '#394659', metalness: 0.6, roughness: 0.4 })
      );
      stem.position.y = 0.38;
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.12, 0.12, 10),
        new THREE.MeshStandardMaterial({ color: '#4d5d75', metalness: 0.65, roughness: 0.35 })
      );
      cup.position.y = 0.76;

      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.26, 0),
        new THREE.MeshStandardMaterial({
          color: '#ffd257',
          emissive: '#ff9900',
          emissiveIntensity: 1.8
        })
      );
      beacon.position.y = 0.92;
      pGroup.add(stem, cup, beacon);
      pGroup.visible = false;
      this.group.add(pGroup);
      this.preflightMeshes.set(chk.id, { group: pGroup, beacon });
    }

    // Illuminated Boarding Ramp with hull threshold bridge & side guide rails
    this.boardingRamp = new THREE.Group();
    const deckMat = new THREE.MeshStandardMaterial({
      color: '#4b5c73',
      metalness: 0.65,
      roughness: 0.35
    });
    const deck = new THREE.Mesh(
      new RoundedBoxGeometry(3.20, 0.14, 1.38, 3, 0.04),
      deckMat
    );
    const hingeBridge = new THREE.Mesh(
      new RoundedBoxGeometry(0.65, 0.22, 1.44, 3, 0.04),
      deckMat
    );
    hingeBridge.position.set(-1.28, -0.04, 0);
    const railMat = new THREE.MeshStandardMaterial({
      color: '#6cf7ff',
      emissive: '#00b7ff',
      emissiveIntensity: 1.9
    });
    for (const rz of [-0.63, 0.63]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.12, 0.07), railMat);
      rail.position.set(0, 0.11, rz);
      this.boardingRamp.add(rail);
    }
    this.boardingRamp.add(deck, hingeBridge);
    this.boardingRamp.position.set(2.96, 0.62, 1.5);
    this.boardingRamp.rotation.z = -0.44;
    this.boardingRamp.visible = false;
    this.hullPivot.add(this.boardingRamp);

    // Recessed starboard airlock with two sliding leaves, using the same
    // titanium, copper and cyan vocabulary as the existing hull.
    this.airlock = new THREE.Group();
    this.airlock.position.set(2.34, 2.35, 1.5);
    const recess = new THREE.Mesh(new RoundedBoxGeometry(0.08, 2.48, 1.5, 3, 0.12),
      new THREE.MeshStandardMaterial({ color: '#101c27', roughness: 0.82, metalness: 0.45 }));
    this.airlock.add(recess);
    this.airlockLeaves = [];
    for (const sign of [-1, 1]) {
      const leaf = new THREE.Mesh(new RoundedBoxGeometry(0.14, 2.4, 0.7, 3, 0.08), deckMat);
      leaf.position.set(0.09, 0, sign * 0.355);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 2.16, 0.035), railMat);
      edge.position.set(0.08, 0, -sign * 0.31);
      leaf.add(edge);
      this.airlock.add(leaf);
      this.airlockLeaves.push(leaf);
    }
    this.hullPivot.add(this.airlock);
  }

  prepareBoarding(robot) {
    if (robot.worldPlane === 'homeworld' || isHomeworldContext(null, robot.position.y)) {
      this._boardingStart.set(4.45, this.baseGroundY, 1.5);
    } else {
      this._boardingStart.copy(robot.position);
    }
    robot.group.updateWorldMatrix(true, true);
    this._boardingInverse.copy(robot.group.matrixWorld).invert();
    this._boardingBounds.makeEmpty();
    robot.group.traverse((part) => {
      if (!part.isMesh || part.material === robot.headlampConeMat) return;
      let ancestor = part;
      while (ancestor !== robot.group) {
        if (!ancestor.visible) return;
        ancestor = ancestor.parent;
      }
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      this._boardingPartMatrix.multiplyMatrices(this._boardingInverse, part.matrixWorld);
      this._boardingPartBounds.copy(part.geometry.boundingBox).applyMatrix4(this._boardingPartMatrix);
      this._boardingBounds.union(this._boardingPartBounds);
    });
    this._boardingBackExtent = Math.max(0.75, -this._boardingBounds.min.z);
    this._boardingInsideX = Math.min(0.95, 2.34 - this._boardingBackExtent - 0.22);
    this.resetHomeworldCeremony?.();
  }

  _setAirlockOpen(amount) {
    this._airlockOpenAmount = amount;
    for (let i = 0; i < this.airlockLeaves.length; i++) {
      const sign = i === 0 ? -1 : 1;
      this.airlockLeaves[i].position.z = sign * (0.355 + amount * 0.69);
    }
  }

  _rampFootHeight(x) {
    const deck = 0.62 - (x - 2.96) * Math.tan(0.44) + 0.07 / Math.cos(0.44);
    return Math.max(0, deck + 0.002);
  }

  _buildHyperspaceTunnel() {
    const streakCount = 90;
    const positions = new Float32Array(streakCount * 6);
    const colors = new Float32Array(streakCount * 6);
    const c1 = new THREE.Color('#6dfce8');
    const c2 = new THREE.Color('#c98cff');

    for (let i = 0; i < streakCount; i++) {
      const a = (i / streakCount) * Math.PI * 2 + (i % 7) * 0.21;
      const rad = 5.5 + (i % 9) * 1.15;
      const x = Math.cos(a) * rad;
      const y = 2.25 + Math.sin(a) * rad * 0.72;
      const zStart = -18 + (i % 13) * 3.2;
      const len = 7.5 + (i % 5) * 2.8;

      const idx = i * 6;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = zStart;
      positions[idx + 3] = x;
      positions[idx + 4] = y;
      positions[idx + 5] = zStart + len;

      const col = i % 2 === 0 ? c1 : c2;
      colors[idx] = col.r;
      colors[idx + 1] = col.g;
      colors[idx + 2] = col.b;
      colors[idx + 3] = 1.0;
      colors[idx + 4] = 1.0;
      colors[idx + 5] = 1.0;
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.warpTunnelMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.warpTunnelLines = new THREE.LineSegments(lineGeo, this.warpTunnelMat);
    this.warpTunnelLines.visible = false;
    this.hullPivot.add(this.warpTunnelLines);
  }

  /**
   * Keep the boarding beat in world space while the launch cutscene owns the
   * robot transform. The old flow teleported Milo to the hatch and hid him at
   * 52% of Act 1, which made the player read it as a pop rather than boarding.
   */
  _applyRobotBoardingPose(robot, progress) {
    const p = clamp(progress, 0, 1);
    const approachP = smoothstep(0, 0.22, p);
    const walkP = smoothstep(0.22, 0.62, p);
    const enterP = smoothstep(0.62, 0.82, p);
    const hatchP = smoothstep(0.88, 0.99, p);
    const bob = Math.sin(walkP * Math.PI) * 0.025;
    const x = p < 0.22 ? lerp(this._boardingStart.x, 4.45, approachP)
      : p < 0.62 ? lerp(4.45, 2.12, walkP) : lerp(2.12, this._boardingInsideX, enterP);
    const z = lerp(this._boardingStart.z, 1.5, approachP);
    const y = p < 0.22 ? lerp(this._boardingStart.y, this.baseGroundY, approachP)
      : this.baseGroundY + this._rampFootHeight(Math.max(2.12, x));

    const fullyInside = x + this._boardingBackExtent + 0.12 < 2.34;
    robot.group.visible = !(fullyInside && p >= 0.985);
    robot.group.position.set(x, y, z);
    robot.group.rotation.set(0, -Math.PI / 2, Math.sin(walkP * Math.PI) * 0.035);
    robot.group.scale.setScalar(1);
    this._setAirlockOpen(smoothstep(0, 0.16, p) * (1 - (fullyInside ? hatchP : 0)));
    this.boardingRamp.visible = p < 0.995;
    if (robot.guideRig) robot.guideRig.visible = false;

    // A small forward lean and arm tuck sells the threshold step without
    // introducing a second animation system for this one cinematic beat.
    if (robot.bodyPivot) {
      robot.bodyPivot.position.y = bob;
      robot.bodyPivot.rotation.x = lerp(0.04, -0.16, hatchP);
    }
    if (robot.headGroup) {
      robot.headGroup.rotation.x = lerp(0, -0.12, hatchP);
      robot.headGroup.rotation.z = Math.sin(walkP * Math.PI) * 0.06;
    }
    if (robot.leftArm) robot.leftArm.rotation.x = lerp(0.12, 0.44, walkP);
    if (robot.rightArm) robot.rightArm.rotation.x = lerp(-0.12, 0.44, walkP);

    if (robot.groundShadowMesh) {
      robot.groundShadowMesh.visible = robot.group.visible && hatchP < 0.54;
      robot.groundShadowMesh.position.set(x, this.baseGroundY + 0.035, z);
    }
  }

  /**
   * Reveal Milo from the landed ship through the visible boarding ramp. The
   * reveal waits for touchdown, scales from the hatch depth, then hands off to
   * a short walk and celebration so the ending never pops the character in.
   */
  _applyRobotExitPose(robot, progress) {
    const p = clamp(progress, 0, 1);
    const hatchP = smoothstep(0, 0.13, p);
    const revealP = smoothstep(0.13, 0.38, p);
    const walkP = smoothstep(0.38, 1, p);
    const bob = Math.sin(revealP * Math.PI) * 0.025;
    this._exitWalk.getPoint(walkP, this._exitPoint);
    this._exitWalk.getPoint(Math.max(0, walkP - 0.0001), this._exitBefore);
    this._exitWalk.getPoint(Math.min(1, walkP + 0.0001), this._exitAfter);
    this._exitTangent.subVectors(this._exitAfter, this._exitBefore).normalize();
    const x = p < 0.13 ? lerp(this._boardingInsideX, 2.12, hatchP)
      : p < 0.38 ? lerp(2.12, 4.45, revealP) : this._exitPoint.x;
    const z = p < 0.38 ? -0.7 : this._exitPoint.z;
    const groundY = getHomeworldGroundHeight(x, z);
    const y = groundY + (p < 0.38 ? this._rampFootHeight(Math.max(2.12, x)) : 0);

    robot.group.visible = p > 0.015;
    robot.group.position.set(x, y, z);
    const walkYaw = Math.atan2(this._exitTangent.x, this._exitTangent.z);
    robot.group.rotation.set(0, p < 0.38 ? Math.PI / 2 : lerp(walkYaw, 0, smoothstep(0.88, 1, p)), 0);
    robot.group.scale.setScalar(1);
    this._setAirlockOpen(smoothstep(0, 0.06, p) * (1 - smoothstep(0.43, 0.58, p)));
    this.boardingRamp.visible = p < 0.6;
    if (robot.guideRig) robot.guideRig.visible = false;

    if (robot.bodyPivot) {
      robot.bodyPivot.position.y = bob + Math.sin(walkP * Math.PI * 2) * 0.025;
      robot.bodyPivot.rotation.x = lerp(-0.18, walkP > 0.78 ? 0 : 0.10, revealP);
    }
    if (robot.headGroup) {
      robot.headGroup.rotation.x = lerp(-0.1, -0.03, revealP);
      robot.headGroup.rotation.z = Math.sin(walkP * Math.PI * 2) * 0.045;
    }
    if (robot.leftArm) robot.leftArm.rotation.x = lerp(0.46, Math.sin(walkP * Math.PI * 5) * 0.26, revealP);
    if (robot.rightArm) robot.rightArm.rotation.x = lerp(0.46, -Math.sin(walkP * Math.PI * 5) * 0.26, revealP);

    if (robot.groundShadowMesh) {
      robot.groundShadowMesh.visible = p > 0.28;
      robot.groundShadowMesh.position.set(x, groundY + 0.035, z);
    }
  }

  ensureHomeworldScene() {
    if (this.homeworldGroup) return false;
    this._buildHomeworldScene();
    return true;
  }

  disposeHomeworldScene(renderer = null) {
    if (!this.homeworldGroup) return false;
    const sharedTextures = new Set();
    if (this.pbrLibrary && typeof this.pbrLibrary === 'object') {
      for (const entry of Object.values(this.pbrLibrary)) {
        if (!entry || typeof entry !== 'object') continue;
        for (const tex of Object.values(entry)) {
          if (tex && tex.isTexture) sharedTextures.add(tex);
        }
      }
    }
    disposeObjectSubtree(this.homeworldGroup, { renderer, sharedTextures });
    this.homeworldGroup = null;
    this.homeworldColliders = [];
    this.homeworldCameraOccluders = [];
    this.homeworldTurbineRotor = null;
    this.homeworldActivityVisuals = null;
    this.crewFigures = [];
    this.companionBots = [];
    this.homeworldCeremony = null;
    this.homeworldEnhancements = null;
    this._homeworldActivityMask = -1;
    return true;
  }

  _buildHomeworldScene() {
    this.homeworldGroup = new THREE.Group();
    this.homeworldGroup.name = 'homeworld-ending';
    this.homeworldGroup.position.set(0, 420, 0);
    this.homeworldGroup.visible = false;
    this.scene.add(this.homeworldGroup);
    this.homeworldColliders = [];

    const landscape = buildHomeworldLandscape(this.homeworldGroup, this.homeworldColliders, this.pbrLibrary);
    this.homeworldTurbineRotor = landscape.turbineRotor;
    this.homeworldActivityVisuals = landscape;
    this.homeworldCameraOccluders = landscape.cameraOccluders || [];
    this._homeworldActivityMask = -1;
    this._homeworldStageColor = new THREE.Color();
    const meadowFlowerMat = landscape.flowerMaterial;

    // Tailored colony crew and two function-specific utility rovers share the
    // spacecraft's ceramic/alloy PBR language, with static equipment batched.
    const characters = buildHomeworldCharacters(this.homeworldGroup, this.homeworldColliders, this.pbrLibrary);
    this.crewFigures = characters.crew;
    this.companionBots = characters.bots;
    this.homeworldCeremony = characters.ceremony;

    // Build the inhabited settlement layer after the landing pad and meadow base so
    // its colliders are returned through the same authoritative spacecraft registry.
    this.homeworldEnhancements = buildHomeworldEnhancements(this.homeworldGroup, this.homeworldColliders, this.pbrLibrary);
  }

  resetHomeworldCeremony() {
    resetColonyCeremony(this.homeworldCeremony);
  }

  startHomeworldCeremony() {
    startColonyCeremony(this.homeworldCeremony);
  }

  notifyHomeworldPlayerArrived(x, z) {
    notifyColonyPlayerArrived(this.homeworldCeremony, x, z);
  }

  _updateHomeworldActivityVisuals(dt, elapsed = 0) {
    const visuals = this.homeworldActivityVisuals;
    const survey = this.state.homeworldSurvey;
    if (!visuals) return;
    if (visuals.waterUniforms) {
      visuals.waterUniforms.uTime.value = elapsed;
    }
    if (!survey) return;
    const records = survey.records;
    const atmoMode =
      typeof this.state.getHomeworldAtmosphere === 'function'
        ? this.state.getHomeworldAtmosphere()
        : 'dawn';
    const atmoCode = atmoMode === 'night' ? 2 : atmoMode === 'sunset' ? 1 : 0;
    const mask = Number(records.observatory) | (Number(records.nursery) << 1) |
      (Number(records.energy) << 2) | (survey.calibration << 3) | (Number(survey.completed) << 6) |
      (atmoCode << 7);
    if (mask !== this._homeworldActivityMask) {
      this._homeworldActivityMask = mask;
      const atmoBoost = atmoMode === 'night' ? 1.45 : atmoMode === 'sunset' ? 1.22 : 1.0;
      for (const id of ['observatory', 'nursery', 'energy']) {
        const material = visuals.activityLights?.[id]?.material;
        if (!material) continue;
        const complete = id === 'energy' ? survey.calibration === 3 : records[id];
        material.color.set(complete ? '#6effc8' : '#ffd275');
        material.emissive.set(complete ? '#14c986' : '#cc8822');
        material.emissiveIntensity = (complete ? 1.45 : 0.72) * atmoBoost;
      }
      if (visuals.energyStageLights) {
        for (let i = 0; i < 3; i++) {
          this._homeworldStageColor.set(i < survey.calibration ? '#66ffc2' : '#8a7a52');
          visuals.energyStageLights.setColorAt(i, this._homeworldStageColor);
        }
        visuals.energyStageLights.instanceColor.needsUpdate = true;
      }
      if (visuals.observatoryHoloRig) {
        visuals.observatoryHoloRig.visible = Boolean(records.observatory);
      }
      if (visuals.nurseryBioRig) {
        visuals.nurseryBioRig.visible = Boolean(records.nursery);
      }
      if (visuals.valleyLampMat) {
        const gridOnline = survey.calibration === 3;
        visuals.valleyLampMat.color.set(gridOnline ? '#fff3cc' : '#e8d5ad');
        visuals.valleyLampMat.emissive.set(gridOnline ? '#ffb838' : '#dba767');
        const baseLamp = gridOnline ? 1.95 : 0.68;
        visuals.valleyLampMat.emissiveIntensity =
          atmoMode === 'night'
            ? baseLamp * 1.65
            : atmoMode === 'sunset'
              ? baseLamp * 1.32
              : baseLamp;
      }
    }
    if (visuals.observatoryHoloRig && visuals.observatoryHoloRig.visible) {
      visuals.observatoryHoloRig.rotation.y += dt * 0.75;
    }
    if (visuals.nurseryBioRig && visuals.nurseryBioRig.visible) {
      visuals.nurseryBioRig.rotation.y -= dt * 0.65;
    }
    if (visuals.energyRotor) {
      visuals.energyRotor.rotation.x += dt * (survey.calibration === 3 ? 1.85 : 0.22);
    }
  }

  setThrusterPlumes(active, scale = 1.0) {
    for (const p of this.enginePlumes) {
      p.userData.targetThrottle = active ? Math.max(0, scale) : 0;
    }
  }

  update(dt, elapsed, inCutscene = false) {
    const r = this.state.repairs;

    const targetRoll = r.repair_propulsion ? 0 : -0.085;
    const targetPitch = r.repair_propulsion ? 0 : 0.035;
    this.hullPivot.rotation.z += (targetRoll - this.hullPivot.rotation.z) * Math.min(1, dt * 4);
    this.hullPivot.rotation.x += (targetPitch - this.hullPivot.rotation.x) * Math.min(1, dt * 4);

    for (const plume of this.enginePlumes) {
      updateThrusterPlume(plume, dt, elapsed);
    }
    this.ascentShieldDomeMat.uniforms.uTime.value = elapsed;

    // Articulate telescopic hydraulic landing gear so all 4 foot pads sit flush on sand under crash tilt!
    if (this.landingStruts) {
      const roll = this.hullPivot.rotation.z;
      const pitch = this.hullPivot.rotation.x;
      const retract = this._gearRetract || 0;
      const onHomePad = this.homeworldGroup && this.homeworldGroup.visible && !inCutscene;
      for (const st of this.landingStruts) {
        const tiltDy = inCutscene || onHomePad ? 0 : st.lx * Math.sin(roll) - st.lz * Math.sin(pitch);
        const deployedPadY = (inCutscene || onHomePad ? 0 : st.groundOffset - tiltDy) + 0.08;
        const padY = lerp(deployedPadY, 0.92, retract);
        st.pad.position.y = padY;
        st.pad.rotation.z = inCutscene || onHomePad ? 0 : -roll;
        st.pad.rotation.x = inCutscene || onHomePad ? 0 : -pitch;
        const topAnchorY = 1.05;
        const span = Math.max(0.16, topAnchorY - padY);
        st.piston.scale.y = span;
        st.piston.position.y = padY + span * 0.5;
      }
    }

    // Dynamically compute repair state bitmask across all REPAIR_TARGETS
    let repairKey = 0;
    for (let i = 0; i < this._repairIds.length; i++) {
      if (r[this._repairIds[i]]) repairKey |= (1 << i);
    }
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

      if (this.shieldCrownVisual) {
        this.shieldCrownVisual.visible = Boolean(r.repair_shield);
      }

      if (this.hyperdriveRingGroup) {
        this.hyperdriveRingGroup.visible = Boolean(r.repair_hyperdrive);
      }
    }

    if (!r.repair_power) {
      this.powerSparkBulb.scale.setScalar(0.72 + Math.sin(elapsed * 18) * 0.32);
      this.powerSparkBulb.rotation.y = elapsed * 6;
    }

    // 2. Communications Visuals
    if (r.repair_comms) {
      this.commsDishHead.rotation.x = -0.42 + Math.sin(elapsed * 0.09) * 0.025;
      this.commsDishHead.rotation.y = 0.35 + Math.sin(elapsed * 0.12) * 0.45;
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

    // The forward navigation projection is stowed on the homeworld apron;
    // its rings otherwise occupy the traveller's welcome/footpath space.
    const onHomePlane = Boolean(this.homeworldGroup && this.homeworldGroup.visible);
    this.navHoloProjector.visible = Boolean(r.repair_nav && !onHomePlane);
    if (r.repair_nav) {
      this.navHoloProjector.rotation.z = elapsed * 1.3;
      this.navHoloProjector.rotation.y = Math.sin(elapsed * 0.9) * 0.35;
    }

    if (r.repair_shield && this.shieldHaloRing) {
      this.shieldHaloRing.rotation.z = elapsed * 1.6;
      this.shieldHaloRing.position.y = 0.38 + Math.sin(elapsed * 2.8) * 0.05;
    }

    if (r.repair_hyperdrive && this.hyperdriveRingGroup) {
      const spinSpeed = inCutscene === 'launch' ? 5.8 : 1.15;
      this.hyperdriveRingGroup.rotation.z += dt * spinSpeed;
    }

    if (!inCutscene) {
      this.setThrusterPlumes(false);
      this._setAirlockOpen(0);
      this.launchGroundWash.visible = false;
      this._gearRetract = 0;
      if (this.ascentShieldDome) this.ascentShieldDome.visible = false;
      if (this.warpTunnelLines) this.warpTunnelLines.visible = false;
    }

    // Update repair ground markers (dirty-checked; hidden on Homeworld!)
    for (const [rId, mObj] of this.repairMarkers.entries()) {
      const target = REPAIR_TARGETS[rId];
      const repaired = Boolean(r[rId]);
      const activeForLevel = target.level <= this.state.currentLevel;
      mObj.group.visible = activeForLevel && !inCutscene && !onHomePlane;
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

    // Update Pre-Flight Checkpoints & Boarding Ramp (only once ALL ship systems are repaired!)
    const showPreflight =
      this.state.areAllShipSystemsRepaired() && !inCutscene && !onHomePlane;
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
      (this.state.canLaunchSpacecraft() && !inCutscene && !onHomePlane) ||
      (inCutscene === 'launch' && !onHomePlane && (this._gearRetract || 0) < 0.15);

    if (onHomePlane) {
      this._updateHomeworldActivityVisuals(dt, elapsed);
      updateHomeworldCharacters(this.crewFigures, this.companionBots, elapsed, dt, this.homeworldCeremony);
      if (this.homeworldTurbineRotor) {
        this.homeworldTurbineRotor.rotation.z += dt * 1.8;
      }
      if (!this._hwEnhanceOpts) {
        this._hwEnhanceOpts = {
          surveyCompleted: false,
          atmoMode: 'dawn',
          flightRingsMap: null,
          skyTrialHitSet: null,
          nurseryBloomed: false
        };
      }
      const opts = this._hwEnhanceOpts;
      opts.surveyCompleted = Boolean(this.state.homeworldSurvey && this.state.homeworldSurvey.completed);
      opts.atmoMode = typeof this.state.getHomeworldAtmosphere === 'function'
        ? this.state.getHomeworldAtmosphere()
        : 'dawn';
      opts.flightRingsMap = this.state.homeworldSurvey?.flightRings || null;
      opts.skyTrialHitSet = this.skyTrialHitSet || null;
      opts.nurseryBloomed = Boolean(this.state.homeworldSurvey?.nurseryBloomed);
      updateHomeworldEnhancements(this.homeworldEnhancements, elapsed, dt, opts);
    }
  }

  /**
   * 4-Act Cinematic Launch & Hyperspace Homecoming (~22.4s):
   * - Act 1 (0.00 -> 0.20): Milo boards ramp -> ramp stows -> twin bells roar & Photonic Shield Dome ignites!
   * - Act 2 (0.20 -> 0.44): Liftoff & hydraulic gear retraction -> pierces Kharis-4 storm clouds into ringed planet orbit!
   * - Act 3 (0.44 -> 0.58): Quantum Hyperdrive Ring spins up -> dazzling violet-cyan star-streak warp jump!
   * - Act 4 (0.58 -> 1.00): Emerges into sunlit Homeworld Meadow (Y=420) -> gear deploys & retro-touchdown -> cheering crew & Milo reunion!
   */
  applyCutsceneFrame(t, elapsed, robot, camera = null) {
    this.launchGroundWash.visible = t > 0.13 && t < 0.26;
    this.launchGroundWash.material.uniforms.uProgress.value = clamp((t - 0.13) / 0.13, 0, 1);
    this.launchGroundWash.material.uniforms.uTime.value = elapsed;
    // Act 1: Boarding, Ignition & Photonic Shield Activation
    if (t < 0.20) {
      const p = t / 0.20;
      if (this.homeworldGroup) this.homeworldGroup.visible = false;
      this._gearRetract = 0;
      if (this.environments) this.scene.environment = this.environments.desert;
      if (this.skyDome) {
        this.skyDome.group.position.y = 0;
        this.skyDome.setMode('desert', 0);
      }
      this.scene.fog.color.set('#d89c72');
      this.scene.fog.density = 0.0020;

      // Let Milo finish the visible ramp walk before the hull starts to lift.
      // The previous 0.55 threshold made the ship rise under him while he was
      // still being teleported into the hatch.
      const lift = 0;
      const rumble = Math.sin(elapsed * 52) * 0.02 * smoothstep(0.55, 0.8, p) * (1 - smoothstep(0.85, 1, p));
      this.group.position.set(0, this.baseGroundY + lift + rumble, 0);
      this.hullPivot.rotation.set(0, 0, 0);

      this._applyRobotBoardingPose(robot, p);

      this.setThrusterPlumes(true, smoothstep(0.53, 0.94, p) * 1.55);
      if (this.ascentShieldDome) {
        this.ascentShieldDome.visible = p > 0.35;
        this.ascentShieldDomeMat.opacity = smoothstep(0.35, 0.95, p) * 0.28;
      }
      if (this.warpTunnelLines) this.warpTunnelLines.visible = false;

      const camAngle = lerp(0.72, 0.28, p);
      return {
        position: this._cutCamPos.set(
          Math.sin(camAngle) * 14.5,
          this.baseGroundY + lerp(4.2, 5.8, p),
          Math.cos(camAngle) * 14.5
        ),
        lookAt: this._cutCamLook.set(
          lerp(0, 1.0, smoothstep(0.0, 0.72, p)),
          this.baseGroundY + 2.4 + lift * 0.7,
          0.65
        )
      };
    }

    // Act 2: Supersonic Atmospheric Climb & Orbital Ringed-Planet Flyby
    if (t < 0.44) {
      const p = (t - 0.20) / 0.24;
      if (this.homeworldGroup) this.homeworldGroup.visible = false;
      robot.group.visible = false;
      this.boardingRamp.visible = false;
      this._setAirlockOpen(0);
      if (robot.groundShadowMesh) robot.groundShadowMesh.visible = false;
      this._gearRetract = smoothstep(0.04, 0.45, p);

      const spaceBlend = smoothstep(0.08, 0.92, p);
      if (this.skyDome) this.skyDome.setMode('desert', spaceBlend);
      this.scene.fog.color.copy(this._skyDesertCol).lerp(this._skySpaceCol, spaceBlend);
      this.scene.fog.density = lerp(0.0020, 0.0003, p);

      const climbY = this.baseGroundY + Math.pow(p, 1.85) * 96;
      const fwdZ = Math.pow(p, 1.4) * 22;
      this.group.position.set(0, climbY, fwdZ);
      this.hullPivot.rotation.set(-0.26 * Math.sin(p * Math.PI * 0.85), 0, Math.sin(p * Math.PI) * 0.08);
      this.setThrusterPlumes(true, lerp(1.55, 2.0, smoothstep(0, 1, p)));

      if (this.ascentShieldDome) {
        this.ascentShieldDome.visible = true;
        this.ascentShieldDomeMat.opacity = (1.0 - smoothstep(0.55, 1.0, p)) * 0.34;
      }
      if (this.warpTunnelLines) this.warpTunnelLines.visible = false;

      return {
        position: this._cutCamPos.set(
          lerp(11.5, -8.5, p),
          climbY + lerp(3.2, 5.4, p),
          fwdZ + lerp(-12.5, -14.0, p)
        ),
        lookAt: this._cutCamLook.set(0, climbY + 2.3, fwdZ + 3.2)
      };
    }

    // Act 3: Quantum Hyperdrive Jump Corridor across Starlight!
    if (t < 0.58) {
      const p = (t - 0.44) / 0.14;
      if (this.homeworldGroup) this.homeworldGroup.visible = false;
      robot.group.visible = false;
      if (robot.groundShadowMesh) robot.groundShadowMesh.visible = false;
      this._gearRetract = 1.0;

      if (this.skyDome) this.skyDome.setMode('desert', 1.0);
      this.scene.fog.color.copy(this._skySpaceCol);
      this.scene.fog.density = 0.0002;

      const warpY = this.baseGroundY + 110;
      const warpZ = 24 + p * 42;
      this.group.position.set(0, warpY, warpZ);
      this.hullPivot.rotation.set(0, 0, Math.sin(p * Math.PI * 2) * 0.06);
      this.setThrusterPlumes(true, 2.15 + Math.sin(p * Math.PI) * 0.15);

      if (this.ascentShieldDome) {
        this.ascentShieldDome.visible = true;
        this.ascentShieldDomeMat.opacity = 0.22 + Math.sin(p * Math.PI) * 0.25;
      }
      if (this.warpTunnelLines) {
        this.warpTunnelLines.visible = true;
        this.warpTunnelLines.rotation.z = elapsed * 2.4;
        this.warpTunnelLines.position.z = -((elapsed * 36) % 8.0);
        this.warpTunnelMat.opacity = Math.sin(p * Math.PI) * 0.92;
      }

      return {
        position: this._cutCamPos.set(
          lerp(-6.2, 5.8, p),
          warpY + 3.1,
          warpZ - lerp(11.5, 8.8, p)
        ),
        lookAt: this._cutCamLook.set(0, warpY + 2.2, warpZ + 4.5)
      };
    }

    // Act 4: Sunlit Homeworld Emerald Meadow Descent, Gear Deployment & Grand Reunion (t >= 0.58)!
    this.ensureHomeworldScene();
    const p = (t - 0.58) / 0.42;
    this.homeworldGroup.visible = true;
    if (this.ascentShieldDome) this.ascentShieldDome.visible = false;
    if (this.warpTunnelLines) this.warpTunnelLines.visible = false;

    if (this.environments) this.scene.environment = this.environments.homeworld;
    if (this.skyDome) {
      this.skyDome.group.position.y = 420;
      this.skyDome.setMode('homeworld', 0);
    }
    this.scene.fog.color.set('#bceeff');
    this.scene.fog.density = HOMEWORLD_CONFIG.fogDensity;

    const homeY = 420;
    if (p >= 0.645) this.startHomeworldCeremony?.();
    this._gearRetract = 1.0 - smoothstep(0.05, 0.45, p);
    const landFactor = 1 - Math.pow(1 - clamp(p * 1.55, 0, 1), 2.6);
    const shipY = lerp(homeY + 19.5, HOMEWORLD_CONFIG.padY, landFactor);
    const flarePitch = (1 - landFactor) * 0.14;
    this.group.position.set(0, shipY, -2.2);
    this.hullPivot.rotation.set(flarePitch, 0, 0);
    this.setThrusterPlumes(p < 0.62, Math.max(0.12, (1 - p * 1.55) * 1.25));

    // Do not reveal Milo until the landing struts are down and the hull is
    // settled. Then ease him out of the hatch, down the ramp, and into a
    // readable celebration pose instead of popping him into the meadow.
    if (p >= 0.66) {
      this._applyRobotExitPose(robot, (p - 0.66) / 0.34);
      if ((p - 0.66) / 0.34 >= 0.985) this.notifyHomeworldPlayerArrived?.();
      if (p > 0.91) robot.triggerAction('celebrate', 0.18);
    } else {
      robot.group.visible = false;
      robot.group.scale.setScalar(1);
      if (robot.groundShadowMesh) robot.groundShadowMesh.visible = false;
    }

    // Hold one starboard-front viewing corridor through touchdown and the
    // whole exit. The old 150-degree orbit crossed the commons and tree crowns.
    const settle = smoothstep(0.20, 0.64, p);
    const exitFrame = smoothstep(0.86, 1.0, p);
    return this._fitHomeworldPartyFrame(camera,
      lerp(0, 0.05, settle), homeY + lerp(3.0, 1.25, settle),
      lerp(1.6, 6.75, settle), Math.PI - 0.75, Math.asin(0.62),
      lerp(22.0, 8.0, settle), -4.35, lerp(5.4, 4.5, exitFrame),
      lerp(-1.65, 4.45, exitFrame), 9.2);
  }

  enterHomeworldFreeRoam(robot) {
    this.ensureHomeworldScene();
    this.homeworldGroup.visible = true;
    this._gearRetract = 0;
    if (this.ascentShieldDome) this.ascentShieldDome.visible = false;
    if (this.warpTunnelLines) this.warpTunnelLines.visible = false;
    if (this.environments) this.scene.environment = this.environments.homeworld;
    if (this.skyDome) {
      this.skyDome.group.position.y = 420;
      this.skyDome.setMode('homeworld', 0);
    }
    this.scene.fog.color.set('#bceeff');
    this.scene.fog.density = HOMEWORLD_CONFIG.fogDensity;
    this.group.position.set(0, HOMEWORLD_CONFIG.padY, -2.2);
    this.hullPivot.rotation.set(0, 0, 0);
    this.setThrusterPlumes(false);
    robot.group.visible = true;
    robot.group.scale.setScalar(1);
    if (robot.bodyPivot) {
      robot.bodyPivot.position.y = 0;
      robot.bodyPivot.rotation.set(0, 0, 0);
    }
    if (robot.headGroup) robot.headGroup.rotation.set(0, 0, 0);
    robot.teleportToHomeworldMeadow();
  }

  _fitHomeworldPartyFrame(camera, lookX, lookY, lookZ, azimuth, elevation,
    minimumDistance, minX, maxX, minZ, maxZ, fitBlend = 1) {
    const verticalTan = Math.tan((camera?.fov || 50) * Math.PI / 360);
    const horizontalTan = verticalTan * (camera?.aspect || 16 / 9);
    const cosElevation = Math.cos(elevation);
    const dx = Math.sin(azimuth) * cosElevation;
    const dy = Math.sin(elevation);
    const dz = Math.cos(azimuth) * cosElevation;
    const rightX = Math.cos(azimuth), rightZ = -Math.sin(azimuth);
    const upX = -Math.sin(azimuth) * dy;
    const upY = cosElevation;
    const upZ = -Math.cos(azimuth) * dy;
    let required = minimumDistance;
    // Fit the actual party envelope, including boots, extended hands and Milo.
    // Keeping look direction and retreat on this same basis prevents the old
    // independently interpolated camera/look from sweeping everyone off-screen.
    for (let corner = 0; corner < 8; corner++) {
      const x = (corner & 1 ? maxX : minX) - lookX;
      const y = HOMEWORLD_CONFIG.baseY + (corner & 2 ? 2.4 : 0) - lookY;
      const z = (corner & 4 ? maxZ : minZ) - lookZ;
      const depth = x * dx + y * dy + z * dz;
      const horizontal = Math.abs(x * rightX + z * rightZ);
      const vertical = Math.abs(x * upX + y * upY + z * upZ);
      required = Math.max(required, depth + horizontal / (horizontalTan * 0.80),
        depth + vertical / (verticalTan * 0.72));
    }
    const distance = lerp(minimumDistance, required, fitBlend);
    this._cutCamLook.set(lookX, lookY, lookZ);
    this._cutCamPos.set(lookX + dx * distance, lookY + dy * distance, lookZ + dz * distance);
    return this._homeworldCameraPose;
  }

  applyHomeworldWelcomeFrame(age, robot, camera = null) {
    const turn = smoothstep(0.4, 1.8, age);
    const saluteReply = smoothstep(2.35, 2.95, age) * (1 - smoothstep(4.15, 4.85, age));
    const nod = Math.sin(clamp((age - 3.2) / 0.9, 0, 1) * Math.PI) * 0.10;
    robot.group.rotation.y = -0.85 * turn * (1 - smoothstep(7.4, 8.6, age));
    if (robot.bodyPivot) {
      robot.bodyPivot.position.y = 0;
      robot.bodyPivot.rotation.x = nod * 0.3;
    }
    if (robot.headGroup) {
      robot.headGroup.rotation.x = nod;
      robot.headGroup.rotation.z = saluteReply * Math.sin(age * 4.5) * 0.035;
    }
    if (robot.rightArm) {
      robot.rightArm.rotation.x = -1.85 * saluteReply;
      robot.rightArm.rotation.z = Math.sin(age * 5.0) * 0.13 * saluteReply;
    }
    if (robot.leftArm) robot.leftArm.rotation.x = -0.2 * saluteReply;
    // Lock the landing corridor composition throughout the welcome and ending.
    // No orbit, zoom or changing target can carry the camera into a tree crown.
    return this._fitHomeworldPartyFrame(camera,
      0.05, HOMEWORLD_CONFIG.baseY + 1.25, 6.75,
      Math.PI - 0.75, Math.asin(0.62), 8.0,
      -4.35, 4.5, 4.45, 9.2);
  }

  /**
   * 3-Act Intro Cutscene (~11.0s):
   * - Act 1 (0.00 -> 0.30): Starweaver atmospheric descent & sandy basin crash-landing
   * - Act 2 (0.30 -> 0.66): Milo lying in sand -> chest core & OLED eyes reboot -> hops up!
   * - Act 3 (0.66 -> 1.00): Panoramic sweep of intact Solar Furnace & Fabricator -> seamless blend into follow camera!
   */
  applyIntroCutsceneFrame(t, elapsed, robot, finalFollowPose) {
    if (this.homeworldGroup) this.homeworldGroup.visible = false;
    robot.group.scale.setScalar(1);
    if (this.environments) this.scene.environment = this.environments.desert;
    if (this.skyDome) {
      this.skyDome.group.position.y = 0;
      this.skyDome.setMode('desert', 0);
    }
    this.scene.fog.color.set('#d89c72');
    this.scene.fog.density = 0.0012;

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
    if (this.homeworldGroup) this.homeworldGroup.visible = false;
    this._gearRetract = 0;
    if (this.ascentShieldDome) this.ascentShieldDome.visible = false;
    if (this.warpTunnelLines) this.warpTunnelLines.visible = false;
    if (this.environments) this.scene.environment = this.environments.desert;
    if (this.skyDome) {
      this.skyDome.group.position.y = 0;
      this.skyDome.setMode('desert', 0);
    }
    this.scene.fog.color.set('#d89c72');
    this.scene.fog.density = 0.0012;
    this.group.position.set(0, this.baseGroundY, 0);
    this.hullPivot.rotation.set(0, 0, 0);
    this.setThrusterPlumes(false);
    robot.group.visible = true;
    robot.group.scale.setScalar(1);
    if (robot.bodyPivot) {
      robot.bodyPivot.position.y = 0;
      robot.bodyPivot.rotation.set(0, 0, 0);
    }
    if (robot.headGroup) robot.headGroup.rotation.set(0, 0, 0);
    robot.teleportToHubSafe();
  }
}
