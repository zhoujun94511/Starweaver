<div align="center">

<img src="./starweaver/assets/logo.png" alt="Starweaver" width="128" height="128" />

# Starweaver

An offline 3D mission game of exploration, collection, and progression, under 1 MB.

[![Three.js](https://img.shields.io/badge/Three.js-r170-black.svg)](https://threejs.org)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)](https://nodejs.org)
[![esbuild](https://img.shields.io/badge/esbuild-0.24-FFCF00.svg)](https://esbuild.github.io)

[中文](README.md)

[Play](#play) · [Build from source](#build-from-source) · [Controls](#controls) · [Levels](#levels) · [Prompts and the skill](#prompts-and-the-skill)

</div>

The Starweaver crash-lands on the desert planet Kharis-4. The crew has already evacuated. The helper robot Milo stays behind, gathers minerals, smelts parts, fits power, communications, life support, navigation, and propulsion back onto the hull, finishes the pre-flight checks, and returns home.

The build output is a single HTML file under 1 MB. Double-click it to run in a browser, with no network and no extra assets to load. The interface supports Simplified Chinese and English, and runs on desktop, tablet, and phone.

## Features

- Five continuous levels. Regions, recipes, and the ship's appearance advance as repairs proceed
- Smelting, fabrication, batch crafting, sonar drilling, and jet flight
- Main-path veins have fixed yields and regrow, so the game cannot soft-lock
- On medium and small screens the sidebars start collapsed, leaving the 3D view open
- The build inlines script, style, and procedural assets, and requests no external files at runtime

## Play

The repository already includes a build. Open it in a browser:

```text
starweaver/dist/starweaver-<version>-<YYYYMMDD-HHmmss>.html
```

The version comes from `version` in `package.json`. The time is the local time of the build. The comment at the top of the file, and the `version` and `build-time` tags in `head`, match the file name. Each build keeps only that one file. It can be double-clicked offline. Progress is stored locally in the browser. If the site blocks storage, it lasts only for the current session.

During development, `index.html` uses ES modules. It needs a local static server and cannot be opened directly with `file://`.

## Build from source

Run the commands in the `starweaver/` directory. Node.js 18 or above is required.

esbuild installs a native binary for the operating system. If `node_modules` was copied from another machine, run `npm install` again on the current system. macOS uses `@esbuild/darwin-arm64` or `@esbuild/darwin-x64`. Windows x64 uses `@esbuild/win32-x64`.

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

| Script | What it does |
| --- | --- |
| `npm run build` | Pack the single-file HTML |
| `npm run verify` | Headless check of the five levels' resources, recipe gaps, duplicate-craft locks, and offline tags |

## Controls

| Key | Action |
| --- | --- |
| `WASD` / arrows | Move |
| Hold `Space` | Jet flight (after the wings are equipped) |
| `V` | Pulse sonar (after the drill is equipped) |
| `E` | Gather, drill, use a station, install, or run a check |
| `F` | Inspect details |
| `C` | Portable blueprints |
| `G` | Guide arrow at your feet |
| `Esc` | Pause or close a panel |

After a touch is detected, a left stick and a right action pad appear. One finger turns the camera. Two fingers zoom. Touch copy does not include keyboard hints.

Settings can switch between Chinese and English, sound, and three graphics levels, and can continue a save, return to camp, or start over.

## Levels

1. **Restore power.** Crash Basin. Scrap and copper are smelted into a power core and installed in the power bay.
2. **Repair communications.** Whispering Ridge, to the east. Quartz and silver ore become the deep-space communications array.
3. **Drilling and life support.** The dry canyon, to the south. Sonar and the spiral drill open underground fissures.
4. **Flight and navigation.** The gorge, to the west. The wings fly up to the spire, align the light bridge, and install the navigation core.
5. **Propulsion and the return home.** The geothermal field, to the north. Flight and drilling are used together. After three pre-flight checks, board the ship.

Side tasks provide extra materials and do not block the main path. When materials are missing, the UI states what is missing, how many, and in which region.

## Directory

```text
.
├── prompts/                 Reproduction prompt for this game
├── skills/                  Agent skill for offline Web 3D games
├── starweaver/
│   ├── assets/logo.png      Logo
│   ├── index.html           Development entry
│   ├── package.json
│   ├── scripts/             Packaging and data checks
│   ├── src/
│   │   ├── data/            Levels, recipes, Chinese and English copy
│   │   ├── state/           Progress and saves
│   │   ├── graphics/        Environment, post-processing, procedural models
│   │   ├── scene/           World, Starweaver, camera
│   │   ├── entities/        Milo
│   │   ├── systems/         Interaction and guidance
│   │   ├── ui/              Interface and touch
│   │   └── audio/           Procedural sound
│   └── dist/                starweaver-<version>-<time>.html
├── README.md
└── README_en.md
```

The scene uses procedural meshes and PMREM environment reflections. Bloom is applied only to the furnace, crystals, and the energy bridge. Guidance totals the raw ore still missing across the whole recipe tree. These rules are written in `starweaver/src/data/gameData.js`, not scattered across button callbacks.

## Prompts and the skill

`prompts/` and `skills/` are for different jobs.

`prompts/web3d-spacecraft-game-master-prompt.md` is the full reproduction prompt for this game. Open the file, copy the code block, and paste it to any chat model or coding assistant to build an offline 3D game of the same grade from scratch. The first half is the gameplay specification. The second half is the engineering and experience bar reached on this project.

`skills/game-web3d-standalone-builder/` is for assistants that support Agent Skills, such as Codex, Claude, and Cursor. It is not tied to this game's story. It describes the general method: modular source plus one offline HTML file. On a related task, the assistant loads the skill in `SKILL.md` and builds a similar game.

| File | Use |
| --- | --- |
| `SKILL.md` | Steps for the assistant: data, picture, guidance, interface, packaging, and acceptance |
| `README.md` | Design notes and build records for people |
| `SCENARIOS.md` | Six acceptance scenarios from the player's point of view |
| `scripts/audit-standalone-html.mjs` | Checks the size and external links of the single-file HTML |

The offline check is run on its own from the repository root:

```bash
node skills/game-web3d-standalone-builder/scripts/audit-standalone-html.mjs
```

## Acknowledgements

- [Three.js](https://threejs.org/)
- [esbuild](https://esbuild.github.io/)
