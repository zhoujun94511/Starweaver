import * as THREE from 'three';
import {
  CREW_LOGS,
  DESERT_AERIAL_MOTES,
  ELEVATED_PLATFORMS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  REGIONS,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  WORLD_FACILITIES,
  WORLD_MECHANISMS,
  getMaterialVisualArchetype
} from '../data/gameData.js';
import { dist2D, getTerrainHeight } from '../utils/math.js';

export class InteractionSystem {
  constructor(state, sound, robot, cameraCtrl, callbacks, particles = null) {
    this.state = state;
    this.sound = sound;
    this.robot = robot;
    this.cameraCtrl = cameraCtrl;
    this.callbacks = callbacks; // { openStationModal, openInspectModal, showToast, startLaunchSequence }
    this.particles = particles;

    this.currentTarget = null;
    this._lastFocusedKey = null;
    this.hintDismissedForLevel = 0;
    this.idleAccumSeconds = 0;
    this._lastKnownProgressMark = this.state.lastProgressTimestamp;
    this._scanCooldown = 0;
    this._lastScanStateTick = -1;
    this._lastScanX = Number.NaN;
    this._lastScanZ = Number.NaN;
  }

  resetScanCache() {
    this.currentTarget = null;
    this._lastFocusedKey = null;
    this._scanCooldown = 0;
    this._lastScanStateTick = -1;
    this._lastScanX = Number.NaN;
    this._lastScanZ = Number.NaN;
  }

  /**
   * Scans all nearby interactable entities within comfortable interaction range
   * and returns the closest valid candidate with localized prompt text.
   */
  scanNearest(dt = 0) {
    const rx = this.robot.position.x;
    const ry = this.robot.position.y;
    const rz = this.robot.position.z;
    this._scanCooldown = Math.max(0, this._scanCooldown - Math.max(0, Number(dt) || 0));
    const movedSinceScan = Number.isFinite(this._lastScanX)
      ? Math.hypot(rx - this._lastScanX, rz - this._lastScanZ)
      : Infinity;
    // A full scan creates candidate objects for every station, node, mechanism,
    // repair bay and crew log. At rest or during slow steering, reuse the current
    // candidate for a short window; state events and meaningful movement still
    // invalidate it immediately. This keeps prompts responsive while avoiding a
    // 60 Hz allocation storm on mobile GPUs/JS engines.
    if (
      this._scanCooldown > 0 &&
      this._lastScanStateTick === this.state.versionTick &&
      movedSinceScan < 0.45
    ) {
      return this.currentTarget;
    }
    let best = null;
    let bestDist = Infinity;

    const consider = (candidate, maxRange) => {
      const targetY =
        candidate.y !== undefined
          ? candidate.y
          : getTerrainHeight(
              candidate.x,
              candidate.z,
              this.state.isBridgeExtended()
            );
      // Prevent interacting with ground targets while soaring > 2.8m overhead (unless it's an elevated_locked hint!)
      if (candidate.kind !== 'elevated_locked' && Math.abs(ry - targetY) > 2.8) {
        return;
      }
      const d = dist2D(rx, rz, candidate.x, candidate.z);
      let priorityBias = 0;
      if (candidate.kind === 'repair' && candidate.canInstall) priorityBias = -1.6;
      else if (candidate.kind === 'preflight') priorityBias = -1.2;
      else if (candidate.kind === 'launch_ramp' && !candidate.ready) priorityBias = 1.6;
      else if (candidate.kind === 'resource' && !candidate.available) priorityBias = 1.4;
      else if (
        candidate.done &&
        (candidate.kind !== 'weather_beacon' || !this.state.launchedHome)
      ) {
        priorityBias = 1.0;
      }
      const effectiveDist = d + priorityBias;
      if (d <= maxRange && effectiveDist < bestDist) {
        bestDist = effectiveDist;
        best = candidate;
      }
    };

    // 1. Declarative Crafting Stations (iterated from WORLD_FACILITIES.stations)
    for (const st of WORLD_FACILITIES.stations) {
      if (this.state.currentLevel < (st.unlockLevel || 1)) continue;
      consider(
        {
          kind: 'station',
          stationMode: st.stationKind,
          stationFacility: st,
          id: st.id,
          x: st.x,
          z: st.z,
          prompt: this.state.ui(st.promptKey),
          inspectTitle: this.state.text(st.name),
          inspectBody: this.state.text(st.inspectDesc)
        },
        3.6
      );
    }

    // 2. Spacecraft Repair Bays (show unlocked bays + informative locked-level prompt if walked up to early!)
    for (const target of Object.values(REPAIR_TARGETS)) {
      const repaired = Boolean(this.state.repairs[target.id]);
      const itemMat = MATERIALS[target.requiredItem];
      const itemName = this.state.text(itemMat.name);
      const targetName = this.state.text(target.name);
      const hasItem = this.state.getItemCount(target.requiredItem) > 0;

      if (target.level > this.state.currentLevel) {
        consider(
          {
            kind: 'locked_repair',
            id: target.id,
            level: target.level,
            x: target.position.x,
            z: target.position.z,
            prompt: this.state.ui('promptLockedRepair', {
              target: targetName,
              level: target.level
            }),
            inspectTitle: targetName,
            inspectBody: this.state.text(target.inspectDesc)
          },
          2.9
        );
      } else if (!repaired) {
        consider(
          {
            kind: 'repair',
            id: target.id,
            x: target.position.x,
            z: target.position.z,
            canInstall: hasItem,
            prompt: hasItem
              ? this.state.ui('promptRepairReady', { item: itemName, target: targetName })
              : this.state.ui('promptRepairNeed', { item: itemName, target: targetName }),
            inspectTitle: targetName,
            inspectBody: this.state.text(target.inspectDesc)
          },
          4.4
        );
      }
    }

    // 3. Final Pre-Flight Hull Checks & Launch Boarding Ramp (once all ship systems are repaired)
    if (this.state.areAllShipSystemsRepaired()) {
      for (const chk of PREFLIGHT_CHECKS) {
        const done = Boolean(this.state.preflightDone[chk.id]);
        const name = this.state.text(chk.name);
        if (!done) {
          consider(
            {
              kind: 'preflight',
              id: chk.id,
              x: chk.position.x,
              z: chk.position.z,
              prompt: this.state.ui('promptInspectCheck', { name }),
              inspectTitle: name,
              inspectBody: name
            },
            3.8
          );
        }
      }

      const ramp = WORLD_FACILITIES.boarding_ramp;
      const ready = Boolean(this.state.launchedHome) || this.state.canLaunchSpacecraft();
      const postGameReturnPrompt =
        this.state.lang === 'zh'
          ? '[E] 登上飞船舷梯 —— 重返翡翠母星家园'
          : '[E] Board Starweaver Ramp — Return to Homeworld';
      consider(
        {
          kind: 'launch_ramp',
          id: 'boarding_ramp',
          x: ramp.x,
          z: ramp.z,
          ready,
          prompt: this.state.launchedHome
            ? postGameReturnPrompt
            : ready
              ? this.state.ui('promptLaunchReady')
              : this.state.ui('promptLaunchWait', {
                  done: this.state.getPreflightDoneCount()
                })
        },
        3.5
      );
    }

    // 4. Resource Nodes in unlocked regions (Surface, Subsurface Geo-Drill & Sky-Mesa Elevated!)
    for (const node of RESOURCE_NODES) {
      if (!this.state.isRegionUnlocked(node.region)) continue;
      const mat = MATERIALS[node.materialId];
      const matName = this.state.text(mat.name);
      const available = this.state.isNodeAvailable(node.id);
      const regionNames = (mat.sourceRegions || [])
        .map((rId) => this.state.text(REGIONS[rId]?.name))
        .join(', ');

      const plat = node.platformId
        ? ELEVATED_PLATFORMS.find((pl) => pl.id === node.platformId)
        : null;
      const nodeY = plat
        ? plat.topY
        : getTerrainHeight(node.x, node.z, this.state.isBridgeExtended());

      // If node sits atop a Sky-Mesa and Milo is still down on the ground below it:
      if (plat && ry < plat.topY - 2.1) {
        const diffH = Math.max(2, Math.round(plat.topY - ry));
        consider(
          {
            kind: 'elevated_locked',
            id: node.id,
            x: node.x,
            y: nodeY,
            z: node.z,
            prompt: this.state.hasEquipment('jetpack')
              ? this.state.ui('promptElevatedFlyUp', { height: diffH })
              : this.state.ui('promptElevatedNeedJetpack'),
            inspectTitle: matName,
            inspectBody: this.state.text(mat.description)
          },
          plat.radius + 2.4
        );
        continue;
      }

      let promptStr;
      if (!available) {
        promptStr = this.state.ui('promptRegrowing', {
          name: matName,
          sec: this.state.getNodeRegrowRemaining(node.id)
        });
      } else if (node.subsurface) {
        promptStr = this.state.hasEquipment('drill')
          ? this.state.ui('promptDrillReady', { name: matName, count: node.yield })
          : this.state.ui('promptDrillNeed', { name: matName });
      } else {
        promptStr = this.state.ui('promptGather', { name: matName, count: node.yield });
      }

      consider(
        {
          kind: 'resource',
          id: node.id,
          node,
          available,
          x: node.x,
          y: nodeY,
          z: node.z,
          prompt: promptStr,
          inspectTitle: matName,
          inspectBody: `${this.state.text(mat.description)} (${this.state.ui('foundIn', {
            region: regionNames
          })})`
        },
        3.0
      );
    }

    // 5. Declarative Interactive World Mechanisms (Pylons, Cairns, Observatory, Post-Game Beacons)
    for (const mech of Object.values(WORLD_MECHANISMS)) {
      if (mech.postGameOnly && !this.state.launchedHome) continue;
      if (mech.region && !this.state.isRegionUnlocked(mech.region)) continue;
      const prog = this.state.getMechanismProgress(mech.id);

      for (const mNode of mech.nodes) {
        if (mNode.region && !this.state.isRegionUnlocked(mNode.region)) continue;
        const plat = mNode.platformId
          ? ELEVATED_PLATFORMS.find((pl) => pl.id === mNode.platformId)
          : null;
        const my = plat
          ? plat.topY
          : getTerrainHeight(mNode.x, mNode.z, false);

        if (plat && ry < plat.topY - 2.1) {
          const diffH = Math.max(2, Math.round(plat.topY - ry));
          consider(
            {
              kind: 'elevated_locked',
              id: mNode.id,
              x: mNode.x,
              y: my,
              z: mNode.z,
              prompt: this.state.hasEquipment('jetpack')
                ? this.state.ui('promptElevatedFlyUp', { height: diffH })
                : this.state.ui('promptElevatedNeedJetpack')
            },
            plat.radius + 2.5
          );
          continue;
        }

        const isActive = this.state.isMechanismNodeActive(mech.id, mNode.id);
        consider(
          {
            kind: mech.interactKind,
            mechId: mech.id,
            id: mNode.id,
            aligned: isActive,
            active: isActive,
            done: isActive,
            x: mNode.x,
            y: my,
            z: mNode.z,
            prompt: isActive
              ? (mech.interactKind === 'weather_beacon' && this.state.launchedHome
                  ? (this.state.lang === 'zh'
                      ? '按 [E] 折跃返回坠机营地飞船'
                      : 'Press [E] to Warp to Crash Basin Ship')
                  : this.state.ui(mech.promptDoneKey))
              : this.state.ui(mech.promptActiveKey, {
                  done: prog.done,
                  total: prog.total
                }),
            inspectTitle: mech.inspectTitle ? this.state.text(mech.inspectTitle) : undefined,
            inspectBody: mech.inspectBody ? this.state.text(mech.inspectBody) : undefined
          },
          mech.interactRange || 3.2
        );
      }
    }

    // 7. Crew Logs
    for (const log of Object.values(CREW_LOGS)) {
      if (!this.state.isRegionUnlocked(log.region)) continue;
      consider(
        {
          kind: 'log',
          id: log.id,
          x: log.position.x,
          z: log.position.z,
          prompt: `${this.state.ui('promptLog')}: ${this.state.text(log.title)}`
        },
        2.9
      );
    }

    // 8. Non-harvestable Landmarks (clarifies lore & directs player to nearby nodes)
    const zh = this.state.lang === 'zh';
    if (this.state.isRegionUnlocked('dry_canyon')) {
      consider(
        {
          kind: 'landmark',
          id: 'outpost_tent',
          x: -4.2,
          z: 50.5,
          prompt: zh
            ? '按 [E] / [F] 勘查：干涸峡谷先遣科考穹顶前哨'
            : 'Press [E] / [F] to Inspect: Dry Canyon Research Outpost Dome',
          inspectTitle: zh
            ? '干涸峡谷 · 先遣科考穹顶前哨'
            : 'Dry Canyon Geodesic Research Outpost',
          inspectBody: zh
            ? '“晨行者号”先遣地质勘探队在干涸河床扎设的模块化穹顶哨所。周边峡谷岩层富含石英晶体与铜铁矿脉，可用于合成早期通讯中继元件。'
            : 'A modular geodesic outpost pitched by the Dawnstrider advance survey team in the dry riverbed. Nearby canyon strata are rich in Quartz Crystals and Copper/Iron veins for early relay components.'
        },
        4.2
      );
    }
    if (this.state.isRegionUnlocked('mothership_graveyard')) {
      consider(
        {
          kind: 'landmark',
          id: 'wreck_reactor_core',
          x: -55.8,
          z: -56.2,
          prompt: zh
            ? '按 [E] / [F] 勘查：先驱母舰跃迁反应堆核心（残骸地标）'
            : 'Press [E] / [F] to Inspect: Dawnstrider Warp Reactor Core',
          inspectTitle: zh
            ? '先驱母舰「晨行者号」跃迁反应堆核心'
            : 'Dawnstrider Mothership Warp Reactor Core',
          inspectBody: zh
            ? '远古先驱殖民母舰坠毁时留下的跃迁反应堆核心与磁约束环残骸（静态地标，不可直接采集）。请采集周围的【母舰超导装甲片】与【量子奇点晶核】来修复你的跃迁引擎。'
            : 'The shattered warp reactor core and magnetic containment rings of the ancient Dawnstrider colony mothership (non-harvestable landmark). Gather nearby Mothership Hyper-Alloy Plates and Quantum Singularity Shards to repair your Warp Engine.'
        },
        3.6
      );
    }

    const nextKey = best ? `${best.kind}:${best.id}` : null;
    if (nextKey && nextKey !== this._lastFocusedKey) {
      this.sound.playTargetFocus();
    }
    this._lastFocusedKey = nextKey;
    this.currentTarget = best;
    this._lastScanStateTick = this.state.versionTick;
    this._lastScanX = rx;
    this._lastScanZ = rz;
    this._scanCooldown = 0.085;
    return best;
  }

  /**
   * Executes primary [E] interaction on `this.currentTarget`.
   */
  triggerPrimaryInteract() {
    const t = this.currentTarget;
    if (!t) return false;

    if (t.kind === 'elevated_locked') {
      this.sound.playRobotChirp('warn');
      this.callbacks.showToast(t.prompt, 'warn');
      return false;
    }

    if (t.kind === 'resource') {
      if (!t.available) {
        this.sound.playError();
        return false;
      }
      const res = this.state.harvestNode(t.id);
      if (res.ok) {
        const matDef = MATERIALS[res.materialId];
        if (res.subsurface) {
          this.sound.playGeoDrill();
          this.robot.triggerAction('drill', 0.72);
          if (this.particles) {
            this.particles.emitDrillGeyser(t.x, t.y || 0, t.z, matDef.color);
          }
        } else {
          const isCrystal = getMaterialVisualArchetype(matDef) === 'crystal';
          this.sound.playGather(isCrystal);
          this.robot.triggerAction('gather', 0.55);
          if (this.particles) {
            this.particles.emitHarvestBurst(t.x, t.z, matDef.color, t.y);
          }
        }
        const matName = this.state.text(matDef.name);
        if (res.resonanceBonus > 0) {
          const msg = this.state.lang === 'zh'
            ? `⚡ 声呐谐振暴击 +${res.count} ${matName}（含 +${res.resonanceBonus}）`
            : `⚡ Sonar Resonance Strike +${res.count} ${matName} (+${res.resonanceBonus} bonus)`;
          this.callbacks.showToast(msg, 'celebrate');
        } else {
          this.callbacks.showToast(`+${res.count} ${matName}`, 'good');
        }
        return true;
      } else if (res.reason === 'missing_drill') {
        this.sound.playRobotChirp('warn');
        this.callbacks.showToast(t.prompt, 'warn');
        return false;
      }
      return false;
    }

    if (t.kind === 'station') {
      this.robot.triggerAction('craft', 0.6);
      this.callbacks.openStationModal(t.stationMode, t.stationFacility);
      return true;
    }

    if (t.kind === 'locked_repair') {
      this.sound.playRobotChirp('warn');
      this.callbacks.showToast(t.prompt, 'warn');
      return false;
    }

    if (t.kind === 'repair') {
      const targetDef = REPAIR_TARGETS[t.id];
      const res = this.state.installComponent(t.id);
      if (res.ok) {
        this.sound.playRepairInstall();
        this.robot.triggerAction('celebrate', 1.5);
        if (this.particles) {
          this.particles.emitCelebrationSparkles(targetDef.position.x, targetDef.position.z);
        }
        const look = new THREE.Vector3(
          targetDef.position.x * 0.6,
          2.4,
          targetDef.position.z * 0.6
        );
        this.cameraCtrl.triggerShowcase(look, new THREE.Vector3(8.5, 4.8, 9.5), 2.3);
        this.callbacks.showToast(
          this.state.ui('repairOnlineToast', {
            target: this.state.text(targetDef.name)
          }),
          'celebrate'
        );
        return true;
      } else {
        this.sound.playError();
        const reqMat = MATERIALS[targetDef.requiredItem];
        const msg =
          this.state.lang === 'zh'
            ? `尚未持有【${this.state.text(reqMat.name)}】—— 请先在精密制造台合成！`
            : `Missing ${this.state.text(reqMat.name)} — craft it at the Fabrication Station first!`;
        this.callbacks.showToast(msg, 'warn');
        return false;
      }
    }

    if (t.kind === 'pylon') {
      if (t.aligned) return false;
      const res = this.state.alignPylon(t.id);
      if (res.ok) {
        this.sound.playFacilityActivate();
        this.robot.triggerAction('celebrate', 1.0);
        if (res.bridgeNowOpen) {
          this.cameraCtrl.triggerShowcase(
            new THREE.Vector3(-45, 1.0, 0),
            new THREE.Vector3(10, 7.5, 11),
            2.2
          );
          this.callbacks.showToast(
            this.state.lang === 'zh'
              ? '硬光能量桥已架通！现在可以前往西侧陨星原了！'
              : 'Hard-Light Energy Bridge Extended! Cross west to the Meteorite Star-Field!',
            'celebrate'
          );
        } else {
          this.callbacks.showToast(
            this.state.lang === 'zh'
              ? `太阳能反射塔已校准 (${res.alignedCount}/2) —— 请再校准另一侧反射塔！`
              : `Solar Pylon Aligned (${res.alignedCount}/2) — align the second pylon to open the bridge!`,
            'good'
          );
        }
        return true;
      }
    }

    if (t.kind === 'cairn') {
      if (t.active) return false;
      const res = this.state.activateCairn(t.id);
      if (res.ok) {
        this.sound.playFacilityActivate();
        this.robot.triggerAction('celebrate', 0.9);
        this.callbacks.showToast(
          res.count >= 2
            ? this.state.ui('cairnAllActivatedToast')
            : this.state.ui('cairnActivatedToast', { count: res.count }),
          'good'
        );
        return true;
      }
    }

    if (t.kind === 'observatory') {
      if (t.done) return false;
      const res = this.state.restoreObservatory();
      if (res.ok) {
        this.sound.playFacilityActivate();
        this.robot.triggerAction('celebrate', 1.1);
        this.callbacks.showToast(
          this.state.ui('observatoryActivatedToast'),
          'celebrate'
        );
        return true;
      }
    }

    if (t.kind === 'weather_beacon') {
      if (t.done) {
        if (this.state.launchedHome) {
          const destY = getTerrainHeight(0, 8, false);
          this.robot.position.set(0, destY, 8);
          this.robot.vy = 0;
          this.robot.isGrounded = true;
          this.sound.playFacilityActivate();
          if (this.particles) {
            this.particles.emitCelebrationSparkles(0, 8);
          }
          this.callbacks.showToast(
            this.state.lang === 'zh'
              ? '⚡ 已通过气象遥测链折跃返回坠机营地'
              : '⚡ Warped back to Crash Basin via Telemetry Link',
            'celebrate'
          );
          return true;
        }
        return false;
      }
      const res = this.state.activateMechanism('weather_beacons', t.id);
      if (res.ok) {
        const od = this.state.applyWeatherOverdrive(24);
        this.sound.playFacilityActivate();
        this.robot.triggerAction('celebrate', 1.1);
        const baseMsg = res.complete
          ? this.state.ui('beaconAllDoneToast')
          : this.state.ui('beaconActivatedToast', { done: res.done, total: res.total });
        const odSuffix = od.ok
          ? (this.state.lang === 'zh'
              ? ` · ⚡ 气象过载：制造队列加速（完成 ${od.completedCount} 项）`
              : ` · ⚡ Overdrive: Queue surged (${od.completedCount} finished)`)
          : '';
        this.callbacks.showToast(`${baseMsg}${odSuffix}`, 'celebrate');
        return true;
      }
    }

    if (t.kind === 'log') {
      const res = this.state.readCrewLog(t.id);
      if (res.ok) {
        this.sound.playGather(true);
        this.callbacks.openInspectModal(
          this.state.text(res.log.title),
          this.state.text(res.log.body)
        );
        return true;
      }
    }

    if (t.kind === 'landmark' && t.inspectTitle && t.inspectBody) {
      this.sound.playTargetFocus();
      this.callbacks.openInspectModal(t.inspectTitle, t.inspectBody);
      return true;
    }

    if (t.kind === 'preflight') {
      const res = this.state.completePreflightCheck(t.id);
      if (res.ok) {
        this.sound.playFacilityActivate();
        this.robot.triggerAction('craft', 0.7);
        this.callbacks.showToast(
          res.doneCount >= 3
            ? this.state.ui('preflightAllVerifiedToast')
            : this.state.ui('preflightVerifiedToast', { count: res.doneCount }),
          'celebrate'
        );
        return true;
      }
    }

    if (t.kind === 'launch_ramp') {
      if (!t.ready) {
        this.sound.playError();
        this.callbacks.showToast(t.prompt, 'warn');
        return false;
      }
      this.callbacks.startLaunchSequence();
      return true;
    }

    return false;
  }

  /**
   * Executes secondary [F] inspect action on `this.currentTarget`.
   */
  triggerInspect() {
    const t = this.currentTarget;
    if (!t) return false;
    if (t.kind === 'log') {
      return this.triggerPrimaryInteract();
    }
    if (t.inspectTitle && t.inspectBody) {
      this.sound.playGather(true);
      this.callbacks.openInspectModal(t.inspectTitle, t.inspectBody);
      return true;
    }
    return false;
  }

  triggerSonarPulse() {
    const effRange = this.state.getEquipmentModifier('sonarRange', 42, 'max');
    const res = this.state.triggerSonarScan(
      this.robot.position.x,
      this.robot.position.z
    );
    if (!res.ok) {
      this.sound.playRobotChirp('warn');
      this.callbacks.showToast(this.state.ui('sonarLockedToast'), 'warn');
      return false;
    }
    this.sound.playSonarPing(res.count);
    this.robot.triggerAction('craft', 0.45);
    this.callbacks.showToast(
      res.count > 0
        ? this.state.ui('sonarPingFound', { count: res.count })
        : this.state.ui('sonarPingNone', { range: Math.round(effRange) }),
      res.count > 0 ? 'celebrate' : 'good'
    );
    return true;
  }

  /**
   * Accumulates ONLY active unpaused gameplay time since last progress!
   * Level 1 triggers helpful onboarding tip faster (16s), later levels at 30s.
   */
  getIdleHintIfDue(dt) {
    if (this.state.launchedHome) return null;
    if (this._lastKnownProgressMark !== this.state.lastProgressTimestamp) {
      this._lastKnownProgressMark = this.state.lastProgressTimestamp;
      this.idleAccumSeconds = 0;
    }
    if (this.hintDismissedForLevel === this.state.currentLevel) return null;

    this.idleAccumSeconds += dt;
    const threshold = this.state.currentLevel === 1 ? 16 : 30;
    if (this.idleAccumSeconds < threshold) return null;
    const prog = this.state.getCurrentLevelProgress();
    return prog.hint;
  }

  dismissIdleHint() {
    this.hintDismissedForLevel = this.state.currentLevel;
    this.idleAccumSeconds = 0;
    this.state.markProgress();
  }

  updateDesertAerialMotes(dt, worldBuilder) {
    if (!this.robot || !this.robot.position || !worldBuilder?.desertMoteCooldowns) return false;
    if (!this.state.hasEquipment('jetpack')) return false;
    const rx = this.robot.position.x;
    const ry = this.robot.position.y;
    const rz = this.robot.position.z;
    for (let i = 0; i < DESERT_AERIAL_MOTES.length; i++) {
      const m = DESERT_AERIAL_MOTES[i];
      if ((worldBuilder.desertMoteCooldowns[m.id] || 0) > 0) continue;
      const my = getTerrainHeight(m.x, m.z, false) + m.yOffset;
      if (Math.hypot(rx - m.x, rz - m.z) <= 2.35 && Math.abs(ry - my) <= 2.4) {
        worldBuilder.desertMoteCooldowns[m.id] = m.respawnSec || 55;
        this.robot.triggerAerialRingBoost?.(24, 1.4);
        const res = this.state.collectDesertAerialMote(m);
        if (res.ok) {
          const matDef = MATERIALS[res.rewardMat];
          const matName = matDef ? this.state.text(matDef.name) : res.rewardMat;
          this.sound.playGather(true);
          if (this.particles) {
            this.particles.emitHarvestBurst(m.x, m.z, m.color || '#78ffd6', my);
          }
          const boostNote = res.queueBoosted
            ? (this.state.lang === 'zh' ? ' · 制造加速-6s' : ' · Queue -6s')
            : '';
          this.callbacks.showToast(
            this.state.lang === 'zh'
              ? `✦ 空中星尘 +${res.count} ${matName}${boostNote}`
              : `✦ Sky-Mote +${res.count} ${matName}${boostNote}`,
            'celebrate'
          );
          return true;
        }
      }
    }
    return false;
  }
}
