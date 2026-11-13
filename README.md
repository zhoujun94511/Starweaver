<div align="center">

<img src="./starweaver/assets/logo.png" alt="星织号" width="128" height="128" />

# 星织号

一款体积不到1MB离线运行的3D探索、收集养成类任务游戏。

[![Three.js](https://img.shields.io/badge/Three.js-r170-black.svg)](https://threejs.org)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)
[![esbuild](https://img.shields.io/badge/esbuild-0.24-FFCF00.svg)](https://esbuild.github.io)

[中文](README.md) · [English](README_en.md)

[开始玩](#开始玩) · [从源码构建](#从源码构建) · [操作](#操作) · [关卡](#关卡) · [提示词与 Skill](#提示词与-skill)

</div>

星织号迫降在荒漠星球卡里斯-4，乘员已经撤离。辅助机器人 Milo 留下来，采集矿物、熔炼零件，把动力、通信、维生、导航和推进装回船体，完成起飞点检后返航回家。

项目构建产出是不足1MB的单个HTML文件，双击即可通过浏览器运行，无需网络和额外资源加载。界面已适配简中和英文，电脑/平板/手机均支持运行。

<img src="./pic/interface-zh.webp" alt="星织号中文界面" width="960" />

## 特性

- 五关连续流程，区域、配方和船体外观会随修复推进；
- 熔炼、制造、批量合成，以及声呐钻探、喷气飞行；
- 主线矿脉产量固定且会再生，避免卡关；
- 中小屏幕默认收起侧栏，保留三维视野；
- 构建结果内联脚本、样式和程序化资源，运行时不请求外部文件；

## 开始玩

仓库里已经带有构建结果。用浏览器打开：

```text
starweaver/dist/starweaver-<版本>-<YYYYMMDD-HHmmss>.html
```

版本来自 `package.json` 的 `version`，时间是构建时的本地时间。文件开头的注释，以及页面 `head` 里的 `version`、`build-time`，与文件名一致。每次构建只保留这一份。该文件可以离线双击。进度记在浏览器本地；如果站点禁止存储，则只保留在当前这次打开中。

开发时的 `index.html` 使用 ES Module，需要本地静态服务，不能直接用 `file://` 打开。

## 从源码构建

在 `starweaver/` 目录执行，需要 Node.js 18 及以上。

`esbuild` 按操作系统安装原生二进制。`node_modules` 从另一台机器拷来之后，先在当前系统重新执行 `npm install`。macOS 对应 `@esbuild/darwin-arm64` 或 `@esbuild/darwin-x64`，Windows x64 对应 `@esbuild/win32-x64`。

### macOS

```bash
npm install
npm run build && npm run verify
node ../skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

### Windows

```powershell
npm install
npm run build
npm run verify
node ../skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

| 脚本 | 作用 |
| --- | --- |
| `npm run build` | 打包单文件 HTML |
| `npm run verify` | 无头检查五关资源、配方缺口、防重复制造和离线标签 |

## 操作

| 按键 | 作用 |
| --- | --- |
| `WASD` / 方向键 | 移动 |
| 按住 `Space` | 喷气飞行（装备喷气翼后） |
| `V` | 脉冲声呐（装备钻头后） |
| `E` | 采集、钻探、使用工位、安装、点检 |
| `F` | 查看细节 |
| `C` | 随身蓝图 |
| `G` | 脚下引导箭头 |
| `Esc` | 暂停或关闭面板 |

触屏会在检测到触摸后显示左摇杆和右侧动作盘。单指转动镜头，双指缩放。触屏文案不带键盘提示。

设置中可以切换中英文、音效、四档画质（极高/高/中/低）、星球昼夜（自动交替/白昼/星夜）与荒漠天气（动态/晴朗/沙霾阴天/沙尘暴），也可以继续存档、回到营地或重开。

## 关卡

1. **恢复电力。** 坠机盆地。废铁与赤铜炼成动力核心，装入动力舱。
2. **修复通信。** 东侧低语山脊。石英与银丝矿做成深空通信阵列。
3. **钻探与维生。** 南侧干涸峡谷。声呐和螺旋钻头打开地下裂隙。
4. **飞行与导航。** 西侧裂谷。喷气翼飞上孤峰，校准光桥，安装航图核心。
5. **推进与返航。** 北侧地热区。飞行和钻探一起用，完成三处起飞点检后登船。

支线提供额外材料，不阻挡主线。缺料时界面会写明缺什么、缺多少、在哪个区域。

## 目录

```text
.
├── pic/
│   ├── interface-zh.webp    中文界面
│   └── interface-en.webp    英文界面
├── prompts/                 本游戏的复刻提示词
├── skills/                  离线 Web 3D 游戏的 Agent Skill
├── starweaver/
│   ├── assets/logo.png      标志
│   ├── index.html           开发入口
│   ├── package.json
│   ├── scripts/             打包与数据校验
│   ├── src/
│   │   ├── data/            关卡、配方、中英文案
│   │   ├── state/           进度与存档
│   │   ├── graphics/        环境、后期、程序化模型
│   │   ├── scene/           世界、星织号、相机
│   │   ├── entities/        Milo
│   │   ├── systems/         交互与导航
│   │   ├── ui/              界面与触控
│   │   └── audio/           程序化音效
│   └── dist/                starweaver-<版本>-<时间>.html
├── README.md
└── README_en.md
```

画面使用程序化网格和 PMREM 环境反射，辉光只加在炉火、晶体和能量桥上。导航按整棵配方计算还缺的原矿。这些规则都写在 `starweaver/src/data/gameData.js`，不散落在按钮回调里。

## 提示词与 Skill

`prompts/` 和 `skills/` 用途不同。

`prompts/web3d-spacecraft-game-master-prompt.md` 是本游戏的完整复刻提示词。打开文件，复制其中的代码块，贴给任意对话模型或编程助手，即可按同一规格从零做出一款同等级的离线三维游戏。前半是玩法规格，后半是本项目打磨后的工程与体验要求。

`skills/game-web3d-standalone-builder/` 给支持 Agent Skills 的助手使用，例如 Codex/Claude/Cursor。它本身不绑定这一款的剧情，描述的是「模块化源码 + 单文件离线 HTML」的通用做法。助手会根据 `SKILL.md` 相关技能，在相关任务里自动加载构建类似的游戏。

| 文件 | 用途 |
| --- | --- |
| `SKILL.md` | 助手的操作步骤：数据、画面、引导、界面、打包与验收 |
| `README.md` | 给人看的设计说明和构建记录 |
| `SCENARIOS.md` | 六条玩家视角的验收场景 |
| `scripts/audit-standalone-html.mjs` | 检查单文件 HTML 的体积和外链 |

离线检查在仓库根目录单独执行：

```bash
node skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

## 致谢

- [Three.js](https://threejs.org/)
- [esbuild](https://esbuild.github.io/)
