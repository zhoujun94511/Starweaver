import { HOMEWORLD_DISTRICTS } from './homeworldData.js';

const approach = id => {
  const district = HOMEWORLD_DISTRICTS.find(item => item.id === id);
  return { x: district.approachX, z: district.approachZ };
};

export const HOMEWORLD_LANDMARKS = Object.freeze([
  { id: 'observatory', ...approach('observatory'),
    name: { zh: '西北观测坡', en: 'Northwest Observatory' },
    record: { zh: '记录星图', en: 'Record the star chart' },
    note: { zh: '星图已与返航航迹对齐。远方的环带行星成为家园新的导航基准。', en: 'The star chart now matches the return flight. The ringed planet is the colony’s new navigation reference.' } },
  { id: 'nursery', ...approach('nursery'),
    name: { zh: '东部生态苗圃', en: 'Eastern Nursery' },
    record: { zh: '采集生态读数', en: 'Collect ecological readings' },
    note: { zh: '育苗床水温与含氧量正常。种子库已收到米洛带回的环境数据。', en: 'Water temperature and oxygen levels are healthy. Milo’s environmental data has reached the seed bank.' } },
  { id: 'energy', ...approach('energy'),
    name: { zh: '河岸能源站', en: 'Riverside Power Station' },
    record: { zh: '检查水流负载', en: 'Check the water load' },
    note: { zh: '水轮机有稳定流量，但供电尚未并网。完成三处记录后，按站内顺序恢复供电。', en: 'The turbine has steady flow but is disconnected. Finish all three records, then restore power using the station sequence.' } }
]);
export const HOMEWORLD_CAPTAIN = Object.freeze({ id: 'captain', x: -3.4, z: 5.8,
  name: { zh: '米拉队长', en: 'Captain Mira' } });
export const HOMEWORLD_CALIBRATION = Object.freeze([
  { id: 'intake', name: { zh: '开启进水阀', en: 'Open the intake' } },
  { id: 'stabilize', name: { zh: '稳定调压器', en: 'Stabilize voltage' } },
  { id: 'connect', name: { zh: '接通社区电网', en: 'Connect the colony grid' } }
]);

export const HOMEWORLD_CREW_CHATS = Object.freeze([
  {
    id: 'crew_engineer',
    x: -1.3,
    z: 8.2,
    linkedRecord: 'energy',
    name: { zh: '工程师塔里克', en: 'Engineer Tariq' },
    prompt: { zh: '与塔里克交谈', en: 'Chat with Tariq' },
    before: {
      zh: '塔里克：“干得漂亮米洛！双联推进器居然被你修得比出厂还稳！河岸水轮机那边的并网闸门正等你去露一手呢！”',
      en: 'Tariq: "Incredible work, Milo! Those twin thrusters purr smoother than factory spec! The riverside turbine switchgear is waiting for your touch!"'
    },
    after: {
      zh: '塔里克：“看见全谷亮起的暖灯了吗？水轮机满负荷运转，今晚整个聚落都能洗上热水澡啦！”',
      en: 'Tariq: "See the warm lanterns glowing across the valley? The waterwheel is humming at full output!"'
    }
  },
  {
    id: 'crew_botanist',
    x: 1.4,
    z: 8.2,
    linkedRecord: 'nursery',
    name: { zh: '植物学家林', en: 'Botanist Lin' },
    prompt: { zh: '与植物学家林交谈', en: 'Chat with Botanist Lin' },
    before: {
      zh: '林：“星织号生态舱里的小绿芽平安带回来啦！去东边苗圃看看吧，那里的繁花与育苗床正等着同步你的环境数据呢。”',
      en: 'Lin: "Our little bio-dome sprout made it home safe! Visit the eastern nursery — the flower beds are ready for your readings."'
    },
    after: {
      zh: '林：“东侧育苗床的生物光谱环已经点亮！有了卡里斯荒漠的耐旱样本，今年河谷的花期会格外漫长。”',
      en: 'Lin: "The nursery bio-spectrum halo is shining bright! Thanks to your field data, the valley blossoms are thriving."'
    }
  },
  {
    id: 'crew_navigator',
    x: 3.5,
    z: 7.3,
    linkedRecord: 'observatory',
    name: { zh: '领航员索尔', en: 'Navigator Sol' },
    prompt: { zh: '与领航员索尔交谈', en: 'Chat with Navigator Sol' },
    before: {
      zh: '索尔：“跨越光年的超空间跃迁堪称教科书级！去西北山坡的星航台把返航星轨归档吧，天球仪会为你展开。”',
      en: 'Sol: "That hyperspace jump was textbook perfection! Upload your return trajectory at the northwest telescope to unfold the astrolabe."'
    },
    after: {
      zh: '索尔：“西北坡顶的金色星轨仪已经在旋转了！以后每一艘远航飞船都能沿着米洛开辟的航标平安回家。”',
      en: 'Sol: "The golden astrolabe is spinning atop the hill! Every future vessel can follow Milo’s beacon safely home."'
    }
  },
  {
    id: 'res_navigator',
    x: -8.6,
    z: 8.0,
    linkedRecord: 'completed',
    name: { zh: '驻地测绘员艾琳', en: 'Surveyor Eilin' },
    prompt: { zh: '与测绘员交谈', en: 'Chat with Surveyor' },
    before: {
      zh: '艾琳：“西侧广场立起了归航纪念碑！等你完成第一班巡检向队长汇报后，碑顶的金色星徽就会正式点亮。”',
      en: 'Eilin: "We raised a homecoming obelisk on the west plaza! Report your finished rounds to light up its golden star crest."'
    },
    after: {
      zh: '艾琳：“纪念碑顶的星徽在阳光下太耀眼了！你永远是翡翠河谷的小英雄，米洛！”',
      en: 'Eilin: "The golden star crest atop the obelisk shines so brightly! You are the hero of Emerald Valley, Milo!"'
    }
  },
  {
    id: 'res_engineer',
    x: 5.8,
    z: 15.2,
    linkedRecord: 'energy',
    name: { zh: '水务技师凯', en: 'Hydro-Tech Kai' },
    prompt: { zh: '与水务技师交谈', en: 'Chat with Hydro-Tech' },
    before: {
      zh: '凯：“沿着脚下的石灰岩石板路往北走就能到河岸水轮机站，顺便欣赏一下沿途盛开的野花吧！”',
      en: 'Kai: "Follow the limestone stepping stones north to reach the riverside waterwheel — enjoy the wildflowers along the way!"'
    },
    after: {
      zh: '凯：“换热塔压力与河岸电网完全同步，清澈的溪水正在滋养整片河谷草甸！”',
      en: 'Kai: "Heat-exchanger pressure is locked in with the river turbine — crystal-clear water is nourishing the whole meadow!"'
    }
  },
  {
    id: 'res_botanist',
    x: 19.9,
    z: 11.9,
    linkedRecord: 'nursery',
    name: { zh: '园艺师诺拉', en: 'Horticulturist Nora' },
    prompt: { zh: '与园艺师交谈', en: 'Chat with Horticulturist' },
    before: {
      zh: '诺拉：“温室长廊外新栽了五色星兰，再往东几步就是生态苗圃控制台啦！”',
      en: 'Nora: "We planted five-color star-orchids along the promenade — the nursery console is just a few steps east!"'
    },
    after: {
      zh: '诺拉：“听着溪水声、看着雪山和花海，真高兴你能平安回到这片翠绿家园！”',
      en: 'Nora: "With the snow peaks, rustling stream, and blooming meadows, we are so happy you are home safe!"'
    }
  }
]);

export const HOMEWORLD_SCENIC_VIEWS = Object.freeze([
  {
    id: 'valley_overview',
    look: [2, 421.8, 12],
    offset: [-18, 14, -22],
    title: { zh: '观景机位 1/4 · 翡翠河谷与雪峰全景', en: 'Scenic View 1/4 • Emerald Valley & Snow Peaks' }
  },
  {
    id: 'observatory_astrolabe',
    look: [-30.8, 424.6, -18.8],
    offset: [9.5, 4.2, 10.5],
    title: { zh: '观景机位 2/4 · 西北星航观测台与金色天球仪', en: 'Scenic View 2/4 • Astrolabe & Alpine Horizon' }
  },
  {
    id: 'solarium_promenade',
    look: [24.5, 422.2, 7.2],
    offset: [-12.5, 6.2, 12.8],
    title: { zh: '观景机位 3/4 · 繁花长廊与阳光生态温室', en: 'Scenic View 3/4 • Blossom Promenade & Solarium' }
  },
  {
    id: 'riverside_waterwheel',
    look: [8.4, 421.2, 38.2],
    offset: [-11.5, 5.8, -11.2],
    title: { zh: '观景机位 4/4 · 碧波水轮机与双桥溪流', en: 'Scenic View 4/4 • Emerald Stream & Waterwheel' }
  }
]);
export const HOMEWORLD_SKY_PLAQUES = Object.freeze([
  {
    id: 'sky_waterfall',
    platformId: 'hw_plat_waterfall',
    x: 49,
    z: 45,
    topY: 420.0 + 10.2,
    name: { zh: '叠瀑云台 · 风语碑', en: 'Cascade Terrace Plaque' },
    prompt: { zh: '按 [E] 阅读叠瀑云台风语碑', en: 'Press [E] to read Cascade Plaque' },
    note: {
      zh: '「河谷第一道水脉从东崖倾泻而下，灌溉着整片生态苗圃。先驱者曾在这里校对第一台水轮机的落差。」',
      en: '“The valley’s first cascade feeds the entire nursery. Pioneers calibrated the very first hydro-turbine here.”'
    }
  },
  {
    id: 'sky_astrolabe',
    platformId: 'hw_plat_astrolabe',
    x: -54,
    z: -36,
    topY: 420.0 + 12.6,
    name: { zh: '云端星盘 · 航标碑', en: 'Cloud-Astrolabe Plaque' },
    prompt: { zh: '按 [E] 阅读云端星盘航标碑', en: 'Press [E] to read Astrolabe Plaque' },
    note: {
      zh: '「站在 12.6 米高的云端星盘台地，能同时望见环带行星与星织号停机坪——那是所有远航船员的归途坐标。」',
      en: '“From 12.6m above the valley, both the ringed planet and Starweaver’s pad align — the homing beacon of every crew.”'
    }
  },
  {
    id: 'sky_arch',
    platformId: 'hw_plat_arch',
    x: 0,
    z: -62,
    topY: 420.0 + 11.4,
    name: { zh: '风帆拱门 · 竞速起跑柱', en: 'Wind-Sail Arch & Sky-Trial' },
    prompt: { zh: '按 [E] 启动翡翠穿环竞速挑战', en: 'Press [E] to start Emerald Sky-Trial' },
    note: {
      zh: '「穿越环绕翡翠河谷的 8 道光子环，挑战你的最短空中巡航纪录！」',
      en: '“Thread all 8 Emerald Valley photon rings in one flight to set your personal Sky-Trial record!”'
    }
  }
]);

export const HOMEWORLD_COPY = {
  title: { zh: '返航后的第一班巡检', en: 'The First Watch Home' },
  brief: { zh: '米拉：欢迎回家，米洛。观测坡、苗圃和河岸能源站需要一轮巡检。记录三处设备状态，再恢复水轮机供电，最后回来告诉我。无需消耗荒漠材料，进度随时保存。', en: 'Mira: Welcome home, Milo. Check the observatory, nursery and riverside station. Record all three, restore turbine power, then report back. No desert materials are needed; progress is saved.' },
  accept: { zh: '接取家园巡检', en: 'Accept the homeworld watch' },
  accepted: { zh: '巡检已接取。点击顶部巡检胶囊可随时查看下一站。', en: 'Watch accepted. Open the watch pill above to review your next stop.' },
  calibrate: { zh: '打开能源校准台', en: 'Open the power console' },
  sequence: { zh: '操作顺序：进水阀 → 调压器 → 社区电网。错误操作不会消耗物资，也不会清空已完成步骤。', en: 'Sequence: intake → voltage regulator → colony grid. Incorrect input costs nothing and preserves completed steps.' },
  wrongOrder: { zh: '联锁保护：请先完成当前高亮步骤。', en: 'Interlock active: complete the highlighted step first.' },
  restored: { zh: '能源站已并网。返回米拉队长交付巡检。', en: 'Power is online. Report back to Captain Mira.' },
  report: { zh: '交付巡检记录', en: 'Report the watch results' },
  completed: { zh: '家园巡检完成 · 获得返航纪念章，解锁谷地观景。', en: 'Watch complete · Homecoming Medallion awarded; valley views unlocked.' },
  view: { zh: '谷地观景', en: 'Valley view' },
  journal: { zh: '巡检手账', en: 'Watch journal' },
  returnCaptain: { zh: '返回米拉队长', en: 'Return to Captain Mira' },
  talkCaptain: { zh: '与米拉队长交谈', en: 'Speak to Captain Mira' },
  recordsFirst: { zh: '先完成三处设备记录，再恢复供电。', en: 'Record all three landmarks before restoring power.' },
  alreadyRecorded: { zh: '记录已保存，可在手账重读。', en: 'Reading saved. Review it in the journal.' },
  retry: { zh: '可自由探索；打开手账查看尚未完成的巡检。', en: 'Explore freely; open the journal to review unfinished work.' },
  atmoDawn: { zh: '🌅 金碧晨光', en: '🌅 Radiant Dawn' },
  atmoSunset: { zh: '🌇 黄金晚霞', en: '🌇 Golden Sunset' },
  atmoNight: { zh: '🌌 星河晴夜', en: '🌌 Starry Night' },
  cycleAtmosphere: { zh: '切换母星天象（晨光 / 晚霞 / 星夜）', en: 'Cycle Sky Atmosphere (Dawn / Sunset / Night)' },
  atmoSwitched: { zh: '母星观景台已切换天象氛围：', en: 'Observatory sky atmosphere set to: ' },
  atmoHintUnlocked: {
    zh: '★ 5 步母星巡检与荒漠气象信标已并网！可在西北观景台或母星卡片随时切换「金碧晨光 / 黄金晚霞 / 星河晴夜」观赏水面反射与纪念碑星芒。',
    en: '★ Homeworld Watch & Desert Climate Beacons linked! Switch between Radiant Dawn, Golden Sunset, and Starry Night at the Observatory or HUD card.'
  },
  ringBoostToast: {
    zh: '⚡ 穿过星轨光子环！喷气燃料已补充，推进加速中',
    en: '⚡ Photon Ring Cleared! Jetpack refueled & aerial boost active'
  },
  allRingsUnlocked: {
    zh: '★ 翡翠河谷 8 环高空巡航全部穿通！已解锁【黄金星芒推进器尾焰】！',
    en: '★ All 8 Valley Photon Rings cleared! Golden Starburst Jetflame unlocked!'
  },
  skyTrialStarted: {
    zh: '⏱ 翡翠穿环竞速已启动！连续穿越 8 道光子环刷新最佳纪录',
    en: '⏱ Emerald Sky-Trial started! Clear all 8 photon rings to set a record'
  },
  skyTrialRestarted: {
    zh: '⏱ 竞速计时已重置，重新起跑！',
    en: '⏱ Sky-Trial timer reset — go!'
  },
  skyTrialFinished: {
    zh: '★ 翡翠穿环竞速完成！用时 {sec}s{bestTag}',
    en: '★ Emerald Sky-Trial complete! Time: {sec}s{bestTag}'
  },
  plaqueRecorded: {
    zh: '✦ 已收录高空风语碑 ({done}/{total})',
    en: '✦ Sky Plaque recorded ({done}/{total})'
  },
  nurseryBloomPrompt: {
    zh: '按 [E] 移植 2 份荒漠晶簇点亮「星光生态花圃」',
    en: 'Press [E] to transplant 2 Desert Crystals into Star-Flora'
  },
  nurseryBloomedToast: {
    zh: '🌸 跨星引种成功！母星生态苗圃已绽放星光荧光花群',
    en: '🌸 Cross-World Transplant complete! Bioluminescent Star-Flora bloomed!'
  },
  nurseryNeedCrystals: {
    zh: '需携带至少 2 份石英或等离子晶簇方可进行跨星引种',
    en: 'Need at least 2 Quartz or Plasma Crystals for cross-world transplant'
  }
};
export function createHomeworldSurvey() {
  return {
    accepted: false,
    records: { observatory: false, nursery: false, energy: false },
    calibration: 0,
    completed: false,
    flightRings: {},
    skyPlaques: {},
    bestRingTrialSec: null,
    nurseryBloomed: false
  };
}
export function sanitizeHomeworldSurvey(raw) {
  const clean = createHomeworldSurvey();
  if (!raw) return clean;
  if (raw.nurseryBloomed === true) clean.nurseryBloomed = true;
  if (raw.flightRings && typeof raw.flightRings === 'object') {
    for (let i = 1; i <= 8; i++) {
      const k = `hw_ring_${i}`;
      if (raw.flightRings[k] === true) clean.flightRings[k] = true;
    }
  }
  if (raw.skyPlaques && typeof raw.skyPlaques === 'object') {
    for (const p of HOMEWORLD_SKY_PLAQUES) {
      if (raw.skyPlaques[p.id] === true) clean.skyPlaques[p.id] = true;
    }
  }
  if (Number.isFinite(Number(raw.bestRingTrialSec)) && Number(raw.bestRingTrialSec) > 0) {
    clean.bestRingTrialSec = Math.round(Number(raw.bestRingTrialSec) * 100) / 100;
  }
  if (raw.accepted !== true) return clean;
  clean.accepted = true;
  for (const point of HOMEWORLD_LANDMARKS) clean.records[point.id] = raw.records?.[point.id] === true;
  if (HOMEWORLD_LANDMARKS.every(point => clean.records[point.id])) {
    clean.calibration = Number.isInteger(raw.calibration) ? Math.max(0, Math.min(3, raw.calibration)) : 0;
  }
  clean.completed = clean.calibration === 3 && raw.completed === true;
  return clean;
}
