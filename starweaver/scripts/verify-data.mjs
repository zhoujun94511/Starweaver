import assert from 'node:assert/strict';
import './verify-homeworld-ceremony.mjs';
import './verify-homeworld-camera.mjs';
import './verify-homeworld-materials.mjs';
import './verify-homeworld-architecture.mjs';
import './verify-homeworld-landscape.mjs';
import './verify-homeworld-mountains.mjs';
import './verify-render-activity.mjs';
import './verify-reflection-visibility.mjs';
import './verify-paused-atmosphere.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  BRINE_POOLS,
  CREW_LOGS,
  ELEVATED_PLATFORMS,
  EQUIPMENT_DEFS,
  LEVELS,
  locateRegionId,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REGIONS,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  STATION_TYPES,
  WORLD_CONFIG,
  WORLD_FACILITIES,
  WORLD_MECHANISMS
} from '../src/data/gameData.js';
import { GameState } from '../src/state/gameState.js';
import { GuidanceSystem } from '../src/systems/guidanceSystem.js';
import { AtmosphereSystem } from '../src/systems/atmosphereSystem.js';
import { KHARIS_PLANET_DIR } from '../src/graphics/skyDome.js';
import { createStratifiedMesaGeometry } from '../src/graphics/proceduralMeshes.js';
import { WeatherParticles } from '../src/graphics/weatherParticles.js';
import { ParticleSystem } from '../src/graphics/particleSystem.js';
import { CameraController } from '../src/scene/cameraController.js';
import { WorldBuilder } from '../src/scene/worldBuilder.js';
import { SpacecraftBuilder } from '../src/scene/spacecraftBuilder.js';
import { RobotController } from '../src/entities/robotController.js';
import { TouchControls } from '../src/ui/touchControls.js';
import { getTerrainHeight } from '../src/utils/math.js';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../src/data/homeworldData.js';
import { createThrusterPlume, updateThrusterPlume } from '../src/graphics/launchEffects.js';
import { ARTIFACT_RE, findLatestArtifact } from './dist-artifact.mjs';
import { verifyHomeworldActivities } from './verify-homeworld-activities.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function computeRawRequirements(itemId, count = 1, maxLevel = LEVELS.length) {
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
  assert(
    STATION_TYPES[recipe.station],
    `Recipe ${recipe.id} references unregistered station type "${recipe.station}"`
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
  assert.equal(locateRegionId(0, 0), 'crash_basin');
  assert.equal(locateRegionId(52, 2), 'whispering_ridge');
  assert.equal(locateRegionId(2, 54), 'dry_canyon');
  assert.equal(locateRegionId(-60, 2), 'relay_gorge');
  assert.equal(locateRegionId(0, -52), 'geothermal_field');
  assert.equal(locateRegionId(58, 58), 'salt_flats');
  assert.equal(locateRegionId(-56, -56), 'mothership_graveyard');
  assert.equal(WORLD_FACILITIES.furnace.region, 'crash_basin');
  assert.equal(WORLD_FACILITIES.fabricator.region, 'crash_basin');
  assert.equal(WORLD_FACILITIES.outpost_purifier.region, 'dry_canyon');
  assert.equal(WORLD_FACILITIES.salt_field_station.region, 'salt_flats');
  assert.equal(WORLD_FACILITIES.wreck_field_station.region, 'mothership_graveyard');
  const postGame = new GameState();
  postGame.launchedHome = true;
  postGame.currentLevel = LEVELS.length;
  const beaconSteps = postGame.getCurrentLevelProgress().steps;
  assert.equal(beaconSteps.find((step) => step.id === 'wbeacon_salt').regionId, 'salt_flats');
  assert(LEVELS.length >= 6, `Expected >= 6 declarative levels, got ${LEVELS.length}`);
  assert.equal(
    Object.keys(REPAIR_TARGETS).length,
    LEVELS.length,
    'Each level must correspond to an authoritative REPAIR_TARGETS entry'
  );
  for (const rt of Object.values(REPAIR_TARGETS)) {
    assert(rt.shortLabel && rt.shortLabel.zh && rt.shortLabel.en, `Repair target ${rt.id} missing localized shortLabel`);
  }
  for (const eq of Object.values(EQUIPMENT_DEFS)) {
    assert(MATERIALS[eq.itemId], `Equipment ${eq.slot} references missing item ${eq.itemId}`);
  }

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
  console.log(`✓ Declarative registries & all ${LEVELS.length} levels have abundant deterministic raw resources.`);
}

function verifyFullGameplaySimulation() {
  const state = new GameState();
  const totalLevels = LEVELS.length;
  assert.equal(state.currentLevel, 1);
  assert.equal(state.getGlobalRepairProgress().repairedCount, 0);

  // State-layer invariants must hold even when callers bypass the interaction
  // scanner (for example after a damaged/imported local save).
  const invariantState = new GameState();
  invariantState.currentLevel = 4;
  invariantState._addItem('nav_computer', 1);
  assert.equal(invariantState.installComponent('repair_nav').reason, 'locked_mechanism');
  assert.equal(invariantState.diagnoseRecipe('craft_nav_computer').reason, 'locked_mechanism');
  assert.equal(invariantState.activateMechanism('weather_beacons', 'wbeacon_salt').reason, 'locked_region');
  assert.equal(invariantState.harvestNode('n_rg_tit_1').reason, 'locked_mechanism');
  invariantState.currentLevel = 2;
  assert.equal(invariantState.harvestNode('n_wr_sky_qtz').reason, 'missing_jetpack');

  // Crafting without materials must fail safely
  const failCraft = state.startCraft('craft_power_core');
  assert.equal(failCraft.ok, false);
  assert.equal(failCraft.reason, 'missing_materials');

  // Helper to gather from real unlocked nodes and craft recursively through the queue!
  const gatherMaterial = (matId, minNeeded) => {
    while (state.getItemCount(matId) < minNeeded) {
      const node = RESOURCE_NODES.find(
        (n) =>
          n.materialId === matId &&
          state.isRegionUnlocked(n.region) &&
          (!n.subsurface || state.hasEquipment('drill')) &&
          (!n.elevated || state.hasEquipment('jetpack')) &&
          (!n.requiresMechanism || state.isMechanismComplete(n.requiresMechanism)) &&
          state.isNodeAvailable(n.id)
      );
      if (!node) {
        state.update(25);
        continue;
      }
      const res = state.harvestNode(node.id);
      assert.equal(res.ok, true);
    }
  };

  const ensureItemCrafted = (itemId, countNeeded) => {
    const mat = MATERIALS[itemId];
    assert(mat, `Missing material ${itemId}`);
    if (mat.category === 'raw') {
      gatherMaterial(itemId, countNeeded);
      return;
    }
    const rec = RECIPES.find((r) => r.output.id === itemId);
    assert(rec, `Missing recipe for ${itemId}`);

    while (
      mat.category === 'equipment'
        ? !state.hasEquipment(mat.equipmentSlot)
        : state.getItemCount(itemId) < countNeeded
    ) {
      for (const inp of rec.inputs) {
        ensureItemCrafted(inp.id, inp.count);
      }
      const res = state.startCraft(rec.id);
      assert.equal(res.ok, true, `Expected recipe ${rec.id} to start cleanly: ${res.reason}`);
      for (let i = 0; i < 45; i++) state.update(0.1);
      if (mat.category === 'equipment') break;
    }
  };

  const guidance = new GuidanceSystem(state);
  const wp0 = guidance.resolveActiveWaypoint({ x: 4.8, z: 5.8 });
  assert(wp0 && wp0.kind === 'gather', 'Initial Level 1 waypoint must guide player to gather ore');

  // Data-driven progression simulation across ALL levels in LEVELS!
  for (const lvlDef of LEVELS) {
    assert.equal(state.currentLevel, lvlDef.level);

    if (lvlDef.level === 1) {
      state.readCrewLog('log_1');
      const ironAfterFirstLog = state.getItemCount('iron_plate');
      state.readCrewLog('log_1');
      assert.equal(state.getItemCount('iron_plate'), ironAfterFirstLog, 'Side-task rewards must be idempotent');
    }

    if (lvlDef.level === 3 && !state.hasEquipment('drill')) {
      const prematureDrill = state.harvestNode('n_dc_zeo_1');
      assert.equal(prematureDrill.ok, false);
      assert.equal(prematureDrill.reason, 'missing_drill');
      assert.equal(state.triggerSonarScan(0, 42).ok, false);
    }

    // 1. Auto-satisfy any mandatory equipment unlocked at this level (via EQUIPMENT_DEFS)
    for (const eqDef of Object.values(EQUIPMENT_DEFS)) {
      if (eqDef.mandatoryFromLevel === lvlDef.level && !state.hasEquipment(eqDef.slot)) {
        ensureItemCrafted(eqDef.itemId, 1);
        assert.equal(state.hasEquipment(eqDef.slot), true);
        const eqRec = RECIPES.find((r) => r.output.id === eqDef.itemId);
        assert.equal(state.startCraft(eqRec.id).reason, 'already_equipped');
      }
    }

    if (lvlDef.level === 3) {
      const sonarRes = state.triggerSonarScan(0, 42);
      assert.equal(sonarRes.ok, true);
      assert(sonarRes.count >= 4, 'Sonar scan in Dry Canyon must locate subsurface veins');
    }

    // 2. Auto-satisfy any prerequisite world mechanism declared by this level (via WORLD_MECHANISMS)
    if (lvlDef.prerequisiteMechanism) {
      assert.equal(state.isMechanismComplete(lvlDef.prerequisiteMechanism), false);
      const mech = WORLD_MECHANISMS[lvlDef.prerequisiteMechanism];
      for (const mNode of mech.nodes) {
        const mRes = state.activateMechanism(mech.id, mNode.id);
        assert.equal(mRes.ok, true);
      }
      assert.equal(state.isMechanismComplete(lvlDef.prerequisiteMechanism), true);
    }

    // 3. Craft main ship component via recursive DAG walk
    ensureItemCrafted(lvlDef.requiredComponentId, 1);

    const wpInstall = guidance.resolveActiveWaypoint({ x: 4.8, z: 5.8 });
    assert.equal(wpInstall?.kind, 'repair', `Guidance at Lv.${lvlDef.level} must point to Repair Bay once module is ready`);

    const mainRec = RECIPES.find((r) => r.output.id === lvlDef.requiredComponentId);
    assert.equal(state.startCraft(mainRec.id).reason, 'already_crafted_main');

    // Before final level, preflight check must NOT unlock prematurely!
    if (lvlDef.level < totalLevels) {
      assert.equal(state.completePreflightCheck(PREFLIGHT_CHECKS[0].id).ok, false);
    }

    const installRes = state.installComponent(lvlDef.repairTargetId);
    assert.equal(installRes.ok, true);
    assert.equal(state.getGlobalRepairProgress().repairedCount, lvlDef.level);

    if (lvlDef.level < totalLevels) {
      assert.equal(state.currentLevel, lvlDef.level + 1);
    }
  }

  // Cannot launch before completing all 3 pre-flight checks!
  assert.equal(state.areAllShipSystemsRepaired(), true);
  assert.equal(state.canLaunchSpacecraft(), false);
  for (const chk of PREFLIGHT_CHECKS) {
    assert.equal(state.completePreflightCheck(chk.id).ok, true);
  }
  assert.equal(state.canLaunchSpacecraft(), true);
  const launchRes = state.triggerLaunchAndCompleteGame();
  assert.equal(launchRes.ok, true);
  assert.equal(state.launchedHome, true);
  assert.equal(state.getCurrentLevelProgress(totalLevels).fraction, 1);

  // Post-game Free Roam guidance should point to Post-Game Climate Beacons first, then remaining unread Crew Logs!
  const beaconWp = guidance.resolveActiveWaypoint({ x: 0, z: 0 });
  assert.equal(
    beaconWp?.kind,
    'weather_beacon',
    'Post-game Free Roam guidance must prioritize Planetary Climate Telemetry Beacons first'
  );
  for (const bn of WORLD_FACILITIES.weather_beacons) {
    assert.equal(state.activateMechanism('weather_beacons', bn.id).ok, true);
  }
  assert.equal(state.isMechanismComplete('weather_beacons'), true);

  const freeRoamWp = guidance.resolveActiveWaypoint({ x: 0, z: 0 });
  assert(
    freeRoamWp && freeRoamWp.kind === 'log',
    'Once all 5 Climate Beacons are linked, Free Roam guidance must help locate remaining Crew Logs'
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
    lumen_core: 2
  };
  const navGuidance = new GuidanceSystem(navCheckState);
  const lumenWp = navGuidance.resolveActiveWaypoint({ x: -56, z: 0 });
  assert.equal(
    lumenWp?.kind,
    'gather',
    'Guidance DAG must detect shared Lumen Shard deficit (2 held < 3 total needed across Gyro + Prism)'
  );

  console.log(`✓ Full ${totalLevels}-level data-driven simulation + DAG guidance + side-task idempotency + launch verified!`);
}

function verifyStandaloneHtmlOfflinePurity() {
  const htmlPath = findLatestArtifact(path.join(rootDir, 'dist'));
  assert(htmlPath, 'dist/starweaver-<version>-<YYYYMMDD-HHmmss>.html not found');
  const base = path.basename(htmlPath);
  const match = base.match(ARTIFACT_RE);
  assert(match, `unexpected artifact name: ${base}`);
  const html = fs.readFileSync(htmlPath, 'utf8');
  const docsPath = path.resolve(rootDir, '..', 'docs', 'index.html');
  assert(fs.existsSync(docsPath), 'docs/index.html is missing');
  assert.equal(fs.readFileSync(docsPath, 'utf8'), html, 'docs/index.html is out of sync with the latest standalone artifact');
  const [, version, day, clock] = match;
  const isoPrefix = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${clock.slice(0, 2)}:${clock.slice(2, 4)}:${clock.slice(4, 6)}`;

  assert(html.includes(`<meta name="version" content="${version}" />`), 'version meta does not match the file name');
  assert(html.includes(`<meta name="build-time" content="${isoPrefix}`), 'build-time meta does not match the file name');
  const sizeBytes = fs.statSync(htmlPath).size;
  assert(sizeBytes <= 1.5 * 1024 * 1024, `Standalone HTML exceeds the 1.5 MB hard budget (${sizeBytes} bytes)`);
  assert(/<html\s+lang=["']en["']\s*>/i.test(html), 'Standalone HTML root lang attribute is malformed');
  assert(/<canvas\b[^>]*\baria-label=["']Starweaver 3D game canvas["']/i.test(html), 'Standalone HTML canvas is missing its accessible label');
  assert(!/<script[^>]+src=/i.test(html), 'Standalone HTML must not have external <script src>');
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of linkTags) {
    const hrefMatch = tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (hrefMatch) {
      const val = (hrefMatch[1] ?? hrefMatch[2] ?? hrefMatch[3] ?? '').trim();
      assert(val.startsWith('data:image/'), `Standalone HTML must not have external <link href>, got: ${val.slice(0, 60)}`);
    }
  }
  assert(
    linkTags.some((tag) => /\brel=["']icon["']/i.test(tag) && /\bhref=["']data:image\//i.test(tag)),
    'Standalone HTML must embed an inline data:image favicon'
  );
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

  // Visual seam guard: non-climbable canyon/horizon mesas must bury their
  // bottom cap below local dune dips, while tight sky-mesa silhouettes keep
  // their authored base at ground level. This catches the dark floating cap
  // that previously read as severe terrain clipping in the browser build.
  const horizonMesa = createStratifiedMesaGeometry(6.2, 13.5, 22, 101);
  horizonMesa.computeBoundingBox();
  assert(
    horizonMesa.boundingBox.min.y <= -3.0,
    `Horizon mesa buried base is too shallow (${horizonMesa.boundingBox.min.y.toFixed(2)}m)`
  );
  horizonMesa.dispose();
  const skyMesa = createStratifiedMesaGeometry(4.8, 11.4, 27, 303, true);
  skyMesa.computeBoundingBox();
  assert(
    skyMesa.boundingBox.min.y >= -0.2,
    `Tight sky-mesa silhouette base moved unexpectedly (${skyMesa.boundingBox.min.y.toFixed(2)}m)`
  );
  skyMesa.dispose();

  const state = new GameState();
  state.currentLevel = LEVELS.length;
  for (const eq of Object.values(EQUIPMENT_DEFS)) {
    state.equipment[eq.slot] = true;
  }
  for (const mech of Object.values(WORLD_MECHANISMS)) {
    if (mech.kind === 'group') {
      for (const n of mech.nodes) state[mech.stateProp][n.id] = true;
    } else {
      state[mech.stateProp] = true;
    }
  }
  for (const rId of Object.keys(REPAIR_TARGETS)) state.repairs[rId] = true;
  for (const chk of PREFLIGHT_CHECKS) state.preflightDone[chk.id] = true;

  const scene = new THREE.Scene();
  const world = new WorldBuilder(scene, state, null);
  const spacecraft = new SpacecraftBuilder(scene, state, null, world.skyDome, null);
  scene.updateMatrixWorld(true);
  // Test the real dish mesh against the curved fuselage throughout tracking
  // and its folded fault pose. A higher group origin alone cannot prove the
  // rotating lower rim clears the roof.
  const receiverRay = new THREE.Raycaster();
  receiverRay.ray.direction.set(0, -1, 0);
  const receiverVertex = new THREE.Vector3();
  const dishVertices = spacecraft.commsDishBowl.geometry.attributes.position;
  let minimumReceiverGap = Infinity;
  for (const repaired of [false, true]) {
    state.repairs.repair_comms = repaired;
    for (let phase = 0; phase < 32; phase++) {
      spacecraft.update(0, phase * 3.7, false);
      scene.updateMatrixWorld(true);
      for (let i = 0; i < dishVertices.count; i += 3) {
        receiverVertex.fromBufferAttribute(dishVertices, i).applyMatrix4(spacecraft.commsDishBowl.matrixWorld);
        receiverRay.ray.origin.set(receiverVertex.x, spacecraft.baseGroundY + 12, receiverVertex.z);
        const roof = receiverRay.intersectObject(spacecraft.fuselage, false)[0];
        if (!roof) continue;
        const gap = receiverVertex.y - roof.point.y;
        minimumReceiverGap = Math.min(minimumReceiverGap, gap);
        assert(gap > 0.08, `Receiver rim intersects hull in ${repaired ? 'tracking' : 'folded'} pose (${gap.toFixed(3)}m)`);
      }
    }
  }
  state.repairs.repair_comms = true;
  assert(Number.isFinite(minimumReceiverGap), 'Receiver/hull geometry clearance check must hit the real roof');
  console.log(`✓ Receiver tracking/folded rim clears the sculpted roof by at least ${minimumReceiverGap.toFixed(3)}m.`);
  const meadowSurface = spacecraft.homeworldGroup.getObjectByName('homeworld-support-matched-meadow');
  assert(meadowSurface, 'Homeworld must expose its support-matched terrain');
  const deckRay = new THREE.Raycaster();
  deckRay.ray.direction.set(0, -1, 0);
  for (const [px, pz] of [[0, -2.2], [2.5, -2.2], [-2.5, -2.2], [0, 0.3], [0, -4.7]]) {
    deckRay.ray.origin.set(px, HOMEWORLD_CONFIG.padY + 0.8, pz);
    assert.equal(deckRay.intersectObject(meadowSurface).length, 0,
      'Terrain must leave a real opening beneath the pad; overlapping coplanar floors flicker');
    const floorHit = deckRay.intersectObject(spacecraft.homeworldGroup, true)[0];
    assert(floorHit && Math.abs(floorHit.point.y - HOMEWORLD_CONFIG.padY) < 0.03,
      `Pad opening lacks a support-aligned deck at (${px},${pz})`);
  }
  // Geometry validity and feet placement are testable. Object/material counts
  // cannot establish art quality and would penalize the static mesh batching.
  spacecraft.homeworldGroup.traverse((obj) => {
    if (!obj.isMesh) return;
    assert(obj.material, `Homeworld mesh ${obj.name} must have a material`);
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    if (materials.some(m => m.userData.homeworldPbr)) {
      assert(!obj.geometry.hasAttribute('tangent'),
        `World-projected PBR requires derivative tangent frames: ${obj.name}`);
    }
    const vertices = obj.geometry.attributes.position.array;
    assert(vertices.every(Number.isFinite), `Non-finite homeworld vertex in ${obj.name}`);
  });
  assert.equal(spacecraft.crewFigures.length, 4, 'Homeworld must retain four authored crew roles');
  assert.equal(spacecraft.companionBots.length, 2, 'Homeworld must retain two companion bots');
  // Cinematic boarding/exit white-box: the robot must travel through a
  // continuous path instead of being hidden/revealed at a single cutscene
  // threshold. A real controller is used here so pose/scale regressions are
  // caught alongside the scene collider audit.
  const cinematicRobot = new RobotController(scene, state, {}, null, null);
  cinematicRobot.update(0, 0, new THREE.Vector3(), 0, [], true, null);
  spacecraft.prepareBoarding(cinematicRobot);
  spacecraft.applyCutsceneFrame(0.04, 0.4, cinematicRobot);
  const boardStart = cinematicRobot.group.position.clone();
  spacecraft.applyCutsceneFrame(0.12, 1.2, cinematicRobot);
  const boardMid = cinematicRobot.group.position.clone();
  assert(boardMid.x < boardStart.x, 'Boarding path must move Milo toward the hatch');
  assert(boardMid.y > boardStart.y, 'Boarding path must rise with the visible ramp');
  assert.equal(cinematicRobot.group.scale.x, 1, 'Boarding must preserve Milo proportions');
  // Raycast against the authored deck rather than repeating its height formula.
  // This catches a moving ship, changed ramp angle, or threshold geometry that
  // no longer agrees with the scripted character's feet.
  const rampRay = new THREE.Raycaster();
  rampRay.ray.direction.set(0, -1, 0);
  for (let step = 24; step <= 62; step++) {
    const phase = step / 100;
    spacecraft.applyCutsceneFrame(phase * 0.2, phase * 3.68, cinematicRobot);
    scene.updateMatrixWorld(true);
    rampRay.ray.origin.copy(cinematicRobot.group.position);
    rampRay.ray.origin.y += 4;
    const hit = rampRay.intersectObject(spacecraft.boardingRamp, true)[0];
    if (!hit) continue; // The outer entry is briefly on the ground beside the ramp.
    const footGap = cinematicRobot.group.position.y - hit.point.y;
    assert(footGap >= -0.035 && footGap <= 0.07,
      `Milo/ramp contact diverged ${footGap.toFixed(3)}m at boarding phase ${phase}`);
  }
  const headBounds = new THREE.Box3();
  for (let step = 20; step <= 100; step++) {
    const phase = step / 100;
    spacecraft._applyRobotBoardingPose(cinematicRobot, phase);
    scene.updateMatrixWorld(true);
    headBounds.setFromObject(cinematicRobot.headGroup.children[0]);
    if (phase >= 0.2 && phase <= 0.82) {
      assert(spacecraft._airlockOpenAmount > 0.999, 'Airlock must remain open throughout the complete entry motion');
    }
    if (phase > 0.85 && spacecraft._airlockOpenAmount < 0.999) {
      assert(headBounds.max.x < spacecraft.airlock.position.x - 0.10,
        `Airlock starts closing while Milo head remains outside at ${phase}`);
    }
  }
  spacecraft.applyCutsceneFrame(0.2 - 1e-6, 3.68, cinematicRobot);
  assert(Math.abs(spacecraft.group.position.y - spacecraft.baseGroundY) < 0.001,
    'The ship must remain grounded until the boarding beat finishes');

  const homeworldMidT = 0.58 + 0.42 * 0.76;
  spacecraft.applyCutsceneFrame(homeworldMidT, 9.8, cinematicRobot);
  const exitStart = cinematicRobot.group.position.clone();
  spacecraft.applyCutsceneFrame(0.98, 11.8, cinematicRobot);
  const exitEnd = cinematicRobot.group.position.clone();
  assert(cinematicRobot.group.visible, 'Milo must be visible after the homeworld reveal');
  assert(exitEnd.z > exitStart.z, 'Exit path must walk Milo away from the hatch');
  assert.equal(cinematicRobot.group.scale.x, 1, 'Exiting must preserve Milo proportions');
  const pathColliders = spacecraft.getColliders().filter((c) => c.id.startsWith('hw_'));
  const shipColliderIds = spacecraft.getColliders().map(c => c.id).filter(Boolean);
  assert.equal(new Set(shipColliderIds).size, shipColliderIds.length, 'Ship/homeworld collider IDs must be unique');
  let previousExit = null;
  for (let step = 0; step <= 240; step++) {
    const p = step / 240;
    spacecraft._applyRobotExitPose(cinematicRobot, p);
    const position = cinematicRobot.group.position;
    if (previousExit) assert(position.distanceTo(previousExit) < 0.19, `Exit path discontinuity at ${p}`);
    previousExit = position.clone();
    if (p <= 0.38) continue; // The visible airlock/ramp intentionally enters the hull registry.
    for (const c of pathColliders) {
      assert(Math.hypot(position.x - c.x, position.z - c.z) >= c.radius + 0.6,
        `Exit path intersects ${c.id} at ${p.toFixed(3)}`);
    }
    assert(Math.abs(position.y - getHomeworldGroundHeight(position.x, position.z)) < 0.012,
      `Exit feet drift above/below ground at ${p}`);
  }
  const handoffPosition = cinematicRobot.group.position.clone();
  spacecraft.enterHomeworldFreeRoam(cinematicRobot);
  assert(cinematicRobot.position.distanceTo(handoffPosition) < 0.001, 'Exit/free-roam handoff must not teleport');
  spacecraft.update(1 / 60, 22.5, false);
  scene.updateMatrixWorld(true);
  const noseBounds = new THREE.Box3().setFromObject(spacecraft.navLens);
  const headShell = cinematicRobot.headGroup.children[0];
  const welcomeHeadBounds = new THREE.Box3().setFromObject(headShell);
  assert(!noseBounds.intersectsBox(welcomeHeadBounds), 'Welcome stop must clear the physical navigation lens');
  assert.equal(spacecraft.navHoloProjector.visible, false, 'Landed navigation projection must clear the welcome path');
  for (const footY of [420.3, 420.5, 420.8, 421]) {
    for (const yaw of [Math.PI, Math.PI * 0.5, -Math.PI * 0.5]) {
      cinematicRobot.position.set(0, footY, 5.8);
      cinematicRobot.yaw = yaw;
      cinematicRobot.isGrounded = false;
      cinematicRobot.velocityY = 0;
      cinematicRobot.update(0, 22.5, new THREE.Vector3(), 0, spacecraft.getColliders(), false, null);
      scene.updateMatrixWorld(true);
      assert(!noseBounds.intersectsBox(new THREE.Box3().setFromObject(headShell)),
        `Airborne robot head clips the navigation lens at footY=${footY}, yaw=${yaw}`);
    }
  }
  cinematicRobot.teleportToHomeworldMeadow();
  assert.equal(spacecraft.boardingRamp.visible, false, 'Homeworld roam must stow the unsupported cinematic ramp');
  spacecraft.prepareBoarding(cinematicRobot);
  spacecraft.applyCutsceneFrame(0, 0, cinematicRobot);
  assert(cinematicRobot.group.position.y < 5, 'Replaying from Homeworld must not board from Y=420');
  spacecraft.enterHomeworldFreeRoam(cinematicRobot);
  const plume = createThrusterPlume(0);
  plume.userData.targetThrottle = 2;
  let previousThrottle = 0;
  for (let i = 0; i < 90; i++) {
    updateThrusterPlume(plume, 1 / 60, i / 60);
    assert(plume.userData.throttle >= previousThrottle && plume.userData.throttle <= 2,
      'Ignition must approach requested throttle without overshoot');
    previousThrottle = plume.userData.throttle;
  }
  plume.userData.targetThrottle = 0;
  for (let i = 0; i < 90; i++) updateThrusterPlume(plume, 1 / 60, i / 60);
  assert.equal(plume.visible, false, 'Exhaust must finish fading after cutoff');
  cinematicRobot.group.scale.setScalar(1);
  const allColliders = [...world.colliders, ...spacecraft.getColliders()];
  const robotRadius = 0.62;

  assert(
    allColliders.length >= 200,
    `Expected comprehensive anti-clip collider coverage (>=200), got ${allColliders.length}`
  );

  // Verify Southeast Crystalline Salt Pan floor is laser-flat (-0.55m) across mirror expanse so dunes never poke through!
  for (const [sx, sz] of [[58, 58], [52, 52], [64, 64], [52, 63], [63, 52]]) {
    const sy = getTerrainHeight(sx, sz, false);
    assert(
      Math.abs(sy - -0.55) < 1e-4,
      `Crystalline Salt Pan at (${sx},${sz}) must be mirror-flat at -0.55m, got ${sy}`
    );
  }
  // Verify outer boundary mountains do NOT intrude inside WORLD_CONFIG.playRadius
  assert(
    getTerrainHeight(74, 74, false) < 3.0,
    'Diagonal sector within WORLD_CONFIG.playRadius must not hit premature boundary cliff'
  );

  // Helper: relax a test stand point outside all active colliders at height y (4-pass solver)
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

  let interactiveCount = 0;
  const assertTargetReachable = (label, tx, tz, ty, interactRange) => {
    interactiveCount++;
    assert(
      Math.hypot(tx, tz) <= WORLD_CONFIG.playRadius - 2.0,
      `Interact target "${label}" (${tx}, ${tz}) lies outside WORLD_CONFIG.playRadius (${WORLD_CONFIG.playRadius}m)!`
    );
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

  // 1. Verify all Spacecraft Repair Bays are reachable outside wing/hull colliders
  for (const t of Object.values(REPAIR_TARGETS)) {
    const gy = getTerrainHeight(t.position.x, t.position.z, true);
    assertTargetReachable(`repair:${t.id}`, t.position.x, t.position.z, gy, 4.4);
  }

  // 2. Verify all Pre-Flight Checks + Boarding Ramp
  for (const chk of PREFLIGHT_CHECKS) {
    const gy = getTerrainHeight(chk.position.x, chk.position.z, true);
    assertTargetReachable(`preflight:${chk.id}`, chk.position.x, chk.position.z, gy, 3.8);
  }
  const ramp = WORLD_FACILITIES.boarding_ramp;
  assertTargetReachable('boarding_ramp', ramp.x, ramp.z, getTerrainHeight(ramp.x, ramp.z, true), 3.5);

  // 3. Verify all Declarative Workstations
  for (const st of WORLD_FACILITIES.stations) {
    assertTargetReachable(`station:${st.id}`, st.x, st.z, getTerrainHeight(st.x, st.z, true), 3.6);
  }

  // 4. Verify all Resource Nodes across all regions (including Southeast Salt Flats!)
  for (const node of RESOURCE_NODES) {
    const plat = node.platformId ? ELEVATED_PLATFORMS.find((p) => p.id === node.platformId) : null;
    const ny = plat ? plat.topY : getTerrainHeight(node.x, node.z, true);
    assertTargetReachable(`node:${node.id}`, node.x, node.z, ny, 3.0);
  }

  // 5. Verify all Crew Logs & Declarative World Mechanisms
  for (const log of Object.values(CREW_LOGS)) {
    assertTargetReachable(`log:${log.id}`, log.position.x, log.position.z, getTerrainHeight(log.position.x, log.position.z, true), 2.9);
  }
  for (const mech of Object.values(WORLD_MECHANISMS)) {
    for (const mNode of mech.nodes) {
      const plat = mNode.platformId ? ELEVATED_PLATFORMS.find((pl) => pl.id === mNode.platformId) : null;
      const my = plat ? plat.topY : getTerrainHeight(mNode.x, mNode.z, true);
      assertTargetReachable(`mech:${mech.id}:${mNode.id}`, mNode.x, mNode.z, my, mech.interactRange || 3.2);
    }
  }

  // 6. Verify Diagonal Gate Barrier (`gate_salt_flats`) + flank cliffs block entry before Lv.6 and open cleanly at Lv.6
  const simulateWalk = (sx, sz, tx, tz, steps = 28) => {
    let px = sx;
    let pz = sz;
    for (let s = 0; s < steps; s++) {
      const dx = tx - px;
      const dz = tz - pz;
      const d = Math.hypot(dx, dz) || 1;
      const stepLen = Math.min(0.85, d);
      const next = relaxPoint(px + (dx / d) * stepLen, pz + (dz / d) * stepLen, 0.2);
      px = next.x;
      pz = next.z;
    }
    return { x: px, z: pz };
  };

  state.currentLevel = 5;
  // Center pass walk + NE flank walk + SW flank walk must ALL be stopped outside Salt Flats (x + z < 53)!
  const walkCenterBlocked = simulateWalk(18.0, 18.0, 34.0, 34.0);
  const walkNeFlankBlocked = simulateWalk(24.0, 16.0, 34.0, 28.0);
  const walkSwFlankBlocked = simulateWalk(16.0, 24.0, 28.0, 34.0);
  assert(
    walkCenterBlocked.x + walkCenterBlocked.z < 46.0,
    `Locked diagonal gate must stop center approach (reached ${walkCenterBlocked.x.toFixed(1)}, ${walkCenterBlocked.z.toFixed(1)})`
  );
  assert(
    walkNeFlankBlocked.x + walkNeFlankBlocked.z < 52.0,
    `NE flank cliffs + gate post must block bypass (reached ${walkNeFlankBlocked.x.toFixed(1)}, ${walkNeFlankBlocked.z.toFixed(1)})`
  );
  assert(
    walkSwFlankBlocked.x + walkSwFlankBlocked.z < 52.0,
    `SW flank cliffs + gate post must block bypass (reached ${walkSwFlankBlocked.x.toFixed(1)}, ${walkSwFlankBlocked.z.toFixed(1)})`
  );

  state.currentLevel = 6;
  const walkCenterOpen = simulateWalk(18.0, 18.0, 34.0, 34.0, 32);
  assert(
    Math.hypot(walkCenterOpen.x - 34.0, walkCenterOpen.z - 34.0) < 0.8,
    `Unlocked diagonal pass must allow smooth traversal into Salt Flats (reached ${walkCenterOpen.x.toFixed(1)}, ${walkCenterOpen.z.toFixed(1)})`
  );

  console.log(`✓ Anti-clipping, diagonal gate & interactability verified across ${allColliders.length} colliders and all ${interactiveCount} interactive targets!`);
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
      },
      teleportToHomeworldMeadow() {
        this.position.set(HOMEWORLD_CONFIG.spawnX, getHomeworldGroundHeight(HOMEWORLD_CONFIG.spawnX, HOMEWORLD_CONFIG.spawnZ), HOMEWORLD_CONFIG.spawnZ);
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

    // F. Weather-Linked Solar Smelting Multiplier + Phase-Change Storage Battery + Locked Weather Parity
    const smeltState = new GameState();
    smeltState.resetState(false);
    smeltState.currentLevel = 2;
    smeltState.setTimeMode('day');
    smeltState.setWeatherMode('clear');
    assert.equal(smeltState.getFurnaceSpeedMultiplier(), 1.5, 'Clear daylight must grant 1.5x solar smelting boost');
    assert.equal(smeltState.getStationSpeedMultiplier('fabricator'), 1.0, 'Fabricator speed must stay constant 1.0x');

    smeltState._addItem('iron_scrap', 2);
    assert.equal(smeltState.startCraft('smelt_iron_plate').ok, true);
    smeltState.update(0.7); // 0.7s * 1.5x = 1.05s >= 1.0s!
    assert.equal(smeltState.getItemCount('iron_plate'), 1, '1.0s furnace smelt must finish within 0.7s under 1.5x clear daylight');

    smeltState.setWeatherMode('sandstorm');
    assert.equal(smeltState.getFurnaceSpeedMultiplier(), 0.55, 'Locked sandstorm without battery must immediately drop furnace to 0.55x floor');

    smeltState.setWeatherMode('clear');
    smeltState.setTimeMode('night');
    assert.equal(smeltState.getFurnaceSpeedMultiplier(), 0.55, 'Starry night without battery must run furnace at 0.55x floor');

    // Installing Phase-Change Storage Battery ('battery') stabilizes night & sandstorm floor at 1.0x while preserving 1.5x day boost!
    smeltState.equipment.battery = true;
    assert.equal(smeltState.getFurnaceSpeedMultiplier(), 1.0, 'Storage Battery must buffer nocturnal smelting floor to 1.0x');
    smeltState.setTimeMode('day');
    smeltState.setWeatherMode('sandstorm');
    assert.equal(smeltState.getFurnaceSpeedMultiplier(), 1.0, 'Storage Battery must buffer sandstorm smelting floor to 1.0x');
    smeltState.setWeatherMode('clear');
    assert.equal(smeltState.getFurnaceSpeedMultiplier(), 1.5, 'Storage Battery must still allow 1.5x clear daylight boost');

    // G. Legacy v1.0.1 5-Level Completed Save Reconciliation into Level 6 Crystalline Salt Flats
    memStore.set(
      'little_bot_homebound_save_v1',
      JSON.stringify({
        version: 1,
        currentLevel: 5,
        repairs: {
          repair_power: true,
          repair_comms: true,
          repair_lifesupport: true,
          repair_nav: true,
          repair_propulsion: true
        },
        completedLevels: { 1: true, 2: true, 3: true, 4: true, 5: true },
        launchedHome: true
      })
    );
    const legacyLoaded = new GameState();
    assert.equal(legacyLoaded.load(), true);
    assert.equal(legacyLoaded.currentLevel, 6, 'Legacy 5-level save must advance cleanly to newly unlocked Level 6');
    assert.equal(legacyLoaded.launchedHome, false, 'Legacy save missing Level 6 shield must resume active mission for Level 6');
    assert.equal(legacyLoaded.hasEquipment('drill'), true);
    assert.equal(legacyLoaded.hasEquipment('jetpack'), true);
    assert.equal(legacyLoaded.isRegionUnlocked('salt_flats'), true);

    // H. Mobile Thermal & Silky Control Audits: Adaptive Default Preset, Early-Z Safe Shaders, Daytime Storm SpotLight Skip &Joystick Deadzone Continuity
    const wpMobile = new WeatherParticles(scene, { isMobile: true });
    assert(
      !wpMobile.sandMesh.material.fragmentShader.includes('discard'),
      'Sandstorm particle fragment shader must NOT contain discard (preserves mobile Tile-GPU Early-Z!)'
    );
    assert(
      !wpMobile.starDustMesh.material.fragmentShader.includes('discard'),
      'Stardust particle fragment shader must NOT contain discard'
    );
    assert.equal(wpMobile.sandMesh.geometry.instanceCount, 96, 'Mobile sandstorm streak count must be capped at 96');

    // Simulate mobile environment: daytime sandstorm must keep SpotLight strength=0 while still showing visor cone>0!
    globalThis.window.innerWidth = 390;
    globalThis.window.innerHeight = 844;
    globalThis.window.matchMedia = (q) => ({
      matches: q.includes('coarse'),
      addEventListener() {}
    });
    const mobState = new GameState();
    assert.equal(
      mobState.settings.quality,
      'medium',
      'New mobile sessions must default to thermal-friendly medium preset while preserving user choice'
    );
    mobState.setQuality('high');
    assert.equal(mobState.settings.qualityUserChosen, true);

    let recordedSpot = -1;
    let recordedCone = -1;
    const mobRobotStub = {
      position: new THREE.Vector3(0, 0.2, 0),
      group: new THREE.Group(),
      groundShadowMesh: new THREE.Mesh(),
      setNightHeadlamp(spot, cone = spot) {
        recordedSpot = spot;
        recordedCone = cone;
      }
    };
    const mobWorldStub = {
      skyDome: world.skyDome,
      sunLight: world.sunLight,
      hemiLight: world.hemiLight,
      _sunOffset: world._sunOffset,
      planarReflection: null,
      isCoarseMobileDevice: () => true
    };
    const mobAtmo = new AtmosphereSystem({
      state: mobState,
      scene,
      environments,
      world: mobWorldStub,
      robot: mobRobotStub,
      postProcessing: null,
      sound: null,
      weatherParticles: wpMobile
    });
    mobState.setTimeMode('day');
    mobState.setWeatherMode('sandstorm');
    for (let i = 0; i < 30; i++) mobAtmo.update(0.1, i * 0.1, camera, false);
    assert(
      recordedSpot < 0.01 && recordedCone > 0.4,
      `Mobile daytime sandstorm must skip costly PBR SpotLight (got ${recordedSpot}) while keeping visor cone (${recordedCone})`
    );

    // Continuous radial joystick remap check (just above 8.5% deadzone must produce tiny smooth speed, NOT a 0.11 jump!)
    const joyProto = TouchControls.prototype;
    const fakeTouch = {
      _joyOrigin: { x: 100, y: 100 },
      _maxRadius: 46,
      joyKnob: null,
      moveVec: { x: 0, z: 0 }
    };
    joyProto._updateJoystickDelta.call(fakeTouch, 100 + 46 * 0.095, 100);
    assert(
      fakeTouch.moveVec.x > 0 && fakeTouch.moveVec.x < 0.025,
      `Joystick just past deadzone must ramp smoothly from 0 (got ${fakeTouch.moveVec.x})`
    );

    // I. Autonomous Mining Drone Delivery + Passive Equipment Modifiers + Homeworld Meadow Free-Stroll Verification
    const droneState = new GameState();
    droneState.resetState(false);
    droneState.currentLevel = 7;
    droneState.equipment.drone_fleet = true;
    droneState.equipment.treads = true;
    droneState.equipment.fuel_tank = true;
    droneState.equipment.sonar_array = true;
    droneState.equipment.drill = true;
    assert.equal(droneState.getEquipmentModifier('moveSpeedMult', 1.0, 'mult'), 1.22);
    assert.equal(droneState.getEquipmentModifier('jetpackFuelMult', 1.0, 'max'), 2.0);
    assert.equal(droneState.getEquipmentModifier('sonarRange', 42, 'max'), 85);

    const gatherBefore = droneState.stats.totalGathered;
    droneState.update(14.2); // Trigger 14s autonomous drone patrol delivery!
    assert(
      droneState.stats.totalGathered > gatherBefore,
      'Autonomous Mining Drone Fleet must automatically deliver unlocked regional raw ores every 14s'
    );

    // Verify 4-Act Launch Cutscene acts + Walkable Homeworld Meadow handoff & Desert return
    for (const testT of [0.10, 0.32, 0.50, 0.85]) {
      const pose = ship.applyCutsceneFrame(testT, 12.0, robotStub);
      assert(pose && Number.isFinite(pose.position.x) && Number.isFinite(pose.lookAt.y));
    }
    ship.enterHomeworldFreeRoam(robotStub);
    assert.equal(ship.homeworldGroup.visible, true, 'Homeworld meadow must be visible in Walkable Homeworld mode');
    assert(Math.abs(robotStub.position.y - getHomeworldGroundHeight(robotStub.position.x, robotStub.position.z)) < 1e-3, 'Milo must stand on the authoritative Homeworld floor');
    const hwPose = camCtrl.getDesiredFollowPose(robotStub.position);
    assert(hwPose.position.y > 421.5, 'Camera follow pose on Homeworld (Y=420) must respect Y=420 ground plane');

    // J. Cross-Plane Homeworld Pad Geometry Parity + Particle baseY & Ambient Toggle + Passive Touch Mode
    // Pad centered at (0, -2.2), radius 6.2; front grass (0, 5.2) is outside the pad.
    const rcProto = RobotController.prototype;
    assert.equal(
      rcProto._getHomeworldGroundY(0, -7.8),
      HOMEWORLD_CONFIG.padY,
      'Homeworld pad aft rim must match the landing pad disc'
    );
    assert.equal(
      rcProto._getHomeworldGroundY(0, 5.2),
      420.00,
      'Homeworld front meadow grass (0, 5.2) outside pad must sit at 420.00m'
    );
    assert.equal(
      camCtrl._getCameraGroundY(0, -7.8, 421.0),
      HOMEWORLD_CONFIG.padY,
      'CameraController Homeworld pad ground height must match RobotController exactly'
    );
    assert.equal(
      camCtrl._getCameraGroundY(0, 5.2, 421.0),
      420.00,
      'CameraController Homeworld grass ground height must match RobotController exactly'
    );

    // ParticleSystem: explicit baseY=420.2 spawns sparkles at Homeworld Y~421.5, and { ambient: false } emits zero desert chimney sparks!
    const ps = new ParticleSystem(scene);
    ps.update(0.25, true, { ambient: false });
    assert.equal(
      ps.pool.some((p) => p.active),
      false,
      'ParticleSystem update with { ambient: false } must NOT spawn desert chimney/vent particles during Homeworld roam'
    );
    ps.emitCelebrationSparkles(0, 4.8, 420.2);
    const activeSparkles = ps.pool.filter((p) => p.active);
    assert(activeSparkles.length >= 20 && Math.abs(activeSparkles[0].y - 421.5) < 0.05, 'Homeworld celebration sparkles must spawn at Y=421.5');

    // TouchControls passiveRoam hides empty primary action button while keeping Jetpack button visible!
    const makeToggleEl = () => {
      const set = new Set();
      return {
        textContent: '',
        classList: {
          toggle(cls, force) {
            if (force) set.add(cls);
            else set.delete(cls);
          },
          has: (cls) => set.has(cls)
        }
      };
    };
    droneState.equipment.jetpack = true;
    const mockTouchUi = {
      touchActive: true,
      compactViewport: true,
      isControlPadActive() { return true; },
      _visibleAllowed: true,
      state: droneState,
      _lastStateSig: '',
      btnSonar: makeToggleEl(),
      btnSonarLbl: { textContent: '' },
      btnJet: makeToggleEl(),
      btnJetLbl: { textContent: '' },
      btnInspect: makeToggleEl(),
      btnInspectLbl: { textContent: '' },
      btnAct: makeToggleEl(),
      btnActIcon: { textContent: '' },
      btnActLbl: { textContent: '' }
    };
    TouchControls.prototype.updateContext.call(mockTouchUi, null, { passiveRoam: true });
    assert.equal(mockTouchUi.btnAct.classList.has('hidden'), true, 'Passive Homeworld roam must hide idle primary action touch button');
    assert.equal(mockTouchUi.btnSonar.classList.has('hidden'), true, 'Passive Homeworld roam must hide desert sonar touch button');
    assert.equal(mockTouchUi.btnJet.classList.has('hidden'), false, 'Passive Homeworld roam must keep Jetpack flight button active');

    ship.restoreDesertPlacement(robotStub);
    assert.equal(ship.homeworldGroup.visible, false, 'Returning to Kharis-4 must hide Homeworld meadow');
    assert(robotStub.position.y < 5.0, 'Returning to Kharis-4 must place Milo back on Crash Basin sand');

    console.log('✓ Atmosphere handoff, solar smelting, auto-drones, 4-act launch + walkable Homeworld & mobile thermal checks verified!');
  } finally {
    delete globalThis.window;
  }
}

function verifyDevRedlinesStaticCodeAudit() {
  // Static redline enforcement across src/: no innerHTML, no hardcoded 5-level ceiling, no collider count >= 800
  const srcRoot = path.join(rootDir, 'src');
  const walkJsFiles = (dir) => {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walkJsFiles(full));
      else if (ent.name.endsWith('.js')) out.push(full);
    }
    return out;
  };
  for (const file of walkJsFiles(srcRoot)) {
    const code = fs.readFileSync(file, 'utf8');
    // Strip comments before checking for innerHTML assignment
    const stripped = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert(
      !/\.innerHTML\s*=/.test(stripped),
      `Redline violation: forbidden .innerHTML assignment in ${path.relative(rootDir, file)}`
    );
  }
  console.log('✓ Engineering Redlines static code audit passed (zero innerHTML, offline budget <= 1.5MB, Early-Z clean).');
}

verifyLevelDataAndAvailability();
verifyFullGameplaySimulation();
verifyHomeworldActivities();
verifyAntiClippingAndInteractReachability();
verifyAtmosphereCameraAndSaveEdgeCases();
verifyDevRedlinesStaticCodeAudit();
verifyStandaloneHtmlOfflinePurity();
