import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ELEVATED_PLATFORMS, getElevatedPlatformAt } from '../data/gameData.js';
import { createSoftAOShadowTexture, createVisorCanvas } from '../graphics/textures.js';
import { clamp, damp, getTerrainHeight } from '../utils/math.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';

export class RobotController {
  constructor(scene, state, sound, particles = null, pbrLibrary = null) {
    this.scene = scene;
    this.state = state;
    this.sound = sound;
    this.particles = particles;
    this.pbrLibrary = pbrLibrary;

    this.group = new THREE.Group();
    this.group.name = 'robot';
    this.group.rotation.order = 'YXZ';
    this.scene.add(this.group);

    this._slopePitch = 0;
    this._slopeRoll = 0;

    // Spawn just in front-right of the crashed spacecraft in Crash Basin
    this.position = new THREE.Vector3(4.8, 0, 5.8);
    this.position.y = getTerrainHeight(this.position.x, this.position.z, false);
    this.yaw = Math.PI * 0.85;
    this.speed = 0;
    this.vy = 0;
    this.radius = 0.62;

    // Jetpack flight stamina & state
    this.maxJetFuel = 100;
    this.jetFuel = 100;
    this.isGrounded = true;
    this.isJetpacking = false;
    this._jetExhausted = false;
    this._jetParticleAccum = 0;

    this.animMode = 'idle';
    this.actionTimer = 0;
    this.blinkTimer = 2.8;
    this.isBlinking = false;
    this.currentMood = 'normal';
    this._dustAccum = 0;
    this._gateBumpCooldown = 0;
    this.onGateBump = null;
    this.onChasmBump = null;

    // World-space drop shadow (projects onto ground OR plateau top below Milo during flight!)
    this.groundShadowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 1.9),
      new THREE.MeshBasicMaterial({
        map: createSoftAOShadowTexture(128),
        transparent: true,
        depthWrite: false,
        opacity: 0.68
      })
    );
    this.groundShadowMesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.groundShadowMesh);

    // World-space holographic navigation ring & directional arrow around Milo's base
    this.guideRig = new THREE.Group();
    this.scene.add(this.guideRig);

    this.visor = createVisorCanvas();
    this._buildMesh();
    this._buildGuideArrow();
    this.syncPositionToMesh();
  }

  setParticles(particles) {
    this.particles = particles;
  }

  _buildMesh() {
    this.bodyPivot = new THREE.Group();
    this.group.add(this.bodyPivot);

    const lib = this.pbrLibrary;
    // Glossy ceramic clearcoat shell + weathered anodized tangerine trim + milled titanium chassis
    const ceramicShellMat = new THREE.MeshPhysicalMaterial({
      map: lib ? lib.hull_white.map : null,
      normalMap: lib ? lib.hull_white.normalMap : null,
      normalScale: new THREE.Vector2(0.28, 0.28),
      color: '#f7faff',
      roughness: 0.16,
      metalness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06
    });
    const accentMat = new THREE.MeshPhysicalMaterial({
      map: lib ? lib.painted_orange.map : null,
      normalMap: lib ? lib.painted_orange.normalMap : null,
      normalScale: new THREE.Vector2(0.38, 0.38),
      color: lib ? '#ffffff' : '#ff8f36',
      roughness: 0.24,
      metalness: 0.35,
      clearcoat: 0.68,
      clearcoatRoughness: 0.15
    });
    const chassisMat = new THREE.MeshStandardMaterial({
      map: lib ? lib.titanium_dark.map : null,
      aoMap: lib ? lib.titanium_dark.ormMap : null,
      roughnessMap: lib ? lib.titanium_dark.ormMap : null,
      metalnessMap: lib ? lib.titanium_dark.ormMap : null,
      normalMap: lib ? lib.titanium_dark.normalMap : null,
      color: lib ? '#ffffff' : '#283242',
      roughness: lib ? 1.0 : 0.52,
      metalness: lib ? 1.0 : 0.62
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: '#1e2430',
      roughness: 0.82,
      metalness: 0.18
    });

    // 1. Detailed Axle Chassis & Treaded Wheels
    const axleBridge = new THREE.Mesh(
      new RoundedBoxGeometry(0.76, 0.2, 0.36, 3, 0.06),
      chassisMat
    );
    axleBridge.position.set(0, 0.34, 0);
    this.group.add(axleBridge);

    this.leftWheel = this._createDetailedWheel(tireMat, accentMat, chassisMat, -1);
    this.leftWheel.position.set(-0.48, 0.33, 0);
    this.rightWheel = this._createDetailedWheel(tireMat, accentMat, chassisMat, 1);
    this.rightWheel.position.set(0.48, 0.33, 0);
    this.group.add(this.leftWheel, this.rightWheel);

    // 2. Sculpted Rounded Pod Torso + Belly Panel + Glowing Heart Core
    const lowerPelvis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.3, 0.24, 20),
      chassisMat
    );
    lowerPelvis.position.y = 0.48;
    this.bodyPivot.add(lowerPelvis);

    this.torso = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 22), ceramicShellMat);
    this.torso.scale.set(1.02, 1.06, 0.94);
    this.torso.position.y = 0.76;
    this.torso.castShadow = true;
    this.bodyPivot.add(this.torso);

    // Warm tangerine scarf/collar ring
    const collar = new THREE.Mesh(
      new THREE.TorusGeometry(0.41, 0.075, 14, 32),
      accentMat
    );
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.02;
    collar.castShadow = true;
    this.bodyPivot.add(collar);

    // Chest recessed bezel + glowing status heart-core
    const chestBezel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.17, 0.06, 18),
      chassisMat
    );
    chestBezel.rotation.x = Math.PI / 2;
    chestBezel.position.set(0, 0.78, 0.43);
    this.chestLight = new THREE.Mesh(
      new THREE.CircleGeometry(0.115, 18),
      new THREE.MeshStandardMaterial({
        color: '#66f5ff',
        emissive: '#00c8ff',
        emissiveIntensity: 2.0
      })
    );
    this.chestLight.position.set(0, 0.78, 0.465);
    this.bodyPivot.add(chestBezel, this.chestLight);

    // 3. Expressive Rounded Pill-Box Head + Recessed Curved Glass Visor
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.38, 0);
    this.bodyPivot.add(this.headGroup);

    const headShell = new THREE.Mesh(
      new RoundedBoxGeometry(0.94, 0.72, 0.8, 6, 0.25),
      ceramicShellMat
    );
    headShell.castShadow = true;
    this.headGroup.add(headShell);

    // Dark recessed visor bezel frame on front (+Z)
    const visorBezel = new THREE.Mesh(
      new RoundedBoxGeometry(0.74, 0.46, 0.12, 4, 0.1),
      chassisMat
    );
    visorBezel.position.set(0, 0.01, 0.365);
    this.headGroup.add(visorBezel);

    // High-res glowing OLED eye screen
    const visorScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.64, 0.34),
      new THREE.MeshBasicMaterial({ map: this.visor.texture })
    );
    visorScreen.position.set(0, 0.01, 0.428);
    this.headGroup.add(visorScreen);

    // Glossy protective clearcoat glass lens over screen
    const visorGlass = new THREE.Mesh(
      new RoundedBoxGeometry(0.68, 0.38, 0.03, 3, 0.06),
      new THREE.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.05,
        metalness: 0.0,
        transparent: true,
        opacity: 0.18,
        clearcoat: 1.0
      })
    );
    visorGlass.position.set(0, 0.01, 0.435);
    this.headGroup.add(visorGlass);

    // Side headphone ear pods with cyan LED accent rings
    const earGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.12, 18);
    earGeo.rotateZ(Math.PI / 2);
    const earRingGeo = new THREE.TorusGeometry(0.12, 0.022, 8, 20);
    earRingGeo.rotateY(Math.PI / 2);
    const earGlowMat = new THREE.MeshStandardMaterial({
      color: '#66f7ff',
      emissive: '#00c8ff',
      emissiveIntensity: 1.8
    });

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, accentMat);
      ear.position.set(side * 0.49, 0.0, 0);
      ear.castShadow = true;
      const eRing = new THREE.Mesh(earRingGeo, earGlowMat);
      eRing.position.set(side * 0.552, 0.0, 0);
      this.headGroup.add(ear, eRing);
    }

    // Spring-coil antenna + glowing glass bobble
    this.antennaPivot = new THREE.Group();
    this.antennaPivot.position.set(0, 0.35, -0.04);
    const antBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.11, 0.08, 12),
      accentMat
    );
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.04, 0.28, 10),
      chassisMat
    );
    stem.position.y = 0.15;
    this.antennaBulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 16, 14),
      new THREE.MeshStandardMaterial({
        color: '#75f8ff',
        emissive: '#00d0ff',
        emissiveIntensity: 2.4,
        roughness: 0.15
      })
    );
    this.antennaBulb.position.y = 0.32;
    this.antennaPivot.add(antBase, stem, this.antennaBulb);
    this.headGroup.add(this.antennaPivot);

    // Automatic Nocturnal / Sandstorm Headlamp (zero shadow-map cost + soft volumetric beam cone!)
    this.headlampLight = new THREE.SpotLight('#fff0c8', 0.0, 17.5, Math.PI * 0.27, 0.58, 1.35);
    this.headlampLight.position.set(0, 0.08, 0.44);
    this.headlampTarget = new THREE.Object3D();
    this.headlampTarget.position.set(0, -0.82, 6.8);
    this.headGroup.add(this.headlampLight, this.headlampTarget);
    this.headlampLight.target = this.headlampTarget;

    const coneGeo = new THREE.ConeGeometry(1.65, 5.6, 20, 1, true);
    coneGeo.translate(0, -2.8, 0);
    coneGeo.rotateX(-Math.PI * 0.5);
    this.headlampConeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uStrength: { value: 0.0 },
        uColor: { value: new THREE.Color('#ffe8b0') }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mv.xyz;
          vNormalV = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uStrength;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          // vUv.y = 1 at apex (visor), 0 at far base
          float axial = smoothstep(0.0, 0.85, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
          float edgeSoft = pow(abs(dot(normalize(vNormalV), normalize(vViewPos))), 1.6);
          float a = axial * edgeSoft * uStrength * 0.24;
          if (a < 0.003) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `
    });
    this.headlampCone = new THREE.Mesh(coneGeo, this.headlampConeMat);
    this.headlampCone.position.set(0, 0.04, 0.46);
    this.headlampCone.rotation.x = 0.13;
    this.headlampCone.visible = false;
    this.headGroup.add(this.headlampCone);

    // 4. Articulated Arms with Shoulder Joints & Two-Prong Claws
    this.leftArm = this._createArmWithClaw(ceramicShellMat, chassisMat, accentMat);
    this.leftArm.position.set(-0.54, 0.88, 0.04);

    this.rightArm = this._createArmWithClaw(ceramicShellMat, chassisMat, accentMat);
    this.rightArm.position.set(0.54, 0.88, 0.04);
    this.bodyPivot.add(this.leftArm, this.rightArm);

    // 5. Detailed Backpack Cargo Rack + Energy Containment Ring + Carried Item
    const packGroup = new THREE.Group();
    packGroup.position.set(0, 0.78, -0.46);

    const packBox = new THREE.Mesh(
      new RoundedBoxGeometry(0.54, 0.4, 0.28, 4, 0.06),
      chassisMat
    );
    packBox.castShadow = true;

    const packRail = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.026, 8, 22),
      accentMat
    );
    packRail.rotation.x = Math.PI / 2;
    packRail.position.set(0, 0.22, -0.02);

    this.packHoloRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.018, 8, 24),
      new THREE.MeshBasicMaterial({ color: '#5ef2ff' })
    );
    this.packHoloRing.rotation.x = Math.PI / 2;
    this.packHoloRing.position.set(0, 0.28, -0.02);
    this.packHoloRing.visible = false;

    packGroup.add(packBox, packRail, this.packHoloRing);
    this.bodyPivot.add(packGroup);

    this.carriedMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.21, 0),
      new THREE.MeshStandardMaterial({
        color: '#ffb838',
        emissive: '#804d00',
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.35
      })
    );
    this.carriedMesh.position.set(0, 1.12, -0.48);
    this.carriedMesh.visible = false;
    this.bodyPivot.add(this.carriedMesh);

    // Star-Halo cosmetic unlocked in Level 5 side task
    this.starHalo = new THREE.Mesh(
      new THREE.TorusGeometry(0.39, 0.03, 10, 32),
      new THREE.MeshBasicMaterial({ color: '#ffe87c' })
    );
    this.starHalo.rotation.x = Math.PI / 2;
    this.starHalo.position.set(0, 2.06, 0);
    this.starHalo.visible = false;
    this.bodyPivot.add(this.starHalo);

    // 6. Upgrade Gear Visual Attachments (Spiral Geo-Drill + Micro-Gravity Thruster Wings!)
    this._buildUpgradeAttachments(ceramicShellMat, chassisMat, accentMat);
  }

  _buildUpgradeAttachments(shellMat, chassisMat, accentMat) {
    // A. Right-Arm Spiral Geo-Drill & Seismic Sonar Emitter
    this.drillAttachment = new THREE.Group();
    this.drillAttachment.position.set(0, -0.35, 0);
    this.drillAttachment.visible = false;

    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.135, 0.12, 14),
      accentMat
    );
    const sonarRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.13, 0.018, 8, 18),
      new THREE.MeshBasicMaterial({ color: '#66f7ff' })
    );
    sonarRing.rotation.x = Math.PI / 2;
    sonarRing.position.y = 0.03;

    this.drillBitGroup = new THREE.Group();
    this.drillBitGroup.position.y = -0.06;
    const drillMat = new THREE.MeshStandardMaterial({
      color: '#d8e4f2',
      metalness: 0.88,
      roughness: 0.18
    });
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.125, 0.36, 12),
      drillMat
    );
    cone.rotation.x = Math.PI;
    cone.position.y = -0.18;

    // Helical auger spiral ridges around drill cone — merged into 1 draw call
    const fluteEntries = [];
    const fluteTempGeos = [];
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      const fg = new THREE.TorusGeometry(0.11 * (1 - t * 0.52), 0.018, 6, 14);
      fluteTempGeos.push(fg);
      fluteEntries.push({
        geo: fg,
        position: [0, -0.08 - t * 0.2, 0],
        rotation: [Math.PI / 2 + 0.28, 0, 0]
      });
    }
    const mergedFlutes = mergeTransformedGeometries(fluteEntries);
    for (const g of fluteTempGeos) g.dispose();
    if (mergedFlutes) {
      this.drillBitGroup.add(new THREE.Mesh(mergedFlutes, accentMat));
    }
    this.drillBitGroup.add(cone);
    this.drillAttachment.add(collar, sonarRing, this.drillBitGroup);
    this.rightArm.add(this.drillAttachment);

    // B. Backpack Micro-Gravity Thruster Wings & Dual Plasma Nozzles
    this.jetpackRig = new THREE.Group();
    this.jetpackRig.position.set(0, 0.84, -0.52);
    this.jetpackRig.visible = false;

    const wingGlowMat = new THREE.MeshStandardMaterial({
      color: '#6cf7ff',
      emissive: '#00c8ff',
      emissiveIntensity: 2.1,
      roughness: 0.15
    });

    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0.16);
    wingShape.lineTo(0.68, 0.04);
    wingShape.lineTo(0.58, -0.15);
    wingShape.lineTo(0, -0.08);
    wingShape.closePath();
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.045,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2
    });

    this.jetWings = [];
    this.jetPlumes = [];

    for (const side of [-1, 1]) {
      const wPivot = new THREE.Group();
      wPivot.position.set(side * 0.24, 0.05, 0);

      const blade = new THREE.Mesh(wingGeo, shellMat);
      blade.scale.x = side;
      blade.rotation.y = -side * 0.18;
      blade.castShadow = true;

      const ledTrim = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.035, 0.06),
        wingGlowMat
      );
      ledTrim.position.set(side * 0.34, 0.06, 0.02);
      ledTrim.rotation.z = -side * 0.18;

      const thrusterBell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.075, 0.11, 0.22, 12),
        chassisMat
      );
      thrusterBell.position.set(side * 0.12, -0.18, -0.04);
      thrusterBell.rotation.z = side * 0.14;

      // Dual-layer cyan-white jet flame plume
      const plumeGroup = new THREE.Group();
      plumeGroup.position.set(side * 0.14, -0.32, -0.04);
      const outerFlame = new THREE.Mesh(
        new THREE.ConeGeometry(0.095, 0.58, 12, 1, true),
        new THREE.MeshBasicMaterial({
          color: '#3cf0ff',
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      );
      outerFlame.rotation.x = Math.PI;
      outerFlame.position.y = -0.22;
      const innerFlame = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.36, 10),
        new THREE.MeshBasicMaterial({
          color: '#ffffff',
          transparent: true,
          opacity: 0.95,
          depthWrite: false
        })
      );
      innerFlame.rotation.x = Math.PI;
      innerFlame.position.y = -0.14;

      plumeGroup.add(outerFlame, innerFlame);
      plumeGroup.visible = false;

      wPivot.add(blade, ledTrim, thrusterBell, plumeGroup);
      this.jetpackRig.add(wPivot);
      this.jetWings.push(wPivot);
      this.jetPlumes.push(plumeGroup);
    }

    this.bodyPivot.add(this.jetpackRig);
  }

  _buildGuideArrow() {
    this.guideRingMat = new THREE.MeshBasicMaterial({
      color: '#5ce8ff',
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide
    });
    const baseRing = new THREE.Mesh(
      new THREE.RingGeometry(0.88, 0.96, 32),
      this.guideRingMat
    );
    baseRing.rotation.x = -Math.PI / 2;
    baseRing.position.y = 0.08;
    this.guideRig.add(baseRing);

    // Sleek glowing directional chevron arrow pointing forward (+Z in local guideRig space)
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.52);
    arrowShape.lineTo(0.28, 0.05);
    arrowShape.lineTo(0.11, 0.12);
    arrowShape.lineTo(0.11, -0.22);
    arrowShape.lineTo(-0.11, -0.22);
    arrowShape.lineTo(-0.11, 0.12);
    arrowShape.lineTo(-0.28, 0.05);
    arrowShape.closePath();

    const arrowGeo = new THREE.ShapeGeometry(arrowShape);
    arrowGeo.rotateX(-Math.PI / 2);
    // Flip so tip points +Z!
    arrowGeo.rotateY(Math.PI);

    this.guideArrowMat = new THREE.MeshBasicMaterial({
      color: '#5ce8ff',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    });
    this.guideArrowMesh = new THREE.Mesh(arrowGeo, this.guideArrowMat);
    this.guideArrowMesh.position.set(0, 0.12, 1.32);
    this.guideRig.add(this.guideArrowMesh);
    this.guideRig.visible = false;
  }

  _createDetailedWheel(tireMat, accentMat, chassisMat, side) {
    const wheelGroup = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.33, 0.24, 22),
      tireMat
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wheelGroup.add(tire);

    // 8 circumferential rubber tread ribs + hub cap merged into 1 chassis draw call!
    const lugGeo = new THREE.BoxGeometry(0.25, 0.045, 0.065);
    const capGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.28, 12);
    const chassisEntries = [
      { geo: capGeo, position: [side * 0.01, 0, 0], rotation: [0, 0, Math.PI / 2] }
    ];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      chassisEntries.push({
        geo: lugGeo,
        position: [0, Math.cos(a) * 0.325, Math.sin(a) * 0.325],
        rotation: [-a, 0, 0]
      });
    }
    const mergedWheelChassis = mergeTransformedGeometries(chassisEntries);
    lugGeo.dispose();
    capGeo.dispose();
    if (mergedWheelChassis) {
      wheelGroup.add(new THREE.Mesh(mergedWheelChassis, chassisMat));
    }

    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.26, 16),
      accentMat
    );
    rim.rotation.z = Math.PI / 2;
    wheelGroup.add(rim);
    return wheelGroup;
  }

  _createArmWithClaw(shellMat, chassisMat, accentMat) {
    const pivot = new THREE.Group();
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10), accentMat);
    const forearm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.22, 6, 12),
      shellMat
    );
    forearm.position.y = -0.16;
    forearm.castShadow = true;

    // Cute U-shaped helper gripper merged into 1 draw call
    const wristGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10);
    const prongGeo = new THREE.BoxGeometry(0.035, 0.11, 0.06);
    const mergedGripper = mergeTransformedGeometries([
      { geo: wristGeo, position: [0, -0.32, 0] },
      { geo: prongGeo, position: [-0.055, -0.38, 0] },
      { geo: prongGeo, position: [0.055, -0.38, 0] }
    ]);
    wristGeo.dispose();
    prongGeo.dispose();
    if (mergedGripper) {
      pivot.add(new THREE.Mesh(mergedGripper, chassisMat));
    }

    pivot.add(shoulder, forearm);
    return pivot;
  }

  triggerAction(mode, duration = 0.7) {
    this.animMode = mode;
    this.actionTimer = duration;
    if (mode === 'celebrate') {
      this._setMood('celebrate');
    } else if (mode === 'gather' || mode === 'craft' || mode === 'drill') {
      this._setMood('work');
    }
  }

  _setMood(mood) {
    if (this.currentMood !== mood) {
      this.currentMood = mood;
      this.visor.drawMood(this.currentMood, this.isBlinking);
    }
  }

  teleportToHubSafe() {
    this.position.set(4.8, 0, 5.8);
    this.position.y = getTerrainHeight(this.position.x, this.position.z, this.state.isBridgeExtended());
    this.vy = 0;
    this.jetFuel = this.maxJetFuel;
    this.isGrounded = true;
    this.isJetpacking = false;
    this.yaw = Math.PI * 0.85;
    this.group.rotation.z = 0;
    this.syncPositionToMesh();
  }

  getSupportHeightAt(x, z, currentY = this.position.y) {
    const baseTerrainY = getTerrainHeight(x, z, this.state.isBridgeExtended());
    const plat = getElevatedPlatformAt(x, z, -0.12);
    if (plat && currentY >= plat.topY - 0.65) {
      return Math.max(baseTerrainY, plat.topY);
    }
    return baseTerrainY;
  }

  setIntroSleepPose(sleepFactor, moodOverride = null) {
    const f = clamp(sleepFactor, 0, 1);
    this.guideRig.visible = false;
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
    this.group.rotation.z = f * 0.58;
    this.bodyPivot.position.y = (1 - f) * 0.03;
    this.bodyPivot.rotation.x = f * 0.34;
    this.headGroup.rotation.x = f * 0.42;
    this.headGroup.rotation.z = -f * 0.18;
    this.chestLight.material.emissiveIntensity = 0.18 + (1 - f) * 1.82;
    this.antennaBulb.material.emissiveIntensity = 0.22 + (1 - f) * 2.18;

    const targetMood = moodOverride || (f > 0.45 ? 'sleep' : 'happy');
    this._setMood(targetMood);
  }

  clearIntroSleepPose() {
    this._slopePitch = 0;
    this._slopeRoll = 0;
    this.group.rotation.x = 0;
    this.group.rotation.z = 0;
    this.bodyPivot.rotation.x = 0;
    this.headGroup.rotation.x = 0;
    this.headGroup.rotation.z = 0;
    this.chestLight.material.emissiveIntensity = 2.0;
    this.antennaBulb.material.emissiveIntensity = 2.4;
    this._setMood('normal');
    this.syncPositionToMesh();
  }

  setNightHeadlamp(strength = 0) {
    const s = clamp(strength, 0, 1);
    if (this.headlampLight) {
      this.headlampLight.visible = s > 0.01 && this.group.visible;
      this.headlampLight.intensity = s * 3.8;
    }
    if (this.headlampCone) {
      this.headlampCone.visible = s > 0.03 && this.group.visible;
      this.headlampConeMat.uniforms.uStrength.value = s;
    }
  }

  syncPositionToMesh(supportY = this.position.y, dt = 0) {
    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;

    // Align chassis pitch & roll smoothly to desert dune slope so neither wheel clips into sand or floats!
    if (dt > 0) {
      let targetPitch = 0;
      let targetRoll = 0;
      const onPlat = getElevatedPlatformAt(this.position.x, this.position.z, -0.05);
      const isFlatDeck = Boolean(onPlat && this.position.y >= onPlat.topY - 0.35);

      if (this.isGrounded && !isFlatDeck) {
        const bridgeOpen = this.state.isBridgeExtended();
        const sinY = Math.sin(this.yaw);
        const cosY = Math.cos(this.yaw);
        const sampleDist = 0.46;

        const hFront = getTerrainHeight(
          this.position.x + sinY * sampleDist,
          this.position.z + cosY * sampleDist,
          bridgeOpen
        );
        const hBack = getTerrainHeight(
          this.position.x - sinY * sampleDist,
          this.position.z - cosY * sampleDist,
          bridgeOpen
        );
        const hRight = getTerrainHeight(
          this.position.x + cosY * sampleDist,
          this.position.z - sinY * sampleDist,
          bridgeOpen
        );
        const hLeft = getTerrainHeight(
          this.position.x - cosY * sampleDist,
          this.position.z + sinY * sampleDist,
          bridgeOpen
        );

        targetPitch = clamp(-Math.atan2(hFront - hBack, sampleDist * 2), -0.26, 0.26);
        targetRoll = clamp(Math.atan2(hLeft - hRight, sampleDist * 2), -0.24, 0.24);
      }

      this._slopePitch = damp(this._slopePitch, targetPitch, 12, dt);
      this._slopeRoll = damp(this._slopeRoll, targetRoll, 12, dt);
      this.group.rotation.x = this._slopePitch;
      this.group.rotation.z = this._slopeRoll;
    }

    if (this.groundShadowMesh) {
      this.groundShadowMesh.visible = this.group.visible;
      const heightAbove = Math.max(0, this.position.y - supportY);
      const shadowScale = clamp(1.0 - heightAbove * 0.055, 0.42, 1.0);
      this.groundShadowMesh.position.set(this.position.x, supportY + 0.04, this.position.z);
      this.groundShadowMesh.scale.setScalar(shadowScale);
      this.groundShadowMesh.material.opacity = 0.68 * shadowScale;
    }
  }

  update(
    dt,
    elapsed,
    moveInput,
    cameraYaw,
    colliders,
    controlsLocked = false,
    activeWaypoint = null
  ) {
    if (this._gateBumpCooldown > 0) {
      this._gateBumpCooldown -= dt;
    }
    const goldAnt = Boolean(this.state.cosmetics.golden_antenna);
    if (this._lastGoldAnt !== goldAnt) {
      this._lastGoldAnt = goldAnt;
      this.antennaBulb.material.color.set(goldAnt ? '#ffe066' : '#75f8ff');
      this.antennaBulb.material.emissive.set(goldAnt ? '#ffaa00' : '#00d0ff');
    }
    this.starHalo.visible = Boolean(this.state.cosmetics.star_halo);
    if (this.starHalo.visible) {
      this.starHalo.rotation.z = elapsed * 1.5;
    }

    const hasDrill = this.state.hasEquipment('drill');
    const hasJetpack = this.state.hasEquipment('jetpack');
    this.drillAttachment.visible = hasDrill;
    this.jetpackRig.visible = hasJetpack;
    if (hasDrill) {
      this.drillBitGroup.rotation.y += dt * (this.animMode === 'drill' ? 38.0 : 2.2);
    }

    const carriedItem = this.state.getCarriedHighlightItem();
    if (carriedItem) {
      this.carriedMesh.visible = true;
      this.packHoloRing.visible = true;
      if (this._lastCarriedId !== carriedItem.id) {
        this._lastCarriedId = carriedItem.id;
        this.carriedMesh.material.color.set(carriedItem.color);
        this.carriedMesh.material.emissive.set(carriedItem.emissive || '#222222');
      }
      this.carriedMesh.rotation.y = elapsed * 1.8;
      this.carriedMesh.position.y = 1.12 + Math.sin(elapsed * 3.5) * 0.04;
    } else {
      this.carriedMesh.visible = false;
      this.packHoloRing.visible = false;
      this._lastCarriedId = null;
    }

    // Jetpack vertical thrust & stamina management
    const wantsFly = Boolean(!controlsLocked && moveInput.fly && hasJetpack);
    if (this.jetFuel >= 18) {
      this._jetExhausted = false;
    }
    const thrusting = wantsFly && !this._jetExhausted && this.jetFuel > 0.5;
    this.isJetpacking = thrusting;

    let moveMag = 0;
    if (!controlsLocked) {
      const ix = moveInput.x;
      const iz = moveInput.z;
      moveMag = Math.hypot(ix, iz);

      let nextX = this.position.x;
      let nextZ = this.position.z;
      let ridgeBoost = 1.0;

      if (moveMag > 0.01) {
        const nx = ix / moveMag;
        const nz = iz / moveMag;
        const sinY = Math.sin(cameraYaw);
        const cosY = Math.cos(cameraYaw);
        const worldDirX = nx * cosY + nz * sinY;
        const worldDirZ = -nx * sinY + nz * cosY;

        const targetYaw = Math.atan2(worldDirX, worldDirZ);
        let diff = targetYaw - this.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.yaw += diff * Math.min(1, dt * 12);

        const onRidge = this.position.x > 20 && Math.abs(this.position.z) < 16;
        ridgeBoost = onRidge && this.state.isRidgeSpeedBoostActive() ? 1.32 : 1.0;
        const airBoost = !this.isGrounded ? 1.16 : 1.0;
        const maxSpeed = 8.4 * ridgeBoost * airBoost;
        this.speed = damp(this.speed, maxSpeed * Math.min(1, moveMag), 12, dt);

        nextX += worldDirX * this.speed * dt;
        nextZ += worldDirZ * this.speed * dt;
      } else {
        this.speed = damp(this.speed, 0, 14, dt);
      }

      // 3-Pass Iterative Gauss-Seidel Depenetration when moving/airborne, plus 1-pass idle safety check
      // so standing grounded after landing or dynamic barrier state changes never leaves residual overlap!
      const depenPasses = moveMag > 0.01 || !this.isGrounded ? 3 : 1;
      if (depenPasses > 0) {
        const bridgeOpen = this.state.isBridgeExtended();
        const allowBumpFeedback = moveMag > 0.01 || !this.isGrounded;

        for (let iter = 0; iter < depenPasses; iter++) {
          const r = Math.hypot(nextX, nextZ);
          if (r > 84) {
            nextX *= 84 / r;
            nextZ *= 84 / r;
          }

          if (nextX < -38.0 && nextX > -52.0) {
            if (!bridgeOpen) {
              if (this.position.x >= -38.0) nextX = -38.0;
              else nextX = -52.0;
              if (allowBumpFeedback && iter === 0 && this._gateBumpCooldown <= 0) {
                this._gateBumpCooldown = 2.4;
                this.sound.playBarrierBump();
                if (this.onChasmBump) this.onChasmBump();
              }
            } else if (this.isGrounded && Math.abs(nextZ) > 2.75 && this.position.y < 1.5) {
              if (this.position.x >= -38.0) nextX = -38.0;
              else if (this.position.x <= -52.0) nextX = -52.0;
              else nextZ = clamp(nextZ, -2.7, 2.7);
            }
          }

          // Tapered frustum collision against Elevated Sky-Mesa / Basalt Pillars matching exact rock skirt!
          for (const plat of ELEVATED_PLATFORMS) {
            if (this.position.y < plat.topY - 0.55) {
              const baseY = getTerrainHeight(plat.x, plat.z, false);
              const hFrac = clamp(
                (this.position.y - baseY) / Math.max(1.5, plat.topY - baseY),
                0,
                1
              );
              const bottomMult = plat.style === 'basalt' ? 1.24 : 1.26;
              const effPlatRadius = plat.radius * (bottomMult + (1.02 - bottomMult) * hFrac);

              const dx = nextX - plat.x;
              const dz = nextZ - plat.z;
              const minDist = this.radius + effPlatRadius;
              const dSq = dx * dx + dz * dz;
              if (dSq < minDist * minDist) {
                const d = Math.sqrt(dSq) || 0.001;
                const push = minDist - d;
                nextX += (dx / d) * push;
                nextZ += (dz / d) * push;
              }
            }
          }

          for (const col of colliders) {
            if (col.activeFn && !col.activeFn()) continue;
            const isFullHeightBarrier =
              col.id && (col.id.startsWith('gate_') || col.id.startsWith('canyon_cliff_'));
            if (!isFullHeightBarrier && col.minY !== undefined && this.position.y < col.minY) {
              continue;
            }
            if (!isFullHeightBarrier && col.maxY !== undefined && this.position.y > col.maxY) {
              continue;
            }
            if (
              !isFullHeightBarrier &&
              col.minY === undefined &&
              col.maxY === undefined &&
              !col.id?.startsWith('ship_') &&
              this.position.y > getTerrainHeight(col.x, col.z, false) + 3.2
            ) {
              continue;
            }

            const dx = nextX - col.x;
            const dz = nextZ - col.z;
            const minDist = this.radius + col.radius;
            const dSq = dx * dx + dz * dz;
            if (dSq < minDist * minDist) {
              const d = Math.sqrt(dSq) || 0.001;
              const push = minDist - d;
              nextX += (dx / d) * push;
              nextZ += (dz / d) * push;

              if (allowBumpFeedback && iter === 0 && col.id && col.id.startsWith('gate_') && this._gateBumpCooldown <= 0) {
                this._gateBumpCooldown = 2.4;
                this.sound.playBarrierBump();
                if (this.onGateBump) {
                  const baseRegion = col.id.replace(/^gate_/, '').replace(/_p[12]$/, '');
                  this.onGateBump(baseRegion);
                }
              }
            }
          }
        }

        this.position.x = nextX;
        this.position.z = nextZ;
      }

      if (moveMag > 0.01 && this.isGrounded) {
        this.sound.playStep(dt, ridgeBoost);
        if (this.particles && this.speed > 2.5) {
          this._dustAccum += dt * this.speed;
          if (this._dustAccum > 0.65) {
            this._dustAccum = 0;
            this.particles.emitWheelDust(
              this.position.x,
              this.position.y,
              this.position.z,
              this.yaw
            );
          }
        }
      }
    } else {
      this.speed = 0;
    }

    // Vertical Physics: Jetpack Thrust, Gentle Glide Descent, and Sky-Mesa Landing!
    const rawTerrainY = getTerrainHeight(
      this.position.x,
      this.position.z,
      this.state.isBridgeExtended()
    );
    const supportY = this.getSupportHeightAt(
      this.position.x,
      this.position.z,
      this.position.y
    );

    if (thrusting) {
      this.isGrounded = false;
      this.jetFuel = Math.max(0, this.jetFuel - 25 * dt);
      if (this.jetFuel <= 0.6) {
        this._jetExhausted = true;
      }
      const maxFlightCeiling = Math.max(rawTerrainY, 0) + 10.6;
      if (this.position.y < maxFlightCeiling) {
        this.vy = damp(this.vy, 7.8, 9.0, dt);
      } else {
        this.vy = damp(this.vy, 0.0, 10.0, dt);
      }
      this.position.y += this.vy * dt;

      if (this.sound.playJetpackPulse) {
        this.sound.playJetpackPulse(dt);
      }
      if (this.particles && this.particles.emitJetpackTrail) {
        this._jetParticleAccum += dt;
        if (this._jetParticleAccum >= 0.045) {
          this._jetParticleAccum = 0;
          this.particles.emitJetpackTrail(
            this.position.x,
            this.position.y,
            this.position.z,
            this.yaw
          );
        }
      }
    } else if (this.position.y > supportY + 0.08 || this.vy > 0.05) {
      // Airborne gentle glide descent
      this.isGrounded = false;
      this.vy = Math.max(this.vy - 15.0 * dt, -7.2);
      this.position.y += this.vy * dt;
      if (this.position.y <= supportY + 0.04) {
        this.position.y = supportY;
        this.vy = 0;
        this.isGrounded = true;
      }
    } else {
      this.isGrounded = true;
      this.vy = 0;
      if (supportY < -3.2) {
        this.position.set(-36.5, getTerrainHeight(-36.5, 0, false), 0);
      } else {
        this.position.y = damp(this.position.y, supportY, 18, dt);
      }
    }

    if (this.isGrounded && this.jetFuel < this.maxJetFuel) {
      this.jetFuel = Math.min(this.maxJetFuel, this.jetFuel + 58 * dt);
    }

    // Update Jetpack Wing Plumes & Wing Spread Angle
    if (hasJetpack) {
      const wingSpread = !this.isGrounded ? 0.18 : -0.14;
      this.jetWings.forEach((w, idx) => {
        const s = idx === 0 ? -1 : 1;
        w.rotation.z = damp(w.rotation.z, s * wingSpread, 10, dt);
      });
      const showFlame = thrusting || (!this.isGrounded && this.vy > -4.5);
      const flameScale = thrusting
        ? 1.05 + Math.sin(elapsed * 38) * 0.22
        : 0.42;
      for (const pl of this.jetPlumes) {
        pl.visible = showFlame;
        pl.scale.set(1, flameScale, 1);
      }
    }

    this.syncPositionToMesh(Math.max(-1, supportY), controlsLocked ? 0 : dt);

    // Update holographic guide arrow pointing cleanly toward active waypoint
    if (
      activeWaypoint &&
      this.state.settings.guideArrow !== false &&
      this.group.visible &&
      !controlsLocked &&
      activeWaypoint.distMeters >= 3
    ) {
      this.guideRig.visible = true;
      this.guideRig.position.set(this.position.x, this.position.y, this.position.z);
      const angle = Math.atan2(
        activeWaypoint.x - this.position.x,
        activeWaypoint.z - this.position.z
      );
      this.guideRig.rotation.y = angle;
      this.guideArrowMesh.position.z = 1.28 + Math.sin(elapsed * 5.0) * 0.12;
      const gCol = activeWaypoint.color || '#5ce8ff';
      if (this._lastGuideCol !== gCol) {
        this._lastGuideCol = gCol;
        this.guideArrowMat.color.set(gCol);
        this.guideRingMat.color.set(gCol);
      }
    } else {
      this.guideRig.visible = false;
    }

    this._updateAnimations(dt, elapsed, moveMag > 0.02, Boolean(carriedItem));
  }

  _updateAnimations(dt, elapsed, isMoving, isCarrying) {
    this.blinkTimer -= dt;
    if (!this.isBlinking && this.blinkTimer <= 0) {
      this.isBlinking = true;
      this.blinkTimer = 0.13;
      this.visor.drawMood(this.currentMood, true);
    } else if (this.isBlinking && this.blinkTimer <= 0) {
      this.isBlinking = false;
      this.blinkTimer = 2.4 + Math.random() * 2.5;
      this.visor.drawMood(this.currentMood, false);
    }

    if (this.actionTimer > 0) {
      this.actionTimer -= dt;
      if (this.actionTimer <= 0) {
        this.animMode = isMoving ? 'move' : 'idle';
        this._setMood('normal');
      }
    } else {
      this.animMode = isMoving ? 'move' : 'idle';
      if (this.currentMood !== 'normal') this._setMood('normal');
    }

    const spin = this.speed * dt * 2.8;
    this.leftWheel.rotation.x += spin;
    this.rightWheel.rotation.x += spin;

    if (this.animMode === 'celebrate') {
      this.bodyPivot.position.y = Math.abs(Math.sin(elapsed * 11)) * 0.34;
      this.bodyPivot.rotation.x = 0;
      this.headGroup.rotation.z = Math.sin(elapsed * 10) * 0.16;
      this.leftArm.rotation.x = -Math.PI * 0.82 + Math.sin(elapsed * 14) * 0.25;
      this.rightArm.rotation.x = -Math.PI * 0.82 - Math.sin(elapsed * 14) * 0.25;
    } else if (this.animMode === 'drill') {
      // Energetic seismic subsurface drilling stance!
      this.bodyPivot.position.y = -0.06 + Math.sin(elapsed * 46) * 0.04;
      this.bodyPivot.rotation.x = 0.34;
      this.headGroup.rotation.x = 0.24;
      this.leftArm.rotation.x = 0.35;
      this.rightArm.rotation.x = -0.32;
    } else if (!this.isGrounded) {
      // Supercar / Astro-Bot heroic aerial flight pose!
      this.bodyPivot.position.y = 0.06 + Math.sin(elapsed * 8) * 0.03;
      this.bodyPivot.rotation.x = 0.22;
      this.headGroup.rotation.x = -0.14;
      this.headGroup.rotation.z = 0;
      this.leftArm.rotation.x = 0.48;
      this.rightArm.rotation.x = 0.48;
      this.antennaPivot.rotation.x = -0.35;
    } else if (this.animMode === 'gather' || this.animMode === 'craft') {
      this.bodyPivot.position.y = Math.sin(elapsed * 16) * 0.04;
      this.bodyPivot.rotation.x = 0.22;
      this.headGroup.rotation.x = 0.18;
      this.leftArm.rotation.x = -1.05 + Math.sin(elapsed * 18) * 0.45;
      this.rightArm.rotation.x = -1.05 - Math.sin(elapsed * 18) * 0.45;
    } else if (this.animMode === 'move') {
      this.bodyPivot.position.y = Math.abs(Math.sin(elapsed * 10)) * 0.055;
      this.bodyPivot.rotation.x = 0.11;
      this.headGroup.rotation.z = Math.sin(elapsed * 5) * 0.05;
      this.headGroup.rotation.x = -0.05;
      if (isCarrying) {
        this.leftArm.rotation.x = 0.35 + Math.sin(elapsed * 9) * 0.12;
        this.rightArm.rotation.x = 0.35 - Math.sin(elapsed * 9) * 0.12;
      } else {
        this.leftArm.rotation.x = Math.sin(elapsed * 10) * 0.42;
        this.rightArm.rotation.x = -Math.sin(elapsed * 10) * 0.42;
      }
      this.antennaPivot.rotation.x = -0.22 + Math.sin(elapsed * 12) * 0.1;
    } else {
      this.bodyPivot.position.y = Math.sin(elapsed * 2.4) * 0.035;
      this.bodyPivot.rotation.x = damp(this.bodyPivot.rotation.x, 0, 8, dt);
      this.headGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.07;
      this.headGroup.rotation.x = Math.sin(elapsed * 1.9) * 0.04;
      this.leftArm.rotation.x = damp(this.leftArm.rotation.x, isCarrying ? 0.22 : 0, 8, dt);
      this.rightArm.rotation.x = damp(this.rightArm.rotation.x, isCarrying ? 0.22 : 0, 8, dt);
      this.antennaPivot.rotation.x = Math.sin(elapsed * 3.0) * 0.06;
    }
  }
}
