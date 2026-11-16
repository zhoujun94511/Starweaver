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
  {
    id: 'craft_solar_battery',
    station: 'fabricator',
    unlockLevel: 2,
    craftSeconds: 1.4,
    oneTimeEquipment: 'battery',
    inputs: [
      { id: 'copper_ingot', count: 1 },
      { id: 'quartz_lens', count: 1 },
      { id: 'silver_wire', count: 1 }
    ],
    output: { id: 'solar_battery', count: 1 }
  },

  // --- Level 3 Recipes (Geo-Drill Upgrade + Multi-step Life Support chain) ---
  {
    id: 'craft_geo_drill',
    station: 'fabricator',
    unlockLevel: 3,
    craftSeconds: 1.1,
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
    craftSeconds: 0.9,
    inputs: [{ id: 'zeolite_ore', count: 2 }],
    output: { id: 'filter_core', count: 1 }
  },
  {
    id: 'smelt_coolant_canister',
    station: 'furnace',
    unlockLevel: 3,
    craftSeconds: 0.95,
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
    craftSeconds: 1.05,
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
    craftSeconds: 1.05,
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
    craftSeconds: 1.35,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_lifesupport',
    inputs: [
      { id: 'bio_filter_assembly', count: 1 },
      { id: 'thermal_regulator', count: 1 }
    ],
    output: { id: 'life_support_unit', count: 1 }
  },
  {
    id: 'craft_wide_treads',
    station: 'fabricator',
    unlockLevel: 3,
    craftSeconds: 1.1,
    oneTimeEquipment: 'treads',
    inputs: [
      { id: 'iron_plate', count: 2 },
      { id: 'copper_ingot', count: 1 },
      { id: 'filter_core', count: 1 }
    ],
    output: { id: 'wide_treads', count: 1 }
  },

  // --- Level 4 Recipes (Jetpack Wings Upgrade + Navigation Core) ---
  {
    id: 'craft_jetpack_wing',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.15,
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
    craftSeconds: 0.95,
    inputs: [{ id: 'titanium_ore', count: 2 }],
    output: { id: 'titanium_alloy', count: 1 }
  },
  {
    id: 'craft_gyro_circuit',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.05,
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
    craftSeconds: 1.05,
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
    craftSeconds: 1.4,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_nav',
    inputs: [
      { id: 'titanium_alloy', count: 2 },
      { id: 'gyro_circuit', count: 1 },
      { id: 'starlight_prism', count: 1 }
    ],
    output: { id: 'nav_computer', count: 1 }
  },
  {
    id: 'craft_mining_drone',
    station: 'fabricator',
    unlockLevel: 4,
    craftSeconds: 1.2,
    oneTimeEquipment: 'drone_fleet',
    inputs: [
      { id: 'titanium_alloy', count: 1 },
      { id: 'gyro_circuit', count: 1 },
      { id: 'copper_ingot', count: 1 }
    ],
    output: { id: 'mining_drone', count: 1 }
  },

  // --- Level 5 Recipes ---
  {
    id: 'smelt_plasma_rod',
    station: 'furnace',
    unlockLevel: 5,
    craftSeconds: 1.0,
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
    craftSeconds: 1.1,
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
    craftSeconds: 1.5,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_propulsion',
    inputs: [
      { id: 'thrust_nozzle', count: 2 },
      { id: 'plasma_rod', count: 2 }
    ],
    output: { id: 'propulsion_drive', count: 1 }
  },
  {
    id: 'craft_high_tank',
    station: 'fabricator',
    unlockLevel: 5,
    craftSeconds: 1.15,
    oneTimeEquipment: 'fuel_tank',
    inputs: [
      { id: 'titanium_alloy', count: 1 },
      { id: 'coolant_canister', count: 1 },
      { id: 'plasma_rod', count: 1 }
    ],
    output: { id: 'high_tank', count: 1 }
  },

  // --- Level 6 Recipes (Southeast Crystalline Salt Flats & Photonic Orbital Shield) ---
  {
    id: 'smelt_lithium_cell',
    station: 'furnace',
    unlockLevel: 6,
    craftSeconds: 1.0,
    inputs: [{ id: 'lithium_salt', count: 2 }],
    output: { id: 'lithium_cell', count: 1 }
  },
  {
    id: 'smelt_optical_prism',
    station: 'furnace',
    unlockLevel: 6,
    craftSeconds: 1.0,
    inputs: [
      { id: 'halite_crystal', count: 2 },
      { id: 'quartz_crystal', count: 1 }
    ],
    output: { id: 'optical_prism', count: 1 }
  },
  {
    id: 'craft_reentry_shield',
    station: 'fabricator',
    unlockLevel: 6,
    craftSeconds: 1.55,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_shield',
    inputs: [
      { id: 'lithium_cell', count: 2 },
      { id: 'optical_prism', count: 2 },
      { id: 'titanium_alloy', count: 1 }
    ],
    output: { id: 'reentry_shield', count: 1 }
  },
  {
    id: 'craft_wide_sonar',
    station: 'fabricator',
    unlockLevel: 6,
    craftSeconds: 1.15,
    oneTimeEquipment: 'sonar_array',
    inputs: [
      { id: 'lithium_cell', count: 1 },
      { id: 'optical_prism', count: 1 },
      { id: 'silver_wire', count: 1 }
    ],
    output: { id: 'wide_sonar', count: 1 }
  },

  // --- Level 7 Finale Recipes (Northwest Mothership Wreckage & Quantum Hyperdrive Ring) ---
  {
    id: 'smelt_warp_coil',
    station: 'furnace',
    unlockLevel: 7,
    craftSeconds: 1.05,
    inputs: [
      { id: 'hyper_alloy', count: 2 },
      { id: 'silver_ore', count: 1 }
    ],
    output: { id: 'warp_coil', count: 1 }
  },
  {
    id: 'craft_quantum_matrix',
    station: 'fabricator',
    unlockLevel: 7,
    craftSeconds: 1.1,
    inputs: [
      { id: 'quantum_core', count: 2 },
      { id: 'lithium_cell', count: 1 }
    ],
    output: { id: 'quantum_matrix', count: 1 }
  },
  {
    id: 'craft_hyperdrive_ring',
    station: 'fabricator',
    unlockLevel: 7,
    craftSeconds: 1.6,
    oneTimeMainComponent: true,
    targetRepairId: 'repair_hyperdrive',
    inputs: [
      { id: 'warp_coil', count: 2 },
      { id: 'quantum_matrix', count: 2 },
      { id: 'plasma_rod', count: 1 }
    ],
    output: { id: 'hyperdrive_ring', count: 1 }
  }
];

export const REPAIR_TARGETS = {
  repair_power: {
    id: 'repair_power',
    level: 1,
    requiredItem: 'power_core',
    position: { x: 2.6, y: 1.0, z: 3.1 },
    shortLabel: { en: '1.Power', zh: '1.电力' },
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
    shortLabel: { en: '2.Comms', zh: '2.通信' },
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
    shortLabel: { en: '3.LifeSup', zh: '3.维生' },
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
    shortLabel: { en: '4.Nav', zh: '4.导航' },
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
    shortLabel: { en: '5.Thrust', zh: '5.推进' },
    name: { en: 'Aft Main Thruster Mount', zh: '飞船尾部主推进引擎舱' },
    inspectDesc: {
      en: 'Twin orbital engine mount. Install 1x Twin Plasma Propulsion Drive to restore main thrust.',
      zh: '飞船尾部主推进器安装位，装入【双联等离子主推进器】即可恢复轨道推进动力。'
    }
  },
  repair_shield: {
    id: 'repair_shield',
    level: 6,
    requiredItem: 'reentry_shield',
    position: { x: -2.15, y: 1.2, z: 4.85 },
    shortLabel: { en: '6.Shield', zh: '6.护盾' },
    name: { en: 'Dorsal Photonic Heat-Shield Bay', zh: '飞船机背光子热护盾舱' },
    inspectDesc: {
      en: 'Controls the dorsal photonic deflector crown. Install 1x Photonic Orbital Heat-Shield to pierce atmospheric dust shear.',
      zh: '控制机背光子偏折护盾冠，装入【光子轨道热防护盾】即可保护船体穿透高空电离沙暴层。'
    }
  },
  repair_hyperdrive: {
    id: 'repair_hyperdrive',
    level: 7,
    requiredItem: 'hyperdrive_ring',
    position: { x: 2.15, y: 1.2, z: 4.85 },
    shortLabel: { en: '7.Warp', zh: '7.跃迁' },
    name: { en: 'Quantum Hyperdrive Ring Pylon', zh: '飞船量子跃迁环基座' },
    inspectDesc: {
      en: 'Controls the orbital quantum jump-ring around the fuselage. Install 1x Quantum Hyperdrive Ring, then complete pre-flight checks to fold starlight home!',
      zh: '驱动环绕机身的量子跃迁光环，装入【量子超空间跃迁环】并完成起飞安全点检即可跨越星海返回家园！'
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
