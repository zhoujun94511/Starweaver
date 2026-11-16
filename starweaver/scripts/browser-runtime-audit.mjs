// Node >=22. Connects to an already running Chrome/Edge DevTools endpoint.
// No screenshots, save injection, or prerequisite bypasses. The launch entry
// method is invoked as a white-box rendering smoke check, not a completion test.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { REGIONS } from '../src/data/gameData.js';
import { HOMEWORLD_DISTRICTS, getHomeworldGroundHeight } from '../src/data/homeworldData.js';
import { getTerrainHeight } from '../src/utils/math.js';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const port = option('--port', '9231');
const url = option('--url', 'http://127.0.0.1:4175/index.html');
const output = option('--output', '../plans/browser-runtime.json');
const width = Number(option('--width', '0'));
const height = Number(option('--height', '0'));
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = tabs.find((tab) => tab.type === 'page' && tab.url.includes('4175'));
assert(page, 'Open the game in the browser before running this audit');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 0;
const pending = new Map();
const exceptions = [], consoleErrors = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const operation = pending.get(message.id);
    if (!operation) return;
    pending.delete(message.id);
    clearTimeout(operation.timer);
    if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
    else operation.resolve(message.result);
  } else if (message.method === 'Runtime.exceptionThrown') {
    exceptions.push(message.params.exceptionDetails);
  } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
  } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
    consoleErrors.push(message.params.entry.text);
  }
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 45000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(expression, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await pause(300);
  }
  throw new Error(`Condition timed out: ${expression}`);
}

const report = { port, url, startedAt: new Date().toISOString(), samples: [] };
let originalStorage;
try {
  for (const domain of ['Page', 'Runtime', 'Log', 'Network', 'Performance']) await call(`${domain}.enable`);
  await call('Page.bringToFront');
  originalStorage = await evaluate(`(() => {
    window.__LBH_APP__?.state.flushSave();
    return Object.fromEntries(Object.keys(localStorage).map(key=>[key,localStorage.getItem(key)]));
  })()`);
  if (width && height) await call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false
  });
  await call('Page.navigate', { url });
  await until('!!window.__LBH_APP__ && !!window.__LBH_APP__.hud');
  report.browser = await call('Browser.getVersion');
  report.environment = await evaluate(`(() => {
    const a=__LBH_APP__, gl=a.renderer.getContext();
    const ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {build:document.querySelector('meta[name="build-time"]').content,
      viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,mobile:a.postProcessing.isMobile,
      gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
  })()`);
  await evaluate(`(() => {
    const a=__LBH_APP__, r=a.renderer, original=a.stepFrame, render=r.render, shadow=r.shadowMap.render;
    r.info.autoReset=false;
    window.__runtimeProbe={frames:[],sceneCalls:0,shadowCalls:0,armed:false,last:0,ceremonyStages:new Set()};
    r.shadowMap.render=function(){
      const before=r.info.render.calls;
      const result=shadow.apply(this,arguments);
      __runtimeProbe.shadowCalls+=r.info.render.calls-before;
      return result;
    };
    r.render=function(scene,camera){
      const before=this.info.render.calls, beforeShadow=__runtimeProbe.shadowCalls;
      const result=render.apply(this,arguments);
      if(scene===a.scene && camera===a.camera && !scene.overrideMaterial)
        __runtimeProbe.sceneCalls+=this.info.render.calls-before-(__runtimeProbe.shadowCalls-beforeShadow);
      return result;
    };
    a.stepFrame=function(){
      const p=__runtimeProbe,t=performance.now();
      r.info.reset();p.sceneCalls=0;p.shadowCalls=0;
      const result=original.apply(this,arguments);
      if(a.spacecraft.homeworldCeremony) p.ceremonyStages.add(a.spacecraft.homeworldCeremony.stage);
      if(p.armed && p.last) p.frames.push({ms:t-p.last,calls:r.info.render.calls,sceneCalls:p.sceneCalls,shadowCalls:p.shadowCalls,triangles:r.info.render.triangles});
      p.last=t;return result;
    };
    a._runtimeAuditRestore=()=>{a.stepFrame=original;r.render=render;r.shadowMap.render=shadow;r.info.autoReset=true;};
    a._applyGraphicsQuality('ultra');
    return true;
  })()`);
  async function sample(label, duration = 5000) {
    // Starting a mission can restore the saved quality after the intro. Apply
    // the requested profile at each checkpoint and record the effective tier.
    await evaluate("__LBH_APP__._applyGraphicsQuality('ultra')");
    await pause(1200); // Shader compilation and probe/exposure settling.
    await evaluate('__runtimeProbe.frames=[];__runtimeProbe.last=0;__runtimeProbe.armed=true');
    await pause(duration);
    const sample = await evaluate(`(() => {
      const p=__runtimeProbe;p.armed=false;
      const f=p.frames, times=f.map(v=>v.ms).sort((a,b)=>a-b), sum=f.reduce((a,v)=>a+v.ms,0);
      const median=(key)=>f.map(v=>v[key]).sort((a,b)=>a-b)[Math.floor(f.length/2)];
      return {frames:f.length,elapsedMs:sum,fps:f.length*1000/sum,p50ms:times[Math.floor(times.length*.5)],
        p95ms:times[Math.floor(times.length*.95)],medianSceneCalls:median('sceneCalls'),medianShadowCalls:median('shadowCalls'),medianTotalCalls:median('calls'),medianTriangles:median('triangles')};
    })()`);
    const quality = await evaluate('__LBH_APP__.postProcessing.quality');
    report.samples.push({ label, quality, ...sample });
    console.log(JSON.stringify({ label, quality, ...sample }));
    assert.equal(quality, 'ultra', 'Measured quality must match the profile label');
    assert(sample.frames >= 10, `${label} did not advance enough frames`);
  }
  await sample('title-ultra', 3000);
  await evaluate(`document.querySelector('.hero-actions button.primary').click()`);
  await until('__LBH_APP__.hud.activeModal !== "title"');
  if (await evaluate('__LBH_APP__.introCutscene.active')) await evaluate('__LBH_APP__.finishIntroCutscene()');
  await sample('desert-ultra');
  // These are rendering probes at authored region coordinates. They do not
  // grant equipment, unlock gates, change the save, or simulate traversal.
  report.regionProbeMethod = 'White-box scene positions under a blocking inspection panel; not full gameplay traversal';
  const desertStart = await evaluate('__LBH_APP__.robot.position.toArray()');
  await evaluate('__LBH_APP__.hud.openInspectModal("Render probe", "Scene sampling")');
  for (const [id, region] of Object.entries(REGIONS)) {
    if (id === 'crash_basin') continue;
    const { x, z } = region.center;
    const y = getTerrainHeight(x, z, false);
    await evaluate(`__LBH_APP__.robot.position.set(${x},${y},${z});__LBH_APP__.robot.velocityY=0`);
    await sample(`${id}-ultra`, 3000);
  }
  await evaluate(`__LBH_APP__.robot.position.fromArray(${JSON.stringify(desertStart)});__LBH_APP__.hud.closeModal()`);
  await call('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await evaluate('__LBH_APP__.beginLaunchCutscene()');
  await until('!__LBH_APP__.cutscene.active && __LBH_APP__.hud.activeModal === "ending"', 80000);
  report.launchCompleted = true;
  report.ceremonyStages = await evaluate('[...__runtimeProbe.ceremonyStages]');
  for (const stage of ['captain-salute', 'invitation', 'welcome-response', 'settled'])
    assert(report.ceremonyStages.includes(stage), `Ending interrupted the ${stage} beat`);
  await evaluate(`(() => {
    const text=__LBH_APP__.state.ui('btnWalkHomeworld');
    const button=[...document.querySelectorAll('button')].find(b=>b.textContent===text);
    if(!button) throw new Error('Missing homeworld exploration action');
    button.click();
  })()`);
  await until('__LBH_APP__.inHomeworldRoam');
  await sample('homeworld-ultra');
  const motionStart = await evaluate('__LBH_APP__.robot.position.toArray()');
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
  try { await sample('homeworld-moving-ultra', 3000); }
  finally { await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 }); }
  const motionEnd = await evaluate('__LBH_APP__.robot.position.toArray()');
  report.motion = { start: motionStart, end: motionEnd,
    distance: Math.hypot(motionEnd[0] - motionStart[0], motionEnd[2] - motionStart[2]) };
  assert(report.motion.distance > 1, 'Movement sample must actually move the robot');
  for (const district of HOMEWORLD_DISTRICTS) {
    const x = district.approachX, z = district.approachZ, y = getHomeworldGroundHeight(x, z);
    await evaluate(`__LBH_APP__.robot.position.set(${x},${y},${z});__LBH_APP__.robot.velocityY=0`);
    await sample(`homeworld-${district.id}-ultra`, 3000);
  }
  await evaluate('__LBH_APP__.robot.teleportToHomeworldMeadow()');
  report.homeworldMenu = await evaluate(`(() => {
    const bar=__LBH_APP__.hud.homeworldBar,title=__LBH_APP__.hud.homeworldBarTitle;
    const compact=matchMedia('(max-width:1240px), (pointer:coarse)').matches;
    const before=bar.getBoundingClientRect();
    title.click();
    const opened=title.getAttribute('aria-expanded')==='true';
    const actions=[...bar.querySelectorAll('.hud-btn')].filter(b=>b.getBoundingClientRect().width>0).length;
    title.click();
    return {compact,collapsedHeight:before.height,width:before.width,left:before.left,right:before.right,viewport:innerWidth,opened,actions};
  })()`);
  assert.equal(report.homeworldMenu.opened, true, 'Homeworld menu must open on interaction');
  assert.equal(report.homeworldMenu.actions, 3, 'Homeworld menu must expose summary, planet return and replay');
  if(report.homeworldMenu.compact) assert(report.homeworldMenu.collapsedHeight <= 72, 'Compact homeworld menu covers too much of the viewport');
  assert(report.homeworldMenu.left >= 0 && report.homeworldMenu.right <= report.homeworldMenu.viewport, 'Homeworld menu extends beyond the viewport');
  report.qualityChecks = [];
  for (const quality of ['low', 'medium', 'high', 'ultra']) {
    await evaluate(`__LBH_APP__._applyGraphicsQuality('${quality}')`);
    await pause(800);
    const check = await evaluate(`(() => {
      const a=__LBH_APP__;
      return {quality:a.postProcessing.quality,contextLost:a.renderer.getContext().isContextLost(),
        failedPrograms:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>p.name)};
    })()`);
    assert.equal(check.quality, quality, 'Requested quality did not become active');
    assert.equal(check.contextLost, false);
    assert.deepEqual(check.failedPrograms, [], 'Quality change failed GPU compilation');
    report.qualityChecks.push(check);
  }
  report.runtime = await evaluate(`(() => {
    const a=__LBH_APP__;
    return {streakEnabled:a.postProcessing._streakEnabled,robot:a.robot.position.toArray(),
      resources:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>/^https?:/.test(n)),
      failedPrograms:a.renderer.info.programs.filter(p=>p.diagnostics?.runnable===false).map(p=>p.name),
      contextLost:a.renderer.getContext().isContextLost()};
  })()`);
  report.performanceMetrics = await call('Performance.getMetrics');
  assert.equal(report.runtime.contextLost, false, 'WebGL context was lost');
  assert.deepEqual(report.runtime.failedPrograms, [], 'A shader failed GPU compilation');
  assert.deepEqual(report.runtime.resources, [], 'Offline game fetched external resources');
  if (report.environment.mobile) assert.equal(report.runtime.streakEnabled, false, 'Mobile horizontal streak pass must stay disabled');
  assert.deepEqual(exceptions, [], 'Runtime exceptions were emitted');
  assert.deepEqual(consoleErrors, [], 'Browser logged runtime/WebGL errors');
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  process.exitCode = 1;
} finally {
  report.exceptions = exceptions;
  report.consoleErrors = consoleErrors;
  try {
    await evaluate('__LBH_APP__?._runtimeAuditRestore?.()');
    await call('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    if (originalStorage) {
      report.storageRestored = await evaluate(`(() => {
        const a=window.__LBH_APP__;a?.state.flushSave();
        const original=${JSON.stringify(originalStorage)};
        localStorage.clear();for(const [key,value]of Object.entries(original))localStorage.setItem(key,value);
        a?.state.load();
        if(a){a.sound.setMuted(a.state.settings.muted);a._applyGraphicsQuality(a.state.settings.quality);}
        return JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])))===
          JSON.stringify(Object.fromEntries(Object.entries(original).sort(([a],[b])=>a.localeCompare(b))));
      })()`);
      assert.equal(report.storageRestored, true, 'Runtime audit must restore the original save/settings');
    }
  } catch (error) {
    report.passed = false;
    report.cleanupFailure = error.stack;
    process.exitCode = 1;
  }
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, output, failure: report.failure }));
  socket.close();
}
