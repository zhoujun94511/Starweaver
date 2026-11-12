import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEVELS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REPAIR_TARGETS,
  RESOURCE_NODES
} from '../src/data/gameData.js';
import { GameState } from '../src/state/gameState.js';
import { GuidanceSystem } from '../src/systems/guidanceSystem.js';
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

verifyLevelDataAndAvailability();
verifyFullGameplaySimulation();
verifyStandaloneHtmlOfflinePurity();
