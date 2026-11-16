import {
  CREW_LOGS,
  ELEVATED_PLATFORMS,
  EQUIPMENT_DEFS,
  LEVELS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  RECIPES,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  STATION_TYPES,
  WORLD_FACILITIES,
  WORLD_MECHANISMS
} from '../data/gameData.js';
import { formatTemplate } from '../data/i18n.js';
import { dist2D } from '../utils/math.js';

/**
 * Context-aware Smart Waypoint & Onboarding Guidance Resolver.
 * Inspects authoritative GameState + Robot position every frame and computes the EXACT
 * next actionable target (including prerequisite Spiral Geo-Drill & Micro-Gravity Jetpack upgrades,
 * subsurface sonar fissures, elevated sky-mesas, stations, pylons, repair bays, and pre-flight checks).
 */
export class GuidanceSystem {
  constructor(state) {
    this.state = state;
    this._cacheKey = '';
    this._cachedWaypoint = null;
  }

  invalidateCache() {
    this._cacheKey = '';
    this._cachedWaypoint = null;
  }

  resolveActiveWaypoint(robotPos) {
    const rx = robotPos.x;
    const rz = robotPos.z;
    const cellX = Math.round(rx * 0.5);
    const cellZ = Math.round(rz * 0.5);
    const key = `${this.state.activeWorldPlane || 'desert'}|${this.state.versionTick}|${cellX}|${cellZ}`;

    if (key === this._cacheKey) {
      if (this._cachedWaypoint) {
        this._cachedWaypoint.distMeters = Math.round(
          dist2D(rx, rz, this._cachedWaypoint.x, this._cachedWaypoint.z)
        );
      }
      return this._cachedWaypoint;
    }

    const computed = this._computeWaypointUncached(rx, rz);
    this._cacheKey = key;
    this._cachedWaypoint = computed;
    return computed;
  }

  _computeWaypointUncached(rx, rz) {
    // Post-game Free Roam: guide toward any remaining unread Crew Logs or uncompleted Side Tasks!
    if (this.state.launchedHome) {
      return this._resolveFreeRoamOptionalWaypoint(rx, rz);
    }

    const lvl = this.state.currentLevel;
    const lvlDef = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, lvl - 1))];
    const zh = this.state.lang === 'zh';

    // 1. All Ship Core Systems Repaired -> Pre-Flight Hull Checks -> Boarding Ramp!
    if (this.state.areAllShipSystemsRepaired()) {
      for (const chk of PREFLIGHT_CHECKS) {
        if (!this.state.preflightDone[chk.id]) {
          return this._pack(
            rx,
            rz,
            chk.position.x,
            chk.position.z,
            '#ffd257',
            'preflight',
            zh
              ? `绕机身完成安全点检：${this.state.text(chk.name)}`
              : `Pre-Flight Check: ${this.state.text(chk.name)}`
          );
        }
      }
      const ramp = WORLD_FACILITIES.boarding_ramp;
      return this._pack(
        rx,
        rz,
        ramp.x,
        ramp.z,
        '#52ffb8',
        'launch',
        zh ? '前往登机舷梯按 [E] 点火返航回家！' : 'Board the Starweaver Ramp [E] to Launch Home!'
      );
    }

    // 2. Declarative Mandatory Equipment Prerequisites (sorted by unlockLevel from EQUIPMENT_DEFS)
    const orderedEquip = Object.values(EQUIPMENT_DEFS).sort(
      (a, b) => a.unlockLevel - b.unlockLevel
    );
    for (const eqDef of orderedEquip) {
      if (
        eqDef.mandatoryFromLevel &&
        lvl >= eqDef.mandatoryFromLevel &&
        !this.state.hasEquipment(eqDef.slot)
      ) {
        const eqRecipe = RECIPES.find((r) => r.output.id === eqDef.itemId);
        const eqStationKind = eqRecipe ? eqRecipe.station : 'fabricator';
        if (this.state.getQueuedCountForOutput(eqDef.itemId) > 0) {
          const st = this._pickNearestStation(rx, rz, eqStationKind);
          return this._pack(
            rx,
            rz,
            st.x,
            st.z,
            eqDef.waypointColor || '#5ef2ff',
            'wait_queue',
            this.state.text(eqDef.waitText)
          );
        }
        const eqStep = this._findActionForItem(eqDef.itemId, 1, rx, rz);
        if (eqStep) return eqStep;
      }
    }

    // 3. Declarative Level Prerequisite World Mechanism (e.g., aligning Solar Pylons in Relay Gorge, or future valves/prisms!)
    if (lvlDef.prerequisiteMechanism && !this.state.isMechanismComplete(lvlDef.prerequisiteMechanism)) {
      const mech = WORLD_MECHANISMS[lvlDef.prerequisiteMechanism];
      if (mech && mech.kind === 'group') {
        const prog = this.state.getMechanismProgress(mech.id);
        const nextNode = mech.nodes.find(
          (n) => !this.state.isMechanismNodeActive(mech.id, n.id)
        );
        if (nextNode) {
          const tpl = nextNode.elevated && mech.waypointElevatedLabel
            ? this.state.text(mech.waypointElevatedLabel)
            : mech.waypointGroundLabel
              ? this.state.text(mech.waypointGroundLabel)
              : `${mech.id} (${prog.done}/${prog.total})`;
          const label = formatTemplate(tpl, {
            done: prog.done,
            total: prog.total
          });
          return this._pack(
            rx,
            rz,
            nextNode.x,
            nextNode.z,
            mech.waypointColor || '#ffd666',
            mech.interactKind || 'mechanism',
            label,
            nextNode.platformId || null
          );
        }
      }
    }

    // 4. Recursive Dependency Walk for Current Level's Main Ship Module!
    const targetId = lvlDef.repairTargetId;
    const mainCompId = lvlDef.requiredComponentId;

    if (this.state.getItemCount(mainCompId) >= 1) {
      const bay = REPAIR_TARGETS[targetId];
      return this._pack(
        rx,
        rz,
        bay.position.x,
        bay.position.z,
        '#52ffb8',
        'repair',
        zh
          ? `返回飞船【${this.state.text(bay.name)}】按 [E] 安装组件！`
          : `Install ${this.state.text(MATERIALS[mainCompId].name)} at ${this.state.text(bay.name)}`
      );
    }

    if (this.state.getQueuedCountForOutput(mainCompId) >= 1) {
      const mainRec = RECIPES.find((r) => r.output.id === mainCompId);
      const mainStationKind = mainRec ? mainRec.station : 'fabricator';
      const st = this._pickNearestStation(rx, rz, mainStationKind);
      const stMeta = STATION_TYPES[mainStationKind] || STATION_TYPES.fabricator;
      return this._pack(
        rx,
        rz,
        st.x,
        st.z,
        stMeta.waitColor,
        'wait_queue',
        zh ? '正在精密制造台加工主线核心组件，请稍候...' : 'Fabricating main ship module — standby...'
      );
    }

    const stepAction = this._findActionForItem(mainCompId, 1, rx, rz);
    if (stepAction) return stepAction;

    return null;
  }

  _getHaveCount(itemId) {
    const mat = MATERIALS[itemId];
    if (mat && mat.category === 'equipment') {
      return (this.state.hasEquipment(mat.equipmentSlot) ? 1 : 0) + this.state.getQueuedCountForOutput(itemId);
    }
    return this.state.getItemCount(itemId) + this.state.getQueuedCountForOutput(itemId);
  }

  _findActionForItem(itemId, neededCount, rx, rz) {
    const mat = MATERIALS[itemId];
    const have = this._getHaveCount(itemId);
    if (have >= neededCount) return null;

    const deficit = neededCount - have;
    const zh = this.state.lang === 'zh';

    // Base Case: Raw material -> Point to nearest reachable resource node!
    if (mat.category === 'raw') {
      const node = this._pickBestResourceNode(itemId, rx, rz);
      if (node) {
        let label;
        if (node.subsurface) {
          label = zh
            ? `钻探地底暗脉【${this.state.text(mat.name)}】（[V]声呐 / [E]下钻，还需 ${deficit} 个）`
            : `Geo-Drill subsurface ${this.state.text(mat.name)} ([V] Sonar / [E] Drill, ${deficit} left)`;
        } else if (node.elevated) {
          label = zh
            ? `按住 [Space] 飞登高台采集【${this.state.text(mat.name)}】（还需 ${deficit} 个）`
            : `Hold [Space] to fly onto Sky-Mesa for ${this.state.text(mat.name)} (${deficit} left)`;
        } else {
          label = zh
            ? `前往采集【${this.state.text(mat.name)}】（还需 ${deficit} 个）`
            : `Gather ${this.state.text(mat.name)} (${deficit} more needed)`;
        }

        return this._pack(
          rx,
          rz,
          node.x,
          node.z,
          mat.color,
          'gather',
          label,
          node.platformId || null
        );
      }
      return null;
    }

    const recipe = RECIPES.find((r) => r.output.id === itemId);
    if (!recipe) return null;

    const batchesNeeded = Math.ceil(deficit / recipe.output.count);

    // Pass 1: Aggregate exact NET missing RAW materials across the entire recipe DAG first!
    // (Correctly sums shared raw ores like copper_ore / silver_ore / lumen_core across multiple branches!)
    const rawPool = {};
    for (const m of Object.values(MATERIALS)) {
      const c = this._getHaveCount(m.id);
      if (c > 0) rawPool[m.id] = c;
    }
    const netRawDeficits = {};
    this._accumulateNetRawDeficits(itemId, neededCount, rawPool, netRawDeficits);

    for (const [rawId, rawDeficit] of Object.entries(netRawDeficits)) {
      if (rawDeficit > 0) {
        const totalTarget = this._getHaveCount(rawId) + rawDeficit;
        const rawStep = this._findActionForItem(rawId, totalTarget, rx, rz);
        if (rawStep) return rawStep;
      }
    }

    // Pass 2: Now all raw ores are in hand -> resolve intermediate smelts / sub-assemblies!
    for (const inp of recipe.inputs) {
      const totalInpNeeded = inp.count * batchesNeeded;
      const subStep = this._findActionForItem(inp.id, totalInpNeeded, rx, rz);
      if (subStep) return subStep;
    }

    // If any input is still smelting or fabricating in queue, wait beside the exact station producing it!
    for (const inp of recipe.inputs) {
      if (this.state.getItemCount(inp.id) < inp.count) {
        const inpRecipe = RECIPES.find((r) => r.output.id === inp.id);
        const waitStationType = inpRecipe ? inpRecipe.station : 'furnace';
        const waitStation = this._pickNearestStation(rx, rz, waitStationType);
        const stMeta = STATION_TYPES[waitStationType] || STATION_TYPES.furnace;
        const waitTpl = this.state.text(stMeta.waitLabel);
        return this._pack(
          rx,
          rz,
          waitStation.x,
          waitStation.z,
          stMeta.waitColor,
          'wait_queue',
          formatTemplate(waitTpl, { item: this.state.text(MATERIALS[inp.id].name) })
        );
      }
    }

    const station = this._pickNearestStation(rx, rz, recipe.station);
    const stMeta = STATION_TYPES[recipe.station] || STATION_TYPES.fabricator;
    const stationLabel = this.state.text(station.name) || this.state.text(stMeta.name);

    return this._pack(
      rx,
      rz,
      station.x,
      station.z,
      stMeta.waypointColor,
      'station',
      zh
        ? `前往【${stationLabel}】制作 ${this.state.text(mat.name)}${mat.category === 'equipment' ? '' : ` ×${deficit}`}`
        : `Go to ${stationLabel} to craft ${this.state.text(mat.name)}${mat.category === 'equipment' ? '' : ` ×${deficit}`}`
    );
  }

  _accumulateNetRawDeficits(itemId, qtyNeeded, virtualPool, rawDeficits) {
    const avail = virtualPool[itemId] || 0;
    if (avail >= qtyNeeded) {
      virtualPool[itemId] = avail - qtyNeeded;
      return;
    }
    const deficit = qtyNeeded - avail;
    virtualPool[itemId] = 0;

    const mat = MATERIALS[itemId];
    if (!mat) return;
    if (mat.category === 'raw') {
      rawDeficits[itemId] = (rawDeficits[itemId] || 0) + deficit;
      return;
    }

    const rec = RECIPES.find((r) => r.output.id === itemId);
    if (!rec) return;
    const batches = Math.ceil(deficit / rec.output.count);
    const leftover = batches * rec.output.count - deficit;
    if (leftover > 0) {
      virtualPool[itemId] = (virtualPool[itemId] || 0) + leftover;
    }

    for (const inp of rec.inputs) {
      this._accumulateNetRawDeficits(
        inp.id,
        inp.count * batches,
        virtualPool,
        rawDeficits
      );
    }
  }

  _pickNearestStation(rx, rz, stationKind) {
    const unlockedStations = WORLD_FACILITIES.stations.filter(
      (st) =>
        Array.isArray(st.stationKinds) &&
        st.stationKinds.includes(stationKind) &&
        this.state.currentLevel >= (st.unlockLevel || 1)
    );
    if (unlockedStations.length === 0) {
      return WORLD_FACILITIES.fabricator;
    }
    let best = unlockedStations[0];
    let bestDist = dist2D(rx, rz, best.x, best.z);
    for (let i = 1; i < unlockedStations.length; i++) {
      const d = dist2D(rx, rz, unlockedStations[i].x, unlockedStations[i].z);
      if (d < bestDist) {
        bestDist = d;
        best = unlockedStations[i];
      }
    }
    return best;
  }

  _pickBestResourceNode(materialId, rx, rz) {
    const candidates = RESOURCE_NODES.filter((n) => {
      if (n.materialId !== materialId) return false;
      if (!this.state.isRegionUnlocked(n.region)) return false;
      if (n.subsurface && !this.state.hasEquipment('drill')) return false;
      if (n.elevated && !this.state.hasEquipment('jetpack')) return false;
      if (n.requiresMechanism && !this.state.isMechanismComplete(n.requiresMechanism)) {
        return false;
      }
      return true;
    });
    if (candidates.length === 0) return null;

    const available = candidates.filter((n) => this.state.isNodeAvailable(n.id));
    const list = available.length > 0 ? available : candidates;

    let best = list[0];
    let bestDist = dist2D(rx, rz, best.x, best.z);
    for (let i = 1; i < list.length; i++) {
      const d = dist2D(rx, rz, list[i].x, list[i].z);
      if (d < bestDist) {
        bestDist = d;
        best = list[i];
      }
    }
    return best;
  }

  _resolveFreeRoamOptionalWaypoint(rx, rz) {
    const zh = this.state.lang === 'zh';
    // 1. Guide toward Post-Game Planetary Climate Telemetry Beacons first!
    const beaconMech = WORLD_MECHANISMS.weather_beacons;
    if (beaconMech && !this.state.isMechanismComplete('weather_beacons')) {
      const prog = this.state.getMechanismProgress('weather_beacons');
      let bestBeacon = null;
      let bestB = Infinity;
      for (const bn of beaconMech.nodes) {
        if (!this.state.isMechanismNodeActive('weather_beacons', bn.id)) {
          const d = dist2D(rx, rz, bn.x, bn.z);
          if (d < bestB) {
            bestB = d;
            bestBeacon = bn;
          }
        }
      }
      if (bestBeacon) {
        return this._pack(
          rx,
          rz,
          bestBeacon.x,
          bestBeacon.z,
          beaconMech.waypointColor || '#66ffc2',
          'weather_beacon',
          zh
            ? `终局科考委托 · 部署气象遥测信标 (${prog.done}/${prog.total})`
            : `Expedition • Deploy Climate Telemetry Beacon (${prog.done}/${prog.total})`
        );
      }
    }

    // 2. Point to nearest unread Crew Log if any remain!
    let bestLog = null;
    let bestDist = Infinity;
    for (const log of Object.values(CREW_LOGS)) {
      if (!this.state.logsRead[log.id]) {
        const d = dist2D(rx, rz, log.position.x, log.position.z);
        if (d < bestDist) {
          bestDist = d;
          bestLog = log;
        }
      }
    }
    if (bestLog) {
      return this._pack(
        rx,
        rz,
        bestLog.position.x,
        bestLog.position.z,
        '#78f5ff',
        'log',
        zh
          ? `自由探索 · 寻回未读日志：${this.state.text(bestLog.title)}`
          : `Free Roam • Recover Crew Log: ${this.state.text(bestLog.title)}`
      );
    }

    // 3. Guide back to the Boarding Ramp to return to the Homeworld Emerald Valley!
    const ramp = WORLD_FACILITIES.boarding_ramp;
    if (ramp) {
      const hwProg =
        typeof this.state.getHomeworldProgress === 'function'
          ? this.state.getHomeworldProgress()
          : { doneSteps: 0, totalSteps: 5 };
      const hwIncomplete = !this.state.homeworldSurvey?.completed;
      return this._pack(
        rx,
        rz,
        ramp.x,
        ramp.z,
        '#52ffb8',
        'launch',
        hwIncomplete
          ? zh
            ? `前往登机舷梯按 [E] 返回母星继续家园巡检 (${hwProg.doneSteps}/${hwProg.totalSteps})`
            : `Board Starweaver Ramp [E] — Resume Homeworld Watch (${hwProg.doneSteps}/${hwProg.totalSteps})`
          : zh
            ? '前往登机舷梯按 [E] 随时重返翡翠母星家园'
            : 'Board Starweaver Ramp [E] — Return to Homeworld Meadow'
      );
    }
    return null;
  }

  _pack(rx, rz, tx, tz, color, kind, label, platformId = null) {
    const d = Math.round(dist2D(rx, rz, tx, tz));
    let topY = null;
    if (platformId) {
      const plat = ELEVATED_PLATFORMS.find((p) => p.id === platformId);
      if (plat) topY = plat.topY;
    }
    return {
      x: tx,
      z: tz,
      topY,
      color,
      kind,
      label,
      distMeters: d
    };
  }
}
