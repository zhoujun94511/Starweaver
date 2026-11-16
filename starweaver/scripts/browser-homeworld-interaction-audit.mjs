// Node >=22. ARTEMIS and phone-CDP exploration verified these controls before
// this script was authored. Uses an ephemeral desktop CDP tab; no screenshots.
// Approach-point teleports and post-game scene entry are WHITE-BOX setup, not
// evidence of a complete walking route or of completing the seven main levels.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { HOMEWORLD_CAPTAIN, HOMEWORLD_LANDMARKS, createHomeworldSurvey } from '../src/data/homeworldActivities.js';
import { getHomeworldGroundHeight } from '../src/data/homeworldData.js';
import { UI_STRINGS } from '../src/data/i18n.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = option('--port', '9231');
const url = option('--url', 'http://127.0.0.1:4175/index.html');
const output = option('--output', '../plans/browser-homeworld-interaction.json');
const origin = new URL(url).origin;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const exceptions = [], consoleErrors = [];
const report = {
  port, url, startedAt: new Date().toISOString(),
  scope: 'Real DOM, touch and keyboard homeworld mission and original global-settings interactions after white-box scene entry and approach teleports. No screenshots; no claim of walking the route or main-campaign completion.',
  exploration: 'ARTEMIS hierarchy plus phone CDP touch verified captain, journal close, three context readings, ordered console and delivery before authoring.',
  steps: [], modalBounds: [], teleports: [], globalSettings: []
};

async function connect(webSocketUrl, captureErrors = false) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const operation = pending.get(message.id);
      if (!operation) return;
      pending.delete(message.id);
      clearTimeout(operation.timer);
      if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
      else operation.resolve(message.result);
    } else if (captureErrors && message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params.exceptionDetails);
    } else if (captureErrors && message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      consoleErrors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    } else if (captureErrors && message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      consoleErrors.push(message.params.entry.text);
    }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(`${method} timed out`)); }, 45000);
    pending.set(key, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: key, method, params }));
  });
  const evaluate = async expression => {
    const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  };
  return { call, evaluate, close: () => socket.close() };
}

const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const sourcePage = tabs.find(tab => tab.type === 'page' && tab.url.startsWith(origin));
assert(sourcePage, 'Open the requested game origin in the desktop CDP browser first');
const source = await connect(sourcePage.webSocketDebuggerUrl);
const nativeMobile = await source.evaluate('navigator.userAgentData?.mobile===true||/Android|iPhone|iPad/.test(navigator.userAgent)');
report.nativeMobile = nativeMobile;
let page, testTargetId, sourceFrozen = false, originalStorage, originalMemory;
let viewport = { width: 390, height: 844, touch: true };
const allViewports = [viewport, { width: 844, height: 390, touch: true },
  { width: 1024, height: 768, touch: true }, { width: 1920, height: 1080, touch: nativeMobile }];
const app = 'window.__LBH_APP__';
const until = async (expression, timeout = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await page.evaluate(expression)) return;
    await pause(100);
  }
  throw new Error(`Condition timed out: ${expression}`);
};
const note = (label, details = {}) => {
  report.steps.push({ label, ...details });
  console.log(JSON.stringify({ label, ...details }));
};

async function setViewport(value) {
  viewport = value;
  await page.call('Emulation.setTouchEmulationEnabled', { enabled: value.touch, maxTouchPoints: value.touch ? 5 : 1 });
  await page.call('Emulation.setDeviceMetricsOverride', {
    width: value.width, height: value.height, screenWidth: value.width, screenHeight: value.height,
    deviceScaleFactor: 1, mobile: value.touch
  });
  await until(`innerWidth===${value.width}&&innerHeight===${value.height}&&Math.abs(${app}.camera.aspect-${value.width / value.height})<0.001`);
  await pause(160); // Resize RAF and CSS layout must settle before hit testing.
}

async function press(code, key, keyCode) {
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
  await page.call('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode });
}

async function clickNode(expression, label) {
  await page.evaluate(`(${expression})?.scrollIntoView({block:'center',inline:'nearest'})`);
  // Drawers animate for 240ms. Wait for the real input target after scrolling
  // and animation, rather than treating activeModal assignment as visibility.
  try { await until(`(() => {
    const n=${expression};if(!n||n.disabled)return false;
    const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&
      r.top>=-1&&r.bottom<=innerHeight+1&&!!hit&&n.contains(hit);
  })()`, 5000); } catch (error) {
    const diagnostic = await page.evaluate(`(() => {
      const n=${expression},r=n?.getBoundingClientRect(),hit=r&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return {viewport:[innerWidth,innerHeight],node:n?.textContent,bounds:r?.toJSON(),hit:hit?.className,
        parent:n?.parentElement?.getBoundingClientRect().toJSON()};
    })()`);
    throw new Error(label+' '+JSON.stringify(diagnostic), {cause:error});
  }
  const point = await page.evaluate(`(() => {
    const node=${expression};
    if(!node||node.disabled)throw new Error('Missing or disabled control: '+${JSON.stringify(label)});
    node.scrollIntoView({block:'center',inline:'nearest'});
    const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    const hit=document.elementFromPoint(x,y);
    if(r.width<=0||r.height<=0||x<0||x>innerWidth||y<0||y>innerHeight||!hit||!node.contains(hit))
      throw new Error('Control is not reachable by input: '+${JSON.stringify(label)}+
        JSON.stringify({bounds:{x:r.x,y:r.y,width:r.width,height:r.height},hit:hit?.className,text:node.textContent}));
    return {x,y};
  })()`);
  if (viewport.touch) {
    await page.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 0, radiusX: 4, radiusY: 4, force: 1 }] });
    await pause(65);
    await page.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await page.call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  }
  await pause(110);
}

async function teleport(point) {
  const y = getHomeworldGroundHeight(point.x, point.z);
  await page.evaluate(`(() => {
    const a=${app},r=a.robot;
    a.cameraCtrl.clearShowcase();a.keys.clear();a.touchControls.resetInputState();
    r.worldPlane='homeworld';r.position.set(${point.x},${y},${point.z});
    r.vy=0;r.isGrounded=true;r.isJetpacking=false;r.jetFuel=r.maxJetFuel;
    r.yaw=0;r.syncPositionToMesh(${y},0);
    a.cameraCtrl.snapToPose(a.cameraCtrl.getDesiredFollowPose(r.position));
  })()`);
  await until(`${app}.homeworldActivities.scanNearest()?.id===${JSON.stringify(point.id)}`);
  await until(`performance.now()-${app}.touchControls._lastActionAt>=190`);
  report.teleports.push({ id: point.id, x: point.x, y, z: point.z, method: 'white-box approach-point teleport' });
}

async function contextAction() {
  await until(`${app}.touchControls._visibleAllowed&&!${app}.hud.isBlockingGameplay()&&performance.now()-${app}.touchControls._lastActionAt>=190`);
  await clickNode(`${app}.touchControls.btnAct`, 'nearby homeworld context action');
}

async function closeModal() {
  await clickNode(`${app}.hud.modalPanel.querySelector('.modal-header button')`, 'modal close');
  await until(`${app}.hud.activeModal===null`);
}

async function checkLocale(expected, label) {
  const result = await page.evaluate(`(() => {
    const a=${app};return {lang:a.state.lang,modal:a.hud.modalPanel.innerText,
      bar:a.hud.homeworldBar.innerText,prompt:a.hud.promptBox.innerText};
  })()`);
  assert.equal(result.lang, expected);
  if (expected === 'en') {
    assert(!/[\u4e00-\u9fff]/.test(result.modal), `${label}: Chinese text remains in the English modal`);
    assert(!/[\u4e00-\u9fff]/.test(result.bar), `${label}: Chinese text remains in the English homeworld bar`);
  } else {
    assert(/[\u4e00-\u9fff]/.test(result.modal), `${label}: Chinese modal content is missing`);
    assert(!/\b(?:Watch|Power|Mira|Medallion|Northwest|Eastern|Riverside|Sequence|Intake|Voltage|Colony)\b/.test(result.modal), `${label}: English mission text remains in the Chinese modal`);
  }
  note(`locale-${label}`, { lang: expected });
}

async function modalAcrossViewports(label) {
  const original = viewport;
  for (const value of allViewports) {
    await setViewport(value);
    const geometry = await page.evaluate(`(() => {
      const a=${app},p=a.hud.modalPanel;
      p.scrollTop=0;
      const r=p.getBoundingClientRect();
      const controls=[...p.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>{
        b.scrollIntoView({block:'center',inline:'nearest'});
        const q=b.getBoundingClientRect(),pr=p.getBoundingClientRect();
        return {text:b.textContent,disabled:b.disabled,left:q.left,right:q.right,top:q.top,bottom:q.bottom,
          withinViewport:q.left>=-1&&q.right<=innerWidth+1&&q.top>=-1&&q.bottom<=innerHeight+1,
          withinPanel:q.left>=pr.left-1&&q.right<=pr.right+1&&q.top>=pr.top-1&&q.bottom<=pr.bottom+1};
      });
      p.scrollTop=0;
      const bar=a.hud.homeworldBar.getBoundingClientRect();
      return {label:${JSON.stringify(label)},modal:a.hud.activeModal,width:innerWidth,height:innerHeight,
        panel:{left:r.left,right:r.right,top:r.top,bottom:r.bottom,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight},
        bar:{left:bar.left,right:bar.right,height:bar.height},controls};
    })()`);
    report.modalBounds.push(geometry);
    const r = geometry.panel;
    assert(r.left >= -1 && r.top >= -1 && r.right <= value.width + 1 && r.bottom <= value.height + 1, `${label}: modal extends beyond ${value.width}x${value.height}`);
    assert(r.scrollWidth <= r.clientWidth + 1, `${label}: modal has horizontal overflow at ${value.width}x${value.height}`);
    assert(geometry.controls.length > 0, `${label}: no modal controls found`);
    assert(geometry.controls.every(button => button.withinViewport && button.withinPanel), `${label}: a control is unreachable after scrolling at ${value.width}x${value.height}`);
    assert(geometry.bar.left >= -1 && geometry.bar.right <= value.width + 1, 'Homeworld bar extends beyond the viewport');
    if (value.touch) assert(geometry.bar.height <= 72, `Compact homeworld bar exceeds 72px at ${value.width}x${value.height}`);
  }
  await setViewport(original);
  note(`bounds-${label}`, { viewports: allViewports.map(value => `${value.width}x${value.height}`), verticalScrollAllowed: true });
}

async function toggleLanguage(expected) {
  await press('Escape', 'Escape', 27);
  await until(`${app}.hud.activeModal==='pause'`);
  await clickNode(`[...${app}.hud.modalPanel.querySelectorAll('button')].find(b=>b.textContent===${app}.state.ui('langToggle'))`, 'language toggle in settings');
  await until(`${app}.state.lang===${JSON.stringify(expected)}`);
  await press('Escape', 'Escape', 27);
  await until(`${app}.hud.activeModal===null`);
}

const settingsButton = key => `[...${app}.hud.modalPanel.querySelectorAll('button')].find(b=>b.textContent===${app}.state.ui(${JSON.stringify(key)}))`;

async function assertSettingsLocale(expected) {
  const result = await page.evaluate(`(() => {
    const a=${app},p=a.hud.modalPanel,copy=p.cloneNode(true);
    // A language selector intentionally names the other language. Exclude only
    // that control; every actual settings label must use the active locale.
    for(const b of copy.querySelectorAll('button'))if(b.textContent===a.state.ui('langToggle'))b.remove();
    return {lang:a.state.lang,text:copy.textContent,muted:a.state.settings.muted};
  })()`);
  assert.equal(result.lang, expected);
  const required = ['btnPause', 'qualityLabel', 'qualityUltra', 'qualityHigh',
    'qualityMedium', 'qualityLow',
    'btnResetGame', result.muted ? 'audioOff' : 'audioOn'];
  const other = expected === 'en' ? 'zh' : 'en';
  for (const key of required) {
    assert(result.text.includes(UI_STRINGS[expected][key]), `${expected} settings missing ${key}`);
    assert(!result.text.includes(UI_STRINGS[other][key]), `Settings simultaneously show the other locale's ${key}`);
  }
  if (expected === 'en') assert(!/[\u4e00-\u9fff]/.test(result.text), 'Chinese text leaked into English settings');
  for (const lang of ['zh', 'en']) for (const key of ['envTimeLabel', 'envWeatherLabel', 'btnRestartLevel']) {
    assert(!result.text.includes(UI_STRINGS[lang][key]), `Motherworld settings leaked desert ${key}`);
  }
}

async function auditPausedRendering() {
  await page.evaluate(`(() => {
    const a=${app},original=a.renderer.render,p={calls:0,original};window.__pauseRenderAudit=p;
    a.renderer.render=function(){p.calls++;return original.apply(this,arguments)};
  })()`);
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    const before = await page.evaluate(`({calls:__pauseRenderAudit.calls,time:${app}._totalElapsed})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const after = await page.evaluate(`({calls:__pauseRenderAudit.calls,time:${app}._totalElapsed})`);
    assert.equal(after.calls, before.calls, 'Paused settings must stop scene, shadow and post-processing draws');
    assert.equal(after.time, before.time, 'Paused settings must freeze scene animation time');
    const quality = await page.evaluate(`${app}.state.settings.quality`);
    await clickNode(settingsButton(`quality${quality[0].toUpperCase()}${quality.slice(1)}`), 'refresh selected quality while paused');
    await until('__pauseRenderAudit.calls>' + after.calls);
    await closeModal();
    const resumed = await page.evaluate('__pauseRenderAudit.calls');
    await until('__pauseRenderAudit.calls>' + resumed);
    await clickNode(`${app}.hud.btnPause`, 'reopen settings after render-resume check');
    await until(`${app}.hud.activeModal==='pause'`);
    note('pause-on-demand-rendering', { idleDraws: after.calls - before.calls, idleDurationMs: 1000,
      qualityRepaint: true, resumeRenders: true, sceneTimeFrozen: true });
  } finally {
    await page.evaluate(`${app}.renderer.render=__pauseRenderAudit.original;delete window.__pauseRenderAudit`);
  }
}

async function auditHomeworldGlobalSettings() {
  const originalViewport = viewport;
  const before = await page.evaluate(`(() => {
    const a=${app};return {survey:JSON.stringify(a.state.homeworldSurvey),settings:{...a.state.settings}};
  })()`);
  await page.evaluate(`(() => {
    const a=${app},audit={calls:[],restore:[]};window.__homeworldSettingsAudit=audit;
    for(const[owner,key,label]of [[a.state,'setQuality','quality'],[a.hud.actions,'onQualityChange','applyQuality'],
      [a.state,'setLang','language'],[a.state,'setMuted','audio'],[a.sound,'setMuted','applyAudio'],
      [a.state,'toggleCleanView','cleanView'],[a.state,'setGuideArrow','navigation'],
      [a.state,'setHudPref','hudPreference'],
      [a.hud,'openRecipeGuide','blueprints'],[a.hud,'openPauseModal','settings']]){
      const original=owner[key];if(typeof original!=='function')throw new Error('Missing original method '+label);
      owner[key]=function(...args){audit.calls.push({method:label,args});return original.apply(this,args)};
      audit.restore.push(()=>{owner[key]=original});
    }
  })()`);
  const assertStillHome = async label => {
    const result = await page.evaluate(`(() => {
      const a=${app};return {survey:JSON.stringify(a.state.homeworldSurvey),roam:a.inHomeworldRoam,
        plane:a.robot.worldPlane,visible:a.spacecraft.homeworldGroup.visible,
        toolbarAtHome:a.hud.toolbarRow.parentElement===a.hud.homeworldHeader};
    })()`);
    assert.equal(result.survey, before.survey, `${label}: settings changed homeworld progress`);
    assert.equal(result.roam, true, `${label}: settings left homeworld roam`);
    assert.equal(result.plane, 'homeworld');
    assert.equal(result.visible, true);
    assert.equal(result.toolbarAtHome, true, `${label}: original global toolbar was lost`);
  };
  try {
    for (const value of allViewports) {
      await setViewport(value);
      const controls = value.touch ? ['btnCleanView', 'btnGuide', 'btnPause'] :
        ['btnCleanView', 'btnNavArrow', 'btnGuide', 'btnAudio', 'btnLang', 'btnPause'];
      const entry = await page.evaluate(`(() => {
        const h=${app}.hud;
        return {width:innerWidth,height:innerHeight,originalSettingsButton:h.btnHwPause===h.btnPause,
          toolbarAtHome:h.toolbarRow.parentElement===h.homeworldHeader,
          controls:${JSON.stringify(controls)}.map(key=>{
            const n=h[key],r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
            return {key,text:n.textContent,originalToolbar:h.toolbarRow.contains(n),
              reachable:r.width>0&&r.height>0&&r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1&&!!hit&&n.contains(hit)};
          })};
      })()`);
      assert.equal(entry.originalSettingsButton, true, 'Homeworld must retain the original settings listener');
      assert.equal(entry.toolbarAtHome, true);
      assert(entry.controls.every(c => c.originalToolbar && c.reachable),
        `Global controls hidden/covered at ${value.width}x${value.height}: ${JSON.stringify(entry.controls)}`);
      await clickNode(`${app}.hud.btnPause`, 'original global settings entry on homeworld');
      await until(`${app}.hud.activeModal==='pause'`);
      await assertSettingsLocale('zh');
      const layout = await page.evaluate(`(() => {
        const p=${app}.hud.modalPanel,r=p.getBoundingClientRect();
        const controls=[...p.querySelectorAll('button,input,select')].filter(n=>!n.disabled&&getComputedStyle(n).display!=='none').map(n=>{
          n.scrollIntoView({block:'center',inline:'nearest'});
          const q=n.getBoundingClientRect(),x=q.left+q.width/2,y=q.top+q.height/2,hit=document.elementFromPoint(x,y);
          return {text:n.textContent,reachable:q.width>0&&q.height>0&&q.left>=r.left-1&&q.right<=r.right+1&&q.top>=r.top-1&&q.bottom<=r.bottom+1&&!!hit&&n.contains(hit)};
        });
        p.scrollTop=p.scrollHeight;
        const maxScroll=Math.max(0,p.scrollHeight-p.clientHeight);
        return {panel:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},horizontalOverflow:p.scrollWidth-p.clientWidth,
          maxScroll,scrollTop:p.scrollTop,reachedBottom:p.scrollTop>=maxScroll-1,controls};
      })()`);
      assert(layout.panel.left >= -1 && layout.panel.right <= value.width + 1 &&
        layout.panel.top >= -1 && layout.panel.bottom <= value.height + 1, 'Settings panel is outside the viewport');
      assert(layout.horizontalOverflow <= 1, 'Settings panel has horizontal overflow');
      assert.equal(layout.reachedBottom, true, 'Settings cannot scroll to their final controls');
      assert(layout.controls.every(c => c.reachable), `Settings control covered after scrolling: ${JSON.stringify(layout.controls)}`);
      report.globalSettings.push({ ...entry, modal: layout });
      if (value === allViewports[0]) {
        if (nativeMobile) {
          const initialArrow = await page.evaluate(`${app}.state.settings.guideArrow`);
          await clickNode(`${app}.hud.modalPanel.querySelector('[data-hud-pref="guideArrow"]')`, 'mobile watch direction preference');
          await until(`${app}.state.settings.guideArrow!==${JSON.stringify(initialArrow)}`);
          await clickNode(`${app}.hud.modalPanel.querySelector('[data-hud-pref="guideArrow"]')`, 'restore mobile watch direction preference');
          await until(`${app}.state.settings.guideArrow===${JSON.stringify(initialArrow)}`);
        }
        const targetQuality = before.settings.quality === 'medium' ? 'high' : 'medium';
        const qualityKey = quality => `quality${quality[0].toUpperCase()}${quality.slice(1)}`;
        await clickNode(settingsButton(qualityKey(targetQuality)), 'change quality in shared settings');
        await until(`${app}.state.settings.quality===${JSON.stringify(targetQuality)}`);
        await clickNode(settingsButton(qualityKey(before.settings.quality)), 'restore original quality through shared settings');
        await until(`${app}.state.settings.quality===${JSON.stringify(before.settings.quality)}`);
        await clickNode(settingsButton(before.settings.muted ? 'audioOff' : 'audioOn'), 'toggle sound in shared settings');
        await until(`${app}.state.settings.muted===${!before.settings.muted}`);
        await clickNode(settingsButton(before.settings.muted ? 'audioOn' : 'audioOff'), 'restore sound in shared settings');
        await until(`${app}.state.settings.muted===${Boolean(before.settings.muted)}`);
        await clickNode(settingsButton('langToggle'), 'change shared settings to English');
        await until(`${app}.state.lang==='en'`);
        await assertSettingsLocale('en');
        await clickNode(settingsButton('langToggle'), 'restore shared settings to Chinese');
        await until(`${app}.state.lang==='zh'`);
        await assertSettingsLocale('zh');
        await auditPausedRendering();
      }
      await closeModal();
      const context = await page.evaluate(`(() => {const a=${app};return {
        text:document.body.innerText,waypoint:a.homeworldActivities.nextObjective(),guide:a.hud.btnGuide.textContent,
        controls:a.hud.controlsFooter.textContent};})()`);
      assert.equal(context.waypoint.worldPlane, 'homeworld');
      assert(!/坠机营地|冶炼|铁锭|Kharis|Crafting|Blueprints/.test(context.text), 'Desert gameplay content remains visible on motherworld');
      assert(/巡检|Journal|journal/.test(context.guide), 'Motherworld toolbar must label its field journal');
      await clickNode(`${app}.hud.btnGuide`, 'contextual field journal toolbar control on homeworld');
      await until(`${app}.hud.activeModal==='homeworld_journal'`);
      const journal = await page.evaluate(`${app}.hud.modalPanel.textContent`);
      assert(!/Kharis|坠机营地|熔炼|冶炼|蓝图|铁锭/.test(journal), 'Desert recipes leaked into motherworld journal');
      await closeModal();
      if (!value.touch) {
        for (const [key, stateExpression] of [['btnNavArrow', 'settings.guideArrow'], ['btnAudio', 'settings.muted'], ['btnLang', 'lang']]) {
          const initial = await page.evaluate(`${app}.state.${stateExpression}`);
          await clickNode(`${app}.hud.${key}`, `original desktop ${key}`);
          await until(`${app}.state.${stateExpression}!==${JSON.stringify(initial)}`);
          await clickNode(`${app}.hud.${key}`, `restore original desktop ${key}`);
          await until(`${app}.state.${stateExpression}===${JSON.stringify(initial)}`);
        }
      }
      await assertStillHome(`global controls ${value.width}x${value.height}`);
    }
    await setViewport(originalViewport);
    const initialClean = await page.evaluate(`${app}.state.isCleanViewActive()`);
    await clickNode(`${app}.hud.btnCleanView`, 'original clean-view control on homeworld');
    await until(`${app}.state.isCleanViewActive()===${!initialClean}`);
    await clickNode(`${app}.hud.btnCleanView`, 'restore full/clean view');
    await until(`${app}.state.isCleanViewActive()===${initialClean}`);
    // The existing clean-view toggle changes three preferences together. Restore
    // a previously mixed combination through the real preference buttons.
    await clickNode(`${app}.hud.btnPause`, 'restore original HUD preferences through settings');
    await until(`${app}.hud.activeModal==='pause'`);
    for (const key of ['showCompass']) {
      const enabled = before.settings[key] !== false;
      if (await page.evaluate(`${app}.state.settings.${key}!==false`) !== enabled) {
        await clickNode(`${app}.hud.modalPanel.querySelector('[data-hud-pref="${key}"]')`, `restore ${key}`);
        await until(`(${app}.state.settings.${key}!==false)===${enabled}`);
      }
    }
    await closeModal();
    await assertStillHome('after shared settings return');
    const calls = await page.evaluate('window.__homeworldSettingsAudit.calls');
    for (const name of ['quality', 'applyQuality', 'language', 'audio', 'applyAudio', 'cleanView', nativeMobile ? 'hudPreference' : 'navigation', 'blueprints', 'settings']) {
      assert(calls.some(call => call.method === name), `Original ${name} method was never invoked by its UI control`);
    }
    report.globalSettingsMethodCalls = calls;
    note('original-global-settings-preserved', { viewports: allViewports.map(v => `${v.width}x${v.height}`),
      originalMethods: [...new Set(calls.map(call => call.method))], progressPreserved: true });
  } finally {
    await page.evaluate(`(() => {
      const audit=window.__homeworldSettingsAudit;
      if(audit)for(const restore of audit.restore)restore();delete window.__homeworldSettingsAudit;
    })()`);
    await setViewport(originalViewport);
  }
}

async function returnToDesertWithoutCrossWorldCamera() {
  // The real reward button supplies a live homeworld showcase. A held canvas
  // touch and W key additionally verify that return clears pending input; none
  // of these controller fields are injected through white-box mutation.
  await clickNode(`${app}.hud.homeworldObjective`, 'journal before returning to Kharis');
  await until(`${app}.hud.activeModal==='homeworld_journal'`);
  await clickNode(`${app}.hud.modalPanel.querySelector('button.primary')`, 'start valley view before return');
  await until(`${app}.hud.activeModal===null&&!!${app}.cameraCtrl.showcase`);
  if (await page.evaluate(`${app}.hud.homeworldBarTitle.getAttribute('aria-expanded')!=='true'`)) {
    await clickNode(`${app}.hud.homeworldBarTitle`, 'expand homeworld return menu');
  }
  const canvasPoint = await page.evaluate(`(() => {
    const canvas=${app}.renderer.domElement,r=canvas.getBoundingClientRect();
    const x=r.left+r.width*.5,y=r.top+r.height*.48;
    if(document.elementFromPoint(x,y)!==canvas)throw new Error('Canvas hold point is covered by UI');
    return {x,y};
  })()`);
  await page.call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...canvasPoint, id: 23, radiusX: 4, radiusY: 4, force: 1 }] });
  await until(`${app}.cameraCtrl._activePointers.size>0`);
  await page.call('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
  let transition;
  try {
    transition = await page.evaluate(`(async () => {
      const a=${app},button=a.hud.btnHwDesert;
      button.scrollIntoView({block:'center',inline:'nearest'});
      const bounds=button.getBoundingClientRect(),hit=document.elementFromPoint(bounds.left+bounds.width/2,bounds.top+bounds.height/2);
      if(bounds.width<=0||bounds.height<=0||!hit||!button.contains(hit))throw new Error('Return button is not visibly reachable');
      const snapshot=()=>({
        camera:a.camera.position.toArray(),lookAt:a.cameraCtrl.currentLookAt.toArray(),hero:a.robot.position.toArray(),
        cameraToHero:a.camera.position.distanceTo(a.robot.position),
        currentCameraDelta:a.camera.position.distanceTo(a.cameraCtrl.currentPos),
        worldPlane:a.robot.worldPlane,inHomeworldRoam:a.inHomeworldRoam,homeworldVisible:a.spacecraft.homeworldGroup.visible,
        toolbarAtDesert:a.hud.toolbarRow.parentElement===a.hud.topRight,
        showcase:a.cameraCtrl.showcase!==null,stationFocus:a.cameraCtrl.stationFocus!==null,
        pointers:a.cameraCtrl._activePointers.size,pinchDistance:a.cameraCtrl._pinchPrevDist,
        keys:a.keys.size,touchMove:[a.touchControls.moveVec.x,a.touchControls.moveVec.z],flyHeld:a.touchControls.flyHeld
      });
      const before=snapshot();
      // DOM click runs the observed UI handler synchronously. This snapshot is
      // deliberately taken in the SAME JavaScript task, before any later RAF
      // can hide a 420m camera-to-robot mismatch through exponential smoothing.
      button.click();
      const immediate=snapshot();
      const pose=a.cameraCtrl.getDesiredFollowPose(a.robot.position);
      immediate.safeFollowDelta=a.camera.position.distanceTo(pose.position);
      immediate.safeLookDelta=a.cameraCtrl.currentLookAt.distanceTo(pose.lookAt);
      const frames=[];
      await new Promise(resolve=>{
        const record=()=>{
          frames.push(snapshot());
          if(frames.length===60)resolve();else requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
      return {input:'Visible return button DOM click while real canvas touch and W are held',before,immediate,frames};
    })()`);
  } finally {
    await page.call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.call('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
  }
  report.returnToDesert = transition;
  assert(transition.before.camera[1] > 200 && transition.before.hero[1] > 200, 'Return test must begin on the motherworld plane');
  assert.equal(transition.before.showcase, true, 'Return test must begin with a live homeworld showcase');
  assert(transition.before.pointers > 0 && transition.before.keys > 0, 'Real held input must reach the camera and key handlers before returning');
  assert.equal(transition.immediate.safeFollowDelta < 0.001, true, 'The return handler must snap the physical camera to its safe desert pose in the same task');
  assert.equal(transition.immediate.safeLookDelta < 0.001, true, 'The return handler must reset the look target in the same task');
  assert.equal(transition.frames.length, 60);
  for (const [index, sample] of [transition.immediate, ...transition.frames].entries()) {
    assert.equal(sample.worldPlane, 'desert', `Return frame ${index}: robot remained on the motherworld`);
    assert.equal(sample.inHomeworldRoam, false);
    assert.equal(sample.homeworldVisible, false);
    assert.equal(sample.toolbarAtDesert, true, `Return frame ${index}: global toolbar did not return to the desert HUD`);
    assert(sample.hero[1] < 20 && sample.camera[1] < 30 && sample.lookAt[1] < 20,
      `Return frame ${index}: a camera/hero/look target retained the 420m motherworld plane`);
    assert(sample.cameraToHero < 25, `Return frame ${index}: camera is far enough away to reveal the terrain tile`);
    assert(sample.currentCameraDelta < 0.001, 'The rendered camera and controller camera must agree');
    assert.equal(sample.showcase, false, `Return frame ${index}: old homeworld showcase survived`);
    assert.equal(sample.stationFocus, false);
    assert.equal(sample.pointers, 0, `Return frame ${index}: camera pointer capture survived`);
    assert.equal(sample.pinchDistance, 0);
    assert.equal(sample.keys, 0, `Return frame ${index}: held movement key survived`);
    assert.deepEqual(sample.touchMove, [0, 0]);
    assert.equal(sample.flyHeld, false);
  }
  note('returned-to-kharis-without-cross-world-camera', {
    sameTaskCameraY: transition.immediate.camera[1], sameTaskCameraToHero: transition.immediate.cameraToHero,
    sampledRafFrames: transition.frames.length,
    maximumCameraY: Math.max(...transition.frames.map(sample => sample.camera[1])),
    maximumCameraToHero: Math.max(...transition.frames.map(sample => sample.cameraToHero))
  });
  const desertContext = await page.evaluate(`(() => {const a=${app};return {
    guide:a.hud.btnGuide.textContent,title:a.hud.levelTitleEl.textContent,expectedTitle:a.state.getCurrentLevelProgress().title,
    survey:JSON.stringify(a.state.homeworldSurvey)};})()`);
  assert.equal(desertContext.title, desertContext.expectedTitle, 'Desert task HUD must rebuild after leaving motherworld');
  assert(/蓝图|Blueprints/.test(desertContext.guide), 'Desert toolbar must restore recipe blueprints');
  await clickNode(`${app}.hud.btnGuide`, 'restored desert recipe handbook');
  await until(`${app}.hud.activeModal==='station'&&${app}.hud.workbenchMode==='handbook'`);
  await clickNode(`${app}.hud.workbenchDrawer.querySelector('.wb-header button')`, 'close restored desert handbook');
  await until(`${app}.hud.activeModal===null`);
  await clickNode(`${app}.hud.btnPause`, 'restored desert environment settings');
  await until(`${app}.hud.activeModal==='pause'`);
  const restoredEnvironment = await page.evaluate(`${app}.hud.modalPanel.textContent`);
  for (const key of ['envTimeLabel', 'envWeatherLabel', 'btnRestartLevel']) {
    const expected = await page.evaluate(`${app}.state.ui(${JSON.stringify(key)})`);
    assert(restoredEnvironment.includes(expected), 'Desert context failed to restore ' + key);
  }
  await closeModal();
  assert.equal(await page.evaluate(`JSON.stringify(${app}.state.homeworldSurvey)`), desertContext.survey);
  await auditPausedEnvironmentExposure();
  note('world-specific-task-handbook-settings-restored', { desertTaskTitle: desertContext.title, surveyPreserved: true });
}

async function auditPausedEnvironmentExposure() {
  const original = await page.evaluate(`({time:${app}.state.settings.timeMode,weather:${app}.state.settings.weatherMode,quality:${app}.postProcessing.quality})`);
  await page.evaluate(`${app}._applyGraphicsQuality('ultra')`);
  await clickNode(`${app}.hud.btnPause`, 'desert settings for paused exposure check');
  await until(`${app}.hud.activeModal==='pause'`);
  await clickNode(settingsButton('timeDay'), 'set paused daylight');
  await until(`${app}.atmosphere.nightFactor===0`);
  await clickNode(settingsButton('timeNight'), 'change paused night and settle exposure');
  await until(`${app}.atmosphere.nightFactor===1&&${app}.postProcessing.passes.adapt.uniforms.uRate.value===1`);
  const night = await page.evaluate(`(() => {const a=${app};return {night:a.atmosphere.nightFactor,
    correctProbe:a.scene.environment===a.environments.desertNight,rate:a.postProcessing.passes.adapt.uniforms.uRate.value,
    visibilityRate:a.postProcessing.passes.adapt.uniforms.uVisRate.value,pending:a.postProcessing._exposureResetPending};})()`);
  assert.equal(night.correctProbe, true);
  assert.equal(night.rate, 1);
  assert.equal(night.visibilityRate, 1);
  assert.equal(night.pending, false, 'The actual HDR paint must consume the exposure reset');
  await clickNode(settingsButton('weatherClear'), 'set paused clear weather');
  await until(`${app}.atmosphere.sandstormWeight===0`);
  await clickNode(settingsButton('weatherSandstorm'), 'change paused storm and settle exposure');
  await until(`${app}.atmosphere.sandstormWeight===1&&${app}.postProcessing.passes.adapt.uniforms.uRate.value===1`);
  const storm = await page.evaluate(`({weight:${app}.atmosphere.sandstormWeight,rate:${app}.postProcessing.passes.adapt.uniforms.uRate.value})`);
  const timeKeys = { cycle:'timeCycle', day:'timeDay', night:'timeNight' };
  const weatherKeys = { dynamic:'weatherDynamic', clear:'weatherClear', overcast:'weatherOvercast', sandstorm:'weatherSandstorm' };
  await clickNode(settingsButton(timeKeys[original.time || 'cycle']), 'restore original time mode');
  await clickNode(settingsButton(weatherKeys[original.weather || 'dynamic']), 'restore original weather mode');
  await page.evaluate(`${app}._applyGraphicsQuality(${JSON.stringify(original.quality)})`);
  await closeModal();
  note('paused-environment-hdr-exposure-synchronized', { night,storm,preferencesRestored:true });
}

try {
  for (const domain of ['Page', 'Runtime']) await source.call(`${domain}.enable`);
  // Freeze the existing tab so its crafting queue/clock and pending saves cannot
  // advance while another same-origin tab temporarily exercises persistence.
  await source.call('Page.setWebLifecycleState', { state: 'frozen' });
  sourceFrozen = true;
  const backup = await source.evaluate(`(() => {
    const a=${app};if(!a)throw new Error('Existing game app is not ready');
    a.state.flushSave();
    return {storage:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),
      memory:JSON.stringify({homeworldSurvey:a.state.homeworldSurvey,launchedHome:a.state.launchedHome,
        settings:a.state.settings,craftingQueue:a.state.craftingQueue,inventory:a.state.inventory,envClock:a.state.envClock})};
  })()`);
  originalStorage = backup.storage;
  originalMemory = backup.memory;
  report.originalStorageKeyCount = Object.keys(originalStorage).length;
  const target = await source.call('Target.createTarget', { url: 'about:blank', background: false });
  testTargetId = target.targetId;
  const testTabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const testTab = testTabs.find(tab => tab.id === testTargetId);
  assert(testTab, 'Temporary audit tab was not created');
  page = await connect(testTab.webSocketDebuggerUrl, true);
  for (const domain of ['Page', 'Runtime', 'Log']) await page.call(`${domain}.enable`);
  await page.call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await page.call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.call('Page.navigate', { url });
  await until(`!!${app}&&${app}.hud.activeModal==='title'`, 45000);
  report.build = await page.evaluate(`document.querySelector('meta[name="build-time"]')?.content`);
  await clickNode(`document.querySelector('.hero-actions button.primary')`, 'title primary action');
  await until(`${app}.hud.activeModal!=='title'`);
  if (await page.evaluate(`${app}.introCutscene.active`)) {
    await press('Escape', 'Escape', 27);
    await until(`!${app}.introCutscene.active`);
  }
  await page.evaluate(`(() => {
    const a=${app};
    window.__homeworldInteractionRestore={survey:structuredClone(a.state.homeworldSurvey),launchedHome:a.state.launchedHome,settings:{...a.state.settings}};
    a.state.homeworldSurvey=${JSON.stringify(createHomeworldSurvey())};a.state.launchedHome=true;
    a.state.setLang('zh');a.state._emit('homeworld_survey_changed',{action:'audit_setup'});
    a.hud.closeModal();a._enterHomeworldRoam();
  })()`);
  await until(`${app}.inHomeworldRoam&&${app}.robot.worldPlane==='homeworld'`);
  await setViewport(allViewports[0]);
  note('white-box-postgame-entry', { temporarySurvey: true, temporaryLaunchedHome: true });

  await teleport(HOMEWORLD_CAPTAIN);
  await press('KeyE', 'e', 69);
  await until(`${app}.state.homeworldSurvey.accepted&&${app}.hud.activeModal==='homeworld_journal'`);
  note('captain-accepted-with-keyboard');
  await checkLocale('zh', 'brief');
  await modalAcrossViewports('journal-brief-zh');
  await closeModal();
  await auditHomeworldGlobalSettings();
  if (await page.evaluate(`${app}.state.settings.showCompass===false`)) {
    await clickNode(`${app}.hud.btnPause`, 'settings to enable mission destination');
    await until(`${app}.hud.activeModal==='pause'`);
    await clickNode(`${app}.hud.modalPanel.querySelector('[data-hud-pref="showCompass"]')`, 'enable mission destination');
    await closeModal();
    await until(`!${app}.hud.homeworldObjective.classList.contains('hidden')`);
    note('mission-fixtures-use-full-guidance', { input: 'actual next-destination preference control' });
  }

  for (const point of HOMEWORLD_LANDMARKS) {
    await teleport(point);
    await contextAction();
    await until(`${app}.state.homeworldSurvey.records[${JSON.stringify(point.id)}]===true`);
    note('recorded-with-touch-context', { id: point.id });
  }
  assert.equal(await page.evaluate(`${app}.state.homeworldSurvey.calibration`), 0);
  await contextAction();
  await until(`${app}.hud.activeModal==='homeworld_calibration'`);
  await clickNode(`${app}.hud.modalPanel.querySelectorAll('.hw-calibration-controls button')[2]`, 'incorrect connect before intake');
  assert.equal(await page.evaluate(`${app}.state.homeworldSurvey.calibration`), 0);
  assert((await page.evaluate(`${app}.hud.modalPanel.innerText`)).includes('联锁保护'));
  await modalAcrossViewports('calibration-wrong-order-zh');
  await closeModal();

  await toggleLanguage('en');
  await contextAction();
  await until(`${app}.hud.activeModal==='homeworld_calibration'`);
  await checkLocale('en', 'calibration');
  await modalAcrossViewports('calibration-en');
  for (let stage = 0; stage < 3; stage++) {
    await clickNode(`${app}.hud.modalPanel.querySelectorAll('.hw-calibration-controls button')[${stage}]`, `ordered relay stage ${stage + 1}`);
    await until(`${app}.state.homeworldSurvey.calibration===${stage + 1}`);
    note('relay-stage-with-touch', { stage: stage + 1 });
  }
  assert.equal(await page.evaluate(`${app}.state.homeworldSurvey.completed`), false);
  await modalAcrossViewports('calibration-restored-en');
  await closeModal();
  await teleport(HOMEWORLD_CAPTAIN);
  await contextAction();
  await until(`${app}.state.homeworldSurvey.completed===true`);
  note('captain-delivered-with-touch');
  await clickNode(`${app}.hud.homeworldObjective`, 'watch journal pill');
  await until(`${app}.hud.activeModal==='homeworld_journal'`);
  await checkLocale('en', 'reward');
  await modalAcrossViewports('journal-reward-en');
  await clickNode(`${app}.hud.modalPanel.querySelector('button.primary')`, 'unlocked valley view');
  await until(`${app}.hud.activeModal===null&&!!${app}.cameraCtrl.showcase`);
  note('valley-view-unlocked-and-activated');

  await toggleLanguage('zh');
  await clickNode(`${app}.hud.homeworldObjective`, 'Chinese watch journal pill');
  await until(`${app}.hud.activeModal==='homeworld_journal'`);
  await checkLocale('zh', 'reward');
  await modalAcrossViewports('journal-reward-zh');
  await closeModal();
  await returnToDesertWithoutCrossWorldCamera();
  report.runtime = await page.evaluate(`(() => {
    const a=${app};return {completed:a.state.homeworldSurvey.completed,
      records:{...a.state.homeworldSurvey.records},calibration:a.state.homeworldSurvey.calibration,
      contextLost:a.renderer.getContext().isContextLost(),
      failedPrograms:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>p.name)};
  })()`);
  assert.equal(report.runtime.contextLost, false);
  assert.deepEqual(report.runtime.failedPrograms, []);
  assert.deepEqual(exceptions, [], 'The interaction flow raised a runtime exception');
  assert.deepEqual(consoleErrors, [], 'The interaction flow logged a runtime or GPU error');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  try {
    if (page) {
      await page.evaluate(`(() => {
        const a=${app};if(!a)return;
        a.state.flushSave();a.state.storageAvailable=false;
        const backup=window.__homeworldInteractionRestore;
        if(backup){a.state.homeworldSurvey=backup.survey;a.state.launchedHome=backup.launchedHome;a.state.settings=backup.settings;}
      })()`);
    }
  } catch (error) { report.cleanupPageError = String(error); }
  try {
    if (testTargetId) await source.call('Target.closeTarget', { targetId: testTargetId });
    if (originalStorage) {
      const restored = await source.evaluate(`(() => {
        const expected=${JSON.stringify(originalStorage)};
        localStorage.clear();for(const[k,v]of Object.entries(expected))localStorage.setItem(k,v);
        const actual=Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)]));
        const sorted=Object.fromEntries(Object.keys(expected).sort().map(k=>[k,expected[k]]));
        const a=${app};return {storage:JSON.stringify(actual)===JSON.stringify(sorted),
          memory:JSON.stringify({homeworldSurvey:a.state.homeworldSurvey,launchedHome:a.state.launchedHome,
            settings:a.state.settings,craftingQueue:a.state.craftingQueue,inventory:a.state.inventory,envClock:a.state.envClock})};
      })()`);
      report.storageRestored = restored.storage;
      report.originalMemoryPreserved = restored.memory === originalMemory;
      assert.equal(report.storageRestored, true, 'Original localStorage was not restored exactly');
      assert.equal(report.originalMemoryPreserved, true, 'The original tab memory changed during isolated-tab testing');
    }
  } catch (error) {
    report.passed = false; report.restoreFailure = error.stack; process.exitCode = 1;
  } finally {
    if (sourceFrozen) {
      try { await source.call('Page.setWebLifecycleState', { state: 'active' }); }
      catch (error) { report.resumeFailure = String(error); report.passed = false; process.exitCode = 1; }
    }
    page?.close(); source.close();
  }
  report.exceptions = exceptions;
  report.consoleErrors = consoleErrors;
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, output, failure: report.failure, restoreFailure: report.restoreFailure,
    storageRestored: report.storageRestored, originalMemoryPreserved: report.originalMemoryPreserved }));
}
