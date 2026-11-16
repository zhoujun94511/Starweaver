import {
  EQUIPMENT_DEFS,
  LEVELS,
  MATERIALS,
  RECIPES,
  REPAIR_TARGETS,
  WORLD_FACILITIES,
  WORLD_MECHANISMS
} from '../data/gameData.js';
import { HOMEWORLD_LANDMARKS } from '../data/homeworldActivities.js';
import { HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../data/homeworldData.js';
import { getTerrainHeight } from '../utils/math.js';

/**
 * Parses URL query parameters for non-intrusive QA / Debug bootstrapping:
 *   ?debug=1&scene=homeworld&level=5&postgame=1&nosave=1
 */
export function parseDebugBootParams(search = '') {
  if (!search || typeof URLSearchParams === 'undefined') {
    return { active: false, nosave: false, scene: '', level: null, postgame: false };
  }
  const params = new URLSearchParams(search);
  const active = params.get('debug') === '1' || params.get('debug') === 'true';
  const sceneRaw = (params.get('scene') || '').toLowerCase();
  const scene = sceneRaw === 'desert' || sceneRaw === 'homeworld' ? sceneRaw : '';
  const lvlRaw = Number(params.get('level'));
  const level =
    Number.isInteger(lvlRaw) && lvlRaw >= 1 && lvlRaw <= LEVELS.length ? lvlRaw : null;
  const postgame = params.get('postgame') === '1' || params.get('postgame') === 'true';
  const hasJump = Boolean(scene || level !== null || postgame);
  const nosaveParam = params.get('nosave');
  const nosave =
    nosaveParam === '1' || nosaveParam === 'true' || (hasJump && nosaveParam !== '0');

  return { active: active || hasJump, nosave, scene, level, postgame };
}

function collectRecipeRawNeeds(itemId, count, out, visited) {
  if (visited.has(itemId)) return;
  const recipe = RECIPES.find((r) => r.output?.id === itemId && !r.oneTimeEquipment);
  if (!recipe || !recipe.ingredients) {
    out[itemId] = (out[itemId] || 0) + count;
    return;
  }
  visited.add(itemId);
  const batches = Math.ceil(count / Math.max(1, recipe.output.count || 1));
  for (const ing of recipe.ingredients) {
    collectRecipeRawNeeds(ing.id, ing.count * batches, out, visited);
  }
  visited.delete(itemId);
}

/**
 * Centralized debug actions wired directly to authoritative GameState / WorldManager APIs.
 */
export function createDebugActions(app) {
  const { state, hud, robot, cameraCtrl, spacecraft } = app;

  function syncAfterStateWarp() {
    app.interaction?.resetScanCache();
    app.guidance?.invalidateCache();
    hud.renderAll();
  }

  function jumpToLevel(levelNum) {
    const targetLevel = Math.max(1, Math.min(LEVELS.length, Math.floor(levelNum)));
    if (app.inHomeworldRoam) {
      warpToWorld('desert');
    }
    app.cutscene.active = false;
    app.introCutscene.active = false;
    hud.closeModal();
    hud.setIntroOverlay(false);
    hud.setHomeworldRoamVisible(false);
    hud.setHudVisible(true);

    state.launchedHome = false;
    state.activeWorldPlane = 'desert';
    state.craftingQueue = [];
    state.completedLevels = {};
    state.currentLevel = targetLevel;
    for (let i = 0; i < LEVELS.length; i++) {
      const def = LEVELS[i];
      const done = i < targetLevel - 1;
      state.repairs[def.repairTargetId] = done;
      if (done) {
        state.completedLevels[def.level] = true;
      }
      if (def.prerequisiteMechanism) {
        const mech = WORLD_MECHANISMS[def.prerequisiteMechanism];
        if (mech) {
          if (done) {
            if (mech.kind === 'group') {
              for (const n of mech.nodes) {
                state.activateMechanism?.(def.prerequisiteMechanism, n.id);
              }
            } else {
              state.activateMechanism?.(def.prerequisiteMechanism);
            }
          } else {
            state[mech.stateProp] = mech.kind === 'group' ? {} : false;
          }
        }
      }
    }

    for (const def of Object.values(EQUIPMENT_DEFS)) {
      const unlockedByLevel = def.unlockLevel ? def.unlockLevel <= targetLevel : false;
      const unlockedByRepair = def.legacyGrantOnRepair
        ? Boolean(state.repairs[def.legacyGrantOnRepair])
        : false;
      state.equipment[def.slot] = unlockedByLevel || unlockedByRepair;
    }

    spacecraft.restoreDesertPlacement(robot);
    robot.clearIntroSleepPose();
    robot.teleportToHubSafe();
    cameraCtrl.clearShowcase();
    cameraCtrl.clearStationFocus();
    cameraCtrl.snapToPose(cameraCtrl.getDesiredFollowPose(robot.position));
    hud.noteWorldFocus('desert', robot.position.x, robot.position.z);
    syncAfterStateWarp();
    hud.showToast(
      state.lang === 'zh' ? `[调试] 跳转第 ${targetLevel} 关` : `[DEBUG] Level ${targetLevel}`,
      'info'
    );
  }

  function warpToWorld(plane, { completeSurvey = false } = {}) {
    if (plane === 'homeworld') {
      for (const def of LEVELS) {
        state.repairs[def.repairTargetId] = true;
        if (def.level < LEVELS.length) state.completedLevels[def.level] = true;
      }
      state.currentLevel = LEVELS.length;
      for (const def of Object.values(EQUIPMENT_DEFS)) {
        state.equipment[def.slot] = true;
      }
      state.launchedHome = true;
      state.homeworldSurvey.accepted = true;
      if (completeSurvey) {
        for (const lm of HOMEWORLD_LANDMARKS) {
          state.homeworldSurvey.records[lm.id] = true;
        }
        state.homeworldSurvey.calibration = 3;
        state.homeworldSurvey.completed = true;
        const beacons = WORLD_MECHANISMS.weather_beacons?.nodes || [];
        for (let i = 0; i < Math.min(3, beacons.length); i++) {
          state.activateMechanism?.('weather_beacons', beacons[i].id);
        }
      }
      state.syncPostGameWorldTransition('homeworld');
      app._enterHomeworldRoam();
      hud.showToast(
        state.lang === 'zh'
          ? (completeSurvey ? '[调试] 翡翠母星 (100%)' : '[调试] 翡翠母星')
          : (completeSurvey ? '[DEBUG] Homeworld (100%)' : '[DEBUG] Homeworld'),
        'celebrate'
      );
      return;
    }

    state.launchedHome = state.areAllShipSystemsRepaired();
    if (app.inHomeworldRoam) {
      hud.actions.onFreeRoam();
    } else {
      app.cutscene.active = false;
      app.introCutscene.active = false;
      hud.closeModal();
      hud.setIntroOverlay(false);
      app.worldManager.switchTo('desert', {}, { unloadOthers: true });
      state.setWorldPlane('desert');
      spacecraft.restoreDesertPlacement(robot);
      robot.clearIntroSleepPose();
      robot.teleportToHubSafe();
      cameraCtrl.snapToPose(cameraCtrl.getDesiredFollowPose(robot.position));
      hud.noteWorldFocus('desert', robot.position.x, robot.position.z);
      hud.setHomeworldRoamVisible(false);
      hud.setHudVisible(true);
      syncAfterStateWarp();
    }
    hud.showToast(
      state.lang === 'zh' ? '[调试] 卡里斯荒漠' : '[DEBUG] Kharis-4 Desert',
      'info'
    );
  }

  function grantAllGear() {
    for (const def of Object.values(EQUIPMENT_DEFS)) {
      state.equipment[def.slot] = true;
    }
    state.markProgress();
    state.save();
    syncAfterStateWarp();
    hud.showToast(
      state.lang === 'zh' ? '[调试] 已解锁全装备' : '[DEBUG] All Gear Unlocked',
      'good'
    );
  }

  function grantCurrentLevelMaterials() {
    const lvlDef = LEVELS[Math.max(0, state.currentLevel - 1)];
    const repair = lvlDef ? REPAIR_TARGETS[lvlDef.repairTargetId] : null;
    const needs = {};
    if (repair?.requiredItem) {
      collectRecipeRawNeeds(repair.requiredItem, 1, needs, new Set());
    }
    for (const [id, qty] of Object.entries(needs)) {
      if (MATERIALS[id]) {
        state.inventory[id] = Math.min(999, (state.inventory[id] || 0) + Math.max(4, qty));
      }
    }
    // Also top up common early-game ores for quick station testing
    for (const id of ['scrap_metal', 'silica_sand', 'copper_ore', 'lithium_brine']) {
      if (MATERIALS[id]) {
        state.inventory[id] = Math.min(999, (state.inventory[id] || 0) + 6);
      }
    }
    state.markProgress();
    state.save();
    syncAfterStateWarp();
    hud.showToast(
      state.lang === 'zh' ? '[调试] 已补充本关材料' : '[DEBUG] +Level Materials',
      'good'
    );
  }

  function completeQueueNow() {
    state.fastForward(300);
    syncAfterStateWarp();
    hud.showToast(
      state.lang === 'zh' ? '[调试] 制造队列已秒完' : '[DEBUG] Queue Fast-Forwarded',
      'good'
    );
  }

  function getTeleportLandmarks() {
    const zh = state.lang === 'zh';
    const list = [
      {
        id: 'desert_hub',
        plane: 'desert',
        label: zh ? '荒漠：飞船枢纽' : 'Desert: Hub / Ship',
        x: 4.8,
        z: 5.8
      }
    ];
    for (const st of WORLD_FACILITIES.stations) {
      list.push({
        id: `st_${st.id}`,
        plane: 'desert',
        label: `${zh ? '荒漠' : 'Desert'}: ${state.text(st.name)}`,
        x: st.x,
        z: st.z + (st.radius || 1.4) + 0.55
      });
    }
    list.push({
      id: 'hw_pad',
      plane: 'homeworld',
      label: zh ? '母星：停机坪' : 'Homeworld: Landing Pad',
      x: HOMEWORLD_CONFIG.spawnX,
      z: HOMEWORLD_CONFIG.spawnZ
    });
    for (const lm of HOMEWORLD_LANDMARKS) {
      list.push({
        id: `hw_${lm.id}`,
        plane: 'homeworld',
        label: `${zh ? '母星' : 'Homeworld'}: ${state.text(lm.name)}`,
        x: lm.x,
        z: lm.z
      });
    }
    return list;
  }

  function teleportTo(landmarkId) {
    const target = getTeleportLandmarks().find((item) => item.id === landmarkId);
    if (!target) return false;
    if (target.plane === 'homeworld' && !app.inHomeworldRoam) {
      warpToWorld('homeworld');
    } else if (target.plane === 'desert' && app.inHomeworldRoam) {
      warpToWorld('desert');
    }
    const y =
      target.plane === 'homeworld'
        ? getHomeworldGroundHeight(target.x, target.z)
        : getTerrainHeight(target.x, target.z, state.isBridgeExtended());
    robot.position.set(target.x, y, target.z);
    robot.vy = 0;
    robot.isGrounded = true;
    robot.syncPositionToMesh(y);
    cameraCtrl.snapToPose(cameraCtrl.getDesiredFollowPose(robot.position));
    hud.noteWorldFocus(target.plane, target.x, target.z);
    hud.showToast(`[DEBUG] Warped: ${target.label}`, 'info');
    return true;
  }

  function setAtmosphereMode(mode) {
    if (mode.startsWith('hw_')) {
      const hwMode = mode.slice(3);
      if (hwMode !== 'dawn') {
        state.homeworldSurvey.completed = true;
        const beacons = WORLD_MECHANISMS.weather_beacons?.nodes || [];
        for (let i = 0; i < Math.min(3, beacons.length); i++) {
          state.activateMechanism?.('weather_beacons', beacons[i].id);
        }
      }
      state.settings.homeworldAtmosphere = hwMode;
      if (app.inHomeworldRoam) {
        app.atmosphere.updateHomeworld(0.016, app._totalElapsed, app.camera, true);
      }
      hud.showToast(`[DEBUG] HW Atmo: ${hwMode}`, 'info');
      return;
    }
    if (mode === 'day' || mode === 'night') {
      state.settings.timeMode = mode;
      state.settings.weatherMode = 'clear';
    } else if (mode === 'sandstorm') {
      state.settings.weatherMode = 'sandstorm';
    }
    if (!app.inHomeworldRoam) {
      app.atmosphere.update(0.016, app._totalElapsed, app.camera, true);
    }
    hud.showToast(`[DEBUG] Atmo: ${mode}`, 'info');
  }

  function setTimeScale(scale) {
    app._debugTimeScale = Math.max(1, Math.min(8, Number(scale) || 1));
    hud.showToast(`[DEBUG] Time Scale: ${app._debugTimeScale}x`, 'info');
  }

  function getTelemetry() {
    const calls = app.renderer?.info?.render?.calls ?? 0;
    const geos = app.renderer?.info?.memory?.geometries ?? 0;
    const plane = app.inHomeworldRoam ? 'homeworld' : 'desert';
    const baseY = app.postProcessing?.planeBaseY ?? 0;
    return {
      fps: Math.round(app._debugFps || 0),
      calls,
      geos,
      plane,
      baseY,
      level: state.currentLevel,
      x: robot.position.x.toFixed(1),
      y: robot.position.y.toFixed(1),
      z: robot.position.z.toFixed(1),
      timeScale: app._debugTimeScale || 1
    };
  }

  return {
    jumpToLevel,
    warpToWorld,
    grantAllGear,
    grantCurrentLevelMaterials,
    completeQueueNow,
    getTeleportLandmarks,
    teleportTo,
    setAtmosphereMode,
    setTimeScale,
    getTelemetry
  };
}

/**
 * Applies URL boot overrides (?scene=, ?level=, ?postgame=) cleanly after App startup.
 */
export function applyDebugBootTarget(app, boot, actions) {
  if (!boot) return;
  if (boot.scene === 'homeworld') {
    actions.warpToWorld('homeworld', { completeSurvey: boot.postgame });
    return;
  }
  if (boot.postgame) {
    actions.warpToWorld('homeworld', { completeSurvey: true });
    actions.warpToWorld('desert');
    return;
  }
  if (boot.level !== null) {
    actions.jumpToLevel(boot.level);
    return;
  }
  if (boot.scene === 'desert') {
    actions.jumpToLevel(1);
  }
}
