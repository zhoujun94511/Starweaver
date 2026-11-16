import { sanitizeHomeworldSurvey } from '../data/homeworldActivities.js';
import {
  CREW_LOGS,
  EQUIPMENT_DEFS,
  LEVELS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  WORLD_MECHANISMS
} from '../data/gameData.js';

export const STORAGE_KEY = 'little_bot_homebound_save_v1';

export function detectInitialQualityPreset() {
  if (typeof window === 'undefined') return 'high';
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const maxTouch =
    typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0;
  const isTouchDevice =
    coarse ||
    (('ontouchstart' in window || maxTouch) &&
      Math.min(window.innerWidth || 1440, window.innerHeight || 900) <= 1024);
  return isTouchDevice ? 'medium' : 'high';
}

export function saveGameState(state, immediate = false) {
  if (!state.storageAvailable) return false;
  if (immediate || typeof window === 'undefined') {
    return writeGameStorageNow(state);
  }
  state._savePending = true;
  if (state._saveTimer === null) {
    state._saveTimer = setTimeout(() => {
      state._saveTimer = null;
      if (state._savePending) {
        writeGameStorageNow(state);
      }
    }, 120);
  }
  return true;
}

export function flushGameSave(state) {
  if (state._saveTimer !== null) {
    clearTimeout(state._saveTimer);
    state._saveTimer = null;
  }
  if (state._savePending) {
    writeGameStorageNow(state);
  }
}

export function writeGameStorageNow(state) {
  state._savePending = false;
  if (!state.storageAvailable) return false;
  try {
    // Fold any in-flight crafting queue outputs & craft counters into persisted snapshot so closing tab mid-smelt never loses inputs or desyncs stats!
    const snapshotInventory = { ...state.inventory };
    const snapshotEquipment = { ...state.equipment };
    const snapshotCraftedEver = { ...state.craftedEver };
    const snapshotStats = { ...state.stats };
    for (const job of state.craftingQueue) {
      const rec = RECIPES.find((r) => r.id === job.recipeId);
      if (rec) {
        if (rec.oneTimeEquipment) {
          snapshotEquipment[rec.oneTimeEquipment] = true;
        } else {
          snapshotInventory[rec.output.id] =
            (snapshotInventory[rec.output.id] || 0) + rec.output.count;
        }
        snapshotCraftedEver[rec.output.id] =
          (snapshotCraftedEver[rec.output.id] || 0) + rec.output.count;
        snapshotStats.totalCrafted = (snapshotStats.totalCrafted || 0) + 1;
      }
    }

    const snapshotRegrow = {};
    for (const [nId, rem] of Object.entries(state.nodeRegrowTimers)) {
      if (Number.isFinite(rem) && rem > 0.25) {
        snapshotRegrow[nId] = Math.round(rem * 10) / 10;
      }
    }

    const payload = {
      version: 1,
      currentLevel: state.currentLevel,
      inventory: snapshotInventory,
      equipment: snapshotEquipment,
      gatheredTotals: state.gatheredTotals,
      craftedEver: snapshotCraftedEver,
      nodeRegrowTimers: snapshotRegrow,
      envClock: state.envClock,
      repairs: state.repairs,
      completedLevels: state.completedLevels,
      claimedSideTasks: state.claimedSideTasks,
      logsRead: state.logsRead,
      preflightDone: state.preflightDone,
      homeworldSurvey: state.homeworldSurvey,
      cosmetics: state.cosmetics,
      launchedHome: state.launchedHome,
      activeWorldPlane: state.activeWorldPlane || 'desert',
      stats: snapshotStats,
      settings: state.settings
    };
    for (const mech of Object.values(WORLD_MECHANISMS)) {
      payload[mech.stateProp] = state[mech.stateProp];
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    if (err?.name !== 'QuotaExceededError') {
      state.storageAvailable = false;
    }
    return false;
  }
}

export function loadGameState(state) {
  if (!state.storageAvailable) return false;
  state.flushSave();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) return false;

    // Strict schema validation & sanitization (data-driven across LEVELS.length)
    const maxLevel = LEVELS.length;
    const lvl = Number(data.currentLevel);
    state.currentLevel =
      Number.isInteger(lvl) && lvl >= 1 && lvl <= maxLevel ? lvl : 1;

    state.inventory = {};
    if (data.inventory && typeof data.inventory === 'object') {
      for (const id of Object.keys(MATERIALS)) {
        const v = Math.floor(Number(data.inventory[id] || 0));
        if (Number.isFinite(v) && v > 0) state.inventory[id] = Math.min(v, 9999);
      }
    }

    state.gatheredTotals = {};
    if (data.gatheredTotals && typeof data.gatheredTotals === 'object') {
      for (const id of Object.keys(MATERIALS)) {
        const v = Math.floor(Number(data.gatheredTotals[id] || 0));
        if (Number.isFinite(v) && v > 0) state.gatheredTotals[id] = Math.min(v, 99999);
      }
    }

    state.craftedEver = {};
    if (data.craftedEver && typeof data.craftedEver === 'object') {
      for (const id of Object.keys(MATERIALS)) {
        const v = Math.floor(Number(data.craftedEver[id] || 0));
        if (Number.isFinite(v) && v > 0) state.craftedEver[id] = Math.min(v, 99999);
      }
    }

    state.nodeRegrowTimers = {};
    if (data.nodeRegrowTimers && typeof data.nodeRegrowTimers === 'object') {
      for (const node of RESOURCE_NODES) {
        const rem = Number(data.nodeRegrowTimers[node.id]);
        if (Number.isFinite(rem) && rem > 0.2) {
          state.nodeRegrowTimers[node.id] = Math.min(rem, node.regrow || 120);
        }
      }
    }

    state.envClock = { cyclePhase: 0.14, playElapsed: 0 };
    if (data.envClock && typeof data.envClock === 'object') {
      const cp = Number(data.envClock.cyclePhase);
      const pe = Number(data.envClock.playElapsed);
      if (Number.isFinite(cp) && cp >= 0 && cp < 1) {
        state.envClock.cyclePhase = cp;
      }
      if (Number.isFinite(pe) && pe >= 0) {
        state.envClock.playElapsed = Math.min(pe, 1e7);
      }
    }

    for (const rId of Object.keys(REPAIR_TARGETS)) {
      state.repairs[rId] = Boolean(data.repairs && data.repairs[rId]);
    }

    state.completedLevels = {};
    for (let i = 1; i <= maxLevel; i++) {
      if (data.completedLevels && data.completedLevels[i]) {
        state.completedLevels[i] = true;
      }
    }

    state.claimedSideTasks = {};
    if (data.claimedSideTasks && typeof data.claimedSideTasks === 'object') {
      for (const lvlDef of LEVELS) {
        for (const st of lvlDef.sideTasks) {
          if (data.claimedSideTasks[st.id]) state.claimedSideTasks[st.id] = true;
        }
      }
    }

    state.logsRead = {};
    for (const logId of Object.keys(CREW_LOGS)) {
      if (data.logsRead && data.logsRead[logId]) state.logsRead[logId] = true;
    }

    for (const mech of Object.values(WORLD_MECHANISMS)) {
      if (mech.kind === 'group') {
        const cleanMap = {};
        const rawMap = data[mech.stateProp];
        if (rawMap && typeof rawMap === 'object') {
          for (const n of mech.nodes) {
            if (rawMap[n.id]) cleanMap[n.id] = true;
          }
        }
        state[mech.stateProp] = cleanMap;
      } else {
        state[mech.stateProp] = Boolean(data[mech.stateProp]);
      }
    }

    state.preflightDone = {};
    for (const chk of PREFLIGHT_CHECKS) {
      if (data.preflightDone && data.preflightDone[chk.id]) {
        state.preflightDone[chk.id] = true;
      }
    }

    state.cosmetics = {
      golden_antenna: Boolean(data.cosmetics && data.cosmetics.golden_antenna),
      star_halo: Boolean(data.cosmetics && data.cosmetics.star_halo),
      golden_jetflame: Boolean(data.cosmetics && data.cosmetics.golden_jetflame)
    };

    state.equipment = {};
    for (const def of Object.values(EQUIPMENT_DEFS)) {
      state.equipment[def.slot] = Boolean(
        (data.equipment && data.equipment[def.slot]) || state.inventory[def.itemId]
      );
      delete state.inventory[def.itemId];
    }
    state.sonarHighlightTimers = {};

    state.launchedHome = Boolean(data.launchedHome);
    state.homeworldSurvey = sanitizeHomeworldSurvey(data.homeworldSurvey);
    state.activeWorldPlane =
      state.launchedHome &&
      (data.activeWorldPlane === 'homeworld' ||
        (data.activeWorldPlane === undefined && state.homeworldSurvey.accepted))
        ? 'homeworld'
        : 'desert';

    if (data.stats && typeof data.stats === 'object') {
      const totalCrafted = Number(data.stats.totalCrafted || 0);
      const totalGathered = Number(data.stats.totalGathered || 0);
      state.stats.totalCrafted = Number.isFinite(totalCrafted)
        ? Math.max(0, Math.floor(totalCrafted))
        : 0;
      state.stats.totalGathered = Number.isFinite(totalGathered)
        ? Math.max(0, Math.floor(totalGathered))
        : 0;
    }

    if (data.settings && typeof data.settings === 'object') {
      const lang = data.settings.lang === 'en' ? 'en' : 'zh';
      const defaultQuality = detectInitialQualityPreset();
      const qualityUserChosen = Boolean(data.settings.qualityUserChosen);
      let quality = ['ultra', 'high', 'medium', 'low'].includes(data.settings.quality)
        ? data.settings.quality
        : defaultQuality;
      // Auto-upgrade legacy mobile saves that inherited desktop 'high' default without explicit user choice!
      if (!qualityUserChosen && defaultQuality === 'medium' && quality === 'high') {
        quality = 'medium';
      }
      const timeMode = ['cycle', 'day', 'night'].includes(data.settings.timeMode)
        ? data.settings.timeMode
        : 'cycle';
      const weatherMode = ['dynamic', 'clear', 'overcast', 'sandstorm'].includes(
        data.settings.weatherMode
      )
        ? data.settings.weatherMode
        : 'dynamic';
      const homeworldAtmosphere = ['dawn', 'sunset', 'night'].includes(
        data.settings.homeworldAtmosphere
      )
        ? data.settings.homeworldAtmosphere
        : 'dawn';
      const boolOrDefault = (val, def = true) =>
        val === undefined ? def : Boolean(val);
      state.settings = {
        lang,
        quality,
        qualityUserChosen,
        timeMode,
        weatherMode,
        homeworldAtmosphere,
        muted: Boolean(data.settings.muted),
        guideArrow: boolOrDefault(data.settings.guideArrow, true),
        showCompass: boolOrDefault(data.settings.showCompass, true),
        showWorldLabels: boolOrDefault(data.settings.showWorldLabels, true),
        showIdleTips: boolOrDefault(data.settings.showIdleTips, true)
      };
    }

    state._syncDocumentLanguage();

    state.craftingQueue = [];

    // Ensure currentLevel is at least consistent with completed repairs
    reconcileProgression(state);
    state._emit('state_loaded');
    return true;
  } catch {
    return false;
  }
}

function reconcileProgression(state) {
  const maxLevel = LEVELS.length;
  // Imported saves must describe one contiguous repair chain. A later repair
  // without its predecessors is treated as corrupt and cleared, preventing a
  // hand-edited/corrupted save from skipping whole levels.
  let contiguousRepairCount = 0;
  for (let idx = 0; idx < maxLevel; idx++) {
    const def = LEVELS[idx];
    if (!def || !state.repairs[def.repairTargetId]) break;
    contiguousRepairCount = idx + 1;
  }
  for (let idx = contiguousRepairCount; idx < maxLevel; idx++) {
    const def = LEVELS[idx];
    if (!def) continue;
    state.repairs[def.repairTargetId] = false;
    delete state.completedLevels[idx + 1];
  }
  for (let idx = 0; idx < contiguousRepairCount && idx < maxLevel - 1; idx++) {
    state.completedLevels[idx + 1] = true;
  }
  state.currentLevel = Math.max(1, Math.min(maxLevel, contiguousRepairCount + 1));
  // Ensure legacy saves from earlier builds aren't missing prerequisite gear (driven by EQUIPMENT_DEFS)
  for (const def of Object.values(EQUIPMENT_DEFS)) {
    if (def.legacyGrantOnRepair && state.repairs[def.legacyGrantOnRepair]) {
      state.equipment[def.slot] = true;
    }
  }
  // Legacy v1.0.x 5-level completed saves without newly added ship systems seamlessly resume at the new unlocked level!
  if (!state.areAllShipSystemsRepaired()) {
    state.launchedHome = false;
    state.activeWorldPlane = 'desert';
  }
}
