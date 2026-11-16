import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GameState } from '../src/state/gameState.js';
import { LEVELS, PREFLIGHT_CHECKS, RESOURCE_NODES } from '../src/data/gameData.js';
import { HomeworldActivitySystem } from '../src/systems/homeworldActivitySystem.js';
import { HOMEWORLD_CAPTAIN, HOMEWORLD_LANDMARKS, HOMEWORLD_SKY_PLAQUES, createHomeworldSurvey, sanitizeHomeworldSurvey } from '../src/data/homeworldActivities.js';
import {
  HOMEWORLD_AERIAL_RINGS,
  HOMEWORLD_CONFIG,
  HOMEWORLD_DISTRICTS,
  HOMEWORLD_ELEVATED_PLATFORMS,
  HOMEWORLD_UPDRAFT_THERMALS,
  getHomeworldElevatedPlatformAt,
  getHomeworldGroundHeight
} from '../src/data/homeworldData.js';
import { RobotController } from '../src/entities/robotController.js';
import { TouchControls } from '../src/ui/touchControls.js';
import { HudController } from '../src/ui/hudController.js';
import { AtmosphereSystem } from '../src/systems/atmosphereSystem.js';
import { createSkyDome } from '../src/graphics/skyDome.js';
import { PlanarReflectionSystem } from '../src/graphics/planarReflection.js';
import { buildHomeworldEnhancements, updateHomeworldEnhancements } from '../src/scene/homeworldBuilder.js';

// Lightweight DOM surface for testing the real HUD render/click methods, without
// substituting the mission reducer or interaction implementation under test.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = []; this.style = {}; this.handlers = {}; this.attrs = {};
    this.classes = new Set(); this.textWrites = 0;
    this.classList = {
      contains: value => this.classes.has(value),
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      toggle: (value, force) => {
        const on = force === undefined ? !this.classes.has(value) : force;
        if (on) this.classes.add(value); else this.classes.delete(value);
        return on;
      }
    };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this.text = String(value); this.textWrites++; }
  get textContent() { return this.text || ''; }
  get firstChild() { return this.children[0]; }
  get lastChild() { return this.children.at(-1); }
  get childNodes() { return this.children; }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentElement) node.parentElement.removeChild(node);
      this.children.push(node); node.parentElement = this;
    }
  }
  appendChild(node) { this.append(node); return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); node.parentElement = null; }
  insertBefore(node, reference) {
    if (node === reference) return node;
    if (node.parentElement) node.parentElement.removeChild(node);
    const index = this.children.indexOf(reference);
    this.children.splice(index < 0 ? this.children.length : index, 0, node);
    node.parentElement = this;
    return node;
  }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(event, handler) { this.handlers[event] = handler; }
  click() { if (!this.disabled) this.handlers.click?.(); }
}

export function verifyHomeworldActivities() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const storage = new Map();
  const states = [];
  globalThis.window = {
    addEventListener() {}, matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    }
  };
  globalThis.document = { createElement: tag => new Element(tag), documentElement: {}, body: new Element(), addEventListener() {} };
  const makeState = () => { const state = new GameState(); states.push(state); return state; };
  try {
    for (const point of HOMEWORLD_LANDMARKS) {
      const district = HOMEWORLD_DISTRICTS.find(item => item.id === point.id);
      assert.deepEqual([point.x, point.z], [district.approachX, district.approachZ], 'Interaction must follow the environment approach point');
      assert(Math.hypot(point.x, point.z) < HOMEWORLD_CONFIG.playRadius - 2, 'Every stop must be within the playable valley');
      assert(Number.isFinite(getHomeworldGroundHeight(point.x, point.z)));
    }
    assert.deepEqual(sanitizeHomeworldSurvey(undefined), createHomeworldSurvey(), 'Legacy saves start with an available, unclaimed mission');
    assert.deepEqual(sanitizeHomeworldSurvey({ accepted: 'true', completed: true }), createHomeworldSurvey());
    const corrupt = sanitizeHomeworldSurvey({ accepted: true, records: { observatory: true, nursery: false, energy: true, forged: true }, calibration: 999, completed: true });
    assert.equal(corrupt.calibration, 0, 'Incomplete records cannot load a finished relay');
    assert.equal(corrupt.completed, false);
    assert.equal(corrupt.records.forged, undefined);

    const state = makeState();
    assert.equal(state.acceptHomeworldSurvey().reason, 'not_home_yet');
    assert.equal(state.recordHomeworldLandmark('energy').reason, 'not_accepted');
    assert.equal(state.completeHomeworldSurvey().reason, 'incomplete');
    state.currentLevel = LEVELS.length;
    for (const level of LEVELS) state.repairs[level.repairTargetId] = true;
    for (const check of PREFLIGHT_CHECKS) state.preflightDone[check.id] = true;
    assert.equal(state.triggerLaunchAndCompleteGame().ok, true, 'Use a valid completed campaign so save reconciliation preserves the return home');
    state.inventory.iron_scrap = 7;
    const inventory = JSON.stringify(state.inventory);
    const events = [];
    state.on((event, detail) => { if (event === 'homeworld_survey_changed') events.push(detail.action); });
    const robot = { worldPlane: 'homeworld', position: { x: 0, y: 420, z: 0 }, triggerAction() {} };
    const goto = point => Object.assign(robot.position, { x: point.x, z: point.z, y: getHomeworldGroundHeight(point.x, point.z) });
    let journalOpened = 0, calibrationAction;
    const callbacks = { openJournal: () => journalOpened++, openCalibration: callback => { calibrationAction = callback; } };
    const sound = { playFacilityActivate() {} };
    const activity = new HomeworldActivitySystem(state, robot, sound, callbacks);
    goto(HOMEWORLD_LANDMARKS[0]);
    assert.equal(activity.scanNearest(), null, 'Unaccepted stops must not consume the captain interaction');
    goto(HOMEWORLD_CAPTAIN);
    assert.equal(activity.triggerPrimary().ok, true);
    assert.equal(journalOpened, 1, 'Accepting the captain brief opens the actionable journal');
    assert.equal(state.acceptHomeworldSurvey().reason, 'already_accepted');
    assert.equal(state.recordHomeworldLandmark('forged').reason, 'unknown_landmark');
    assert.equal(state.calibrateHomeworldRelay('intake').reason, 'missing_records');
    assert(activity.journalText().includes('○'));
    for (const point of HOMEWORLD_LANDMARKS) {
      goto(point);
      assert.equal(activity.scanNearest().id, point.id);
      robot.position.y += 2.1;
      assert.equal(activity.triggerPrimary().reason, 'out_of_range', 'Flying above a device cannot scan it');
      goto(point);
      assert.equal(activity.triggerPrimary().ok, true);
      assert.equal(state.homeworldSurvey.records[point.id], true);
      const version = state.versionTick;
      assert.equal(state.recordHomeworldLandmark(point.id).reason, 'already_recorded');
      assert.equal(state.versionTick, version, 'Repeating a reading cannot create progress events');
    }
    assert.equal(activity.nextObjective().x, HOMEWORLD_LANDMARKS[2].x);
    assert.equal(activity.triggerPrimary().console, true, 'The recorded energy station exposes its real calibration panel');
    assert.equal(typeof calibrationAction, 'function');
    assert.equal(calibrationAction('connect').reason, 'wrong_sequence');
    assert.equal(state.homeworldSurvey.calibration, 0);
    assert.equal(calibrationAction('intake').ok, true);
    robot.worldPlane = 'desert';
    assert.equal(calibrationAction('stabilize').reason, 'out_of_range', 'An open panel cannot remotely operate another world');
    robot.worldPlane = 'homeworld';
    robot.position.x += 3.1;
    assert.equal(calibrationAction('stabilize').reason, 'out_of_range');
    state.flushSave();
    const restored = makeState();
    assert.equal(restored.load(), true);
    assert.equal(restored.homeworldSurvey.calibration, 1, 'A reload preserves partial calibration');
    goto(HOMEWORLD_LANDMARKS[2]);
    const resumed = new HomeworldActivitySystem(restored, robot, sound, callbacks);
    assert.equal(resumed.calibrate('connect').reason, 'wrong_sequence');
    assert.equal(restored.homeworldSurvey.calibration, 1, 'Wrong inputs preserve earlier stages');
    assert.equal(resumed.calibrate('stabilize').ok, true);
    assert.equal(resumed.calibrate('connect').ok, true);
    assert.equal(restored.homeworldSurvey.completed, false, 'Power restoration still requires reporting to the captain');
    goto(HOMEWORLD_CAPTAIN);
    assert.equal(resumed.triggerPrimary().ok, true);
    assert.equal(restored.homeworldSurvey.completed, true);
    const version = restored.versionTick;
    assert.equal(resumed.triggerPrimary().repeated, true);
    assert.equal(restored.completeHomeworldSurvey().reason, 'already_completed');
    assert.equal(restored.versionTick, version, 'The medallion can only be awarded once');
    assert.equal(JSON.stringify(state.inventory), inventory, 'The watch does not consume desert materials');
    assert.equal(JSON.stringify(restored.inventory), inventory, 'Restored progress also preserves desert materials');
    assert.equal(events.filter(event => event === 'accepted').length, 1);
    restored.flushSave();
    const rewarded = makeState();
    assert.equal(rewarded.load(), true);
    assert.equal(rewarded.launchedHome, true);
    assert.equal(rewarded.homeworldSurvey.accepted, true, 'Completed saves retain the motherworld continuation route');
    assert.equal(rewarded.homeworldSurvey.completed, true, 'The earned view and medallion survive closing the game');

    const touch = { touchActive: true, compactViewport: true, isControlPadActive() { return true; }, _visibleAllowed: true, state: restored, _lastStateSig: '' };
    for (const key of ['btnSonar', 'btnSonarLbl', 'btnJet', 'btnJetLbl', 'btnInspect', 'btnInspectLbl', 'btnAct', 'btnActIcon', 'btnActLbl']) touch[key] = new Element();
    restored.equipment.drill = true; restored.equipment.jetpack = true;
    TouchControls.prototype.updateContext.call(touch, resumed.scanNearest(), { homeworldRoam: true });
    assert.equal(touch.btnAct.classList.contains('hidden'), false, 'Nearby homeworld interactions remain usable on touch');
    assert.equal(touch.btnAct.classList.contains('ready'), true, 'Nearby homeworld target highlights primary button');
    assert.equal(touch.btnSonar.classList.contains('hidden'), true, 'Desert sonar stays hidden on the homeworld');
    assert.equal(touch.btnJet.classList.contains('hidden'), false);
    TouchControls.prototype.updateContext.call(touch, null, { homeworldRoam: true });
    assert.equal(touch.btnAct.classList.contains('hidden'), false, 'Compact/touch controls keep primary action button visible in idle state');
    assert.equal(touch.btnAct.classList.contains('idle'), true, 'Away from targets, primary action button stays in calm idle state');

    const hud = Object.create(HudController.prototype);
    Object.assign(hud, { state: restored, sound: { playModalClose() {} }, actions: {}, activeModal: null });
    for (const key of ['workbenchDrawer', 'modalBackdrop', 'modalPanel', 'homeworldObjective']) hud[key] = new Element();
    hud.openHomeworldJournal(resumed);
    assert.equal(hud.activeModal, 'homeworld_journal');
    assert.equal(hud.modalPanel.lastChild.textContent, '谷地观景', 'Completion exposes the unlocked view action');
    restored.setLang('en');
    hud.openHomeworldJournal(resumed);
    assert.equal(hud.modalPanel.firstChild.firstChild.textContent, 'The First Watch Home');
    assert(!/[\u4e00-\u9fff]/.test(resumed.journalText()), 'A locale switch must regenerate the entire journal in one language');
    const waypoint = resumed.nextObjective();
    hud.updateHomeworldObjective(waypoint);
    const writes = hud.homeworldObjective.textWrites;
    for (let i = 0; i < 120; i++) hud.updateHomeworldObjective(waypoint);
    assert.equal(hud.homeworldObjective.textWrites, writes, 'Stationary frames cannot rewrite the progress DOM');

    restored.homeworldSurvey.calibration = 0; restored.homeworldSurvey.completed = false;
    goto(HOMEWORLD_LANDMARKS[2]);
    hud.openHomeworldCalibration(action => resumed.calibrate(action));
    let controls = hud.modalPanel.children[2];
    controls.children[2].click();
    assert.equal(restored.homeworldSurvey.calibration, 0);
    assert(hud.modalPanel.lastChild.textContent.includes('Interlock'), 'Out-of-order button feedback is visible in the console');
    for (let stage = 0; stage < 3; stage++) {
      controls = hud.modalPanel.children[2];
      controls.children[stage].click();
      assert.equal(restored.homeworldSurvey.calibration, stage + 1, 'Real console buttons advance exactly one ordered step');
    }
    assert(hud.modalPanel.children[2].children.every(button => button.disabled));
    assert(hud.modalPanel.lastChild.textContent.includes('Power is online'));

    restored.flushSave();
    const legacy = JSON.parse(storage.get('little_bot_homebound_save_v1'));
    delete legacy.homeworldSurvey;
    storage.set('little_bot_homebound_save_v1', JSON.stringify(legacy));
    const migrated = makeState();
    assert.equal(migrated.load(), true);
    assert.deepEqual(migrated.homeworldSurvey, createHomeworldSurvey(), 'Pre-expansion saves can start the complete watch');

    const uiState = makeState();
    assert.equal(uiState.load(), true);
    uiState.setLang('en');
    const contextHud = Object.create(HudController.prototype);
    let journalEntries = 0, unstuckCalls = 0, appliedQuality, appliedMuted;
    const uiActivity = new HomeworldActivitySystem(uiState, robot, sound);
    Object.assign(contextHud, { state: uiState, activeModal: null, inHomeworldRoamMode: false,
      sound: { playModalClose() {}, playUiClick() {}, setMuted(value) { appliedMuted = value; } },
      actions: { onHomeworldJournal() { journalEntries++; contextHud.openHomeworldJournal(uiActivity); },
        onQualityChange(value) { appliedQuality = value; }, onUnstuck() { unstuckCalls++; } } });
    for (const key of ['homeworldHeader', 'homeworldBar', 'homeworldBarTitle', 'homeworldObjective',
      'btnHwSummary', 'btnHwDesert', 'btnHwReplay', 'hwJetWrap', 'topLeft', 'topCenter', 'topRight',
      'bottomLeft', 'bottomCenter', 'toolbarRow', 'toastEl', 'hintBannerEl', 'hintTextEl', 'promptBox',
      'promptMainText', 'promptSubText', 'compassTextEl', 'compassDistEl', 'compassBadgeEl',
      'levelTitleEl', 'missionSummaryEl', 'leftTabLabelEl', 'sideHeaderEl', 'shipHeaderEl', 'rightExpandBtn',
      'invHeaderEl', 'bagDrawerTab', 'jetpackLabelEl', 'stepsContainer', 'sideListEl', 'shipPillsEl',
      'gearBadgesRow', 'invGridEl', 'btnCleanView', 'missionFoldBtn', 'bagFoldBtn', 'rightFoldBtn',
      'compassHideBtn', 'btnNavArrow', 'btnGuide', 'btnAudio', 'btnLang', 'btnPause', 'controlsFooter',
      'workbenchDrawer', 'modalBackdrop', 'modalPanel', 'cinemaOverlay', 'jetpackFillEl', 'jetpackPctEl']) {
      contextHud[key] = new Element();
    }
    contextHud.btnHwPause = contextHud.btnPause;
    contextHud.topRight.append(contextHud.toolbarRow);
    for (const key of ['levelTitleEl', 'missionSummaryEl', 'promptMainText', 'hintTextEl']) contextHud[key].textContent = 'DESERT_SENTINEL';
    contextHud.stepsContainer.append(new Element());
    contextHud.setHomeworldRoamVisible(true);
    contextHud._bindStateEvents();
    assert.equal(contextHud.topLeft.classList.contains('hidden'), true, 'Desert mission drawer must leave the homeworld screen');
    assert.equal(contextHud.bottomLeft.classList.contains('hidden'), true, 'Desert cargo drawer must leave the homeworld screen');
    assert.equal(contextHud.topRight.classList.contains('hidden'), true, 'Desert ship card must leave the homeworld screen');
    assert.equal(contextHud.toolbarRow.parentElement, contextHud.homeworldHeader);
    assert.equal(contextHud.levelTitleEl.textContent, '');
    assert.equal(contextHud.stepsContainer.children.length, 0);
    assert.equal(contextHud.promptMainText.textContent, '');
    assert.equal(contextHud.hintTextEl.textContent, '');
    assert.equal(contextHud.btnGuide.textContent, '📖 Watch journal [C]');
    assert(!/gather|craft|repair|blueprints|sonar/i.test(contextHud.controlsFooter.textContent), 'Homeworld controls cannot advertise desert tasks or abilities');
    const oldLevelProgress = uiState.getCurrentLevelProgress;
    uiState.getCurrentLevelProgress = () => { throw new Error('Homeworld must not render the desert level'); };
    try { contextHud.renderAll(); } finally { uiState.getCurrentLevelProgress = oldLevelProgress; }
    contextHud.openRecipeGuide();
    assert.equal(journalEntries, 1, 'The existing C/toolbar guide entry must route to the watch journal');
    assert.equal(contextHud.activeModal, 'homeworld_journal');
    contextHud.closeModal();

    uiState.setHudPref('showCompass', true);
    uiState.setHudPref('showWorldLabels', true);
    uiState.setHudPref('showIdleTips', true);
    assert.equal(contextHud.homeworldObjective.classList.contains('hidden'), false);
    uiState.setHudPref('showCompass', false);
    assert.equal(uiState.isCleanViewActive(), false, 'Exercise a mixed preference state, not just the all-off preset');
    assert.equal(contextHud.homeworldObjective.classList.contains('hidden'), true, 'Homeworld next-destination preference must independently hide its real pill');
    uiState.setHudPref('showCompass', true);
    const oldTarget = { kind: 'resource', prompt: '[E] DESERT_SENTINEL' };
    const oldWaypoint = { label: 'DESERT_SENTINEL', color: '#ff0000', distMeters: 12 };
    contextHud.updateHomeworldObjective(uiActivity.nextObjective());
    const watchPillText = contextHud.homeworldObjective.textContent;
    contextHud.updateHomeworldObjective(oldWaypoint);
    assert.equal(contextHud.homeworldObjective.textContent, watchPillText, 'Desert DAG guidance cannot overwrite the motherworld watch pill');
    contextHud.updateFrame(0, oldTarget, 'DESERT_SENTINEL', oldWaypoint);
    assert.equal(contextHud.promptBox.classList.contains('hidden'), true);
    assert.equal(contextHud.hintBannerEl.classList.contains('hidden'), true);
    assert.equal(contextHud.topCenter.classList.contains('hidden'), true);
    goto(HOMEWORLD_CAPTAIN);
    contextHud.updateFrame(0, uiActivity.scanNearest(), null, { ...uiActivity.nextObjective(), worldPlane: 'homeworld' });
    assert.equal(contextHud.promptBox.classList.contains('hidden'), false, 'Real watch interactions must remain available');
    assert.equal(contextHud.topCenter.classList.contains('hidden'), true, 'Homeworld must not create a duplicate compass over its header');
    for (const event of ['craft_completed', 'equipment_unlocked', 'drone_delivered', 'side_task_completed', 'level_completed']) {
      uiState._emit(event, {});
      assert.equal(contextHud.toastTimer, 0, 'Background desert events cannot show task feedback on the homeworld');
      assert.equal(contextHud.activeModal, null, 'Background desert completion cannot open a modal in another world');
    }

    const descendants = node => [node, ...node.children.flatMap(descendants)];
    const buttons = () => descendants(contextHud.modalPanel).filter(node => node.tagName === 'BUTTON');
    const buttonText = () => buttons().map(node => node.textContent);
    const clickText = text => {
      const button = buttons().find(node => node.textContent === text);
      assert.ok(button, `Expected real HUD button ${text}`);
      button.click();
    };
    const surveyBeforeSettings = JSON.stringify(uiState.homeworldSurvey);
    contextHud.openPauseModal();
    assert(buttonText().includes('Return to the landing pad (unstuck)'));
    assert(buttonText().includes('Resume homeworld stroll'));
    assert.deepEqual(buttons().filter(button => button.attrs['data-hud-pref'])
      .map(button => button.attrs['data-hud-pref']), ['guideArrow', 'showCompass'],
    'Only preferences with actual homeworld effects are offered');
    buttons().find(button => button.attrs['data-hud-pref'] === 'showCompass').click();
    assert.equal(contextHud.homeworldObjective.classList.contains('hidden'), true);
    buttons().find(button => button.attrs['data-hud-pref'] === 'showCompass').click();
    assert.equal(contextHud.homeworldObjective.classList.contains('hidden'), false, 'The real preference buttons must affect the visible watch pill');
    for (const key of ['timeCycle', 'timeDay', 'timeNight', 'weatherDynamic', 'weatherClear',
      'weatherOvercast', 'weatherSandstorm', 'btnRestartLevel']) {
      assert(!buttonText().includes(uiState.ui(key)), `Homeworld exposes inactive desert control ${key}`);
    }
    assert(!buttonText().some(text => text.includes(uiState.ui('prefWorldLabels')) || text.includes(uiState.ui('prefIdleTips'))));
    for (const key of ['qualityUltra', 'qualityHigh', 'qualityMedium', 'qualityLow', 'langToggle']) assert(buttonText().includes(uiState.ui(key)));
    clickText(uiState.ui('qualityMedium'));
    assert.equal(uiState.settings.quality, 'medium');
    assert.equal(appliedQuality, 'medium');
    const initialMuted = uiState.settings.muted;
    clickText(uiState.ui(initialMuted ? 'audioOff' : 'audioOn'));
    assert.equal(uiState.settings.muted, !initialMuted);
    assert.equal(appliedMuted, !initialMuted);
    clickText(uiState.ui('langToggle'));
    assert.equal(uiState.lang, 'zh');
    assert.equal(contextHud.btnGuide.textContent, '📖 巡检手账 [C]');
    assert(buttonText().includes('返回停机坪（脱困）'));
    assert(!buttonText().includes('Return to the landing pad (unstuck)'));
    assert.equal(JSON.stringify(uiState.homeworldSurvey), surveyBeforeSettings, 'Global settings preserve watch progress');
    const desktopText = descendants(contextHud.modalPanel).map(node => node.textContent).join('\n');
    assert(!desktopText.includes('持续功耗'), 'Desktop settings need no phone power hint');
    document.body.classList.add('touch-active');
    contextHud.openPauseModal();
    const phoneText = descendants(contextHud.modalPanel).map(node => node.textContent).join('\n');
    assert(phoneText.includes(uiState.ui('qualityMedium')) && phoneText.includes('持续功耗更高'), 'Touch quality advice uses the actual balanced-preset name');
    assert(!phoneText.includes('温度') && !phoneText.includes('降温'), 'Power advice cannot claim device telemetry or cooling guarantees');
    clickText(uiState.ui('langToggle'));
    const englishPhoneText = descendants(contextHud.modalPanel).map(node => node.textContent).join('\n');
    assert(englishPhoneText.includes(uiState.ui('qualityMedium')) && englishPhoneText.includes('draw more power'), 'Phone power advice must also follow the English locale');
    assert(!englishPhoneText.includes('持续功耗'), 'Previous-language phone advice cannot survive a language switch');
    clickText(uiState.ui('langToggle'));
    clickText('返回停机坪（脱困）');
    assert.equal(unstuckCalls, 1, 'Homeworld unstuck must retain the original action callback');
    assert.equal(contextHud.activeModal, null);
    document.body.classList.remove('touch-active');
    contextHud.inHomeworldRoamMode = false;
    contextHud._renderWorkbenchBody = () => {};
    contextHud.openRecipeGuide();
    assert.equal(contextHud.activeModal, 'station', 'Returning to the desert retains the original recipe guide');
    assert.equal(contextHud.workbenchMode, 'handbook');

    const cargoState = makeState();
    cargoState.launchedHome = true;
    cargoState.currentLevel = LEVELS.length;
    cargoState._addItem('iron_scrap', 4);
    cargoState._addItem('lithium_salt', 2);
    const cargoHud = new HudController(new Element('div'), cargoState, {
      playUiClick() {}, playModalClose() {}, playCraftComplete() {},
      playRepairInstall() {}, playFacilityActivate() {}, playRobotChirp() {}, setMuted() {}
    }, {});
    cargoHud.noteWorldFocus('desert', 58, 58);
    const deepText = (node) => `${node.text || ''}${node.children.map(deepText).join('')}`;
    assert(cargoHud.invHeaderEl.textContent.includes('盐湖'), `Cargo header must name the ground underfoot, got ${cargoHud.invHeaderEl.textContent}`);
    const sceneChips = cargoHud.invGridEl.children.filter((node) => {
      const text = deepText(node);
      return text.includes('锂卤') || text.includes('废铁');
    });
    assert.equal(sceneChips.length, 2);
    assert(deepText(sceneChips[0]).includes('锂卤') && sceneChips[0].className.includes('current-zone'));
    assert(deepText(sceneChips[1]).includes('废铁') && sceneChips[1].className.includes('reserve-zone'),
      'Earlier-biome scrap must stay in reserve while standing on the salt flats');
    const saltStep = cargoHud.stepsContainer.children.find((row) => deepText(row).includes('晶化盐湖'));
    assert(saltStep && saltStep.className.includes('here'), 'The beacon for the region underfoot is the active expedition step');
    cargoHud.noteWorldFocus('homeworld', 0, 0);
    cargoHud.setHomeworldRoamVisible(true);
    assert(cargoHud.topLeft.classList.contains('hidden'));
    assert(cargoHud.hwMissionWrap && !cargoHud.hwMissionWrap.classList.contains('hidden'));
    assert(cargoHud.hwTitleEl.textContent.includes('家园') || cargoHud.hwTitleEl.textContent.includes('Homeworld') || cargoHud.hwTitleEl.textContent.includes('翡翠'),
      cargoHud.hwTitleEl.textContent);

    // Multi-hop World Transition Audit: Desert -> Homeworld -> Desert -> Homeworld
    // Verify that switching scenes updates activeWorldPlane, regional cargo headers,
    // mission steps (.here), cross-world telemetry links, ship return button, and
    // compass/objective pills synchronously without stale state!
    cargoState.syncPostGameWorldTransition('desert');
    assert.equal(cargoState.activeWorldPlane, 'desert');
    cargoHud.noteWorldFocus('desert', 4.8, 5.8);
    cargoHud.setHomeworldRoamVisible(false);
    cargoHud.setHudVisible(true);
    cargoHud.renderAll();
    assert.equal(cargoHud.inHomeworldRoamMode, false);
    assert.equal(cargoHud.topLeft.classList.contains('hidden'), false);
    assert.equal(cargoHud.hwMissionWrap.classList.contains('hidden'), true);
    assert.equal(cargoHud.hwTitleEl.textContent, '', 'Homeworld title must be cleared when returning to Desert');
    assert(cargoHud.invHeaderEl.textContent.includes('坠机盆地'), `Returning to Desert hub must immediately restore Crash Site region focus, got ${cargoHud.invHeaderEl.textContent}`);
    assert(cargoHud.levelTitleEl.textContent.includes('终局科考'), `Desert mission card must show Post-Game Expedition title, got ${cargoHud.levelTitleEl.textContent}`);
    assert(deepText(cargoHud.shipHomeworldWrap).includes('返回翡翠母星'), 'Desert ship status card must offer a direct Return to Homeworld button in post-game');
    assert(deepText(cargoHud.sideListEl).includes('母星翡翠河谷首轮巡检'), 'Desert post-game side tasks must track Homeworld Watch progress');

    // Progress a Desert climate beacon while in Desert, then switch back to Homeworld
    const beaconRes = cargoState.activateMechanism('weather_beacons', 'wbeacon_canyon');
    assert.equal(beaconRes.ok, true);
    cargoState.setWorldPlane('homeworld');
    assert.equal(cargoState.activeWorldPlane, 'homeworld');
    cargoHud.noteWorldFocus('homeworld', 0, 6.9);
    cargoHud.setHudVisible(false);
    cargoHud.setHomeworldRoamVisible(true);
    cargoHud.renderAll();
    assert.equal(cargoHud.inHomeworldRoamMode, true);
    assert.equal(cargoHud.topLeft.classList.contains('hidden'), true);
    assert.equal(cargoHud.levelTitleEl.textContent, '', 'Desert mission title must be cleared when entering Homeworld');
    assert(cargoHud.hwTitleEl.textContent.includes('母星') || cargoHud.hwTitleEl.textContent.includes('家园'), 'Homeworld mission card must immediately repopulate on re-entry');
    assert(deepText(cargoHud.hwTelemetryListEl).includes('1/5'), 'Desert beacon activation must immediately reflect in Homeworld cross-world telemetry links (1/5)');
    assert(deepText(cargoHud.hwArchiveGrid).includes('1/5'), 'Homeworld archive grid must reflect updated Planetary Telemetry Atlas progress (1/5)');

    // -------------------------------------------------------------------------
    // Homeworld Atmosphere Switcher Verification (5-step Watch + >=3 Desert Climate Beacons)
    // -------------------------------------------------------------------------
    assert.equal(cargoState.isHomeworldAtmosphereUnlocked(), false, 'Atmosphere switcher must stay locked before Watch completion and 3+ beacons');
    assert.equal(cargoState.setHomeworldAtmosphere('sunset'), false, 'Locked atmosphere switcher must reject non-dawn modes');
    assert.equal(cargoState.getHomeworldAtmosphere(), 'dawn');

    // Complete 5-step Homeworld Watch on cargoState (only 1 beacon active so far -> still locked!)
    cargoState.acceptHomeworldSurvey();
    for (const lm of HOMEWORLD_LANDMARKS) cargoState.recordHomeworldLandmark(lm.id);
    for (const step of ['intake', 'stabilize', 'connect']) cargoState.calibrateHomeworldRelay(step);
    cargoState.completeHomeworldSurvey();
    assert.equal(cargoState.homeworldSurvey.completed, true);
    assert.equal(cargoState.isHomeworldAtmosphereUnlocked(), false, 'Atmosphere switcher requires at least 3 desert climate beacons');

    // Activate 2nd and 3rd desert climate beacons -> unlocks Homeworld Atmosphere Switcher!
    cargoState.activateMechanism('weather_beacons', 'wbeacon_ridge');
    assert.equal(cargoState.isHomeworldAtmosphereUnlocked(), false, '2 beacons still locked');
    cargoState.activateMechanism('weather_beacons', 'wbeacon_gorge');
    assert.equal(cargoState.isHomeworldAtmosphereUnlocked(), true, '5-step Watch + 3 Climate Beacons must unlock Homeworld Atmosphere Switcher!');

    cargoHud.renderAll();
    assert(deepText(cargoHud.hwViewBtnWrap).includes('黄金晚霞') && deepText(cargoHud.hwViewBtnWrap).includes('星河晴夜'),
      'Unlocked Homeworld HUD card must display Golden Sunset & Starry Night buttons');

    // Verify 3D Observatory Console [E] cycles atmosphere: dawn -> sunset -> night -> dawn
    const obsPoint = HOMEWORLD_LANDMARKS.find((p) => p.id === 'observatory');
    const obsRobot = {
      worldPlane: 'homeworld',
      position: { x: obsPoint.x, y: getHomeworldGroundHeight(obsPoint.x, obsPoint.z), z: obsPoint.z },
      triggerAction() {}
    };
    const obsActivity = new HomeworldActivitySystem(
      cargoState,
      obsRobot,
      { playFacilityActivate() {}, playRobotChirp() {} },
      { showToast: (msg, style) => cargoHud.showToast(msg, style) }
    );
    const obsTarget = obsActivity.scanNearest();
    assert.equal(obsTarget?.id, 'observatory');
    assert(obsTarget.prompt.includes('切换母星天象'), `Observatory prompt should offer atmosphere cycling once unlocked, got ${obsTarget.prompt}`);

    const c1 = obsActivity.triggerPrimary();
    assert.equal(c1.ok, true);
    assert.equal(c1.atmosphereMode, 'sunset');
    assert.equal(cargoState.getHomeworldAtmosphere(), 'sunset');

    const c2 = obsActivity.triggerPrimary();
    assert.equal(c2.atmosphereMode, 'night');
    assert.equal(cargoState.getHomeworldAtmosphere(), 'night');

    const c3 = obsActivity.triggerPrimary();
    assert.equal(c3.atmosphereMode, 'dawn');
    assert.equal(cargoState.getHomeworldAtmosphere(), 'dawn');

    // Verify Pause Modal exposes the 3 atmosphere buttons when unlocked on Homeworld
    cargoHud.openPauseModal();
    const pauseAtmoText = deepText(cargoHud.modalPanel);
    assert(pauseAtmoText.includes('黄金晚霞') && pauseAtmoText.includes('星河晴夜'),
      'Homeworld pause modal must expose Dawn / Sunset / Night atmosphere buttons once unlocked');
    cargoHud.closeModal();

    // VerifyAtmosphereSystem.updateHomeworld + PlanarReflectionSystem + Monument Star Crest across modes
    const hwScene = new THREE.Scene();
    hwScene.fog = new THREE.FogExp2('#b8e6f8', 0.00055);
    hwScene.background = new THREE.Color('#b8e6f8');
    const skyDome = createSkyDome();
    const sunLight = new THREE.DirectionalLight('#fff6df', 2.68);
    const hemiLight = new THREE.HemisphereLight('#c8ebff', '#4c7d42', 0.68);
    const waterUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff6df') },
      uSunsetFactor: { value: 0 },
      uNightFactor: { value: 0 }
    };
    const mockRenderer = {
      renderCount: 0,
      shadowMap: { autoUpdate: true },
      getDrawingBufferSize: (v) => v.set(1280, 720),
      getRenderTarget: () => null,
      setRenderTarget() {},
      clear() {},
      render() { this.renderCount++; }
    };
    const planarReflection = new PlanarReflectionSystem(mockRenderer, hwScene);
    planarReflection.setQuality('high', false);
    // Register both a desert pool (Y=0) and the Homeworld pond (Y=420.012)
    planarReflection.createBrinePool({ x: 0, y: 0, z: 0, radiusX: 5, radiusZ: 5 });
    const hwGroup = new THREE.Group();
    hwGroup.position.set(0, 420, 0);
    hwScene.add(hwGroup);
    const pondGeo = new THREE.PlaneGeometry(9.2, 8.4);
    pondGeo.rotateX(-Math.PI / 2);
    const pondMesh = new THREE.Mesh(pondGeo, new THREE.MeshBasicMaterial());
    pondMesh.position.set(11.4, 0.012, -4.6);
    hwGroup.add(pondMesh);
    const hwPoolRec = planarReflection.registerWaterSurface(pondMesh, waterUniforms, 26.0);

    const envDay = new THREE.Texture();
    const envNight = new THREE.Texture();
    const envHome = new THREE.Texture();
    let headlampVal = 0;
    const atmoSys = new AtmosphereSystem({
      state: cargoState,
      scene: hwScene,
      environments: { desert: envDay, desertNight: envNight, homeworld: envHome },
      world: {
        skyDome,
        sunLight,
        hemiLight,
        planarReflection,
        _sunOffset: new THREE.Vector3(38, 66, 32),
        spacecraft: { homeworldActivityVisuals: { waterUniforms } }
      },
      robot: { setNightHeadlamp: (s) => { headlampVal = s; } },
      postProcessing: null,
      sound: null,
      weatherParticles: null
    });

    const hwCam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 900);
    hwCam.position.set(11.4, 424.2, 6.5);
    hwCam.lookAt(11.4, 420.0, -4.6);
    hwCam.updateProjectionMatrix();

    // Mode 1: Sunset (snapped while paused)
    cargoState.setHomeworldAtmosphere('sunset');
    atmoSys.updateHomeworld(0.016, 10.0, hwCam, true);
    assert.ok(waterUniforms.uSunsetFactor.value > 0.95, 'Sunset mode must drive waterUniforms.uSunsetFactor to 1');
    assert.ok(skyDome.uniforms.uNightFactor.value > 0.15 && skyDome.uniforms.uNightFactor.value < 0.35, 'Sunset mode must set twilight sky nightFactor');
    assert.equal(hwScene.environment, envHome, 'Sunset keeps warm Homeworld IBL probe');

    // Mode 2: Starry Night (snapped while paused)
    cargoState.setHomeworldAtmosphere('night');
    atmoSys.updateHomeworld(0.016, 12.0, hwCam, true);
    assert.ok(waterUniforms.uNightFactor.value > 0.95, 'Night mode must drive waterUniforms.uNightFactor to 1');
    assert.ok(skyDome.uniforms.uNightFactor.value > 0.95, 'Night mode must enable full Milky Way starfield & ringed planet on Homeworld');
    assert.equal(hwScene.environment, envNight, 'Night mode must swap to nocturnal PMREM probe');
    assert.ok(headlampVal > 0.9, 'Night mode must automatically illuminate Milo headlamp on Homeworld');

    // PlanarReflection on Homeworld: selects Homeworld pond (Y=420.012), never desert pool (Y=0)
    planarReflection.update(12.0, hwCam, true);
    assert.equal(planarReflection.activePool, hwPoolRec, 'PlanarReflection must select Homeworld pond when camera is at Y=424');
    assert.equal(planarReflection.sharedUniforms.uReflActive.value, 1);
    assert.equal( planarReflection.pools[0].uniforms.uIsCurrentPlane.value, 0, 'Desert pool at Y=0 must remain inactive while on Homeworld');

    // Monument Star Crest emissive amplification across Dawn / Sunset / Night
    const enhGroup = new THREE.Group();
    const enhAnim = buildHomeworldEnhancements(enhGroup, []);
    updateHomeworldEnhancements(enhAnim, 10.0, 0.016, { surveyCompleted: true, atmoMode: 'dawn' });
    const dawnEmissive = enhAnim.monumentStarRig.userData.goldMat.emissiveIntensity;
    updateHomeworldEnhancements(enhAnim, 10.0, 0.016, { surveyCompleted: true, atmoMode: 'sunset' });
    const sunsetEmissive = enhAnim.monumentStarRig.userData.goldMat.emissiveIntensity;
    updateHomeworldEnhancements(enhAnim, 10.0, 0.016, { surveyCompleted: true, atmoMode: 'night' });
    const nightEmissive = enhAnim.monumentStarRig.userData.goldMat.emissiveIntensity;
    assert.ok(sunsetEmissive > dawnEmissive && nightEmissive > sunsetEmissive,
      `Monument star crest must shine brighter in sunset (${sunsetEmissive}) and night (${nightEmissive}) than dawn (${dawnEmissive})`);

    // --- Map Expansion, Aerial Flight & Anti-Tedium Gameplay Loops ---
    assert.equal(HOMEWORLD_CONFIG.playRadius, 82, 'Homeworld playRadius must be expanded to 82m');
    assert.equal(HOMEWORLD_ELEVATED_PLATFORMS.length, 4, 'Homeworld must expose 4 elevated aerial terraces');
    assert.equal(HOMEWORLD_UPDRAFT_THERMALS.length, 4, 'Homeworld must expose 4 updraft thermal columns');
    assert.equal(HOMEWORLD_AERIAL_RINGS.length, 8, 'Homeworld must expose 8 aerial photon rings');

    const wfPlat = HOMEWORLD_ELEVATED_PLATFORMS.find((p) => p.id === 'hw_plat_waterfall');
    assert.ok(wfPlat && getHomeworldElevatedPlatformAt(wfPlat.x, wfPlat.z, -0.06)?.id === 'hw_plat_waterfall');
    const mockController = Object.create(RobotController.prototype);
    mockController.worldPlane = 'homeworld';
    mockController.state = cargoState;
    assert.equal(mockController.getSupportHeightAt(wfPlat.x, wfPlat.z, wfPlat.topY), wfPlat.topY,
      'RobotController.getSupportHeightAt must land on Homeworld elevated waterfall terrace');

    // Clearing all 8 Emerald Valley Photon Rings unlocks Golden Starburst Jetflame
    const ringState = new GameState();
    states.push(ringState);
    for (let i = 0; i < HOMEWORLD_AERIAL_RINGS.length - 1; i++) {
      const rRes = ringState.recordHomeworldFlightRing(HOMEWORLD_AERIAL_RINGS[i].id);
      assert.equal(rRes.unlockedJetflame, false);
    }
    const finalRingRes = ringState.recordHomeworldFlightRing(HOMEWORLD_AERIAL_RINGS[7].id);
    assert.equal(finalRingRes.unlockedJetflame, true);
    assert.equal(ringState.cosmetics.golden_jetflame, true, 'All 8 rings must unlock golden_jetflame');
    const ringProg = ringState.getHomeworldProgress();
    assert.equal(ringProg.flightRingsDone, 8);
    assert.equal(ringProg.flightRingsTotal, 8);
    assert.ok(ringProg.archives.some((a) => a.id === 'hw_item_jetflame' && a.unlocked));

    // Sonar Resonance Strike (+2 bonus yield with drill) & Weather Beacon Overdrive
    const loopState = new GameState();
    states.push(loopState);
    loopState.currentLevel = 2;
    loopState.equipment.drill = true;
    const scanRes = loopState.triggerSonarScan(0, 0, 50);
    assert.equal(scanRes.ok, true);
    assert.ok(loopState.sonarResonanceTimer > 0, 'triggerSonarScan must open Sonar Resonance Strike window');
    const starterNode = RESOURCE_NODES.find((n) => !n.subsurface && !n.elevated && !n.requiresMechanism && n.region === 'crash_basin');
    const harvestRes = loopState.harvestNode(starterNode.id);
    assert.equal(harvestRes.ok, true);
    assert.equal(harvestRes.resonanceBonus, 2, 'Drill-equipped Sonar Resonance Strike must grant +2 bonus yield');
    loopState.craftingQueue.push({ recipeId: 'recipe_refined_quartz', station: 'furnace', remaining: 10 });
    const odRes = loopState.applyWeatherOverdrive(24);
    assert.equal(odRes.ok, true);
    assert.equal(odRes.completedCount, 1, 'Weather Overdrive must surge and complete queued crafting');

    // Sky Plaques (3 outer terraces) & Emerald Sky-Trial best time persistence
    assert.equal(HOMEWORLD_SKY_PLAQUES.length, 3, '3 outer aerial terraces must have sky plaques');
    for (const pl of HOMEWORLD_SKY_PLAQUES) {
      ringState.recordHomeworldSkyPlaque(pl.id);
    }
    const plaqueProg = ringState.getHomeworldProgress();
    assert.equal(plaqueProg.skyPlaquesDone, 3);
    assert.ok(plaqueProg.archives.some((a) => a.id === 'hw_item_plaques' && a.unlocked));

    const t1 = ringState.recordHomeworldSkyTrial(28.5);
    assert.equal(t1.isNewBest, true);
    assert.equal(t1.bestSec, 28.5);
    const t2 = ringState.recordHomeworldSkyTrial(32.0);
    assert.equal(t2.isNewBest, false);
    assert.equal(t2.bestSec, 28.5, 'Slower trial must not overwrite faster bestRingTrialSec');
    const t3 = ringState.recordHomeworldSkyTrial(21.4);
    assert.equal(t3.isNewBest, true);
    assert.equal(t3.bestSec, 21.4);

    // HomeworldActivitySystem startSkyTrial -> 8 rings completion
    const trialRobot = {
      worldPlane: 'homeworld',
      position: new THREE.Vector3(0, 420, 0),
      triggerAction: () => {},
      triggerAerialRingBoost: () => {}
    };
    const trialSys = new HomeworldActivitySystem(ringState, trialRobot, { playGather: () => {}, playFacilityActivate: () => {} }, {});
    trialSys.startSkyTrial();
    assert.equal(trialSys.skyTrialActive, true);
    trialSys.skyTrialElapsed = 7.5;
    trialSys.skyTrialRingsHit.add(HOMEWORLD_AERIAL_RINGS[0].id);
    // Calling startSkyTrial while active must cleanly restart timer & ring set
    trialSys.startSkyTrial();
    assert.equal(trialSys.skyTrialElapsed, 0);
    assert.equal(trialSys.skyTrialRingsHit.size, 0);

    // Nursery Cross-World Transplant (Bioluminescent Star-Flora)
    const bloomFail = ringState.bloomHomeworldNursery();
    assert.equal(bloomFail.ok, false);
    assert.equal(bloomFail.reason, 'missing_crystals');
    ringState.inventory.raw_quartz = 3;
    const bloomOk = ringState.bloomHomeworldNursery();
    assert.equal(bloomOk.ok, true);
    assert.equal(ringState.inventory.raw_quartz, 1);
    assert.equal(ringState.homeworldSurvey.nurseryBloomed, true);
    assert.ok(ringState.getHomeworldProgress().archives.some((a) => a.id === 'hw_item_starflora' && a.unlocked));
    updateHomeworldEnhancements(enhAnim, 10.0, 0.016, {
      surveyCompleted: true,
      atmoMode: 'night',
      flightRingsMap: ringState.homeworldSurvey.flightRings,
      skyTrialHitSet: trialSys.skyTrialRingsHit,
      nurseryBloomed: true
    });
    assert.equal(enhAnim.nurseryFloraGroup.visible, true, 'Nursery Star-Flora must illuminate when nurseryBloomed is true');

    for (const r of HOMEWORLD_AERIAL_RINGS) {
      trialRobot.position.set(r.x, HOMEWORLD_CONFIG.baseY + r.yOffset, r.z);
      trialSys.checkAerialCourse(0.5);
    }
    assert.equal(trialSys.skyTrialActive, false, 'Completing all 8 rings must finish Sky-Trial');
    assert.ok(ringState.homeworldSurvey.bestRingTrialSec < 21.4, '4.0s simulated 8-ring run must set new best record');

    console.log('✓ Homeworld captain → three records → ordered relay → report/reward, save migration, range locks and touch/HUD interactions verified.');
    console.log('✓ Homeworld HUD/guide/settings isolate desert content, preserve global options and apply the next-stop preference and mobile quality advice.');
  } finally {
    for (const state of states) state.flushSave();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) verifyHomeworldActivities();
