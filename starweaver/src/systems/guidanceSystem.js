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
} from '../data/gameData.js';
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

  resolveActiveWaypoint(robotPos) {
    const rx = robotPos.x;
    const rz = robotPos.z;
    const cellX = Math.round(rx * 0.5);
    const cellZ = Math.round(rz * 0.5);
    const key = `${this.state.versionTick}|${cellX}|${cellZ}`;

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
    const lvlDef = LEVELS[Math.max(0, Math.min(4, lvl - 1))];
    const zh = this.state.lang === 'zh';

    // 1. Level 5 Post-Propulsion: Pre-Flight Hull Checks -> Boarding Ramp!
    if (this.state.repairs.repair_propulsion) {
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

    // 2. Level 3+ Prerequisite Upgrade: Spiral Geo-Drill!
    if (lvl >= 3 && !this.state.hasEquipment('drill')) {
      if (this.state.getQueuedCountForOutput('geo_drill') > 0) {
        const st = this._pickNearestStation(rx, rz, 'fabricator');
        return this._pack(
          rx,
          rz,
          st.x,
          st.z,
          '#ffb03a',
          'wait_queue',
          zh ? '正在组装【螺旋地质钻头与脉冲声呐】，请稍候...' : 'Assembling Spiral Geo-Drill — standby...'
        );
      }
      const drillStep = this._findActionForItem('geo_drill', 1, rx, rz);
      if (drillStep) return drillStep;
    }

    // 3. Level 4+ Prerequisite Upgrade: Micro-Gravity Thruster Wings (Jetpack)!
    if (lvl >= 4 && !this.state.hasEquipment('jetpack')) {
      if (this.state.getQueuedCountForOutput('jetpack_wing') > 0) {
        const st = this._pickNearestStation(rx, rz, 'fabricator');
        return this._pack(
          rx,
          rz,
          st.x,
          st.z,
          '#5ef2ff',
          'wait_queue',
          zh ? '正在组装【微重力喷气飞行翼】，请稍候...' : 'Assembling Micro-Gravity Thruster Wings — standby...'
        );
      }
      const jetpackStep = this._findActionForItem('jetpack_wing', 1, rx, rz);
      if (jetpackStep) return jetpackStep;
    }

    // 4. Level 4 Gorge Bridge Gate: Align both Solar Mirror Pylons (South Pylon is atop Sky-Spire!)
    if (lvl === 4 && !this.state.isBridgeExtended()) {
      const nextPylon = WORLD_FACILITIES.pylons.find(
        (p) => !this.state.pylonsAligned[p.id]
      );
      if (nextPylon) {
        const label = nextPylon.elevated
          ? zh
            ? `按住 [Space] 喷气飞上南侧孤峰校准【太阳能反射塔】(${this.state.getAlignedPylonCount()}/2)`
            : `Hold [Space] to fly atop South Spire & Align Solar Pylon (${this.state.getAlignedPylonCount()}/2)`
          : zh
            ? `向西前往峡谷校准【太阳能反射塔】(${this.state.getAlignedPylonCount()}/2) 架通光桥`
            : `Head West & Align Solar Mirror Pylon (${this.state.getAlignedPylonCount()}/2)`;
        return this._pack(
          rx,
          rz,
          nextPylon.x,
          nextPylon.z,
          '#ffd666',
          'pylon',
          label,
          nextPylon.platformId || null
        );
      }
    }

    // 5. Recursive Dependency Walk for Current Level's Main Ship Module!
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
      const st = this._pickNearestStation(rx, rz, 'fabricator');
      return this._pack(
        rx,
        rz,
        st.x,
        st.z,
        '#5ce8ff',
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

    // If any input is still smelting in queue, wait beside station
    for (const inp of recipe.inputs) {
      if (this.state.getItemCount(inp.id) < inp.count) {
        const waitStation = this._pickNearestStation(rx, rz, 'furnace');
        return this._pack(
          rx,
          rz,
          waitStation.x,
          waitStation.z,
          '#ffbe4d',
          'wait_queue',
          zh
            ? `等待【${this.state.text(MATERIALS[inp.id].name)}】熔炼出炉...`
            : `Waiting for ${this.state.text(MATERIALS[inp.id].name)} to finish smelting...`
        );
      }
    }

    const station = this._pickNearestStation(rx, rz, recipe.station);
    const stationLabel =
      station.id === 'outpost_purifier'
        ? this.state.text(WORLD_FACILITIES.outpost_purifier.name)
        : recipe.station === 'furnace'
          ? this.state.ui('btnFurnace')
          : this.state.ui('btnFabricator');

    return this._pack(
      rx,
      rz,
      station.x,
      station.z,
      recipe.station === 'furnace' ? '#ff9d3b' : '#5ce8ff',
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
    const base =
      stationKind === 'furnace' ? WORLD_FACILITIES.furnace : WORLD_FACILITIES.fabricator;
    const outpost = WORLD_FACILITIES.outpost_purifier;
    if (this.state.currentLevel >= outpost.unlockLevel) {
      const dBase = dist2D(rx, rz, base.x, base.z);
      const dOut = dist2D(rx, rz, outpost.x, outpost.z);
      if (dOut < dBase) return outpost;
    }
    return base;
  }

  _pickBestResourceNode(materialId, rx, rz) {
    const candidates = RESOURCE_NODES.filter((n) => {
      if (n.materialId !== materialId) return false;
      if (!this.state.isRegionUnlocked(n.region)) return false;
      if (n.subsurface && !this.state.hasEquipment('drill')) return false;
      if (n.elevated && !this.state.hasEquipment('jetpack')) return false;
      // Avoid pointing across the Relay Gorge chasm before the bridge is extended!
      if (n.region === 'relay_gorge' && n.x < -50 && !this.state.isBridgeExtended()) {
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
    // Point to nearest unread Crew Log if any remain!
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
