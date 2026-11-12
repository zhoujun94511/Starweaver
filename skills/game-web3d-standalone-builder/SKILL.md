---
name: game-web3d-standalone-builder
description: "当用户要求从零开发、重构或打磨可离线运行的 Three.js / Web 3D 独立游戏，或解决程序化 3D 像粗糙 Demo、新手迷路、多屏遮挡与手机触控适配时触发 —— 完成数据驱动架构、PBR 渲染收敛、可收起 HUD 到离线单 HTML 交付。不适用于联网对战或 Unity/Unreal 工程。"
permissions:
  allow:
    - "Bash(npm install *)"
    - "Bash(npm run *)"
    - "Bash(node scripts/*)"
    - "Bash(node skills/game-web3d-standalone-builder/scripts/*)"
dependencies:
  mcp:
    - name: cursor-ide-browser
      config: "Cursor 内置浏览器 MCP（用于多机位 3D 视觉收敛、断网模拟与多分辨率 BoundingBox 零重叠验收）"
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

> **你是资深 Web 3D 游戏工程师、技术美术（TA）与关卡设计师。** 你的职责是在保持模块化 ES Modules 源码可维护性的前提下，构建并交付 **100% 离线自包含、零外部网络请求、支持桌面与手机触屏双端** 的完整可玩 Three.js 3D 游戏；关键约束是严禁停留在设计文档或第一关原型，必须通过程序化雕刻网格、PMREM 环境反射、选择性 HDR Bloom、DAG 净缺口引导、侧拉胶囊 HUD 与真实浏览器多视口验收消除“粗糙几何体 Demo 感”。

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
   - **防吞档合并持久化**：`save()` 采用 `120ms` 防抖合并写入，生成快照时必须将 `craftingQueue` 中未走完读条的产出折算并入快照，并在 `load()`、`pagehide`、`visibilitychange(hidden)` 时同步执行 `flushSave()`。
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
4. **程序化地质与工业曲线建模（`src/graphics/proceduralMeshes.js`）**：
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
   - **三维物理防卡墙**：空中垂直无方向键下落（`moveMag === 0 && !isGrounded`）时仍须执行高台侧壁圆柱排斥；高空掠过地面目标（`|ry - targetY| > 2.8m`）时过滤地面交互提示防误触。
3. **DAG 全局净缺口导航（`src/systems/guidanceSystem.js`）**：
   - 递归遍历完整配方有向无环图（DAG），先扣除虚拟库存池中的现有半成品，汇总所有分支共享原矿的**全局净缺口**，优先引导一次性采齐全部原矿再回工坊加工；按 `(versionTick, 2m 网格)` 缓存计算结果。

---

### Phase 4: 空间化工坊 UI、可收起侧拉栏与移动端多指触控

**目标：** 让工坊界面融入 3D 世界，并在大/中/小屏与手机横竖屏上实现零遮挡与多指无竞态操控。

1. **左侧实时 3D 取景 + 右侧斜切全息工坊台**：
   - 打开熔炉/制造台/前哨台时取消全屏毛玻璃遮罩，相机平滑偏转将 3D 设备与机器人呈现在左半屏，右侧滑出对应主题皮肤（锻铜熔岩 / 深蓝 CAD 网格 / 生态翠绿）的斜切全息面板，配主画布缓存（`drawImage`）的矢量材料图标、合成流向图、就绪配方置顶与 `批量 ×N` 按钮；随身手账 `[C]` 独立为不带禁用制作按钮的蓝图平板。
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

1. 执行打包、逻辑回归与离线纯净度门禁脚本：

本仓库的游戏工程在 `starweaver/`。下面两条命令在该目录执行；技能脚本位于仓库根目录，所以用上一层路径。

```bash
npm run build && npm run verify
node ../skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

2. **浏览器实测收敛门（`cursor-ide-browser`）**：
   - 开启 `Network.enable` 与 `Network.emulateNetworkConditions({ offline: true })` 实测通关核心路径，确认 `performance.getEntriesByType('resource')` 为 `[]` 且 `runtimeErrors` 为 `[]`；
   - 切换大屏（`1920×1080`）、中屏（`1024×768`）、手机横屏（`844×390`）与竖屏（`390×844`）测量 HUD 面板 BoundingBox 碰撞矩阵全为 `false`，截图走查光影与构图后向用户输出精确字节/MB 打包报告。

详细的 L2 用户视角验收场景清单见 [SCENARIOS.md](SCENARIOS.md)。

## 硬性规则

1. **零外部运行时依赖** — 最终独立 HTML 必须内联全部 JS、CSS、程序化贴图与 Web Audio 合成器，严禁出现任何 CDN、外链字体/图片/音频或运行时 `fetch`/`XMLHttpRequest` 请求（由 `audit-standalone-html.mjs` 机器校验）。
2. **源码模块化与单文件构建双交付** — 严禁直接在几千行的单个 HTML 里裸写不可维护源码；必须保持 `src/` 模块化结构并通过构建脚本一键生成 `dist/*.html`。
3. **三层进度同源与防死锁保证** — 支线、当前关、全局修复三层进度必须从唯一 `GameState` 实时派生；主线材料必须确定性可再生，一次性核心模块/装备必须防重造，存档快照必须折算进行中的队列产出。
4. **视觉去 Demo 化四件套必选** — 凡使用 PBR 材质的 3D 场景必须具备：`PMREMGenerator` 环境反射、阈值 `>= 1.05` 的选择性 Bloom（含低画质关闭回退）、防平铺法线贴图与接触阴影（Contact AO）。
5. **中小屏默认胶囊收起与提示可配置** — `<= 1240px` 视口及移动端触屏必须默认将左右常驻面板收起为迷你胶囊，并提供一键纯净视野及非必要提示独立开关；触控按钮仅在 `pointer: coarse` / 触摸激活时显示。
6. **零每帧 GC 与多指无竞态** — 主渲染循环严禁每帧 `new THREE.Vector3/Color` 或无脏检查写 DOM/解析颜色字符串；触屏摇杆、长按技能键与镜头手势必须按 `pointerId` 严格隔离；`AudioContext` 必须随 `visibilitychange` 挂起并在切回时重置帧时间差。
7. **安全 DOM 渲染与诚实验收报告** — 动态文本一律使用 `createElement` + `textContent`（严禁对存档或动态字符串使用 `innerHTML`）；验收报告只允许列出实际执行过的测试项与真实文件字节数。

## 反模式

❌ 使用无 `scene.environment` 的 `MeshStandardMaterial` 搭配原生圆柱/球体硬拼模型
→ 金属材质没有 PMREM 环境贴图会呈现死黑塑料感；必须配置程序化天空环境探针，并用 `LatheGeometry`、`ExtrudeGeometry`（带 Bevel）与顶点噪声置换雕刻轮廓。

❌ 把 `UnrealBloomPass` 的 `threshold` 设在 `0.8~0.95` 导致整片沙漠与 UI 泛白刺眼
→ 必须将 `threshold` 提高到 `>= 1.05`、`strength <= 0.38`，只让高自发光强度（炉芯、晶髓、尾焰）产生干净辉光。

❌ 多分支合成树按单分支逐个检查缺料（导致共享原料少算，玩家多跑冤枉路）
→ 导航系统必须用虚拟库存池对完整配方 DAG 做全局净缺口汇总（如子件 A 需 1 星核 + 子件 B 需 2 星核，持有 2 个时必须继续引导采第 3 个星核，而非提前叫回工坊）。

❌ 用单一 `_dragging = true/false` 布尔值处理镜头拖拽，在 `window.pointerup` 一刀切清零
→ 手机端左手推摇杆、右手松开喷气键会瞬间打断第三指的镜头旋转；必须用 `Map<pointerId, Point>` + `setPointerCapture` 独立管理每根手指。

❌ 打开熔炼炉/制造台时用全屏黑色毛玻璃弹窗把 3D 游戏世界完全挡死，或在随身图鉴里放灰掉的禁用制作按钮
→ 采用左侧实时 3D 机器镜头特写 + 右侧主题化斜切全息抽屉；随身手账改为展示清晰的“加工设备位置徽章”。

❌ 初始化 `EffectComposer` 时尚未调用 `renderer.setPixelRatio(dpr)`，且切换画质时忘记同步调用 `composer.setPixelRatio(dpr)` + `renderer.setSize(w, h)`
→ 手机端（CSS 视口仅 `390×844`、`dpr=3`）若 `EffectComposer._pixelRatio` 卡在默认 `1.0`，整个游戏会按 `390×844` 360p 离屏缓冲渲染再放大 3 倍导致画面极糊！高画质须同步更新 `renderer`、`EffectComposer` 与 `UnrealBloomPass` 分辨率（手机端推荐黄金锐度 `Math.min(dpr, 2.0)`，桌面端 `Math.min(dpr, 2.5)`），同时为 `DataTexture` 显式开启 `LinearMipmapLinearFilter`、`generateMipmaps = true` 与各向异性过滤 `anisotropy`。

❌ 代码化拼装场景时将每块石头/晶簇做成独立 `THREE.Mesh`（Draw Call 破千），并在手机端开启 `4x MSAA HalfFloat` 离屏缓冲、120Hz 无锁帧与多处 CSS `backdrop-filter: blur()`
→ 会直接打爆手机 TBDR GPU 显存带宽与 CPU 桥接开销导致严重发烫！必须：(1) 用 `mergeGeometries` 按共享材质合并静态地标、矿脉母岩底座与单簇多棱晶体，将单帧 Draw Call 压至 `< 200`；(2) 手机端禁用离屏 `4x MSAA`（改用 `samples: 0` + 轻量 `FXAAShader` + 半分辨率 `0.5x` Bloom）；(3) 平行光阴影采用跟随角色的紧凑视锥并设置 `shadowMap.autoUpdate = false` 按需/降频刷新；(4) 主循环加入 `60 FPS` 智能帧率锁拦截 120Hz 高刷空转，并在 `@media (pointer: coarse)` 下彻底禁用 HUD 的 `backdrop-filter`。

❌ 在 `AudioContext` 处于 `suspended` 状态时无保护地持续创建 Oscillator 节点
→ 会导致所有音效堆积在冻结的 `0s` 时间轴上并在首次解锁瞬间爆发出刺耳叠音；`ensureContext()` 必须在 `ctx.state === 'running'` 时才允许排入瞬态音效。

## 常见问题

| 症状                            | 原因                                                                | 解决方案                                                                                                                                 |
|-------------------------------|-------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| 独立 HTML 在浏览器直接双击打开黑屏或报跨域错误    | 使用了 `<script type="module" src="...">` 外链本地模块，受 `file://` CORS 限制 | 使用 `esbuild` 以 `format: 'iife'`、`bundle: true` 将全部代码内联进单个 `<script>`，并对代码中的 `</script` 转义为 `<\/script`                               |
| 角色空中松开方向键垂直降落到孤峰/飞船边缘时嵌入模型侧面  | 水平圆柱碰撞被包裹在 `if (moveMag > 0.01)` 分支内，垂直自由落体时未执行排斥                 | 将边界与障碍物水平排斥条件改为 `if (moveMag > 0.01 \|\| !this.isGrounded)`，确保空中纯垂直起降同样受侧壁保护                                                         |
| 熔炼读条途中刷新网页，已扣原矿与产出双双消失        | `startCraft` 立即扣了库存，但 `save()` 未序列化瞬态 `craftingQueue`             | 在 `save()` 生成持久化快照时遍历 `craftingQueue`，将队列中任务的 `output` 数量自动合并计入快照库存                                                                  |
| 手机竖屏或笔记本分屏时，左右任务面板与顶部按钮重叠挤满画面 | 面板固定像素宽度且常驻展开，顶部过多文字按钮挤在同一行                                       | `<= 1240px` 与 `touch-active` 默认将任务、背包、飞船状态收起为边缘迷你胶囊，将次级开关收入 `⚙ 设置` 并启用自适应广角 FOV（竖屏 `66°`）                                            |
| 切到后台几分钟再切回游戏，角色瞬间飞出地图或环境音卡死   | `requestAnimationFrame` 恢复首帧 `now - lastTime` 巨大，且移动端挂起了音频上下文     | 监听 `document.visibilitychange`：隐藏时调用 `ctx.suspend()` 并清空按键/摇杆；恢复可见时重置 `_lastTime = performance.now()` 并 `dt = Math.min(0.05, rawDt)` |
