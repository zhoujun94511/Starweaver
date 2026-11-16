import { saveGameState, flushGameSave, loadGameState, detectInitialQualityPreset, STORAGE_KEY } from './gamePersistence.js';
import { HOMEWORLD_AERIAL_RINGS } from '../data/homeworldData.js';
import { HOMEWORLD_LANDMARKS, HOMEWORLD_CALIBRATION, HOMEWORLD_SKY_PLAQUES, createHomeworldSurvey, sanitizeHomeworldSurvey } from '../data/homeworldActivities.js';
import {
  CREW_LOGS,
  EQUIPMENT_DEFS,
  LEVELS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REGIONS,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  STATION_TYPES,
  WORLD_MECHANISMS
} from '../data/gameData.js';
import { UI_STRINGS, formatTemplate, pickText } from '../data/i18n.js';


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
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
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
    const defaultQuality = detectInitialQualityPreset();
    const keepSettings = this.settings
      ? { ...this.settings, homeworldAtmosphere: 'dawn' }
      : {
          lang: 'zh',
          quality: defaultQuality,
          qualityUserChosen: false,
          timeMode: 'cycle',
          weatherMode: 'dynamic',
          homeworldAtmosphere: 'dawn',
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

    this.repairs = {};
    for (const rId of Object.keys(REPAIR_TARGETS)) {
      this.repairs[rId] = false;
    }

    this.completedLevels = {};
    this.claimedSideTasks = {};
    this.logsRead = {};
    for (const mech of Object.values(WORLD_MECHANISMS)) {
      this[mech.stateProp] = mech.kind === 'group' ? {} : false;
    }
    this.preflightDone = {};
    this.homeworldSurvey = createHomeworldSurvey();
    this.cosmetics = {
      golden_antenna: false,
      star_halo: false,
      golden_jetflame: false
    };
    this.equipment = {};
    for (const slot of Object.keys(EQUIPMENT_DEFS)) {
      this.equipment[slot] = false;
    }
    this.sonarHighlightTimers = {};
    this.sonarResonanceTimer = 0;
    this.droneHarvestAccum = 0;
    this._droneCycleIdx = 0;
    this.solarEnv = {
      nightFactor: 0,
      overcastWeight: 0,
      sandstormWeight: 0
    };

    this.launchedHome = false;
    this.activeWorldPlane = 'desert';
    this.stats = {
      totalCrafted: 0,
      totalGathered: 0
    };
    this.envClock = {
      cyclePhase: 0.14,
      playElapsed: 0
    };

    this.settings = keepSettings;
    this._syncDocumentLanguage();
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
    return saveGameState(this, immediate);
  }

  flushSave() {
    return flushGameSave(this);
  }

  load() {
    return loadGameState(this);
  }

  setWorldPlane(plane, persist = true) {
    const next = plane === 'homeworld' ? 'homeworld' : 'desert';
    if (this.activeWorldPlane === next) return false;
    this.activeWorldPlane = next;
    if (persist) this.save();
    this._emit('world_plane_changed', { worldPlane: next });
    return true;
  }

  /**
   * Synchronizes post-game cross-world state when switching between Homeworld and Desert
   * so all levels, repairs, pre-flight checks, mandatory gear, and mechanisms stay coherent
   * and task listeners immediately refresh.
   */
  syncPostGameWorldTransition(targetPlane = 'desert') {
    const nextPlane = targetPlane === 'homeworld' ? 'homeworld' : 'desert';
    this.launchedHome = true;
    this.activeWorldPlane = nextPlane;
    this.currentLevel = LEVELS.length;
    for (let i = 1; i <= LEVELS.length; i++) {
      this.completedLevels[i] = true;
    }
    for (const rId of Object.keys(REPAIR_TARGETS)) {
      this.repairs[rId] = true;
    }
    for (const chk of PREFLIGHT_CHECKS) {
      this.preflightDone[chk.id] = true;
    }
    for (const eqDef of Object.values(EQUIPMENT_DEFS)) {
      if (eqDef.mandatoryFromLevel) {
        this.equipment[eqDef.slot] = true;
      }
    }
    for (const lvlDef of LEVELS) {
      const mechId = lvlDef.prerequisiteMechanism;
      const mech = mechId ? WORLD_MECHANISMS[mechId] : null;
      if (mech && mech.kind === 'group') {
        for (const n of mech.nodes) {
          this[mech.stateProp][n.id] = true;
        }
      }
    }
    this.markProgress();
    this.save();
    this._emit('world_plane_changed', { worldPlane: nextPlane });
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

  setEnvClock(cyclePhase, playElapsed) {
    if (!this.envClock) {
      this.envClock = { cyclePhase: 0.14, playElapsed: 0 };
    }
    if (Number.isFinite(cyclePhase)) {
      this.envClock.cyclePhase = ((cyclePhase % 1) + 1) % 1;
    }
    if (Number.isFinite(playElapsed) && playElapsed >= 0) {
      this.envClock.playElapsed = playElapsed;
    }
  }

  setSolarEnv(nightFactor, overcastWeight, sandstormWeight) {
    if (!this.solarEnv) {
      this.solarEnv = { nightFactor: 0, overcastWeight: 0, sandstormWeight: 0 };
    }
    if (Number.isFinite(nightFactor)) {
      this.solarEnv.nightFactor = Math.max(0, Math.min(1, nightFactor));
    }
    if (Number.isFinite(overcastWeight)) {
      this.solarEnv.overcastWeight = Math.max(0, Math.min(1, overcastWeight));
    }
    if (Number.isFinite(sandstormWeight)) {
      this.solarEnv.sandstormWeight = Math.max(0, Math.min(1, sandstormWeight));
    }
  }

  isHomeworldAtmosphereUnlocked() {
    if (!this.homeworldSurvey || !this.homeworldSurvey.completed) return false;
    const beaconProg = this.getMechanismProgress('weather_beacons');
    return beaconProg.done >= 3;
  }

  getHomeworldAtmosphere() {
    if (!this.isHomeworldAtmosphereUnlocked()) return 'dawn';
    const mode = this.settings && this.settings.homeworldAtmosphere;
    return ['dawn', 'sunset', 'night'].includes(mode) ? mode : 'dawn';
  }

  setHomeworldAtmosphere(mode) {
    if (!['dawn', 'sunset', 'night'].includes(mode)) return false;
    if (mode !== 'dawn' && !this.isHomeworldAtmosphereUnlocked()) return false;
    if (!this.settings) this.settings = {};
    this.settings.homeworldAtmosphere = mode;
    this.save();
    this._emit('settings_changed', { homeworldAtmosphere: mode });
    this._emit('homeworld_atmosphere_changed', { mode });
    return true;
  }

  cycleHomeworldAtmosphere() {
    if (!this.isHomeworldAtmosphereUnlocked()) return 'dawn';
    const order = ['dawn', 'sunset', 'night'];
    const cur = this.getHomeworldAtmosphere();
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.setHomeworldAtmosphere(next);
    return next;
  }

  getSolarStatusInfo() {
    const timeMode = (this.settings && this.settings.timeMode) || 'cycle';
    const weatherMode = (this.settings && this.settings.weatherMode) || 'dynamic';
    const env = this.solarEnv || { nightFactor: 0, overcastWeight: 0, sandstormWeight: 0 };

    const night =
      timeMode === 'day' ? 0 : timeMode === 'night' ? 1 : env.nightFactor;
    const overcast =
      weatherMode === 'clear'
        ? 0
        : weatherMode === 'overcast'
          ? 1
          : weatherMode === 'sandstorm'
            ? 0.65
            : env.overcastWeight;
    const storm =
      weatherMode === 'sandstorm'
        ? 1
        : weatherMode === 'clear' || weatherMode === 'overcast'
          ? 0
          : env.sandstormWeight;

    const skyBlock = Math.max(0, Math.min(1, Math.max(night, storm, overcast * 0.684)));
    // Clear sunny day = 1.50x (+50% boost); overcast = 0.85x; starry night / sandstorm = 0.55x floor
    const rawMultiplier = Math.round((1.5 - 0.95 * skyBlock) * 100) / 100;
    const minFloor = this.getEquipmentModifier('furnaceMinFloor', 0, 'max');
    const hasBattery = minFloor >= 0.99;
    const multiplier = minFloor > 0 ? Math.max(minFloor, rawMultiplier) : rawMultiplier;

    let stateTag = 'normal';
    if (multiplier >= 1.15) {
      stateTag = 'boost';
    } else if (hasBattery && rawMultiplier < 0.99) {
      stateTag = 'buffered';
    } else if (multiplier < 0.95) {
      stateTag = 'low';
    }

    return {
      multiplier,
      rawMultiplier,
      hasBattery,
      stateTag
    };
  }

  getFurnaceSpeedMultiplier() {
    return this.getSolarStatusInfo().multiplier;
  }

  getStationSpeedMultiplier(stationId) {
    const stType = STATION_TYPES[stationId];
    if (stType && stType.speedFactorKey === 'solar_thermal') {
      return this.getFurnaceSpeedMultiplier();
    }
    return 1.0;
  }

  // --- Localization helpers ---
  _syncDocumentLanguage() {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = this.settings?.lang === 'en' ? 'en' : 'zh-CN';
    }
  }

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
    this._syncDocumentLanguage();
    this.save();
    this._emit('settings_changed', { lang: this.settings.lang });
  }

  setQuality(quality) {
    if (!['ultra', 'high', 'medium', 'low'].includes(quality)) return;
    this.settings.quality = quality;
    this.settings.qualityUserChosen = true;
    this.save();
    this._emit('settings_changed', { quality });
  }

  setTimeMode(mode) {
    if (!['cycle', 'day', 'night'].includes(mode)) return;
    this.settings.timeMode = mode;
    this.save();
    this._emit('settings_changed', { timeMode: mode });
  }

  setWeatherMode(mode) {
    if (!['dynamic', 'clear', 'overcast', 'sandstorm'].includes(mode)) return;
    this.settings.weatherMode = mode;
    this.save();
    this._emit('settings_changed', { weatherMode: mode });
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

  // --- Declarative World Mechanisms & Equipment Modifiers ---
  getMechanismProgress(mechId) {
    const mech = WORLD_MECHANISMS[mechId];
    if (!mech) return { done: 0, total: 0, complete: false };
    if (mech.kind === 'group') {
      const map = this[mech.stateProp] || {};
      let done = 0;
      for (const n of mech.nodes) {
        if (map[n.id]) done += 1;
      }
      const total = mech.nodes.length;
      return { done, total, complete: total > 0 && done >= total };
    }
    const active = Boolean(this[mech.stateProp]);
    return { done: active ? 1 : 0, total: 1, complete: active };
  }

  isMechanismComplete(mechId) {
    return this.getMechanismProgress(mechId).complete;
  }

  isMechanismNodeActive(mechId, nodeId) {
    const mech = WORLD_MECHANISMS[mechId];
    if (!mech) return false;
    if (mech.kind === 'group') {
      return Boolean(this[mech.stateProp] && this[mech.stateProp][nodeId]);
    }
    return Boolean(this[mech.stateProp]);
  }

  activateMechanism(mechId, nodeId = null) {
    const mech = WORLD_MECHANISMS[mechId];
    if (!mech) return { ok: false, reason: 'unknown_mechanism' };
    if (mech.region && !this.isRegionUnlocked(mech.region)) {
      return { ok: false, reason: 'locked_region' };
    }
    const nodeDef = mech.nodes?.find((n) => n.id === nodeId);
    if (nodeDef?.region && !this.isRegionUnlocked(nodeDef.region)) {
      return { ok: false, reason: 'locked_region' };
    }
    if (mech.kind === 'group') {
      const valid = mech.nodes.some((n) => n.id === nodeId);
      if (!valid) return { ok: false, reason: 'invalid_node' };
      if (this[mech.stateProp][nodeId]) {
        return { ok: false, reason: 'already_active' };
      }
      this[mech.stateProp][nodeId] = true;
    } else {
      if (this[mech.stateProp]) {
        return { ok: false, reason: 'already_active' };
      }
      this[mech.stateProp] = true;
    }
    this.markProgress();
    this._evaluateSideTasks();
    const prog = this.getMechanismProgress(mechId);
    this.save();
    this._emit('mechanism_activated', { mechId, nodeId, ...prog });
    return { ok: true, ...prog };
  }

  isBridgeExtended() {
    return this.isMechanismComplete('pylons');
  }

  getAlignedPylonCount() {
    return this.getMechanismProgress('pylons').done;
  }

  getActivatedCairnCount() {
    return this.getMechanismProgress('cairns').done;
  }

  isRidgeSpeedBoostActive() {
    return this.isMechanismComplete('cairns');
  }

  hasEquipment(slot) {
    return Boolean(this.equipment && this.equipment[slot]);
  }

  getEquipmentModifier(modKey, fallback = 1.0, combine = 'max') {
    let found = false;
    let acc = combine === 'mult' ? 1.0 : combine === 'sum' ? 0 : fallback;
    for (const def of Object.values(EQUIPMENT_DEFS)) {
      if (!this.hasEquipment(def.slot) || !def.modifiers) continue;
      const val = def.modifiers[modKey];
      if (!Number.isFinite(val)) continue;
      if (!found) {
        found = true;
        if (combine === 'max') acc = val;
        else if (combine === 'mult') acc = val;
        else if (combine === 'sum') acc = val;
      } else if (combine === 'max') {
        acc = Math.max(acc, val);
      } else if (combine === 'mult') {
        acc *= val;
      } else if (combine === 'sum') {
        acc += val;
      }
    }
    return found ? acc : fallback;
  }

  isNodeSonarHighlighted(nodeId) {
    return (this.sonarHighlightTimers[nodeId] || 0) > 0;
  }

  triggerSonarScan(rx, rz, maxRange) {
    if (!this.hasEquipment('drill')) {
      return { ok: false, reason: 'missing_drill', count: 0, foundIds: [] };
    }
    const effRange =
      Number.isFinite(maxRange) && maxRange > 0
        ? maxRange
        : this.getEquipmentModifier('sonarRange', 42, 'max');
    const foundIds = [];
    for (const node of RESOURCE_NODES) {
      if (!node.subsurface) continue;
      if (!this.isRegionUnlocked(node.region)) continue;
      const d = Math.hypot(node.x - rx, node.z - rz);
      if (d <= effRange) {
        this.sonarHighlightTimers[node.id] = 22.0;
        foundIds.push(node.id);
      }
    }
    this.sonarResonanceTimer = 8.0;
    this._emit('sonar_pulsed', { x: rx, z: rz, foundIds, count: foundIds.length, resonanceDuration: 8.0 });
    return { ok: true, count: foundIds.length, foundIds, resonanceDuration: 8.0 };
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
    if (node.requiresMechanism && !this.isMechanismComplete(node.requiresMechanism)) {
      return { ok: false, reason: 'locked_mechanism', mechanism: node.requiresMechanism };
    }
    if (node.elevated && !this.hasEquipment('jetpack')) {
      return { ok: false, reason: 'missing_jetpack' };
    }
    if (!this.isNodeAvailable(nodeId)) return { ok: false, reason: 'regrowing' };
    if (node.subsurface && !this.hasEquipment('drill')) {
      return { ok: false, reason: 'missing_drill' };
    }

    this.nodeRegrowTimers[nodeId] = node.regrow || 22;
    delete this.sonarHighlightTimers[nodeId];
    const resonanceBonus = this.sonarResonanceTimer > 0 ? (this.hasEquipment('drill') ? 2 : 1) : 0;
    const totalYield = node.yield + resonanceBonus;
    this._addItem(node.materialId, totalYield);
    this.gatheredTotals[node.materialId] =
      (this.gatheredTotals[node.materialId] || 0) + totalYield;
    this.stats.totalGathered += totalYield;

    this.markProgress();
    this._evaluateSideTasks();
    this.save();
    this._emit('resource_gathered', {
      nodeId,
      materialId: node.materialId,
      count: totalYield,
      resonanceBonus,
      subsurface: Boolean(node.subsurface)
    });
    return {
      ok: true,
      materialId: node.materialId,
      count: totalYield,
      resonanceBonus,
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
    const res = this.activateMechanism('cairns', cairnId);
    if (!res.ok) return res;
    this._emit('cairn_activated', { cairnId, count: res.done });
    return { ok: true, count: res.done };
  }

  alignPylon(pylonId) {
    const res = this.activateMechanism('pylons', pylonId);
    if (!res.ok) {
      return res.reason === 'already_active'
        ? { ok: false, reason: 'already_aligned' }
        : res;
    }
    this._emit('pylon_aligned', {
      pylonId,
      alignedCount: res.done,
      bridgeNowOpen: res.complete
    });
    return { ok: true, alignedCount: res.done, bridgeNowOpen: res.complete };
  }

  restoreObservatory() {
    const res = this.activateMechanism('observatory');
    if (!res.ok) {
      return res.reason === 'already_active'
        ? { ok: false, reason: 'already_done' }
        : res;
    }
    this._emit('observatory_restored');
    return { ok: true };
  }

  areAllShipSystemsRepaired() {
    for (const rId of Object.keys(REPAIR_TARGETS)) {
      if (!this.repairs[rId]) return false;
    }
    return true;
  }

  completePreflightCheck(checkId) {
    if (!this.areAllShipSystemsRepaired()) {
      return { ok: false, reason: 'systems_not_ready' };
    }
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
    return (
      this.areAllShipSystemsRepaired() &&
      this.getPreflightDoneCount() >= PREFLIGHT_CHECKS.length
    );
  }

  _commitHomeworldSurvey(action) {
    this.markProgress();
    this.save();
    this._emit('homeworld_survey_changed', { action });
    return { ok: true };
  }

  acceptHomeworldSurvey() {
    if (!this.launchedHome) return { ok: false, reason: 'not_home_yet' };
    if (this.homeworldSurvey.accepted) return { ok: false, reason: 'already_accepted' };
    this.homeworldSurvey.accepted = true;
    return this._commitHomeworldSurvey('accepted');
  }

  recordHomeworldLandmark(id) {
    if (!this.homeworldSurvey.accepted) return { ok: false, reason: 'not_accepted' };
    if (!HOMEWORLD_LANDMARKS.some(point => point.id === id)) return { ok: false, reason: 'unknown_landmark' };
    if (this.homeworldSurvey.records[id]) return { ok: false, reason: 'already_recorded' };
    this.homeworldSurvey.records[id] = true;
    return this._commitHomeworldSurvey(id);
  }

  calibrateHomeworldRelay(action) {
    const survey = this.homeworldSurvey;
    if (!survey.accepted || !HOMEWORLD_LANDMARKS.every(point => survey.records[point.id])) {
      return { ok: false, reason: 'missing_records' };
    }
    if (survey.calibration >= HOMEWORLD_CALIBRATION.length) return { ok: false, reason: 'already_calibrated' };
    if (HOMEWORLD_CALIBRATION[survey.calibration].id !== action) return { ok: false, reason: 'wrong_sequence' };
    survey.calibration++;
    return this._commitHomeworldSurvey('calibration');
  }

  completeHomeworldSurvey() {
    const survey = this.homeworldSurvey;
    if (survey.completed) return { ok: false, reason: 'already_completed' };
    if (!survey.accepted || survey.calibration !== HOMEWORLD_CALIBRATION.length ||
      !HOMEWORLD_LANDMARKS.every(point => survey.records[point.id])) return { ok: false, reason: 'incomplete' };
    survey.completed = true;
    return this._commitHomeworldSurvey('completed');
  }

  triggerLaunchAndCompleteGame() {
    if (!this.canLaunchSpacecraft()) return { ok: false, reason: 'not_ready' };
    const finalLvl = LEVELS.length;
    const firstLaunch = !this.completedLevels[finalLvl];
    this.completedLevels[finalLvl] = true;
    this.launchedHome = true;
    this.activeWorldPlane = 'homeworld';
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
    if (recipe.targetRepairId) {
      const target = REPAIR_TARGETS[recipe.targetRepairId];
      const levelDef = target ? LEVELS[target.level - 1] : null;
      if (levelDef?.prerequisiteMechanism && !this.isMechanismComplete(levelDef.prerequisiteMechanism)) {
        return {
          ok: false,
          reason: 'locked_mechanism',
          mechanism: levelDef.prerequisiteMechanism,
          missing: []
        };
      }
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
    const levelDef = LEVELS[target.level - 1];
    if (levelDef?.prerequisiteMechanism && !this.isMechanismComplete(levelDef.prerequisiteMechanism)) {
      return { ok: false, reason: 'locked_mechanism', mechanism: levelDef.prerequisiteMechanism };
    }

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

    // Advance level (for Levels 1..N-1; final Level N completes upon Launch after pre-flight checks)
    const maxLevel = LEVELS.length;
    let completedLevelDef = null;
    const lvlNum = target.level;
    if (lvlNum >= 1 && lvlNum < maxLevel && !this.completedLevels[lvlNum]) {
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
      return this.getMechanismProgress(task.groupKey).done;
    }
    if (task.type === 'facility_flag') {
      if (WORLD_MECHANISMS[task.flagKey]) {
        return this.getMechanismProgress(task.flagKey).done;
      }
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

  // Layer 1: Side-task progress (automatically switches to Post-Game Exploration Summary once launchedHome!)
  getSideTasksStatus(levelNum) {
    if (levelNum === undefined && this.launchedHome) {
      const zh = this.lang === 'zh';
      const logsDone = Object.keys(this.logsRead).length;
      const logsTotal = Object.keys(CREW_LOGS).length;
      const allSide = this.getAllCompletedSideTaskCount();
      const hwProg = this.getHomeworldProgress();
      return [
        {
          id: 'postgame_hw_watch',
          label: zh ? '完成母星翡翠河谷首轮巡检' : 'Complete Homeworld Emerald Valley Watch',
          current: hwProg.doneSteps,
          target: hwProg.totalSteps,
          completed: Boolean(this.homeworldSurvey?.completed),
          rewardText: this.homeworldSurvey?.completed
            ? (zh ? '已授勋归航纪念章 · 解锁谷地全景漫游' : 'Homecoming Medallion awarded · Valley View unlocked')
            : (zh ? '可由飞船舷梯或右上角重返母星家园推进' : 'Return to Homeworld via ramp or Ship Card to advance')
        },
        {
          id: 'postgame_all_logs',
          label: zh ? '寻回全星区失落船员日志' : 'Recover All Planetary Crew Logs',
          current: logsDone,
          target: logsTotal,
          completed: logsDone >= logsTotal,
          rewardText: zh ? '完整还原星织号迫降与先驱母舰始末' : 'Complete Starweaver & Dawnstrider lore archive'
        },
        {
          id: 'postgame_all_sides',
          label: zh ? '达成各扇区可选科考支线' : 'Complete Regional Optional Side Tasks',
          current: allSide.done,
          target: allSide.total,
          completed: allSide.done >= allSide.total,
          rewardText: zh ? '解锁全部外观光环与高阶工程物资' : 'All cosmetic auras & bonus parts unlocked'
        }
      ];
    }

    const lvlDef = LEVELS[clampLevel(levelNum ?? this.currentLevel) - 1];
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

  // Authoritative Homeworld Meadow Watch & Archive Progress (for Homeworld-specific HUD drawers!)
  getHomeworldProgress() {
    const zh = this.lang === 'zh';
    const survey = this.homeworldSurvey || createHomeworldSurvey();
    const steps = [
      {
        id: 'hw_step_accept',
        label: zh ? '与米拉队长交谈接取巡检' : 'Speak with Captain Mira to start watch',
        current: survey.accepted ? 1 : 0,
        needed: 1,
        done: Boolean(survey.accepted)
      },
      {
        id: 'hw_step_obs',
        label: zh ? '西北观测坡：记录基准星图' : 'Northwest Hill: Record star chart',
        current: survey.records?.observatory ? 1 : 0,
        needed: 1,
        done: Boolean(survey.records?.observatory)
      },
      {
        id: 'hw_step_nursery',
        label: zh ? '东部生态苗圃：采集生态读数' : 'Eastern Nursery: Collect eco readings',
        current: survey.records?.nursery ? 1 : 0,
        needed: 1,
        done: Boolean(survey.records?.nursery)
      },
      {
        id: 'hw_step_energy',
        label: zh ? '河岸能源站：检查负载并接通电网' : 'Riverside Station: Restore turbine grid',
        current: survey.calibration || 0,
        needed: 3,
        done: (survey.calibration || 0) >= 3
      },
      {
        id: 'hw_step_report',
        label: zh ? '返回米拉队长汇报并点亮纪念碑' : 'Report back & light the Star Monument',
        current: survey.completed ? 1 : 0,
        needed: 1,
        done: Boolean(survey.completed)
      }
    ];
    let foundActive = false;
    for (const step of steps) {
      if (!step.done && !foundActive) {
        step.active = true;
        foundActive = true;
      } else {
        step.active = false;
      }
    }
    const doneSteps = steps.filter((s) => s.done).length;
    const beaconProg = this.getMechanismProgress('weather_beacons');
    const logsDone = Object.keys(this.logsRead).length;
    const logsTotal = Object.keys(CREW_LOGS).length;
    const allSide = this.getAllCompletedSideTaskCount();
    const allBeaconsLinked = beaconProg.total > 0 && beaconProg.done >= beaconProg.total;

    const telemetryLinks = [
      {
        id: 'hw_link_beacons',
        label: zh ? '远航行星气象信标并网' : 'Planetary Climate Beacons Linked',
        current: beaconProg.done,
        target: beaconProg.total,
        completed: allBeaconsLinked,
        rewardText: allBeaconsLinked
          ? (zh ? '五大生态区气象遥测数据已实时接入观测台' : 'All 5 regional climate feeds active at the Observatory')
          : (zh ? '可随时返回荒漠各生态区激活气象遥测信标' : 'Return to the desert biomes to link climate beacons')
      },
      {
        id: 'hw_link_logs',
        label: zh ? '星航失落船员日志归档' : 'Expedition Crew Logs Archived',
        current: logsDone,
        target: logsTotal,
        completed: logsDone >= logsTotal,
        rewardText: zh ? '收录于母星先驱航行档案馆' : 'Archived in the Homeworld Pioneer Chronicle'
      },
      {
        id: 'hw_link_sides',
        label: zh ? '星区科考支线全收集' : 'Sector Expedition Side Tasks',
        current: allSide.done,
        target: allSide.total,
        completed: allSide.done >= allSide.total,
        rewardText: zh ? '全扇区工程与生态勘测记录完备' : 'Full sector engineering & ecological survey records'
      }
    ];

    const ringsMap = survey.flightRings || {};
    const flightRingsTotal = HOMEWORLD_AERIAL_RINGS.length;
    const flightRingsDone = HOMEWORLD_AERIAL_RINGS.filter((r) => Boolean(ringsMap[r.id])).length;
    const jetflameUnlocked = Boolean(this.cosmetics?.golden_jetflame || flightRingsDone >= flightRingsTotal);
    const plaquesMap = survey.skyPlaques || {};
    const skyPlaquesTotal = HOMEWORLD_SKY_PLAQUES.length;
    const skyPlaquesDone = HOMEWORLD_SKY_PLAQUES.filter((p) => Boolean(plaquesMap[p.id])).length;
    const bestRingTrialSec = Number.isFinite(survey.bestRingTrialSec) ? survey.bestRingTrialSec : null;

    const archives = [
      {
        id: 'hw_item_sprout',
        color: '#52ffb8',
        unlocked: true,
        name: zh ? '生态舱小绿芽' : 'Bio-Dome Sprout',
        status: zh ? '已归植' : 'Planted'
      },
      {
        id: 'hw_item_starchart',
        color: '#ffd266',
        unlocked: Boolean(survey.records?.observatory),
        name: zh ? '环带行星基准星图' : 'Ringed-Planet Star Chart',
        status: survey.records?.observatory ? (zh ? '已归档' : 'Archived') : (zh ? '待记录' : 'Pending')
      },
      {
        id: 'hw_item_ecolog',
        color: '#6effa8',
        unlocked: Boolean(survey.records?.nursery),
        name: zh ? '翡翠苗圃生态志' : 'Nursery Eco-Folio',
        status: survey.records?.nursery ? (zh ? '已同步' : 'Synced') : (zh ? '待采集' : 'Pending')
      },
      {
        id: 'hw_item_grid',
        color: '#5ce8ff',
        unlocked: (survey.calibration || 0) >= 3,
        name: zh ? '水轮机并网铭牌' : 'Hydro-Grid Seal',
        status: (survey.calibration || 0) >= 3 ? (zh ? '已并网' : 'Online') : `${survey.calibration || 0}/3`
      },
      {
        id: 'hw_item_medallion',
        color: '#ffbe4d',
        unlocked: Boolean(survey.completed),
        name: zh ? '星织号归航纪念章' : 'Homecoming Medallion',
        status: survey.completed ? (zh ? '★ 已授勋' : '★ Awarded') : (zh ? '待授勋' : 'Locked')
      },
      {
        id: 'hw_item_telemetry',
        color: '#66ffc2',
        unlocked: allBeaconsLinked,
        name: zh ? '行星气象遥测总谱' : 'Planetary Telemetry Atlas',
        status: allBeaconsLinked ? (zh ? '★ 已并网' : '★ Linked') : `${beaconProg.done}/${beaconProg.total}`
      },
      {
        id: 'hw_item_crewlore',
        color: '#78f5ff',
        unlocked: logsDone >= logsTotal && logsTotal > 0,
        name: zh ? '星织号航行全志' : 'Starweaver Chronicle',
        status: logsDone >= logsTotal ? (zh ? '★ 已集齐' : '★ Complete') : `${logsDone}/${logsTotal}`
      },
      {
        id: 'hw_item_jetflame',
        color: '#ffd659',
        unlocked: jetflameUnlocked,
        name: zh ? '金辉星芒尾焰' : 'Golden Starburst Jetflame',
        status: jetflameUnlocked ? (zh ? '★ 已解锁' : '★ Unlocked') : `${flightRingsDone}/${flightRingsTotal}`
      },
      {
        id: 'hw_item_plaques',
        color: '#7bf0ff',
        unlocked: skyPlaquesDone >= skyPlaquesTotal && skyPlaquesTotal > 0,
        name: zh ? '高空风语碑志' : 'Sky-Terrace Plaques',
        status: skyPlaquesDone >= skyPlaquesTotal ? (zh ? '★ 已齐集' : '★ Complete') : `${skyPlaquesDone}/${skyPlaquesTotal}`
      },
      {
        id: 'hw_item_starflora',
        color: '#ff96e8',
        unlocked: Boolean(survey.nurseryBloomed),
        name: zh ? '跨星荧光花圃' : 'Bioluminescent Star-Flora',
        status: survey.nurseryBloomed ? (zh ? '★ 已绽放' : '★ Bloomed') : (zh ? '待引种' : 'Pending')
      }
    ];
    const atmoUnlocked = this.isHomeworldAtmosphereUnlocked();
    const atmoMode = this.getHomeworldAtmosphere();
    const title = survey.completed && allBeaconsLinked
      ? (zh ? '家园终章 —— 双星生态遥测全并网' : 'Homeworld Finale — Twin-World Telemetry Linked')
      : survey.completed && atmoUnlocked
        ? (zh ? '家园终章 —— 观景台天象模式已解锁' : 'Homeworld Finale — Observatory Sky Mode Unlocked')
        : survey.completed
          ? (zh ? '家园终章 —— 翡翠河谷巡检（已完成）' : 'Homeworld Finale — Emerald Valley Watch (Complete)')
          : (zh ? '家园终章 —— 翡翠河谷巡检' : 'Homeworld Finale — Emerald Valley Watch');
    const summary = survey.completed && allBeaconsLinked
      ? (zh
          ? '翡翠河谷巡检与五大生态区气象遥测已全部并网！可在观景台随时切换「金碧晨光 / 黄金晚霞 / 星河晴夜」观赏模式。'
          : 'Emerald Valley Watch and all 5 Planetary Climate Beacons are linked! Switch Dawn / Sunset / Starry Night at the Observatory.')
      : survey.completed && atmoUnlocked
        ? (zh
            ? `河谷巡检与 ${beaconProg.done}/${beaconProg.total} 座荒漠气象信标已并网！已解锁母星观景台「黄金晚霞 / 星河晴夜」观赏开关。`
            : `Valley Watch & ${beaconProg.done}/${beaconProg.total} Climate Beacons linked! Observatory Sunset / Starry Night switcher unlocked.`)
        : survey.completed
          ? (zh
              ? `河谷首轮巡检已完成（气象遥测已并网 ${beaconProg.done}/${beaconProg.total}，满 3 座即可解锁母星晚霞/星夜开关）。`
              : `Valley Watch complete (${beaconProg.done}/${beaconProg.total} Climate Beacons linked; link 3+ to unlock Sunset/Night mode).`)
          : (zh
              ? '漫步翠绿河谷，核验星航观测台、生态苗圃与河岸水轮电站，无需消耗荒漠物资。'
              : 'Stroll the sunlit valley, verify the observatory, nursery, and hydro station — zero desert materials needed.');
    return {
      title,
      summary,
      steps,
      doneSteps,
      totalSteps: steps.length,
      fraction: doneSteps / steps.length,
      telemetryLinks,
      archives,
      unlockedArchiveCount: archives.filter((a) => a.unlocked).length,
      flightRingsDone,
      flightRingsTotal,
      skyPlaquesDone,
      skyPlaquesTotal,
      bestRingTrialSec,
      atmosphereUnlocked: atmoUnlocked,
      atmosphereMode: atmoMode
    };
  }

  recordHomeworldFlightRing(ringId) {
    if (!ringId) return { ok: false };
    if (!this.homeworldSurvey || typeof this.homeworldSurvey !== 'object') {
      this.homeworldSurvey = createHomeworldSurvey();
    }
    if (!this.homeworldSurvey.flightRings || typeof this.homeworldSurvey.flightRings !== 'object') {
      this.homeworldSurvey.flightRings = {};
    }
    const valid = HOMEWORLD_AERIAL_RINGS.some((r) => r.id === ringId);
    if (!valid) return { ok: false };
    const firstTime = !this.homeworldSurvey.flightRings[ringId];
    this.homeworldSurvey.flightRings[ringId] = true;
    const clearedCount = HOMEWORLD_AERIAL_RINGS.filter((r) => Boolean(this.homeworldSurvey.flightRings[r.id])).length;
    const total = HOMEWORLD_AERIAL_RINGS.length;
    let unlockedJetflame = false;
    if (clearedCount >= total && !this.cosmetics.golden_jetflame) {
      this.cosmetics.golden_jetflame = true;
      unlockedJetflame = true;
    }
    this.save();
    this._emit('homeworld_ring_passed', { ringId, firstTime, clearedCount, total, unlockedJetflame });
    return { ok: true, firstTime, clearedCount, total, unlockedJetflame };
  }

  recordHomeworldSkyPlaque(plaqueId) {
    if (!HOMEWORLD_SKY_PLAQUES.some((p) => p.id === plaqueId)) return { ok: false };
    if (!this.homeworldSurvey || typeof this.homeworldSurvey !== 'object') {
      this.homeworldSurvey = createHomeworldSurvey();
    }
    if (!this.homeworldSurvey.skyPlaques || typeof this.homeworldSurvey.skyPlaques !== 'object') {
      this.homeworldSurvey.skyPlaques = {};
    }
    const firstTime = !this.homeworldSurvey.skyPlaques[plaqueId];
    this.homeworldSurvey.skyPlaques[plaqueId] = true;
    const done = HOMEWORLD_SKY_PLAQUES.filter((p) => Boolean(this.homeworldSurvey.skyPlaques[p.id])).length;
    const total = HOMEWORLD_SKY_PLAQUES.length;
    this.save();
    this._emit('hud_dirty');
    return { ok: true, firstTime, done, total };
  }

  recordHomeworldSkyTrial(elapsedSec) {
    const cleanSec = Math.round(Math.max(0.1, Number(elapsedSec) || 0) * 100) / 100;
    if (!Number.isFinite(cleanSec)) return { ok: false };
    if (!this.homeworldSurvey || typeof this.homeworldSurvey !== 'object') {
      this.homeworldSurvey = createHomeworldSurvey();
    }
    const prev = this.homeworldSurvey.bestRingTrialSec;
    const isNewBest = !Number.isFinite(prev) || cleanSec < prev;
    if (isNewBest) {
      this.homeworldSurvey.bestRingTrialSec = cleanSec;
      this.save();
      this._emit('hud_dirty');
    }
    return { ok: true, sec: cleanSec, bestSec: this.homeworldSurvey.bestRingTrialSec, isNewBest };
  }

  bloomHomeworldNursery() {
    if (!this.homeworldSurvey || typeof this.homeworldSurvey !== 'object') {
      this.homeworldSurvey = createHomeworldSurvey();
    }
    if (this.homeworldSurvey.nurseryBloomed) {
      return { ok: true, alreadyBloomed: true };
    }
    const candidates = ['raw_quartz', 'refined_quartz', 'plasma_crystal'];
    let available = 0;
    for (const id of candidates) available += this.getItemCount(id);
    // Once the colony grid & patrol are completed, the colony seed bank can power the bloom without desert crystals
    if (available < 2 && !this.homeworldSurvey.completed) {
      return { ok: false, reason: 'missing_crystals', available };
    }
    if (available >= 2) {
      let toSpend = 2;
      for (const id of candidates) {
        if (toSpend <= 0) break;
        const have = this.getItemCount(id);
        if (have > 0) {
          const take = Math.min(have, toSpend);
          this.inventory[id] = have - take;
          if (this.inventory[id] <= 0) delete this.inventory[id];
          toSpend -= take;
        }
      }
    }
    this.homeworldSurvey.nurseryBloomed = true;
    this.save();
    this._emit('hud_dirty');
    return { ok: true, alreadyBloomed: false };
  }

  applyWeatherOverdrive(seconds = 24) {
    if (!this.craftingQueue || this.craftingQueue.length === 0) {
      return { ok: false, completedCount: 0, accelerated: false };
    }
    let pool = Math.max(0, Number(seconds) || 0);
    let completedCount = 0;
    while (pool > 0 && this.craftingQueue.length > 0) {
      const head = this.craftingQueue[0];
      if (head.remaining <= pool) {
        pool -= Math.max(0, head.remaining);
        this.craftingQueue.shift();
        const recipe = RECIPES.find((r) => r.id === head.recipeId);
        if (recipe) {
          if (recipe.oneTimeEquipment) {
            this.equipment[recipe.oneTimeEquipment] = true;
          } else {
            this._addItem(recipe.output.id, recipe.output.count);
          }
          this.stats.totalCrafted += 1;
          this._emit('craft_completed', { recipe, overdrive: true });
        }
        completedCount += 1;
      } else {
        head.remaining -= pool;
        pool = 0;
      }
    }
    this.markProgress();
    this._evaluateSideTasks();
    this.save();
    this._emit('hud_dirty');
    return { ok: true, completedCount, accelerated: true };
  }

  collectDesertAerialMote(mote) {
    if (!mote || !mote.rewardMat) return { ok: false };
    const count = Math.max(1, Number(mote.count) || 1);
    this._addItem(mote.rewardMat, count);
    this.gatheredTotals[mote.rewardMat] = (this.gatheredTotals[mote.rewardMat] || 0) + count;
    this.stats.totalGathered += count;
    let queueBoosted = false;
    if (this.craftingQueue.length > 0) {
      this.applyWeatherOverdrive(6);
      queueBoosted = true;
    } else {
      this.markProgress();
      this._evaluateSideTasks();
      this.save();
    }
    this._emit('aerial_mote_collected', { moteId: mote.id, rewardMat: mote.rewardMat, count, queueBoosted });
    return { ok: true, rewardMat: mote.rewardMat, count, queueBoosted };
  }

  // Layer 2: Current-level repair progress (dynamically routes to Post-Game Climate Expedition when launchedHome!)
  getCurrentLevelProgress(levelNum) {
    if (levelNum === undefined && this.launchedHome) {
      const zh = this.lang === 'zh';
      const beaconMech = WORLD_MECHANISMS.weather_beacons;
      const beaconLabels = {
        wbeacon_ridge: { zh: '部署东侧【低语山脊】气象遥测信标', en: 'Link East Whispering Ridge Climate Beacon' },
        wbeacon_canyon: { zh: '部署南侧【干涸峡谷】气象遥测信标', en: 'Link South Dry Canyon Climate Beacon' },
        wbeacon_gorge: { zh: '部署西侧【中继裂谷】气象遥测信标', en: 'Link West Relay Gorge Climate Beacon' },
        wbeacon_vents: { zh: '部署北侧【地热喷口】气象遥测信标', en: 'Link North Geothermal Vents Climate Beacon' },
        wbeacon_salt: { zh: '部署东南【晶化盐湖】气象遥测信标', en: 'Link Southeast Salt Flats Climate Beacon' }
      };
      const steps = (beaconMech ? beaconMech.nodes : []).map((bn) => {
        const active = this.isMechanismNodeActive('weather_beacons', bn.id);
        const lblObj = beaconLabels[bn.id] || { zh: bn.id, en: bn.id };
        return {
          id: bn.id,
          regionId: bn.region || null,
          label: zh ? lblObj.zh : lblObj.en,
          current: active ? 1 : 0,
          needed: 1,
          done: active
        };
      });
      const doneSteps = steps.filter((s) => s.done).length;
      const allLinked = steps.length > 0 && doneSteps >= steps.length;
      return {
        level: LEVELS.length,
        isPostGame: true,
        title: allLinked
          ? (zh ? '终局科考圆满完成 —— 大气监测网已并网' : 'Expedition Complete — Planetary Grid Online')
          : (zh ? '终局科考委托 —— 行星气象遥测并网' : 'Post-Game Expedition — Climate Telemetry Grid'),
        summary: allLinked
          ? (zh ? '五大生态区遥测信标已全部连入母星科研院！可自由探索寻回日志，或前往飞船舷梯重返母星家园。'
                : 'All 5 regional climate beacons are linked to Homeworld! Explore freely or board the ramp to visit Homeworld.')
          : (zh ? '星织号已完成全部修复！前往五大生态区激活 5 座行星科考气象遥测信标，将大气数据并入母星。'
                : 'Starweaver is 100% repaired! Visit the 5 biomes to activate Planetary Climate Telemetry Beacons.'),
        hint: zh
          ? '跟随脚下翠绿导航箭头前往各生态区激活【行星科考气象遥测信标】，或前往飞船右侧舷梯重温返航回到母星家园！'
          : 'Follow the emerald arrow to activate all 5 Climate Telemetry Beacons, or board the ramp to return to Homeworld!',
        steps,
        doneSteps,
        totalSteps: steps.length,
        fraction: steps.length > 0 ? doneSteps / steps.length : 1
      };
    }

    const lvlDef = LEVELS[clampLevel(levelNum ?? this.currentLevel) - 1];
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
        const eqRec = RECIPES.find((r) => r.oneTimeEquipment === step.equipmentSlot);
        const eqOutId = eqRec ? eqRec.output.id : '';
        if (this.hasEquipment(step.equipmentSlot) || (eqOutId && this.isQueuedOutput(eqOutId))) {
          current = step.needed;
        }
      } else if (step.type === 'repair_installed') {
        current = this.repairs[step.repairId] ? 1 : 0;
      } else if (step.type === 'activate_group') {
        current = this.getMechanismProgress(step.groupKey).done;
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

  // Layer 3: Global spacecraft repair progress (data-driven across all REPAIR_TARGETS)
  getGlobalRepairProgress() {
    const orderedTargets = Object.values(REPAIR_TARGETS).sort((a, b) => a.level - b.level);
    const systems = orderedTargets.map((target) => ({
      id: target.id,
      level: target.level,
      shortLabel: this.text(target.shortLabel) || `${target.level}`,
      name: this.text(target.name),
      repaired: Boolean(this.repairs[target.id])
    }));
    const repairedCount = systems.filter((s) => s.repaired).length;
    return {
      repairedCount,
      totalSystems: orderedTargets.length,
      systems
    };
  }

  // --- Frame Tick (Queue Processing & Node Regrowth) ---
  update(dt) {
    let dirtyHud = false;

    // 1. Tick regrowing resource veins & sonar highlight timers (for-in avoids per-frame key array allocation)
    for (const nodeId in this.nodeRegrowTimers) {
      this.nodeRegrowTimers[nodeId] -= dt;
      if (this.nodeRegrowTimers[nodeId] <= 0) {
        delete this.nodeRegrowTimers[nodeId];
        this._emit('node_regrown', { nodeId });
      }
    }
    if (this.sonarResonanceTimer > 0) {
      this.sonarResonanceTimer = Math.max(0, this.sonarResonanceTimer - dt);
    }
    for (const nodeId in this.sonarHighlightTimers) {
      this.sonarHighlightTimers[nodeId] -= dt;
      if (this.sonarHighlightTimers[nodeId] <= 0) {
        delete this.sonarHighlightTimers[nodeId];
      }
    }

    // 2. Tick active crafting queue (station speed resolved declaratively via STATION_TYPES!)
    if (this.craftingQueue.length > 0) {
      const head = this.craftingQueue[0];
      const speedMult = this.getStationSpeedMultiplier(head.station);
      head.remaining -= dt * speedMult;
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

    // 3. Tick Autonomous Mining Drone Fleet (delivers unlocked regional raw ores to cargo every N seconds!)
    const droneInterval = this.getEquipmentModifier('droneIntervalSec', 0, 'max');
    if (droneInterval > 0) {
      this.droneHarvestAccum = (this.droneHarvestAccum || 0) + dt;
      if (this.droneHarvestAccum >= droneInterval) {
        this.droneHarvestAccum -= droneInterval;
        const unlockedRawIds = [];
        for (const n of RESOURCE_NODES) {
          if (!this.isRegionUnlocked(n.region)) continue;
          if (n.subsurface && !this.hasEquipment('drill')) continue;
          if (n.elevated && !this.hasEquipment('jetpack')) continue;
          if (n.requiresMechanism && !this.isMechanismComplete(n.requiresMechanism)) continue;
          if (!unlockedRawIds.includes(n.materialId)) {
            unlockedRawIds.push(n.materialId);
          }
        }
        if (unlockedRawIds.length > 0) {
          // Prioritize whichever unlocked raw ore has the lowest current cargo stock!
          unlockedRawIds.sort(
            (a, b) => this.getItemCount(a) - this.getItemCount(b)
          );
          const pickIdx = (this._droneCycleIdx++) % Math.min(3, unlockedRawIds.length);
          const chosenId = unlockedRawIds[pickIdx];
          if ((this.inventory[chosenId] || 0) < 999) {
            const yieldCount = 2;
            this._addItem(chosenId, yieldCount);
            this.gatheredTotals[chosenId] =
              (this.gatheredTotals[chosenId] || 0) + yieldCount;
            this.stats.totalGathered += yieldCount;
            this._evaluateSideTasks();
            this.save();
            this._emit('drone_delivered', {
              materialId: chosenId,
              count: yieldCount
            });
          }
        }
      }
    }

    if (dirtyHud) {
      this._emit('queue_tick');
    }
  }

  /**
   * Catches up desert timers (regrowth, crafting queue, drones) in bounded steps
   * when returning from another planetary plane after away-time isolation.
   */
  fastForward(elapsedSec, maxSec = 300) {
    let remaining = Math.min(maxSec, Math.max(0, Number(elapsedSec) || 0));
    if (remaining <= 0) return 0;
    const clamped = remaining;
    while (remaining > 0) {
      const step = Math.min(1.0, remaining);
      this.update(step);
      remaining -= step;
    }
    return clamped;
  }
}

function clampLevel(lvl) {
  return Math.max(1, Math.min(LEVELS.length, lvl || 1));
}
