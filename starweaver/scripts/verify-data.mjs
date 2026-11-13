import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  CREW_LOGS,
  ELEVATED_PLATFORMS,
  LEVELS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  WORLD_FACILITIES
} from '../src/data/gameData.js';
import { GameState } from '../src/state/gameState.js';
import { GuidanceSystem } from '../src/systems/guidanceSystem.js';
import { AtmosphereSystem } from '../src/systems/atmosphereSystem.js';
import { KHARIS_PLANET_DIR } from '../src/graphics/skyDome.js';
import { CameraController } from '../src/scene/cameraController.js';
import { WorldBuilder } from '../src/scene/worldBuilder.js';
import { SpacecraftBuilder } from '../src/scene/spacecraftBuilder.js';
import { getTerrainHeight } from '../src/utils/math.js';
import { ARTIFACT_RE, findLatestArtifact } from './dist-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function computeRawRequirements(itemId, count = 1, maxLevel = 5) {
  const mat = MATERIALS[itemId];
  assert(mat, `Unknown material: ${itemId}`);
  if (mat.category === 'raw') {
    return { [itemId]: count };
  }
  const recipe = RECIPES.find((r) => r.output.id === itemId);
  assert(recipe, `Missing recipe for non-raw item: ${itemId}`);
  assert(
    recipe.unlockLevel <= maxLevel,
    `Recipe ${recipe.id} unlocks at level ${recipe.unlockLevel} > level ${maxLevel}`
  );

  const totals = {};
  const batches = Math.ceil(count / recipe.output.count);
  for (const inp of recipe.inputs) {
    const sub = computeRawRequirements(inp.id, inp.count * batches, maxLevel);
    for (const [rawId, rawCnt] of Object.entries(sub)) {
      totals[rawId] = (totals[rawId] || 0) + rawCnt;
    }
  }
  return totals;
}

function verifyLevelDataAndAvailability() {
  const s = new GameState();
  for (const lvl of LEVELS) {
    s.currentLevel = lvl.level;
    const rawNeeded = computeRawRequirements(lvl.requiredComponentId, 1, lvl.level);

    for (const [rawId, neededQty] of Object.entries(rawNeeded)) {
      const accessibleNodes = RESOURCE_NODES.filter(
        (n) => n.materialId === rawId && s.isRegionUnlocked(n.region)
      );
      const singleSweepYield = accessibleNodes.reduce((sum, n) => sum + n.yield, 0);
      assert(
        singleSweepYield >= neededQty,
        `Level ${lvl.level} needs ${neededQty} ${rawId}, but single pass in unlocked regions only yields ${singleSweepYield}!`
      );
    }
  }
  console.log('✓ All 5 levels have abundant deterministic raw resources in unlocked regions.');
}

function verifyFullGameplaySimulation() {
  const state = new GameState();
  assert.equal(state.currentLevel, 1);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 0);

  // Crafting without materials must fail safely
  const failCraft = state.startCraft('craft_power_core');
  assert.equal(failCraft.ok, false);
  assert.equal(failCraft.reason, 'missing_materials');

  // Helper to gather from real nodes and craft through queue
  const gatherMaterial = (matId, minNeeded) => {
    while (state.getItemCount(matId) < minNeeded) {
      const node = RESOURCE_NODES.find(
        (n) =>
          n.materialId === matId &&
          state.isRegionUnlocked(n.region) &&
          state.isNodeAvailable(n.id)
      );
      if (!node) {
        // Advance time to allow natural mineral replenishment if needed
        state.update(25);
        continue;
      }
      const res = state.harvestNode(node.id);
      assert.equal(res.ok, true);
    }
  };

  const runRecipe = (recipeId) => {
    const rec = RECIPES.find((r) => r.id === recipeId);
    for (const inp of rec.inputs) {
      if (MATERIALS[inp.id].category === 'raw') {
        gatherMaterial(inp.id, inp.count);
      }
    }
    const res = state.startCraft(recipeId);
    assert.equal(res.ok, true, `Expected recipe ${recipeId} to start cleanly: ${res.reason}`);
    // Advance queue completion
    for (let i = 0; i < 30; i++) state.update(0.1);
  };

  // --- Level 1: Restore Power ---
  const guidance = new GuidanceSystem(state);
  // Initially at spawn (4.8, 5.8), guidance must point to an accessible Crash Basin ore node!
  const wp0 = guidance.resolveActiveWaypoint({ x: 4.8, z: 5.8 });
  assert(wp0 && wp0.kind === 'gather', 'Initial Level 1 waypoint must guide player to gather ore');

  runRecipe('smelt_iron_plate');
  runRecipe('smelt_iron_plate');
  runRecipe('smelt_copper_ingot');
  runRecipe('smelt_copper_ingot');

  // Once all plates & ingots are smelted, guidance must point to Fabrication Station!
  const wpFab = guidance.resolveActiveWaypoint({ x: 4.8, z: 5.8 });
  assert(wpFab && wpFab.kind === 'station', 'After smelting, guidance must point to Fabricator');

  runRecipe('craft_power_core');

  // Once Power Core is crafted, guidance must point to Starboard Power Bay!
  const wpInstall = guidance.resolveActiveWaypoint({ x: 4.8, z: 5.8 });
  assert(wpInstall && wpInstall.kind === 'repair', 'After crafting Power Core, guidance must point to Repair Bay');

  // Duplicate main component craft must be prevented!
  const dupPower = state.startCraft('craft_power_core');
  assert.equal(dupPower.ok, false);
  assert.equal(dupPower.reason, 'already_crafted_main');

  // Installing into wrong target must fail!
  const wrongInstall = state.installComponent('repair_comms');
  assert.equal(wrongInstall.ok, false);

  // Side task check & idempotency
  state.readCrewLog('log_1');
  const ironAfterFirstLog = state.getItemCount('iron_plate');
  state.readCrewLog('log_1'); // Re-reading must NOT grant duplicate reward!
  assert.equal(state.getItemCount('iron_plate'), ironAfterFirstLog);

  // Install Power Core -> Advances to Level 2
  const r1 = state.installComponent('repair_power');
  assert.equal(r1.ok, true);
  assert.equal(state.currentLevel, 2);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 1);

  // --- Level 2: Repair Communications ---
  runRecipe('smelt_quartz_lens');
  runRecipe('smelt_quartz_lens');
  runRecipe('smelt_silver_wire');
  runRecipe('smelt_silver_wire');
  runRecipe('smelt_copper_ingot');
  runRecipe('craft_comm_array');
  const r2 = state.installComponent('repair_comms');
  assert.equal(r2.ok, true);
  assert.equal(state.currentLevel, 3);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 2);

  // --- Level 3: Geo-Drilling & Restore Life Support ---
  // Attempting to harvest subsurface Zeolite BEFORE crafting Geo-Drill must fail safely!
  const prematureDrill = state.harvestNode('n_dc_zeo_1');
  assert.equal(prematureDrill.ok, false);
  assert.equal(prematureDrill.reason, 'missing_drill');
  assert.equal(state.triggerSonarScan(0, 42).ok, false);

  // Craft Spiral Geo-Drill first!
  if (state.getItemCount('iron_plate') < 1) runRecipe('smelt_iron_plate');
  runRecipe('smelt_copper_ingot');
  runRecipe('smelt_quartz_lens');
  runRecipe('craft_geo_drill');
  assert.equal(state.hasEquipment('drill'), true);
  assert.equal(state.startCraft('craft_geo_drill').reason, 'already_equipped');

  // Sonar scan in Dry Canyon must now succeed and detect subsurface fissures!
  const sonarRes = state.triggerSonarScan(0, 42, 42);
  assert.equal(sonarRes.ok, true);
  assert(sonarRes.count >= 4, 'Sonar scan in Dry Canyon must locate subsurface veins');

  runRecipe('smelt_filter_core');
  runRecipe('smelt_filter_core');
  if (state.getItemCount('iron_plate') < 1) runRecipe('smelt_iron_plate');
  runRecipe('craft_bio_filter');

  runRecipe('smelt_coolant_canister');
  runRecipe('smelt_coolant_canister');
  runRecipe('smelt_copper_ingot');
  runRecipe('craft_thermal_regulator');

  runRecipe('craft_life_support_unit');
  const r3 = state.installComponent('repair_lifesupport');
  assert.equal(r3.ok, true);
  assert.equal(state.currentLevel, 4);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 3);

  // --- Level 4: Sky Flight (Jetpack) & Repair Navigation ---
  // Craft Micro-Gravity Thruster Wings first!
  if (state.getItemCount('iron_plate') < 1) runRecipe('smelt_iron_plate');
  if (state.getItemCount('silver_wire') < 1) runRecipe('smelt_silver_wire');
  runRecipe('smelt_coolant_canister');
  runRecipe('craft_jetpack_wing');
  assert.equal(state.hasEquipment('jetpack'), true);
  assert.equal(state.startCraft('craft_jetpack_wing').reason, 'already_equipped');

  assert.equal(state.isBridgeExtended(), false);
  state.alignPylon('pylon_north');
  state.alignPylon('pylon_south');
  assert.equal(state.isBridgeExtended(), true);

  runRecipe('smelt_titanium_alloy');
  runRecipe('smelt_titanium_alloy');
  runRecipe('smelt_silver_wire');
  runRecipe('smelt_copper_ingot');
  runRecipe('craft_gyro_circuit');
  runRecipe('smelt_quartz_lens');
  runRecipe('craft_starlight_prism');
  runRecipe('craft_nav_computer');
  const r4 = state.installComponent('repair_nav');
  assert.equal(r4.ok, true);
  assert.equal(state.currentLevel, 5);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 4);

  // --- Level 5: Repair Propulsion, Pre-Flight Checks & Launch Home ---
  runRecipe('smelt_titanium_alloy');
  runRecipe('smelt_titanium_alloy');
  runRecipe('smelt_iron_plate');
  runRecipe('smelt_iron_plate');
  runRecipe('smelt_copper_ingot');
  runRecipe('smelt_copper_ingot');
  runRecipe('craft_thrust_nozzle');
  runRecipe('craft_thrust_nozzle');

  runRecipe('smelt_coolant_canister');
  runRecipe('smelt_coolant_canister');
  runRecipe('smelt_plasma_rod');
  runRecipe('smelt_plasma_rod');

  runRecipe('craft_propulsion_drive');
  const r5 = state.installComponent('repair_propulsion');
  assert.equal(r5.ok, true);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 5);

  // Cannot launch before completing all 3 pre-flight checks!
  assert.equal(state.canLaunchSpacecraft(), false);
  for (const chk of PREFLIGHT_CHECKS) {
    assert.equal(state.completePreflightCheck(chk.id).ok, true);
  }
  assert.equal(state.canLaunchSpacecraft(), true);
  const launchRes = state.triggerLaunchAndCompleteGame();
  assert.equal(launchRes.ok, true);
  assert.equal(state.launchedHome, true);
  assert.equal(state.getCurrentLevelProgress(5).fraction, 1);

  // Post-game Free Roam guidance should point to remaining unread Crew Logs!
  const freeRoamWp = guidance.resolveActiveWaypoint({ x: 0, z: 0 });
  assert(
    freeRoamWp && freeRoamWp.kind === 'log',
    'Post-game Free Roam guidance should help locate remaining Crew Logs'
  );

  // Verify GuidanceSystem net DAG raw deficit aggregation on multi-branch Nav Computer!
  const navCheckState = new GameState();
  navCheckState.currentLevel = 4;
  navCheckState.equipment.drill = true;
  navCheckState.equipment.jetpack = true;
  navCheckState.pylonsAligned.pylon_north = true;
  navCheckState.pylonsAligned.pylon_south = true;
  navCheckState.inventory = {
    titanium_alloy: 2,
    silver_wire: 1,
    copper_ingot: 1,
    quartz_lens: 1,
    lumen_core: 2 // Gyro needs 1 + Prism needs 2 = 3 total! Only 2 held -> MUST ask for 1 more lumen_core!
  };
  const navGuidance = new GuidanceSystem(navCheckState);
  const lumenWp = navGuidance.resolveActiveWaypoint({ x: -56, z: 0 });
  assert.equal(
    lumenWp?.kind,
    'gather',
    'Guidance DAG must detect shared Lumen Shard deficit (2 held < 3 total needed across Gyro + Prism)'
  );

  console.log('✓ Full 5-level main path + DAG net-deficit guidance + side-task idempotency + launch verified!');
}

function verifyStandaloneHtmlOfflinePurity() {
  const htmlPath = findLatestArtifact(path.join(rootDir, 'dist'));
  assert(htmlPath, 'dist/starweaver-<version>-<YYYYMMDD-HHmmss>.html not found');
  const base = path.basename(htmlPath);
  const match = base.match(ARTIFACT_RE);
  assert(match, `unexpected artifact name: ${base}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const [, version, day, clock] = match;
  const isoPrefix = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${clock.slice(0, 2)}:${clock.slice(2, 4)}:${clock.slice(4, 6)}`;

  assert(html.includes(`<meta name="version" content="${version}" />`), 'version meta does not match the file name');
  assert(html.includes(`<meta name="build-time" content="${isoPrefix}`), 'build-time meta does not match the file name');
  assert(!/<script[^>]+src=/i.test(html), 'Standalone HTML must not have external <script src>');
  assert(!/<link[^>]+href=/i.test(html), 'Standalone HTML must not have external <link href>');
  assert(!/@import\s+url/i.test(html), 'Standalone HTML must not have CSS @import');
  console.log(`✓ Standalone HTML offline purity verified (${base}).`);
}

function installHeadlessCanvasStub() {
  if (typeof globalThis.document !== 'undefined') return;
  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const ctxStub = {
    fillStyle: '',
    strokeStyle: '',
    shadowColor: '',
    shadowBlur: 0,
    lineWidth: 1,
    lineCap: 'round',
    lineJoin: 'round',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    font: '',
    textAlign: 'left',
    textBaseline: 'middle',
    save: noop,
    restore: noop,
    scale: noop,
    translate: noop,
    rotate: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    fillText: noop,
    createLinearGradient: () => gradStub,
    createRadialGradient: () => gradStub
  };
  globalThis.document = {
    addEventListener: noop,
    createElement(tag) {
      if (tag === 'canvas') {
        return { width: 256, height: 256, getContext: () => ctxStub };
      }
      return {};
    }
  };
}

function verifyAntiClippingAndInteractReachability() {
  installHeadlessCanvasStub();

  const state = new GameState();
  state.currentLevel = 5;
  state.equipment.drill = true;
  state.equipment.jetpack = true;
  state.pylonsAligned.pylon_north = true;
  state.pylonsAligned.pylon_south = true;
  state.repairs.repair_propulsion = true;
  for (const chk of PREFLIGHT_CHECKS) state.preflightDone[chk.id] = true;

  const scene = new THREE.Scene();
  const world = new WorldBuilder(scene, state, null);
  const spacecraft = new SpacecraftBuilder(scene, state, null, world.skyDome, null);
  const allColliders = [...world.colliders, ...spacecraft.getColliders()];
  const robotRadius = 0.62;

  assert(
    allColliders.length >= 200,
    `Expected comprehensive anti-clip collider coverage (>=200), got ${allColliders.length}`
  );

  // Helper: relax a test stand point outside all active colliders at height y (3-pass solver)
  const relaxPoint = (startX, startZ, y) => {
    let nx = startX;
    let nz = startZ;
    for (let iter = 0; iter < 4; iter++) {
      for (const plat of ELEVATED_PLATFORMS) {
        if (y < plat.topY - 0.55) {
          const baseY = getTerrainHeight(plat.x, plat.z, false);
          const hFrac = Math.max(0, Math.min(1, (y - baseY) / Math.max(1.5, plat.topY - baseY)));
          const bottomMult = plat.style === 'basalt' ? 1.24 : 1.26;
          const effR = plat.radius * (bottomMult + (1.02 - bottomMult) * hFrac);
          const dx = nx - plat.x;
          const dz = nz - plat.z;
          const minD = robotRadius + effR;
          const d = Math.hypot(dx, dz) || 0.001;
          if (d < minD) {
            nx += (dx / d) * (minD - d);
            nz += (dz / d) * (minD - d);
          }
        }
      }
      for (const col of allColliders) {
        if (col.activeFn && !col.activeFn()) continue;
        const fullH = col.id && (col.id.startsWith('gate_') || col.id.startsWith('canyon_cliff_'));
        if (!fullH && col.minY !== undefined && y < col.minY) continue;
        if (!fullH && col.maxY !== undefined && y > col.maxY) continue;
        if (
          !fullH &&
          col.minY === undefined &&
          col.maxY === undefined &&
          !col.id?.startsWith('ship_') &&
          y > getTerrainHeight(col.x, col.z, false) + 3.2
        ) {
          continue;
        }
        const dx = nx - col.x;
        const dz = nz - col.z;
        const minD = robotRadius + col.radius;
        const d = Math.hypot(dx, dz) || 0.001;
        if (d < minD) {
          nx += (dx / d) * (minD - d);
          nz += (dz / d) * (minD - d);
        }
      }
    }
    return { x: nx, z: nz };
  };

  const assertTargetReachable = (label, tx, tz, ty, interactRange) => {
    let bestStandDist = Infinity;
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const probeX = tx + Math.cos(ang) * 1.65;
      const probeZ = tz + Math.sin(ang) * 1.65;
      const stood = relaxPoint(probeX, probeZ, ty);
      const d = Math.hypot(stood.x - tx, stood.z - tz);
      if (d < bestStandDist) bestStandDist = d;
    }
    assert(
      bestStandDist <= interactRange - 0.35,
      `Interact target "${label}" blocked by colliders! Closest valid stand=${bestStandDist.toFixed(2)}m, maxRange=${interactRange}m`
    );
  };

  // 1. Verify all 5 Spacecraft Repair Bays are reachable outside wing/hull colliders
  for (const t of Object.values(REPAIR_TARGETS)) {
    const gy = getTerrainHeight(t.position.x, t.position.z, true);
    assertTargetReachable(`repair:${t.id}`, t.position.x, t.position.z, gy, 3.4);
  }

  // 2. Verify all 3 Pre-Flight Checks + Boarding Ramp
  for (const chk of PREFLIGHT_CHECKS) {
    const gy = getTerrainHeight(chk.position.x, chk.position.z, true);
    assertTargetReachable(`preflight:${chk.id}`, chk.position.x, chk.position.z, gy, 3.1);
  }
  const ramp = WORLD_FACILITIES.boarding_ramp;
  assertTargetReachable('boarding_ramp', ramp.x, ramp.z, getTerrainHeight(ramp.x, ramp.z, true), 3.5);

  // 3. Verify all 3 Workstations
  for (const st of [WORLD_FACILITIES.furnace, WORLD_FACILITIES.fabricator, WORLD_FACILITIES.outpost_purifier]) {
    assertTargetReachable(`station:${st.id}`, st.x, st.z, getTerrainHeight(st.x, st.z, true), 3.6);
  }

  // 4. Verify all 47 Resource Nodes (surface, subsurface & sky-mesa)
  for (const node of RESOURCE_NODES) {
    const plat = node.platformId ? ELEVATED_PLATFORMS.find((p) => p.id === node.platformId) : null;
    const ny = plat ? plat.topY : getTerrainHeight(node.x, node.z, true);
    assertTargetReachable(`node:${node.id}`, node.x, node.z, ny, 3.0);
  }

  // 5. Verify Crew Logs, Cairns, Pylons & Observatory
  for (const log of Object.values(CREW_LOGS)) {
    assertTargetReachable(`log:${log.id}`, log.position.x, log.position.z, getTerrainHeight(log.position.x, log.position.z, true), 2.9);
  }
  for (const c of WORLD_FACILITIES.cairns) {
    assertTargetReachable(`cairn:${c.id}`, c.x, c.z, getTerrainHeight(c.x, c.z, true), 3.0);
  }
  for (const p of WORLD_FACILITIES.pylons) {
    const plat = p.platformId ? ELEVATED_PLATFORMS.find((pl) => pl.id === p.platformId) : null;
    const py = plat ? plat.topY : getTerrainHeight(p.x, p.z, true);
    assertTargetReachable(`pylon:${p.id}`, p.x, p.z, py, 3.2);
  }
  const obs = WORLD_FACILITIES.observatory;
  assertTargetReachable('observatory', obs.x, obs.z, getTerrainHeight(obs.x, obs.z, true), 3.4);

  console.log(`✓ Anti-clipping & interactability verified across ${allColliders.length} colliders and all 67 interactive targets!`);
}

function verifyAtmosphereCameraAndSaveEdgeCases() {
  // 1. Setup headless Three.js scene, mock probes & storage
  const memStore = new Map();
  globalThis.window = {
    innerWidth: 1440,
    innerHeight: 900,
    addEventListener() {},
    localStorage: {
      getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
      setItem: (k, v) => memStore.set(k, String(v)),
      removeItem: (k) => memStore.delete(k)
    }
  };

  try {
    const state = new GameState();
    state.resetState(true);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#d89c72', 0.0012);
    scene.background = new THREE.Color('#d89c72');
    const environments = {
      desert: { id: 'probe_desert_day' },
      desertNight: { id: 'probe_desert_night' },
      homeworld: { id: 'probe_homeworld_meadow' }
    };
    const world = new WorldBuilder(scene, state, null);
    const ship = new SpacecraftBuilder(scene, state, environments, world.skyDome, null);
    const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.25, 360);
    const mockDom = {
      addEventListener() {},
      hasPointerCapture: () => false,
      releasePointerCapture() {}
    };
    const camCtrl = new CameraController(camera, mockDom, state);
    camCtrl.setOccluders([...world.colliders, ...ship.getColliders()]);

    const robotStub = {
      position: new THREE.Vector3(4.8, 0.2, 5.8),
      group: new THREE.Group(),
      groundShadowMesh: new THREE.Mesh(),
      headlampIntensity: 0,
      setNightHeadlamp(s) {
        this.headlampIntensity = s;
      },
      triggerAction() {},
      teleportToHubSafe() {
        this.position.set(4.8, 0.2, 5.8);
      }
    };
    const atmo = new AtmosphereSystem({
      state,
      scene,
      environments,
      world,
      robot: robotStub,
      postProcessing: null,
      sound: null,
      weatherParticles: null
    });

    // A. Title Screen Idle Isolation: 300s on Title Screen MUST NOT consume Level 1 clear-sky onboarding timer!
    for (let i = 0; i < 300; i++) {
      atmo.update(1.0, i, camera, false, { isTitle: true });
    }
    assert.equal(atmo.playElapsed, 0, 'Title screen must never consume Level 1 clear-sky protection timer');
    assert(atmo.sandstormWeight < 0.001, 'Title screen must stay clear in dynamic weather mode');

    // Resetting for new mission clears phase & weights
    atmo.resetForNewMission();
    assert.equal(atmo.cyclePhase, 0.14);
    assert.equal(atmo.nightFactor, 0);

    // B. Celestial Vector Alignment + Night -> Homeworld -> Free-Roam Probe Handoff
    state.setTimeMode('night');
    for (let i = 0; i < 40; i++) {
      atmo.update(0.1, 10 + i * 0.1, camera, false);
    }
    assert(atmo.nightFactor > 0.98, 'Night mode must converge to starry night');
    assert.equal(scene.environment, environments.desertNight, 'Night mode must bind desertNight PMREM probe');

    // Verify skyDome uPlanetDir, planarReflection uSunDir, and night shadow horizontal azimuth match KHARIS_PLANET_DIR!
    const skyPlanet = world.skyDome.uniforms.uPlanetDir.value;
    assert(skyPlanet.distanceTo(KHARIS_PLANET_DIR) < 1e-5, 'SkyDome uPlanetDir must match KHARIS_PLANET_DIR');
    if (world.planarReflection) {
      assert(
        world.planarReflection.sharedUniforms.uSunDir.value.distanceTo(KHARIS_PLANET_DIR) < 1e-5,
        'Planar reflection night light vector must match KHARIS_PLANET_DIR'
      );
    }
    const moonAz = Math.atan2(world._sunOffset.x, world._sunOffset.z);
    const planetAz = Math.atan2(KHARIS_PLANET_DIR.x, KHARIS_PLANET_DIR.z);
    assert(Math.abs(moonAz - planetAz) < 1e-4, 'Night shadow horizontal azimuth must match Kharis Prime');

    // Launch Homeworld Landing (t = 0.85): key light & probe MUST switch to bright sunlit meadow even from starry night!
    ship.applyCutsceneFrame(0.85, 25.0, robotStub);
    atmo.applyCutsceneOverride('launch', camera, 0.85);
    assert.equal(scene.environment, environments.homeworld, 'Homeworld ending must use homeworld PMREM probe');
    assert(world.sunLight.intensity > 2.4, 'Homeworld meadow must have bright warm daylight sun intensity');

    // Return to Post-Game Free Roam at night: restoreDesertPlacement sets desert probe, next atmo.update MUST re-bind desertNight!
    ship.restoreDesertPlacement(robotStub);
    atmo.update(0.016, 26.0, camera, false);
    assert.equal(
      scene.environment,
      environments.desertNight,
      'Returning from Homeworld to nocturnal desert free-roam must immediately restore desertNight probe'
    );

    // C. Wing Camera Spring-Arm Anti-Clipping & Station Focus Safety
    // Sightline passing horizontally across port delta wing (-3.65, -1.82, maxY=2.38, occluderMinY=0.95) at y=1.65 MUST pull camera forward!
    const wingFrac = camCtrl._solveSpringArmFraction(-3.65, 1.65, 1.2, -3.65, 1.65, -5.2);
    assert(wingFrac < 0.75, `Camera ray crossing ship wing thickness must retract spring-arm (got frac=${wingFrac.toFixed(3)})`);
    // Sightline high above wing (y = 3.5 > maxY + 0.35) MUST NOT falsely retract!
    const overWingFrac = camCtrl._solveSpringArmFraction(-3.65, 3.5, 1.2, -3.65, 3.5, -5.2);
    assert.equal(overWingFrac, 1.0, 'Camera ray high above wing must remain unobstructed');

    // Station focus near hull/outpost must produce a finite unobstructed camera pose
    for (const st of [WORLD_FACILITIES.furnace, WORLD_FACILITIES.fabricator, WORLD_FACILITIES.outpost_purifier]) {
      camCtrl.setStationFocus(st);
      assert(camCtrl.stationFocus && Number.isFinite(camCtrl.stationFocus.desiredPos.x));
    }

    // D. Guidance Queue Station Routing: Fabricator subcomponent in queue MUST route wait_queue to Fabricator, NOT Furnace!
    const gState = new GameState();
    gState.resetState(false);
    gState.currentLevel = 3;
    gState.repairs.repair_power = true;
    gState.repairs.repair_comms = true;
    gState.equipment.drill = true;
    const guidance = new GuidanceSystem(gState);
    gState._addItem('thermal_regulator', 1);
    gState._addItem('filter_core', 2);
    gState._addItem('iron_plate', 1);
    const qSub = gState.startCraft('craft_bio_filter'); // station: 'fabricator'
    assert.equal(qSub.ok, true);
    const waitWp = guidance.resolveActiveWaypoint({ x: 0, z: 6 });
    assert(waitWp && waitWp.kind === 'wait_queue', 'Expected wait_queue waypoint while bio_filter_assembly is fabricating');
    assert.equal(
      waitWp.x,
      WORLD_FACILITIES.fabricator.x,
      `Subcomponent queued in Fabricator must guide player to Fabricator (${WORLD_FACILITIES.fabricator.x}), got ${waitWp.x}`
    );

    // E. Mid-Queue Save Snapshot Accounting + Regrow Timer & Orbital Phase Persistence
    const s1 = new GameState();
    s1.resetState(true);
    const firstNode = RESOURCE_NODES.find((n) => n.region === 'crash_basin' && !n.subsurface);
    assert(firstNode);
    assert.equal(s1.harvestNode(firstNode.id).ok, true);
    s1.setEnvClock(0.62, 185.5);
    s1._addItem('iron_scrap', 2);
    assert.equal(s1.startCraft('smelt_iron_plate').ok, true);
    s1.save(true); // Folded mid-smelt!

    const s2 = new GameState();
    assert.equal(s2.load(), true);
    assert(s2.getItemCount('iron_plate') >= 1, 'Mid-queue save must fold output into inventory');
    assert.equal(s2.craftedEver.iron_plate, 1, 'Mid-queue save snapshot must include craftedEver count');
    assert.equal(s2.stats.totalCrafted, 1, 'Mid-queue save snapshot must include stats.totalCrafted');
    assert(s2.getNodeRegrowRemaining(firstNode.id) > 0, 'Saved node regrow timer must persist across reload');
    assert(Math.abs(s2.envClock.cyclePhase - 0.62) < 1e-4, 'Saved planetary cyclePhase must persist across reload');
    assert(Math.abs(s2.envClock.playElapsed - 185.5) < 1e-2, 'Saved active playElapsed must persist across reload');

    console.log('✓ Atmosphere handoff, celestial vectors, wing spring-arm, station queue guidance & save snapshot parity verified!');
  } finally {
    delete globalThis.window;
  }
}

verifyLevelDataAndAvailability();
verifyFullGameplaySimulation();
verifyAntiClippingAndInteractReachability();
verifyAtmosphereCameraAndSaveEdgeCases();
verifyStandaloneHtmlOfflinePurity();
