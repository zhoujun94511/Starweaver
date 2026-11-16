# Master Prompt — Playable Standalone Web 3D Exploration, Crafting & Repair Game

> **使用说明（跨模型复用指南）**：
> 以下代码块内为完整的增强版生产级 Prompt：
> - **前半部分（Section 1 ~ Technical Implementation Guidance）** 完整保留原始需求规格；
> - **后半部分（Section 14 ~ Section 21）** 融合本项目到 v1.0.1 的实战准则：程序化雕刻与 GPU PBR、接触软阴影、屏幕空间环境光遮蔽与体积光、昼夜与晴/阴/沙暴、弹簧臂防穿模、过场与环境探针交接、DAG 引导、全息工坊、Web Audio、胶囊 HUD、多指触控，以及已经踩过的坑。Section 14 里的选择性辉光阈值仍然有效；当前成片管线以 Section 21 为准，不要再退回单独的 `UnrealBloomPass`。
>
> 复制下方完整代码块投喂给任意模型 / Coding Agent 即可直接端到端复刻同等级品质的 Web 3D 独立游戏。

---

```markdown
You are a senior Web 3D game engineer and level designer. Build a complete, playable, single-player 3D browser game in the current workspace.

Inspect the workspace, existing files, project conventions, and available runtime before making changes. Do not overwrite or delete user files. Do not stop after producing a design document or pseudocode. Implement all five levels, run the game, and fix issues you can reproduce.

# 1. Game Concept

Working title: “Starweaver.”

A spacecraft crashes on an unknown desert planet during a mission. The crew is missing, and only one survivor remains: a small, rounded, charming robot.

The robot discovers a usable smelting furnace and a fabrication station. It explores the planet, gathers specific raw materials, processes them into components, and uses those components to repair the spacecraft piece by piece. Once the ship is fully repaired, the robot launches it and returns to its home planet. The homecoming is the ending.

The core experience is exploration, collection, crafting, repair, and visible progress. Combat is not a core mechanic. Do not add guns, enemy pursuit, hunger, thirst, timed missions, or harsh survival penalties.

# 2. Technology and Deliverables

- Use Three.js for the 3D scene and gameplay.
- Organize source code into clear modules, such as scene, player, interaction, resources, crafting, missions, UI, and audio.
- Deliver both maintainable modular source code and a standalone HTML build.
- The standalone HTML must run offline. Bundle all code and runtime resources required by the game locally. Do not load code or assets from a CDN or remote website.
- Keep the source modular even if the final deliverable is a single HTML file.
- Prefer procedural geometry, Canvas-generated textures, and Web Audio for the robot, spacecraft, resources, furnace, fabrication station, scenery, and sound effects.
- Do not use external models, images, fonts, or audio unless there is a clear technical reason. If an external dependency is unavoidable, list it and explain whether it affects runtime or only the build process.
- Do not add telemetry, advertising, hidden network requests, or data collection unrelated to gameplay.
- If the workspace already has a build system, follow its conventions. Do not replace the existing stack without a good reason.

Follow the Technical Implementation Guidance at the end of this prompt. It summarizes the relevant implementation approach from the reviewed example, including its self-contained Three.js packaging, procedural scene construction, and offline runtime requirements. Do not expect the user to provide the original HTML file.

The finished game must not make runtime network requests. It must not fetch JavaScript, CSS, models, images, textures, fonts, or audio from remote URLs. Bundle the required Three.js runtime into the standalone HTML.

# 3. Complete Five-Level Scope

Implement all five levels as a complete, playable game before delivery. Do not stop after a prototype, first-level milestone, or vertical slice.

Use shared, data-driven systems for levels, materials, recipes, objectives, side tasks, unlocks, and spacecraft repairs. Each level must have a distinct repair objective and meaningful gameplay variation. Do not create five copies of the same level with only different material names or larger collection quotas.

Use the following progression as the initial design:

## Level 1 — Restore Power

- Introduce movement, interaction, resource gathering, smelting, basic crafting, and spacecraft repair.
- Teach the player to collect basic ore, process it into ingots, and craft a power component.
- Repair the spacecraft power module.
- Show visible changes when power is restored, such as interior lights turning on or a console becoming active.

## Level 2 — Repair Communications

- Introduce a new material and a new recipe.
- Guide the player away from the crash site along a readable exploration route.
- Craft and install a communications component.
- Show the antenna activating and receiving a signal after repair.

## Level 3 — Restore Life Support

- Introduce a multi-step crafting chain.
- Use a distinct area, such as a dry canyon, a mineral field, or an abandoned research site.
- Require the player to gather materials for a filter, coolant unit, or equivalent life-support component.
- Show the spacecraft interior becoming habitable or its environmental systems restarting.

## Level 4 — Repair Navigation

- Combine previously learned resource and crafting systems.
- Introduce a new traversal, route-opening, or facility-restoration mechanic.
- Repair the navigation system so the spacecraft can identify a safe route home.
- Keep the new mechanic understandable through environmental cues and in-game guidance.

## Level 5 — Repair Propulsion and Return Home

- Use the established resource, crafting, and repair systems to complete the propulsion system.
- Include a final inspection or launch-preparation objective.
- After all repair requirements are met, launch the spacecraft and show the robot returning home.
- End with a clear homecoming scene or ending screen.

The five levels must be connected through working transitions, unlocks, objectives, recipes, and persistent game state. The player must be able to complete the full game from the first level through the ending.

# 4. Core Gameplay Loop

Each level must have a clear spacecraft repair objective:

1. Show the current repair goal, required components, and progress.
2. Let the player explore the area and discover resources, clues, and interactive facilities.
3. Gather the raw materials required for the current objective.
4. Use the furnace or fabrication station to process materials and craft components.
5. Install the components in the correct part of the spacecraft.
6. Show clear visual and audio feedback for processing, crafting, and repairs.
7. Complete the main objective to finish the level.
8. Award optional side-task rewards and unlock the next area, recipes, or facilities as appropriate.
9. Update the spacecraft’s overall repair progress.

Every level must define:
- One main repair objective.
- Optional side tasks with individual progress.
- Material requirements, crafting recipes, and required components.
- A clear level-completion condition and completion feedback.
- What is unlocked after completion.

Optional side tasks must not block the main objective or level completion unless explicitly identified as mandatory before the player commits to them.

# 5. Resources, Crafting, and Mission Data

- Define levels, materials, quantities, recipes, repair objectives, side tasks, and unlocks in structured data. Do not scatter mission rules across UI event handlers.
- For every main repair objective, define the complete material requirements and crafting dependencies.
- Guarantee that every material required for the main objective is available in an accessible area before it is needed.
- Do not use random drops to determine whether the player can complete a main objective.
- Prevent accidental actions, crafting, or level transitions from permanently removing resources required to finish the game.
- When the player lacks materials, show what is missing, how many are needed, and where those materials can be found.
- Optional side tasks may reward extra materials, cosmetic items, or story clues, but must not block the main objective.
- Inventory and unlocked recipes persist between levels by default. If a level resets any resources, explain that before the level begins.
- Prevent duplicate rewards, repeated material deductions, duplicate crafting, and repeated level completion.
- Show the current crafting recipe and any active crafting queue.
- A completed crafting action must consume the correct inputs and produce the correct output.
- Do not add unnecessary inventory-capacity limits that cause required materials to be discarded.

# 6. Progress Tracking

Keep these three progress layers distinct and visible:

1. Side-task progress, such as “Collect crystal fragments: 3/5.”
2. Current-level repair progress, such as “Craft circuit components: 2/3.”
3. Global spacecraft repair progress, such as “Ship systems repaired: 2/5.”

All progress indicators must be derived from the same authoritative gameplay state. Do not maintain separate, inconsistent progress values in the HUD.

After collecting a resource, crafting an item, installing a component, or completing a level, provide clear feedback. Installing a component must visibly change the corresponding spacecraft area, for example by restoring lights, opening a hatch, activating a console, or bringing an engine component online.

# 7. Level Pacing and Player Guidance

- Each level should introduce a meaningful gameplay variation. Do not increase difficulty only by asking the player to collect larger quantities of the same materials.
- Teach new mechanics through environmental cues, readable interface hints, or discoverable clues. Do not require players to guess hidden rules.
- Keep travel distances between resource nodes, crafting stations, and repair objectives reasonable. Avoid repetitive long-distance backtracking.
- Provide optional, non-intrusive hints when the player makes no progress for a while.
- Failure must not erase collected materials or completed objectives.
- Do not add hunger, thirst, timed missions, or other punitive survival systems.
- Make the current main objective understandable at all times.
- Balance material quantities and travel distance so that progression feels purposeful rather than grind-based.

# 8. Scene, Camera, and Interaction

Use a third-person follow camera that keeps the robot visible and makes the surrounding space easy to read. An angled follow camera is acceptable if it improves navigation and interaction. Use one consistent camera model throughout the game unless a specific transition or cutscene requires otherwise.

The world should include:
- The crash site and the spacecraft in a repairable state.
- Distinct desert areas, such as rocks, canyons, mineral fields, ruins, or abandoned equipment.
- Resource nodes, a furnace, a fabrication station, and entrances or routes to other areas.
- Landmarks, lights, paths, signs, or distant structures that help players navigate.

Implement:
- Robot movement.
- Resource gathering.
- Inspection of resources and facilities.
- Interaction with the furnace and fabrication station.
- Installation of components in the correct spacecraft locations.
- Access to the next level or region.
- Collision with major obstacles.
- Reasonable interaction distances and clear visual prompts.

The robot must not pass through major obstacles. Prevent obvious camera clipping through the environment. Provide clear prompts for nearby interactable objects.

Use keyboard and mouse controls on desktop. At minimum, support WASD for movement and E for interaction. Add a clear control guide. If touch controls are not implemented, do not display nonfunctional mobile controls.

# 9. Robot Character

Give the robot a distinctive and appealing design:

- Small, rounded, cute, and easy to recognize at gameplay camera distance.
- Include simple idle, movement, gathering, carrying, crafting, and celebration animations.
- Use eyes, lights, head movement, body posture, or short text cues to communicate emotion.
- Procedural part animation is acceptable; complex skeletal animation is not required.
- Avoid a punitive death loop. If the robot is damaged, blocked, or temporarily unable to proceed, provide friendly recovery and guidance.

# 10. UI, Persistence, and Ending

The interface must show:
- Current level name and main repair objective.
- Side tasks and their completion states.
- Current material inventory.
- Overall spacecraft repair progress.
- Interaction prompts.
- Recipe and crafting interface.
- Pause, resume, and restart options.
- Level-completion feedback and unlocks.
- Final launch sequence and a clear ending.

When all spacecraft systems are repaired, show the launch, the robot’s return journey, and a final homecoming scene or ending screen.

If local persistence is implemented, store only necessary game progress and preferences. The game must remain playable if browser storage is unavailable or blocked. Provide a safe fallback and do not lose the current session’s progress because storage failed.

# 11. Implementation and Verification

Follow these steps without treating any intermediate step as the final deliverable:

1. Inspect the workspace, runtime, available dependencies, and existing conventions. Provide a brief implementation plan and file list.
2. Implement the shared gameplay foundations: robot movement, camera, collisions, interaction, inventory, crafting, mission state, and UI.
3. Implement all five distinct levels and their complete objectives, side tasks, resource placements, recipes, unlocks, and transitions.
4. Implement the spacecraft repair changes, launch sequence, and homecoming ending.
5. Add character animation, environmental atmosphere, sound effects, and graphics-quality settings where practical.
6. Build the standalone offline HTML deliverable.
7. Run the game and verify the complete main path:
   gather → process → craft → repair → complete each level → launch → return home.
8. Check for runtime errors, broken progression, incorrect inventory changes, duplicate rewards, remote resource requests, and inconsistent progress.
9. Fix reproducible issues.
10. Report how to run the game, the controls, the checks actually performed, and any remaining limitations.

Use reasonable defaults for details that do not block implementation, and record important assumptions. Do not claim that a check passed unless it was actually performed. Do not report a manual test or disconnected-network test unless it was actually performed.

# 12. Acceptance Criteria

- The game launches and displays a playable 3D scene.
- All five levels are implemented and connected; the player can progress from the first level to the ending.
- The player can control the robot and move through the environment.
- Resources can be collected and inventory counts update correctly.
- Crafting fails safely when materials are insufficient and produces the correct component when materials are available.
- Crafted components can be installed only in their intended repair targets.
- Side-task, level, and global repair progress remain consistent.
- Optional side tasks do not accidentally block the main path.
- Completing a level unlocks the intended next level, recipe, route, or facility.
- The final repair triggers the spacecraft launch, the robot’s return home, and a clear ending.
- There are no unrecoverable mission states, duplicate rewards, or repeated material deductions.
- The standalone HTML runs without network access and does not require remote assets.
- The final report lists only checks that were actually performed and identifies anything that remains unverified.

# 13. Packaging Report

After building, report:

- The path and byte size of the standalone HTML file, with its size also expressed in MB.
- Whether the game was actually tested with the network disconnected.
- Whether browser network inspection showed any remote requests.
- Any remaining external dependencies, distinguishing build-time tools from runtime dependencies.
- Whether the source code and the standalone HTML build are both available.

# Technical Implementation Guidance

Implement the game using the following technical approach. This guidance is based on a review of a self-contained Three.js browser game. You do not need the original reference file to follow it, and you must not ask the user to upload or provide that file.

## Self-Contained Runtime

- Bundle the Three.js runtime and all game code into the final standalone HTML file.
- Do not load JavaScript, CSS, models, images, textures, fonts, or audio from a CDN or remote URL.
- Do not make runtime network requests.
- Use only the Three.js features required by this game where practical, so the embedded runtime stays compact.
- Use system font fallbacks; do not download fonts.
- Create sound effects with the Web Audio API where practical instead of loading audio files.
- Local build tools or package dependencies are acceptable, provided the final HTML does not need them or the internet to run.

## Procedural Scene Construction

Build the alien planet, spacecraft, robot, furnace, fabrication station, resource nodes, props, and repairable parts from Three.js geometry and materials.

- Compose larger objects from reusable primitive geometry and shared materials.
- Create reusable builder functions for common props and level structures.
- Use a deterministic random seed for procedural decoration so that layouts remain stable between runs.
- Keep gameplay-relevant positions, resource placements, collision shapes, and repair targets in structured level data.
- Generate ground and surface details locally. Noise functions and typed pixel buffers may be used to create DataTextures; Canvas may be used for labels, markings, warning signs, decals, and other lightweight details.
- Use procedural normal, roughness, color, or mask maps where they materially improve the scene.
- Use shader materials or post-processing selectively for effects such as emissive details, heat, dust, atmospheric haze, or surface variation. Provide a simpler fallback if an effect fails or performs poorly.

## Scene Organization and Performance

- Use one WebGL canvas for the game scene and standard HTML/CSS for menus and HUD overlays.
- Organize the Three.js scene into clear groups, such as level-static, level-dynamic, spacecraft, robot, resources, and effects.
- Keep static scenery separate from animated or interactive objects.
- Share geometry and materials between repeated props.
- Merge compatible static geometry or use instancing where appropriate; do not merge objects that need independent interaction, animation, or repair-state changes.
- Limit dynamic lights, transparent effects, shadow resolution, and per-frame object creation.
- Use a single animation loop to update gameplay state and render the scene.
- Include low-quality rendering settings or graceful fallbacks for effects that are too expensive or unsupported.

## Data and Interaction Boundaries

- Keep level layout, resource locations, crafting recipes, mission objectives, side tasks, and repair targets in structured data rather than embedding them in UI event handlers.
- Keep collision and interaction data aligned with visible objects.
- Use safe DOM APIs such as `textContent` for dynamic text. Do not insert URL parameters, saved data, or other untrusted content through `innerHTML`.
- If local storage is used for settings or progress, validate loaded data and continue safely when storage is unavailable.
- The game must remain playable without local storage.

## Packaging and Size

- Keep the final artifact self-contained and reasonably small by using procedural assets instead of embedded high-resolution media.
- Treat a target of approximately 5 MB or less as a size goal for the first complete five-level build, not as a reason to omit required gameplay or weaken reliability.
- Report the final HTML file’s exact size in bytes and MB.
- Distinguish build-time tools from runtime dependencies. The final HTML must not require a server, package installation, CDN, or network connection unless the user explicitly changes this requirement.
- Verify the build by opening it locally and checking that the game does not request remote resources. Report whether offline and network-panel checks were actually performed.

Apply these implementation principles to the new robot, desert-planet, crafting, and spacecraft-repair game. Do not copy any names, story, setting, code, or distinctive assets from another game.

---

# 14. Production-Grade 3D Visual Fidelity (Anti-"Primitive Demo" Standards)

Avoid raw primitive "cylinder + cone + flat sphere" placeholder aesthetics. Achieve stylized indie-grade 3D polish while keeping 0 external asset files:

1. **Procedural IBL Environment Reflection (`THREE.PMREMGenerator`)**:
   - Generate equirectangular sky-to-ground environment probes in memory for both the desert planet (warm golden horizon + cool azure zenith) and the emerald homeworld. Assign `scene.environment` so metallic spacecraft alloys and clearcoat robot shells reflect rich sky gradients instead of flat dark shading.
2. **Post-Processing Pipeline with Selective HDR Bloom**:
   - Use `EffectComposer` + `RenderPass` + `UnrealBloomPass` + subtle Vignette/Color-Grade `ShaderPass` + `OutputPass`.
   - Set a high Bloom luminance threshold (`>= 1.05`) and moderate strength (`~0.35`) so sunlit sand and UI remain crisp while furnace fire, OLED eyes, crystals, hard-light bridges, and plasma plumes glow cleanly. Automatically bypass `EffectComposer` in `Low` quality mode.
   - **Mobile Retina Sharpness Sync (Critical)**: On smartphones (`390×844` CSS pixels at `3x` DPR), never leave `EffectComposer._pixelRatio` at `1.0`! Whenever quality or viewport changes, allow up to `Math.min(devicePixelRatio, 2.5)` in High Quality and synchronize `renderer.setPixelRatio(dpr)` → `renderer.setSize(w, h)` → `composer.setPixelRatio(dpr)` → `composer.setSize(w, h)` → `bloomPass.resolution.set(w * dpr, h * dpr)`. Also explicitly set `magFilter = LinearFilter`, `minFilter = LinearMipmapLinearFilter`, `generateMipmaps = true`, and `anisotropy = min(8, maxAnisotropy)` on procedural `DataTexture`s (which default to `NearestFilter` with no mipmaps in Three.js).
3. **GLSL Atmospheric Sky Dome & Seamless Dual-Scale Terrain**:
   - Build a custom GLSL atmospheric scattering sky dome with solar corona glow, drifting cirrostratus clouds, and smooth transition to starry deep space during orbital ascent.
   - Generate seamless torus-mapped (`cos/sin` periodic domain) Albedo, Normal, and Roughness `DataTextures` for sand and sedimentary rock. Blend two rotated UV scales in `onBeforeCompile` to eliminate grid tiling repetition.
   - Place soft radial Contact AO Shadow decals beneath the robot, spacecraft, stations, and mineral outcrops so objects never look like they float on the sand.
4. **Sculpted Geological Landmarks, Spacecraft & Mineral Silhouettes**:
   - **Spacecraft**: Sculpt a curved fuselage via `SplineCurve` + `LatheGeometry`, beveled swept delta wings and V-tails via `ExtrudeGeometry`, a recessed clearcoat cockpit with interior seats/consoles, crash-landing scorched sand skid decals, and plowed sand berms.
   - **Robot**: Use `MeshPhysicalMaterial` (`clearcoat: 1.0`) with `RoundedBoxGeometry` pill-head, recessed high-res Canvas OLED visor (with blink, happy blush, work, and sleep states), treaded wheels, articulated claw grippers, and visible upgrade attachments.
   - **Mountains & Rocks**: Sculpt high-segment (`56x28`) stratified mesas with talus aprons, erosion gullies, and baked cavity AO vertex colors; carve natural sandstone archways over route entrances, hexagonal basalt column clusters, and 3 distinct boulder archetypes (fractured crag, tilted slab, wind-eroded hoodoo) paired with 7-petal desert agave flora.
   - **Minerals & Scrap**: Differentiate resource nodes by geology—true 6-sided terminated crystal spires with inner glowing cores and custom Fresnel rim highlights (`pow(1 - N·V, 2.4)`), torn riveted hull plates + I-beam girders for iron scrap, translucent cryo-gel pods, and metallic ore nuggets embedded in craggy host rock.
   - **Pooled Zero-GC Particles**: Use a fixed-size `InstancedMesh` particle pool for wheel sand puffs, mineral harvest bursts, drilling earth geysers, furnace chimney embers, geothermal steam, and jetpack trails.

# 15. Narrative Opening Cutscene & Paced Onboarding

Do not drop newcomers abruptly into a wall of task text:

- **Clean Scenic Title Screen**: Orbit the camera gently around the desert crash site with ALL gameplay HUD panels hidden and zero background blur; present a clean lower-center title card with Start / Continue / Language (`中文 / EN`).
- **3-Act Widescreen Intro Cutscene (Skippable via `[Space]`)**:
  1. *Act 1 (Descent & Crash)*: Show the spacecraft streaking down with sputtering retro-thrusters, impacting the crater with sand/spark bursts and subtle camera shake.
  2. *Act 2 (Reboot)*: Close-up on the little robot powered down in the sand (`sleep` visor), chest core and OLED eyes blinking awake, hopping up cheerfully.
  3. *Act 3 (Discovery & Seamless Handover)*: Sweep across the intact Solar Furnace and Fabrication Station with letterbox narrative subtitles, then smoothly interpolate camera position/lookAt into the exact third-person follow camera before fading in the HUD.

# 16. Capability-Driven Exploration Upgrades (Geo-Drill & Jetpack Flight)

Elevate progression beyond flat walking by unlocking permanent craftable robot upgrades that transform traversal and gathering:

- **Level 3 Upgrade — Spiral Geo-Drill & Pulse Sonar (`[V]` + `[E]`)**:
  - Crafting permanently mounts a rotary auger drill on the robot's right arm.
  - Pressing `[V]` emits an expanding 3D seismic sonar wave ring (`42m` radius) with echo audio, highlighting glowing subsurface tectonic fissures. Pressing `[E]` drills into subsurface veins with rotary rumble and earth/crystal geysers to unearth deep Zeolite and Cryo-Brine Gel.
- **Level 4 Upgrade — Micro-Gravity Thruster Wings (Hold `[Space]`)**:
  - Crafting permanently mounts twin swept thruster wings with plasma plumes on the robot's backpack.
  - Holding `[Space]` consumes a self-recharging Thrust Energy gauge (`0–100%`, rapidly recharges within `~1.7s` upon landing on ground or any plateau top, zero consumable fuel cost) to boost and glide using the exact same `WASD`/joystick steering and camera controls.
  - Place standable 3D Sky-Mesas and Basalt Pillars (`5m–8m` elevation) hosting one of the Level 4 Solar Mirror Pylons and high-altitude Lumen/Titanium veins. Keep full-height wind/energy barriers on locked regions so flight cannot sequence-break Progression.
- **Level 5 Synthesis**: Combine Jetpack flight onto northern hexagonal basalt spires with subsurface Geo-Drilling around volcanic vents, followed by 3 hull pre-flight safety checks and the 3-act Homecoming launch.

# 17. Smart DAG Onboarding Guidance & Diegetic Workstation UI

1. **Net-Deficit DAG Waypoint Guidance (`GuidanceSystem`)**:
   - Recursively evaluate the full recipe Directed Acyclic Graph (DAG) against virtual inventory + active queue to compute exact **net raw material deficits** across shared multi-branch ingredients (gather all required raw ores first before sending the player back to smelt, eliminating frustrating extra trips).
   - Render a subtle 3D directional arrow around the robot's base, a soft vertical light beam + bobbing diamond over the active target, and a top-center Next-Step distance pill.
2. **Diegetic Side-Console Workstations (No Full-Screen Blur)**:
   - Opening the Solar Furnace, Fabrication Station, or Outpost Dual-Workbench smoothly frames the live 3D machine + robot on the left viewport while sliding in a chamfered, scanline-textured holographic console on the right:
     - *Solar Furnace*: Molten bronze & amber thermal theme;
     - *Fabrication Station*: Deep-blue aerospace CAD grid & cyan laser theme;
     - *Outpost Workbench*: Bio-emerald dual-tab field theme;
     - *Portable Blueprint Pad `[C]`*: Standalone floating data-slate with category filters and station location badges (no confusing disabled Craft buttons when away from stations).
   - Render crisp cached 2D Canvas icons for every item, visual `[Input Icons + Held/Needed] ━━▶ Output` flow diagrams, automatic sorting of ready/unlocked recipes to the top, and `Craft ×N` batch buttons.

# 18. Interactive Web Audio Soundscape

Synthesize a layered, non-fatiguing procedural soundscape with Web Audio API:
- Breathing desert wind (bandpass-filtered noise modulated by a slow `0.09Hz` LFO) + sparse pentatonic starlight chimes every `10–16s`;
- Distance-attenuated spatial hums near the Solar Furnace (`92.5Hz`) and Fabricator (`220Hz`) that intensify when processing queues are active;
- Sand-crunch wheel footsteps, soft proximity target-focus tick, UI clicks, modal open/close, sonar radar sweep + echoes, rotary rock-drilling rumble, jetpack thrust pulses, barrier bump buzz, robot emotional chirps, and orbital launch fanfare.

# 19. Multi-Screen Responsive Layout, Collapsible Drawers & Mobile Touch

1. **Adaptive 3D FOV & Multi-Breakpoint Layout**:
   - Dynamically adjust camera vertical FOV by aspect ratio (`46°` ultrawide, `50°` 16:9, `53°` 4:3/split, `66°` portrait mobile).
2. **Collapsible Capsule Side-Drawers & User-Customizable Hints**:
   - Make the Top-Left Mission panel, Bottom-Left Cargo panel, and Top-Right Ship/Fuel panel **collapsible into slim edge-docked summary capsules** (`📋 Lv.X (done/total) ▸`, `🎒 Cargo (N) ▸`, `🚀 100%` + `🚀 Ship X/5 ▾`).
   - Default to expanded on large desktops (`> 1240px`), and **auto-collapse into slim capsules on medium/small screens and touch devices** so 85%+ of the 3D viewport stays clear (remembering manual user expand/collapse choices).
   - Provide a 1-tap `👁 Clean View` toggle on the toolbar plus individual persistent checkboxes in Settings for: (a) 3D Guide Arrow & Beam, (b) Top Next-Step Text Banner, (c) 3D Station Signboards (also proximity-faded on compact screens), and (d) Idle Helper Tips.
3. **Full Mobile / Tablet Multi-Touch (`pointer: coarse`)**:
   - Automatically reveal a left-thumb analog virtual joystick and a right-thumb contextual action cluster (`Gather/Drill/Install`, hold-to-fly `Jetpack`, `Sonar`, `Inspect`) ONLY on touch devices (`pointer: coarse` or touch pointer events), stripping keyboard `[E]/[Space]` bracket tags from mobile labels.
   - Support single-finger drag camera orbit + two-finger pinch-to-zoom on the canvas, safe-area insets (`viewport-fit=cover`), and native `pan-y` touch scrolling inside drawers.

# 20. Performance & Concurrency Hardening

- **Multi-Touch `pointerId` Isolation**: Track independent `pointerId`s with `setPointerCapture` + `pointercancel`/`lostpointercapture` cleanup across the virtual joystick, hold-to-fly jetpack button, and 2-finger camera orbit/pinch so releasing one finger never cancels another.
- **Audio & Tab Lifecycle Safety**: Guard `AudioContext.resume()` with a single-flight promise mutex; never schedule transient oscillators onto a `suspended` context timeline; suspend audio and clear input states on `visibilitychange(hidden)`, resetting frame delta on resume.
- **Debounced Persistence with Sync Flush Barrier**: Coalesce rapid `save()` calls (`120ms` debounce) while folding active crafting queue outputs into the snapshot, paired with synchronous `flushSave()` on `load()`, `hasSavedGame()`, `pagehide`, and `visibilitychange` so zero items or progress can ever be lost.
- **Mobile TBDR Thermal & Draw-Call Optimization**:
  - Batch static procedural meshes (`mergeGeometries` / `InstancedMesh`) across mineral outcrops, pebbles, crystal clusters, and route landmarks with shared material pools (`customProgramCacheKey`) so steady-state draw calls stay `< 160` (vs `900+` unbatched);
  - Cap mobile High-Quality DPR at the `2.0x` Retina sweet spot (`samples: 0` + lightweight `FXAAShader` + `0.5x` half-res `UnrealBloomPass`) while keeping `4x MSAA` `2.5x` DPR on desktop;
  - Use a tight character-following directional shadow frustum (`36m` snapped to `2m` grid) with `shadowMap.autoUpdate = false` (throttled `~20Hz` when moving, `0Hz` when idle);
  - Enforce an intelligent `60 FPS` frame pacer on `120Hz/144Hz` ProMotion screens (`~30–45 FPS` on paused/low-power states) and disable CSS `backdrop-filter: blur()` under `@media (pointer: coarse)` to eliminate WebGL compositor readback heat.
- **Zero Per-Frame GC & Dirty-Checked DOM/Materials**: Reuse pre-allocated `Vector3`/`Color` scratch instances in main/cutscene loops, cache master 2D icon canvases via `drawImage`, cache DAG guidance per `(versionTick, 2m grid cell)`, and dirty-check all HUD text/style writes and Three.js material color updates.

# 21. v1.0.1 Visual, Weather, Collision, and Handoff Rules

Section 14 states the quality bar. This section is the pipeline that actually shipped, plus the failures that looked correct in isolation and broke in play.

## Rendering

- Bake PBR sets on the GPU at startup (`albedo` sRGB, ORM linear, height to Sobel normal). Do not ship external `.png` textures. Reuse sets with a world-space weathering shader instead of adding a new 1024px set per prop. Seven 1024px sets are already about 112 MB of GPU memory; more sets risk mobile tab kills.
- Pre-bake two desert PMREM probes (day and night) plus one homeworld probe. Do not call `PMREMGenerator` every frame.
- Desktop High/Ultra may use contact-hardening soft shadows (PCSS) injected into Three.js `shadowmap_pars_fragment`, with a compile-failure fallback to stock PCF. Keep the shadow frustum tight and follow the camera. Quantize the sun direction (about one step per 1.6s) so idle shadow updates stay throttled. Clamp the shadow sun elevation to at least ~16° so the frustum does not stretch to the horizon. Mobile and Low stay on stock shadows.
- Render the scene to a linear HDR target, then run half-resolution SSAO, volumetric shafts, a small bloom pyramid, auto-exposure, and a filmic grade. The grade’s bloom/flare must stay selective: sand and UI stay sharp; furnace cores, crystals, and hard-light bridges glow. Low quality disables SSAO, volumetric shafts, and weather particles.
- One infinite sky box (`gl_Position = p.xyww`) draws Rayleigh/Mie sky, a cloud deck, the Milky Way, and an analytic ringed gas giant. Export one shared direction constant for that planet. The sky uniform, night key-light azimuth, volumetric shaft direction, and brine-pool reflection must all copy that same vector.
- Brine pools use an oblique-clipped planar reflection. Exclude HUD billboards, the headlamp cone, and weather particles from the reflection pass.

## Day, Night, and Desert Weather

- A full day is about 7 minutes (`cycle` / locked `day` / locked `night`). Weather is clear, overcast, or sandstorm (`dynamic` or a lock). Do not add rain or snow on this desert planet.
- Dynamic weather stays clear for the first 150 seconds of Level 1 **active play**. The title-screen orbit must not increment that timer and must not roll a sandstorm. Starting or resetting a mission resets phase, night weight, and storm weight to a clear morning. The intro cutscene forces a daylight look; if you only overwrite sky uniforms and leave the atmosphere weights untouched, the first gameplay frame snaps back to night or storm.
- Night and sandstorm turn on the robot’s headlamp. Sandstorm streaks are stateless GPU instances wrapped around the camera in the vertex shader. Do not iterate particles on the CPU.
- Persist `cyclePhase` and active play time with the save. A reload should not silently jump back to morning while the player’s weather lock is sandstorm.

## Collision and Camera

- Every solid the robot can walk into needs a collider: fuselage, wings, pods, berms, rocks, and resource nodes. Wing colliders are height-capped so the jetpack can fly over them.
- The spring arm tests the look-at to camera segment against elevated platforms and colliders marked `occluder`. Wings must be occluders with a vertical thickness (`occluderMinY` .. `maxY`). A cylinder test that ignores the bottom face pulls the camera down when the sightline is above the wing. A fuselage-only occluder list lets the camera pass through the wings.
- Workstation close-ups and showcase shots must run the same terrain-lift and spring-arm solve. Returning early from those modes puts the camera inside the hull.
- Run depenetration while moving or airborne (3 iterations) and one extra pass while standing still, so a landing that stops inside a corner still slides out. Do not play gate-bump sounds on that idle pass.
- Apply a scripted cutscene pose after `robot.update()`. If update runs second, it writes the robot back onto desert terrain and destroys a homeworld pose at `Y = 420`. Shadow follow must use the ship’s current Y, not a hardcoded 0.

## Cutscene and Probe Handoff

- Compare `scene.environment` to the desired probe object. A boolean “already using night” cache lies after a cutscene or `restoreDesertPlacement()` assigns the day probe directly.
- The launch cutscene must set meadow key light, hemisphere light, and shadow offset when the ship lands at home. Changing only the sky palette leaves a bright meadow under moonlight.
- Run the launch lighting override after the cutscene frame, because the frame also assigns `scene.environment`. On returning to free roam, call one atmosphere update immediately so a night save rebinds the night probe on the first frame.
- Intro, launch, and ending must zero weather particles, headlamp, and storm audio.

## Guidance and Saves

- When an input is still in the crafting queue, point the player at the station that actually produces it. A fabricator sub-assembly must not send the player to the furnace.
- Folding an in-flight queue into the save is intentional: closing the tab must not delete inputs that were already consumed. Also fold `craftedEver` and `totalCrafted` in that snapshot, and persist node regrow timers. Do not increment those counters in live memory until the job really finishes, or a save that is still pending will double-count.

## Pitfalls Already Hit

- `THREE.Color` has no `.normalize()`. Normalize a `Vector3`.
- Shader uniform updates go to `uniform.value`. Calling `.copy()` on the uniform object throws.
- The depth compare constant is `THREE.LessEqualDepth`, not `LEqualDepth`.
- Volumetric light that follows the clamped shadow direction sits above the visible sun at sunset. Shafts and water glints follow the visual sun or the shared planet direction. The shadow map may stay elevated.
- Homeworld `setMode` must clear night and dust weights. Gameplay atmosphere code must not keep writing desert night colors during that cutscene.
- Windows PowerShell 5.1 rejects `&&`. Run `npm run build` and `npm run verify` as separate commands.
- Report the built file name `starweaver-<version>-<YYYYMMDD-HHmmss>.html`, the `version` and `build-time` meta tags, and the exact byte size. The build copies that file to `docs/index.html`. Do not hand-edit the copy.
- **Standalone Splash & Deferred Scene Safety**: Inline `#boot-splash` CSS and DOM from `index.html` into the standalone HTML build (and verify it in pre-build checks). Any deferred/lazy scene (`deferHomeworld: true`) must still initialize all arrays read by the camera/physics loop (e.g. `homeworldCameraOccluders = []`) in the constructor so `[...occluders]` never throws.
- **Soft Particles & Sign/Cliff Geometry Hygiene**: Use a dedicated zero-GC `THREE.Points` radial-falloff `ShaderMaterial` (`gl_PointCoord`, `depthWrite: false`, per-particle `aAlpha`) for wheel dust and steam plumes — never reuse low-poly `IcosahedronGeometry(..., 0)`. Keep 3D signpost poles narrower than the board's half-thickness and terminating at the bottom frame edge. Match cliff/mesa collider radii to each archetype's actual `bottomRadius` so players cannot walk inside hollow single-sided rock meshes.
- **Three-State Crafting Copy & Inspectable Landmarks**: Never label a main-story component or permanent equipment as “Installed / Equipped” while it is still in the crafting queue or sitting in the backpack awaiting ship installation; render distinct states (`In Crafting Queue`, `Crafted • Install on Ship`, `Installed on Ship` / `Equipped`). Give non-harvestable focal landmarks (reactor cores, research domes, monolith ruins) clear structural framing and `[E]`/`[F]` inspect lore so players do not mistake them for broken harvest nodes.
- **Pre-Build Gate**: Run `npm run gate` (`prebuild-check.mjs` -> `build` -> `verify` -> `audit-standalone-html.mjs`) after every feature/scene change.
```
