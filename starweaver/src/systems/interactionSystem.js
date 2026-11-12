import * as THREE from 'three';
import {
  CREW_LOGS,
  ELEVATED_PLATFORMS,
  MATERIALS,
  PREFLIGHT_CHECKS,
  REGIONS,
  REPAIR_TARGETS,
  RESOURCE_NODES,
  WORLD_FACILITIES
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
  }

  /**
   * Scans all nearby interactable entities within comfortable interaction range
   * and returns the closest valid candidate with localized prompt text.
   */
  scanNearest() {
    const rx = this.robot.position.x;
    const ry = this.robot.position.y;
    const rz = this.robot.position.z;
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
      if (d <= maxRange && d < bestDist) {
        bestDist = d;
        best = candidate;
      }
    };

    // 1. Crafting Stations
    consider(
      {
        kind: 'station',
        stationMode: 'furnace',
        id: 'furnace',
        x: WORLD_FACILITIES.furnace.x,
        z: WORLD_FACILITIES.furnace.z,
        prompt: this.state.ui('promptFurnace'),
        inspectTitle: this.state.text(WORLD_FACILITIES.furnace.name),
        inspectBody: this.state.text(WORLD_FACILITIES.furnace.inspectDesc)
      },
      3.6
    );

    consider(
      {
        kind: 'station',
        stationMode: 'fabricator',
        id: 'fabricator',
        x: WORLD_FACILITIES.fabricator.x,
        z: WORLD_FACILITIES.fabricator.z,
        prompt: this.state.ui('promptFabricator'),
        inspectTitle: this.state.text(WORLD_FACILITIES.fabricator.name),
        inspectBody: this.state.text(WORLD_FACILITIES.fabricator.inspectDesc)
      },
      3.6
    );

    if (this.state.currentLevel >= WORLD_FACILITIES.outpost_purifier.unlockLevel) {
      consider(
        {
          kind: 'station',
          stationMode: 'both',
          id: 'outpost_purifier',
          x: WORLD_FACILITIES.outpost_purifier.x,
          z: WORLD_FACILITIES.outpost_purifier.z,
          prompt: this.state.ui('promptPurifier'),
          inspectTitle: this.state.text(WORLD_FACILITIES.outpost_purifier.name),
          inspectBody: this.state.text(WORLD_FACILITIES.outpost_purifier.inspectDesc)
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
          3.4
        );
      }
    }

    // 3. Level 5 Pre-Flight Hull Checks & Launch Boarding Ramp
    if (this.state.repairs.repair_propulsion) {
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
            3.1
          );
        }
      }

      const ramp = WORLD_FACILITIES.boarding_ramp;
      const ready = this.state.canLaunchSpacecraft();
      consider(
        {
          kind: 'launch_ramp',
          id: 'boarding_ramp',
          x: ramp.x,
          z: ramp.z,
          ready,
          prompt: ready
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

    // 5. Solar Mirror Pylons (Level 4 Gorge Bridge — South Pylon sits atop Sky-Spire!)
    if (this.state.isRegionUnlocked('relay_gorge')) {
      for (const p of WORLD_FACILITIES.pylons) {
        const aligned = Boolean(this.state.pylonsAligned[p.id]);
        const plat = p.platformId
          ? ELEVATED_PLATFORMS.find((pl) => pl.id === p.platformId)
          : null;
        const py = plat
          ? plat.topY
          : getTerrainHeight(p.x, p.z, false);

        if (plat && ry < plat.topY - 2.1) {
          const diffH = Math.max(2, Math.round(plat.topY - ry));
          consider(
            {
              kind: 'elevated_locked',
              id: p.id,
              x: p.x,
              y: py,
              z: p.z,
              prompt: this.state.hasEquipment('jetpack')
                ? this.state.ui('promptElevatedFlyUp', { height: diffH })
                : this.state.ui('promptElevatedNeedJetpack')
            },
            plat.radius + 2.5
          );
          continue;
        }

        consider(
          {
            kind: 'pylon',
            id: p.id,
            aligned,
            x: p.x,
            y: py,
            z: p.z,
            prompt: aligned
              ? this.state.ui('promptPylonDone')
              : this.state.ui('promptPylonAlign', {
                  done: this.state.getAlignedPylonCount()
                }),
            inspectTitle: 'Solar Relay Pylon',
            inspectBody:
              this.state.lang === 'zh'
                ? '将反射镜对准恒星即可通过地面发光线缆为裂谷硬光桥供能（需校准全部 2 座反射塔）。'
                : 'Aligning both Solar Mirror Pylons channels photonic energy through the glowing cables to extend the Hard-Light Gorge Bridge.'
          },
          3.2
        );
      }

      const obs = WORLD_FACILITIES.observatory;
      consider(
        {
          kind: 'observatory',
          id: obs.id,
          done: this.state.observatoryRestored,
          x: obs.x,
          z: obs.z,
          prompt: this.state.observatoryRestored
            ? this.state.ui('promptObservatoryDone')
            : this.state.ui('promptObservatory')
        },
        3.4
      );
    }

    // 6. Signal Cairns (Whispering Ridge)
    if (this.state.isRegionUnlocked('whispering_ridge')) {
      for (const c of WORLD_FACILITIES.cairns) {
        const active = Boolean(this.state.cairnsActivated[c.id]);
        consider(
          {
            kind: 'cairn',
            id: c.id,
            active,
            x: c.x,
            z: c.z,
            prompt: active
              ? this.state.ui('promptCairnDone')
              : this.state.ui('promptCairn')
          },
          3.0
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

    const nextKey = best ? `${best.kind}:${best.id}` : null;
    if (nextKey && nextKey !== this._lastFocusedKey) {
      this.sound.playTargetFocus();
    }
    this._lastFocusedKey = nextKey;
    this.currentTarget = best;
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
          const isCrystal =
            res.materialId.includes('crystal') || res.materialId === 'lumen_core';
          this.sound.playGather(isCrystal);
          this.robot.triggerAction('gather', 0.55);
          if (this.particles) {
            this.particles.emitHarvestBurst(t.x, t.z, matDef.color, t.y);
          }
        }
        const matName = this.state.text(matDef.name);
        this.callbacks.showToast(`+${res.count} ${matName}`, 'good');
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
      this.callbacks.openStationModal(t.stationMode);
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
          `${this.state.text(targetDef.name)} — ONLINE!`,
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
            ? this.state.lang === 'zh'
              ? '山脊信标全部点亮！山脊路段移动速度已提升！'
              : 'All Ridge Cairns Lit! Speed-boost trail active on Whispering Ridge!'
            : `Signal Cairn Activated (${res.count}/2)`,
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
          this.state.lang === 'zh'
            ? '远古星象观测天线已联机！获得支线奖励！'
            : 'Ancient Observatory Dish Online! Bonus Titanium Bars awarded!',
          'celebrate'
        );
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

    if (t.kind === 'preflight') {
      const res = this.state.completePreflightCheck(t.id);
      if (res.ok) {
        this.sound.playFacilityActivate();
        this.robot.triggerAction('craft', 0.7);
        this.callbacks.showToast(
          res.doneCount >= 3
            ? this.state.lang === 'zh'
              ? '全部 3 项安全点检通过！登机舷梯已放下，准备点火返航！'
              : 'All 3 Pre-Flight Checks Verified! Boarding Ramp extended — Ready for Launch!'
            : `Pre-Flight Check Verified (${res.doneCount}/3)`,
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
    const res = this.state.triggerSonarScan(
      this.robot.position.x,
      this.robot.position.z,
      42
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
        : this.state.ui('sonarPingNone'),
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
}
