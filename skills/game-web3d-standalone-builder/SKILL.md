---
name: game-web3d-standalone-builder
description: "当用户要求从零开发、重构或打磨可离线运行的 Three.js / Web 3D 独立游戏，或解决程序化 3D 像粗糙 Demo、穿模、昼夜天气与过场探针失步、新手迷路、多屏遮挡与手机触控适配时触发 —— 完成数据驱动架构、GPU PBR / 软阴影 / 体积光收敛、可收起 HUD 到离线单 HTML 交付。不适用于联网对战或 Unity/Unreal 工程。"
permissions:
  allow:
    - "Bash(npm install *)"
    - "Bash(npm run *)"
    - "Bash(node scripts/*)"
    - "Bash(node skills/game-web3d-standalone-builder/scripts/*)"
dependencies:
  mcp:
    - name: ide-browser
      config: "内置浏览器（用于多机位 3D 视觉收敛、断网模拟与多分辨率 BoundingBox 零重叠验收）"
  cli:
    - name: node
      verify: "node --version"
    - name: npm
      verify: "npm --version"
  api_keys: []
  scripts:
    - skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
smoke_test:
  command: "node --version && npm --version"
  expected_exit: 0
  description: "验证本地 Node.js 与 npm 打包及无头校验运行时可用"
---

# Skill: 单文件离线 Web 3D 精品游戏构建与打磨 (game-web3d-standalone-builder)

> **你是资深 Web 3D 游戏工程师、技术美术（TA）与关卡设计师。** 你的职责是在保持模块化 ES Modules 源码可维护性的前提下，构建并交付 **100% 离线自包含、零外部网络请求、支持桌面与手机触屏双端** 的完整可玩 Three.js 3D 游戏；关键约束是严禁停留在设计文档或第一关原型，必须通过程序化雕刻、GPU PBR、预烘焙昼夜探针、接触软阴影、选择性辉光、DAG 净缺口引导、弹簧臂防穿模、侧拉胶囊 HUD 与真实浏览器多视口验收消除“粗糙几何体 Demo 感”。

## 执行流程

### Phase 0: 工作区探查与双产物工程初始化

**目标：** 探查现有目录规约，建立「模块化源码 `src/` + 单文件打包 `dist/<game>.html` + 自动化校验 `scripts/`」骨架，绝不覆盖用户已有文件。

1. 检查工作区文件与 Node/npm 版本：

```bash
ls -la && node -v && npm -v
```

2. **决策分支**：
   - **已有 `package.json` / 构建栈** → 复用现有依赖与目录约定，增量挂载单文件打包脚本。
   - **空目录或无构建栈** → 初始化轻量依赖（仅 `dependencies: { "three" }` 与 `devDependencies: { "esbuild" }`），按职责划分模块：`src/data/`（关卡/材料/配方/i18n）、`src/state/`（权威状态机）、`src/graphics/`（PBR 贴图/雕刻网格/IBL/Bloom/粒子池）、`src/scene/`（世界/主目标/相机）、`src/entities/`（角色控制与挂件）、`src/systems/`（交互与 DAG 引导）、`src/ui/`（HUD 抽屉与多指触控）。

---

### Phase 1: 数据驱动关卡架构与防死锁权威状态机

**目标：** 在不依赖 DOM 的纯逻辑层跑通全关卡资源采集、多步加工、能力装备解锁与结局闭环，前置消灭死档与吞材料漏洞。

1. **结构化数据表（`src/data/gameData.js`）**：
   - 将区域解锁、原矿/精炼件/子部件/核心模块、永久能力装备（如声呐螺旋钻头、喷气飞行翼）、主线步骤与可选支线全部定义为纯数据，严禁散落在 UI 点击回调中。
   - **防卡死铁律**：主线矿脉固定确定性产量（禁用随机掉落卡主线），并设置自然再生冷却（如 `22s`），确保误合成绝不会永久耗尽通关必需物资。
2. **唯一权威状态机（`src/state/gameState.js`）**：
   - 支线进度、当前关进度、全局总进度三层 UI 指标必须由同一状态实时派生。
   - 主线核心模块与永久装备启用幂等防重造锁（持有中 / 队列中 / 已安装时禁止重复扣料）。
   - **防吞档合并持久化**：`save()` 采用 `120ms` 防抖合并写入，生成快照时必须将 `craftingQueue` 中未走完读条的产出折算并入快照，并在 `load()`、`pagehide`、`visibilitychange(hidden)` 时同步执行 `flushSave()`。快照还要带上 `craftedEver` 与 `totalCrafted`，但运行中的计数仍等读条真正结束再加，避免未刷盘的保存重复计数。矿点重生剩余时间和昼夜相位一并写入存档。
3. 编写并实跑无头全通关模拟脚本（验证每关原矿单轮充足度、缺料安全失败、防重复领奖）：

```bash
node scripts/verify-data.mjs
```

---

### Phase 2: 程序化 3D 视觉精雕与渲染管线（消除“积木 Demo 感”）

**目标：** 在零外部模型/图片的前提下，用程序化 PBR、IBL 反射、高阈值 Bloom 与雕刻网格建立精品独立游戏质感。

1. **PMREM 程序化 IBL 环境反射（`src/graphics/environment.js`）**：
   - 用 `THREE.PMREMGenerator` 渲染天顶至地平线渐变球 + 太阳高光板生成 `scene.environment`，赋予金属船体与 `MeshPhysicalMaterial` 清漆外壳真实冷暖环境反射。
2. **高阈值选择性后期管线（`src/graphics/postProcessing.js`）**：
   - 串联 `EffectComposer` → `RenderPass` → `UnrealBloomPass(res, strength=0.35, radius=0.48, threshold=1.08)` → 暗角微调 `ShaderPass` → `OutputPass`。
   - **阈值约束**：`threshold` 必须 `>= 1.05`，确保普通阳光沙地与文字清晰锐利，仅 `emissiveIntensity > 1.2` 的炉火、晶簇、LED 眼与能量桥发光；低画质档自动旁路 `EffectComposer`。
3. **环面无缝 PBR 贴图与双尺度防平铺 Shader（`src/graphics/textures.js`）**：
   - 使用 `(cos(2πu), sin(2πu))` 环面周期噪声生成 100% 无接缝的沙地/岩石 Albedo、Normal、Roughness `DataTexture`，在地面材质 `onBeforeCompile` 中混合两层旋转缩放 UV 消除重复方格纹，并在角色/建筑/矿脉底部铺设柔和放射状 Contact AO 阴影贴片。
4. **v1.0.1 成片管线（在第 2、3 步的质量条之上，不要退回单一 `UnrealBloomPass`）**：
   - `gpuMaterialBaker.js` 启动时离屏烘焙 1024px PBR（sRGB Albedo、线性 ORM、高度图 Sobel 法线）。新地貌优先用世界空间风化着色器改色，不要每件道具加一整套贴图（7 套已约 112 MB 显存）。
   - 沙漠白昼、沙漠星夜、家园草甸三枚 PMREM 在启动时烤好。运行时只交换引用，禁止每帧 `PMREMGenerator`。
   - 桌面 High/Ultra 把 PCSS 注入 `shadowmap_pars_fragment`，编译失败回退 PCF。阴影太阳仰角钳在约 16° 以上并按约 1.6 秒量化，避免视锥拉到地平线，也避免待机时每帧重渲阴影。手机与 Low 不用 PCSS。
   - 自写 HDR 链：线性场景目标 → 半分辨率 SSAO → 体积光 → 小金字塔辉光 → 自动曝光与胶片调色。辉光阈值仍然只照顾炉火、晶簇、能量桥。Low 关闭 SSAO、体积光和天气粒子。
   - 天空是 `gl_Position = p.xyww` 的大气盒：散射、云、银河、解析环带巨行星。导出唯一行星方向，天空、夜间主光方位、体积光和卤水倒影必须拷贝同一向量。体积光跟可见太阳，不要跟被垫高的阴影方向。
   - 卤水池用斜裁剪平面反射，排除招牌、探照灯光锥和天气粒子。
   - 昼夜约 7 分钟一周，可锁定白昼或星夜。天气只有晴、阴、沙暴。荒漠星球不要做雨雪。第 1 关正式游玩的前 150 秒保持晴天。标题界面不得累加这个计时，也不得在标题上掷出沙暴。新开局重置相位和风暴权重。
   - 沙暴粒子在顶点着色器里绕相机循环，CPU 不做逐粒子遍历。星夜和沙暴打开角色探照灯。
5. **程序化地质与工业曲线建模（`src/graphics/proceduralMeshes.js`）**：
   - 载具/机身用 `SplineCurve + LatheGeometry` 车削流线曲面，机翼/尾翼用带倒角（Bevel）的 `ExtrudeGeometry`；
   - 远山与峡谷用 `56×28` 细分圆柱叠加纵向风蚀冲沟、阶梯岩层、山脚碎石缓坡裙与顶点色沟壑 AO；
   - 晶石采用六棱柱身 + 非对称斜切尖冠 + 内发光晶髓 + 自定义 Fresnel 晶棱高光（`pow(1 - N·V, 2.4)`）；矿石嵌入不规则母岩，废铁采用弯曲铆钉蒙皮 + 工字钢梁。

---

### Phase 3: 叙事过场、三维能力锁与 DAG 智能导航

**目标：** 消除“开局突兀塞任务”与“新手盲目折返跑”，让中后期关卡具备立体探索质变。

1. **纯净环绕标题页 + 三幕式宽银幕开场过场**：
   - 标题页隐藏全部任务/背包 HUD 且不加背景模糊，采用环绕全景镜头；点击开始后播放可按 `[Space]` 跳过的宽银幕上下黑边过场（迫降扬沙 → 机器人休眠重启苏醒 → 掠过完好工坊并平滑插值切入第三人称跟随相机）。
2. **装备驱动的三维探索能力（地面 → 地下 → 高空）**：
   - 前期关卡专注地面采集与引导；中期制造永久装备解锁新维度（如 `[V]` 脉冲声呐波扫描 + `[E]` 螺旋钻头破土采深层裂隙；按住 `[Space]` 消耗触地自动极速回满的推进能量槽飞登平顶孤峰与石柱）。
   - **三维物理防卡墙**：空中垂直无方向键下落（`moveMag === 0 && !isGrounded`）时仍须执行高台侧壁圆柱排斥；贴地站立再做 1 轮推出，且不要播撞击音。高空掠过地面目标（`|ry - targetY| > 2.8m`）时过滤地面交互提示防误触。机翼碰撞要限高，并作为带 `occluderMinY` 的相机遮挡。脚本过场位置必须写在 `robot.update()` 之后，阴影跟随用物体当前高度（家园在 `Y = 420`）。
3. **DAG 全局净缺口导航（`src/systems/guidanceSystem.js`）**：
   - 递归遍历完整配方有向无环图（DAG），先扣除虚拟库存池中的现有半成品，汇总所有分支共享原矿的**全局净缺口**，优先引导一次性采齐全部原矿再回工坊加工；按 `(versionTick, 2m 网格)` 缓存计算结果。排队中的子件要指向真正生产它的工位：精密制造台的组件不能把人领到熔炼炉。

---

### Phase 4: 空间化工坊 UI、可收起侧拉栏与移动端多指触控

**目标：** 让工坊界面融入 3D 世界，并在大/中/小屏与手机横竖屏上实现零遮挡与多指无竞态操控。

1. **左侧实时 3D 取景 + 右侧圆角全息工坊台**：
   - 打开熔炉/制造台/前哨台时取消全屏毛玻璃遮罩，相机平滑偏转将 3D 设备与机器人呈现在左半屏，右侧水平滑出对应主题皮肤（锻铜熔岩 / 深蓝 CAD 网格 / 生态翠绿）的全息面板（使用完整 `border-radius: 16px` + 平直 `translateX` 滑入，避免 `rotateY` 透视歪斜与 `clip-path` 截断四角边框），配主画布缓存（`drawImage`）的矢量材料图标、合成流向图、就绪配方置顶与 `批量 ×N` 按钮；随身手账 `[C]` 独立为不带禁用制作按钮的蓝图平板。
   - **多世界 HUD 防头重脚轻**：扩展世界（如母星漫游）顶部仅保留位置标题、目标胶囊与喷气条及右上工具栏，将低频切图/荣誉/重温按钮下沉至右下角悬浮胶囊坞（桌面端 `bottom: 42px; right: 14px`，移动端 `<= 820px` 自动转至右上角 `top: 98px` 竖排以避让右下触控键）。
2. **侧拉胶囊抽屉与非必要提示自由开关（`src/ui/hudController.js`）**：
   - 左上任务栏、左下背包、右上状态栏均支持收起为贴边迷你胶囊（`📋 第X关 ▸`、`🎒 背包 ▸`、`🚀 100%` + `🚀 飞船 X/5 ▾`）。
   - **屏幕自适应策略**：大屏（`> 1240px`）默认展开；中屏/小屏与触屏设备**默认自动收起为迷你胶囊**（保留 85%+ 3D 视野，且记忆用户手动开合选择）。
   - 顶部提供一键 **`👁 纯净视野`** 按钮，并在 `⚙ 设置` 提供 4 项持久化独立开关（3D 脚下箭头、顶部下一步文字条、距离淡出式 3D 建筑招牌、闲置提示气泡）。
3. **移动端多指触控（`src/ui/touchControls.js`）**：
   - 仅在 `pointer: coarse` 或触发 `touch` 事件时自动浮现左拇指无极摇杆 + 右拇指上下文动作盘（采集/钻探/安装、长按喷气、声呐、详情）及画布单指转镜头 + 双指捏合缩放，自动剥离移动端文案中的 `[E]/[Space]` 键位后缀。
   - **多指 `pointerId` 隔离**：摇杆、长按喷气键、画布双指镜头必须各自独立绑定 `pointerId` + `setPointerCapture` + `pointercancel` 清理，严禁共用单个 `_dragging` 布尔值。

---

### Phase 5: 单文件离线打包与多维门禁验收

**目标：** 产出单文件离线 HTML，完成静态纯净度、断网运行、多分辨率零重叠与性能自检。

1. 执行构建前门禁、打包、逻辑回归与离线纯净度验收脚本：

本仓库的游戏工程在 `starweaver/`。`prebuild` 钩子会在 `npm run build` 前自动执行 `scripts/prebuild-check.mjs`（语法、`0` 循环依赖、安全红线、热循环零 GC、无头白盒冒烟）；也可以直接一条命令跑完整个门禁链：

```bash
npm run check   # 仅构建前 5 道静态 + 无头冒烟检查
npm run gate    # prebuild -> build -> verify -> audit 全链路门禁
```

若分步执行（注意 `build-standalone.mjs` 必须从 `index.html` 同步提取内联 `#boot-splash` 欢迎加载屏与样式）：

```bash
npm run build && npm run verify
node ../skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

2. **浏览器实测收敛门（内置浏览器）**：
   - 开启 `Network.enable` 与 `Network.emulateNetworkConditions({ offline: true })` 实测通关核心路径，确认 `performance.getEntriesByType('resource')` 为 `[]` 且 `runtimeErrors` 为 `[]`；
   - 切换大屏（`1920×1080`）、中屏（`1024×768`）、手机横屏（`844×390`）与竖屏（`390×844`）测量 HUD 面板 BoundingBox 碰撞矩阵全为 `false`，截图走查光影与构图后向用户输出精确字节/MB 打包报告。

详细的 L2 用户视角验收场景清单见 [SCENARIOS.md](SCENARIOS.md)。

## 硬性规则

1. **零外部运行时依赖** — 最终独立 HTML 必须内联全部 JS、CSS、程序化贴图与 Web Audio 合成器，严禁出现任何 CDN、外链字体/图片/音频或运行时 `fetch`/`XMLHttpRequest` 请求（由 `audit-standalone-html.mjs` 机器校验）。
2. **源码模块化与单文件构建双交付** — 严禁直接在几千行的单个 HTML 里裸写不可维护源码；必须保持 `src/` 模块化结构并通过构建脚本一键生成 `dist/*.html`。
3. **三层进度同源与防死锁保证** — 支线、当前关、全局修复三层进度必须从唯一 `GameState` 实时派生；主线材料必须确定性可再生，一次性核心模块/装备必须防重造，存档快照必须折算进行中的队列产出。
4. **视觉去 Demo 化** — PBR 场景必须有启动期 PMREM（白昼/星夜分探针）、选择性辉光（阈值仍只让高自发光物体发光）、GPU 烘焙的无缝法线，以及接触软阴影或至少接触 AO。成片管线用自写 HDR（SSAO、体积光、金字塔辉光），不要在已有该管线时再叠一层 `UnrealBloomPass`。低画质必须能关掉 SSAO、体积光、PCSS 和天气粒子。
5. **中小屏默认胶囊收起与提示可配置** — `<= 1240px` 视口及移动端触屏必须默认将左右常驻面板收起为迷你胶囊，并提供一键纯净视野及非必要提示独立开关；触控按钮仅在 `pointer: coarse` / 触摸激活时显示。
6. **零每帧 GC 与多指无竞态** — 主渲染循环严禁每帧 `new THREE.Vector3/Color` 或无脏检查写 DOM/解析颜色字符串；触屏摇杆、长按技能键与镜头手势必须按 `pointerId` 严格隔离；`AudioContext` 必须随 `visibilitychange` 挂起并在切回时重置帧时间差。
7. **安全 DOM 渲染与诚实验收报告** — 动态文本一律使用 `createElement` + `textContent`（严禁对存档或动态字符串使用 `innerHTML`）；验收报告只允许列出实际执行过的测试项与真实文件字节数。
8. **多世界组件化生命周期与资源按需回收（`src/scene/worldLifecycle.js`）** — 禁止把多星球场景永久堆在单一 `THREE.Scene` 里仅靠 `visible = false` 隐藏或到处硬编码 `y > 200` 魔法坐标分支。必须抽取共享组件（`WORLD_ATMOSPHERE_PROFILES`、`findNearestInteractable`、`disposeObjectSubtree`）与 `WorldManager`：(1) 各世界按需懒挂载；(2) 切离非活跃星球时隐藏/卸载其渲染层并调用 `disposeObjectSubtree(root, { renderer, sharedTextures })` 释放独占几何/材质/纹理（显式保留全局共享 `pbrLibrary` 纹理防误销毁）；(3) 碰撞体与遮挡体按 `worldPlane` 语义标记过滤，后处理体积光使用动态 `uPlaneBaseY` Uniform。
9. **HUD 公共原语复用与视野优先原则（`src/ui/hudPrimitives.js`）** — 多场景/多星球的侧边抽屉、燃料胶囊与切换清理禁止复制粘贴整套 DOM 构建与事件代码；必须复用 `createCollapsibleDrawer`、`createJetpackPill` 与 `clearHudRegion` 保持结构一致、各自隔离容器与主题类。同时遵循**非必要不遮挡视野**：低频导航/归航/回顾按钮在全端（桌面端与移动端）默认收起于标题下拉或设置中，点击动作后或开启纯净视野时自动收起。

## 新场景 / 多星球接入架构规范（防混淆与防退化细则）

新增第 3 个及以上星球/场景时，**严禁**重新手写独立的场景管理器、独立 HUD 抽屉模板或坐标阈值判断，必须严格对齐以下原则与步骤：

### 架构原则
1. **公私分离（共享骨架 vs. 差异数据）**：地形、地标、NPC 与专属任务逻辑由新场景自己的 `builder` / `activitySystem` / `data` 维护；生命周期、大气过渡、最近交互扫描、通用弹窗（设置/工坊）与 HUD 抽屉/胶囊外壳一律复用公共组件，禁止复制粘贴。
2. **语义路由替代坐标魔数**：所有角色所处平面、碰撞体归属、相机遮挡体、体积光基准高度必须通过 `state.activeWorldPlane` 与 `tagWorldEntries(list, '<worldId>')` 语义路由，禁止新增 `y > XXX` 的坐标猜测分支。
3. **懒挂载 + 切离即回收 + 逻辑离场隔离（Lazy Catch-Up）**：新世界必须向 `WorldManager` 注册 `mount` / `unmount` / `dispose` 适配器，切换离开时通过 `disposeObjectSubtree` 释放独占几何/材质/纹理并保护 `sharedTextures`。同时**非活跃星球的逻辑帧更新必须停止**，仅记录离场时间戳；待玩家返回该星球时通过有上限的 `fastForward(awayDt)` 一次性补算队列/再生/无人机产出，避免跨世界后台写存档或事件串台。
4. **HUD 槽位隔离 + 零残留**：每个星球的任务/图鉴容器独立挂载，切入切出必须调用 `clearHudRegion(...)` 清空非活跃星球文本与列表节点，并保持对外状态属性契约不被破坏。
5. **视野让路（Viewport-First）**：漫游主画面只保留必要状态胶囊，次要动作组默认折叠（`menu-open` 按需展开、操作后即关），中小屏默认折叠左右抽屉。

### 新场景接入标准实施清单（Checklist）
- [ ] **数据层**：在 `src/data/` 新增场景常量与文案，并在 `WORLD_ATMOSPHERE_PROFILES`（`src/systems/atmosphereProfiles.js`）注册昼夜/雾效/基准高度 `planeBaseY`。
- [ ] **3D 场景与回收**：编写独立 `<world>Builder.js`，对碰撞体/遮挡体调用 `tagWorldEntries(..., '<worldId>')`；在 `main.js` 通过 `worldManager.register('<worldId>', ...)` 实现懒挂载与 `disposeObjectSubtree` 卸载。
- [ ] **实体与交互层**：通用伴行机器人/巡检无人机统一复用 `companionBotFactory.js`（`createHoverDroneMesh`、`createUtilityRoverBot`）按需挂载至当前场景组；交互扫描统一调用 `findNearestInteractable`（`src/systems/interactableScanner.js`），不重写距离轮询循环。
- [ ] **HUD 层**：在 `HudController` 使用 `createCollapsibleDrawer` / `createJetpackPill` 创建该世界的抽屉与胶囊实例；在场景切换钩子中通过 `clearHudRegion` 清理旧世界残留，并确保次级操作默认折叠。
- [ ] **门禁验证**：新增/更新对应回归测试脚本并跑通 `npm run gate`（语法、0 循环依赖、离线单文件审计与场景隔离断言）。

## 反模式

❌ 使用无 `scene.environment` 的 `MeshStandardMaterial` 搭配原生圆柱/球体硬拼模型
→ 金属材质没有 PMREM 环境贴图会呈现死黑塑料感；必须配置程序化天空环境探针，并用 `LatheGeometry`、`ExtrudeGeometry`（带 Bevel）与顶点噪声置换雕刻轮廓。

❌ 把 `UnrealBloomPass` 的 `threshold` 设在 `0.8~0.95` 导致整片沙漠与 UI 泛白刺眼
→ 必须将 `threshold` 提高到 `>= 1.05`、`strength <= 0.38`，只让高自发光强度（炉芯、晶髓、尾焰）产生干净辉光。

❌ 多分支合成树按单分支逐个检查缺料（导致共享原料少算，玩家多跑冤枉路）
→ 导航系统必须用虚拟库存池对完整配方 DAG 做全局净缺口汇总（如子件 A 需 1 星核 + 子件 B 需 2 星核，持有 2 个时必须继续引导采第 3 个星核，而非提前叫回工坊）。

❌ 用单一 `_dragging = true/false` 布尔值处理镜头拖拽，在 `window.pointerup` 一刀切清零
→ 手机端左手推摇杆、右手松开喷气键会瞬间打断第三指的镜头旋转；必须用 `Map<pointerId, Point>` + `setPointerCapture` 独立管理每根手指。

❌ 打开熔炼炉/制造台时用全屏黑色毛玻璃弹窗把 3D 游戏世界完全挡死，或在随身图鉴里放灰掉的禁用制作按钮，或给右侧全息抽屉同时加 `rotateY(-4deg)` 与 `clip-path`+`border`
→ 采用左侧实时 3D 机器镜头特写 + 右侧平直 `border-radius: 16px` 主题化全息抽屉（避免透视歪斜与斜切角截断矩形 `border`）；随身手账改为展示清晰的“加工设备位置徽章”。

❌ 手动切换昼夜时仅阻尼 `nightFactor` 而让太阳高度/方位角瞬跳，或在 `nightFactor = 0.56` 交接点保留 `0.35` 方向光底值导致阴影与探针突变
→ 必须同步阻尼 `_sunAltitudeSin` / `_sunAzimuth` / `_twilightAmt` 使昼夜切换自然经过黄昏霞光；并在方向光交接点将太阳/月光强度平滑归零、围绕探针切换点做 `environmentIntensity` 柔和衰减过渡。

❌ 滚轮硬改 `camera.distance`、固定 `lookAt` 高度且遮挡时缩臂到 `0.08` 贴脸角色
→ 滚轮/捏合只改 `targetDistance` 并经 `damp` 平滑追踪，叠加飞行/高速移动动态呼吸臂长与 `lookAt` 距离联动高度，并用 5 点地形视线采样防过坡抽搐。

❌ 初始化 `EffectComposer` 时尚未调用 `renderer.setPixelRatio(dpr)`，且切换画质时忘记同步调用 `composer.setPixelRatio(dpr)` + `renderer.setSize(w, h)`
→ 手机端（CSS 视口仅 `390×844`、`dpr=3`）若 `EffectComposer._pixelRatio` 卡在默认 `1.0`，整个游戏会按 `390×844` 360p 离屏缓冲渲染再放大 3 倍导致画面极糊！高画质须同步更新 `renderer`、`EffectComposer` 与 `UnrealBloomPass` 分辨率（手机端推荐黄金锐度 `Math.min(dpr, 2.0)`，桌面端 `Math.min(dpr, 2.5)`），同时为 `DataTexture` 显式开启 `LinearMipmapLinearFilter`、`generateMipmaps = true` 与各向异性过滤 `anisotropy`。

❌ 代码化拼装场景时将每块石头/晶簇做成独立 `THREE.Mesh`（Draw Call 破千），并在手机端开启 `4x MSAA HalfFloat` 离屏缓冲、120Hz 无锁帧与多处 CSS `backdrop-filter: blur()`
→ 会直接打爆手机 TBDR GPU 显存带宽与 CPU 桥接开销导致严重发烫！必须：(1) 用 `mergeGeometries` 按共享材质合并静态地标、矿脉母岩底座与单簇多棱晶体，将单帧 Draw Call 压至 `< 200`；(2) 手机端禁用离屏 `4x MSAA`（改用 `samples: 0` + 轻量 `FXAAShader` + 半分辨率 `0.5x` Bloom）；(3) 平行光阴影采用跟随角色的紧凑视锥并设置 `shadowMap.autoUpdate = false` 按需/降频刷新；(4) 主循环加入 `60 FPS` 智能帧率锁拦截 120Hz 高刷空转，并在 `@media (pointer: coarse)` 下彻底禁用 HUD 的 `backdrop-filter`。

❌ 在 `AudioContext` 处于 `suspended` 状态时无保护地持续创建 Oscillator 节点
→ 会导致所有音效堆积在冻结的 `0s` 时间轴上并在首次解锁瞬间爆发出刺耳叠音；`ensureContext()` 必须在 `ctx.state === 'running'` 时才允许排入瞬态音效。

❌ 标题界面和正式游玩共用同一个 `playElapsed`，或开场过场只改天空贴图、不重置风暴权重
→ 玩家在标题停几分钟再开始，会直接进入沙暴或星夜。标题更新必须带 `isTitle`，不累加新手晴天保护；「开始任务」要重置相位、黑夜和沙暴权重。

❌ 用布尔值记住“当前已是夜间探针”，过场里又直接改 `scene.environment`
→ 返航自由探索后天空是星夜，间接光仍是白天沙漠。每帧比较探针对象引用。家园降落还要单独把主光设成白昼草甸，只改天空调色板会留下月光下的亮草地。光照覆盖要排在过场帧之后，因为过场帧会再写 `scene.environment`。

❌ 天空巨行星、夜间阴影和水面高光各写一个方向；体积光去跟被垫高的阴影太阳
→ 黄昏光束会高于日面，星夜倒影对不齐行星。导出一个行星方向常量。阴影仰角可以垫高，体积光和水面对齐可见天体。

❌ 机翼碰撞体不加 `occluder`，或弹簧臂把碰撞体当成无限高圆柱
→ 镜头穿过机翼；或者视线从翼上方掠过时被错误拉近。机翼要标 `occluder`，并给出 `occluderMinY` 与 `maxY`。工作台特写和展示镜头必须走同一套求解，不能提前 return。

❌ 水平推出包在 `moveMag > 0` 里，落地后站着就不再解算；或过场里先摆好 `Y = 420` 再调用 `robot.update()`
→ 角色停在墙角穿模里；家园庆典被写回沙漠地面。移动或滞空做 3 轮推出，贴地站立再做 1 轮且不要播撞击音。脚本镜头要在 `robot.update()` 之后写回位置。阴影跟随用船体当前高度。

❌ `THREE.Color.normalize()`、对 uniform 对象调用 `.copy()`、或写成 `THREE.LEqualDepth`
→ 这三项都会在运行时直接抛错。方向用 `Vector3.normalize()`，写入 `uniform.value`，深度比较用 `THREE.LessEqualDepth`。

❌ 扬尘/烟雾/喷口雾气复用 `IcosahedronGeometry(r, 0)` 晶簇池，或指示牌立柱穿过牌面、方山岩壁碰撞半径写死偏小常量
→ 扬尘放大后会变成硬边六边形、立柱挡字、角色走入中空单面岩壁看到“地底穿帮”。扬尘/雾气必须用独立零 GC `THREE.Points` + `gl_PointCoord` 径向衰减 `ShaderMaterial`（`depthWrite: false`）；立柱高度与顶部半径必须止于牌底内侧；方山岩壁碰撞半径须匹配各原型真实底半径 `mesaBottomRadii[archIdx]`。

❌ 工作台把“队列加工中 / 已制成待安装 / 已安装到飞船”合并成同一句“已安装”，或延迟初始化子场景时让镜头遮挡数组保持 `undefined`
→ 刚做完零件未去飞船安装就误提示“已安装”，或相机解算 `[...homeworldCameraOccluders]` 直接抛 `TypeError`。必须严格区分队列、背包与已装配/已安装三态文案；`deferHomeworld` 等懒加载构造期必须预置所有每帧读取的数组属性为空数组 `[]`。

## 常见问题

| 症状                            | 原因                                                                | 解决方案                                                                                                                                 |
|-------------------------------|-------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| 独立 HTML 在浏览器直接双击打开黑屏或报跨域错误    | 使用了 `<script type="module" src="...">` 外链本地模块，受 `file://` CORS 限制 | 使用 `esbuild` 以 `format: 'iife'`、`bundle: true` 将全部代码内联进单个 `<script>`，并对代码中的 `</script` 转义为 `<\/script`                               |
| 角色空中松开方向键垂直降落到孤峰/飞船边缘时嵌入模型侧面  | 水平圆柱碰撞被包裹在 `if (moveMag > 0.01)` 分支内，垂直自由落体时未执行排斥                 | 将边界与障碍物水平排斥条件改为 `if (moveMag > 0.01 \|\| !this.isGrounded)`，确保空中纯垂直起降同样受侧壁保护                                                         |
| 熔炼读条途中刷新网页，已扣原矿与产出双双消失        | `startCraft` 立即扣了库存，但 `save()` 未序列化瞬态 `craftingQueue`             | 在 `save()` 生成持久化快照时遍历 `craftingQueue`，将队列中任务的 `output` 数量自动合并计入快照库存                                                                  |
| 手机竖屏或笔记本分屏时，左右任务面板与顶部按钮重叠挤满画面 | 面板固定像素宽度且常驻展开，顶部过多文字按钮挤在同一行                                       | `<= 1240px` 与 `touch-active` 默认将任务、背包、飞船状态收起为边缘迷你胶囊，将次级开关收入 `⚙ 设置` 并启用自适应广角 FOV（竖屏 `66°`）                                            |
| 切到后台几分钟再切回游戏，角色瞬间飞出地图或环境音卡死   | `requestAnimationFrame` 恢复首帧 `now - lastTime` 巨大，且移动端挂起了音频上下文     | 监听 `document.visibilitychange`：隐藏时调用 `ctx.suspend()` 并清空按键/摇杆；恢复可见时重置 `_lastTime = performance.now()` 并 `dt = Math.min(0.05, rawDt)` |
| 标题停留后一进游戏就是沙暴，或过场结束后突然入夜 | 标题循环把新手 150 秒晴天保护算进去了；过场只改了天空 uniform | 标题传 `isTitle`；新开局重置大气权重；过场结束再跑一帧正式大气更新 |
| 星夜返航回荒漠后模型仍是白天反射，家园草地却很暗 | 探针用布尔缓存；家园只换了天空、没换主光 | 按 `scene.environment !== desired` 换探针；降落帧之后把主光设为草甸日光 |
| 镜头穿机翼，或从翼上方看也被拉到船头 | 机翼不是 `occluder`，圆柱测试没有下底 | `occluderMinY` 到 `maxY` 的厚度测试；工作台镜头共用弹簧臂 |
| 子件还在制造台排队，箭头却指向熔炼炉 | 等待分支把工位写死成 `furnace` | 按该产物配方的 `station` 选最近工位 |
| 读档后制作次数少 1，矿点全部复活，时间回到上午 | 快照只折了背包，没折计数、重生计时和相位 | 快照写入 `craftedEver`、`totalCrafted`、`nodeRegrowTimers`、`envClock`；内存计数仍等完成时再加 |
| 打包后的单文件打开直接黑屏或看不到 Welcome 加载屏 | `build-standalone.mjs` 未把 `index.html` 的 `#boot-splash` 样式与 DOM 带进产物，或延迟构建使 `homeworldCameraOccluders` 为 `undefined` | 构建脚本从 `index.html` 提取 `#boot-splash` 并由 `prebuild-check.mjs` 断言；懒加载场景构造期预置 `[]` |
| 车轮扬尘/地热雾气呈现硬边六边形，或导航牌文字被立柱挡住 | 扬尘复用了 `IcosahedronGeometry(r, 0)`；立柱高度/半径大于牌底和半厚 | 烟雾改用 `THREE.Points` 径向渐变着色器池；立柱顶止于牌底内侧且半径 `< 牌体半厚` |
| 零件刚做完就提示“已安装”，或前哨岩壁脚下能钻进地底 | 工作台把队列/背包/已安装三态文案混用；方山岩壁碰撞半径小于原型实际底半径 | 按队列、背包、已安装/已装配拆出三态文案；按 `mesaBottomRadii[archIdx]` 匹配岩壁碰撞半径 |
| 切离母星返回荒漠后飞船/沙地纹理变黑或显存持续上涨 | `disposeObjectSubtree` 误销毁了跨世界共享的 `pbrLibrary` 纹理，或切图只靠 `visible=false` 不回收资源 | 用 `WorldManager` 管理多世界懒挂载与卸载；调用 `disposeObjectSubtree(root, { renderer, sharedTextures })` 仅释放地图独占几何/材质/纹理 |
| 制造台右侧边框四角残缺且文字倾斜，或母星次要操作栏长期遮挡视野 | 同时叠了 `rotateY(-4deg)` 与 `clip-path: polygon()` 裁掉了矩形 `border`；`.homeworld-actions-dock` 在桌面端常驻展开 | 改用平直 `border-radius: 16px` + `translateX` 滑入；`.homeworld-actions-dock` 在桌面与移动端全端默认折叠，仅点击顶栏标题展开并在点击动作或纯净视野后自动收起 |
