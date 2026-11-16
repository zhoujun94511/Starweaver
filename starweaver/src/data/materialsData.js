export const MATERIALS = {
  // === Raw Materials ===
  iron_scrap: {
    id: 'iron_scrap',
    category: 'raw',
    visualArchetype: 'scrap',
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
    visualArchetype: 'ore',
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
    visualArchetype: 'crystal',
    color: '#7ce8ff',
    emissive: '#1e6e88',
    name: { en: 'Sun-Quartz Crystal', zh: '日光石英簇' },
    sourceRegions: ['crash_basin', 'whispering_ridge', 'dry_canyon', 'salt_flats'],
    description: {
      en: 'Translucent sky-blue quartz shards abundant along Whispering Ridge.',
      zh: '晶莹剔透的浅蓝石英晶体，在东侧低语山脊尤为丰富。'
    }
  },
  silver_ore: {
    id: 'silver_ore',
    category: 'raw',
    visualArchetype: 'ore',
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
    visualArchetype: 'zeolite',
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
    visualArchetype: 'gel',
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
    visualArchetype: 'ore',
    color: '#9aa8ff',
    emissive: '#222b68',
    name: { en: 'Meteoric Titanium', zh: '陨星钛矿' },
    sourceRegions: ['relay_gorge', 'geothermal_field', 'salt_flats'],
    description: {
      en: 'Ultra-light aerospace metal found across the Energy Bridge in Relay Gorge.',
      zh: '分布在西侧能量桥对岸陨星原的超轻航空级陨钛矿。'
    }
  },
  lumen_core: {
    id: 'lumen_core',
    category: 'raw',
    visualArchetype: 'crystal',
    hasOrbitHalo: true,
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
    visualArchetype: 'crystal',
    color: '#ff6ec7',
    emissive: '#851858',
    name: { en: 'Geothermal Plasma Crystal', zh: '地热等离子晶簇' },
    sourceRegions: ['geothermal_field'],
    description: {
      en: 'High-thrust energetic crystals formed around Northern Geothermal Vents.',
      zh: '在北侧玄武岩地热喷口凝结的高推力能量晶体。'
    }
  },
  lithium_salt: {
    id: 'lithium_salt',
    category: 'raw',
    visualArchetype: 'zeolite',
    color: '#e6f9ff',
    emissive: '#296e7d',
    name: { en: 'High-Purity Lithium Salt', zh: '高纯锂卤晶盐' },
    sourceRegions: ['salt_flats'],
    description: {
      en: 'Lustrous evaporite lithium salt crusts crystallized along the Southeast Salt Flats.',
      zh: '在东南晶化盐湖浅滩自然析出的高纯度蒸发锂盐结晶。'
    }
  },
  halite_crystal: {
    id: 'halite_crystal',
    category: 'raw',
    visualArchetype: 'crystal',
    color: '#7af7e6',
    emissive: '#147a6e',
    name: { en: 'Starlight Halite Crystal', zh: '星芒岩盐棱晶' },
    sourceRegions: ['salt_flats'],
    description: {
      en: 'Optically clear geometric halite prisms formed across the mirror brine pan.',
      zh: '凝结于天空之镜卤水盘与周边孤峰的高透几何岩盐晶体。'
    }
  },
  hyper_alloy: {
    id: 'hyper_alloy',
    category: 'raw',
    visualArchetype: 'scrap',
    color: '#c8b8ff',
    emissive: '#382475',
    name: { en: 'Mothership Hyper-Alloy Plate', zh: '母舰超导装甲片' },
    sourceRegions: ['mothership_graveyard'],
    description: {
      en: 'Iridescent starship hull plating salvaged from the Northwest Mothership Wreckage.',
      zh: '散落在西北先驱母舰拱肋与断裂机翼间的耐跃迁超导装甲残片。'
    }
  },
  quantum_core: {
    id: 'quantum_core',
    category: 'raw',
    visualArchetype: 'crystal',
    hasOrbitHalo: true,
    color: '#b87cff',
    emissive: '#56189e',
    name: { en: 'Quantum Singularity Shard', zh: '量子奇点晶核' },
    sourceRegions: ['mothership_graveyard'],
    description: {
      en: 'Resonant subspace crystal cores preserved inside the Mothership’s elevated cargo deck and deep vaults.',
      zh: '封存在母舰高悬货舱甲板与地底反应堆裂隙中的亚空间共鸣晶核。'
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
  lithium_cell: {
    id: 'lithium_cell',
    category: 'refined',
    color: '#b8f7ff',
    emissive: '#1b6d7a',
    name: { en: 'Solid-State Lithium Cell', zh: '固态锂能蓄电芯' },
    sourceRegions: ['salt_flats'],
    craftedIn: 'furnace',
    description: {
      en: 'High-density capacitor cell sintered from High-Purity Lithium Salt.',
      zh: '由高纯锂卤晶盐在熔炼炉高温烧结而成的固态高能电芯。'
    }
  },
  optical_prism: {
    id: 'optical_prism',
    category: 'refined',
    color: '#6dfce8',
    emissive: '#10786c',
    name: { en: 'Halite Deflection Prism', zh: '岩盐偏折光学棱镜' },
    sourceRegions: ['salt_flats'],
    craftedIn: 'furnace',
    description: {
      en: 'Laser-grade refractive prism fused from Starlight Halite and Sun-Quartz.',
      zh: '由星芒岩盐棱晶与日光石英熔融退火而成的热防护偏折棱镜。'
    }
  },
  warp_coil: {
    id: 'warp_coil',
    category: 'refined',
    color: '#d4b8ff',
    emissive: '#4d208c',
    name: { en: 'Superconducting Warp Coil', zh: '超导跃迁磁线圈' },
    sourceRegions: ['mothership_graveyard'],
    craftedIn: 'furnace',
    description: {
      en: 'Zero-resistance jump-field coil forged from Mothership Hyper-Alloy and Silver.',
      zh: '由母舰超导装甲片与纯银伴生矿在高温炉熔锻而成的零阻跃迁线圈。'
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
  quantum_matrix: {
    id: 'quantum_matrix',
    category: 'subcomponent',
    color: '#c28aff',
    emissive: '#581aa3',
    name: { en: 'Quantum Phase Matrix', zh: '量子相位谐振矩阵' },
    sourceRegions: ['mothership_graveyard'],
    craftedIn: 'fabricator',
    description: {
      en: 'Folds hyperspace coordinates using Quantum Singularity Shards and Lithium Cells.',
      zh: '由量子奇点晶核与固态锂电芯精密封装的跨星系空间折叠矩阵。'
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
  solar_battery: {
    id: 'solar_battery',
    category: 'equipment',
    equipmentSlot: 'battery',
    color: '#ffd24d',
    emissive: '#8f5f00',
    name: { en: 'Phase-Change Storage Battery', zh: '相变储能稳压电池组' },
    sourceRegions: ['whispering_ridge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Station Facility — Installs a thermal-electric storage bank beside the Solar Furnace, keeping smelting at 1.0× speed even during Starry Nights and Sandstorms!',
      zh: '永久营地设施 —— 在太阳能熔炼炉旁加装储能稳压柜，使星夜与沙暴期间的熔炼速度不低于 1.0×，晴昼依然享受最高 1.5× 聚光加速！'
    }
  },
  wide_treads: {
    id: 'wide_treads',
    category: 'equipment',
    equipmentSlot: 'treads',
    color: '#ff9c52',
    emissive: '#8c3f08',
    name: { en: 'All-Terrain Wide Treads', zh: '全地形宽幅防风履带' },
    sourceRegions: ['dry_canyon'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Milo Upgrade — Boosts overland cruising speed by +22% and grants full immunity to sandstorm headwind drag on steep dunes!',
      zh: '永久能力挂载 —— 提升米洛地面巡航移速 +22%，并在荒漠沙尘暴与陡坡上免疫风阻减速！'
    }
  },
  high_tank: {
    id: 'high_tank',
    category: 'equipment',
    equipmentSlot: 'fuel_tank',
    color: '#66ffba',
    emissive: '#0c7848',
    name: { en: 'High-Capacity Thruster Tank', zh: '高能压缩推进气罐' },
    sourceRegions: ['geothermal_field'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Milo Upgrade — Doubles jetpack flight duration (2.0×) and increases aerial glide speed!',
      zh: '永久能力挂载 —— 将喷气飞行翼滞空续航翻倍（2.0×），并提升空中滑翔机动速度！'
    }
  },
  wide_sonar: {
    id: 'wide_sonar',
    category: 'equipment',
    equipmentSlot: 'sonar_array',
    color: '#7af0ff',
    emissive: '#106c85',
    name: { en: 'Deep-Spectrum Sonar Array', zh: '广域深层谐振声呐' },
    sourceRegions: ['salt_flats'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Milo Upgrade — Expands [V] Sonar scan radius from 42m to 85m across entire sectors!',
      zh: '永久能力挂载 —— 将脉冲探矿声呐 [V] 的扫描半径从 42m 大幅扩增至 85m，一发扫穿整片矿区！'
    }
  },
  mining_drone: {
    id: 'mining_drone',
    category: 'equipment',
    equipmentSlot: 'drone_fleet',
    color: '#8affc1',
    emissive: '#12804d',
    name: { en: 'Autonomous Mining Drone Bay', zh: '自动巡航采矿无人机坞' },
    sourceRegions: ['relay_gorge'],
    craftedIn: 'fabricator',
    description: {
      en: 'Permanent Camp Automation — Deploys hovering helper drones from the hub pad that automatically deliver unlocked regional raw ores to your cargo every 14s!',
      zh: '永久自动化设施 —— 在营地启用悬浮采矿无人机编队，每 14 秒自动从已解锁矿区巡航采集原矿并送入货舱！'
    }
  },

  // === Main Spacecraft Repair Modules ===
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
      en: 'Level 5 Main Component — Restores main orbital thrusters for atmospheric ascent!',
      zh: '第 5 关主线核心组件 —— 修复尾部主推进引擎，赋予飞船冲出引力井的澎湃推力！'
    }
  },
  reentry_shield: {
    id: 'reentry_shield',
    category: 'ship_module',
    color: '#6dfce8',
    emissive: '#0e786c',
    name: { en: 'Photonic Orbital Heat-Shield', zh: '光子轨道热防护盾' },
    sourceRegions: ['salt_flats'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 6 Main Component — Deploys the dorsal photonic deflector crown to pierce Kharis-4’s upper-atmosphere dust shear!',
      zh: '第 6 关主线核心组件 —— 激活机背光子偏折护盾冠，保护星织号安全穿透高空电离沙暴切变层！'
    }
  },
  hyperdrive_ring: {
    id: 'hyperdrive_ring',
    category: 'ship_module',
    color: '#c58cff',
    emissive: '#581ba8',
    name: { en: 'Quantum Hyperdrive Ring', zh: '量子超空间跃迁环' },
    sourceRegions: ['mothership_graveyard'],
    craftedIn: 'fabricator',
    description: {
      en: 'Level 7 Finale Component — Awakens the Starweaver’s spinning quantum jump-ring to fold starlight across light-years back to Homeworld!',
      zh: '第 7 关终章核心组件 —— 唤醒环绕星织号机身的量子跃迁光环，折叠星海跨越光年重返翠绿母星家园！'
    }
  }
};

export function getMaterialVisualArchetype(mat) {
  if (!mat) return 'ore';
  if (mat.visualArchetype) return mat.visualArchetype;
  if (mat.id && mat.id.includes('crystal')) return 'crystal';
  if (mat.id && mat.id.includes('scrap')) return 'scrap';
  if (mat.id && mat.id.includes('gel')) return 'gel';
  return 'ore';
}
