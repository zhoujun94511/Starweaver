// Structured, authoritative data for regions, materials, recipes, 5 levels,
// main repair objectives, side tasks, resource placements, facilities, and lore logs.
// No gameplay rules are scattered across UI handlers.

export const REGIONS = {
  crash_basin: {
    id: 'crash_basin',
    unlockLevel: 1,
    name: { en: 'Crash Basin (Central Hub)', zh: '坠机盆地（中央营地）' },
    description: {
      en: 'The shallow sandy crater where the Starweaver came down, alongside an intact Solar Furnace and Fabrication Station.',
      zh: '星织号迫降的平缓沙地陨石坑，保留着完好的太阳能熔炼炉与精密制造台。'
    },
    center: { x: 0, z: 0 }
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
    gateBarrier: { x: 23.5, z: 0, radius: 4.5 }
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
    gateBarrier: { x: 0, z: 24, radius: 4.5 }
  },
  relay_gorge: {
    id: 'relay_gorge',
    unlockLevel: 4,
    name: { en: 'Ancient Relay Gorge & Star-Field (West)', zh: '远古中继峡谷与陨星原（西区）' },
    description: {
      en: 'A deep western gorge crossed by a Solar Hard-Light Bridge. Aligning two mirror pylons opens the Meteorite Star-Field beyond.',
      zh: '西侧被裂谷隔开的远古遗迹，校准两座太阳能反射塔即可架起硬光能量桥，通往对岸的陨铁星原。'
    },
    center: { x: -56, z: 0 },
    gateBarrier: { x: -24, z: 0, radius: 4.5 }
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
    gateBarrier: { x: 0, z: -24, radius: 4.5 }
  }
};

export const MATERIALS = {
  // === Raw Materials ===
  iron_scrap: {
    id: 'iron_scrap',
    category: 'raw',
    color: '#8e9aa8',
    emissive: '#1b222c',
    name: { en: 'Hull Iron Scrap', zh: '船体废铁块' },
    sourceRegions: ['crash_basin', 'geothermal_field'],
    description: {
      en: 'Sturdy metallic plating scattered around the Crash Basin.',
      zh: '散落在坠机盆地四周的坚固金属残片。'
    }
  },
  copper_ore: {
    id: 'copper_ore',
    category: 'raw',
    color: '#d97b43',
    emissive: '#3a1a08',
    name: { en: 'Desert Copper Ore', zh: '荒漠赤铜矿' },
    sourceRegions: ['crash_basin', 'whispering_ridge', 'geothermal_field'],
    description: {
      en: 'Conductive reddish ore cropping out around crater rocks.',
      zh: '裸露在环形山岩壁旁的导电赤铜矿石。'
    }
  },
  quartz_crystal: {
    id: 'quartz_crystal',
    category: 'raw',
    color: '#7ce8ff',
    emissive: '#1e6e88',
    name: { en: 'Sun-Quartz Crystal', zh: '日光石英簇' },
    sourceRegions: ['crash_basin', 'whispering_ridge', 'dry_canyon'],
    description: {
      en: 'Translucent sky-blue quartz shards abundant along Whispering Ridge.',
      zh: '晶莹剔透的浅蓝石英晶体，在东侧低语山脊尤为丰富。'
    }
  },
  silver_ore: {
    id: 'silver_ore',
    category: 'raw',
    color: '#dce6f7',
    emissive: '#334466',
    name: { en: 'Silver Filament Ore', zh: '银丝伴生矿' },
    sourceRegions: ['whispering_ridge', 'relay_gorge'],
    description: {
      en: 'High-purity signal-grade silver veins found on Whispering Ridge.',
      zh: '产自低语山脊高处的高纯度通信级银丝矿。'
    }
  },
  zeolite_ore: {
    id: 'zeolite_ore',
    category: 'raw',
    color: '#8bd6a8',
    emissive: '#1e4d33',
    name: { en: 'Porous Zeolite Mineral', zh: '多孔沸石矿' },
    sourceRegions: ['dry_canyon'],
    description: {
      en: 'Natural gas-filtering mineral beds inside the Southern Dry Canyon.',
      zh: '沉积在南侧干涸峡谷底部、具备天然空气净化能力的多孔沸石。'
    }
  },
  coolant_gel: {
    id: 'coolant_gel',
    category: 'raw',
    color: '#3cf0d8',
    emissive: '#0c6b60',
    name: { en: 'Cryo-Brine Gel Pod', zh: '冷泉凝胶囊' },
    sourceRegions: ['dry_canyon', 'geothermal_field'],
    description: {
      en: 'Endothermic mineral gel pods growing in shaded Dry Canyon alcoves.',
      zh: '凝结在干涸峡谷阴凉岩穴与科研站旁的内吸热矿质凝胶。'
    }
  },
  titanium_ore: {
    id: 'titanium_ore',
    category: 'raw',
    color: '#9aa8ff',
    emissive: '#222b68',
    name: { en: 'Meteoric Titanium', zh: '陨星钛矿' },
    sourceRegions: ['relay_gorge', 'geothermal_field'],
    description: {
      en: 'Ultra-light aerospace metal found across the Energy Bridge in Relay Gorge.',
      zh: '分布在西侧能量桥对岸陨星原的超轻航空级陨钛矿。'
    }
  },
  lumen_core: {
    id: 'lumen_core',
    category: 'raw',
    color: '#ffd666',
    emissive: '#885e0a',
    name: { en: 'Ancient Lumen Shard', zh: '流光星核碎片' },
    sourceRegions: ['relay_gorge'],
    description: {
      en: 'Photonic resonator crystals concentrated beyond the Relay Gorge chasm.',
      zh: '富集在西侧远古中继峡谷彼岸的光子共鸣核心。'
    }
  },
  plasma_crystal: {
    id: 'plasma_crystal',
    category: 'raw',
    color: '#ff6ec7',
    emissive: '#851858',
    name: { en: 'Geothermal Plasma Crystal', zh: '地热等离子晶簇' },
    sourceRegions: ['geothermal_field'],
    description: {
      en: 'High-thrust energetic crystals formed around Northern Geothermal Vents.',
      zh: '在北侧玄武岩地热喷口凝结的高推力能量晶体。'
    }
  },

  // === Refined / Smelted Intermediates (Furnace) ===
  iron_plate: {
    id: 'iron_plate',
    category: 'refined',
    color: '#b5c2d1',
    emissive: '#222a35',
    name: { en: 'Structural Iron Plate', zh: '结构铁板' },
    sourceRegions: ['crash_basin'],
    craftedIn: 'furnace',
    description: {
      en: 'Smelted from Hull Iron Scrap in the Solar Furnace.',
      zh: '由船体废铁块在太阳能熔炼炉中锻压而成。'
    }
  },
  copper_ingot: {
    id: 'copper_ingot',
    category: 'refined',
    color: '#f28d4b',
    emissive: '#4d2007',
    name: { en: 'Conductive Copper Ingot', zh: '高导紫铜锭' },
    sourceRegions: ['crash_basin'],
    craftedIn: 'furnace',
    description: {
      en: 'Refined from Desert Copper Ore in the Solar Furnace.',
      zh: '由荒漠赤铜矿在熔炼炉中提纯的导电铜锭。'
    }
  },
  quartz_lens: {
    id: 'quartz_lens',
    category: 'refined',
    color: '#9cf2ff',
    emissive: '#236c82',
    name: { en: 'Precision Quartz Lens', zh: '精密石英透镜' },
    sourceRegions: ['whispering_ridge'],
    craftedIn: 'furnace',
    description: {
      en: 'Fused and polished from Sun-Quartz Crystals in the Furnace.',
      zh: '由日光石英簇在熔炼炉中高温熔铸打磨而成的光学透镜。'
    }
  },
  silver_wire: {
    id: 'silver_wire',
    category: 'refined',
    color: '#eef4ff',
    emissive: '#3e5275',
    name: { en: 'Silver Signal Coil', zh: '纯银信号线圈' },
    sourceRegions: ['whispering_ridge'],
    craftedIn: 'furnace',
    description: {
      en: 'Drawn from Silver Filament Ore in the Furnace.',
      zh: '由银丝伴生矿熔炼拉制而成的低损耗信号线圈。'
    }
  },
  filter_core: {
    id: 'filter_core',
    category: 'refined',
    color: '#7ee69e',
    emissive: '#1e6335',
    name: { en: 'Activated Zeolite Core', zh: '活化沸石滤芯' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'furnace',
    description: {
      en: 'Kiln-activated Zeolite porous cartridge (Step 1 of Life Support chain).',
      zh: '经熔炉焙烧活化的多孔空气滤芯（维生多步合成第 1 步）。'
    }
  },
  coolant_canister: {
    id: 'coolant_canister',
    category: 'refined',
    color: '#48f7e8',
    emissive: '#0f6e66',
    name: { en: 'Purified Coolant Cell', zh: '纯化冷却液罐' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'furnace',
    description: {
      en: 'Stabilized thermal fluid canister distilled from Cryo-Brine Gel & Quartz.',
      zh: '由冷泉凝胶囊与日光石英蒸馏封装的稳定冷却单元。'
    }
  },
  titanium_alloy: {
    id: 'titanium_alloy',
    category: 'refined',
    color: '#b8c4ff',
    emissive: '#2c3880',
    name: { en: 'Aerospace Titanium Bar', zh: '航宇钛合金锭' },
    sourceRegions: ['relay_gorge'],
    craftedIn: 'furnace',
    description: {
      en: 'High-strength alloy smelted from Meteoric Titanium.',
      zh: '由陨星钛矿高温熔铸而成的耐高温航宇钛合金。'
    }
  },
  plasma_rod: {
    id: 'plasma_rod',
    category: 'refined',
    color: '#ff85d8',
    emissive: '#8f1b68',
    name: { en: 'Stabilized Plasma Fuel Rod', zh: '稳定等离子燃料棒' },
    sourceRegions: ['geothermal_field'],
    craftedIn: 'furnace',
    description: {
      en: 'Contained propulsion fuel rod combining Plasma Crystals and Coolant.',
      zh: '融合地热等离子晶簇与冷却液罐封装的高能推进燃料棒。'
    }
  },

  // === Sub-Assemblies (Fabrication Station) ===
  bio_filter_assembly: {
    id: 'bio_filter_assembly',
    category: 'subcomponent',
    color: '#63e891',
    emissive: '#1c6b39',
    name: { en: 'Bio-Atmospheric Scrubber', zh: '生态大气洗涤器' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'fabricator',
    description: {
      en: 'Sub-assembly combining Activated Zeolite Cores with an Iron housing.',
      zh: '由活化沸石滤芯与结构铁板组装的大气净化子模块。'
    }
  },
  thermal_regulator: {
    id: 'thermal_regulator',
    category: 'subcomponent',
    color: '#45d9ff',
    emissive: '#145f78',
    name: { en: 'Cabin Thermal Regulator', zh: '船舱温控循环器' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'fabricator',
    description: {
      en: 'Sub-assembly pairing Purified Coolant Cells with Copper heat-pipes.',
      zh: '由纯化冷却液罐与高导紫铜锭组装的温控子模块。'
    }
  },
  gyro_circuit: {
    id: 'gyro_circuit',
    category: 'subcomponent',
    color: '#ffd970',
    emissive: '#78570c',
    name: { en: 'Gyro-Logic Circuit Board', zh: '陀螺逻辑电路板' },
    sourceRegions: ['relay_gorge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Precision navigation circuit built from Silver Coils, Copper, and a Lumen Shard.',
      zh: '集合纯银线圈、紫铜锭与流光星核制成的姿态解算电路板。'
    }
  },
  starlight_prism: {
    id: 'starlight_prism',
    category: 'subcomponent',
    color: '#fff099',
    emissive: '#8c7416',
    name: { en: 'Starlight Optical Prism', zh: '星光定标棱镜' },
    sourceRegions: ['relay_gorge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Optical star-tracker assembly crafted from Quartz Lens and Lumen Shards.',
      zh: '由精密石英透镜与流光星核碎片调校而成的恒星光学棱镜。'
    }
  },
  thrust_nozzle: {
    id: 'thrust_nozzle',
    category: 'subcomponent',
    color: '#99b8ff',
    emissive: '#1e3f8a',
    name: { en: 'Magnetic Thrust Nozzle', zh: '磁约束推进喷管' },
    sourceRegions: ['geothermal_field'],
    craftedIn: 'fabricator',
    description: {
      en: 'Heat-shielded thruster bell built from Titanium Bar, Iron Plate, and Copper.',
      zh: '采用航宇钛合金锭、结构铁板与紫铜线圈制造的磁约束喷管。'
    }
  },

  // === Permanent Robot Exploration Upgrades (Equipment) ===
  geo_drill: {
    id: 'geo_drill',
    category: 'equipment',
    equipmentSlot: 'drill',
    color: '#ffb03a',
    emissive: '#8f4c00',
    name: { en: 'Spiral Geo-Drill & Sonar Rig', zh: '螺旋地质钻头与脉冲声呐' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Upgrade — Equips Milo with a seismic sonar scanner [V] and rotary auger [E] to unearth deep subsurface mineral veins!',
      zh: '永久能力装备 —— 为米洛加装脉冲探矿声呐 [V] 与右臂旋转破岩钻头 [E]，可钻探开采地底深层暗脉！'
    }
  },
  jetpack_wing: {
    id: 'jetpack_wing',
    category: 'equipment',
    equipmentSlot: 'jetpack',
    color: '#5ef2ff',
    emissive: '#007ea8',
    name: { en: 'Micro-Gravity Thruster Wings', zh: '微重力喷气飞行翼' },
    sourceRegions: ['relay_gorge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Upgrade — Equips twin aero-thruster wings! Hold [Space] to jet-boost onto high canyon mesas and basalt spires!',
      zh: '永久能力装备 —— 为米洛加装双联喷气悬浮翼！按住 [Space] 即可喷射升空滑翔，飞上高耸孤峰与石柱顶采集星核！'
    }
  },

  // === Five Main Spacecraft Repair Modules ===
  power_core: {
    id: 'power_core',
    category: 'ship_module',
    color: '#ffb838',
    emissive: '#995c00',
    name: { en: 'Auxiliary Fusion Power Core', zh: '辅助聚变动力核心' },
    sourceRegions: ['crash_basin'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 1 Main Component — Restores hull lights and main shipboard consoles.',
      zh: '第 1 关主线核心组件 —— 恢复星织号全船照明与主控台电力。'
    }
  },
  comm_array: {
    id: 'comm_array',
    category: 'ship_module',
    color: '#5ce6ff',
    emissive: '#0e6b82',
    name: { en: 'Deep-Space Transceiver Array', zh: '深空通信收发阵列' },
    sourceRegions: ['whispering_ridge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 2 Main Component — Repairs the roof dish to lock onto the Homeworld beacon.',
      zh: '第 2 关主线核心组件 —— 修复机顶通信天线并接收母星轨道信标。'
    }
  },
  life_support_unit: {
    id: 'life_support_unit',
    category: 'ship_module',
    color: '#4dffb5',
    emissive: '#0d7a49',
    name: { en: 'Environmental Life-Support Unit', zh: '生态维生循环总成' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 3 Main Component — Restores breathable cabin atmosphere and bio-dome oxygenation.',
      zh: '第 3 关主线核心组件 —— 净空舱内沙尘，重启生态穹顶供氧与温控循环。'
    }
  },
  nav_computer: {
    id: 'nav_computer',
    category: 'ship_module',
    color: '#ffe066',
    emissive: '#8f6c00',
    name: { en: 'Astrogation Star-Map Core', zh: '星际航图导航核心' },
    sourceRegions: ['relay_gorge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 4 Main Component — Projects a safe hyperspace trajectory back to Homeworld.',
      zh: '第 4 关主线核心组件 —— 展开机首星图仪，锁定避开小行星带的安全归家航线。'
    }
  },
  propulsion_drive: {
    id: 'propulsion_drive',
    category: 'ship_module',
    color: '#ff70c8',
    emissive: '#8f1560',
    name: { en: 'Twin Plasma Propulsion Drive', zh: '双联等离子主推进器' },
    sourceRegions: ['geothermal_field'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 5 Main Component — Restores main orbital thrusters for liftoff and return home!',
      zh: '第 5 关主线核心组件 —— 修复尾部主推进引擎，赋予飞船冲出大气层返航的澎湃推力！'
    }
  }
};

export const RECIPES = [
  // --- Level 1 Recipes ---
  {
    id: 'smelt_iron_plate',
    station: 'furnace',
    unlockLevel: 1,
    craftSeconds: 1.0,
    inputs: [{ id: 'iron_scrap', count: 2 }],
    output: { id: 'iron_plate', count: 1 }
  },
  {
    id: 'smelt_copper_ingot',
    station: 'furnace',
    unlockLevel: 1,
    craftSeconds: 1.0,
    inputs: [{ id: 'copper_ore', count: 2 }],
    output: { id: 'copper_ingot', count: 1 }
  },
  {
    id: 'craft_power_core',
    station: 'fabricator',
    unlockLevel: 1,
    craftSeconds: 1.5,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_power',
    inputs: [
      { id: 'iron_plate', count: 2 },
      { id: 'copper_ingot', count: 2 }
    ],
    output: { id: 'power_core', count: 1 }
  },

  // --- Level 2 Recipes ---
  {
    id: 'smelt_quartz_lens',
    station: 'furnace',
    unlockLevel: 2,
    craftSeconds: 1.1,
    inputs: [{ id: 'quartz_crystal', count: 2 }],
    output: { id: 'quartz_lens', count: 1 }
  },
  {
    id: 'smelt_silver_wire',
    station: 'furnace',
    unlockLevel: 2,
    craftSeconds: 1.1,
    inputs: [{ id: 'silver_ore', count: 2 }],
    output: { id: 'silver_wire', count: 1 }
  },
  {
    id: 'craft_comm_array',
    station: 'fabricator',
    unlockLevel: 2,
    craftSeconds: 1.6,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_comms',
    inputs: [
      { id: 'quartz_lens', count: 2 },
      { id: 'silver_wire', count: 2 },
      { id: 'copper_ingot', count: 1 }
    ],
    output: { id: 'comm_array', count: 1 }
  },

  // --- Level 3 Recipes (Geo-Drill Upgrade + Multi-step Life Support chain) ---
  {
    id: 'craft_geo_drill',
    station: 'fabricator',
    unlockLevel: 3,
    craftSeconds: 1.4,
    oneTimeEquipment: 'drill',
    inputs: [
      { id: 'iron_plate', count: 1 },
      { id: 'copper_ingot', count: 1 },
      { id: 'quartz_lens', count: 1 }
    ],
    output: { id: 'geo_drill', count: 1 }
  },
  {
    id: 'smelt_filter_core',
    station: 'furnace',
    unlockLevel: 3,
    craftSeconds: 1.1,
    inputs: [{ id: 'zeolite_ore', count: 2 }],
    output: { id: 'filter_core', count: 1 }
  },
  {
    id: 'smelt_coolant_canister',
    station: 'furnace',
    unlockLevel: 3,
    craftSeconds: 1.2,
    inputs: [
      { id: 'coolant_gel', count: 2 },
      { id: 'quartz_crystal', count: 1 }
    ],
    output: { id: 'coolant_canister', count: 1 }
  },
  {
    id: 'craft_bio_filter',
    station: 'fabricator',
    unlockLevel: 3,
    craftSeconds: 1.3,
    inputs: [
      { id: 'filter_core', count: 2 },
      { id: 'iron_plate', count: 1 }
    ],
    output: { id: 'bio_filter_assembly', count: 1 }
  },
  {
    id: 'craft_thermal_regulator',
    station: 'fabricator',
    unlockLevel: 3,
    craftSeconds: 1.3,
    inputs: [
      { id: 'coolant_canister', count: 2 },
      { id: 'copper_ingot', count: 1 }
    ],
    output: { id: 'thermal_regulator', count: 1 }
  },
  {
    id: 'craft_life_support_unit',
    station: 'fabricator',
    unlockLevel: 3,
    craftSeconds: 1.7,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_lifesupport',
    inputs: [
      { id: 'bio_filter_assembly', count: 1 },
      { id: 'thermal_regulator', count: 1 }
    ],
    output: { id: 'life_support_unit', count: 1 }
  },

  // --- Level 4 Recipes (Jetpack Wings Upgrade + Navigation Core) ---
  {
    id: 'craft_jetpack_wing',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.5,
    oneTimeEquipment: 'jetpack',
    inputs: [
      { id: 'iron_plate', count: 1 },
      { id: 'silver_wire', count: 1 },
      { id: 'coolant_canister', count: 1 }
    ],
    output: { id: 'jetpack_wing', count: 1 }
  },
  {
    id: 'smelt_titanium_alloy',
    station: 'furnace',
    unlockLevel: 4,
    craftSeconds: 1.2,
    inputs: [{ id: 'titanium_ore', count: 2 }],
    output: { id: 'titanium_alloy', count: 1 }
  },
  {
    id: 'craft_gyro_circuit',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.3,
    inputs: [
      { id: 'silver_wire', count: 1 },
      { id: 'copper_ingot', count: 1 },
      { id: 'lumen_core', count: 1 }
    ],
    output: { id: 'gyro_circuit', count: 1 }
  },
  {
    id: 'craft_starlight_prism',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.3,
    inputs: [
      { id: 'quartz_lens', count: 1 },
      { id: 'lumen_core', count: 2 }
    ],
    output: { id: 'starlight_prism', count: 1 }
  },
  {
    id: 'craft_nav_computer',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.8,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_nav',
    inputs: [
      { id: 'titanium_alloy', count: 2 },
      { id: 'gyro_circuit', count: 1 },
      { id: 'starlight_prism', count: 1 }
    ],
    output: { id: 'nav_computer', count: 1 }
  },

  // --- Level 5 Recipes ---
  {
    id: 'smelt_plasma_rod',
    station: 'furnace',
    unlockLevel: 5,
    craftSeconds: 1.3,
    inputs: [
      { id: 'plasma_crystal', count: 2 },
      { id: 'coolant_canister', count: 1 }
    ],
    output: { id: 'plasma_rod', count: 1 }
  },
  {
    id: 'craft_thrust_nozzle',
    station: 'fabricator',
    unlockLevel: 5,
    craftSeconds: 1.4,
    inputs: [
      { id: 'titanium_alloy', count: 1 },
      { id: 'iron_plate', count: 1 },
      { id: 'copper_ingot', count: 1 }
    ],
    output: { id: 'thrust_nozzle', count: 1 }
  },
  {
    id: 'craft_propulsion_drive',
    station: 'fabricator',
    unlockLevel: 5,
    craftSeconds: 2.0,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_propulsion',
    inputs: [
      { id: 'thrust_nozzle', count: 2 },
      { id: 'plasma_rod', count: 2 }
    ],
    output: { id: 'propulsion_drive', count: 1 }
  }
];

export const REPAIR_TARGETS = {
  repair_power: {
    id: 'repair_power',
    level: 1,
    requiredItem: 'power_core',
    position: { x: 2.6, y: 1.0, z: 3.1 },
    name: { en: 'Starboard Power Core Bay', zh: '飞船右舷动力核心舱' },
    inspectDesc: {
      en: 'The primary power conduit ruptured on landing. Needs 1x Auxiliary Fusion Power Core.',
      zh: '迫降时受损的主供电舱口，安装【辅助聚变动力核心】即可点亮船舱与仪表台。'
    }
  },
  repair_comms: {
    id: 'repair_comms',
    level: 2,
    requiredItem: 'comm_array',
    position: { x: -2.4, y: 1.5, z: 2.8 },
    name: { en: 'Dorsal Communications Terminal', zh: '飞船顶部通信阵列基座' },
    inspectDesc: {
      en: 'Controls the roof dish antenna. Install 1x Deep-Space Transceiver Array to receive orbital signals.',
      zh: '连接舱顶折叠抛物面天线，安装【深空通信收发阵列】即可捕获母星信标信号。'
    }
  },
  repair_lifesupport: {
    id: 'repair_lifesupport',
    level: 3,
    requiredItem: 'life_support_unit',
    position: { x: -3.05, y: 1.1, z: 0.72 },
    name: { en: 'Port Bio-Dome Life-Support Bay', zh: '飞船左舷生态维生舱' },
    inspectDesc: {
      en: 'Filters dust and circulates cabin coolant. Install 1x Environmental Life-Support Unit.',
      zh: '负责过滤沙尘并调节舱内氧气与温度，需要安装【生态维生循环总成】。'
    }
  },
  repair_nav: {
    id: 'repair_nav',
    level: 4,
    requiredItem: 'nav_computer',
    position: { x: 0.0, y: 1.1, z: 6.4 },
    name: { en: 'Forward Nose Astrogation Array', zh: '飞船机首星际导航阵列' },
    inspectDesc: {
      en: 'Forward star-tracker housing. Install 1x Astrogation Star-Map Core to calculate the route home.',
      zh: '位于机首的光学寻星仪舱位，安装【星际航图导航核心】即可解算返航跃迁航线。'
    }
  },
  repair_propulsion: {
    id: 'repair_propulsion',
    level: 5,
    requiredItem: 'propulsion_drive',
    position: { x: 0.0, y: 1.2, z: -6.5 },
    name: { en: 'Aft Main Thruster Mount', zh: '飞船尾部主推进引擎舱' },
    inspectDesc: {
      en: 'Twin orbital engine mount. Install 1x Twin Plasma Propulsion Drive, then complete pre-flight checks!',
      zh: '飞船尾部主推进器安装位，装入【双联等离子主推进器】并完成起飞前安全点检即可返航！'
    }
  }
};

export const PREFLIGHT_CHECKS = [
  {
    id: 'check_port_strut',
    position: { x: -3.85, z: -3.55 },
    name: { en: 'Port Landing Gear Hydraulic Lock', zh: '左起落架液压收放锁' }
  },
  {
    id: 'check_starboard_valve',
    position: { x: 3.85, z: -3.55 },
    name: { en: 'Starboard Plasma Manifold Seal', zh: '右舷燃料歧管密封阀' }
  },
  {
    id: 'check_boarding_hatch',
    position: { x: 3.35, z: 0.45 },
    name: { en: 'Cabin Pressurization Hatch Latch', zh: '乘员舱气密舱门锁扣' }
  }
];

export const CREW_LOGS = {
  log_1: {
    id: 'log_1',
    position: { x: -5.5, z: -8.2 },
    region: 'crash_basin',
    title: { en: 'Crew Log #1 — Safe Orbital Ejection', zh: '船员日志 #1 —— 轨道救生舱安全分离' },
    body: {
      en: 'Captain Mira: "Sandstorm shear forced an emergency descent, so the crew ejected cleanly to the orbital relay pod. Milo stayed aboard to cushion the Starweaver! If Milo boots up — the Solar Furnace outside still works. Start with the Power Bay!"',
      zh: '米拉船长：“高空沙暴切变迫使飞船紧急迫降，全体船员已安全弹射至轨道中继站。小机器人米洛留在船上稳住了缓冲姿态！米洛，如果你醒来看到这条记录——外面的太阳能熔炼炉完好无损，先从修复动力舱开始吧！”'
    }
  },
  log_2: {
    id: 'log_2',
    position: { x: 53.0, z: -9.5 },
    region: 'whispering_ridge',
    title: { en: 'Crew Log #2 — Harmonic Signal Cairns', zh: '船员日志 #2 —— 低语山脊的谐振路标' },
    body: {
      en: 'Engineer Tariq: "Our survey drone mapped pure Sun-Quartz and Silver veins up this eastern ridge. Activating the two Solar Cairns creates an electrostatic glide-field along the path!"',
      zh: '工程师塔里克：“勘测无人机在东侧山脊发现了高纯度日光石英与银丝矿。点亮沿途两座引路信标石还能形成静电助推场，让往返营地的路途轻快不少！”'
    }
  },
  log_3: {
    id: 'log_3',
    position: { x: -6.0, z: 54.5 },
    region: 'dry_canyon',
    title: { en: 'Crew Log #3 — Subterranean Oasis Chemistry', zh: '船员日志 #3 —— 峡谷地底绿洲化学志' },
    body: {
      en: 'Botanist Lin: "Beneath Kharis’s dry crust, Zeolite beds and endothermic brine gel keep subterranean pockets cool. Combining an Activated Filter Scrubber with a Thermal Regulator will restore the Starweaver’s bio-dome sprout!"',
      zh: '植物学家林：“在卡里斯干燥的地表下，多孔沸石层与吸热冷泉凝胶维系着清凉的微生态。把生态洗涤器与温控循环器组装起来，星织号生态舱里的小绿芽就能重新舒展叶片啦！”'
    }
  },
  log_4: {
    id: 'log_4',
    position: { x: -64.0, z: 8.5 },
    region: 'relay_gorge',
    title: { en: 'Crew Log #4 — The Hard-Light Crossing', zh: '船员日志 #4 —— 跨越裂谷的光之桥' },
    body: {
      en: 'Navigator Sol: "Previous explorers built a photonic bridge over this gorge. Whenever desert winds tilt the two Solar Mirrors off-axis, realigning both pylons immediately restores the bridge deck and opens the Meteorite Star-Field."',
      zh: '领航员索尔：“先遣考察队在裂谷上架设了光子硬光桥。每当荒漠风沙吹偏两座太阳反射镜时，只需手动校准两侧塔台，光桥便会重新合拢，通向对岸富含陨钛与流光星核的原野。”'
    }
  },
  log_5: {
    id: 'log_5',
    position: { x: 8.5, z: -56.0 },
    region: 'geothermal_field',
    title: { en: 'Crew Log #5 — See You on the Green Hills!', zh: '船员日志 #5 —— 我们在翠绿山丘等你回家！' },
    body: {
      en: 'All Crew: "Our relay picked up the Starweaver’s repaired antenna! We hitched a ride home on the rescue cruiser and left the landing meadow lights on for you, Milo. Fire up those twin thrusters and come home!"',
      zh: '全体船员：“轨道站收到了星织号天线发出的信标！我们已搭乘救援巡洋舰先行抵达母星，并在草甸降落场为你点亮了引航灯。点燃双联推进器，快回家吧，勇敢的小家伙！”'
    }
  }
};

export const LEVELS = [
  {
    level: 1,
    id: 'level_1',
    title: { en: 'Level 1 — Restore Power', zh: '第 1 关 —— 恢复飞船电力' },
    regionId: 'crash_basin',
    repairTargetId: 'repair_power',
    requiredComponentId: 'power_core',
    summary: {
      en: 'Gather Hull Iron Scrap and Copper Ore around the Crash Basin, smelt plates and ingots in the Solar Furnace, fabricate an Auxiliary Fusion Power Core, and install it in the Starboard Power Bay.',
      zh: '在坠机盆地收集船体废铁块与荒漠赤铜矿，利用太阳能熔炼炉炼制铁板与紫铜锭，在精密制造台合成【辅助聚变动力核心】并装入飞船动力舱。'
    },
    hintText: {
      en: 'Collect 4 Hull Iron Scrap (grey metal piles) and 4 Desert Copper Ore (orange rocks) nearby, smelt 2 Iron Plates + 2 Copper Ingots at the glowing orange Solar Furnace, then craft the Power Core at the blue Fabrication Station!',
      zh: '先在营地附近采集 4 个船体废铁块和 4 个荒漠赤铜矿，去橙色【太阳能熔炼炉】炼成 2 块结构铁板与 2 块紫铜锭，再去蓝色【精密制造台】合成动力核心，最后装到飞船右舷闪烁的动力舱上！'
    },
    steps: [
      {
        id: 'l1_gather_raw',
        type: 'raw_for_level1',
        needed: 8,
        label: {
          en: 'Gather 4 Hull Iron Scrap & 4 Copper Ore nearby',
          zh: '在营地四周采集 4 废铁块 + 4 赤铜矿'
        }
      },
      {
        id: 'l1_smelt_plates',
        type: 'have_or_used',
        itemId: 'iron_plate',
        needed: 2,
        consumedBy: ['power_core'],
        label: { en: 'Smelt Structural Iron Plates at Solar Furnace', zh: '在熔炼炉炼制结构铁板' }
      },
      {
        id: 'l1_smelt_copper',
        type: 'have_or_used',
        itemId: 'copper_ingot',
        needed: 2,
        consumedBy: ['power_core'],
        label: { en: 'Smelt Conductive Copper Ingots at Solar Furnace', zh: '在熔炼炉炼制高导紫铜锭' }
      },
      {
        id: 'l1_craft_core',
        type: 'have_or_installed',
        itemId: 'power_core',
        repairId: 'repair_power',
        needed: 1,
        label: { en: 'Fabricate Fusion Power Core at Fabrication Station', zh: '在制造台合成辅助聚变动力核心' }
      },
      {
        id: 'l1_install_core',
        type: 'repair_installed',
        repairId: 'repair_power',
        needed: 1,
        label: { en: 'Install Power Core in Starboard Power Bay', zh: '将动力核心安装至飞船右舷动力舱' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l1_quartz',
        type: 'gather_count',
        materialId: 'quartz_crystal',
        target: 3,
        label: { en: 'Collect Sun-Quartz Shards on crater rim', zh: '在环形山边缘采集日光石英簇' },
        rewardItems: [{ id: 'copper_ore', count: 2 }],
        rewardCosmetic: 'golden_antenna',
        rewardText: { en: '+2 Copper Ore & Warm-Gold Antenna Glow', zh: '奖励: 赤铜矿 ×2 & 金色天线微光外观' }
      },
      {
        id: 'side_l1_log',
        type: 'read_log',
        logId: 'log_1',
        target: 1,
        label: { en: 'Inspect Emergency Crew Log #1 near tail fin', zh: '在尾翼旁读取船员日志 #1' },
        rewardItems: [{ id: 'iron_plate', count: 1 }],
        rewardText: { en: '+1 Structural Iron Plate', zh: '奖励: 结构铁板 ×1' }
      }
    ],
    unlockSummary: [
      { en: 'East Route Opened: Whispering Ridge Signal Trail', zh: '解锁新区域: 东侧【低语山脊】信标小径' },
      { en: 'New Recipes: Precision Quartz Lens, Silver Signal Coil, Deep-Space Transceiver', zh: '解锁新配方: 精密石英透镜、纯银信号线圈、深空通信收发阵列' }
    ]
  },

  {
    level: 2,
    id: 'level_2',
    title: { en: 'Level 2 — Repair Communications', zh: '第 2 关 —— 修复深空通信' },
    regionId: 'whispering_ridge',
    repairTargetId: 'repair_comms',
    requiredComponentId: 'comm_array',
    summary: {
      en: 'Follow the glowing cyan trail markers east up Whispering Ridge to gather Sun-Quartz and Silver Filaments, then craft and install the Deep-Space Transceiver Array.',
      zh: '沿着东侧亮起的青色引路灯登上【低语山脊】，采集日光石英簇与银丝伴生矿，合成并安装【深空通信收发阵列】以重启机顶天线。'
    },
    hintText: {
      en: 'Head East (+X, follow the glowing cyan beacons) up Whispering Ridge for Sun-Quartz Crystals and silvery Silver Filament rocks. Smelt 2 Quartz Lenses + 2 Silver Coils (+ 1 Copper Ingot), craft the Transceiver Array, and install it on the ship’s left-front comms bay!',
      zh: '沿着飞船东侧（右方青色路标）前往低语山脊采集日光石英与银丝矿。在熔炼炉炼制 2 个石英透镜、2 个纯银线圈（外加 1 块紫铜锭），在制造台合成深空通信收发阵列后安装至飞船通信基座！'
    },
    steps: [
      {
        id: 'l2_smelt_quartz',
        type: 'have_or_used',
        itemId: 'quartz_lens',
        needed: 2,
        consumedBy: ['comm_array'],
        label: { en: 'Smelt Precision Quartz Lenses', zh: '熔炼精密石英透镜' }
      },
      {
        id: 'l2_smelt_silver',
        type: 'have_or_used',
        itemId: 'silver_wire',
        needed: 2,
        consumedBy: ['comm_array'],
        label: { en: 'Smelt Silver Signal Coils', zh: '熔炼纯银信号线圈' }
      },
      {
        id: 'l2_craft_comms',
        type: 'have_or_installed',
        itemId: 'comm_array',
        repairId: 'repair_comms',
        needed: 1,
        label: { en: 'Fabricate Deep-Space Transceiver Array', zh: '制造深空通信收发阵列' }
      },
      {
        id: 'l2_install_comms',
        type: 'repair_installed',
        repairId: 'repair_comms',
        needed: 1,
        label: { en: 'Install Transceiver Array on Ship Comms Terminal', zh: '安装通信阵列并唤醒机顶天线' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l2_cairns',
        type: 'activate_group',
        groupKey: 'cairns',
        target: 2,
        label: { en: 'Activate Signal Cairns along Whispering Ridge', zh: '点亮山脊沿途的引路信标石' },
        rewardItems: [{ id: 'quartz_lens', count: 1 }],
        rewardText: { en: 'Ridge Speed-Boost Trail + 1 Quartz Lens', zh: '奖励: 山脊加速路面 & 精密石英透镜 ×1' }
      },
      {
        id: 'side_l2_log',
        type: 'read_log',
        logId: 'log_2',
        target: 1,
        label: { en: 'Read Engineer Tariq’s Log #2 at Ridge Summit', zh: '在山脊高处读取船员日志 #2' },
        rewardItems: [{ id: 'silver_wire', count: 1 }],
        rewardText: { en: '+1 Silver Signal Coil', zh: '奖励: 纯银信号线圈 ×1' }
      }
    ],
    unlockSummary: [
      { en: 'South Canyon Opened: Dry Canyon & Abandoned Research Outpost', zh: '解锁新区域: 南侧【干涸峡谷与废弃科研站】' },
      { en: 'New Upgrade Blueprint: Spiral Geo-Drill & Subsurface Sonar [V]', zh: '解锁新装备蓝图: 【螺旋地质钻头与脉冲声呐】—— 开启钻地探矿玩法！' },
      { en: 'Multi-Step Life Support Recipes & Field Purifier Station Active', zh: '解锁多步维生合成配方 & 科研站便携加工一体台' }
    ]
  },

  {
    level: 3,
    id: 'level_3',
    title: { en: 'Level 3 — Geo-Drilling & Life Support', zh: '第 3 关 —— 钻地探矿与生态维生' },
    regionId: 'dry_canyon',
    repairTargetId: 'repair_lifesupport',
    requiredComponentId: 'life_support_unit',
    summary: {
      en: 'Craft the Spiral Geo-Drill & Sonar Rig, pulse-scan [V] and drill [E] deep subsurface fissures in Dry Canyon for Zeolite & Cryo-Brine Gel, then assemble and install the Environmental Life-Support Unit.',
      zh: '先合成永久装备【螺旋地质钻头】，前往南侧干涸峡谷按 [V] 发射脉冲声呐探测地底裂隙、按 [E] 下钻破土开采深层沸石与冷泉凝胶，组装并安装【生态维生循环总成】。'
    },
    hintText: {
      en: 'First craft the Spiral Geo-Drill (1 Iron Plate + 1 Copper Ingot + 1 Quartz Lens) at the Fabricator or Outpost Workbench! Then press [V] in Dry Canyon to ping glowing subsurface cracks and press [E] to drill up Zeolite & Cryo-Brine Gel!',
      zh: '先在制造台或南区前哨一体台合成【螺旋地质钻头】（结构铁板×1 + 紫铜锭×1 + 石英透镜×1）！随后在干涸峡谷按 [V] 释放声呐锁定发光地裂暗脉，靠近按 [E] 钻探采出多孔沸石与冷泉凝胶，完成维生总成！'
    },
    steps: [
      {
        id: 'l3_craft_drill',
        type: 'equipment_unlocked',
        equipmentSlot: 'drill',
        needed: 1,
        label: { en: 'Fabricate & Equip Spiral Geo-Drill + Sonar [V]', zh: '制造并装备【螺旋地质钻头与脉冲声呐】' }
      },
      {
        id: 'l3_sub_scrubber',
        type: 'have_or_used',
        itemId: 'bio_filter_assembly',
        needed: 1,
        consumedBy: ['life_support_unit'],
        label: { en: 'Drill Zeolite & Craft Bio-Atmospheric Scrubber', zh: '钻探沸石并组装生态大气洗涤器' }
      },
      {
        id: 'l3_sub_thermal',
        type: 'have_or_used',
        itemId: 'thermal_regulator',
        needed: 1,
        consumedBy: ['life_support_unit'],
        label: { en: 'Drill Coolant Gel & Craft Cabin Thermal Regulator', zh: '钻探冷泉凝胶并组装船舱温控循环器' }
      },
      {
        id: 'l3_craft_unit',
        type: 'have_or_installed',
        itemId: 'life_support_unit',
        repairId: 'repair_lifesupport',
        needed: 1,
        label: { en: 'Assemble Environmental Life-Support Unit', zh: '总装生态维生循环总成' }
      },
      {
        id: 'l3_install_unit',
        type: 'repair_installed',
        repairId: 'repair_lifesupport',
        needed: 1,
        label: { en: 'Install Life-Support Unit into Port Bio-Dome', zh: '将维生总成安装至左舷生态舱' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l3_log',
        type: 'read_log',
        logId: 'log_3',
        target: 1,
        label: { en: 'Scan Botanist Lin’s Outpost Log #3', zh: '扫描科研站植物学家日志 #3' },
        rewardItems: [{ id: 'coolant_gel', count: 2 }],
        rewardText: { en: '+2 Cryo-Brine Gel Pods', zh: '奖励: 冷泉凝胶囊 ×2' }
      },
      {
        id: 'side_l3_zeolite',
        type: 'gather_count',
        materialId: 'zeolite_ore',
        target: 6,
        label: { en: 'Drill 6 Subsurface Zeolite Samples in Dry Canyon', zh: '在干涸峡谷钻探采集 6 份深层沸石矿' },
        rewardItems: [
          { id: 'iron_plate', count: 1 },
          { id: 'silver_wire', count: 1 }
        ],
        rewardText: { en: '+1 Iron Plate & +1 Silver Coil (Jetpack Prep!)', zh: '奖励: 铁板 ×1 & 纯银线圈 ×1 (助力第4关飞行翼！)' }
      }
    ],
    unlockSummary: [
      { en: 'West Gorge Opened: Ancient Relay Gorge & Sky-Spires', zh: '解锁新区域: 西侧【远古中继峡谷与浮空孤峰】' },
      { en: 'New Upgrade Blueprint: Micro-Gravity Thruster Wings [Space]', zh: '解锁新装备蓝图: 【微重力喷气飞行翼】—— 开启高空飞行玩法！' },
      { en: 'New Recipes: Aerospace Titanium Bar, Gyro-Logic Board, Starlight Prism, Astrogation Core', zh: '解锁导航配方: 航宇钛合金锭、陀螺电路板、星光棱镜、星际航图核心' }
    ]
  },

  {
    level: 4,
    id: 'level_4',
    title: { en: 'Level 4 — Sky Flight & Star Navigation', zh: '第 4 关 —— 喷气升空与星际导航' },
    regionId: 'relay_gorge',
    repairTargetId: 'repair_nav',
    requiredComponentId: 'nav_computer',
    summary: {
      en: 'Craft the Micro-Gravity Thruster Wings, hold [Space] to jet-boost atop the High Gorge Spire to align both Solar Mirror Pylons, glide across to the Star-Field Sky-Mesa for Lumen Shards & Titanium, and install the Astrogation Core.',
      zh: '先制造【微重力喷气飞行翼】，按住 [Space] 喷气飞上峡谷高台校准两座太阳能反射塔架通光桥，飞跃裂谷登上陨星高台采集流光星核与陨钛，合成并安装【星际航图导航核心】。'
    },
    hintText: {
      en: 'Craft Micro-Gravity Thruster Wings (1 Iron Plate + 1 Silver Coil + 1 Coolant Cell) at the Fabricator! Hold [Space] to fly onto the South Gorge Spire for the 2nd Solar Pylon, then cross the bridge and fly atop the Star-Field Mesa for Lumen Shards!',
      zh: '先合成【微重力喷气飞行翼】（结构铁板×1 + 纯银线圈×1 + 冷却液罐×1）！向西抵达峡谷后按住 [Space] 喷气飞上南侧孤峰校准第 2 座反射塔架通硬光桥，过桥飞上星原高台采集流光星核与陨钛矿！'
    },
    steps: [
      {
        id: 'l4_craft_jetpack',
        type: 'equipment_unlocked',
        equipmentSlot: 'jetpack',
        needed: 1,
        label: { en: 'Fabricate & Equip Micro-Gravity Thruster Wings [Space]', zh: '制造并装备【微重力喷气飞行翼】' }
      },
      {
        id: 'l4_bridge',
        type: 'activate_group',
        groupKey: 'pylons',
        needed: 2,
        label: { en: 'Fly atop Gorge Spire & Align both Solar Pylons', zh: '飞上峡谷孤峰并校准全部 2 座反射塔' }
      },
      {
        id: 'l4_sub_gyro',
        type: 'have_or_used',
        itemId: 'gyro_circuit',
        needed: 1,
        consumedBy: ['nav_computer'],
        label: { en: 'Craft Gyro-Logic Circuit Board', zh: '制造陀螺逻辑电路板' }
      },
      {
        id: 'l4_sub_prism',
        type: 'have_or_used',
        itemId: 'starlight_prism',
        needed: 1,
        consumedBy: ['nav_computer'],
        label: { en: 'Fly onto Star-Field Mesa for Lumen & Craft Prism', zh: '飞登星原高台采星核并制造定标棱镜' }
      },
      {
        id: 'l4_install_nav',
        type: 'repair_installed',
        repairId: 'repair_nav',
        needed: 1,
        label: { en: 'Craft & Install Astrogation Star-Map Core in Ship Nose', zh: '合成并将星际航图核心安装至飞船机首' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l4_dish',
        type: 'facility_flag',
        flagKey: 'observatoryRestored',
        target: 1,
        label: { en: 'Restore the Ancient Observatory Dish across the bridge', zh: '修复光桥对岸的远古星象观测天线' },
        rewardItems: [{ id: 'titanium_alloy', count: 2 }],
        rewardText: { en: '+2 Aerospace Titanium Bars (Head-start for Level 5!)', zh: '奖励: 航宇钛合金锭 ×2 (助力第 5 关推进器！)' }
      },
      {
        id: 'side_l4_log',
        type: 'read_log',
        logId: 'log_4',
        target: 1,
        label: { en: 'Read Navigator Sol’s Log #4 beyond the Gorge', zh: '在裂谷彼岸读取领航员日志 #4' },
        rewardItems: [{ id: 'lumen_core', count: 2 }],
        rewardText: { en: '+2 Ancient Lumen Shards', zh: '奖励: 流光星核碎片 ×2' }
      }
    ],
    unlockSummary: [
      { en: 'North Route Opened: Basalt Geothermal Vent Field', zh: '解锁最终区域: 北侧【玄武岩地热喷口区】' },
      { en: 'Propulsion Recipes Unlocked: Stabilized Plasma Rod, Magnetic Nozzle, Twin Plasma Drive', zh: '解锁推进系统配方: 等离子燃料棒、磁约束喷管、双联等离子主推进器' }
    ]
  },

  {
    level: 5,
    id: 'level_5',
    title: { en: 'Level 5 — Repair Propulsion & Return Home', zh: '第 5 关 —— 修复主推进器并返航归家' },
    regionId: 'geothermal_field',
    repairTargetId: 'repair_propulsion',
    requiredComponentId: 'propulsion_drive',
    requiresLaunch: true,
    summary: {
      en: 'Combine Flight & Geo-Drilling in the Northern Basalt Field: jet-boost [Space] onto towering basalt spires for Titanium, sonar-drill [V]/[E] deep fissures for Plasma Crystals, install the Twin Plasma Drive, complete 3 Pre-Flight Checks, and launch home!',
      zh: '在北侧玄武岩地热区综合运用【喷气飞行 + 钻地探矿】：按住 [Space] 飞上六方玄武岩柱顶采陨钛、在火山口旁按 [V]/[E] 下钻深探等离子母晶，安装【双联等离子主推进器】，完成 3 项起飞点检后返航回家！'
    },
    hintText: {
      en: 'Go North (-Z)! Fly [Space] onto the tall Basalt Column Plateaus for Meteoric Titanium, and drill [E] into glowing pink Geothermal Fissures for Plasma Crystals! Craft 2 Magnetic Nozzles + 2 Plasma Fuel Rods -> Twin Plasma Drive -> 3 Hull Checks -> Launch!',
      zh: '向北进入地热区！按住 [Space] 飞上两侧高耸的玄武岩柱顶采集陨星钛矿，并在喷气孔旁按 [E] 钻探粉色地裂暗脉获取等离子晶簇！合成双联推进器装入船尾，完成 3 个点检位即可登船回家！'
    },
    steps: [
      {
        id: 'l5_nozzles',
        type: 'have_or_used',
        itemId: 'thrust_nozzle',
        needed: 2,
        consumedBy: ['propulsion_drive'],
        label: { en: 'Craft Magnetic Thrust Nozzles', zh: '制造磁约束推进喷管' }
      },
      {
        id: 'l5_rods',
        type: 'have_or_used',
        itemId: 'plasma_rod',
        needed: 2,
        consumedBy: ['propulsion_drive'],
        label: { en: 'Smelt Stabilized Plasma Fuel Rods', zh: '炼制稳定等离子燃料棒' }
      },
      {
        id: 'l5_install_propulsion',
        type: 'repair_installed',
        repairId: 'repair_propulsion',
        needed: 1,
        label: { en: 'Install Twin Plasma Propulsion Drive in Aft Engine Bay', zh: '安装双联等离子主推进器至尾部引擎舱' }
      },
      {
        id: 'l5_preflight',
        type: 'preflight_checks',
        needed: 3,
        label: { en: 'Complete Pre-Flight Hull Safety Checks', zh: '绕飞船完成起飞前安全点检' }
      },
      {
        id: 'l5_launch',
        type: 'launched',
        needed: 1,
        label: { en: 'Board the Starweaver & Launch Home!', zh: '登上舷梯点火起飞，重返母星家园！' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l5_log',
        type: 'read_log',
        logId: 'log_5',
        target: 1,
        label: { en: 'Retrieve Final Crew Keepsake Log #5 in Vent Field', zh: '在地热区寻回全体船员寄语日志 #5' },
        rewardItems: [{ id: 'coolant_canister', count: 1 }],
        rewardCosmetic: 'star_halo',
        rewardText: { en: '+1 Purified Coolant Cell & Starlight Celebration Aura', zh: '奖励: 纯化冷却液罐 ×1 & 星辉欢庆光环' }
      },
      {
        id: 'side_l5_plasma',
        type: 'gather_count',
        materialId: 'plasma_crystal',
        target: 6,
        label: { en: 'Harvest Plasma Crystals around Northern Vents', zh: '在北侧喷口采集地热等离子晶簇' },
        rewardItems: [{ id: 'copper_ingot', count: 2 }],
        rewardText: { en: '+2 Conductive Copper Ingots', zh: '奖励: 高导紫铜锭 ×2' }
      }
    ],
    unlockSummary: [
      { en: 'All 5 Starweaver Systems Online — Ready for Liftoff!', zh: '星织号全船 5 大系统 100% 修复完毕！' }
    ]
  }
];

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
    x: -64.5,
    z: -6.2,
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
  }
];

export function getElevatedPlatformAt(x, z, margin = 0) {
  for (const p of ELEVATED_PLATFORMS) {
    if (Math.hypot(x - p.x, z - p.z) <= p.radius + margin) {
      return p;
    }
  }
  return null;
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
  { id: 'n_dc_zeo_1', materialId: 'zeolite_ore', yield: 2, x: -6.5, z: 34.0, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_zeo_2', materialId: 'zeolite_ore', yield: 2, x: 7.2, z: 41.5, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_zeo_3', materialId: 'zeolite_ore', yield: 2, x: -8.8, z: 48.0, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_zeo_4', materialId: 'zeolite_ore', yield: 2, x: 9.5, z: 58.0, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_gel_1', materialId: 'coolant_gel', yield: 2, x: 5.5, z: 33.5, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_gel_2', materialId: 'coolant_gel', yield: 2, x: -4.5, z: 43.0, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_gel_3', materialId: 'coolant_gel', yield: 2, x: 4.8, z: 53.5, region: 'dry_canyon', regrow: 22, subsurface: true },
  { id: 'n_dc_qtz_1', materialId: 'quartz_crystal', yield: 2, x: -10.5, z: 60.5, region: 'dry_canyon', regrow: 22 },
  { id: 'n_dc_qtz_2', materialId: 'quartz_crystal', yield: 2, x: 8.5, z: 48.5, region: 'dry_canyon', regrow: 22 },
  { id: 'n_dc_iron_1', materialId: 'iron_scrap', yield: 2, x: 1.5, z: 47.0, region: 'dry_canyon', regrow: 22 },
  { id: 'n_dc_cop_1', materialId: 'copper_ore', yield: 2, x: -2.0, z: 59.5, region: 'dry_canyon', regrow: 22 },

  // --- Ancient Relay Gorge & Meteorite Star-Field (West, Level 4 — Sky-Mesa Jetpack Veins + Surface) ---
  { id: 'n_rg_sil_1', materialId: 'silver_ore', yield: 2, x: -31.0, z: 5.5, region: 'relay_gorge', regrow: 22 },
  { id: 'n_rg_qtz_1', materialId: 'quartz_crystal', yield: 2, x: -32.5, z: -6.0, region: 'relay_gorge', regrow: 22 },
  // Across Hard-Light Bridge: mix of ground & High Star-Field Sky-Mesa!
  { id: 'n_rg_tit_1', materialId: 'titanium_ore', yield: 2, x: -55.5, z: -4.8, region: 'relay_gorge', regrow: 22 },
  { id: 'n_rg_tit_2', materialId: 'titanium_ore', yield: 2, x: -65.6, z: -7.0, region: 'relay_gorge', regrow: 22, elevated: true, platformId: 'plat_starfield_mesa' },
  { id: 'n_rg_tit_3', materialId: 'titanium_ore', yield: 2, x: -68.5, z: 3.5, region: 'relay_gorge', regrow: 22 },
  { id: 'n_rg_lum_1', materialId: 'lumen_core', yield: 2, x: -57.0, z: 5.8, region: 'relay_gorge', regrow: 22 },
  { id: 'n_rg_lum_2', materialId: 'lumen_core', yield: 2, x: -63.4, z: -5.2, region: 'relay_gorge', regrow: 22, elevated: true, platformId: 'plat_starfield_mesa' },
  { id: 'n_rg_lum_3', materialId: 'lumen_core', yield: 2, x: -70.0, z: 2.2, region: 'relay_gorge', regrow: 22, subsurface: true },

  // --- Basalt Geothermal Vents (North, Level 5 — Dual-Capability Finale: Basalt Sky-Pillars + Deep Plasma Fissures!) ---
  { id: 'n_gf_pla_1', materialId: 'plasma_crystal', yield: 2, x: -5.5, z: -36.0, region: 'geothermal_field', regrow: 22, subsurface: true },
  { id: 'n_gf_pla_2', materialId: 'plasma_crystal', yield: 2, x: 6.2, z: -43.5, region: 'geothermal_field', regrow: 22, subsurface: true },
  { id: 'n_gf_pla_3', materialId: 'plasma_crystal', yield: 2, x: -7.5, z: -51.0, region: 'geothermal_field', regrow: 22, subsurface: true },
  { id: 'n_gf_pla_4', materialId: 'plasma_crystal', yield: 2, x: 4.0, z: -58.5, region: 'geothermal_field', regrow: 22, subsurface: true },
  { id: 'n_gf_tit_1', materialId: 'titanium_ore', yield: 2, x: -11.5, z: -44.0, region: 'geothermal_field', regrow: 22, elevated: true, platformId: 'plat_north_basalt_west' },
  { id: 'n_gf_tit_2', materialId: 'titanium_ore', yield: 2, x: 11.2, z: -49.5, region: 'geothermal_field', regrow: 22, elevated: true, platformId: 'plat_north_basalt_east' },
  { id: 'n_gf_gel_1', materialId: 'coolant_gel', yield: 2, x: -3.2, z: -61.0, region: 'geothermal_field', regrow: 22, subsurface: true },
  { id: 'n_gf_iron_1', materialId: 'iron_scrap', yield: 2, x: 9.8, z: -34.5, region: 'geothermal_field', regrow: 22 },
  { id: 'n_gf_cop_1', materialId: 'copper_ore', yield: 2, x: -9.2, z: -32.5, region: 'geothermal_field', regrow: 22 }
];

export const WORLD_FACILITIES = {
  furnace: {
    id: 'furnace',
    type: 'station',
    stationKind: 'furnace',
    x: 8.2,
    z: 2.2,
    radius: 1.45,
    name: { en: 'Solar Smelting Furnace', zh: '太阳能熔炼炉' },
    inspectDesc: {
      en: 'Concentrates desert sunlight to smelt raw ores and minerals into refined plates, ingots, lenses, and fuel rods.',
      zh: '汇聚荒漠阳光的高温熔炼炉，可将原矿提纯为铁板、紫铜锭、石英透镜与燃料棒。'
    }
  },
  fabricator: {
    id: 'fabricator',
    type: 'station',
    stationKind: 'fabricator',
    x: -8.2,
    z: 2.2,
    radius: 1.45,
    name: { en: 'Precision Fabrication Station', zh: '精密制造台' },
    inspectDesc: {
      en: 'Automated assembly bench that combines refined materials into sub-assemblies and spacecraft repair modules.',
      zh: '自动化精密组装平台，可将精炼材料加工为子部件与飞船核心修复总成。'
    }
  },
  outpost_purifier: {
    id: 'outpost_purifier',
    type: 'station',
    stationKind: 'both',
    unlockLevel: 3,
    x: 0.5,
    z: 51.0,
    radius: 1.4,
    name: { en: 'Outpost Field Smelter & Fabricator', zh: '科研站便携熔炼制造一体台' },
    inspectDesc: {
      en: 'Field workbench left by the research team — supports both smelting and fabrication right inside Dry Canyon!',
      zh: '科研队留下的便携工程台，支持在峡谷现场直接进行熔炼与合成，省去来回奔波！'
    }
  },
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
    x: -63.5,
    z: -1.5,
    radius: 1.6,
    region: 'relay_gorge'
  },
  boarding_ramp: {
    id: 'boarding_ramp',
    x: 3.3,
    z: 1.8
  }
};
