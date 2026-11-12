import {
  LEVELS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REGIONS,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  CREW_LOGS
} from '../data/gameData.js';
import { UI_STRINGS, formatTemplate, pickText } from '../data/i18n.js';

const STORAGE_KEY = 'little_bot_homebound_save_v1';

export class GameState {
  constructor() {
    this.listeners = new Set();
    this.storageAvailable = this._probeStorage();
    this._nextJobId = 1;
    this.versionTick = 1;
    this._savePending = false;
    this._saveTimer = null;
    this._bindLifecycleFlush();
    this.resetState(false);
  }

  _bindLifecycleFlush() {
    if (typeof window === 'undefined') return;
    window.addEventListener('pagehide', () => this.flushSave());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.flushSave();
      });
    }
  }

  _probeStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const testKey = '__lbh_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  resetState(persistAfter = true) {
    const keepSettings = this.settings
      ? { ...this.settings }
      : {
          lang: 'zh',
          quality: 'high',
          muted: false,
          guideArrow: true,
          showCompass: true,
          showWorldLabels: true,
          showIdleTips: true
        };

    this.currentLevel = 1;
    this.inventory = {};
    this.gatheredTotals = {};
    this.craftedEver = {};
    this.nodeRegrowTimers = {};
    this.craftingQueue = [];

    this.repairs = {
      repair_power: false,
      repair_comms: false,
      repair_lifesupport: false,
      repair_nav: false,
      repair_propulsion: false
    };

    this.completedLevels = {};
    this.claimedSideTasks = {};
    this.logsRead = {};
    this.cairnsActivated = {};
    this.pylonsAligned = {};
    this.observatoryRestored = false;
    this.preflightDone = {};
    this.cosmetics = {
      golden_antenna: false,
      star_halo: false
    };
    this.equipment = {
      drill: false,
      jetpack: false
    };
    this.sonarHighlightTimers = {};

    this.launchedHome = false;
    this.stats = {
      totalCrafted: 0,
      totalGathered: 0
    };

    this.settings = keepSettings;
    this.lastProgressTimestamp = performance.now ? performance.now() : Date.now();

    if (persistAfter) {
      this.clearSavedStorage();
      this.save(true);
    }
    this._emit('state_reset');
  }

  hasSavedGame() {
    if (!this.storageAvailable) return false;
    this.flushSave();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return Boolean(parsed && typeof parsed === 'object' && parsed.version === 1);
    } catch {
      return false;
    }
  }

  clearSavedStorage() {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._savePending = false;
    if (!this.storageAvailable) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      this.storageAvailable = false;
    }
  }

  save(immediate = false) {
    if (!this.storageAvailable) return false;
    if (immediate || typeof window === 'undefined') {
      return this._writeStorageNow();
    }
    this._savePending = true;
    if (this._saveTimer === null) {
      this._saveTimer = setTimeout(() => {
        this._saveTimer = null;
        if (this._savePending) {
          this._writeStorageNow();
        }
      }, 120);
    }
    return true;
  }

  flushSave() {
    if (this._saveTimer !== null) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    if (this._savePending) {
      this._writeStorageNow();
    }
  }

  _writeStorageNow() {
    this._savePending = false;
    if (!this.storageAvailable) return false;
    try {
      // Fold any in-flight crafting queue outputs into persisted snapshot so closing tab mid-smelt never loses inputs!
      const snapshotInventory = { ...this.inventory };
      const snapshotEquipment = { ...this.equipment };
      for (const job of this.craftingQueue) {
        const rec = RECIPES.find((r) => r.id === job.recipeId);
        if (rec) {
          if (rec.oneTimeEquipment) {
            snapshotEquipment[rec.oneTimeEquipment] = true;
          } else {
            snapshotInventory[rec.output.id] =
              (snapshotInventory[rec.output.id] || 0) + rec.output.count;
          }
        }
      }

      const payload = {
        version: 1,
        currentLevel: this.currentLevel,
        inventory: snapshotInventory,
        equipment: snapshotEquipment,
        gatheredTotals: this.gatheredTotals,
        craftedEver: this.craftedEver,
        repairs: this.repairs,
        completedLevels: this.completedLevels,
        claimedSideTasks: this.claimedSideTasks,
        logsRead: this.logsRead,
        cairnsActivated: this.cairnsActivated,
        pylonsAligned: this.pylonsAligned,
        observatoryRestored: this.observatoryRestored,
        preflightDone: this.preflightDone,
        cosmetics: this.cosmetics,
        launchedHome: this.launchedHome,
        stats: this.stats,
        settings: this.settings
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch {
      this.storageAvailable = false;
      return false;
    }
  }

  load() {
    if (!this.storageAvailable) return false;
    this.flushSave();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || data.version !== 1) return false;

      // Strict schema validation & sanitization
      const lvl = Number(data.currentLevel);
      this.currentLevel = Number.isInteger(lvl) && lvl >= 1 && lvl <= 5 ? lvl : 1;

      this.inventory = {};
      if (data.inventory && typeof data.inventory === 'object') {
        for (const id of Object.keys(MATERIALS)) {
          const v = Math.floor(Number(data.inventory[id] || 0));
          if (Number.isFinite(v) && v > 0) this.inventory[id] = Math.min(v, 9999);
        }
      }

      this.gatheredTotals = {};
      if (data.gatheredTotals && typeof data.gatheredTotals === 'object') {
        for (const id of Object.keys(MATERIALS)) {
          const v = Math.floor(Number(data.gatheredTotals[id] || 0));
          if (Number.isFinite(v) && v > 0) this.gatheredTotals[id] = Math.min(v, 99999);
        }
      }

      this.craftedEver = {};
      if (data.craftedEver && typeof data.craftedEver === 'object') {
        for (const id of Object.keys(MATERIALS)) {
          const v = Math.floor(Number(data.craftedEver[id] || 0));
          if (Number.isFinite(v) && v > 0) this.craftedEver[id] = Math.min(v, 99999);
        }
      }

      for (const rId of Object.keys(REPAIR_TARGETS)) {
        this.repairs[rId] = Boolean(data.repairs && data.repairs[rId]);
      }

      this.completedLevels = {};
      for (let i = 1; i <= 5; i++) {
        if (data.completedLevels && data.completedLevels[i]) {
          this.completedLevels[i] = true;
        }
      }

      this.claimedSideTasks = {};
      if (data.claimedSideTasks && typeof data.claimedSideTasks === 'object') {
        for (const lvlDef of LEVELS) {
          for (const st of lvlDef.sideTasks) {
            if (data.claimedSideTasks[st.id]) this.claimedSideTasks[st.id] = true;
          }
        }
      }

      this.logsRead = {};
      for (const logId of Object.keys(CREW_LOGS)) {
        if (data.logsRead && data.logsRead[logId]) this.logsRead[logId] = true;
      }

      this.cairnsActivated = {};
      if (data.cairnsActivated && typeof data.cairnsActivated === 'object') {
        for (const k of ['cairn_1', 'cairn_2']) {
          if (data.cairnsActivated[k]) this.cairnsActivated[k] = true;
        }
      }

      this.pylonsAligned = {};
      if (data.pylonsAligned && typeof data.pylonsAligned === 'object') {
        for (const k of ['pylon_north', 'pylon_south']) {
          if (data.pylonsAligned[k]) this.pylonsAligned[k] = true;
        }
      }

      this.observatoryRestored = Boolean(data.observatoryRestored);

      this.preflightDone = {};
      for (const chk of PREFLIGHT_CHECKS) {
        if (data.preflightDone && data.preflightDone[chk.id]) {
          this.preflightDone[chk.id] = true;
        }
      }

      this.cosmetics = {
        golden_antenna: Boolean(data.cosmetics && data.cosmetics.golden_antenna),
        star_halo: Boolean(data.cosmetics && data.cosmetics.star_halo)
      };

      this.equipment = {
        drill: Boolean(
          (data.equipment && data.equipment.drill) || this.inventory.geo_drill
        ),
        jetpack: Boolean(
          (data.equipment && data.equipment.jetpack) || this.inventory.jetpack_wing
        )
      };
      delete this.inventory.geo_drill;
      delete this.inventory.jetpack_wing;
      this.sonarHighlightTimers = {};

      this.launchedHome = Boolean(data.launchedHome);

      if (data.stats && typeof data.stats === 'object') {
        this.stats.totalCrafted = Math.max(0, Math.floor(Number(data.stats.totalCrafted || 0)));
        this.stats.totalGathered = Math.max(0, Math.floor(Number(data.stats.totalGathered || 0)));
      }

      if (data.settings && typeof data.settings === 'object') {
        const lang = data.settings.lang === 'en' ? 'en' : 'zh';
        const quality = ['high', 'medium', 'low'].includes(data.settings.quality)
          ? data.settings.quality
          : 'high';
        const boolOrDefault = (val, def = true) =>
          val === undefined ? def : Boolean(val);
        this.settings = {
          lang,
          quality,
          muted: Boolean(data.settings.muted),
          guideArrow: boolOrDefault(data.settings.guideArrow, true),
          showCompass: boolOrDefault(data.settings.showCompass, true),
          showWorldLabels: boolOrDefault(data.settings.showWorldLabels, true),
          showIdleTips: boolOrDefault(data.settings.showIdleTips, true)
        };
      }

      this.craftingQueue = [];

      // Ensure currentLevel is at least consistent with completed repairs
      this._reconcileProgression();
      this._emit('state_loaded');
      return true;
    } catch {
      return false;
    }
  }

  _reconcileProgression() {
    for (let lvl = 1; lvl <= 4; lvl++) {
      const def = LEVELS[lvl - 1];
      if (this.repairs[def.repairTargetId]) {
        this.completedLevels[lvl] = true;
        if (this.currentLevel <= lvl) {
          this.currentLevel = lvl + 1;
        }
      }
    }
    // Ensure legacy saves from earlier builds at Lv4/Lv5 aren't missing prerequisite gear
    if (this.repairs.repair_lifesupport) this.equipment.drill = true;
    if (this.repairs.repair_nav) this.equipment.jetpack = true;
  }

  on(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _emit(event, detail = {}) {
    if (event !== 'queue_tick') {
      this.versionTick++;
    }
    for (const cb of this.listeners) {
      cb(event, detail);
    }
  }

  markProgress() {
    this.lastProgressTimestamp = performance.now ? performance.now() : Date.now();
  }

  // --- Localization helpers ---
  get lang() {
    return this.settings.lang || 'en';
  }

  ui(key, params = {}) {
    const dict = UI_STRINGS[this.lang] || UI_STRINGS.en;
    const raw = dict[key] !== undefined ? dict[key] : UI_STRINGS.en[key] || key;
    return formatTemplate(raw, params);
  }

  text(localizedObj) {
    return pickText(localizedObj, this.lang);
  }

  setLang(lang) {
    this.settings.lang = lang === 'zh' ? 'zh' : 'en';
    this.save();
    this._emit('settings_changed', { lang: this.settings.lang });
  }

  setQuality(quality) {
    if (!['high', 'medium', 'low'].includes(quality)) return;
    this.settings.quality = quality;
    this.save();
    this._emit('settings_changed', { quality });
  }

  setMuted(muted) {
    this.settings.muted = Boolean(muted);
    this.save();
    this._emit('settings_changed', { muted: this.settings.muted });
  }

  setGuideArrow(enabled) {
    this.settings.guideArrow = Boolean(enabled);
    this.save();
    this._emit('settings_changed', { guideArrow: this.settings.guideArrow });
  }

  setHudPref(prefKey, enabled) {
    if (
      !['guideArrow', 'showCompass', 'showWorldLabels', 'showIdleTips'].includes(
        prefKey
      )
    ) {
      return;
    }
    this.settings[prefKey] = Boolean(enabled);
    this.save();
    this._emit('settings_changed', { [prefKey]: this.settings[prefKey] });
  }

  isCleanViewActive() {
    return (
      this.settings.showCompass === false &&
      this.settings.showWorldLabels === false &&
      this.settings.showIdleTips === false
    );
  }

  toggleCleanView() {
    const makeClean = !this.isCleanViewActive();
    this.settings.showCompass = !makeClean;
    this.settings.showWorldLabels = !makeClean;
    this.settings.showIdleTips = !makeClean;
    this.save();
    this._emit('settings_changed', { cleanView: makeClean });
    return makeClean;
  }

  getMaxCraftableCount(recipeId) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return 0;
    if (recipe.unlockLevel > this.currentLevel) return 0;
    if (this.isMainComponentAlreadySatisfied(recipe)) return 0;
    if (this.isEquipmentAlreadySatisfied(recipe)) return 0;
    if (recipe.oneTimeMainComponent || recipe.oneTimeEquipment) {
      return this.diagnoseRecipe(recipeId).ok ? 1 : 0;
    }
    let maxBatches = 5 - this.craftingQueue.length;
    if (maxBatches <= 0) return 0;
    for (const inp of recipe.inputs) {
      const batches = Math.floor(this.getItemCount(inp.id) / inp.count);
      maxBatches = Math.min(maxBatches, batches);
    }
    return Math.max(0, maxBatches);
  }

  // --- Regions & Unlocks ---
  isRegionUnlocked(regionId) {
    const region = REGIONS[regionId];
    if (!region) return false;
    return this.currentLevel >= region.unlockLevel;
  }

  isBridgeExtended() {
    return Boolean(this.pylonsAligned.pylon_north && this.pylonsAligned.pylon_south);
  }

  getAlignedPylonCount() {
    return (this.pylonsAligned.pylon_north ? 1 : 0) + (this.pylonsAligned.pylon_south ? 1 : 0);
  }

  getActivatedCairnCount() {
    return (this.cairnsActivated.cairn_1 ? 1 : 0) + (this.cairnsActivated.cairn_2 ? 1 : 0);
  }

  isRidgeSpeedBoostActive() {
    return this.getActivatedCairnCount() >= 2;
  }

  hasEquipment(slot) {
    return Boolean(this.equipment && this.equipment[slot]);
  }

  isNodeSonarHighlighted(nodeId) {
    return (this.sonarHighlightTimers[nodeId] || 0) > 0;
  }

  triggerSonarScan(rx, rz, maxRange = 42) {
    if (!this.hasEquipment('drill')) {
      return { ok: false, reason: 'missing_drill', count: 0, foundIds: [] };
    }
    const foundIds = [];
    for (const node of RESOURCE_NODES) {
      if (!node.subsurface) continue;
      if (!this.isRegionUnlocked(node.region)) continue;
      const d = Math.hypot(node.x - rx, node.z - rz);
      if (d <= maxRange) {
        this.sonarHighlightTimers[node.id] = 14.0;
        foundIds.push(node.id);
      }
    }
    this._emit('sonar_pulsed', { x: rx, z: rz, foundIds, count: foundIds.length });
    return { ok: true, count: foundIds.length, foundIds };
  }

  // --- Inventory & Gathering ---
  getItemCount(itemId) {
    return this.inventory[itemId] || 0;
  }

  getCarriedHighlightItem() {
    // Prefer displaying any held ship module, then subcomponent, then refined, then raw
    const order = ['ship_module', 'subcomponent', 'refined', 'raw'];
    for (const cat of order) {
      for (const mat of Object.values(MATERIALS)) {
        if (mat.category === cat && this.getItemCount(mat.id) > 0) {
          return mat;
        }
      }
    }
    return null;
  }

  _addItem(itemId, count) {
    if (!MATERIALS[itemId] || count <= 0) return;
    this.inventory[itemId] = (this.inventory[itemId] || 0) + count;
  }

  isNodeAvailable(nodeId) {
    return !(this.nodeRegrowTimers[nodeId] > 0);
  }

  getNodeRegrowRemaining(nodeId) {
    return Math.ceil(this.nodeRegrowTimers[nodeId] || 0);
  }

  harvestNode(nodeId) {
    const node = RESOURCE_NODES.find((n) => n.id === nodeId);
    if (!node) return { ok: false, reason: 'invalid_node' };
    if (!this.isRegionUnlocked(node.region)) return { ok: false, reason: 'locked_region' };
    if (!this.isNodeAvailable(nodeId)) return { ok: false, reason: 'regrowing' };
    if (node.subsurface && !this.hasEquipment('drill')) {
      return { ok: false, reason: 'missing_drill' };
    }

    this.nodeRegrowTimers[nodeId] = node.regrow || 22;
    delete this.sonarHighlightTimers[nodeId];
    this._addItem(node.materialId, node.yield);
    this.gatheredTotals[node.materialId] =
      (this.gatheredTotals[node.materialId] || 0) + node.yield;
    this.stats.totalGathered += node.yield;

    this.markProgress();
    this._evaluateSideTasks();
    this.save();
    this._emit('resource_gathered', {
      nodeId,
      materialId: node.materialId,
      count: node.yield,
      subsurface: Boolean(node.subsurface)
    });
    return {
      ok: true,
      materialId: node.materialId,
      count: node.yield,
      subsurface: Boolean(node.subsurface)
    };
  }

  // --- Interactive Facilities & Side Progress ---
  readCrewLog(logId) {
    if (!CREW_LOGS[logId]) return { ok: false };
    const firstTime = !this.logsRead[logId];
    this.logsRead[logId] = true;
    if (firstTime) {
      this.markProgress();
      this._evaluateSideTasks();
      this.save();
      this._emit('log_read', { logId, firstTime: true });
    } else {
      this._emit('log_read', { logId, firstTime: false });
    }
    return { ok: true, firstTime, log: CREW_LOGS[logId] };
  }

  activateCairn(cairnId) {
    if (!['cairn_1', 'cairn_2'].includes(cairnId)) return { ok: false };
    if (this.cairnsActivated[cairnId]) return { ok: false, reason: 'already_active' };
    this.cairnsActivated[cairnId] = true;
    this.markProgress();
    this._evaluateSideTasks();
    this.save();
    this._emit('cairn_activated', { cairnId, count: this.getActivatedCairnCount() });
    return { ok: true, count: this.getActivatedCairnCount() };
  }

  alignPylon(pylonId) {
    if (!['pylon_north', 'pylon_south'].includes(pylonId)) return { ok: false };
    if (!this.isRegionUnlocked('relay_gorge')) return { ok: false, reason: 'locked_region' };
    if (this.pylonsAligned[pylonId]) return { ok: false, reason: 'already_aligned' };
    this.pylonsAligned[pylonId] = true;
    this.markProgress();
    const bridgeNowOpen = this.isBridgeExtended();
    this.save();
    this._emit('pylon_aligned', {
      pylonId,
      alignedCount: this.getAlignedPylonCount(),
      bridgeNowOpen
    });
    return { ok: true, alignedCount: this.getAlignedPylonCount(), bridgeNowOpen };
  }

  restoreObservatory() {
    if (this.observatoryRestored) return { ok: false, reason: 'already_done' };
    this.observatoryRestored = true;
    this.markProgress();
    this._evaluateSideTasks();
    this.save();
    this._emit('observatory_restored');
    return { ok: true };
  }

  completePreflightCheck(checkId) {
    if (!this.repairs.repair_propulsion) return { ok: false, reason: 'propulsion_not_ready' };
    const found = PREFLIGHT_CHECKS.find((c) => c.id === checkId);
    if (!found) return { ok: false, reason: 'invalid_check' };
    if (this.preflightDone[checkId]) return { ok: false, reason: 'already_checked' };

    this.preflightDone[checkId] = true;
    this.markProgress();
    this.save();
    const doneCount = this.getPreflightDoneCount();
    this._emit('preflight_checked', { checkId, doneCount });
    return { ok: true, doneCount };
  }

  getPreflightDoneCount() {
    return PREFLIGHT_CHECKS.reduce((acc, c) => acc + (this.preflightDone[c.id] ? 1 : 0), 0);
  }

  canLaunchSpacecraft() {
    const allRepaired = Object.values(this.repairs).every(Boolean);
    return allRepaired && this.getPreflightDoneCount() >= PREFLIGHT_CHECKS.length;
  }

  triggerLaunchAndCompleteGame() {
    if (!this.canLaunchSpacecraft()) return { ok: false, reason: 'not_ready' };
    const firstLaunch = !this.completedLevels[5];
    this.completedLevels[5] = true;
    this.launchedHome = true;
    this.markProgress();
    this.save();
    this._emit('spacecraft_launched', { firstLaunch });
    return { ok: true, firstLaunch };
  }

  // --- Crafting & Missing Material Diagnosis ---
  isQueuedOutput(itemId) {
    return this.craftingQueue.some((job) => {
      const r = RECIPES.find((rec) => rec.id === job.recipeId);
      return r && r.output.id === itemId;
    });
  }

  getQueuedCountForOutput(itemId) {
    return this.craftingQueue.reduce((sum, job) => {
      const r = RECIPES.find((rec) => rec.id === job.recipeId);
      return sum + (r && r.output.id === itemId ? r.output.count : 0);
    }, 0);
  }

  isMainComponentAlreadySatisfied(recipe) {
    if (!recipe.oneTimeMainComponent) return false;
    const outId = recipe.output.id;
    if (this.getItemCount(outId) > 0) return true;
    if (this.isQueuedOutput(outId)) return true;
    if (recipe.targetRepairId && this.repairs[recipe.targetRepairId]) return true;
    return false;
  }

  isEquipmentAlreadySatisfied(recipe) {
    if (!recipe.oneTimeEquipment) return false;
    if (this.hasEquipment(recipe.oneTimeEquipment)) return true;
    if (this.isQueuedOutput(recipe.output.id)) return true;
    return false;
  }

  diagnoseRecipe(recipeId) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'unknown_recipe', missing: [] };
    if (recipe.unlockLevel > this.currentLevel) {
      return { ok: false, reason: 'locked_level', unlockLevel: recipe.unlockLevel, missing: [] };
    }
    if (this.isMainComponentAlreadySatisfied(recipe)) {
      return { ok: false, reason: 'already_crafted_main', missing: [] };
    }
    if (this.isEquipmentAlreadySatisfied(recipe)) {
      return { ok: false, reason: 'already_equipped', missing: [] };
    }

    const missing = [];
    for (const inp of recipe.inputs) {
      const have = this.getItemCount(inp.id);
      if (have < inp.count) {
        const mat = MATERIALS[inp.id];
        const sourceRegionNames = (mat.sourceRegions || []).map((rId) =>
          this.text(REGIONS[rId]?.name)
        );
        missing.push({
          id: inp.id,
          needed: inp.count,
          have,
          missingCount: inp.count - have,
          craftedIn: mat.craftedIn || null,
          regions: sourceRegionNames
        });
      }
    }

    return {
      ok: missing.length === 0,
      reason: missing.length === 0 ? 'ready' : 'missing_materials',
      missing
    };
  }

  startCraft(recipeId) {
    const recipe = RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return { ok: false, reason: 'unknown_recipe' };

    const check = this.diagnoseRecipe(recipeId);
    if (!check.ok) return check;

    // Prevent runaway queue spam
    if (this.craftingQueue.length >= 5) {
      return { ok: false, reason: 'queue_full' };
    }

    // Atomic deduction of exact inputs ONCE
    for (const inp of recipe.inputs) {
      this.inventory[inp.id] -= inp.count;
      if (this.inventory[inp.id] <= 0) {
        delete this.inventory[inp.id];
      }
    }

    const job = {
      jobId: this._nextJobId++,
      recipeId: recipe.id,
      station: recipe.station,
      remaining: recipe.craftSeconds,
      total: recipe.craftSeconds
    };
    this.craftingQueue.push(job);
    this.markProgress();
    this.save();
    this._emit('craft_started', { job, recipe });
    return { ok: true, job };
  }

  // --- Repair Installation ---
  installComponent(repairId) {
    const target = REPAIR_TARGETS[repairId];
    if (!target) return { ok: false, reason: 'invalid_target' };
    if (this.repairs[repairId]) return { ok: false, reason: 'already_repaired' };
    if (target.level > this.currentLevel) return { ok: false, reason: 'locked_level' };

    const reqItem = target.requiredItem;
    if (this.getItemCount(reqItem) < 1) {
      return {
        ok: false,
        reason: 'missing_component',
        requiredItem: reqItem
      };
    }

    // Consume 1 component and mark ship bay repaired
    this.inventory[reqItem] -= 1;
    if (this.inventory[reqItem] <= 0) delete this.inventory[reqItem];
    this.repairs[repairId] = true;
    this.markProgress();

    // Advance level (for Levels 1..4; Level 5 completes upon Launch after pre-flight checks)
    let completedLevelDef = null;
    const lvlNum = target.level;
    if (lvlNum >= 1 && lvlNum <= 4 && !this.completedLevels[lvlNum]) {
      this.completedLevels[lvlNum] = true;
      completedLevelDef = LEVELS[lvlNum - 1];
      if (this.currentLevel === lvlNum) {
        this.currentLevel = lvlNum + 1;
      }
      // Immediately claim any side tasks in the newly unlocked level whose gather/facility conditions were already met!
      this._evaluateSideTasks();
    }

    this.save();
    this._emit('repair_installed', {
      repairId,
      itemId: reqItem,
      levelCompleted: completedLevelDef ? completedLevelDef.level : null
    });

    if (completedLevelDef) {
      this._emit('level_completed', { levelDef: completedLevelDef });
    }

    return { ok: true, levelCompleted: completedLevelDef };
  }

  // --- Side Tasks Evaluation (Idempotent, Never Duplicate Rewards) ---
  _getSideTaskCurrentValue(task) {
    if (task.type === 'gather_count') {
      return Math.min(task.target, this.gatheredTotals[task.materialId] || 0);
    }
    if (task.type === 'read_log') {
      return this.logsRead[task.logId] ? 1 : 0;
    }
    if (task.type === 'activate_group') {
      if (task.groupKey === 'cairns') return this.getActivatedCairnCount();
      if (task.groupKey === 'pylons') return this.getAlignedPylonCount();
    }
    if (task.type === 'facility_flag') {
      return this[task.flagKey] ? 1 : 0;
    }
    return 0;
  }

  _evaluateSideTasks() {
    for (const lvlDef of LEVELS) {
      if (lvlDef.level > this.currentLevel) continue;
      for (const task of lvlDef.sideTasks) {
        if (this.claimedSideTasks[task.id]) continue;
        const val = this._getSideTaskCurrentValue(task);
        if (val >= task.target) {
          this.claimedSideTasks[task.id] = true;
          if (Array.isArray(task.rewardItems)) {
            for (const reward of task.rewardItems) {
              this._addItem(reward.id, reward.count);
            }
          }
          if (task.rewardCosmetic && task.rewardCosmetic in this.cosmetics) {
            this.cosmetics[task.rewardCosmetic] = true;
          }
          this._emit('side_task_completed', { task, level: lvlDef.level });
        }
      }
    }
  }

  // --- Authoritative Progress Queries (3 Distinct Layers) ---

  // Layer 1: Side-task progress
  getSideTasksStatus(levelNum = this.currentLevel) {
    const lvlDef = LEVELS[clampLevel(levelNum) - 1];
    return lvlDef.sideTasks.map((task) => {
      const current = this._getSideTaskCurrentValue(task);
      const completed = Boolean(this.claimedSideTasks[task.id] || current >= task.target);
      return {
        id: task.id,
        label: this.text(task.label),
        current: Math.min(current, task.target),
        target: task.target,
        completed,
        rewardText: this.text(task.rewardText)
      };
    });
  }

  getAllCompletedSideTaskCount() {
    let done = 0;
    let total = 0;
    for (const lvlDef of LEVELS) {
      for (const st of lvlDef.sideTasks) {
        total += 1;
        if (this.claimedSideTasks[st.id]) done += 1;
      }
    }
    return { done, total };
  }

  // Layer 2: Current-level repair progress
  getCurrentLevelProgress(levelNum = this.currentLevel) {
    const lvlDef = LEVELS[clampLevel(levelNum) - 1];
    const mainRepairDone = Boolean(this.repairs[lvlDef.repairTargetId]);

    const steps = lvlDef.steps.map((step) => {
      let current = 0;
      if (step.type === 'raw_for_level1') {
        if (mainRepairDone || this.getItemCount('power_core') + this.getQueuedCountForOutput('power_core') > 0) {
          current = step.needed;
        } else {
          const ironUnits = Math.min(
            4,
            this.getItemCount('iron_scrap') +
              (this.getItemCount('iron_plate') + this.getQueuedCountForOutput('iron_plate')) * 2
          );
          const copperUnits = Math.min(
            4,
            this.getItemCount('copper_ore') +
              (this.getItemCount('copper_ingot') + this.getQueuedCountForOutput('copper_ingot')) * 2
          );
          current = Math.min(step.needed, ironUnits + copperUnits);
        }
      } else if (step.type === 'have_or_used') {
        if (mainRepairDone) {
          current = step.needed;
        } else {
          const held = this.getItemCount(step.itemId) + this.getQueuedCountForOutput(step.itemId);
          // Check if downstream item already crafted/queued OR installed in its repair bay!
          let usedDownstream = 0;
          if (Array.isArray(step.consumedBy)) {
            for (const consumerId of step.consumedBy) {
              const cCount =
                this.getItemCount(consumerId) + this.getQueuedCountForOutput(consumerId);
              const consumerRecipe = RECIPES.find((r) => r.output.id === consumerId);
              const installed =
                consumerRecipe &&
                consumerRecipe.targetRepairId &&
                this.repairs[consumerRecipe.targetRepairId];
              if (cCount > 0 || installed) usedDownstream = step.needed;
            }
          }
          current = Math.min(step.needed, Math.max(held, usedDownstream));
        }
      } else if (step.type === 'have_or_installed') {
        if (
          this.repairs[step.repairId] ||
          this.getItemCount(step.itemId) + this.getQueuedCountForOutput(step.itemId) >= 1
        ) {
          current = step.needed;
        }
      } else if (step.type === 'equipment_unlocked') {
        const eqOutId = step.equipmentSlot === 'drill' ? 'geo_drill' : 'jetpack_wing';
        if (this.hasEquipment(step.equipmentSlot) || this.isQueuedOutput(eqOutId)) {
          current = step.needed;
        }
      } else if (step.type === 'repair_installed') {
        current = this.repairs[step.repairId] ? 1 : 0;
      } else if (step.type === 'activate_group') {
        current =
          step.groupKey === 'pylons'
            ? this.getAlignedPylonCount()
            : this.getActivatedCairnCount();
      } else if (step.type === 'preflight_checks') {
        current = this.getPreflightDoneCount();
      } else if (step.type === 'launched') {
        current = this.launchedHome ? 1 : 0;
      }

      current = Math.min(step.needed, current);
      return {
        id: step.id,
        label: this.text(step.label),
        current,
        needed: step.needed,
        done: current >= step.needed
      };
    });

    const doneSteps = steps.filter((s) => s.done).length;
    return {
      level: lvlDef.level,
      title: this.text(lvlDef.title),
      summary: this.text(lvlDef.summary),
      hint: this.text(lvlDef.hintText),
      steps,
      doneSteps,
      totalSteps: steps.length,
      fraction: steps.length > 0 ? doneSteps / steps.length : 0
    };
  }

  // Layer 3: Global spacecraft repair progress
  getGlobalRepairProgress() {
    const orderedIds = [
      'repair_power',
      'repair_comms',
      'repair_lifesupport',
      'repair_nav',
      'repair_propulsion'
    ];
    const systems = orderedIds.map((id) => ({
      id,
      level: REPAIR_TARGETS[id].level,
      name: this.text(REPAIR_TARGETS[id].name),
      repaired: Boolean(this.repairs[id])
    }));
    const repairedCount = systems.filter((s) => s.repaired).length;
    return {
      repairedCount,
      totalSystems: orderedIds.length,
      systems
    };
  }

  // --- Frame Tick (Queue Processing & Node Regrowth) ---
  update(dt) {
    let dirtyHud = false;

    // 1. Tick regrowing resource veins & sonar highlight timers
    for (const nodeId of Object.keys(this.nodeRegrowTimers)) {
      this.nodeRegrowTimers[nodeId] -= dt;
      if (this.nodeRegrowTimers[nodeId] <= 0) {
        delete this.nodeRegrowTimers[nodeId];
        this._emit('node_regrown', { nodeId });
      }
    }
    for (const nodeId of Object.keys(this.sonarHighlightTimers)) {
      this.sonarHighlightTimers[nodeId] -= dt;
      if (this.sonarHighlightTimers[nodeId] <= 0) {
        delete this.sonarHighlightTimers[nodeId];
      }
    }

    // 2. Tick active crafting queue (sequentially per station or unified queue head)
    if (this.craftingQueue.length > 0) {
      const head = this.craftingQueue[0];
      head.remaining -= dt;
      dirtyHud = true;
      if (head.remaining <= 0) {
        this.craftingQueue.shift();
        const recipe = RECIPES.find((r) => r.id === head.recipeId);
        if (recipe) {
          if (recipe.oneTimeEquipment) {
            this.equipment[recipe.oneTimeEquipment] = true;
          } else {
            this._addItem(recipe.output.id, recipe.output.count);
          }
          this.craftedEver[recipe.output.id] =
            (this.craftedEver[recipe.output.id] || 0) + recipe.output.count;
          this.stats.totalCrafted += 1;
          this.markProgress();
          this.save();
          if (recipe.oneTimeEquipment) {
            this._emit('equipment_unlocked', {
              slot: recipe.oneTimeEquipment,
              itemId: recipe.output.id,
              recipe
            });
          } else {
            this._emit('craft_completed', {
              recipe,
              outputId: recipe.output.id,
              count: recipe.output.count
            });
          }
        }
      }
    }

    if (dirtyHud) {
      this._emit('queue_tick');
    }
  }
}

function clampLevel(lvl) {
  return Math.max(1, Math.min(5, lvl || 1));
}
