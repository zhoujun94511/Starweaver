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
      { en: 'New Recipes: Precision Quartz Lens, Silver Signal Coil, Deep-Space Transceiver', zh: '解锁新配方: 精密石英透镜、纯银信号线圈、深空通信收发阵列' },
      { en: 'Station Facility Blueprint: Phase-Change Storage Battery (Night/Storm Smelt Buffer)', zh: '解锁营地设施蓝图: 【相变储能稳压电池组】（星夜/沙暴熔炼不降速）' }
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
    prerequisiteMechanism: 'pylons',
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
    title: { en: 'Level 5 — Basalt Vents & Main Propulsion', zh: '第 5 关 —— 地热喷口与主推进器' },
    regionId: 'geothermal_field',
    repairTargetId: 'repair_propulsion',
    requiredComponentId: 'propulsion_drive',
    summary: {
      en: 'Combine Flight & Geo-Drilling in the Northern Basalt Field: jet-boost [Space] onto towering basalt spires for Titanium, sonar-drill [V]/[E] deep fissures for Plasma Crystals, and install the Twin Plasma Propulsion Drive.',
      zh: '在北侧玄武岩地热区综合运用【喷气飞行 + 钻地探矿】：按住 [Space] 飞上六方玄武岩柱顶采陨钛、在火山口旁按 [V]/[E] 下钻深探等离子母晶，合成并安装【双联等离子主推进器】。'
    },
    hintText: {
      en: 'Go North (-Z)! Fly [Space] onto the tall Basalt Column Plateaus for Meteoric Titanium, and drill [E] into glowing pink Geothermal Fissures for Plasma Crystals! Craft 2 Magnetic Nozzles + 2 Plasma Fuel Rods -> Twin Plasma Drive!',
      zh: '向北进入地热区！按住 [Space] 飞上两侧高耸的玄武岩柱顶采集陨星钛矿，并在喷气孔旁按 [E] 钻探粉色地裂暗脉获取等离子晶簇！合成双联推进器装入船尾！'
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
      }
    ],
    sideTasks: [
      {
        id: 'side_l5_log',
        type: 'read_log',
        logId: 'log_5',
        target: 1,
        label: { en: 'Retrieve Engineer Tariq’s Log #5 in Vent Field', zh: '在地热区读取工程师塔里克日志 #5' },
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
        rewardItems: [{ id: 'titanium_alloy', count: 1 }],
        rewardText: { en: '+1 Aerospace Titanium Bar (Head-start for Lv.6 Shield!)', zh: '奖励: 航宇钛合金锭 ×1 (助力第 6 关热护盾！)' }
      }
    ],
    unlockSummary: [
      { en: 'Southeast Diagonal Pass Opened: Crystalline Salt Flats & Shore Field Workbench', zh: '解锁对角新扇区: 东南【晶化盐湖·天空之镜】及岸边便携一体加工台' },
      { en: 'Final Shield Recipes: Solid-State Lithium Cell, Halite Deflection Prism, Photonic Orbital Shield', zh: '解锁终章护盾配方: 固态锂能蓄电芯、岩盐偏折光学棱镜、光子轨道热防护盾' }
    ]
  },

  {
    level: 6,
    id: 'level_6',
    title: { en: 'Level 6 — Crystalline Salt Flats & Photonic Shield', zh: '第 6 关 —— 晶化盐湖与光子热护盾' },
    regionId: 'salt_flats',
    repairTargetId: 'repair_shield',
    requiredComponentId: 'reentry_shield',
    summary: {
      en: 'Cross the Southeast Saltstone Pass onto the mirror Crystalline Salt Flats! Harvest High-Purity Lithium Salt and Starlight Halite Crystals, refine on-site at the Salt-Mirror Workbench, and install the Photonic Orbital Heat-Shield.',
      zh: '穿过东南盐岩山口踏入浩瀚如镜的【晶化盐湖】！采集高纯锂卤晶盐与星芒岩盐棱晶，利用岸边便携一体台现场加工并激活机背【光子轨道热防护盾】。'
    },
    hintText: {
      en: 'Head Southeast (+X, +Z) through the Saltstone Arch onto the Sky-Mirror Salt Pan! Gather Lithium Salt & Halite Crystals, then use the Salt-Mirror Field Workbench right on the shore to craft 2 Lithium Cells + 2 Halite Prisms -> Photonic Shield!',
      zh: '沿东南对角线（+X, +Z）穿过盐岩拱门进入天空之镜盐湖！采集高纯锂卤晶盐与星芒岩盐棱晶后，可直接在盐湖岸边的【便携熔炼制造一体台】就地炼制锂电芯与岩盐棱镜并合成热护盾！'
    },
    steps: [
      {
        id: 'l6_cells',
        type: 'have_or_used',
        itemId: 'lithium_cell',
        needed: 2,
        consumedBy: ['reentry_shield'],
        label: { en: 'Smelt Solid-State Lithium Cells', zh: '熔炼固态锂能蓄电芯' }
      },
      {
        id: 'l6_prisms',
        type: 'have_or_used',
        itemId: 'optical_prism',
        needed: 2,
        consumedBy: ['reentry_shield'],
        label: { en: 'Smelt Halite Deflection Prisms', zh: '熔炼岩盐偏折光学棱镜' }
      },
      {
        id: 'l6_install_shield',
        type: 'repair_installed',
        repairId: 'repair_shield',
        needed: 1,
        label: { en: 'Install Photonic Orbital Heat-Shield on Dorsal Bay', zh: '将光子轨道热防护盾安装至机背护盾舱' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l6_log',
        type: 'read_log',
        logId: 'log_6',
        target: 1,
        label: { en: 'Read Optics Officer Vera’s Log #6 by the Salt Mirror', zh: '在盐湖岸边读取光学官薇拉日志 #6' },
        rewardItems: [{ id: 'quartz_crystal', count: 2 }],
        rewardText: { en: '+2 Sun-Quartz Crystals', zh: '奖励: 日光石英簇 ×2' }
      },
      {
        id: 'side_l6_lithium',
        type: 'gather_count',
        materialId: 'lithium_salt',
        target: 6,
        label: { en: 'Harvest 6 High-Purity Lithium Salt Samples on the Salt Flats', zh: '在晶化盐湖采集 6 份高纯锂卤晶盐' },
        rewardItems: [{ id: 'plasma_rod', count: 1 }],
        rewardText: { en: '+1 Stabilized Plasma Fuel Rod (Lv.7 Hyperdrive Prep!)', zh: '奖励: 稳定等离子燃料棒 ×1 (助力第 7 关跃迁环！)' }
      }
    ],
    unlockSummary: [
      { en: 'Northwest Diagonal Route Opened: Mothership Wreckage Field & Salvage Workbench', zh: '解锁终章新扇区: 西北【母舰残骸带·先驱坟场】及营口便携一体台' },
      { en: 'Finale Blueprints: Superconducting Warp Coil, Quantum Phase Matrix, Quantum Hyperdrive Ring', zh: '解锁跃迁配方: 超导跃迁磁线圈、量子相位谐振矩阵、量子超空间跃迁环' },
      { en: 'Milo Upgrade Available: Deep-Spectrum 85m Sonar Array', zh: '解锁可选挂载: 【广域深层谐振声呐】（声呐范围扩至 85m）' }
    ]
  },

  {
    level: 7,
    id: 'level_7',
    title: { en: 'Level 7 — Mothership Wreckage & Hyperspace Home', zh: '第 7 关 —— 母舰残骸与超空间返航' },
    regionId: 'mothership_graveyard',
    repairTargetId: 'repair_hyperdrive',
    requiredComponentId: 'hyperdrive_ring',
    requiresLaunch: true,
    summary: {
      en: 'Navigate beneath and atop the colossal fractured hull ribs of the Northwest Mothership Wreckage! Salvage Hyper-Alloys & Quantum Singularity Shards, forge the Quantum Hyperdrive Ring at the Salvage Workbench, complete 3 Pre-Flight Checks, and fold starlight home!',
      zh: '深入西北【母舰残骸带】穿行于巨型断裂拱肋与高悬机翼甲板之间！回收母舰超导装甲与量子奇点晶核，在营口便携一体台锻造【量子超空间跃迁环】，完成 3 项点检后折叠星光重返母星家园！'
    },
    hintText: {
      en: 'Head Northwest (-X, -Z) into the Mothership Wreckage! Salvage Hyper-Alloys & Quantum Shards, forge 2 Warp Coils + 2 Quantum Matrices -> Hyperdrive Ring right at the Salvage Field Workbench, then return to complete 3 Hull Checks & Launch!',
      zh: '向西北对角线（-X, -Z）进入母舰残骸带！采集超导装甲片与量子奇点晶核后，可在残骸入口的【便携熔炼制造一体台】现场锻造跃迁线圈与相位矩阵并总装量子跃迁环，再回飞船完成 3 项点检点火返航！'
    },
    steps: [
      {
        id: 'l7_coils',
        type: 'have_or_used',
        itemId: 'warp_coil',
        needed: 2,
        consumedBy: ['hyperdrive_ring'],
        label: { en: 'Smelt Superconducting Warp Coils', zh: '熔锻超导跃迁磁线圈' }
      },
      {
        id: 'l7_matrices',
        type: 'have_or_used',
        itemId: 'quantum_matrix',
        needed: 2,
        consumedBy: ['hyperdrive_ring'],
        label: { en: 'Assemble Quantum Phase Matrices', zh: '组装量子相位谐振矩阵' }
      },
      {
        id: 'l7_install_hyperdrive',
        type: 'repair_installed',
        repairId: 'repair_hyperdrive',
        needed: 1,
        label: { en: 'Install Quantum Hyperdrive Ring on Starweaver', zh: '安装并唤醒飞船量子超空间跃迁环' }
      },
      {
        id: 'l7_preflight',
        type: 'preflight_checks',
        needed: 3,
        label: { en: 'Complete Pre-Flight Hull Safety Checks', zh: '绕飞船完成起飞前安全点检' }
      },
      {
        id: 'l7_launch',
        type: 'launched',
        needed: 1,
        label: { en: 'Board Starweaver & Jump Across Starlight Home!', zh: '登上舷梯启动超空间跃迁，重返翠绿家园！' }
      }
    ],
    sideTasks: [
      {
        id: 'side_l7_log',
        type: 'read_log',
        logId: 'log_7',
        target: 1,
        label: { en: 'Read Captain Mira’s Pioneer Log #7 inside Wreckage', zh: '在母舰残骸区读取米拉船长日志 #7' },
        rewardItems: [{ id: 'lithium_cell', count: 1 }],
        rewardText: { en: '+1 Solid-State Lithium Cell', zh: '奖励: 固态锂能蓄电芯 ×1' }
      },
      {
        id: 'side_l7_quantum',
        type: 'gather_count',
        materialId: 'quantum_core',
        target: 5,
        label: { en: 'Recover 5 Quantum Singularity Shards in Wreckage', zh: '在母舰残骸区回收 5 枚量子奇点晶核' },
        rewardItems: [{ id: 'warp_coil', count: 1 }],
        rewardText: { en: '+1 Superconducting Warp Coil', zh: '奖励: 超导跃迁磁线圈 ×1' }
      }
    ],
    unlockSummary: [
      { en: 'All 7 Starweaver Systems Online — Quantum Hyperdrive Ready!', zh: '星织号全船 7 大系统 100% 修复完毕 —— 超空间跃迁就绪！' }
    ]
  }
];
