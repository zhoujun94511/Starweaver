import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CREW_LOGS,
  ELEVATED_PLATFORMS,
  MATERIALS,
  REGIONS,
  RESOURCE_NODES,
  WORLD_FACILITIES
} from '../data/gameData.js';
import {
  createFloatingBadgeTexture,
  createGlowSpriteTexture,
  createHazardStripeTexture,
  createMetalHullPBR,
  createRockPBRTextures,
  createSandPBRTextures,
  createSignpostTexture,
  createSoftAOShadowTexture
} from '../graphics/textures.js';
import { createSkyDome } from '../graphics/skyDome.js';
import {
  createAlienAgaveGeometry,
  createBasaltClusterGeometry,
  createHexCrystalGeometry,
  createHostRockOutcropGeometry,
  createSandstoneArchGeometry,
  createSculptedBoulderGeometry,
  createStratifiedMesaGeometry
} from '../graphics/proceduralMeshes.js';
import { fbm2D, getTerrainHeight, mulberry32, smoothstep, clamp } from '../utils/math.js';
import { mergeTransformedGeometries } from '../utils/geometryBatcher.js';

export class WorldBuilder {
  constructor(scene, state) {
    this.scene = scene;
    this.state = state;

    this.groups = {
      static: new THREE.Group(),
      dynamic: new THREE.Group(),
      resources: new THREE.Group(),
      effects: new THREE.Group()
    };
    this.groups.static.name = 'level-static';
    this.groups.dynamic.name = 'level-dynamic';
    this.groups.resources.name = 'resources';
    this.groups.effects.name = 'effects';

    this.scene.add(
      this.groups.static,
      this.groups.dynamic,
      this.groups.resources,
      this.groups.effects
    );

    this.colliders = [];
    this.resourceVisuals = new Map();
    this.gateBarriers = new Map();
    this.pylonVisuals = new Map();
    this.cairnVisuals = new Map();
    this.logVisuals = new Map();
    this.bridgeMesh = null;
    this.bridgeUniforms = null;
    this.observatoryDishTop = null;
    this.furnaceCoreMesh = null;
    this.fabricatorArm = null;
    this.fabricatorLaser = null;
    this.purifierRing = null;
    this.selectionRing = null;
    this.dustPoints = null;
    this.signpostTextures = [];
    this.stationBadges = [];
    this.waypointBeacon = null;
    this.sonarWaveMesh = null;
    this.sonarWaveTimer = 0;
    this.windRibbons = [];
    this._lastLang = null;
    this._staticAoEntries = [];
    this.furnaceLight = null;
    this._sunOffset = new THREE.Vector3(42, 64, 28);
    this._lastShadowFocusX = NaN;
    this._lastShadowFocusZ = NaN;
    this._shadowRefreshCooldown = 0;
    this._shadowDirty = true;

    const sandPBR = createSandPBRTextures(256);
    const rockPBR = createRockPBRTextures(128);
    const metalPBR = createMetalHullPBR(256);

    this.textures = {
      sandMap: sandPBR.map,
      sandNormal: sandPBR.normalMap,
      sandRoughness: sandPBR.roughnessMap,
      rockMap: rockPBR.map,
      rockNormal: rockPBR.normalMap,
      metalMap: metalPBR.map,
      metalNormal: metalPBR.normalMap,
      hazard: createHazardStripeTexture(),
      glowSprite: createGlowSpriteTexture(128, '#fffdf5', '#ffcb80'),
      aoShadow: createSoftAOShadowTexture(128)
    };
    this.aoShadowMat = new THREE.MeshBasicMaterial({
      map: this.textures.aoShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.72
    });

    this.skyDome = createSkyDome();
    this.scene.add(this.skyDome.group);

    this._setupLightingAndSky();
    this._buildTerrain();
    this._buildDistantHorizonMesas();
    this._buildElevatedSkyPlatforms();
    this._buildInstancedScenery();
    this._buildStations();
    this._buildRegionRoutesAndSignposts();
    this._buildRegionGates();
    this._buildRelayBridgeAndPylons();
    this._buildOutpostAndVentLandmarks();
    this._buildCrewLogs();
    this._buildResourceNodes();
    this._flushStaticBatches();
    this._buildDustAndSelectionEffects();
  }

  _setupLightingAndSky() {
    this.scene.background = new THREE.Color('#edc095');
    this.scene.fog = new THREE.FogExp2('#edc095', 0.0034);

    // Balanced warm sunlight + cool azure sky bounce + warm sand ground bounce
    this.hemiLight = new THREE.HemisphereLight('#d8ecff', '#b86d43', 0.72);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff1d6', 2.05);
    this.sunLight.position.copy(this._sunOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1536, 1536);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 165;
    // Tight 36m radius shadow frustum centered around Milo (snapped to texel grid to prevent shimmer!)
    const d = 36;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle cool rim directional light from opposite horizon for 3D form separation
    const rimLight = new THREE.DirectionalLight('#7cc8ff', 0.42);
    rimLight.position.set(-45, 26, -38);
    this.scene.add(rimLight);

    // Twin alien suns with soft glowing corona sprites
    const sunPos = new THREE.Vector3(115, 98, 68);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(5.8, 24, 20),
      new THREE.MeshBasicMaterial({ color: '#fffbe8', fog: false })
    );
    sunDisc.position.copy(sunPos);
    const sunHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.textures.glowSprite,
        color: '#ffdf9e',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        fog: false,
        depthWrite: false
      })
    );
    sunHalo.position.copy(sunPos);
    sunHalo.scale.set(38, 38, 1);
    this.groups.static.add(sunDisc, sunHalo);

    const moonPos = new THREE.Vector3(84, 76, 98);
    const companionMoon = new THREE.Mesh(
      new THREE.SphereGeometry(3.1, 20, 18),
      new THREE.MeshStandardMaterial({
        color: '#ffd7ba',
        emissive: '#995233',
        emissiveIntensity: 0.6,
        fog: false
      })
    );
    companionMoon.position.copy(moonPos);
    this.groups.static.add(companionMoon);
  }

  isCoarseMobileDevice() {
    if (typeof window === 'undefined') return false;
    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const maxTouch =
      typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0;
    const touchScreen =
      coarse ||
      (('ontouchstart' in window || maxTouch) &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024);
    return Boolean(touchScreen);
  }

  syncPixelRatio(quality, renderer) {
    const nativeDpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const isMobile = this.isCoarseMobileDevice();

    // Mobile 2.0x DPR on 390-430px screens = ~780x1688 (exceeds 326 PPI true Retina threshold!)
    // while cutting pixel fill & thermal dissipation by 36% compared to 2.5x!
    if (quality === 'low') {
      renderer.setPixelRatio(1.0);
    } else if (quality === 'medium') {
      renderer.setPixelRatio(Math.min(nativeDpr, isMobile ? 1.45 : 1.5));
    } else {
      renderer.setPixelRatio(Math.min(nativeDpr, isMobile ? 2.0 : 2.5));
    }
  }

  markShadowDirty() {
    this._shadowDirty = true;
  }

  applyQuality(quality, renderer) {
    const isMobile = this.isCoarseMobileDevice();
    this.syncPixelRatio(quality, renderer);
    const hwAniso = renderer.capabilities
      ? renderer.capabilities.getMaxAnisotropy() || 1
      : 1;
    const maxAniso =
      quality === 'low'
        ? 1
        : Math.min(isMobile ? 4 : 8, hwAniso);

    for (const tex of [
      this.textures.sandMap,
      this.textures.sandNormal,
      this.textures.rockMap,
      this.textures.rockNormal,
      this.textures.metalMap,
      this.textures.metalNormal
    ]) {
      if (tex && tex.anisotropy !== maxAniso) {
        tex.anisotropy = maxAniso;
        tex.needsUpdate = true;
      }
    }

    if (quality === 'low') {
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      this.sunLight.castShadow = false;
      if (this.dustPoints) this.dustPoints.visible = false;
    } else if (quality === 'medium') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
      // PCFShadowMap (4-tap) on mobile vs 9-tap PCFSoftShadowMap cuts fragment shadow sampling by >55%!
      renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      this.sunLight.castShadow = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
      this._shadowDirty = true;
      if (this.dustPoints) this.dustPoints.visible = true;
    } else {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      this.sunLight.castShadow = true;
      const hiMap = isMobile ? 1024 : 2048;
      this.sunLight.shadow.mapSize.set(hiMap, hiMap);
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
      this._shadowDirty = true;
      if (this.dustPoints) this.dustPoints.visible = true;
    }
  }

  updateShadowFollow(dt, focusPos, renderer, forceEveryFrame = false) {
    if (!renderer || !renderer.shadowMap.enabled || !this.sunLight.castShadow) return;

    const fx = focusPos ? focusPos.x : 0;
    const fz = focusPos ? focusPos.z : 0;
    // Snap shadow camera target to 2.0m grid steps to prevent sub-texel shadow edge swimming!
    const snapX = Math.round(fx * 0.5) * 2.0;
    const snapZ = Math.round(fz * 0.5) * 2.0;

    if (snapX !== this._lastShadowFocusX || snapZ !== this._lastShadowFocusZ) {
      this._lastShadowFocusX = snapX;
      this._lastShadowFocusZ = snapZ;
      this.sunLight.target.position.set(snapX, 0, snapZ);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.position.set(
        snapX + this._sunOffset.x,
        this._sunOffset.y,
        snapZ + this._sunOffset.z
      );
      this._shadowDirty = true;
    }

    if (forceEveryFrame) {
      renderer.shadowMap.needsUpdate = true;
      this._shadowDirty = false;
      return;
    }

    // Throttle shadow map rasterization: refresh immediately when dirty or when Milo is moving (~20Hz),
    // and completely skip shadow map re-rendering when Milo stands still in an idle scene!
    this._shadowRefreshCooldown -= dt;
    const moved =
      focusPos &&
      (Math.abs(fx - (this._prevRawX ?? fx)) > 0.015 ||
        Math.abs(fz - (this._prevRawZ ?? fz)) > 0.015 ||
        Math.abs((focusPos.y || 0) - (this._prevRawY ?? 0)) > 0.02);

    if (focusPos) {
      this._prevRawX = fx;
      this._prevRawY = focusPos.y || 0;
      this._prevRawZ = fz;
    }

    const isMobile = this.isCoarseMobileDevice();
    const minInterval = isMobile ? 0.05 : 0.03; // ~20Hz shadow refresh on mobile, ~33Hz on desktop while moving

    if (this._shadowDirty || (moved && this._shadowRefreshCooldown <= 0)) {
      renderer.shadowMap.needsUpdate = true;
      this._shadowDirty = false;
      this._shadowRefreshCooldown = minInterval;
    }
  }

  _buildTerrain() {
    const size = 230;
    const segs = 256;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const cSand = new THREE.Color('#e6b07c');
    const cCrest = new THREE.Color('#f5c998');
    const cRidge = new THREE.Color('#d99264');
    const cCanyon = new THREE.Color('#b55f45');
    const cGorge = new THREE.Color('#9c86a3');
    const cBasalt = new THREE.Color('#66566b');
    const cChasm = new THREE.Color('#2b2030');
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainHeight(x, z, false);
      pos.setY(i, y);

      // Macro cloud-shadow & mineral patch variation in vertex color to break up flat expanses
      const macroPatch = fbm2D(x * 0.022 + 5.1, z * 0.022 - 8.4, 3);
      tmp.copy(cSand).lerp(cCrest, clamp((y + 0.5) / 3.5, 0, 0.55));
      tmp.multiplyScalar(0.88 + macroPatch * 0.22);
      if (x > 20) {
        tmp.lerp(cRidge, smoothstep(20, 48, x));
      }
      if (z > 20) {
        tmp.lerp(cCanyon, smoothstep(20, 44, z));
      }
      if (x < -20) {
        tmp.lerp(cGorge, smoothstep(-20, -45, x));
        if (y < -2.0) tmp.lerp(cChasm, clamp((-y - 2) / 6, 0, 1));
      }
      if (z < -20) {
        tmp.lerp(cBasalt, smoothstep(-20, -45, z));
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const isMobileTerrain = this.isCoarseMobileDevice();
    const mat = new THREE.MeshStandardMaterial({
      map: this.textures.sandMap,
      normalMap: this.textures.sandNormal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughnessMap: isMobileTerrain ? null : this.textures.sandRoughness,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.03
    });

    // Dual-scale rotated UV sampling in shader to completely eliminate repetitive grid tiling!
    // On mobile GPUs, keep dual-scale Albedo to break tiling while using single-tap Normal map (-40% terrain texture bandwidth!)
    mat.customProgramCacheKey = () =>
      isMobileTerrain ? 'terrain_sand_mobile' : 'terrain_sand_desktop';
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
          vec2 uvA = vMapUv;
          vec2 uvB = mat2(0.80, -0.60, 0.60, 0.80) * (vMapUv * 0.37) + vec2(0.17, 0.43);
          vec4 sampA = texture2D(map, uvA);
          vec4 sampB = texture2D(map, uvB);
          diffuseColor *= mix(sampA, sampB, 0.48);
        #endif
        `
      );
      if (!isMobileTerrain) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_maps>',
          `
          #ifdef USE_NORMALMAP_TANGENTSPACE
            vec2 nUvA = vNormalMapUv;
            vec2 nUvB = mat2(0.80, -0.60, 0.60, 0.80) * (vNormalMapUv * 0.37) + vec2(0.17, 0.43);
            vec3 mapN1 = texture2D(normalMap, nUvA).xyz * 2.0 - 1.0;
            vec3 mapN2 = texture2D(normalMap, nUvB).xyz * 2.0 - 1.0;
            vec3 mapN = normalize(mix(mapN1, mapN2, 0.48));
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
          #endif
          `
        );
      }
    };

    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    this.groups.static.add(terrain);
  }

  _buildDistantHorizonMesas() {
    // 1. Sculpted Stratified Desert Mesas & Canyon Cliff Walls with baked gully AO vertex colors!
    const rand = mulberry32(772211);
    const mesaMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      normalScale: new THREE.Vector2(1.25, 1.25),
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.04
    });

    // Pre-sculpt 5 distinct geological mesa archetypes to share cleanly across horizon & canyon walls
    const mesaArchetypes = [
      createStratifiedMesaGeometry(6.2, 13.5, 22, 101),
      createStratifiedMesaGeometry(8.5, 16.2, 18, 202),
      createStratifiedMesaGeometry(4.8, 11.4, 27, 303),
      createStratifiedMesaGeometry(9.4, 17.8, 24, 404),
      createStratifiedMesaGeometry(5.6, 12.8, 20, 505)
    ];

    // Outer 360° horizon ring of multi-tiered buttes & spires — Instanced by archetype (48 meshes -> 5 draw calls!)
    const horizonBuckets = mesaArchetypes.map(() => []);
    const count = 32;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.1;
      const dist = 92 + rand() * 34;
      const mx = Math.cos(a) * dist;
      const mz = Math.sin(a) * dist;
      const archIdx = i % mesaArchetypes.length;

      const sx = 0.85 + rand() * 0.65;
      const sy = 0.8 + rand() * 0.72;
      const sz = 0.85 + rand() * 0.65;
      horizonBuckets[archIdx].push({
        x: mx,
        y: -1.2,
        z: mz,
        rotY: rand() * Math.PI * 2,
        sx,
        sy,
        sz
      });

      // Secondary shoulder spire on ~50% of mesas for dramatic asymmetric skyline!
      if (i % 2 === 0) {
        const subIdx = (i + 2) % mesaArchetypes.length;
        horizonBuckets[subIdx].push({
          x: mx + (rand() - 0.5) * 14,
          y: -1.5,
          z: mz + (rand() - 0.5) * 14,
          rotY: rand() * Math.PI * 2,
          sx: sx * 0.62,
          sy: sy * 1.24,
          sz: sz * 0.62
        });
      }
    }

    const dummy = new THREE.Object3D();
    horizonBuckets.forEach((list, idx) => {
      if (list.length === 0) return;
      const inst = new THREE.InstancedMesh(mesaArchetypes[idx], mesaMat, list.length);
      list.forEach((item, k) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.rotY, 0);
        dummy.scale.set(item.sx, item.sy, item.sz);
        dummy.updateMatrix();
        inst.setMatrixAt(k, dummy.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
      this.groups.static.add(inst);
    });

    // 2. Mid-ground Sculpted Canyon Cliff Walls + 2 Sandstone Archways — Merged into 1 static shadow-casting Mesh!
    const canyonWalls = [
      // South Dry Canyon left & right red-rock walls (corridor x in [-12, 12] stays wide open)
      { x: -23.5, z: 34.0, sx: 0.72, sy: 0.58, sz: 0.95, rot: 0.4, archIdx: 0 },
      { x: 23.5, z: 36.5, sx: 0.75, sy: 0.62, sz: 0.92, rot: 2.1, archIdx: 1 },
      { x: -24.5, z: 51.0, sx: 0.82, sy: 0.68, sz: 1.05, rot: 1.3, archIdx: 2 },
      { x: 24.0, z: 53.5, sx: 0.78, sy: 0.64, sz: 0.98, rot: 3.8, archIdx: 3 },
      // East Whispering Ridge scenic canyon bluffs (corridor z in [-10, 10] stays wide open)
      { x: 38.0, z: -21.5, sx: 0.72, sy: 0.56, sz: 0.78, rot: 0.9, archIdx: 4 },
      { x: 52.0, z: 22.0, sx: 0.76, sy: 0.62, sz: 0.82, rot: 2.6, archIdx: 0 }
    ];
    const shadowMesaEntries = [];
    for (const cw of canyonWalls) {
      const wy = getTerrainHeight(cw.x, cw.z, false) - 1.4;
      shadowMesaEntries.push({
        geo: mesaArchetypes[cw.archIdx],
        position: [cw.x, wy, cw.z],
        rotation: [0, cw.rot, 0],
        scale: [cw.sx, cw.sy, cw.sz]
      });
      this.colliders.push({
        id: `canyon_cliff_${cw.x}_${cw.z}`,
        x: cw.x,
        z: cw.z,
        radius: 8.2 * Math.max(cw.sx, cw.sz)
      });
    }

    // 3. Dramatic Natural Wind-Carved Sandstone Archways spanning East & South Route Gateways!
    const eastArchGeo = createSandstoneArchGeometry(15.2, 8.6, 2.0, 811);
    const eastY = getTerrainHeight(26.5, 0, false);
    shadowMesaEntries.push({
      geo: eastArchGeo,
      position: [26.5, eastY - 0.5, 0],
      rotation: [0, Math.PI / 2, 0]
    });
    // Arch pier colliders at z = ±7.6 (middle corridor z in [-5, 5] is completely open!)
    this.colliders.push(
      { id: 'east_arch_pier_n', x: 26.5, z: -7.6, radius: 1.85 },
      { id: 'east_arch_pier_s', x: 26.5, z: 7.6, radius: 1.85 }
    );

    const southArchGeo = createSandstoneArchGeometry(16.0, 9.2, 2.15, 922);
    const southY = getTerrainHeight(0, 27.5, false);
    shadowMesaEntries.push({
      geo: southArchGeo,
      position: [0, southY - 0.5, 27.5]
    });
    this.colliders.push(
      { id: 'south_arch_pier_w', x: -8.0, z: 27.5, radius: 1.9 },
      { id: 'south_arch_pier_e', x: 8.0, z: 27.5, radius: 1.9 }
    );

    const mergedCanyonAndArches = mergeTransformedGeometries(shadowMesaEntries);
    eastArchGeo.dispose();
    southArchGeo.dispose();
    if (mergedCanyonAndArches) {
      const cliffBatchMesh = new THREE.Mesh(mergedCanyonAndArches, mesaMat);
      cliffBatchMesh.castShadow = true;
      cliffBatchMesh.receiveShadow = true;
      this.groups.static.add(cliffBatchMesh);
    }
  }

  _buildElevatedSkyPlatforms() {
    const sandstoneMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      normalScale: new THREE.Vector2(1.15, 1.15),
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.05
    });
    const basaltMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      color: '#5a4d66',
      roughness: 0.76,
      metalness: 0.16
    });
    const capSandMat = new THREE.MeshStandardMaterial({
      map: this.textures.sandMap,
      normalMap: this.textures.sandNormal,
      color: '#dfa476',
      roughness: 0.88
    });
    const capBasaltMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      color: '#6e5f7d',
      roughness: 0.72,
      metalness: 0.18
    });

    const basaltEntries = [];
    const sandstoneEntries = [];
    const capBasaltEntries = [];
    const capSandEntries = [];
    const rimPinkEntries = [];
    const rimCyanEntries = [];
    const tempGeos = [];

    ELEVATED_PLATFORMS.forEach((plat, idx) => {
      const groundY = getTerrainHeight(plat.x, plat.z, false);
      const baseBottomY = groundY - 1.0;
      const colHeight = Math.max(2.5, plat.topY - baseBottomY);

      if (plat.style === 'basalt') {
        const shaftGeo = new THREE.CylinderGeometry(plat.radius * 0.98, plat.radius * 1.12, colHeight, 8);
        tempGeos.push(shaftGeo);
        basaltEntries.push({
          geo: shaftGeo,
          position: [plat.x, baseBottomY + colHeight * 0.5, plat.z]
        });

        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + idx * 0.5;
          const ribH = colHeight * (0.48 + (k % 3) * 0.16);
          const ribGeo = new THREE.CylinderGeometry(0.85, 0.95, ribH, 6);
          tempGeos.push(ribGeo);
          basaltEntries.push({
            geo: ribGeo,
            position: [
              plat.x + Math.cos(a) * (plat.radius * 0.88),
              baseBottomY + ribH * 0.5,
              plat.z + Math.sin(a) * (plat.radius * 0.88)
            ]
          });
        }

        const deckGeo = new THREE.CylinderGeometry(plat.radius, plat.radius * 1.02, 0.24, 16);
        tempGeos.push(deckGeo);
        capBasaltEntries.push({
          geo: deckGeo,
          position: [plat.x, plat.topY - 0.12, plat.z]
        });
      } else {
        const spireGeo = createStratifiedMesaGeometry(
          plat.radius * 0.86,
          plat.radius * 1.22,
          colHeight,
          710 + idx * 37
        );
        tempGeos.push(spireGeo);
        sandstoneEntries.push({
          geo: spireGeo,
          position: [plat.x, baseBottomY, plat.z]
        });

        const deckGeo = new THREE.CylinderGeometry(plat.radius, plat.radius * 1.03, 0.26, 28);
        tempGeos.push(deckGeo);
        capSandEntries.push({
          geo: deckGeo,
          position: [plat.x, plat.topY - 0.13, plat.z]
        });
      }

      const ringGeo = new THREE.RingGeometry(plat.radius - 0.28, plat.radius - 0.12, 36);
      tempGeos.push(ringGeo);
      const targetRim = plat.style === 'basalt' ? rimPinkEntries : rimCyanEntries;
      targetRim.push({
        geo: ringGeo,
        position: [plat.x, plat.topY + 0.02, plat.z],
        rotation: [-Math.PI / 2, 0, 0]
      });
    });

    const addBatch = (entries, mat, castShadow, receiveShadow) => {
      const merged = mergeTransformedGeometries(entries);
      if (!merged) return;
      const m = new THREE.Mesh(merged, mat);
      m.castShadow = castShadow;
      m.receiveShadow = receiveShadow;
      this.groups.static.add(m);
    };

    addBatch(basaltEntries, basaltMat, true, true);
    addBatch(sandstoneEntries, sandstoneMat, true, true);
    addBatch(capBasaltEntries, capBasaltMat, false, true);
    addBatch(capSandEntries, capSandMat, false, true);
    addBatch(
      rimPinkEntries,
      new THREE.MeshBasicMaterial({
        color: '#ff78d8',
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide
      }),
      false,
      false
    );
    addBatch(
      rimCyanEntries,
      new THREE.MeshBasicMaterial({
        color: '#6cf7ff',
        transparent: true,
        opacity: 0.52,
        side: THREE.DoubleSide
      }),
      false,
      false
    );

    for (const g of tempGeos) g.dispose();
  }

  _buildInstancedScenery() {
    const rand = mulberry32(20261111);

    // 3 distinct sculpted faceted rock archetypes (zero smooth potato spheres!)
    const boulderGeos = [
      createSculptedBoulderGeometry(101, 'craggy'),
      createSculptedBoulderGeometry(205, 'slab'),
      createSculptedBoulderGeometry(309, 'hoodoo')
    ];
    const rockMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      normalScale: new THREE.Vector2(0.95, 0.95),
      vertexColors: true,
      color: '#d99a73',
      roughness: 0.86,
      metalness: 0.05
    });

    const buckets = [[], [], []];
    const floraPlacements = [];

    for (let i = 0; i < 165; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 16 + rand() * 70;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (Math.hypot(x, z) < 15.5) continue;
      if (Math.abs(z) < 5.6 && Math.abs(x) < 76) continue;
      if (Math.abs(x) < 5.6 && Math.abs(z) < 72) continue;
      if (x < -37 && x > -53) continue;

      let nearNode = false;
      for (const n of RESOURCE_NODES) {
        if (Math.hypot(x - n.x, z - n.z) < 3.8) {
          nearNode = true;
          break;
        }
      }
      if (nearNode) continue;

      const scaleXZ = 0.8 + rand() * 1.65;
      const scaleY = 0.65 + rand() * 1.45;
      const y = getTerrainHeight(x, z, false);

      // Choose rock archetype based on biome + randomness
      let typeIdx = i % 3;
      if (x > 22 && rand() < 0.55) typeIdx = 2; // More wind-carved hoodoos on Whispering Ridge!
      else if (z > 22 && rand() < 0.55) typeIdx = 1; // More tilted sedimentary slabs in Dry Canyon!

      buckets[typeIdx].push({
        id: i,
        x,
        y: y + scaleY * 0.22,
        z,
        scaleXZ,
        scaleY,
        rotX: (rand() - 0.5) * 0.18,
        rotY: rand() * Math.PI * 2,
        rotZ: (rand() - 0.5) * 0.18
      });

      // Rosette Alien Agave succulents beside rocks
      if (rand() < 0.42 && scaleXZ < 1.65) {
        const fx = x + (rand() > 0.5 ? 1 : -1) * (scaleXZ * 0.88 + 0.48);
        const fz = z + (rand() - 0.5) * 0.85;
        floraPlacements.push({
          x: fx,
          y: getTerrainHeight(fx, fz, false) - 0.04,
          z: fz,
          s: 0.48 + rand() * 0.42,
          rotY: rand() * Math.PI * 2
        });
      }
    }

    const dummy = new THREE.Object3D();
    buckets.forEach((list, bIdx) => {
      if (list.length === 0) return;
      const inst = new THREE.InstancedMesh(boulderGeos[bIdx], rockMat, list.length);
      inst.castShadow = true;
      inst.receiveShadow = true;

      list.forEach((p, idx) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rotX, p.rotY, p.rotZ);
        dummy.scale.set(p.scaleXZ, p.scaleY, p.scaleXZ);
        dummy.updateMatrix();
        inst.setMatrixAt(idx, dummy.matrix);

        if (p.scaleXZ >= 1.05) {
          this.colliders.push({
            id: `rock_${bIdx}_${p.id}`,
            x: p.x,
            z: p.z,
            radius: p.scaleXZ * 0.76
          });
        }
      });
      inst.instanceMatrix.needsUpdate = true;
      this.groups.static.add(inst);
    });

    if (floraPlacements.length > 0) {
      const agaveGeo = createAlienAgaveGeometry();
      const agaveMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.55,
        metalness: 0.06
      });
      const instancedFlora = new THREE.InstancedMesh(
        agaveGeo,
        agaveMat,
        floraPlacements.length
      );
      instancedFlora.castShadow = false;
      instancedFlora.receiveShadow = true;
      floraPlacements.forEach((fp, idx) => {
        dummy.position.set(fp.x, fp.y, fp.z);
        dummy.rotation.set(0, fp.rotY, 0);
        dummy.scale.set(fp.s, fp.s, fp.s);
        dummy.updateMatrix();
        instancedFlora.setMatrixAt(idx, dummy.matrix);
      });
      instancedFlora.instanceMatrix.needsUpdate = true;
      this.groups.static.add(instancedFlora);
    }
  }

  _buildStations() {
    const steelMat = new THREE.MeshStandardMaterial({
      map: this.textures.metalMap,
      normalMap: this.textures.metalNormal,
      color: '#526075',
      roughness: 0.42,
      metalness: 0.68
    });
    const darkIronMat = new THREE.MeshStandardMaterial({
      color: '#262f3d',
      roughness: 0.5,
      metalness: 0.72
    });
    const copperMat = new THREE.MeshStandardMaterial({
      color: '#de8142',
      roughness: 0.26,
      metalness: 0.85
    });

    // 1. Detailed Solar Smelting Furnace (East-side of Hub)
    const fCfg = WORLD_FACILITIES.furnace;
    const fGroup = new THREE.Group();
    const fy = getTerrainHeight(fCfg.x, fCfg.z, false);
    fGroup.position.set(fCfg.x, fy, fCfg.z);

    this._staticAoEntries.push({
      w: 4.6,
      h: 4.6,
      x: fCfg.x,
      y: fy + 0.03,
      z: fCfg.z
    });

    const fIronGeos = [];
    const plinthGeo = new THREE.CylinderGeometry(1.62, 1.82, 0.38, 16);
    const hearthGeo = new RoundedBoxGeometry(1.05, 0.92, 0.42, 3, 0.08);
    fIronGeos.push(plinthGeo, hearthGeo);
    const mergedFurnaceIron = mergeTransformedGeometries([
      { geo: plinthGeo, position: [0, 0.19, 0] },
      { geo: hearthGeo, position: [0, 1.08, 0.85] }
    ]);
    for (const g of fIronGeos) g.dispose();
    if (mergedFurnaceIron) {
      const fIronMesh = new THREE.Mesh(mergedFurnaceIron, darkIronMat);
      fIronMesh.castShadow = true;
      fIronMesh.receiveShadow = true;
      fGroup.add(fIronMesh);
    }

    // Kiln chamber with armor ribs
    const kiln = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.28, 1.72, 16), steelMat);
    kiln.position.y = 1.22;
    kiln.castShadow = true;
    fGroup.add(kiln);

    const bandGeo = new THREE.TorusGeometry(1.18, 0.065, 10, 24);
    const pipeGeo = new THREE.CylinderGeometry(0.11, 0.11, 1.35, 10);
    const chimneyGeo = new THREE.CylinderGeometry(0.38, 0.52, 1.05, 14);
    const mergedFurnaceCopper = mergeTransformedGeometries([
      { geo: bandGeo, position: [0, 0.72, 0], rotation: [Math.PI / 2, 0, 0] },
      { geo: bandGeo, position: [0, 1.68, 0], rotation: [Math.PI / 2, 0, 0] },
      { geo: pipeGeo, position: [-1.18, 1.2, -0.1] },
      { geo: pipeGeo, position: [1.18, 1.2, -0.1] },
      { geo: chimneyGeo, position: [0, 2.52, -0.15] }
    ]);
    bandGeo.dispose();
    pipeGeo.dispose();
    chimneyGeo.dispose();
    if (mergedFurnaceCopper) {
      const copperMesh = new THREE.Mesh(mergedFurnaceCopper, copperMat);
      copperMesh.castShadow = true;
      fGroup.add(copperMesh);
    }

    // Parabolic gold solar concentrator mirror on articulated strut
    const mirrorPts = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.48, 0.08),
      new THREE.Vector2(0.95, 0.3)
    ];
    const mirrorDish = new THREE.Mesh(
      new THREE.LatheGeometry(mirrorPts, 24),
      new THREE.MeshStandardMaterial({
        color: '#ffdb7d',
        roughness: 0.14,
        metalness: 0.92,
        side: THREE.DoubleSide
      })
    );
    mirrorDish.position.set(-0.42, 2.95, 0.25);
    mirrorDish.rotation.set(0.62, 0, -0.42);
    fGroup.add(mirrorDish);

    this.furnaceCoreMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.44, 18, 14),
      new THREE.MeshStandardMaterial({
        color: '#ffb84d',
        emissive: '#ff6f00',
        emissiveIntensity: 2.4,
        roughness: 0.2
      })
    );
    this.furnaceCoreMesh.position.set(0, 1.08, 0.92);
    fGroup.add(this.furnaceCoreMesh);

    this.furnaceLight = new THREE.PointLight('#ff8c2b', 1.8, 7.5);
    this.furnaceLight.position.set(0, 1.25, 1.45);
    fGroup.add(this.furnaceLight);

    // Floating holographic Station Name Badge above Solar Furnace!
    const furnaceBadgeTex = createFloatingBadgeTexture('太阳能熔炼炉', '原矿 → 铁板/铜锭/透镜', '#ffad42');
    const furnaceBadgeMat = new THREE.SpriteMaterial({
      map: furnaceBadgeTex,
      transparent: true,
      depthTest: true
    });
    const furnaceBadge = new THREE.Sprite(furnaceBadgeMat);
    furnaceBadge.position.set(0, 4.15, 0);
    furnaceBadge.scale.set(3.4, 1.02, 1);
    fGroup.add(furnaceBadge);
    this.stationBadges.push({
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

    this.groups.dynamic.add(fGroup);
    this.colliders.push({ id: 'furnace', x: fCfg.x, z: fCfg.z, radius: fCfg.radius });

    // 2. Precision Fabrication Station (West-side of Hub)
    const fabCfg = WORLD_FACILITIES.fabricator;
    const fabGroup = new THREE.Group();
    const fabY = getTerrainHeight(fabCfg.x, fabCfg.z, false);
    fabGroup.position.set(fabCfg.x, fabY, fabCfg.z);

    this._staticAoEntries.push({
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
    holoBase.position.set(0.15, 1.0, 0.1);
    const holoPad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.13, 24),
      new THREE.MeshStandardMaterial({
        color: '#66f0ff',
        emissive: '#00a8e8',
        emissiveIntensity: 2.0,
        roughness: 0.18
      })
    );
    holoPad.position.set(0.15, 1.02, 0.1);
    fabGroup.add(holoBase, holoPad);

    // Slanted operator display terminal on side of bench
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
    fabGroup.add(sideConsole);

    // Articulated robotic assembly arm + fabrication laser beam
    this.fabricatorArm = new THREE.Group();
    this.fabricatorArm.position.set(-0.68, 0.96, -0.45);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 1.25, 12),
      new THREE.MeshStandardMaterial({ color: '#3b88b8', metalness: 0.7, roughness: 0.3 })
    );
    post.position.y = 0.6;
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), copperMat);
    joint.position.y = 1.18;
    const boom = new THREE.Mesh(
      new RoundedBoxGeometry(1.12, 0.16, 0.2, 3, 0.04),
      steelMat
    );
    boom.position.set(0.46, 1.18, 0.25);
    const emitterHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.13, 0.28, 12),
      new THREE.MeshStandardMaterial({
        color: '#75f7ff',
        emissive: '#00ccff',
        emissiveIntensity: 2.2
      })
    );
    emitterHead.position.set(0.86, 0.96, 0.25);
    emitterHead.rotation.x = Math.PI;

    this.fabricatorLaser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.06, 0.85, 8),
      new THREE.MeshBasicMaterial({
        color: '#70f8ff',
        transparent: true,
        opacity: 0.85
      })
    );
    this.fabricatorLaser.position.set(0.86, 0.48, 0.25);
    this.fabricatorLaser.visible = false;

    this.fabricatorArm.add(post, joint, boom, emitterHead, this.fabricatorLaser);
    fabGroup.add(this.fabricatorArm);

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
    this.stationBadges.push({
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

    this.groups.dynamic.add(fabGroup);
    this.colliders.push({ id: 'fabricator', x: fabCfg.x, z: fabCfg.z, radius: fabCfg.radius });

    // 3. Outpost Field Purifier & Fabricator in Dry Canyon (South)
    const pCfg = WORLD_FACILITIES.outpost_purifier;
    const pGroup = new THREE.Group();
    const py = getTerrainHeight(pCfg.x, pCfg.z, false);
    pGroup.position.set(pCfg.x, py, pCfg.z);

    const pBase = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.42, 0.88, 16), steelMat);
    pBase.position.y = 0.44;
    pBase.castShadow = true;
    pGroup.add(pBase);

    this.purifierRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.76, 0.095, 12, 28),
      new THREE.MeshStandardMaterial({
        color: '#5cffbe',
        emissive: '#00b870',
        emissiveIntensity: 2.0
      })
    );
    this.purifierRing.rotation.x = Math.PI / 2;
    this.purifierRing.position.y = 1.18;
    pGroup.add(this.purifierRing);

    const outBadgeTex = createFloatingBadgeTexture('前哨便携一体台', '现场熔炼 + 精密制造', '#52ffb8');
    const outBadgeMat = new THREE.SpriteMaterial({
      map: outBadgeTex,
      transparent: true,
      depthTest: true
    });
    const outBadge = new THREE.Sprite(outBadgeMat);
    outBadge.position.set(0, 2.85, 0);
    outBadge.scale.set(3.3, 0.99, 1);
    pGroup.add(outBadge);
    this.stationBadges.push({
      sprite: outBadge,
      mat: outBadgeMat,
      tex: outBadgeTex,
      x: pCfg.x,
      z: pCfg.z,
      baseW: 3.3,
      baseH: 0.99,
      zh: ['🧪 前哨便携一体台', '支持现场熔炼 + 维生组装'],
      en: ['🧪 Outpost Workbench', 'Field Smelter & Fabricator']
    });

    this.groups.dynamic.add(pGroup);
    this.colliders.push({ id: 'outpost_purifier', x: pCfg.x, z: pCfg.z, radius: pCfg.radius });
  }

  _buildRegionRoutesAndSignposts() {
    const signs = [
      {
        x: 18.0,
        z: 3.2,
        rotY: -Math.PI / 2,
        en: 'E: Signal Ridge (Lv.2)',
        zh: '东: 低语山脊 (第2关)',
        arrow: '→',
        color: '#5ce6ff'
      },
      {
        x: 3.2,
        z: 18.5,
        rotY: Math.PI,
        en: 'S: Dry Canyon (Lv.3)',
        zh: '南: 干涸峡谷 (第3关)',
        arrow: '↓',
        color: '#52ffb8'
      },
      {
        x: -18.0,
        z: -3.2,
        rotY: Math.PI / 2,
        en: 'W: Relay Gorge (Lv.4)',
        zh: '西: 中继峡谷 (第4关)',
        arrow: '←',
        color: '#ffd666'
      },
      {
        x: -3.2,
        z: -18.5,
        rotY: 0,
        en: 'N: Vent Field (Lv.5)',
        zh: '北: 地热喷口 (第5关)',
        arrow: '↑',
        color: '#ff78d0'
      }
    ];

    const postMat = new THREE.MeshStandardMaterial({
      color: '#3c4859',
      roughness: 0.48,
      metalness: 0.65
    });
    const postEntries = [];
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.95, 10);
    const boardGeo = new RoundedBoxGeometry(2.05, 0.68, 0.12, 3, 0.04);

    for (const s of signs) {
      const g = new THREE.Group();
      const y = getTerrainHeight(s.x, s.z, false);
      g.position.set(s.x, y, s.z);
      g.rotation.y = s.rotY;

      postEntries.push({
        geo: poleGeo,
        position: [s.x, y + 0.97, s.z]
      });

      const boardTex = createSignpostTexture(s.zh, s.arrow, s.color);
      this.signpostTextures.push({ tex: boardTex, en: s.en, zh: s.zh });
      const board = new THREE.Mesh(
        boardGeo,
        new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.38, metalness: 0.25 })
      );
      board.position.y = 1.76;
      g.add(board);

      this.groups.static.add(g);
    }

    const beaconRoutes = [
      { color: '#5ce6ff', pts: [[26, 1.5], [34, -1.5], [42, 1.8], [50, -1.5]] },
      { color: '#52ffb8', pts: [[2.2, 28], [-2.2, 36], [2.2, 44], [-2.2, 52]] },
      { color: '#ffd666', pts: [[-27, 2.0], [-33, -2.0], [-54, 2.0], [-61, -2.0]] },
      { color: '#ff78d0', pts: [[-2.2, -28], [2.2, -37], [-2.2, -46], [2.2, -55]] }
    ];

    const stemGeo = new THREE.CylinderGeometry(0.07, 0.11, 0.78, 8);
    const bulbGeo = new THREE.OctahedronGeometry(0.18, 1);
    for (const route of beaconRoutes) {
      const bulbMat = new THREE.MeshStandardMaterial({
        color: route.color,
        emissive: route.color,
        emissiveIntensity: 2.0,
        roughness: 0.2
      });
      const bulbEntries = [];
      for (const [bx, bz] of route.pts) {
        const by = getTerrainHeight(bx, bz, false);
        postEntries.push({
          geo: stemGeo,
          position: [bx, by + 0.39, bz]
        });
        bulbEntries.push({
          geo: bulbGeo,
          position: [bx, by + 0.88, bz]
        });
      }
      const mergedBulbs = mergeTransformedGeometries(bulbEntries);
      if (mergedBulbs) {
        this.groups.static.add(new THREE.Mesh(mergedBulbs, bulbMat));
      }
    }

    const mergedPosts = mergeTransformedGeometries(postEntries);
    poleGeo.dispose();
    stemGeo.dispose();
    bulbGeo.dispose();
    if (mergedPosts) {
      this.groups.static.add(new THREE.Mesh(mergedPosts, postMat));
    }

    const cairnStoneA = createSculptedBoulderGeometry(711, 'slab');
    const cairnStoneB = createSculptedBoulderGeometry(722, 'craggy');
    const cairnSpireGeo = createHexCrystalGeometry(0.18, 0.48, 0.26, 0.14);
    const cairnCollarGeo = new THREE.TorusGeometry(0.32, 0.035, 8, 20);
    const cairnStoneMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      vertexColors: true,
      color: '#a3b2c7',
      roughness: 0.76
    });
    const cairnCollarMat = new THREE.MeshStandardMaterial({
      color: '#de8142',
      metalness: 0.82,
      roughness: 0.25
    });
    const cairnStoneEntries = [];
    const cairnCollarEntries = [];

    for (const cairn of WORLD_FACILITIES.cairns) {
      const cg = new THREE.Group();
      const cy = getTerrainHeight(cairn.x, cairn.z, false);
      cg.position.set(cairn.x, cy, cairn.z);

      this._staticAoEntries.push({
        w: 2.6,
        h: 2.6,
        x: cairn.x,
        y: cy + 0.03,
        z: cairn.z
      });

      cairnStoneEntries.push(
        {
          geo: cairnStoneA,
          position: [cairn.x, cy + 0.26, cairn.z],
          scale: [0.75, 0.65, 0.75]
        },
        {
          geo: cairnStoneB,
          position: [cairn.x + 0.04, cy + 0.74, cairn.z - 0.03],
          rotation: [0, 0.9, 0],
          scale: [0.52, 0.46, 0.52]
        }
      );
      cairnCollarEntries.push({
        geo: cairnCollarGeo,
        position: [cairn.x, cy + 1.05, cairn.z],
        rotation: [Math.PI / 2, 0, 0]
      });

      const crystal = new THREE.Mesh(
        cairnSpireGeo,
        new THREE.MeshStandardMaterial({
          color: '#5a6b7c',
          emissive: '#142636',
          emissiveIntensity: 1.2,
          roughness: 0.12,
          metalness: 0.25
        })
      );
      crystal.position.y = 1.12;
      cg.add(crystal);
      this.groups.dynamic.add(cg);
      this.cairnVisuals.set(cairn.id, { group: cg, crystal });
      this.colliders.push({ id: cairn.id, x: cairn.x, z: cairn.z, radius: 0.85 });
    }

    const mergedCairnStones = mergeTransformedGeometries(cairnStoneEntries);
    const mergedCairnCollars = mergeTransformedGeometries(cairnCollarEntries);
    cairnStoneA.dispose();
    cairnStoneB.dispose();
    cairnCollarGeo.dispose();
    if (mergedCairnStones) {
      const m = new THREE.Mesh(mergedCairnStones, cairnStoneMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.groups.static.add(m);
    }
    if (mergedCairnCollars) {
      this.groups.static.add(new THREE.Mesh(mergedCairnCollars, cairnCollarMat));
    }
  }

  _buildRegionGates() {
    const regionIds = ['whispering_ridge', 'dry_canyon', 'relay_gorge', 'geothermal_field'];
    const barMat = new THREE.MeshStandardMaterial({
      map: this.textures.hazard,
      roughness: 0.42,
      metalness: 0.5
    });
    const postGeo = new RoundedBoxGeometry(0.58, 2.25, 0.58, 3, 0.06);
    const mergedGatePostsGeo = mergeTransformedGeometries([
      { geo: postGeo, position: [-3.4, 1.12, 0] },
      { geo: postGeo, position: [3.4, 1.12, 0] }
    ]);
    postGeo.dispose();
    const shieldGeo = new THREE.PlaneGeometry(6.3, 1.65);

    for (const rId of regionIds) {
      const reg = REGIONS[rId];
      const gb = reg.gateBarrier;
      const gy = getTerrainHeight(gb.x, gb.z, false);

      const gateGroup = new THREE.Group();
      gateGroup.position.set(gb.x, gy, gb.z);
      if (Math.abs(gb.x) > Math.abs(gb.z)) {
        gateGroup.rotation.y = Math.PI / 2;
      }

      const postsMesh = new THREE.Mesh(mergedGatePostsGeo, barMat);
      postsMesh.castShadow = true;

      const energyShield = new THREE.Mesh(
        shieldGeo,
        new THREE.MeshBasicMaterial({
          color: '#ff9640',
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      energyShield.position.set(0, 1.08, 0);

      gateGroup.add(postsMesh, energyShield);
      this.groups.dynamic.add(gateGroup);
      this.gateBarriers.set(rId, { group: gateGroup, shield: energyShield, baseY: gy });

      this.colliders.push({
        id: `gate_${rId}`,
        x: gb.x,
        z: gb.z,
        radius: 3.6,
        activeFn: () => !this.state.isRegionUnlocked(rId)
      });
    }
  }

  _buildRelayBridgeAndPylons() {
    // Custom GLSL Scrolling Photonic Energy Bridge Deck!
    this.bridgeUniforms = {
      uTime: { value: 0 }
    };
    const bridgeMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: this.bridgeUniforms,
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
    this.bridgeMesh = new THREE.Mesh(bridgeGeo, bridgeMat);
    this.bridgeMesh.position.set(-45.0, 0.7, 0);
    this.groups.dynamic.add(this.bridgeMesh);

    const pierMat = new THREE.MeshStandardMaterial({
      color: '#48455e',
      roughness: 0.55,
      metalness: 0.55
    });
    const pierEntries = [];
    const pierBoxGeo = new RoundedBoxGeometry(1.3, 1.25, 7.1, 3, 0.08);
    const pylonPedestalGeo = new THREE.CylinderGeometry(0.85, 1.12, 1.55, 12);
    const obsBaseGeo = new THREE.CylinderGeometry(1.12, 1.48, 1.65, 14);

    for (const px of [-38.3, -51.7]) {
      pierEntries.push({
        geo: pierBoxGeo,
        position: [px, 0.35, 0]
      });
    }

    const mirrorFrameGeo = new RoundedBoxGeometry(1.56, 1.14, 0.18, 3, 0.05);
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

      pierEntries.push({
        geo: pylonPedestalGeo,
        position: [pCfg.x, py + 0.77, pCfg.z]
      });

      const mirrorHead = new THREE.Group();
      mirrorHead.position.y = 2.15;
      const mirrorFrame = new THREE.Mesh(mirrorFrameGeo, mirrorFrameMat);
      mirrorHead.add(mirrorFrame);
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
      this.groups.dynamic.add(pg);
      this.pylonVisuals.set(pCfg.id, { group: pg, mirrorHead, mirrorFrame, cableMat, y: py });
      this.colliders.push({
        id: pCfg.id,
        x: pCfg.x,
        z: pCfg.z,
        radius: 1.05,
        minY: plat ? plat.topY - 0.5 : undefined
      });
    }

    // Ancient Observatory Dish across the bridge
    const obs = WORLD_FACILITIES.observatory;
    const oy = getTerrainHeight(obs.x, obs.z, false);
    const obsGroup = new THREE.Group();
    obsGroup.position.set(obs.x, oy, obs.z);

    pierEntries.push({
      geo: obsBaseGeo,
      position: [obs.x, oy + 0.82, obs.z]
    });

    const mergedPiers = mergeTransformedGeometries(pierEntries);
    pierBoxGeo.dispose();
    pylonPedestalGeo.dispose();
    obsBaseGeo.dispose();
    if (mergedPiers) {
      const m = new THREE.Mesh(mergedPiers, pierMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.groups.static.add(m);
    }

    const dishPts = [
      new THREE.Vector2(0.02, 0),
      new THREE.Vector2(0.75, 0.16),
      new THREE.Vector2(1.48, 0.55)
    ];
    this.observatoryDishTop = new THREE.Mesh(
      new THREE.LatheGeometry(dishPts, 24),
      new THREE.MeshStandardMaterial({
        color: '#b5c4ff',
        emissive: '#1f2b5c',
        emissiveIntensity: 1.1,
        side: THREE.DoubleSide,
        metalness: 0.72,
        roughness: 0.22
      })
    );
    this.observatoryDishTop.position.y = 2.05;
    this.observatoryDishTop.rotation.x = 0.48;
    obsGroup.add(this.observatoryDishTop);

    this.groups.dynamic.add(obsGroup);
    this.colliders.push({ id: 'observatory_dish', x: obs.x, z: obs.z, radius: obs.radius });
  }

  _buildOutpostAndVentLandmarks() {
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
    // Geodesic structural wireframe overlay for crisp sci-fi architectural detail
    const geoWire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.65, 1),
      new THREE.MeshStandardMaterial({
        color: '#2da67c',
        wireframe: true,
        roughness: 0.4
      })
    );
    geoWire.position.y = 0.05;

    const airlock = new THREE.Mesh(
      new RoundedBoxGeometry(1.35, 1.45, 1.1, 3, 0.08),
      new THREE.MeshStandardMaterial({ color: '#3b4a5e', metalness: 0.55, roughness: 0.45 })
    );
    airlock.position.set(2.15, 0.72, 0.8);
    airlock.rotation.y = 0.38;
    airlock.castShadow = true;

    tentGroup.add(dome, geoWire, airlock);
    this.groups.static.add(tentGroup);
    this.colliders.push({ id: 'outpost_tent', x: tentX, z: tentZ, radius: 2.6 });

    // Basalt Geothermal Vent Chimneys + Hexagonal Basalt Column Pillars in North Region
    const basaltGeo = createBasaltClusterGeometry(515);
    const basaltMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
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
      this.colliders.push({ id: `basalt_${bx}_${bz}`, x: bx, z: bz, radius: bScale * 1.05 });
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
      this.colliders.push({ id: `vent_${idx}`, x: vx, z: vz, radius: 1.35 });
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
      this.groups.static.add(m);
    }
    if (mergedVentGlow) {
      this.groups.static.add(new THREE.Mesh(mergedVentGlow, glowMat));
    }

    // Half-Buried Ancient Star-Relay Monolith Rings in West Gorge & Star-Field!
    const ruinStoneMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
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
    }
    const mergedRuinStone = mergeTransformedGeometries(ruinStoneEntries);
    const mergedRuinGold = mergeTransformedGeometries(ruinGoldEntries);
    for (const g of monolithTempGeos) g.dispose();
    if (mergedRuinStone) {
      const m = new THREE.Mesh(mergedRuinStone, ruinStoneMat);
      m.castShadow = true;
      this.groups.static.add(m);
    }
    if (mergedRuinGold) {
      this.groups.static.add(new THREE.Mesh(mergedRuinGold, runeGoldMat));
    }
  }

  _buildCrewLogs() {
    const standGeo = new THREE.CylinderGeometry(0.2, 0.34, 0.92, 12);
    const screenGeo = new RoundedBoxGeometry(0.68, 0.46, 0.09, 3, 0.03);
    const standMat = new THREE.MeshStandardMaterial({
      color: '#394659',
      metalness: 0.65,
      roughness: 0.4
    });
    const standEntries = [];
    for (const log of Object.values(CREW_LOGS)) {
      const ly = getTerrainHeight(log.position.x, log.position.z, false);
      const lg = new THREE.Group();
      lg.position.set(log.position.x, ly, log.position.z);

      standEntries.push({
        geo: standGeo,
        position: [log.position.x, ly + 0.46, log.position.z]
      });

      const screen = new THREE.Mesh(
        screenGeo,
        new THREE.MeshStandardMaterial({
          color: '#78f5ff',
          emissive: '#00b7ff',
          emissiveIntensity: 2.0,
          roughness: 0.2
        })
      );
      screen.position.y = 1.08;
      screen.rotation.x = -0.35;
      lg.add(screen);
      this.groups.dynamic.add(lg);
      this.logVisuals.set(log.id, { group: lg, screen });
    }

    const mergedStands = mergeTransformedGeometries(standEntries);
    standGeo.dispose();
    if (mergedStands) {
      this.groups.static.add(new THREE.Mesh(mergedStands, standMat));
    }
  }

  _buildResourceNodes() {
    const outcropGeos = [
      createHostRockOutcropGeometry(1.18, 0.44, 111),
      createHostRockOutcropGeometry(1.24, 0.48, 222),
      createHostRockOutcropGeometry(1.14, 0.42, 333)
    ];
    const hostRockMat = new THREE.MeshStandardMaterial({
      map: this.textures.rockMap,
      normalMap: this.textures.rockNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.06
    });
    const pebbleGeo = createSculptedBoulderGeometry(404, 'craggy');

    // Shared True Hexagonal Terminated Crystal Geometries (Tall Master, Medium, Stubby)
    const hexSpireTall = createHexCrystalGeometry(0.24, 0.82, 0.38, 0.18);
    const hexSpireMed = createHexCrystalGeometry(0.19, 0.58, 0.28, 0.2);
    const hexSpireSmall = createHexCrystalGeometry(0.14, 0.38, 0.22, 0.16);

    // Shared Host Matrix Boulders for Ore Veins
    const oreMatrixGeoA = createSculptedBoulderGeometry(601, 'craggy');
    const oreMatrixGeoB = createSculptedBoulderGeometry(602, 'slab');

    // Shared Material Pool across all 47 resource nodes (eliminates ~90 duplicate ShaderMaterial programs!)
    const crystalShellMats = new Map();
    const crystalCoreMats = new Map();
    const fissureCrackMats = new Map();
    const sonarRingMats = new Map();
    const oreVeinMats = new Map();

    const getCrystalMats = (mId, matDef) => {
      if (!crystalShellMats.has(mId)) {
        const deepTint =
          mId === 'quartz_crystal'
            ? '#1685b8'
            : mId === 'plasma_crystal'
              ? '#b81d78'
              : '#d98c00';
        const rimColorVec = new THREE.Color(matDef.color).lerp(new THREE.Color('#ffffff'), 0.55);

        // Mobile-friendly single-layer PBR + analytical Fresnel gemstone rim (no costly clearcoat dual-specular pass!)
        const shellMat = new THREE.MeshStandardMaterial({
          color: deepTint,
          emissive: matDef.emissive,
          emissiveIntensity: 0.48,
          vertexColors: true,
          roughness: 0.06,
          metalness: 0.18,
          transparent: true,
          opacity: 0.88
        });
        shellMat.customProgramCacheKey = () => `gem_shell_${mId}`;
        shellMat.onBeforeCompile = (shader) => {
          shader.uniforms.uRimColor = { value: rimColorVec };
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>\nuniform vec3 uRimColor;`
          );
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `
            float fresnel = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 2.4);
            gl_FragColor.rgb += uRimColor * fresnel * 1.18;
            #include <dithering_fragment>
            `
          );
        };
        crystalShellMats.set(mId, shellMat);
        crystalCoreMats.set(mId, new THREE.MeshBasicMaterial({ color: matDef.color }));
      }
      return {
        shellMat: crystalShellMats.get(mId),
        innerCoreMat: crystalCoreMats.get(mId)
      };
    };

    const hullScrapMat = new THREE.MeshStandardMaterial({
      map: this.textures.metalMap,
      normalMap: this.textures.metalNormal,
      color: '#b8c6d8',
      roughness: 0.34,
      metalness: 0.76,
      side: THREE.DoubleSide
    });
    const orangeBeamMat = new THREE.MeshStandardMaterial({
      color: '#e07a38',
      roughness: 0.42,
      metalness: 0.48
    });
    const darkPipeMat = new THREE.MeshStandardMaterial({
      color: '#344154',
      roughness: 0.48,
      metalness: 0.72
    });
    const coolantMembraneMat = new THREE.MeshStandardMaterial({
      color: '#52fff0',
      emissive: '#0c786e',
      emissiveIntensity: 0.98,
      roughness: 0.08,
      metalness: 0.08,
      transparent: true,
      opacity: 0.72
    });
    const coolantNucleusMat = new THREE.MeshBasicMaterial({ color: '#c4fff9' });
    const lumenHaloGeo = new THREE.TorusGeometry(0.62, 0.025, 8, 28);
    const lumenHaloMat = new THREE.MeshBasicMaterial({ color: '#ffe885' });
    const sonarRingGeo = new THREE.RingGeometry(0.95, 1.22, 28);

    // Shared template geometries for scrap & pods
    const scrapCurvedGeo = new THREE.CylinderGeometry(0.78, 0.82, 0.95, 12, 1, true, 0, Math.PI * 0.68);
    const scrapBeamGeo = new RoundedBoxGeometry(0.22, 1.08, 0.18, 2, 0.03);
    const scrapSubPanelGeo = new RoundedBoxGeometry(0.62, 0.09, 0.48, 2, 0.02);
    const scrapConduitGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.82, 10);

    // Static world-space batch collectors across ALL 47 resource nodes
    const staticHostRockEntries = [];
    const fissureCrackBuckets = new Map();
    const tempGeos = [scrapCurvedGeo, scrapBeamGeo, scrapSubPanelGeo, scrapConduitGeo];

    RESOURCE_NODES.forEach((node, nodeIdx) => {
      const matDef = MATERIALS[node.materialId];
      const plat = node.platformId
        ? ELEVATED_PLATFORMS.find((pl) => pl.id === node.platformId)
        : null;
      const ny = plat ? plat.topY : getTerrainHeight(node.x, node.z, false);
      const root = new THREE.Group();
      root.position.set(node.x, ny, node.z);

      // 1. Collect static ground AO + Craggy Outcrop + 3 Pebbles into global single-draw batches!
      this._staticAoEntries.push({
        w: 3.1,
        h: 3.1,
        x: node.x,
        y: ny + 0.03,
        z: node.z
      });

      let sonarEchoRing = null;
      if (node.subsurface) {
        staticHostRockEntries.push({
          geo: outcropGeos[nodeIdx % outcropGeos.length],
          position: [node.x, ny, node.z],
          rotation: [0, nodeIdx * 1.1, 0],
          scale: [1.08, 0.48, 1.08]
        });

        const mKey = node.materialId;
        if (!fissureCrackMats.has(mKey)) {
          fissureCrackMats.set(
            mKey,
            new THREE.MeshStandardMaterial({
              color: matDef.color,
              emissive: matDef.color,
              emissiveIntensity: 2.1,
              roughness: 0.2
            })
          );
          fissureCrackBuckets.set(mKey, []);
        }
        for (let c = 0; c < 3; c++) {
          const stripGeo = new THREE.BoxGeometry(1.55 - c * 0.25, 0.05, 0.11);
          tempGeos.push(stripGeo);
          fissureCrackBuckets.get(mKey).push({
            geo: stripGeo,
            position: [node.x, ny + 0.16, node.z],
            rotation: [0, c * 0.95 + nodeIdx * 0.4, 0]
          });
        }

        if (!sonarRingMats.has(mKey)) {
          sonarRingMats.set(
            mKey,
            new THREE.MeshBasicMaterial({
              color: matDef.color,
              transparent: true,
              opacity: 0.88,
              side: THREE.DoubleSide
            })
          );
        }
        sonarEchoRing = new THREE.Mesh(sonarRingGeo, sonarRingMats.get(mKey).clone());
        sonarEchoRing.rotation.x = -Math.PI / 2;
        sonarEchoRing.position.y = 0.24;
        sonarEchoRing.visible = false;
        root.add(sonarEchoRing);
      } else {
        staticHostRockEntries.push({
          geo: outcropGeos[nodeIdx % outcropGeos.length],
          position: [node.x, ny, node.z],
          rotation: [0, nodeIdx * 1.37, 0]
        });
      }

      for (let p = 0; p < 3; p++) {
        const pa = nodeIdx * 0.9 + p * 2.15;
        const pr = 0.95 + (p % 2) * 0.22;
        staticHostRockEntries.push({
          geo: pebbleGeo,
          position: [node.x + Math.cos(pa) * pr, ny + 0.08, node.z + Math.sin(pa) * pr],
          rotation: [p, pa, 0],
          scale: 0.16 + p * 0.04
        });
      }

      const cluster = new THREE.Group();
      let isCrystalLike = false;
      let orbitRing = null;

      const mId = node.materialId;

      if (mId === 'quartz_crystal' || mId === 'plasma_crystal' || mId === 'lumen_core') {
        // === TYPE A: Gemstone Hexagonal Crystal Formation (Merged into 2 draw calls: outer shell + inner core!) ===
        isCrystalLike = true;
        const { shellMat, innerCoreMat } = getCrystalMats(mId, matDef);

        const crystalLayout = [
          { geo: hexSpireTall, x: 0.0, y: 0.16, z: 0.0, rx: 0.06, rz: -0.05, s: 1.12, hasCore: true },
          { geo: hexSpireMed, x: 0.34, y: 0.14, z: 0.16, rx: 0.22, rz: -0.34, s: 0.96, hasCore: true },
          { geo: hexSpireMed, x: -0.32, y: 0.14, z: 0.2, rx: 0.24, rz: 0.36, s: 0.92, hasCore: true },
          { geo: hexSpireMed, x: 0.08, y: 0.13, z: -0.34, rx: -0.35, rz: -0.1, s: 0.88, hasCore: false },
          { geo: hexSpireSmall, x: -0.38, y: 0.1, z: -0.22, rx: -0.28, rz: 0.42, s: 0.85, hasCore: false },
          { geo: hexSpireSmall, x: 0.42, y: 0.09, z: -0.18, rx: -0.22, rz: -0.46, s: 0.8, hasCore: false },
          { geo: hexSpireSmall, x: -0.05, y: 0.1, z: 0.42, rx: 0.45, rz: 0.08, s: 0.76, hasCore: false }
        ];

        const outerEntries = [];
        const coreEntries = [];
        const spireDummy = new THREE.Object3D();
        const coreDummy = new THREE.Object3D();
        spireDummy.add(coreDummy);

        crystalLayout.forEach((sp, k) => {
          spireDummy.position.set(sp.x, sp.y, sp.z);
          spireDummy.rotation.set(sp.rx, k * 0.95 + nodeIdx * 0.4, sp.rz);
          spireDummy.scale.setScalar(sp.s);
          spireDummy.updateMatrixWorld(true);
          outerEntries.push({ geo: sp.geo, matrix: spireDummy.matrixWorld.clone() });

          if (sp.hasCore) {
            coreDummy.position.set(0, 0.06, 0);
            coreDummy.rotation.set(0, 0, 0);
            coreDummy.scale.set(0.46, 0.78, 0.46);
            coreDummy.updateMatrixWorld(true);
            coreEntries.push({ geo: sp.geo, matrix: coreDummy.matrixWorld.clone() });
          }
        });

        const mergedCore = mergeTransformedGeometries(coreEntries);
        if (mergedCore) {
          cluster.add(new THREE.Mesh(mergedCore, innerCoreMat));
        }
        const mergedOuter = mergeTransformedGeometries(outerEntries);
        if (mergedOuter) {
          const outerMesh = new THREE.Mesh(mergedOuter, shellMat);
          outerMesh.castShadow = !node.subsurface;
          cluster.add(outerMesh);
        }

        if (mId === 'lumen_core') {
          orbitRing = new THREE.Mesh(lumenHaloGeo, lumenHaloMat);
          orbitRing.position.y = 0.78;
          orbitRing.rotation.x = 1.1;
          cluster.add(orbitRing);
        }
      } else if (mId === 'iron_scrap') {
        // === TYPE B: Crashed Spacecraft Hull Wreckage (Merged hull plates + shared materials!) ===
        const mergedScrapHull = mergeTransformedGeometries([
          {
            geo: scrapCurvedGeo,
            position: [-0.08, 0.42, 0.05],
            rotation: [0.45, 0.3 + nodeIdx, 0.55]
          },
          {
            geo: scrapSubPanelGeo,
            position: [-0.26, 0.28, -0.22],
            rotation: [0.32, -0.5, -0.28]
          }
        ]);
        if (mergedScrapHull) {
          const hullMesh = new THREE.Mesh(mergedScrapHull, hullScrapMat);
          hullMesh.castShadow = true;
          cluster.add(hullMesh);
        }

        const beam = new THREE.Mesh(scrapBeamGeo, orangeBeamMat);
        beam.position.set(0.24, 0.52, -0.12);
        beam.rotation.set(-0.35, 0.2, -0.42);

        const conduit = new THREE.Mesh(scrapConduitGeo, darkPipeMat);
        conduit.position.set(0.12, 0.36, 0.26);
        conduit.rotation.set(0.85, 0.3, 0.25);

        cluster.add(beam, conduit);
      } else if (mId === 'coolant_gel') {
        // === TYPE D: Translucent Bioluminescent Cryo-Brine Gel Pods (Merged into 2 draw calls!) ===
        isCrystalLike = true;
        const pods = [
          [0.0, 0.46, 0.0, 0.38],
          [0.36, 0.32, 0.2, 0.26],
          [-0.32, 0.3, 0.18, 0.24],
          [0.06, 0.28, -0.34, 0.22]
        ];
        const podOuterEntries = [];
        const podInnerEntries = [];
        for (const [px, py, pz, rad] of pods) {
          const gOut = new THREE.SphereGeometry(rad, 16, 12);
          const gIn = new THREE.IcosahedronGeometry(rad * 0.48, 1);
          tempGeos.push(gOut, gIn);
          podOuterEntries.push({
            geo: gOut,
            position: [px, py, pz],
            scale: [1.06, 0.88, 1.06]
          });
          podInnerEntries.push({
            geo: gIn,
            position: [px, py, pz]
          });
        }
        const mergedNuclei = mergeTransformedGeometries(podInnerEntries);
        if (mergedNuclei) cluster.add(new THREE.Mesh(mergedNuclei, coolantNucleusMat));
        const mergedMembrane = mergeTransformedGeometries(podOuterEntries);
        if (mergedMembrane) {
          const podMesh = new THREE.Mesh(mergedMembrane, coolantMembraneMat);
          cluster.add(podMesh);
        }
      } else {
        // === TYPE C: Rich Metallic / Mineral Ore Veins (Merged 6 nuggets into 1 Mesh + shared veinMat!) ===
        const isZeolite = mId === 'zeolite_ore';
        const matrixRock = new THREE.Mesh(
          nodeIdx % 2 === 0 ? oreMatrixGeoA : oreMatrixGeoB,
          hostRockMat
        );
        matrixRock.position.set(0, 0.42, 0);
        matrixRock.scale.set(0.68, 0.62, 0.68);
        matrixRock.rotation.y = nodeIdx * 0.8;
        matrixRock.castShadow = !node.subsurface;
        matrixRock.receiveShadow = true;
        cluster.add(matrixRock);

        if (!oreVeinMats.has(mId)) {
          oreVeinMats.set(
            mId,
            new THREE.MeshStandardMaterial({
              map: isZeolite ? this.textures.rockMap : this.textures.metalMap,
              normalMap: this.textures.rockNormal,
              color: matDef.color,
              emissive: matDef.emissive,
              emissiveIntensity: isZeolite ? 1.05 : 0.88,
              roughness: isZeolite ? 0.38 : 0.22,
              metalness: isZeolite ? 0.18 : 0.88
            })
          );
        }
        const veinMat = oreVeinMats.get(mId);

        const nuggetCoords = [
          [0.06, 0.74, 0.04, 1.05, 0.2, -0.15],
          [0.38, 0.48, 0.24, 0.82, 0.45, -0.35],
          [-0.36, 0.5, 0.18, 0.78, -0.3, 0.42],
          [0.18, 0.44, -0.36, 0.75, -0.4, -0.22],
          [-0.24, 0.38, -0.3, 0.68, 0.35, 0.3],
          [0.0, 0.56, 0.38, 0.65, 0.52, 0.1]
        ];
        const nuggetEntries = [];
        nuggetCoords.forEach(([nx, ny2, nz, ns, rx, rz], k) => {
          const nGeo = isZeolite
            ? hexSpireSmall
            : new THREE.OctahedronGeometry(0.24 * ns, 0);
          if (!isZeolite) tempGeos.push(nGeo);
          nuggetEntries.push({
            geo: nGeo,
            position: [nx, isZeolite ? ny2 - 0.18 : ny2, nz],
            rotation: [rx, k * 1.2, rz],
            scale: isZeolite ? [1.35 * ns, 0.85 * ns, 0.85 * ns] : [1.25, 0.82, 0.95]
          });
        });
        const mergedNuggets = mergeTransformedGeometries(nuggetEntries);
        if (mergedNuggets) {
          cluster.add(new THREE.Mesh(mergedNuggets, veinMat));
        }
      }

      root.add(cluster);
      this.groups.resources.add(root);
      this.resourceVisuals.set(node.id, {
        root,
        cluster,
        node,
        worldY: ny,
        isCrystalLike,
        orbitRing,
        sonarEchoRing,
        _settledScale: false
      });
    });

    // Flush all 47 node host-rock beds + 141 pebbles into ONE static draw call!
    const mergedAllHostRocks = mergeTransformedGeometries(staticHostRockEntries);
    if (mergedAllHostRocks) {
      const hostBatchMesh = new THREE.Mesh(mergedAllHostRocks, hostRockMat);
      hostBatchMesh.receiveShadow = true;
      this.groups.static.add(hostBatchMesh);
    }

    // Flush glowing subsurface tectonic fault strips per mineral color!
    for (const [mKey, entries] of fissureCrackBuckets.entries()) {
      const mergedCracks = mergeTransformedGeometries(entries);
      if (mergedCracks) {
        this.groups.static.add(new THREE.Mesh(mergedCracks, fissureCrackMats.get(mKey)));
      }
    }

    for (const g of outcropGeos) g.dispose();
    pebbleGeo.dispose();
    hexSpireTall.dispose();
    hexSpireMed.dispose();
    hexSpireSmall.dispose();
    for (const g of tempGeos) g.dispose();
  }

  _flushStaticBatches() {
    if (this._staticAoEntries.length > 0) {
      const unitPlane = new THREE.PlaneGeometry(1, 1);
      const aoEntries = this._staticAoEntries.map((item) => ({
        geo: unitPlane,
        position: [item.x, item.y, item.z],
        rotation: [-Math.PI / 2, 0, 0],
        scale: [item.w, item.h, 1]
      }));
      const mergedAo = mergeTransformedGeometries(aoEntries);
      unitPlane.dispose();
      if (mergedAo) {
        const aoMesh = new THREE.Mesh(mergedAo, this.aoShadowMat);
        aoMesh.renderOrder = -1;
        this.groups.static.add(aoMesh);
      }
      this._staticAoEntries.length = 0;
    }
  }

  _buildDustAndSelectionEffects() {
    const ringGeo = new THREE.RingGeometry(0.88, 1.12, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.selectionRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: '#70f8ff',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide
      })
    );
    this.selectionRing.visible = false;
    this.groups.effects.add(this.selectionRing);

    // Soft glowing atmospheric dust motes using radial glow sprite texture
    const count = 240;
    const positions = new Float32Array(count * 3);
    const rand = mulberry32(998877);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 115;
      positions[i * 3 + 1] = 0.8 + rand() * 9.5;
      positions[i * 3 + 2] = (rand() - 0.5) * 115;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      map: this.textures.glowSprite,
      color: '#fff2d9',
      size: 0.55,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.dustPoints = new THREE.Points(pGeo, pMat);
    this.groups.effects.add(this.dustPoints);

    // Subtle wind-blown sand drift ribbons skimming over desert dunes
    const ribbonGeo = new THREE.PlaneGeometry(11.0, 0.42);
    ribbonGeo.rotateX(-Math.PI / 2);
    const ribbonMat = new THREE.MeshBasicMaterial({
      map: this.textures.glowSprite,
      color: '#ffe8c8',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    for (let w = 0; w < 14; w++) {
      const rx = (rand() - 0.5) * 95;
      const rz = (rand() - 0.5) * 95;
      const rMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
      const wy = getTerrainHeight(rx, rz, false);
      rMesh.position.set(rx, Math.max(0.2, wy + 0.65), rz);
      rMesh.rotation.y = 0.28;
      this.groups.effects.add(rMesh);
      this.windRibbons.push({
        mesh: rMesh,
        speed: 5.5 + rand() * 4.5,
        originZ: rz
      });
    }

    // Floating 3D Waypoint Beacon (vertical soft light beam + bobbing chevron diamond)
    this.waypointBeacon = new THREE.Group();
    this.waypointBeacon.visible = false;

    this.waypointDiamondMat = new THREE.MeshStandardMaterial({
      color: '#5ce8ff',
      emissive: '#00c8ff',
      emissiveIntensity: 2.2,
      roughness: 0.15
    });
    this.waypointDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      this.waypointDiamondMat
    );
    this.waypointDiamond.scale.set(0.85, 1.45, 0.85);
    this.waypointDiamond.position.y = 3.2;

    this.waypointBeamMat = new THREE.MeshBasicMaterial({
      color: '#5ce8ff',
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.52, 5.2, 14, 1, true),
      this.waypointBeamMat
    );
    beam.position.y = 2.6;

    this.waypointRingMat = new THREE.MeshBasicMaterial({
      color: '#5ce8ff',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide
    });
    this.waypointGroundRing = new THREE.Mesh(
      new THREE.RingGeometry(1.05, 1.28, 32),
      this.waypointRingMat
    );
    this.waypointGroundRing.rotation.x = -Math.PI / 2;
    this.waypointGroundRing.position.y = 0.09;

    this.waypointBeacon.add(this.waypointDiamond, beam, this.waypointGroundRing);
    this.groups.effects.add(this.waypointBeacon);

    // Expanding 3D Seismic Sonar Pulse Wave Ring [V]
    const sonarGeo = new THREE.RingGeometry(0.88, 1.0, 56);
    sonarGeo.rotateX(-Math.PI / 2);
    this.sonarWaveMat = new THREE.MeshBasicMaterial({
      color: '#66f7ff',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.sonarWaveMesh = new THREE.Mesh(sonarGeo, this.sonarWaveMat);
    this.sonarWaveMesh.visible = false;
    this.groups.effects.add(this.sonarWaveMesh);

    this.state.on((event, detail) => {
      if (event === 'sonar_pulsed') {
        this.triggerSonarWave(detail.x, detail.z);
      } else if (
        event === 'node_harvested' ||
        event === 'node_respawned' ||
        event === 'repair_applied' ||
        event === 'level_completed' ||
        event === 'reset'
      ) {
        this._shadowDirty = true;
      }
    });
  }

  triggerSonarWave(x, z) {
    if (!this.sonarWaveMesh) return;
    const y = getTerrainHeight(x, z, this.state.isBridgeExtended());
    this.sonarWaveMesh.position.set(x, y + 0.35, z);
    this.sonarWaveMesh.scale.setScalar(1.0);
    this.sonarWaveMesh.visible = true;
    this.sonarWaveTimer = 1.25;
  }

  update(dt, elapsed, highlightTarget, activeWaypoint = null, robotPos = null) {
    this.skyDome.uniforms.uTime.value = elapsed;

    // Dynamically refresh 3D signpost & station badge CanvasTextures when language toggles!
    if (this._lastLang !== this.state.lang) {
      this._lastLang = this.state.lang;
      const isZh = this.state.lang === 'zh';
      for (const sp of this.signpostTextures) {
        sp.tex.updateLabel(isZh ? sp.zh : sp.en);
      }
      for (const sb of this.stationBadges) {
        const pair = isZh ? sb.zh : sb.en;
        sb.tex.updateBadge(pair[0], pair[1]);
      }
    }

    // Update 3D Station Floating Signboards: obey user toggle + auto-scale/proximity-fade on medium/small viewports!
    const showLabels = this.state.settings.showWorldLabels !== false;
    const isCompactScreen =
      typeof window !== 'undefined' && window.innerWidth <= 1180;
    const scaleMult = isCompactScreen ? 0.72 : 1.0;
    const fadeFar = isCompactScreen ? 15.5 : 34.0;
    const fadeNear = isCompactScreen ? 7.5 : 16.0;

    for (const sb of this.stationBadges) {
      if (!showLabels) {
        sb.sprite.visible = false;
        continue;
      }
      let alpha = 0.94;
      if (robotPos) {
        const d = Math.hypot(robotPos.x - sb.x, robotPos.z - sb.z);
        alpha = smoothstep(fadeFar, fadeNear, d) * 0.94;
      }
      sb.sprite.visible = alpha > 0.04;
      if (sb.sprite.visible) {
        sb.mat.opacity = alpha;
        sb.sprite.scale.set(sb.baseW * scaleMult, sb.baseH * scaleMult, 1);
      }
    }

    for (const [rId, gate] of this.gateBarriers.entries()) {
      const unlocked = this.state.isRegionUnlocked(rId);
      const targetY = unlocked ? gate.baseY - 2.6 : gate.baseY;
      gate.group.position.y += (targetY - gate.group.position.y) * Math.min(1, dt * 4.5);
      gate.group.visible = gate.group.position.y > gate.baseY - 2.45;
      gate.shield.material.opacity = 0.3 + Math.sin(elapsed * 3.5) * 0.08;
    }

    const bridgeOpen = this.state.isBridgeExtended();
    if (this.bridgeMesh) {
      this.bridgeMesh.visible = bridgeOpen;
      if (bridgeOpen && this.bridgeUniforms) {
        this.bridgeUniforms.uTime.value = elapsed;
      }
    }

    for (const [pId, pv] of this.pylonVisuals.entries()) {
      const aligned = Boolean(this.state.pylonsAligned[pId]);
      const targetRotX = aligned ? -0.55 : 0.55;
      const targetRotY = aligned ? 0.35 : 1.1;
      pv.mirrorHead.rotation.x += (targetRotX - pv.mirrorHead.rotation.x) * Math.min(1, dt * 5);
      pv.mirrorHead.rotation.y += (targetRotY - pv.mirrorHead.rotation.y) * Math.min(1, dt * 5);
      if (pv._lastAligned !== aligned) {
        pv._lastAligned = aligned;
        pv.cableMat.color.set(aligned ? '#66f5ff' : '#ff7b3b');
        pv.cableMat.emissive.set(aligned ? '#00b7ff' : '#cc4400');
      }
    }

    for (const [cId, cv] of this.cairnVisuals.entries()) {
      const active = Boolean(this.state.cairnsActivated[cId]);
      cv.crystal.rotation.y += dt * (active ? 2.4 : 0.5);
      if (cv._lastActive !== active) {
        cv._lastActive = active;
        cv.crystal.material.color.set(active ? '#70f8ff' : '#5a6b7c');
        cv.crystal.material.emissive.set(active ? '#00c8ff' : '#142636');
      }
    }

    if (this.observatoryDishTop && this.state.observatoryRestored) {
      this.observatoryDishTop.rotation.y += dt * 0.85;
      if (!this._obsLit) {
        this._obsLit = true;
        this.observatoryDishTop.material.emissive.set('#2b6cff');
      }
    } else {
      this._obsLit = false;
    }

    const busyQueue = this.state.craftingQueue.length > 0;
    if (this.furnaceCoreMesh) {
      const pulse = busyQueue
        ? 3.0 + Math.sin(elapsed * 14) * 0.6
        : 1.9 + Math.sin(elapsed * 3) * 0.25;
      this.furnaceCoreMesh.material.emissiveIntensity = pulse;
    }
    if (this.fabricatorArm) {
      this.fabricatorArm.rotation.y = busyQueue
        ? Math.sin(elapsed * 6.5) * 0.55
        : Math.sin(elapsed * 0.9) * 0.12;
    }
    if (this.fabricatorLaser) {
      this.fabricatorLaser.visible = busyQueue;
    }
    if (this.purifierRing) {
      this.purifierRing.rotation.z += dt * (busyQueue ? 3.5 : 0.8);
    }

    const rx = robotPos ? robotPos.x : 0;
    const rz = robotPos ? robotPos.z : 0;
    // Distance culling threshold squared (66m covers entire active view + nearby biome!)
    const cullDistSq = 66 * 66;
    const animDistSq = 28 * 28;

    for (const [nodeId, rv] of this.resourceVisuals.entries()) {
      const dx = rv.node.x - rx;
      const dz = rv.node.z - rz;
      const distSq = dx * dx + dz * dz;

      // Hide distant mineral clusters outside camera horizon to save draw calls & matrix updates!
      if (robotPos && distSq > cullDistSq) {
        if (rv.root.visible) rv.root.visible = false;
        continue;
      }
      if (!rv.root.visible) rv.root.visible = true;

      const available = this.state.isNodeAvailable(nodeId);
      const isSub = Boolean(rv.node.subsurface);
      const sonarLit = isSub && this.state.isNodeSonarHighlighted(nodeId);

      // Subsurface veins stay half-tucked beneath glowing fissure cracks until drilled!
      const readyScale = isSub ? (sonarLit ? 0.72 : 0.54) : 1.0;
      const targetScale = available ? readyScale : 0.14;
      const cur = rv.cluster.scale.x;
      if (Math.abs(targetScale - cur) > 0.002) {
        const next = cur + (targetScale - cur) * Math.min(1, dt * 7);
        rv.cluster.scale.setScalar(next);
      } else if (cur !== targetScale) {
        rv.cluster.scale.setScalar(targetScale);
      }

      const isClose = !robotPos || distSq <= animDistSq || sonarLit;
      if (isSub) {
        rv.cluster.position.y = available
          ? (sonarLit ? -0.14 : -0.28) + (isClose ? Math.sin(elapsed * 3.2 + rv.node.x) * 0.03 : 0)
          : -0.42;
        if (rv.sonarEchoRing) {
          rv.sonarEchoRing.visible = available && sonarLit;
          if (rv.sonarEchoRing.visible) {
            const p = (elapsed * 1.6) % 1;
            rv.sonarEchoRing.position.y = 0.2 + p * 1.4;
            rv.sonarEchoRing.scale.setScalar(0.85 + p * 0.9);
            rv.sonarEchoRing.material.opacity = (1 - p) * 0.9;
          }
        }
      } else if (available && rv.isCrystalLike && isClose) {
        rv.cluster.position.y = Math.sin(elapsed * 2.2 + rv.node.x) * 0.035;
      } else if (rv.cluster.position.y !== 0) {
        rv.cluster.position.y = 0;
      }
      if (rv.orbitRing && isClose) {
        rv.orbitRing.rotation.z = elapsed * 1.4;
      }
    }

    if (this.sonarWaveTimer > 0 && this.sonarWaveMesh) {
      this.sonarWaveTimer -= dt;
      const prog = 1 - Math.max(0, this.sonarWaveTimer) / 1.25;
      this.sonarWaveMesh.scale.setScalar(1 + prog * 41.0);
      this.sonarWaveMat.opacity = (1 - prog) * 0.85;
      if (this.sonarWaveTimer <= 0) {
        this.sonarWaveMesh.visible = false;
      }
    }

    for (const [logId, lv] of this.logVisuals.entries()) {
      const read = Boolean(this.state.logsRead[logId]);
      lv.screen.position.y = 1.08 + Math.sin(elapsed * 2.6) * 0.05;
      if (lv._lastRead !== read) {
        lv._lastRead = read;
        lv.screen.material.color.set(read ? '#7dffb3' : '#78f5ff');
        lv.screen.material.emissive.set(read ? '#0ec46b' : '#00b7ff');
      }
    }

    if (highlightTarget && this.selectionRing) {
      this.selectionRing.visible = true;
      const hy =
        highlightTarget.y !== undefined
          ? highlightTarget.y
          : getTerrainHeight(
              highlightTarget.x,
              highlightTarget.z,
              this.state.isBridgeExtended()
            );
      this.selectionRing.position.set(highlightTarget.x, hy + 0.08, highlightTarget.z);
      const s = 1 + Math.sin(elapsed * 5.0) * 0.08;
      this.selectionRing.scale.set(s, 1, s);
    } else if (this.selectionRing) {
      this.selectionRing.visible = false;
    }

    // Update 3D Smart Waypoint Beacon above active objective target (including Sky-Mesas!)
    if (
      activeWaypoint &&
      this.state.settings.guideArrow !== false &&
      this.waypointBeacon
    ) {
      this.waypointBeacon.visible = true;
      const wy =
        activeWaypoint.topY !== null && activeWaypoint.topY !== undefined
          ? activeWaypoint.topY
          : getTerrainHeight(
              activeWaypoint.x,
              activeWaypoint.z,
              this.state.isBridgeExtended()
            );
      this.waypointBeacon.position.set(activeWaypoint.x, wy, activeWaypoint.z);
      this.waypointDiamond.position.y = 3.25 + Math.sin(elapsed * 3.8) * 0.26;
      this.waypointDiamond.rotation.y = elapsed * 2.2;
      const pulse = 1 + Math.sin(elapsed * 4.2) * 0.12;
      this.waypointGroundRing.scale.set(pulse, pulse, 1);

      const wpCol = activeWaypoint.color || '#5ce8ff';
      if (this._lastWpCol !== wpCol) {
        this._lastWpCol = wpCol;
        this.waypointDiamondMat.color.set(wpCol);
        this.waypointDiamondMat.emissive.set(wpCol);
        this.waypointBeamMat.color.set(wpCol);
        this.waypointRingMat.color.set(wpCol);
      }
    } else if (this.waypointBeacon) {
      this.waypointBeacon.visible = false;
    }

    if (this.dustPoints && this.dustPoints.visible) {
      this.dustPoints.rotation.y += dt * 0.018;
      for (const wr of this.windRibbons) {
        wr.mesh.position.x += wr.speed * dt;
        if (wr.mesh.position.x > 58) {
          wr.mesh.position.x = -58;
        }
        const gy = getTerrainHeight(wr.mesh.position.x, wr.originZ, false);
        wr.mesh.position.y = Math.max(0.2, gy + 0.65);
      }
    }
  }
}
