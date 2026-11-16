import { findPlatformAt } from '../utils/math.js';

// Structured, authoritative data for world geometry bounds, regions, materials, recipes,
// dynamic levels, main repair objectives, side tasks, resource placements, facilities, and lore logs.
// No gameplay rules or fixed level counts are scattered across UI or physics handlers.

export { WORLD_CONFIG } from './worldConfig.js';

export const REGIONS = {
  crash_basin: {
    id: 'crash_basin',
    unlockLevel: 1,
    name: { en: 'Crash Basin (Central Hub)', zh: '坠机盆地（中央营地）' },
    description: {
      en: 'The shallow sandy crater where the Starweaver came down, alongside an intact Solar Furnace and Fabrication Station.',
      zh: '星织号迫降的平缓沙地陨石坑，保留着完好的太阳能熔炼炉与精密制造台。'
    },
    center: { x: 0, z: 0 },
    clearZones: [{ x: 0, z: 0, radius: 15.5 }]
  },
  whispering_ridge: {
    id: 'whispering_ridge',
    unlockLevel: 2,
    name: { en: 'Whispering Ridge (East Signal Trail)', zh: '低语山脊（东侧信标小径）' },
    description: {
      en: 'An elevated eastern sandstone trail lined with signal cairns, rich in Sun-Quartz Crystals and Silver Filaments.',
      zh: '向东延伸的高地砂岩山脊，沿途立有引路信标石，盛产日光石英与银丝矿。'
    },
    center: { x: 46, z: -4 },
    gateBarrier: { x: 23.5, z: 0, radius: 4.5 },
    corridor: { from: [14, 0], to: [76, 0], halfWidth: 5.6 },
    signpost: {
      x: 18.0,
      z: 3.2,
      rotY: -Math.PI / 2,
      arrow: '↑',
      color: '#5ce6ff',
      en: 'E: Signal Ridge (Lv.2)',
      zh: '东: 低语山脊 (第2关)'
    },
    beaconTrail: {
      color: '#5ce6ff',
      pts: [[26, 1.5], [34, -1.5], [42, 1.8], [50, -1.5]]
    },
    speedZone: {
      minX: 20,
      maxX: 85,
      minZ: -16,
      maxZ: 16,
      requiresMechanism: 'cairns',
      speedMult: 1.32
    }
  },
  dry_canyon: {
    id: 'dry_canyon',
    unlockLevel: 3,
    name: { en: 'Dry Canyon & Research Outpost (South)', zh: '干涸峡谷与废弃科研站（南区）' },
    description: {
      en: 'A sheltered red-rock canyon housing an abandoned ecological outpost, Zeolite beds, and Coolant Gel pools.',
      zh: '南侧红岩干涸峡谷，留有废弃生态科研帐篷、便携加工台、沸石矿床与冷却凝胶池。'
    },
    center: { x: 2, z: 52 },
    gateBarrier: { x: 0, z: 24, radius: 4.5 },
    corridor: { from: [0, 14], to: [0, 72], halfWidth: 5.6 },
    clearZones: [{ x: -1.8, z: 50.8, radius: 6.5 }],
    signpost: {
      x: 3.2,
      z: 18.5,
      rotY: Math.PI,
      arrow: '↑',
      color: '#52ffb8',
      en: 'S: Dry Canyon (Lv.3)',
      zh: '南: 干涸峡谷 (第3关)'
    },
    beaconTrail: {
      color: '#52ffb8',
      pts: [[2.2, 28], [-2.2, 36], [2.2, 44], [-2.2, 52]]
    }
  },
  relay_gorge: {
    id: 'relay_gorge',
    unlockLevel: 4,
    name: { en: 'Ancient Relay Gorge & Star-Field (West)', zh: '远古中继峡谷与陨星原（西区）' },
    description: {
      en: 'A deep western gorge crossed by a Solar Hard-Light Bridge. Aligning two mirror pylons opens the Meteorite Star-Field beyond.',
      zh: '西侧被裂谷隔开的远古遗迹，校准两座太阳能反射塔即可架起硬光能量桥，通往对岸的陨铁星原。'
    },
    center: { x: -68, z: 0 },
    gateBarrier: { x: -24, z: 0, radius: 4.5 },
    corridor: { from: [-14, 0], to: [-88, 0], halfWidth: 5.6 },
    signpost: {
      x: -18.0,
      z: -3.2,
      rotY: Math.PI / 2,
      arrow: '↑',
      color: '#ffd666',
      en: 'W: Relay Gorge (Lv.4)',
      zh: '西: 中继峡谷 (第4关)'
    },
    beaconTrail: {
      color: '#ffd666',
      pts: [[-27, 2.0], [-33, -2.0], [-54, 2.0], [-65, -2.0], [-76, 2.5]]
    },
    speedZone: {
      minX: -90,
      maxX: -18,
      minZ: -18,
      maxZ: 18,
      requiresMechanism: 'pylons',
      speedMult: 1.24
    }
  },
  geothermal_field: {
    id: 'geothermal_field',
    unlockLevel: 5,
    name: { en: 'Basalt Geothermal Vents (North)', zh: '玄武岩地热喷口区（北区）' },
    description: {
      en: 'A warm volcanic terrace north of the crash site where high-energy Plasma Crystals condense around vents.',
      zh: '坠机点北侧的温暖玄武岩台地，高能等离子结晶在喷气孔旁不断凝结。'
    },
    center: { x: 0, z: -50 },
    gateBarrier: { x: 0, z: -24, radius: 4.5 },
    corridor: { from: [0, -14], to: [0, -72], halfWidth: 5.6 },
    signpost: {
      x: -3.2,
      z: -18.5,
      rotY: 0,
      arrow: '↑',
      color: '#ff78d0',
      en: 'N: Vent Field (Lv.5)',
      zh: '北: 地热喷口 (第5关)'
    },
    beaconTrail: {
      color: '#ff78d0',
      pts: [[-2.2, -28], [2.2, -37], [-2.2, -46], [2.2, -55]]
    }
  },
  salt_flats: {
    id: 'salt_flats',
    unlockLevel: 6,
    name: { en: 'Crystalline Salt Flats (Southeast Mirror)', zh: '晶化盐湖（东南天空之镜）' },
    description: {
      en: 'A vast mirror-smooth evaporite salt pan in the southeast basin, rich in Lithium Brine Salt and Starlight Halite Prisms.',
      zh: '东南盆地开阔如镜的蒸发岩卤水盐滩，盛产高纯锂卤晶盐与星芒岩盐棱晶。'
    },
    center: { x: 58, z: 58 },
    gateBarrier: { x: 24.0, z: 24.0, radius: 4.5, angle: Math.PI / 4 },
    corridor: { from: [14, 14], to: [58, 58], halfWidth: 6.4 },
    clearZones: [{ x: 58.0, z: 58.0, radius: 22.0 }],
    signpost: {
      x: 15.8,
      z: 12.6,
      rotY: -Math.PI * 0.75,
      arrow: '↑',
      color: '#6dfce8',
      en: 'SE: Salt Mirror (Lv.6)',
      zh: '东南: 晶化盐湖 (第6关)'
    },
    beaconTrail: {
      color: '#6dfce8',
      pts: [[27.5, 25.0], [34.0, 36.5], [42.5, 40.5], [48.5, 50.5]]
    },
    speedZone: {
      minX: 16,
      maxX: 72,
      minZ: 16,
      maxZ: 72,
      speedMult: 1.24
    }
  },
  mothership_graveyard: {
    id: 'mothership_graveyard',
    unlockLevel: 7,
    name: { en: 'Mothership Wreckage Field (Northwest)', zh: '母舰残骸带（西北先驱坟场）' },
    description: {
      en: 'Colossal fractured hull ribs and cargo bays of an ancient colony mothership, holding Hyper-Alloys and Quantum Cores.',
      zh: '远古先驱母舰坠毁留下的巨型拱肋与悬挑机翼废墟，封存着超导母舰装甲与量子奇点晶核。'
    },
    center: { x: -56, z: -56 },
    gateBarrier: { x: -24.0, z: -24.0, radius: 4.5, angle: -Math.PI * 0.75 },
    corridor: { from: [-14, -14], to: [-56, -56], halfWidth: 6.4 },
    clearZones: [{ x: -54.0, z: -54.0, radius: 18.5 }],
    signpost: {
      x: -15.8,
      z: -12.6,
      rotY: Math.PI * 0.25,
      arrow: '↑',
      color: '#b58cff',
      en: 'NW: Wreckage (Lv.7)',
      zh: '西北: 母舰残骸 (第7关)'
    },
    beaconTrail: {
      color: '#b58cff',
      pts: [[-27.5, -25.0], [-35.0, -33.0], [-42.5, -41.5], [-48.5, -47.0]]
    },
    speedZone: {
      minX: -72,
      maxX: -16,
      minZ: -72,
      maxZ: -16,
      speedMult: 1.24
    }
  }
};

// Nearest authored region center. Used so HUD, cargo and field workbenches follow
// the ground under the player instead of the oldest unlocked recipe list.
export function locateRegionId(x, z) {
  let bestId = 'crash_basin';
  let bestD = Infinity;
  for (const region of Object.values(REGIONS)) {
    const dx = x - region.center.x;
    const dz = z - region.center.z;
    const dist = dx * dx + dz * dz;
    if (dist < bestD) {
      bestD = dist;
      bestId = region.id;
    }
  }
  return bestId;
}

export { MATERIALS, getMaterialVisualArchetype } from './materialsData.js';
export { RECIPES, REPAIR_TARGETS, PREFLIGHT_CHECKS } from './recipesData.js';
export { CREW_LOGS } from './crewLogs.js';
export { LEVELS } from './levelsData.js';

// Standable 3D Sky-Mesa & Basalt Pillar Platforms (require Micro-Gravity Thruster Wings [Space] to reach!)
export const ELEVATED_PLATFORMS = [
  {
    id: 'plat_ridge_spire',
    region: 'whispering_ridge',
    x: 42.5,
    z: -8.8,
    radius: 3.3,
    topY: 8.0,
    style: 'sandstone'
  },
  {
    id: 'plat_gorge_south_spire',
    region: 'relay_gorge',
    x: -35.5,
    z: 6.8,
    radius: 3.6,
    topY: 5.4,
    style: 'sandstone'
  },
  {
    id: 'plat_starfield_mesa',
    region: 'relay_gorge',
    x: -70.0,
    z: -10.5,
    radius: 4.5,
    topY: 5.8,
    style: 'sandstone'
  },
  {
    id: 'plat_north_basalt_west',
    region: 'geothermal_field',
    x: -11.5,
    z: -44.0,
    radius: 3.6,
    topY: 5.6,
    style: 'basalt'
  },
  {
    id: 'plat_north_basalt_east',
    region: 'geothermal_field',
    x: 11.2,
    z: -49.5,
    radius: 3.6,
    topY: 5.8,
    style: 'basalt'
  },
  {
    id: 'plat_salt_mesa',
    region: 'salt_flats',
    x: 70.5,
    z: 47.5,
    radius: 3.8,
    topY: 5.2,
    style: 'sandstone'
  },
  {
    id: 'plat_wreck_deck',
    region: 'mothership_graveyard',
    x: -64.5,
    z: -48.0,
    radius: 4.1,
    topY: 5.6,
    style: 'basalt'
  }
];

export function getElevatedPlatformAt(x, z, margin = 0) {
  return findPlatformAt(ELEVATED_PLATFORMS, x, z, margin);
}

// Deterministic resource node placements across the 5 regions.
// `subsurface: true` veins lie beneath glowing seismic cracks and require the Spiral Geo-Drill [E] (with Sonar [V]).
// `elevated: true` veins sit atop high Sky-Mesas / Basalt Pillars requiring Micro-Gravity Thruster Wings [Space].
export const RESOURCE_NODES = [
  // --- Crash Basin (Level 1 Hub — Surface Tutorial Veins) ---
  { id: 'n_cb_iron_1', materialId: 'iron_scrap', yield: 2, x: 10.5, z: 7.2, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_iron_2', materialId: 'iron_scrap', yield: 2, x: -11.0, z: 6.8, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_iron_3', materialId: 'iron_scrap', yield: 2, x: 6.8, z: -12.4, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_iron_4', materialId: 'iron_scrap', yield: 2, x: -13.5, z: -6.2, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_cop_1', materialId: 'copper_ore', yield: 2, x: 13.8, z: -3.5, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_cop_2', materialId: 'copper_ore', yield: 2, x: -9.4, z: 13.2, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_cop_3', materialId: 'copper_ore', yield: 2, x: 15.2, z: 11.5, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_cop_4', materialId: 'copper_ore', yield: 2, x: -15.8, z: 2.0, region: 'crash_basin', regrow: 22 },
  { id: 'n_cb_qtz_1', materialId: 'quartz_crystal', yield: 2, x: 18.5, z: -11.0, region: 'crash_basin', regrow: 25 },
  { id: 'n_cb_qtz_2', materialId: 'quartz_crystal', yield: 2, x: -18.2, z: -12.5, region: 'crash_basin', regrow: 25 },

  // --- Whispering Ridge (East, Level 2 — Surface + Bonus Subsurface & Sky-Spire Teasers!) ---
  { id: 'n_wr_qtz_1', materialId: 'quartz_crystal', yield: 2, x: 31.0, z: 3.5, region: 'whispering_ridge', regrow: 22 },
  { id: 'n_wr_qtz_2', materialId: 'quartz_crystal', yield: 2, x: 40.5, z: -3.6, region: 'whispering_ridge', regrow: 22 },
  { id: 'n_wr_qtz_3', materialId: 'quartz_crystal', yield: 2, x: 50.0, z: 4.8, region: 'whispering_ridge', regrow: 22 },
  { id: 'n_wr_sil_1', materialId: 'silver_ore', yield: 2, x: 36.5, z: 6.4, region: 'whispering_ridge', regrow: 22 },
  { id: 'n_wr_sil_2', materialId: 'silver_ore', yield: 2, x: 46.2, z: -2.0, region: 'whispering_ridge', regrow: 22 },
  { id: 'n_wr_sil_3', materialId: 'silver_ore', yield: 2, x: 55.5, z: -4.5, region: 'whispering_ridge', regrow: 22 },
  { id: 'n_wr_cop_1', materialId: 'copper_ore', yield: 2, x: 43.0, z: 8.5, region: 'whispering_ridge', regrow: 22 },
  // Bonus teaser veins on Ridge (rewarding later Drill / Jetpack return!)
  { id: 'n_wr_sub_sil', materialId: 'silver_ore', yield: 3, x: 49.0, z: -6.8, region: 'whispering_ridge', regrow: 25, subsurface: true },
  { id: 'n_wr_sky_qtz', materialId: 'quartz_crystal', yield: 3, x: 42.5, z: -8.8, region: 'whispering_ridge', regrow: 25, elevated: true, platformId: 'plat_ridge_spire' },

  // --- Dry Canyon & Research Outpost (South, Level 3 — Subsurface Geo-Drill Veins + Surface Drill Prep) ---
  { id: 'n_dc_zeo_1', materialId: 'zeolite_ore', yield: 3, x: -6.5, z: 34.0, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_zeo_2', materialId: 'zeolite_ore', yield: 2, x: 7.2, z: 41.5, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_zeo_3', materialId: 'zeolite_ore', yield: 3, x: -8.8, z: 48.0, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_zeo_4', materialId: 'zeolite_ore', yield: 2, x: 9.5, z: 58.0, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_gel_1', materialId: 'coolant_gel', yield: 3, x: 5.5, z: 33.5, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_gel_2', materialId: 'coolant_gel', yield: 2, x: -4.5, z: 43.0, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_gel_3', materialId: 'coolant_gel', yield: 3, x: 2.5, z: 56.5, region: 'dry_canyon', regrow: 20, subsurface: true },
  { id: 'n_dc_qtz_1', materialId: 'quartz_crystal', yield: 2, x: -10.5, z: 60.5, region: 'dry_canyon', regrow: 20 },
  { id: 'n_dc_qtz_2', materialId: 'quartz_crystal', yield: 2, x: 8.5, z: 48.5, region: 'dry_canyon', regrow: 20 },
  { id: 'n_dc_iron_1', materialId: 'iron_scrap', yield: 2, x: 1.5, z: 47.0, region: 'dry_canyon', regrow: 20 },
  { id: 'n_dc_cop_1', materialId: 'copper_ore', yield: 2, x: -2.0, z: 59.5, region: 'dry_canyon', regrow: 20 },

  // --- Ancient Relay Gorge & Meteorite Star-Field (West, Level 4 — Sky-Mesa Jetpack Veins + Surface) ---
  { id: 'n_rg_sil_1', materialId: 'silver_ore', yield: 2, x: -29.5, z: 4.8, region: 'relay_gorge', regrow: 20 },
  { id: 'n_rg_qtz_1', materialId: 'quartz_crystal', yield: 2, x: -32.5, z: -6.0, region: 'relay_gorge', regrow: 20 },
  // Across Hard-Light Bridge: mix of ground & High Star-Field Sky-Mesa! (declaratively gated by `pylons` mechanism)
  { id: 'n_rg_tit_1', materialId: 'titanium_ore', yield: 2, x: -55.5, z: -5.5, region: 'relay_gorge', regrow: 20, requiresMechanism: 'pylons' },
  { id: 'n_rg_tit_2', materialId: 'titanium_ore', yield: 3, x: -71.2, z: -11.3, region: 'relay_gorge', regrow: 20, elevated: true, platformId: 'plat_starfield_mesa', requiresMechanism: 'pylons' },
  { id: 'n_rg_tit_3', materialId: 'titanium_ore', yield: 2, x: -82.0, z: 6.5, region: 'relay_gorge', regrow: 20, requiresMechanism: 'pylons' },
  { id: 'n_rg_lum_1', materialId: 'lumen_core', yield: 2, x: -57.0, z: 7.5, region: 'relay_gorge', regrow: 20, requiresMechanism: 'pylons' },
  { id: 'n_rg_lum_2', materialId: 'lumen_core', yield: 3, x: -68.8, z: -9.6, region: 'relay_gorge', regrow: 20, elevated: true, platformId: 'plat_starfield_mesa', requiresMechanism: 'pylons' },
  { id: 'n_rg_lum_3', materialId: 'lumen_core', yield: 3, x: -84.5, z: -5.5, region: 'relay_gorge', regrow: 20, subsurface: true, requiresMechanism: 'pylons' },

  // --- Basalt Geothermal Vents (North, Level 5 — Dual-Capability Finale: Basalt Sky-Pillars + Deep Plasma Fissures!) ---
  { id: 'n_gf_pla_1', materialId: 'plasma_crystal', yield: 3, x: -5.5, z: -36.0, region: 'geothermal_field', regrow: 20, subsurface: true },
  { id: 'n_gf_pla_2', materialId: 'plasma_crystal', yield: 2, x: 6.2, z: -43.5, region: 'geothermal_field', regrow: 20, subsurface: true },
  { id: 'n_gf_pla_3', materialId: 'plasma_crystal', yield: 3, x: -7.5, z: -51.0, region: 'geothermal_field', regrow: 20, subsurface: true },
  { id: 'n_gf_pla_4', materialId: 'plasma_crystal', yield: 2, x: 4.0, z: -58.5, region: 'geothermal_field', regrow: 20, subsurface: true },
  { id: 'n_gf_tit_1', materialId: 'titanium_ore', yield: 3, x: -11.5, z: -44.0, region: 'geothermal_field', regrow: 20, elevated: true, platformId: 'plat_north_basalt_west' },
  { id: 'n_gf_tit_2', materialId: 'titanium_ore', yield: 3, x: 11.2, z: -49.5, region: 'geothermal_field', regrow: 20, elevated: true, platformId: 'plat_north_basalt_east' },
  { id: 'n_gf_gel_1', materialId: 'coolant_gel', yield: 3, x: -3.2, z: -61.0, region: 'geothermal_field', regrow: 20, subsurface: true },
  { id: 'n_gf_iron_1', materialId: 'iron_scrap', yield: 2, x: 9.8, z: -34.5, region: 'geothermal_field', regrow: 20 },
  { id: 'n_gf_cop_1', materialId: 'copper_ore', yield: 2, x: -9.2, z: -32.5, region: 'geothermal_field', regrow: 20 },

  // --- Crystalline Salt Flats (Southeast Diagonal, Level 6 — Sky-Mirror Salt Pan + Subsurface Brine + Salt Mesa!) ---
  { id: 'n_sf_lit_1', materialId: 'lithium_salt', yield: 3, x: 47.5, z: 44.0, region: 'salt_flats', regrow: 20 },
  { id: 'n_sf_lit_2', materialId: 'lithium_salt', yield: 2, x: 54.5, z: 63.5, region: 'salt_flats', regrow: 20 },
  { id: 'n_sf_lit_3', materialId: 'lithium_salt', yield: 2, x: 64.0, z: 53.0, region: 'salt_flats', regrow: 20 },
  { id: 'n_sf_lit_4', materialId: 'lithium_salt', yield: 3, x: 61.5, z: 68.5, region: 'salt_flats', regrow: 22, subsurface: true },
  { id: 'n_sf_hal_1', materialId: 'halite_crystal', yield: 3, x: 50.5, z: 58.0, region: 'salt_flats', regrow: 20 },
  { id: 'n_sf_hal_2', materialId: 'halite_crystal', yield: 2, x: 66.5, z: 63.0, region: 'salt_flats', regrow: 20 },
  { id: 'n_sf_hal_3', materialId: 'halite_crystal', yield: 3, x: 52.0, z: 48.5, region: 'salt_flats', regrow: 22, subsurface: true },
  { id: 'n_sf_hal_4', materialId: 'halite_crystal', yield: 3, x: 70.5, z: 47.5, region: 'salt_flats', regrow: 22, elevated: true, platformId: 'plat_salt_mesa' },
  { id: 'n_sf_tit_1', materialId: 'titanium_ore', yield: 2, x: 42.5, z: 38.5, region: 'salt_flats', regrow: 20 },
  { id: 'n_sf_qtz_1', materialId: 'quartz_crystal', yield: 2, x: 69.0, z: 57.5, region: 'salt_flats', regrow: 20 },

  // --- Mothership Wreckage Field (Northwest Diagonal, Level 7 Finale — Hull Ribs + Elevated Cargo Deck + Deep Vaults!) ---
  { id: 'n_mg_hyp_1', materialId: 'hyper_alloy', yield: 3, x: -45.0, z: -42.5, region: 'mothership_graveyard', regrow: 20 },
  { id: 'n_mg_hyp_2', materialId: 'hyper_alloy', yield: 2, x: -53.5, z: -61.5, region: 'mothership_graveyard', regrow: 20 },
  { id: 'n_mg_hyp_3', materialId: 'hyper_alloy', yield: 2, x: -62.5, z: -56.0, region: 'mothership_graveyard', regrow: 20 },
  { id: 'n_mg_hyp_4', materialId: 'hyper_alloy', yield: 3, x: -59.5, z: -67.5, region: 'mothership_graveyard', regrow: 22, subsurface: true },
  { id: 'n_mg_qua_1', materialId: 'quantum_core', yield: 3, x: -51.5, z: -52.5, region: 'mothership_graveyard', regrow: 20 },
  { id: 'n_mg_qua_2', materialId: 'quantum_core', yield: 3, x: -64.5, z: -48.0, region: 'mothership_graveyard', regrow: 22, elevated: true, platformId: 'plat_wreck_deck' },
  { id: 'n_mg_qua_3', materialId: 'quantum_core', yield: 3, x: -67.5, z: -61.0, region: 'mothership_graveyard', regrow: 22, subsurface: true },
  { id: 'n_mg_sil_1', materialId: 'silver_ore', yield: 2, x: -41.5, z: -47.0, region: 'mothership_graveyard', regrow: 20 },
  { id: 'n_mg_pla_1', materialId: 'plasma_crystal', yield: 2, x: -48.0, z: -65.0, region: 'mothership_graveyard', regrow: 20, subsurface: true }
];

// === Declarative Processing Station Registry ===
// Adding a new processing station kind (e.g., crystallizer, observatory_decoder) only requires adding an entry here!
export const STATION_TYPES = {
  furnace: {
    id: 'furnace',
    icon: '🔥',
    processSymbol: '━━🔥━━▶',
    themeClass: 'furnace',
    btnClass: 'amber-btn',
    waypointColor: '#ff9d3b',
    waitColor: '#ffbe4d',
    soundStyle: 'thermal',
    speedFactorKey: 'solar_thermal',
    name: { en: 'Smelting Furnace', zh: '太阳能熔炼炉' },
    subTitle: {
      en: 'SOLAR THERMAL CRUCIBLE • 1,420°C ORE REFINING',
      zh: '高温聚光熔炼坩埚 · 1,420°C 原矿提纯锻造'
    },
    filterLabel: { en: 'Solar Smelting', zh: '熔炼提纯' },
    waitLabel: {
      en: 'Waiting for {item} to finish smelting...',
      zh: '等待【{item}】熔炼出炉...'
    }
  },
  fabricator: {
    id: 'fabricator',
    icon: '⚙️',
    processSymbol: '━━⚡━━▶',
    themeClass: 'fabricator',
    btnClass: 'primary',
    waypointColor: '#5ce8ff',
    waitColor: '#5ce8ff',
    soundStyle: 'precision',
    speedFactorKey: null,
    name: { en: 'Fabrication Station', zh: '精密制造台' },
    subTitle: {
      en: 'PRECISION CAD LASER ASSEMBLY GANTRY',
      zh: '数控激光精密制造平台 · 飞船模块总装'
    },
    filterLabel: { en: 'Precision Assembly', zh: '精密组装' },
    waitLabel: {
      en: 'Waiting for {item} to finish fabricating...',
      zh: '等待【{item}】精密组装完成...'
    }
  }
};

// === Declarative Permanent Equipment & Station Facility Upgrade Registry ===
// Adding new passive/active gear (e.g., wide_treads, high_tank, wide_sonar) only requires registering an entry here!
export const EQUIPMENT_DEFS = {
  drill: {
    slot: 'drill',
    itemId: 'geo_drill',
    unlockLevel: 3,
    mandatoryFromLevel: 3,
    legacyGrantOnRepair: 'repair_lifesupport',
    iconShape: 'auger',
    actionId: 'sonar',
    showsFuelGauge: false,
    waypointColor: '#ffb03a',
    badgeKey: 'gearDrillBadge',
    toastKey: 'equipDrillToast',
    waitText: {
      en: 'Assembling Spiral Geo-Drill — standby...',
      zh: '正在组装【螺旋地质钻头与脉冲声呐】，请稍候...'
    },
    modifiers: {
      sonarRange: 42
    }
  },
  jetpack: {
    slot: 'jetpack',
    itemId: 'jetpack_wing',
    unlockLevel: 4,
    mandatoryFromLevel: 4,
    legacyGrantOnRepair: 'repair_nav',
    iconShape: 'wings',
    actionId: null,
    showsFuelGauge: true,
    waypointColor: '#5ef2ff',
    badgeKey: 'gearJetpackBadge',
    toastKey: 'equipJetpackToast',
    waitText: {
      en: 'Assembling Micro-Gravity Thruster Wings — standby...',
      zh: '正在组装【微重力喷气飞行翼】，请稍候...'
    },
    modifiers: {
      jetpackFuelMult: 1.0
    }
  },
  battery: {
    slot: 'battery',
    itemId: 'solar_battery',
    unlockLevel: 2,
    mandatoryFromLevel: null,
    legacyGrantOnRepair: null,
    iconShape: 'battery',
    actionId: null,
    showsFuelGauge: false,
    waypointColor: '#ffd24d',
    badgeKey: 'gearBatteryBadge',
    toastKey: 'equipBatteryToast',
    waitText: {
      en: 'Assembling Phase-Change Storage Battery — standby...',
      zh: '正在组装【相变储能稳压电池组】，请稍候...'
    },
    modifiers: {
      furnaceMinFloor: 1.0
    }
  },
  treads: {
    slot: 'treads',
    itemId: 'wide_treads',
    unlockLevel: 3,
    mandatoryFromLevel: null,
    legacyGrantOnRepair: null,
    iconShape: 'treads',
    actionId: null,
    showsFuelGauge: false,
    waypointColor: '#ff9c52',
    badgeKey: 'gearTreadsBadge',
    toastKey: 'equipTreadsToast',
    waitText: {
      en: 'Assembling All-Terrain Wide Treads — standby...',
      zh: '正在组装【全地形宽幅防风履带】，请稍候...'
    },
    modifiers: {
      moveSpeedMult: 1.22,
      stormDragImmunity: 1.0
    }
  },
  drone_fleet: {
    slot: 'drone_fleet',
    itemId: 'mining_drone',
    unlockLevel: 4,
    mandatoryFromLevel: null,
    legacyGrantOnRepair: null,
    iconShape: 'drone',
    actionId: null,
    showsFuelGauge: false,
    waypointColor: '#8affc1',
    badgeKey: 'gearDroneBadge',
    toastKey: 'equipDroneToast',
    waitText: {
      en: 'Deploying Autonomous Mining Drone Bay — standby...',
      zh: '正在部署【自动巡航采矿无人机坞】，请稍候...'
    },
    modifiers: {
      droneIntervalSec: 14
    }
  },
  fuel_tank: {
    slot: 'fuel_tank',
    itemId: 'high_tank',
    unlockLevel: 5,
    mandatoryFromLevel: null,
    legacyGrantOnRepair: null,
    iconShape: 'tank',
    actionId: null,
    showsFuelGauge: false,
    waypointColor: '#66ffba',
    badgeKey: 'gearTankBadge',
    toastKey: 'equipTankToast',
    waitText: {
      en: 'Assembling High-Capacity Thruster Tank — standby...',
      zh: '正在组装【高能压缩推进气罐】，请稍候...'
    },
    modifiers: {
      jetpackFuelMult: 2.0,
      airSpeedMult: 1.15
    }
  },
  sonar_array: {
    slot: 'sonar_array',
    itemId: 'wide_sonar',
    unlockLevel: 6,
    mandatoryFromLevel: null,
    legacyGrantOnRepair: null,
    iconShape: 'sonar',
    actionId: null,
    showsFuelGauge: false,
    waypointColor: '#7af0ff',
    badgeKey: 'gearWideSonarBadge',
    toastKey: 'equipWideSonarToast',
    waitText: {
      en: 'Calibrating Deep-Spectrum 85m Sonar Array — standby...',
      zh: '正在校准【广域深层谐振声呐】，请稍候...'
    },
    modifiers: {
      sonarRange: 85
    }
  }
};

// === Declarative Planar-Reflected Brine & Salt Mirror Pools ===
export const BRINE_POOLS = [
  {
    id: 'hub_seep_pool',
    region: 'crash_basin',
    x: -4.45,
    z: 7.65,
    heightOffset: 0.026,
    radiusX: 3.65,
    radiusZ: 2.75,
    rotationY: 0.34,
    tintDeep: '#0d3648',
    tintRim: '#32c8dc',
    sandColor: '#bd7f54'
  },
  {
    id: 'canyon_brine_pool',
    region: 'dry_canyon',
    x: -2.2,
    z: 38.5,
    heightOffset: 0.04,
    radiusX: 4.5,
    radiusZ: 3.45,
    rotationY: -0.22,
    tintDeep: '#0a423e',
    tintRim: '#3ef2c8',
    sandColor: '#9e543d'
  },
  {
    id: 'southeast_salt_mirror',
    region: 'salt_flats',
    x: 58.0,
    z: 58.0,
    heightOffset: 0.032,
    radiusX: 16.2,
    radiusZ: 14.8,
    rotationY: Math.PI / 4,
    tintDeep: '#10495c',
    tintRim: '#78f7eb',
    sandColor: '#d9e6e8'
  }
];

const _FURNACE_STATION = {
  id: 'furnace',
  type: 'station',
  stationKind: 'furnace',
  stationKinds: ['furnace'],
  unlockLevel: 1,
  region: 'crash_basin',
  x: 8.2,
  z: 2.2,
  radius: 1.45,
  promptKey: 'promptFurnace',
  name: { en: 'Solar Smelting Furnace', zh: '太阳能熔炼炉' },
  inspectDesc: {
    en: 'Concentrates desert sunlight to smelt raw ores and minerals into refined plates, ingots, lenses, and fuel rods.',
    zh: '汇聚荒漠阳光的高温熔炼炉，可将原矿提纯为铁板、紫铜锭、石英透镜与燃料棒。'
  }
};

const _FABRICATOR_STATION = {
  id: 'fabricator',
  type: 'station',
  stationKind: 'fabricator',
  stationKinds: ['fabricator'],
  unlockLevel: 1,
  region: 'crash_basin',
  x: -8.2,
  z: 2.2,
  radius: 1.45,
  promptKey: 'promptFabricator',
  name: { en: 'Precision Fabrication Station', zh: '精密制造台' },
  inspectDesc: {
    en: 'Automated assembly bench that combines refined materials into sub-assemblies and spacecraft repair modules.',
    zh: '自动化精密组装平台，可将精炼材料加工为子部件与飞船核心修复总成。'
  }
};

const _OUTPOST_STATION = {
  id: 'outpost_purifier',
  type: 'station',
  stationKind: 'both',
  stationKinds: ['furnace', 'fabricator'],
  unlockLevel: 3,
  region: 'dry_canyon',
  x: 0.5,
  z: 51.0,
  radius: 1.4,
  accentColor: '#52ffb8',
  promptKey: 'promptPurifier',
  name: { en: 'Outpost Field Smelter & Fabricator', zh: '科研站便携熔炼制造一体台' },
  badgeZh: ['🧪 前哨便携一体台', '支持现场熔炼 + 维生组装'],
  badgeEn: ['🧪 Outpost Workbench', 'Field Smelter & Fabricator'],
  inspectDesc: {
    en: 'Field workbench left by the research team — supports both smelting and fabrication right inside Dry Canyon!',
    zh: '科研队留下的便携工程台，支持在峡谷现场直接进行熔炼与合成，省去来回奔波！'
  }
};

const _SALT_FIELD_STATION = {
  id: 'salt_field_station',
  type: 'station',
  stationKind: 'both',
  stationKinds: ['furnace', 'fabricator'],
  unlockLevel: 6,
  region: 'salt_flats',
  x: 43.2,
  z: 46.2,
  radius: 1.4,
  accentColor: '#6dfce8',
  promptKey: 'promptPurifier',
  name: { en: 'Salt-Mirror Field Workbench', zh: '盐湖科考便携熔炼制造一体台' },
  badgeZh: ['💎 盐湖便携一体台', '现场烧结锂电芯 + 护盾总装'],
  badgeEn: ['💎 Salt-Pan Workbench', 'On-Site Smelting & Shield Assembly'],
  inspectDesc: {
    en: 'Optics survey field station on the Salt Flats — refine Lithium Cells & Halite Prisms and assemble the Photonic Shield right on shore!',
    zh: '光学考察队架设在盐湖岸边的便携一体台，可就地熔炼锂电芯与岩盐棱镜并总装热护盾，无需长途折返营地！'
  }
};

const _WRECK_FIELD_STATION = {
  id: 'wreck_field_station',
  type: 'station',
  stationKind: 'both',
  stationKinds: ['furnace', 'fabricator'],
  unlockLevel: 7,
  region: 'mothership_graveyard',
  x: -42.2,
  z: -39.5,
  radius: 1.4,
  accentColor: '#c58cff',
  promptKey: 'promptPurifier',
  name: { en: 'Salvage Field Smelter & Gantry', zh: '先驱营地便携熔炼制造一体台' },
  badgeZh: ['⚡ 先驱便携一体台', '现场锻造跃迁线圈 + 跃迁环总装'],
  badgeEn: ['⚡ Salvage Workbench', 'On-Site Warp Coil & Ring Assembly'],
  inspectDesc: {
    en: 'Pioneer salvage workbench beside the Dawnstrider hull — forge Warp Coils and Quantum Matrices right at the wreckage site!',
    zh: '先驱打捞队留在母舰残骸入口的便携工程台，支持现场熔锻跃迁线圈并组装量子跃迁环！'
  }
};

export const WORLD_FACILITIES = {
  furnace: _FURNACE_STATION,
  fabricator: _FABRICATOR_STATION,
  outpost_purifier: _OUTPOST_STATION,
  salt_field_station: _SALT_FIELD_STATION,
  wreck_field_station: _WRECK_FIELD_STATION,
  stations: [_FURNACE_STATION, _FABRICATOR_STATION, _OUTPOST_STATION, _SALT_FIELD_STATION, _WRECK_FIELD_STATION],
  cairns: [
    { id: 'cairn_1', x: 28.5, z: -1.5, region: 'whispering_ridge' },
    { id: 'cairn_2', x: 44.0, z: 2.2, region: 'whispering_ridge' }
  ],
  pylons: [
    { id: 'pylon_north', x: -35.5, z: -6.8, region: 'relay_gorge' },
    {
      id: 'pylon_south',
      x: -35.5,
      z: 6.8,
      region: 'relay_gorge',
      elevated: true,
      platformId: 'plat_gorge_south_spire'
    }
  ],
  observatory: {
    id: 'observatory_dish',
    x: -61.5,
    z: -3.2,
    radius: 1.6,
    region: 'relay_gorge'
  },
  weather_beacons: [
    { id: 'wbeacon_ridge', x: 52.5, z: 2.5, region: 'whispering_ridge' },
    { id: 'wbeacon_canyon', x: 5.5, z: 54.0, region: 'dry_canyon' },
    { id: 'wbeacon_gorge', x: -61.5, z: 6.5, region: 'relay_gorge' },
    { id: 'wbeacon_vents', x: -6.5, z: -48.5, region: 'geothermal_field' },
    { id: 'wbeacon_salt', x: 46.5, z: 62.0, region: 'salt_flats' }
  ],
  boarding_ramp: {
    id: 'boarding_ramp',
    x: 3.3,
    z: 1.8
  }
};

// === Declarative Interactive World Mechanisms Registry ===
// Supports multi-node alignment groups (cairns, pylons, post-game weather_beacons) and single-flag restorations (observatory).
export const WORLD_MECHANISMS = {
  cairns: {
    id: 'cairns',
    kind: 'group',
    stateProp: 'cairnsActivated',
    region: 'whispering_ridge',
    interactKind: 'cairn',
    interactRange: 3.0,
    nodes: WORLD_FACILITIES.cairns,
    promptActiveKey: 'promptCairn',
    promptDoneKey: 'promptCairnDone',
    waypointColor: '#70f8ff'
  },
  pylons: {
    id: 'pylons',
    kind: 'group',
    stateProp: 'pylonsAligned',
    region: 'relay_gorge',
    interactKind: 'pylon',
    interactRange: 3.2,
    nodes: WORLD_FACILITIES.pylons,
    promptActiveKey: 'promptPylonAlign',
    promptDoneKey: 'promptPylonDone',
    waypointColor: '#ffd666',
    inspectTitle: { en: 'Solar Relay Pylon', zh: '太阳能中继反射塔' },
    inspectBody: {
      en: 'Aligning both Solar Mirror Pylons channels photonic energy through the glowing cables to extend the Hard-Light Gorge Bridge.',
      zh: '将反射镜对准恒星即可通过地面发光线缆为裂谷硬光桥供能（需校准全部 2 座反射塔）。'
    },
    waypointGroundLabel: {
      en: 'Head West & Align Solar Mirror Pylon ({done}/{total}) to open bridge',
      zh: '向西前往峡谷校准【太阳能反射塔】({done}/{total}) 架通光桥'
    },
    waypointElevatedLabel: {
      en: 'Hold [Space] to fly atop South Spire & Align Solar Pylon ({done}/{total})',
      zh: '按住 [Space] 喷气飞上南侧孤峰校准【太阳能反射塔】({done}/{total})'
    }
  },
  observatory: {
    id: 'observatory',
    kind: 'flag',
    stateProp: 'observatoryRestored',
    region: 'relay_gorge',
    interactKind: 'observatory',
    interactRange: 3.4,
    nodes: [WORLD_FACILITIES.observatory],
    promptActiveKey: 'promptObservatory',
    promptDoneKey: 'promptObservatoryDone',
    waypointColor: '#7ef4ff'
  },
  weather_beacons: {
    id: 'weather_beacons',
    kind: 'group',
    stateProp: 'weatherBeaconsDeployed',
    postGameOnly: true,
    interactKind: 'weather_beacon',
    interactRange: 3.1,
    nodes: WORLD_FACILITIES.weather_beacons,
    promptActiveKey: 'promptWeatherBeacon',
    promptDoneKey: 'promptWeatherBeaconDone',
    waypointColor: '#66ffc2',
    inspectTitle: { en: 'Planetary Climate Telemetry Beacon', zh: '行星科考气象遥测信标' },
    inspectBody: {
      en: 'Post-Game Expedition Commission — Activating all 5 regional telemetry beacons links Kharis-4’s climate grid to Homeworld!',
      zh: '终局科考委托 —— 激活分布在五大生态区的全部 5 座气象遥测信标，即可将卡里斯-4 的大气监测网并入母星科研院！'
    }
  }
};

export const DESERT_UPDRAFTS = [
  { id: 'desert_updraft_canyon', regionId: 'dry_canyon', x: 8, z: 51, radius: 3.4, topOffset: 24.0, color: '#63ffbe', label: { en: 'Canyon Thermal', zh: '峡谷上升气流' } },
  { id: 'desert_updraft_vent', regionId: 'geothermal_field', x: -12, z: -56, radius: 3.6, topOffset: 25.0, color: '#ff8a50', label: { en: 'Geothermal Geyser Plume', zh: '地热高压喷流' } },
  { id: 'desert_updraft_gorge', regionId: 'relay_gorge', x: -74, z: 14, radius: 3.4, topOffset: 24.0, color: '#ffd666', label: { en: 'Gorge Wind Shear', zh: '裂谷上升风柱' } }
];

export const DESERT_AERIAL_MOTES = [
  { id: 'dmote_1', x: 8, z: 51, yOffset: 15.5, rewardMat: 'refined_quartz', count: 1, respawnSec: 55, color: '#78ffd6' },
  { id: 'dmote_2', x: -2, z: 46, yOffset: 12.2, rewardMat: 'refined_quartz', count: 1, respawnSec: 55, color: '#78ffd6' },
  { id: 'dmote_3', x: -12, z: -56, yOffset: 16.0, rewardMat: 'plasma_crystal', count: 1, respawnSec: 60, color: '#ff9b6a' },
  { id: 'dmote_4', x: 6, z: -60, yOffset: 13.0, rewardMat: 'thermal_alloy', count: 1, respawnSec: 65, color: '#ff9b6a' },
  { id: 'dmote_5', x: -74, z: 14, yOffset: 15.8, rewardMat: 'star_iron_ingot', count: 1, respawnSec: 60, color: '#ffd666' },
  { id: 'dmote_6', x: -56, z: -12, yOffset: 12.6, rewardMat: 'silver_wire', count: 1, respawnSec: 55, color: '#ffd666' },
  { id: 'dmote_7', x: 34, z: 4, yOffset: 9.2, rewardMat: 'refined_quartz', count: 1, respawnSec: 50, color: '#75ecff' },
  { id: 'dmote_8', x: 38, z: 42, yOffset: 10.8, rewardMat: 'zeolite_core', count: 1, respawnSec: 60, color: '#75ecff' }
];
