// Node 22 + authorized ADB device. CDP white-box render/load measurements;
// no screenshots, save changes, device settings changes, or temperature spoofing.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const serial = option('--serial', 'AEFG026323003230');
const port = option('--port', '9222');
const duration = Number(option('--seconds', '45')) * 1000;
const output = option('--output', '../plans/THERMAL_MOBILE.json');
const quality = option('--quality', 'ultra');
const stages = option('--stages', 'stationary,moving,pause').split(',');
assert(stages.length && stages.every(stage => ['stationary','moving','pause'].includes(stage)), 'Unknown thermal probe stage');
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const tab = tabs.find(t => t.type === 'page' && t.url.includes('4175'));
assert(tab, 'Open the game before measuring');
const socket = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let id = 0;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data), operation = pending.get(message.id);
  if (!operation) return;
  pending.delete(message.id);
  clearTimeout(operation.timer);
  message.error ? operation.reject(new Error(JSON.stringify(message.error))) : operation.resolve(message.result);
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(new Error(`${method} timed out`)); }, 45000);
  pending.set(next, { resolve, reject, timer });
  socket.send(JSON.stringify({ id: next, method, params }));
});
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function temperature() {
  const battery = execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'battery'], { encoding: 'utf8', timeout: 15000 });
  const thermal = execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'thermalservice'], { encoding: 'utf8', timeout: 15000 });
  // The cached section can be stale by hours: only use current HAL readings.
  const current = thermal.split('Current temperatures from HAL:')[1]?.split('Current cooling devices')[0] || '';
  return { at: new Date().toISOString(), batteryC: Number(battery.match(/temperature:\s*(\d+)/)?.[1]) / 10,
    usbCharging: /USB powered: true/.test(battery), level: Number(battery.match(/level:\s*(\d+)/)?.[1]),
    status: Number(thermal.match(/Thermal Status:\s*(\d+)/)?.[1]),
    sensors: [...current.matchAll(/mValue=([\d.]+), mType=(\d+), mName=([^,}]+)/g)].map(m => ({ c: Number(m[1]), type: Number(m[2]), name: m[3] })) };
}
const report = { serial, startedAt: new Date().toISOString(), durationPerStageMs: duration,
  method: 'Foreground motherworld at a fixed initial camera; stationary, actual alternating D/A movement with measured travel, pause. USB charging recorded. Short before/after is not a steady-state heat certification.', stages: [] };
try {
  await call('Page.bringToFront');
  report.environment = await evaluate(`(() => {
    const a=__LBH_APP__;if(!a.inHomeworldRoam)throw new Error('Motherworld roam required');
    const original=a.stepFrame, quality=a.postProcessing.quality, position=a.robot.position.toArray();
    const yaw=a.cameraCtrl.yaw;
    a.hud.closeModal();a.cameraCtrl.clearShowcase();a._applyGraphicsQuality(${JSON.stringify(quality)});
    a.robot.teleportToHomeworldMeadow();a.cameraCtrl.yaw=0;a.cameraCtrl.pitch=.25;a.cameraCtrl.distance=10.5;
    a.cameraCtrl.snapToPose(a.cameraCtrl.getDesiredFollowPose(a.robot.position));
    const gl=a.renderer.getContext(),ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const p={frames:[],gpu:[],last:0,query:null,travel:0,x:a.robot.position.x,z:a.robot.position.z};window.__thermalProbe=p;
    a.stepFrame=function(){
      if(p.query&&gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)){
        if(!gl.getParameter(ext.GPU_DISJOINT_EXT))p.gpu.push(gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6);
        gl.deleteQuery(p.query);p.query=null;
      }
      let query=null;if(ext&&!p.query){query=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,query);}
      const now=performance.now(),start=now;let result;
      try{result=original.apply(this,arguments)}finally{
        if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);p.query=query}
      }
      p.travel+=Math.hypot(a.robot.position.x-p.x,a.robot.position.z-p.z);p.x=a.robot.position.x;p.z=a.robot.position.z;
      p.frames.push({ms:p.last?now-p.last:0,cpu:performance.now()-start});p.last=now;return result;
    };
    p.restore=()=>{a.stepFrame=original;if(p.query)gl.deleteQuery(p.query);a.keys.clear();
      a._applyGraphicsQuality(quality);a.robot.position.fromArray(position);a.cameraCtrl.yaw=yaw;
      a.cameraCtrl.snapToPose(a.cameraCtrl.getDesiredFollowPose(a.robot.position));a.hud.openPauseModal();};
    return {build:document.querySelector('meta[name="build-time"]').content,viewport:[innerWidth,innerHeight],
      dpr:a.renderer.getPixelRatio(),quality:a.postProcessing.quality,requestedQuality:a.state.settings.quality,
      gpuTimer:!!ext};
  })()`);
  for (const stage of stages) {
    if (stage === 'moving') {
      await call('Input.dispatchKeyEvent', { type: 'keyDown', code:'KeyD', key:'d', windowsVirtualKeyCode:68 });
    } else if (stage === 'pause') {
      for (const [code, key, n] of [['KeyD', 'd', 68], ['KeyA', 'a', 65]]) await call('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: n });
      await evaluate('__LBH_APP__.hud.openPauseModal()');
    }
    await delay(1000);
    const start = await evaluate('(()=>{const p=__thermalProbe;p.frames=[];p.gpu=[];p.last=0;p.travel=0;return __LBH_APP__.robot.position.toArray()})()');
    const temperatures = [temperature()], began = Date.now();
    let right=true;
    while (Date.now() - began < duration) {
      await delay(Math.min(5000, duration - (Date.now() - began))); temperatures.push(temperature());
      if(stage==='moving'){
        await call('Input.dispatchKeyEvent',{type:'keyUp',code:right?'KeyD':'KeyA',key:right?'d':'a',windowsVirtualKeyCode:right?68:65});
        right=!right;
        await call('Input.dispatchKeyEvent',{type:'keyDown',code:right?'KeyD':'KeyA',key:right?'d':'a',windowsVirtualKeyCode:right?68:65});
      }
    }
    const measured = await evaluate(`(() => {
      const p=__thermalProbe,f=p.frames.filter(v=>v.ms>0),sorted=(values)=>values.sort((a,b)=>a-b),
        ms=sorted(f.map(v=>v.ms)),cpu=sorted(f.map(v=>v.cpu)),gpu=sorted(p.gpu),sum=ms.reduce((a,b)=>a+b,0),
        percentile=(v,q)=>v.length?v[Math.floor((v.length-1)*q)]:null;
      return {frames:p.frames.length,fps:f.length?1000*f.length/sum:0,p95ms:percentile(ms,.95),
        cpuP50:percentile(cpu,.5),cpuP95:percentile(cpu,.95),gpuP50:percentile(gpu,.5),gpuP95:percentile(gpu,.95),
        gpuSamples:gpu.length,travelMeters:p.travel,position:__LBH_APP__.robot.position.toArray(),quality:__LBH_APP__.postProcessing.quality};
    })()`);
    const result = { stage, elapsedMs: Date.now() - began, startPosition: start, ...measured, temperatures };
    report.stages.push(result);
    console.log(JSON.stringify({stage,frames:result.frames,fps:result.fps,cpuP95:result.cpuP95,gpuP95:result.gpuP95,
      batteryStart:temperatures[0].batteryC,batteryEnd:temperatures.at(-1).batteryC,
      skinEnd:temperatures.at(-1).sensors.find(s=>s.name==='skin')?.c}));
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    if (stage !== 'pause') assert(measured.frames > 30, `${stage} must actually render`);
    if (stage === 'moving') assert(measured.travelMeters > 2, 'Moving probe must actually travel more than 2m');
  }
  report.passed = true;
} finally {
  await evaluate('window.__thermalProbe?.restore()').catch(() => {});
  socket.close();
  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
}
