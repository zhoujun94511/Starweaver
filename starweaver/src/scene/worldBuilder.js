import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  BRINE_POOLS,
  CREW_LOGS,
  DESERT_AERIAL_MOTES,
  DESERT_UPDRAFTS,
  ELEVATED_PLATFORMS,
  MATERIALS,
  REGIONS,
  RESOURCE_NODES,
  WORLD_CONFIG,
  WORLD_FACILITIES,
  getMaterialVisualArchetype
} from '../data/gameData.js';
import {
  createFloatingBadgeTexture,
  createGlowSpriteTexture,
  createHazardStripeTexture,
  createIndustrialSpecPlateTexture,
  createMetalHullPBR,
  createRockPBRTextures,
  createSandPBRTextures,
  createSignpostTexture,
  createSoftAOShadowTexture
} from '../graphics/textures.js';
import { bakeGpuPbrLibrary, applyWorldWeathering } from '../graphics/gpuMaterialBaker.js';
import { installPcssShadows, uninstallPcssShadows } from '../graphics/shadowPcss.js';
import { PlanarReflectionSystem } from '../graphics/planarReflection.js';
import { createSkyDome } from '../graphics/skyDome.js';
import { buildUpdraftVisuals, updateUpdraftVisuals } from './updraftVisuals.js';
import { buildDesertStations } from './worldStationsBuilder.js';
import { buildRelayBridgeAndPylons, buildOutpostAndVentLandmarks, buildMothershipWreckageAndDrones } from './worldLandmarksBuilder.js';
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
  constructor(scene, state, renderer = null) {
    this.scene = scene;
    this.state = state;
    this.renderer = renderer;

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
    this.beaconVisuals = new Map();
    this.droneBayGroup = null;
    this.droneAgents = [];
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
    this._lastShadowFocusY = NaN;
    this._lastShadowFocusZ = NaN;
    this._shadowRefreshCooldown = 0;
    this._shadowDirty = true;
    this._pcssFailedOnDriver = false;

    const isMobileInit = this.isCoarseMobileDevice();
    this.pbrLibrary = renderer
      ? bakeGpuPbrLibrary(renderer, { isMobile: isMobileInit })
      : null;

    const sandFallback = this.pbrLibrary ? null : createSandPBRTextures(256);
    const rockFallback = this.pbrLibrary ? null : createRockPBRTextures(128);
    const metalFallback = this.pbrLibrary ? null : createMetalHullPBR(256);

    this.textures = {
      sandMap: this.pbrLibrary ? this.pbrLibrary.sand.map : sandFallback.map,
      sandNormal: this.pbrLibrary ? this.pbrLibrary.sand.normalMap : sandFallback.normalMap,
      sandRoughness: this.pbrLibrary ? this.pbrLibrary.sand.ormMap : sandFallback.roughnessMap,
      sandOrm: this.pbrLibrary ? this.pbrLibrary.sand.ormMap : null,
      rockMap: this.pbrLibrary ? this.pbrLibrary.rock.map : rockFallback.map,
      rockNormal: this.pbrLibrary ? this.pbrLibrary.rock.normalMap : rockFallback.normalMap,
      rockOrm: this.pbrLibrary ? this.pbrLibrary.rock.ormMap : null,
      metalMap: this.pbrLibrary ? this.pbrLibrary.hull_white.map : metalFallback.map,
      metalNormal: this.pbrLibrary ? this.pbrLibrary.hull_white.normalMap : metalFallback.normalMap,
      metalOrm: this.pbrLibrary ? this.pbrLibrary.hull_white.ormMap : null,
      titaniumMap: this.pbrLibrary ? this.pbrLibrary.titanium_dark.map : null,
      titaniumNormal: this.pbrLibrary ? this.pbrLibrary.titanium_dark.normalMap : null,
      titaniumOrm: this.pbrLibrary ? this.pbrLibrary.titanium_dark.ormMap : null,
      orangeMap: this.pbrLibrary ? this.pbrLibrary.painted_orange.map : null,
      orangeNormal: this.pbrLibrary ? this.pbrLibrary.painted_orange.normalMap : null,
      orangeOrm: this.pbrLibrary ? this.pbrLibrary.painted_orange.ormMap : null,
      copperMap: this.pbrLibrary ? this.pbrLibrary.brushed_copper.map : null,
      copperNormal: this.pbrLibrary ? this.pbrLibrary.brushed_copper.normalMap : null,
      copperOrm: this.pbrLibrary ? this.pbrLibrary.brushed_copper.ormMap : null,
      deckMap: this.pbrLibrary ? this.pbrLibrary.station_deck.map : null,
      deckNormal: this.pbrLibrary ? this.pbrLibrary.station_deck.normalMap : null,
      deckOrm: this.pbrLibrary ? this.pbrLibrary.station_deck.ormMap : null,
      hazard: createHazardStripeTexture(),
      glowSprite: createGlowSpriteTexture(128, '#fffdf5', '#ffcb80'),
      aoShadow: createSoftAOShadowTexture(128)
    };
    this.aoShadowMat = new THREE.MeshBasicMaterial({
      map: this.textures.aoShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.62
    });

    this.planarReflection = renderer ? new PlanarReflectionSystem(renderer, scene) : null;

    this.skyDome = createSkyDome({ isMobile: this.isCoarseMobileDevice() });
    this.scene.add(this.skyDome.group);

    this._setupLightingAndSky();
    this._buildTerrain();
    this._buildBrinePools();
    this._buildDistantHorizonMesas();
    this._buildElevatedSkyPlatforms();
    this._buildDesertUpdraftsAndMotes();
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

    if (this.planarReflection) {
      this.planarReflection.registerExcludedObject(this.groups.effects);
      for (const sb of this.stationBadges) {
        if (sb.sprite) this.planarReflection.registerExcludedObject(sb.sprite);
      }
    }
  }

  _setupLightingAndSky() {
    this.scene.background = new THREE.Color('#d89c72');
    // Subtle safety distance haze; primary aerial perspective & sun shafts come from volumetric pass!
    this.scene.fog = new THREE.FogExp2('#d89c72', 0.0012);

    // Sculptural warm-sun / cool-shadow chiaroscuro ratio (prevents flat ambient washout)
    this.hemiLight = new THREE.HemisphereLight('#bfdfff', '#9e5632', 0.54);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight('#fff0d2', 2.55);
    this.sunLight.position.copy(this._sunOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 165;
    // Tight 36m radius shadow frustum centered around Milo (snapped to texel grid to prevent shimmer!)
    const d = 36;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.00042;
    this.sunLight.shadow.normalBias = 0.028;
    this.sunLight.shadow.radius = 1.15;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Cool azure rim directional light from opposite horizon for crisp 3D edge separation
    this.rimLight = new THREE.DirectionalLight('#6ec4ff', 0.52);
    this.rimLight.position.set(-45, 26, -38);
    this.scene.add(this.rimLight);
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
    const cssW = typeof window !== 'undefined' ? Math.max(1, window.innerWidth || 1280) : 1280;
    const cssH = typeof window !== 'undefined' ? Math.max(1, window.innerHeight || 720) : 720;
    const cssArea = cssW * cssH;

    // Enforce adaptive pixel-area ceiling so 2K/4K/Retina displays in Ultra stay razor-sharp
    // without exploding 21-pass post-processing fillrate into 8M-10M pixels!
    let targetDpr = 1.0;
    let maxPixels = Infinity;
    if (quality === 'low') {
      targetDpr = 1.0;
    } else if (quality === 'medium') {
      targetDpr = Math.min(nativeDpr, isMobile ? 1.45 : 1.5);
      maxPixels = isMobile ? 1150000 : 2400000;
    } else if (quality === 'ultra') {
      targetDpr = Math.min(nativeDpr, isMobile ? 1.9 : 2.0);
      maxPixels = isMobile ? 1650000 : 4200000;
    } else {
      targetDpr = Math.min(nativeDpr, isMobile ? 1.75 : 1.85);
      maxPixels = isMobile ? 1450000 : 3200000;
    }

    if (cssArea * targetDpr * targetDpr > maxPixels) {
      targetDpr = Math.max(1.0, Math.sqrt(maxPixels / cssArea));
    }
    renderer.setPixelRatio(Math.round(targetDpr * 20) / 20);
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

    if (this.pbrLibrary) {
      this.pbrLibrary.setAnisotropy(maxAniso);
    } else {
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
    }

    if (this.planarReflection) {
      this.planarReflection.setQuality(quality, isMobile);
    }

    // Install contact-hardening PCSS shadows on desktop High / Ultra; fallback cleanly on Low/Medium/Mobile or driver error
    const wantPcss = !isMobile && !this._pcssFailedOnDriver && (quality === 'high' || quality === 'ultra');
    let shadowChunkChanged = false;
    if (wantPcss) {
      shadowChunkChanged = installPcssShadows({
        frustumSize: 72.0,
        depthSpan: 155.0,
        taps: quality === 'ultra' ? 16 : 12,
        blockerTaps: 8
      });
    } else {
      shadowChunkChanged = uninstallPcssShadows();
    }
    if (shadowChunkChanged) {
      this._markShadowMaterialsNeedsUpdate();
    }

    if (quality === 'low') {
      renderer.shadowMap.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      this.sunLight.castShadow = false;
      if (this.sunLight.shadow.map) {
        this.sunLight.shadow.map.dispose();
        this.sunLight.shadow.map = null;
      }
      if (this.dustPoints) this.dustPoints.visible = false;
    } else if (quality === 'medium') {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.autoUpdate = false;
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
      // Power-of-two 2048px atlas over tight 72m frustum = 3.5cm/texel precision without NPOT 3072px bandwidth bloat or PCSS slope-bias shrinkage
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

  _markShadowMaterialsNeedsUpdate() {
    const visited = new Set();
    this.scene.traverse((obj) => {
      if (!obj || !obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m || visited.has(m)) continue;
        visited.add(m);
        if (m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) {
          m.needsUpdate = true;
        }
      }
    });
  }

  fallbackDisablePcss(renderer) {
    if (this._pcssFailedOnDriver) return;
    this._pcssFailedOnDriver = true;
    if (uninstallPcssShadows()) {
      if (renderer && renderer.shadowMap) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      this._markShadowMaterialsNeedsUpdate();
      this._shadowDirty = true;
    }
  }

  updateShadowFollow(dt, focusPos, renderer, forceEveryFrame = false) {
    if (!renderer || !renderer.shadowMap.enabled || !this.sunLight.castShadow) return;

    const fx = focusPos ? focusPos.x : 0;
    const fy = focusPos ? focusPos.y || 0 : 0;
    const fz = focusPos ? focusPos.z : 0;
    // Snap shadow camera target in 3D (X, Y, Z) to 2.0m grid steps so both Desert Basin (Y~0)
    // and Homeworld Ending Meadow (Y=420) receive crisp, shimmer-free real-time shadows!
    const snapX = Math.round(fx * 0.5) * 2.0;
    const snapY = Math.round(fy * 0.5) * 2.0;
    const snapZ = Math.round(fz * 0.5) * 2.0;

    if (
      snapX !== this._lastShadowFocusX ||
      snapY !== this._lastShadowFocusY ||
      snapZ !== this._lastShadowFocusZ
    ) {
      this._lastShadowFocusX = snapX;
      this._lastShadowFocusY = snapY;
      this._lastShadowFocusZ = snapZ;
      this.sunLight.target.position.set(snapX, snapY, snapZ);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.position.set(
        snapX + this._sunOffset.x,
        snapY + this._sunOffset.y,
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
    const size = WORLD_CONFIG.terrainSize;
    const segs = WORLD_CONFIG.terrainSegs;
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
    const cSaltPan = new THREE.Color('#e6f4f7');
    const cSaltShore = new THREE.Color('#cbe2e8');
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
      if (x > 20 && z < 18) {
        tmp.lerp(cRidge, smoothstep(20, 48, x) * smoothstep(18, 6, z));
      }
      if (z > 20 && x < 24) {
        tmp.lerp(cCanyon, smoothstep(20, 44, z) * smoothstep(24, 10, x));
      }
      if (x < -20 && z > -22) {
        tmp.lerp(cGorge, smoothstep(-20, -45, x) * smoothstep(-22, -8, z));
        if (y < -2.0) tmp.lerp(cChasm, clamp((-y - 2) / 6, 0, 1));
      }
      if (z < -20 && x > -22) {
        tmp.lerp(cBasalt, smoothstep(-20, -45, z) * smoothstep(-22, -8, x));
      }
      if (x > 16 && z > 16) {
        const rSalt = Math.hypot(x - 58.0, z - 58.0);
        const shoreBlend = smoothstep(32.0, 21.0, rSalt);
        const coreBlend = smoothstep(19.5, 11.0, rSalt);
        tmp.lerp(cSaltShore, shoreBlend * 0.85);
        tmp.lerp(cSaltPan, coreBlend * 0.92);
      }
      if (x < -16 && z < -16) {
        const rWreck = Math.hypot(x + 56.0, z + 56.0);
        const scorchBlend = smoothstep(30.0, 14.0, rWreck);
        tmp.lerp(cBasalt, scorchBlend * 0.78);
        if (rWreck < 18.0) tmp.lerp(cChasm, smoothstep(18.0, 8.0, rWreck) * 0.35);
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
      aoMap: this.textures.sandOrm,
      aoMapIntensity: 0.85,
      normalMap: this.textures.sandNormal,
      normalScale: new THREE.Vector2(0.88, 0.88),
      roughnessMap: isMobileTerrain ? null : this.textures.sandRoughness,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.04
    });

    // Multi-scale rotated UV sand + automatic slope stratified rock blend + grazing sun mica sparkle!
    mat.customProgramCacheKey = () =>
      isMobileTerrain ? 'terrain_sand_rock_mobile_v2' : 'terrain_sand_rock_desktop_v2';
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRockMap = { value: this.textures.rockMap };
      shader.uniforms.uRockNormal = { value: this.textures.rockNormal };
      shader.uniforms.uSunDirW = { value: this._sunOffset.clone().normalize() };

      shader.vertexShader =
        `varying vec3 vTerWorldPos;\nvarying vec3 vTerWorldNrm;\n` +
        shader.vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vTerWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vTerWorldNrm = normalize(mat3(modelMatrix) * normal);`
        );

      shader.fragmentShader =
        `varying vec3 vTerWorldPos;\nvarying vec3 vTerWorldNrm;\nuniform sampler2D uRockMap;\nuniform sampler2D uRockNormal;\nuniform vec3 uSunDirW;\n` +
        shader.fragmentShader.replace(
          '#include <map_fragment>',
          `
          float terSlope = smoothstep(0.10, 0.42, 1.0 - clamp(normalize(vTerWorldNrm).y, 0.0, 1.0));
          vec2 sandWarp = vec2(
            sin(vTerWorldPos.z * 0.085 + vTerWorldPos.x * 0.031),
            cos(vTerWorldPos.x * 0.079 - vTerWorldPos.z * 0.037)
          ) * 0.14;
          #ifdef USE_MAP
            vec2 uvA = mat2(0.966, 0.259, -0.259, 0.966) * vMapUv + sandWarp;
            vec2 uvB = mat2(0.766, -0.643, 0.643, 0.766) * (vMapUv * 0.39) + vec2(0.17, 0.43) - sandWarp * 0.5;
            vec4 sampA = texture2D(map, uvA);
            vec4 sampB = texture2D(map, uvB);
            vec4 sandCol = mix(sampA, sampB, 0.48);
            vec4 rockCol = texture2D(uRockMap, vTerWorldPos.xz * 0.14);
            diffuseColor *= mix(sandCol, rockCol, terSlope * 0.85);
          #endif
          `
        );

      if (!isMobileTerrain) {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <normal_fragment_maps>',
            `
            #ifdef USE_NORMALMAP_TANGENTSPACE
              vec2 nWarp = vec2(
                sin(vTerWorldPos.z * 0.085 + vTerWorldPos.x * 0.031),
                cos(vTerWorldPos.x * 0.079 - vTerWorldPos.z * 0.037)
              ) * 0.14;
              vec2 nUvA = mat2(0.966, 0.259, -0.259, 0.966) * vNormalMapUv + nWarp;
              vec2 nUvB = mat2(0.766, -0.643, 0.643, 0.766) * (vNormalMapUv * 0.39) + vec2(0.17, 0.43) - nWarp * 0.5;
              vec3 mapN1 = texture2D(normalMap, nUvA).xyz * 2.0 - 1.0;
              vec3 mapN2 = texture2D(normalMap, nUvB).xyz * 2.0 - 1.0;
              vec3 sandN = normalize(mix(mapN1, mapN2, 0.48));
              vec3 rockN = texture2D(uRockNormal, vTerWorldPos.xz * 0.14).xyz * 2.0 - 1.0;
              vec3 mapN = normalize(mix(sandN, rockN, terSlope * 0.85));
              mapN.xy *= normalScale;
              normal = normalize(tbn * mapN);
            #endif
            `
          )
          .replace(
            '#include <lights_fragment_end>',
            `#include <lights_fragment_end>
            {
              // Subtle crystalline quartz mica micro-glints on sunlit sand ripples
              vec3 viewD = normalize(cameraPosition - vTerWorldPos);
              vec3 halfV = normalize(uSunDirW + viewD);
              float glintHash = fract(sin(dot(floor(vTerWorldPos.xz * 26.0), vec2(127.1, 311.7))) * 43758.5453);
              float glint = step(0.965, glintHash) * pow(max(dot(normalize(vTerWorldNrm), halfV), 0.0), 48.0) * (1.0 - terSlope);
              reflectedLight.directSpecular += vec3(1.0, 0.90, 0.72) * glint * 0.85;
            }`
          );
      }
    };

    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    this.groups.static.add(terrain);
  }

  _buildBrinePools() {
    if (!this.planarReflection) return;

    // Declaratively instantiate all planar-reflected brine & crystalline salt mirror pools from BRINE_POOLS
    for (const cfg of BRINE_POOLS) {
      const py = getTerrainHeight(cfg.x, cfg.z, false) + (cfg.heightOffset || 0.03);
      const poolMesh = this.planarReflection.createBrinePool({
        x: cfg.x,
        y: py,
        z: cfg.z,
        radiusX: cfg.radiusX,
        radiusZ: cfg.radiusZ,
        rotationY: cfg.rotationY || 0,
        tintDeep: cfg.tintDeep,
        tintRim: cfg.tintRim,
        sandColor: cfg.sandColor,
        normalMap: this.textures.sandNormal
      });
      this.groups.static.add(poolMesh);
    }
  }

  _buildDistantHorizonMesas() {
    // 1. Sculpted Stratified Desert Mesas & Canyon Cliff Walls with baked gully AO vertex colors!
    const rand = mulberry32(772211);
    const mesaMat = applyWorldWeathering(
      new THREE.MeshStandardMaterial({
        map: this.textures.rockMap,
        aoMap: this.textures.rockOrm,
        aoMapIntensity: 0.9,
        roughnessMap: this.textures.rockOrm,
        normalMap: this.textures.rockNormal,
        normalScale: new THREE.Vector2(1.35, 1.35),
        vertexColors: true,
        roughness: 0.96,
        metalness: 0.05
      }),
      { dustAmount: 0.24, macroContrast: 0.14, groundSkirt: 0.42, keyTag: 'mesa_rock_v2' }
    );

    // Pre-sculpt 5 distinct geological mesa archetypes to share cleanly across horizon & canyon walls
    const mesaBottomRadii = [13.5, 16.2, 11.4, 17.8, 12.8];
    const mesaArchetypes = [
      createStratifiedMesaGeometry(6.2, mesaBottomRadii[0], 22, 101),
      createStratifiedMesaGeometry(8.5, mesaBottomRadii[1], 18, 202),
      createStratifiedMesaGeometry(4.8, mesaBottomRadii[2], 27, 303),
      createStratifiedMesaGeometry(9.4, mesaBottomRadii[3], 24, 404),
      createStratifiedMesaGeometry(5.6, mesaBottomRadii[4], 20, 505)
    ];

    // Outer 360° horizon ring of multi-tiered buttes & spires — pushed outside WORLD_CONFIG.boundaryRiseInner
    const horizonBuckets = mesaArchetypes.map(() => []);
    const count = 32;
    const minHorizonDist = WORLD_CONFIG.boundaryRiseInner + 6;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.1;
      const dist = minHorizonDist + rand() * 34;
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

    // Sculpted Canyon Cliff Walls use a tighter silhouette + buried skirt so they never jut 15m+ into playable corridors
    const canyonBottomRadii = [9.8, 10.6, 9.0, 11.2, 9.4];
    const canyonArchetypes = [
      createStratifiedMesaGeometry(5.2, canyonBottomRadii[0], 20, 101, true, 3.5),
      createStratifiedMesaGeometry(6.2, canyonBottomRadii[1], 18, 202, true, 3.5),
      createStratifiedMesaGeometry(4.4, canyonBottomRadii[2], 24, 303, true, 3.5),
      createStratifiedMesaGeometry(6.8, canyonBottomRadii[3], 22, 404, true, 3.5),
      createStratifiedMesaGeometry(4.8, canyonBottomRadii[4], 19, 505, true, 3.5)
    ];

    // 2. Mid-ground Sculpted Canyon Cliff Walls + 3 Sandstone Archways — Merged into 1 static shadow-casting Mesh!
    const canyonWalls = [
      // South Dry Canyon left & right red-rock walls (corridor x in [-12, 12] stays wide open)
      { x: -23.5, z: 34.0, sx: 0.72, sy: 0.58, sz: 0.95, rot: 0.4, archIdx: 0 },
      { x: 25.0, z: 38.0, sx: 0.72, sy: 0.62, sz: 0.80, rot: 2.1, archIdx: 1 },
      { x: -24.5, z: 51.0, sx: 0.82, sy: 0.68, sz: 1.05, rot: 1.3, archIdx: 2 },
      { x: 24.0, z: 53.5, sx: 0.78, sy: 0.64, sz: 0.98, rot: 3.8, archIdx: 3 },
      // East Whispering Ridge scenic canyon bluffs (corridor z in [-10, 10] stays wide open)
      { x: 38.0, z: -21.5, sx: 0.72, sy: 0.56, sz: 0.78, rot: 0.9, archIdx: 4 },
      { x: 52.0, z: 22.0, sx: 0.76, sy: 0.62, sz: 0.82, rot: 2.6, archIdx: 0 },
      // Southeast Saltstone Pass flank ridges (sealing gate_salt_flats flanks while keeping diagonal highway wide open)
      { x: 31.4, z: 16.6, sx: 0.67, sy: 0.60, sz: 0.67, rot: 0.78, archIdx: 0 },
      { x: 42.2, z: 19.2, sx: 0.68, sy: 0.58, sz: 0.68, rot: 1.4, archIdx: 2 },
      { x: 64.5, z: 25.5, sx: 0.80, sy: 0.66, sz: 0.80, rot: 0.5, archIdx: 4 },
      { x: 78.5, z: 32.5, sx: 0.88, sy: 0.72, sz: 0.88, rot: 1.9, archIdx: 3 },
      { x: 92.0, z: 40.5, sx: 0.92, sy: 0.76, sz: 0.92, rot: 2.7, archIdx: 1 },
      { x: 16.6, z: 31.4, sx: 0.62, sy: 0.60, sz: 0.62, rot: 2.35, archIdx: 1 },
      { x: 28.5, z: 68.5, sx: 0.84, sy: 0.68, sz: 0.84, rot: 1.1, archIdx: 0 },
      { x: 35.5, z: 83.5, sx: 0.90, sy: 0.74, sz: 0.90, rot: 2.8, archIdx: 2 },
      // Northwest Mothership Pass flank ridges (sealing gate_mothership_graveyard flanks cleanly!)
      { x: -31.4, z: -16.6, sx: 0.72, sy: 0.60, sz: 0.72, rot: 0.9, archIdx: 2 },
      { x: -16.6, z: -31.4, sx: 0.55, sy: 0.60, sz: 0.55, rot: 2.4, archIdx: 3 },
      { x: -42.5, z: -21.5, sx: 0.70, sy: 0.58, sz: 0.70, rot: 1.7, archIdx: 4 },
      { x: -21.5, z: -42.5, sx: 0.70, sy: 0.58, sz: 0.70, rot: 0.3, archIdx: 1 }
    ];
    const shadowMesaEntries = [];
    for (const cw of canyonWalls) {
      const geo = canyonArchetypes[cw.archIdx];
      const wy = getTerrainHeight(cw.x, cw.z, false) - 1.4;
      shadowMesaEntries.push({
        geo,
        position: [cw.x, wy, cw.z],
        rotation: [0, cw.rot, 0],
        scale: [cw.sx, cw.sy, cw.sz]
      });
      // Derive collider radius directly from the actual ground-band vertices of the sculpted cliff
      // so the player can never walk underneath an uncollided rock skirt.
      const pos = geo.attributes.position;
      const cosR = Math.cos(cw.rot);
      const sinR = Math.sin(cw.rot);
      let cliffRadius = canyonBottomRadii[cw.archIdx] * Math.max(cw.sx, cw.sz);
      let maxGroundR = 0;
      for (let vi = 0; vi < pos.count; vi++) {
        const lx = pos.getX(vi) * cw.sx;
        const ly = pos.getY(vi) * cw.sy;
        const lz = pos.getZ(vi) * cw.sz;
        const wx = cw.x + lx * cosR + lz * sinR;
        const wz = cw.z - lx * sinR + lz * cosR;
        const gy = getTerrainHeight(wx, wz, false);
        if (wy + ly >= gy - 0.5 && wy + ly <= gy + 3.0) {
          const r = Math.hypot(wx - cw.x, wz - cw.z);
          if (r > maxGroundR) maxGroundR = r;
        }
      }
      if (maxGroundR > 0) cliffRadius = maxGroundR + 0.05;
      this.colliders.push({
        id: `canyon_cliff_${cw.x}_${cw.z}`,
        x: cw.x,
        z: cw.z,
        radius: cliffRadius,
        maxY: 24.0,
        occluder: true
      });
    }

    // 3. Dramatic Natural Wind-Carved Sandstone Archways spanning East, South & Southeast Route Gateways!
    const eastArchGeo = createSandstoneArchGeometry(15.2, 8.6, 2.0, 811);
    const eastY = getTerrainHeight(26.5, 0, false);
    shadowMesaEntries.push({
      geo: eastArchGeo,
      position: [26.5, eastY - 0.5, 0],
      rotation: [0, Math.PI / 2, 0]
    });
    this.colliders.push(
      { id: 'east_arch_pier_n', x: 26.5, z: -7.6, radius: 2.05, maxY: eastY + 8.5, occluder: true },
      { id: 'east_arch_pier_s', x: 26.5, z: 7.6, radius: 2.05, maxY: eastY + 8.5, occluder: true }
    );

    const southArchGeo = createSandstoneArchGeometry(16.0, 9.2, 2.15, 922);
    const southY = getTerrainHeight(0, 27.5, false);
    shadowMesaEntries.push({
      geo: southArchGeo,
      position: [0, southY - 0.5, 27.5]
    });
    this.colliders.push(
      { id: 'south_arch_pier_w', x: -8.0, z: 27.5, radius: 2.1, maxY: southY + 9.0, occluder: true },
      { id: 'south_arch_pier_e', x: 8.0, z: 27.5, radius: 2.1, maxY: southY + 9.0, occluder: true }
    );

    const seArchGeo = createSandstoneArchGeometry(16.0, 9.0, 2.05, 955);
    const seY = getTerrainHeight(28.5, 28.5, false);
    const seYaw = Math.PI / 4;
    const seOff = 8.0 * Math.SQRT1_2;
    shadowMesaEntries.push({
      geo: seArchGeo,
      position: [28.5, seY - 0.5, 28.5],
      rotation: [0, seYaw, 0]
    });
    this.colliders.push(
      { id: 'se_arch_pier_ne', x: 28.5 + seOff, z: 28.5 - seOff, radius: 2.05, maxY: seY + 8.8, occluder: true },
      { id: 'se_arch_pier_sw', x: 28.5 - seOff, z: 28.5 + seOff, radius: 2.05, maxY: seY + 8.8, occluder: true }
    );

    const mergedCanyonAndArches = mergeTransformedGeometries(shadowMesaEntries);
    eastArchGeo.dispose();
    southArchGeo.dispose();
    seArchGeo.dispose();
    for (const g of canyonArchetypes) g.dispose();
    if (mergedCanyonAndArches) {
      const cliffBatchMesh = new THREE.Mesh(mergedCanyonAndArches, mesaMat);
      cliffBatchMesh.castShadow = true;
      cliffBatchMesh.receiveShadow = true;
      this.groups.static.add(cliffBatchMesh);
    }
  }

  _buildDesertUpdraftsAndMotes() {
    this.desertAerialMotes = [];
    this.desertMoteCooldowns = {};
    this.desertUpdraftGroup = new THREE.Group();
    this.desertUpdraftGroup.name = 'desert-updrafts-group';
    this.desertUpdraftGroup.visible = this.state.hasEquipment('jetpack');
    this.groups.effects.add(this.desertUpdraftGroup);

    this.desertUpdraftRings = buildUpdraftVisuals(
      this.desertUpdraftGroup,
      DESERT_UPDRAFTS,
      (x, z) => getTerrainHeight(x, z, false),
      { prefix: 'desert-updraft', ringRadius: 1.75, beamHeight: 17 }
    );

    this.desertMotesGroup = new THREE.Group();
    this.desertMotesGroup.name = 'desert-aerial-motes-group';
    this.desertMotesGroup.visible = this.state.hasEquipment('jetpack');
    this.groups.effects.add(this.desertMotesGroup);

    const moteCoreGeo = new THREE.OctahedronGeometry(0.46, 0);
    const moteHaloGeo = new THREE.TorusGeometry(0.72, 0.05, 6, 18);
    moteHaloGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < DESERT_AERIAL_MOTES.length; i++) {
      const m = DESERT_AERIAL_MOTES[i];
      const baseY = getTerrainHeight(m.x, m.z, false) + m.yOffset;
      const g = new THREE.Group();
      g.position.set(m.x, baseY, m.z);
      const coreMat = new THREE.MeshStandardMaterial({
        color: m.color || '#78ffd6',
        emissive: m.color || '#78ffd6',
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.35
      });
      const core = new THREE.Mesh(moteCoreGeo, coreMat);
      const halo = new THREE.Mesh(moteHaloGeo, coreMat);
      g.add(core, halo);
      g.name = `desert-aerial-mote-${m.id}`;
      this.desertMotesGroup.add(g);
      this.desertAerialMotes.push({ def: m, group: g, halo, baseY, phase: i * 0.7 });
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
          plat.radius * 0.92,
          plat.radius * 1.18,
          colHeight,
          710 + idx * 37,
          true
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
    const rockMat = applyWorldWeathering(
      new THREE.MeshStandardMaterial({
        map: this.textures.rockMap,
        aoMap: this.textures.rockOrm,
        aoMapIntensity: 0.88,
        roughnessMap: this.textures.rockOrm,
        normalMap: this.textures.rockNormal,
        normalScale: new THREE.Vector2(1.1, 1.1),
        vertexColors: true,
        color: '#d99a73',
        roughness: 0.95,
        metalness: 0.05
      }),
      { dustAmount: 0.28, macroContrast: 0.12, groundSkirt: 0.45, keyTag: 'boulder_rock_v2' }
    );

    const buckets = [[], [], []];
    const floraPlacements = [];

    // Declarative route corridor & basin clear-zone test (automatically protects all REGIONS, nodes, stations & logs!)
    const isProtectedSceneryZone = (px, pz) => {
      if (px < -37 && px > -53) return true;
      for (const reg of Object.values(REGIONS)) {
        if (Array.isArray(reg.clearZones)) {
          for (const cz of reg.clearZones) {
            if (Math.hypot(px - cz.x, pz - cz.z) < cz.radius) return true;
          }
        }
        if (reg.corridor) {
          const [ax, az] = reg.corridor.from;
          const [bx, bz] = reg.corridor.to;
          const abx = bx - ax;
          const abz = bz - az;
          const lenSq = abx * abx + abz * abz || 1;
          const t = clamp(((px - ax) * abx + (pz - az) * abz) / lenSq, 0, 1);
          const distSeg = Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
          if (distSeg < (reg.corridor.halfWidth || 5.6)) return true;
        }
      }
      for (const n of RESOURCE_NODES) {
        if (Math.hypot(px - n.x, pz - n.z) < 3.8) return true;
      }
      for (const st of WORLD_FACILITIES.stations) {
        if (Math.hypot(px - st.x, pz - st.z) < 4.5) return true;
      }
      for (const log of Object.values(CREW_LOGS)) {
        if (Math.hypot(px - log.position.x, pz - log.position.z) < 3.6) return true;
      }
      return false;
    };

    for (let i = 0; i < 165; i++) {
      const angle = rand() * Math.PI * 2;
      const dist = 16 + rand() * 70;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      if (isProtectedSceneryZone(x, z)) continue;

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

        this.colliders.push({
          id: `rock_${bIdx}_${p.id}`,
          x: p.x,
          z: p.z,
          radius: p.scaleXZ * 0.88,
          maxY: p.y + p.scaleY * 1.15,
          occluder: p.scaleXZ >= 1.45
        });
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
    return buildDesertStations(this);
  }

  _buildRegionRoutesAndSignposts() {
    // Declaratively build all directional route signposts & glowing beacon trails from REGIONS
    const signs = [];
    const beaconRoutes = [];
    for (const reg of Object.values(REGIONS)) {
      if (reg.signpost) signs.push(reg.signpost);
      if (reg.beaconTrail) beaconRoutes.push(reg.beaconTrail);
    }

    const postMat = new THREE.MeshStandardMaterial({
      color: '#3c4859',
      roughness: 0.48,
      metalness: 0.65
    });
    const postEntries = [];
    const poleGeo = new THREE.CylinderGeometry(0.065, 0.105, 1.44, 10);
    const boardGeo = new RoundedBoxGeometry(2.05, 0.68, 0.14, 3, 0.04);

    for (const s of signs) {
      const g = new THREE.Group();
      const y = getTerrainHeight(s.x, s.z, false);
      g.position.set(s.x, y, s.z);
      g.rotation.y = s.rotY;

      postEntries.push({
        geo: poleGeo,
        position: [s.x, y + 0.72, s.z]
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
      this.colliders.push({ id: `signpost_${s.x}_${s.z}`, x: s.x, z: s.z, radius: 0.45 });
    }

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
          position: [bx, by + 0.84, bz]
        });
        this.colliders.push({ id: `beacon_${bx}_${bz}`, x: bx, z: bz, radius: 0.24 });
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
    const gatedRegions = Object.values(REGIONS).filter((r) => Boolean(r.gateBarrier));
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

    for (const reg of gatedRegions) {
      const rId = reg.id;
      const gb = reg.gateBarrier;
      const gy = getTerrainHeight(gb.x, gb.z, false);
      // Supports any cardinal or diagonal gate angle!
      const gateYaw = gb.angle !== undefined ? gb.angle : Math.atan2(gb.x, gb.z);
      const cosY = Math.cos(gateYaw);
      const sinY = Math.sin(gateYaw);

      const gateGroup = new THREE.Group();
      gateGroup.position.set(gb.x, gy, gb.z);
      gateGroup.rotation.y = gateYaw;

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

      const gateActiveFn = () => !this.state.isRegionUnlocked(rId);
      this.colliders.push(
        { id: `gate_${rId}`, x: gb.x, z: gb.z, radius: 3.6, activeFn: gateActiveFn },
        {
          id: `gate_${rId}_p1`,
          x: gb.x - 3.4 * cosY,
          z: gb.z + 3.4 * sinY,
          radius: 0.62,
          activeFn: gateActiveFn
        },
        {
          id: `gate_${rId}_p2`,
          x: gb.x + 3.4 * cosY,
          z: gb.z - 3.4 * sinY,
          radius: 0.62,
          activeFn: gateActiveFn
        }
      );

    }
  }

  _buildRelayBridgeAndPylons() {
    return buildRelayBridgeAndPylons(this);
  }

  _buildOutpostAndVentLandmarks() {
    return buildOutpostAndVentLandmarks(this);
  }

  _buildMothershipWreckageAndDrones() {
    return buildMothershipWreckageAndDrones(this);
  }

  _buildCrewLogs() {
    const standGeo = new THREE.CylinderGeometry(0.18, 0.34, 0.96, 12);
    const hingeGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.20, 10);
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

      standEntries.push(
        {
          geo: standGeo,
          position: [log.position.x, ly + 0.48, log.position.z]
        },
        {
          geo: hingeGeo,
          position: [log.position.x, ly + 0.98, log.position.z],
          rotation: [-0.35, 0, 0]
        }
      );

      const screen = new THREE.Mesh(
        screenGeo,
        new THREE.MeshStandardMaterial({
          color: '#78f5ff',
          emissive: '#00b7ff',
          emissiveIntensity: 2.0,
          roughness: 0.2
        })
      );
      screen.position.set(0, 1.08, 0.03);
      screen.rotation.x = -0.35;
      lg.add(screen);
      this.groups.dynamic.add(lg);
      this.logVisuals.set(log.id, { group: lg, screen });
      this.colliders.push({ id: `log_${log.id}`, x: log.position.x, z: log.position.z, radius: 0.46 });
    }

    const mergedStands = mergeTransformedGeometries(standEntries);
    standGeo.dispose();
    hingeGeo.dispose();
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
      const matArch = getMaterialVisualArchetype(matDef);

      if (matArch === 'crystal') {
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

        if (matDef.hasOrbitHalo) {
          orbitRing = new THREE.Mesh(lumenHaloGeo, lumenHaloMat);
          orbitRing.position.y = 0.78;
          orbitRing.rotation.x = 1.1;
          cluster.add(orbitRing);
        }
      } else if (matArch === 'scrap') {
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
      } else if (matArch === 'gel') {
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
        // === TYPE C: Rich Metallic / Crystalline Evaporite Mineral Ore Veins ===
        const isZeolite = matArch === 'zeolite';
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

      // Solid physical colliders for ALL 47 resource nodes (surface, subsurface rim & sky-mesa)
      // so Milo stops cleanly beside outcrops/fissures to harvest/drill instead of clipping inside them!
      const minY = plat ? plat.topY - 0.5 : undefined;
      if (node.subsurface) {
        this.colliders.push({
          id: `res_sub_${node.id}`,
          x: node.x,
          z: node.z,
          radius: 0.62,
          minY,
          maxY: ny + 0.85
        });
      } else {
        const maxY = ny + 1.55;
        this.colliders.push(
          {
            id: `res_base_${node.id}`,
            x: node.x,
            z: node.z,
            radius: 0.48,
            minY,
            maxY
          },
          {
            id: `res_full_${node.id}`,
            x: node.x,
            z: node.z,
            radius: 0.84,
            minY,
            maxY,
            activeFn: () => this.state.isNodeAvailable(node.id)
          }
        );
      }
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
        event === 'resource_gathered' ||
        event === 'node_regrown' ||
        event === 'repair_installed' ||
        event === 'level_completed' ||
        event === 'state_reset'
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

    const hasJetpack = this.state.hasEquipment('jetpack');
    if (this.desertUpdraftGroup) this.desertUpdraftGroup.visible = hasJetpack;
    if (this.desertMotesGroup) this.desertMotesGroup.visible = hasJetpack;
    if (hasJetpack) {
      updateUpdraftVisuals(this.desertUpdraftRings, elapsed, 0.44);
      if (this.desertAerialMotes) {
        for (let i = 0; i < this.desertAerialMotes.length; i++) {
          const m = this.desertAerialMotes[i];
          const cd = this.desertMoteCooldowns?.[m.def.id] || 0;
          if (cd > 0) {
            this.desertMoteCooldowns[m.def.id] = Math.max(0, cd - dt);
          }
          const active = (this.desertMoteCooldowns?.[m.def.id] || 0) <= 0;
          m.group.visible = active;
          if (active) {
            m.group.position.y = m.baseY + Math.sin(elapsed * 2.2 + m.phase) * 0.35;
            m.group.rotation.y += dt * 1.4;
            m.halo.rotation.x = Math.sin(elapsed * 1.6 + m.phase) * 0.55;
          }
        }
      }
    }

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
      if (this.observatoryTurntable) {
        this.observatoryTurntable.rotation.y += dt * 0.85;
      }
      if (!this._obsLit) {
        this._obsLit = true;
        this.observatoryDishTop.material.emissive.set('#2b6cff');
      }
    } else {
      this._obsLit = false;
    }

    const busyQueue = this.state.craftingQueue.length > 0;
    if (this.furnaceBatteryGroup) {
      const hasBat = this.state.hasEquipment('battery');
      this.furnaceBatteryGroup.visible = hasBat;
      if (hasBat && this.furnaceBatteryGlowMat) {
        const solarInfo = this.state.getSolarStatusInfo();
        const discharging = solarInfo.stateTag === 'buffered';
        this.furnaceBatteryGlowMat.color.set(discharging ? '#5ef2ff' : '#ffd24d');
        this.furnaceBatteryGlowMat.emissive.set(discharging ? '#00b7ff' : '#ffaa00');
        this.furnaceBatteryGlowMat.emissiveIntensity = discharging
          ? 2.2 + Math.sin(elapsed * 7.0) * 0.45
          : 1.5 + Math.sin(elapsed * 2.2) * 0.2;
      }
    }
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
    if (this.purifierRings && this.purifierRings.length > 0) {
      const spin = dt * (busyQueue ? 3.5 : 0.8);
      for (const pr of this.purifierRings) {
        pr.rotation.z += spin;
      }
    } else if (this.purifierRing) {
      this.purifierRing.rotation.z += dt * (busyQueue ? 3.5 : 0.8);
    }

    // Update Post-Game Climate Telemetry Beacons & Autonomous Mining Drone Patrols!
    const showPostBeacons = Boolean(this.state.launchedHome);
    for (const [bId, bv] of this.beaconVisuals.entries()) {
      bv.group.visible = showPostBeacons;
      if (!showPostBeacons) continue;
      const active = this.state.isMechanismNodeActive('weather_beacons', bId);
      bv.orb.rotation.y += dt * (active ? 2.6 : 0.7);
      bv.ring.rotation.z += dt * (active ? 2.0 : 0.4);
      if (bv._lastActive !== active) {
        bv._lastActive = active;
        bv.orbMat.color.set(active ? '#66ffc2' : '#788ca3');
        bv.orbMat.emissive.set(active ? '#0ec47a' : '#1b354d');
        bv.orbMat.emissiveIntensity = active ? 2.4 : 1.1;
      }
    }

    if (this.droneBayGroup) {
      const hasDrones = this.state.hasEquipment('drone_fleet');
      this.droneBayGroup.visible = hasDrones;
      if (hasDrones) {
        for (const da of this.droneAgents) {
          const a = elapsed * 0.85 + da.phaseOffset;
          const rOrbit = 4.2 + Math.sin(a * 0.5) * 2.6;
          const drOrbit = 1.3 * Math.cos(a * 0.5);
          const cosA = Math.cos(a);
          const sinA = Math.sin(a);
          da.group.position.set(
            cosA * rOrbit,
            1.85 + Math.sin(elapsed * 3.2 + da.phaseOffset) * 0.26,
            sinA * rOrbit
          );
          const tx = drOrbit * cosA - rOrbit * sinA;
          const tz = drOrbit * sinA + rOrbit * cosA;
          da.group.rotation.order = 'YXZ';
          da.group.rotation.y = Math.atan2(tx, tz);
          da.group.rotation.x = 0.14 + Math.cos(elapsed * 3.2 + da.phaseOffset) * 0.07;
          da.group.rotation.z = -0.18;

          if (da.rotors) {
            for (let ri = 0; ri < da.rotors.length; ri++) {
              da.rotors[ri].rotation.y = elapsed * (ri === 0 ? 22.0 : -22.0);
            }
          }
          if (da.cargo) {
            da.cargo.rotation.y = elapsed * 1.8 + da.phaseOffset;
            da.cargo.position.y = -0.35 + Math.sin(elapsed * 4.5 + da.phaseOffset) * 0.022;
          }
          if (da.beam) {
            const beamPulse = 0.92 + Math.sin(elapsed * 5.0 + da.phaseOffset) * 0.08;
            da.beam.scale.set(beamPulse, 1, beamPulse);
          }
        }
      }
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
        const nearDrillResonance = Boolean(
          robotPos && distSq <= 196 && this.state.hasEquipment('drill')
        );
        rv.cluster.position.y = available
          ? (sonarLit ? -0.12 : nearDrillResonance ? -0.20 : -0.28) +
            (isClose ? Math.sin(elapsed * 3.2 + rv.node.x) * 0.03 : 0)
          : -0.42;
        if (rv.sonarEchoRing) {
          rv.sonarEchoRing.visible = available && (sonarLit || nearDrillResonance);
          if (rv.sonarEchoRing.visible) {
            const p = (elapsed * (sonarLit ? 1.6 : 0.85)) % 1;
            rv.sonarEchoRing.position.y = 0.2 + p * (sonarLit ? 1.4 : 0.72);
            rv.sonarEchoRing.scale.setScalar(0.85 + p * (sonarLit ? 0.9 : 0.45));
            rv.sonarEchoRing.material.opacity = (1 - p) * (sonarLit ? 0.9 : 0.42);
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
