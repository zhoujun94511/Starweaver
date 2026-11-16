import {
  HOMEWORLD_LANDMARKS,
  HOMEWORLD_CAPTAIN,
  HOMEWORLD_CALIBRATION,
  HOMEWORLD_COPY,
  HOMEWORLD_CREW_CHATS,
  HOMEWORLD_SKY_PLAQUES
} from '../data/homeworldActivities.js';
import { HOMEWORLD_AERIAL_RINGS, HOMEWORLD_CONFIG, getHomeworldGroundHeight } from '../data/homeworldData.js';
import { findNearestInteractable } from './interactableScanner.js';

export class HomeworldActivitySystem {
  constructor(state, robot, sound, callbacks = {}) {
    this.state = state;
    this.robot = robot;
    this.sound = sound;
    this.callbacks = callbacks;
    this.currentTarget = null;
    this._targetTick = -1;
    this._targetLang = '';
    this._candidates = [];
    this._crewCandidates = [];
    this._ringCooldowns = {};
    this.skyTrialActive = false;
    this.skyTrialElapsed = 0;
    this.skyTrialRingsHit = new Set();
    this._waypoint = { worldPlane: 'homeworld', x: 0, y: 420, z: 0, label: '', distMeters: 0, color: '#52ffb8' };
  }

  _isCrewTopicDone(chat, survey) {
    if (chat.linkedRecord === 'completed') return Boolean(survey.completed);
    if (chat.linkedRecord === 'energy') return survey.calibration === 3;
    return Boolean(survey.records && survey.records[chat.linkedRecord]);
  }

  _refreshCandidates() {
    if (this._targetTick === this.state.versionTick && this._targetLang === this.state.lang) return;
    this._targetTick = this.state.versionTick;
    this._targetLang = this.state.lang;
    const survey = this.state.homeworldSurvey;
    this._candidates.length = 0;
    this._crewCandidates.length = 0;
    const add = (point, prompt) => this._candidates.push({
      kind: 'homeworld_activity', id: point.id, x: point.x, z: point.z,
      y: getHomeworldGroundHeight(point.x, point.z),
      prompt: `[E] ${prompt}`, inspectTitle: this.state.text(point.name),
      inspectBody: point.note ? this.state.text(point.note) : this.journalText()
    });
    add(HOMEWORLD_CAPTAIN, this.state.text(!survey.accepted ? HOMEWORLD_COPY.accept :
      survey.calibration === 3 && !survey.completed ? HOMEWORLD_COPY.report : HOMEWORLD_COPY.journal));
    if (survey.accepted) {
      const atmoUnlocked = Boolean(this.state.isHomeworldAtmosphereUnlocked?.());
      for (const point of HOMEWORLD_LANDMARKS) {
        const promptCopy = !survey.records[point.id]
          ? point.record
          : point.id === 'energy' && survey.calibration < 3
            ? HOMEWORLD_COPY.calibrate
            : point.id === 'observatory' && atmoUnlocked
              ? HOMEWORLD_COPY.cycleAtmosphere
              : point.id === 'nursery' && survey.records.nursery && !survey.nurseryBloomed && this.state.launchedHome
                ? HOMEWORLD_COPY.nurseryBloomPrompt
                : HOMEWORLD_COPY.alreadyRecorded;
        add(point, this.state.text(promptCopy));
      }
    }
    for (const chat of HOMEWORLD_CREW_CHATS) {
      const done = this._isCrewTopicDone(chat, survey);
      const line = this.state.text(done ? chat.after : chat.before);
      this._crewCandidates.push({
        kind: 'homeworld_crew_chat',
        id: chat.id,
        chat,
        x: chat.x,
        z: chat.z,
        y: getHomeworldGroundHeight(chat.x, chat.z),
        prompt: `[E] ${this.state.text(chat.prompt)}`,
        inspectTitle: this.state.text(chat.name),
        inspectBody: line
      });
    }
  }

  scanNearest() {
    this.currentTarget = null;
    if (this.robot.worldPlane !== 'homeworld') return null;
    this._refreshCandidates();
    const rx = this.robot.position.x;
    const ry = this.robot.position.y;
    const rz = this.robot.position.z;

    this.currentTarget = findNearestInteractable(this._candidates, rx, ry, rz, 3.0, 2.0);
    if (!this.currentTarget) {
      const plaque = findNearestInteractable(
        HOMEWORLD_SKY_PLAQUES,
        rx,
        ry,
        rz,
        3.6,
        1.8,
        (p) => p.topY
      );
      if (plaque) {
        this.currentTarget = {
          kind: 'sky_plaque',
          id: plaque.id,
          plaque,
          x: plaque.x,
          y: plaque.topY,
          z: plaque.z,
          prompt: this.state.text(plaque.prompt),
          inspectTitle: this.state.text(plaque.name),
          inspectBody: this.state.text(plaque.note)
        };
      }
    }
    if (!this.currentTarget) {
      this.currentTarget = findNearestInteractable(this._crewCandidates, rx, ry, rz, 1.68, 2.0);
    }
    return this.currentTarget;
  }

  nextObjective() {
    if (this.skyTrialActive) {
      let nextRing = null;
      let bestDist = Infinity;
      for (let i = 0; i < HOMEWORLD_AERIAL_RINGS.length; i++) {
        const ring = HOMEWORLD_AERIAL_RINGS[i];
        if (this.skyTrialRingsHit.has(ring.id)) continue;
        const d = Math.hypot(this.robot.position.x - ring.x, this.robot.position.z - ring.z);
        if (d < bestDist) {
          bestDist = d;
          nextRing = ring;
        }
      }
      if (nextRing) {
        const waypoint = this._waypoint;
        waypoint.x = nextRing.x;
        waypoint.z = nextRing.z;
        waypoint.y = HOMEWORLD_CONFIG.baseY + nextRing.yOffset;
        waypoint.label = this.state.lang === 'zh'
          ? `穿环试炼 (${this.skyTrialRingsHit.size}/${HOMEWORLD_AERIAL_RINGS.length})`
          : `Sky Trial (${this.skyTrialRingsHit.size}/${HOMEWORLD_AERIAL_RINGS.length})`;
        waypoint.distMeters = Math.round(bestDist);
        return waypoint;
      }
    }
    const survey = this.state.homeworldSurvey;
    let point = HOMEWORLD_CAPTAIN;
    let label = HOMEWORLD_COPY.talkCaptain;
    if (survey.accepted && !survey.completed) {
      let nearest = Infinity;
      for (const candidate of HOMEWORLD_LANDMARKS) {
        if (survey.records[candidate.id]) continue;
        const distance = Math.hypot(this.robot.position.x - candidate.x, this.robot.position.z - candidate.z);
        if (distance < nearest) { nearest = distance; point = candidate; label = candidate.name; }
      }
      if (nearest === Infinity) {
        point = survey.calibration < 3 ? HOMEWORLD_LANDMARKS[2] : HOMEWORLD_CAPTAIN;
        label = survey.calibration < 3 ? HOMEWORLD_COPY.calibrate : HOMEWORLD_COPY.returnCaptain;
      }
    } else if (survey.completed) { label = HOMEWORLD_COPY.completed; }
    const waypoint = this._waypoint;
    waypoint.x = point.x; waypoint.z = point.z;
    waypoint.y = getHomeworldGroundHeight(point.x, point.z);
    waypoint.label = this.state.text(label);
    waypoint.distMeters = Math.round(Math.hypot(this.robot.position.x - point.x, this.robot.position.z - point.z));
    return waypoint;
  }

  triggerPrimary() {
    const target = this.scanNearest(); // Recheck range; never use a stale mobile target.
    if (!target) return { ok: false, reason: 'out_of_range' };
    const survey = this.state.homeworldSurvey;
    if (target.kind === 'sky_plaque') {
      const pRes = this.state.recordHomeworldSkyPlaque(target.id);
      this.robot.triggerAction?.('celebrate', 0.9);
      this.sound.playGather?.(true);
      if (target.id === 'sky_arch') {
        this.startSkyTrial();
        return { ok: true, skyTrialStarted: true };
      }
      this.callbacks.openInspect?.(target.inspectTitle, target.inspectBody);
      if (pRes.firstTime) {
        const raw = this.state.text(HOMEWORLD_COPY.plaqueRecorded);
        this.callbacks.showToast?.(
          raw.replace('{done}', String(pRes.done)).replace('{total}', String(pRes.total)),
          'celebrate'
        );
      }
      return { ok: true, plaqueId: target.id };
    }
    if (target.kind === 'homeworld_crew_chat') {
      const done = this._isCrewTopicDone(target.chat, survey);
      this.robot.triggerAction?.('celebrate', 0.95);
      this.sound.playRobotChirp?.('happy');
      this.callbacks.showToast?.(this.state.text(done ? target.chat.after : target.chat.before), 'celebrate');
      return { ok: true, crewChat: target.id };
    }
    let result;
    if (target.id === 'captain') {
      if (!survey.accepted) {
        result = this.state.acceptHomeworldSurvey();
        if (result.ok) this.callbacks.openJournal?.();
      } else if (survey.calibration === 3 && !survey.completed) {
        result = this.state.completeHomeworldSurvey();
        if (result.ok) {
          this.robot.triggerAction?.('celebrate', 1.4);
          this.callbacks.onCelebrate?.(target.x, target.z, 'completed');
          this._feedback(HOMEWORLD_COPY.completed, 'celebrate');
        }
      } else { this.callbacks.openJournal?.(); return { ok: true, repeated: true }; }
    } else if (!survey.records[target.id]) {
      result = this.state.recordHomeworldLandmark(target.id);
      if (result.ok) {
        this.robot.triggerAction?.('gather', 0.85);
        this.callbacks.onCelebrate?.(target.x, target.z, target.id);
        this._feedback(HOMEWORLD_LANDMARKS.find(point => point.id === target.id).note, 'celebrate');
      }
    } else if (target.id === 'energy' && survey.calibration < 3) {
      if (HOMEWORLD_LANDMARKS.every(point => survey.records[point.id])) {
        this.callbacks.openCalibration?.(action => this.calibrate(action));
        return { ok: true, console: true };
      }
      this._feedback(HOMEWORLD_COPY.recordsFirst, 'warn');
      return { ok: false, reason: 'missing_records' };
    } else if (target.id === 'nursery' && survey.records.nursery && !survey.nurseryBloomed && this.state.launchedHome) {
      const bRes = this.state.bloomHomeworldNursery();
      if (bRes.ok) {
        this.robot.triggerAction?.('celebrate', 1.25);
        this.callbacks.onCelebrate?.(target.x, target.z, 'nursery');
        this.sound.playFacilityActivate?.();
        this._feedback(HOMEWORLD_COPY.nurseryBloomedToast, 'celebrate');
        return { ok: true, nurseryBloomed: true };
      }
      this.sound.playRobotChirp?.('warn');
      this._feedback(HOMEWORLD_COPY.nurseryNeedCrystals, 'warn');
      return { ok: false, reason: bRes.reason };
    } else if (target.id === 'observatory' && this.state.isHomeworldAtmosphereUnlocked?.()) {
      const nextMode = this.state.cycleHomeworldAtmosphere();
      this.robot.triggerAction?.('celebrate', 1.15);
      this.callbacks.onCelebrate?.(target.x, target.z, 'observatory');
      this.sound.playFacilityActivate?.();
      const modeCopy =
        nextMode === 'sunset'
          ? HOMEWORLD_COPY.atmoSunset
          : nextMode === 'night'
            ? HOMEWORLD_COPY.atmoNight
            : HOMEWORLD_COPY.atmoDawn;
      this.callbacks.showToast?.(
        `${this.state.text(HOMEWORLD_COPY.atmoSwitched)}${this.state.text(modeCopy)}`,
        'celebrate'
      );
      return { ok: true, atmosphereMode: nextMode };
    } else { this.callbacks.openJournal?.(); return { ok: true, repeated: true }; }
    if (result?.ok) this.sound.playFacilityActivate?.();
    return result;
  }

  calibrate(action) {
    // The panel may stay open after a caller teleports; keep distance and plane authoritative.
    const target = this.scanNearest();
    if (target?.id !== 'energy') return { ok: false, reason: 'out_of_range' };
    const result = this.state.calibrateHomeworldRelay(action);
    if (result.ok) {
      this.sound.playFacilityActivate?.();
      this.robot.triggerAction?.('craft', 0.6);
      if (this.state.homeworldSurvey.calibration === 3) {
        this.callbacks.onCelebrate?.(target.x, target.z, 'grid_online');
        this._feedback(HOMEWORLD_COPY.restored, 'celebrate');
      }
    } else { this._feedback(HOMEWORLD_COPY.wrongOrder, 'warn'); }
    return result;
  }

  triggerInspect() {
    const target = this.scanNearest();
    if (target) this.callbacks.openInspect?.(target.inspectTitle, target.inspectBody);
  }

  _feedback(copy, style = 'good') { this.callbacks.showToast?.(this.state.text(copy), style); }

  startSkyTrial() {
    const wasActive = this.skyTrialActive;
    this.skyTrialActive = true;
    this.skyTrialElapsed = 0;
    this.skyTrialRingsHit.clear();
    this._ringCooldowns = {};
    this.robot?.triggerAerialRingBoost?.(45, 2.5);
    this.sound?.playFacilityActivate?.();
    this._feedback(wasActive ? HOMEWORLD_COPY.skyTrialRestarted : HOMEWORLD_COPY.skyTrialStarted, 'celebrate');
  }

  resetTransientState() {
    this.skyTrialActive = false;
    this.skyTrialElapsed = 0;
    this.skyTrialRingsHit.clear();
    this._ringCooldowns = {};
  }

  checkAerialCourse(dt) {
    if (this.skyTrialActive) {
      this.skyTrialElapsed += dt;
    }
    if (!this.robot || !this.robot.position) return false;
    const rx = this.robot.position.x;
    const ry = this.robot.position.y;
    const rz = this.robot.position.z;
    for (const id of Object.keys(this._ringCooldowns)) {
      if (this._ringCooldowns[id] > 0) {
        this._ringCooldowns[id] = Math.max(0, this._ringCooldowns[id] - dt);
      }
    }
    for (let i = 0; i < HOMEWORLD_AERIAL_RINGS.length; i++) {
      const ring = HOMEWORLD_AERIAL_RINGS[i];
      if ((this._ringCooldowns[ring.id] || 0) > 0) continue;
      const ringY = HOMEWORLD_CONFIG.baseY + ring.yOffset;
      if (Math.hypot(rx - ring.x, rz - ring.z) <= ring.radius + 0.95 && Math.abs(ry - ringY) <= 3.0) {
        this._ringCooldowns[ring.id] = 3.0;
        this.robot.triggerAerialRingBoost?.(38, 2.2);
        const res = this.state.recordHomeworldFlightRing(ring.id);
        this.sound?.playGather?.(true);
        if (this.skyTrialActive) {
          this.skyTrialRingsHit.add(ring.id);
          if (this.skyTrialRingsHit.size >= HOMEWORLD_AERIAL_RINGS.length) {
            this.skyTrialActive = false;
            const tRes = this.state.recordHomeworldSkyTrial(this.skyTrialElapsed);
            this.robot.triggerAction?.('celebrate', 1.3);
            this.callbacks.onCelebrate?.(ring.x, ring.z, 'sky_trial_complete');
            const bestTag = tRes.isNewBest
              ? (this.state.lang === 'zh' ? '（★ 新纪录！）' : ' (★ NEW BEST!)')
              : '';
            const raw = this.state.text(HOMEWORLD_COPY.skyTrialFinished);
            this.callbacks.showToast?.(
              raw.replace('{sec}', String(tRes.sec)).replace('{bestTag}', bestTag),
              'celebrate'
            );
            return true;
          }
        }
        if (res.unlockedJetflame) {
          this.robot.triggerAction?.('celebrate', 1.2);
          this.callbacks.onCelebrate?.(ring.x, ring.z, 'jetflame_unlocked');
          this._feedback(HOMEWORLD_COPY.allRingsUnlocked, 'celebrate');
        } else if (res.firstTime) {
          const raw = this.state.text(HOMEWORLD_COPY.ringBoostToast);
          this.callbacks.showToast?.(
            raw.replace('{done}', String(res.clearedCount)).replace('{total}', String(res.total)),
            'celebrate'
          );
        }
        return true;
      }
    }
    return false;
  }

  journalText() {
    const survey = this.state.homeworldSurvey;
    const lines = [this.state.text(HOMEWORLD_COPY.brief), ''];
    for (const point of HOMEWORLD_LANDMARKS) {
      lines.push(`${survey.records[point.id] ? '✓' : '○'} ${this.state.text(point.name)}`);
      if (survey.records[point.id]) lines.push(this.state.text(point.note));
    }
    lines.push('', this.state.text(HOMEWORLD_COPY.sequence));
    for (let i = 0; i < HOMEWORLD_CALIBRATION.length; i++) lines.push(`${survey.calibration > i ? '✓' : '○'} ${this.state.text(HOMEWORLD_CALIBRATION[i].name)}`);
    if (survey.completed) lines.push('', this.state.text(HOMEWORLD_COPY.completed));
    if (this.state.isHomeworldAtmosphereUnlocked?.()) {
      lines.push('', this.state.text(HOMEWORLD_COPY.atmoHintUnlocked));
    }
    return lines.join('\n');
  }
}
