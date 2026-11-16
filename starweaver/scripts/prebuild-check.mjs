import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const indexPath = path.join(rootDir, 'index.html');

function collectJsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out.sort();
}

function stripComments(source) {
  // Strip block comments and single-line comments while preserving line count
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');
}

function gate1SyntaxCheck(jsFiles) {
  for (const file of jsFiles) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status !== 0) {
      throw new Error(`Syntax check failed in ${path.relative(rootDir, file)}:\n${res.stderr || res.stdout}`);
    }
  }
  console.log(`[Gate 1/5] Syntax check passed (${jsFiles.length} JS files)`);
}

function gate2CircularImports(jsFiles) {
  const fileSet = new Set(jsFiles);
  const graph = new Map();
  const importRegex = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;

  for (const file of jsFiles) {
    const code = stripComments(fs.readFileSync(file, 'utf8'));
    const deps = [];
    let match;
    importRegex.lastIndex = 0;
    while ((match = importRegex.exec(code)) !== null) {
      const spec = match[1];
      if (!spec.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(file), spec);
      if (fileSet.has(resolved)) {
        deps.push(resolved);
      } else if (fileSet.has(`${resolved}.js`)) {
        deps.push(`${resolved}.js`);
      }
    }
    graph.set(file, deps);
  }

  const state = new Map(); // 0=unvisited, 1=visiting, 2=visited
  const stack = [];
  const cycles = [];

  function dfs(node) {
    state.set(node, 1);
    stack.push(node);
    for (const dep of graph.get(node) || []) {
      const depState = state.get(dep) || 0;
      if (depState === 1) {
        const idx = stack.indexOf(dep);
        cycles.push(stack.slice(idx).concat(dep).map((p) => path.relative(rootDir, p)).join(' -> '));
      } else if (depState === 0) {
        dfs(dep);
      }
    }
    stack.pop();
    state.set(node, 2);
  }

  for (const file of jsFiles) {
    if ((state.get(file) || 0) === 0) dfs(file);
  }

  assert.equal(cycles.length, 0, `Circular imports detected:\n  ${cycles.join('\n  ')}`);
  console.log('[Gate 2/5] Circular import check passed (0 cycles)');
}

function gate3SecurityAndOffline(jsFiles) {
  const forbiddenPatterns = [
    { name: 'innerHTML', re: /\.innerHTML\b/ },
    { name: 'outerHTML', re: /\.outerHTML\b/ },
    { name: 'insertAdjacentHTML', re: /\.insertAdjacentHTML\b/ },
    { name: 'document.write', re: /\bdocument\.write\b/ },
    { name: 'eval(', re: /\beval\s*\(/ },
    { name: 'new Function', re: /\bnew\s+Function\b/ },
  ];

  const violations = [];
  for (const file of jsFiles) {
    const clean = stripComments(fs.readFileSync(file, 'utf8'));
    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      for (const pat of forbiddenPatterns) {
        if (pat.re.test(line)) {
          violations.push(`${path.relative(rootDir, file)}:${i + 1} uses forbidden ${pat.name}`);
        }
      }
      if (/https?:\/\//i.test(line)) {
        violations.push(`${path.relative(rootDir, file)}:${i + 1} contains remote URL`);
      }
    }
  }

  const html = fs.readFileSync(indexPath, 'utf8');
  assert.ok(/<html[^>]*\blang=["']en["']/i.test(html), 'index.html must declare <html lang="en">');
  assert.ok(/id=["']game-canvas["']/i.test(html), 'index.html missing #game-canvas');
  assert.ok(/id=["']hud-root["']/i.test(html), 'index.html missing #hud-root');
  assert.ok(/id=["']boot-splash["']/i.test(html), 'index.html missing #boot-splash');
  assert.ok(/<style>[\s\S]*#boot-splash[\s\S]*<\/style>/i.test(html), 'index.html missing inline #boot-splash <style>');
  const buildScript = fs.readFileSync(path.join(rootDir, 'scripts/build-standalone.mjs'), 'utf8');
  assert.ok(/boot-splash/.test(buildScript), 'build-standalone.mjs must preserve #boot-splash from index.html');
  assert.ok(!/<script[^>]+src=["']https?:\/\//i.test(html), 'index.html has external <script src>');
  assert.ok(!/<link[^>]+href=["']https?:\/\//i.test(html), 'index.html has external <link href>');

  assert.equal(violations.length, 0, `Security/offline violations:\n  ${violations.join('\n  ')}`);
  console.log('[Gate 3/5] Security & offline redline check passed');
}

function extractHotFunctionBlocks(cleanCode) {
  const blocks = [];
  const fnRegex = /(?:^|\n)\s*(?:export\s+)?(?:function\s+)?((?:update|render|stepFrame)[A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/g;
  let match;
  while ((match = fnRegex.exec(cleanCode)) !== null) {
    const fnName = match[1];
    let idx = fnRegex.lastIndex;
    let depth = 1;
    while (idx < cleanCode.length && depth > 0) {
      const ch = cleanCode[idx];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      idx += 1;
    }
    blocks.push({ fnName, body: cleanCode.slice(match.index, idx) });
  }
  return blocks;
}

function gate4HotLoopZeroGc(jsFiles) {
  const gcPatterns = [
    { name: 'new THREE.<Math>', re: /\bnew\s+THREE\.(Vector3|Vector2|Color|Matrix4|Quaternion|Euler|Box3|Raycaster)\b/ },
    { name: '.clone()', re: /\.clone\s*\(/ },
    { name: 'Object.keys/values/entries()', re: /\bObject\.(keys|values|entries)\s*\(/ },
  ];

  const violations = [];
  for (const file of jsFiles) {
    const rel = path.relative(rootDir, file).replace(/\\/g, '/');
    const isUiModule = rel.startsWith('src/ui/');
    const clean = stripComments(fs.readFileSync(file, 'utf8'));
    const blocks = extractHotFunctionBlocks(clean);
    for (const { fnName, body } of blocks) {
      // Event-driven UI DOM renderers (render*) are not 60fps 3D hot loops; still check update*/stepFrame* everywhere
      if (isUiModule && fnName.startsWith('render')) continue;
      for (const pat of gcPatterns) {
        if (pat.re.test(body)) {
          violations.push(`${rel} -> ${fnName}() contains ${pat.name}`);
        }
      }
    }
  }

  assert.equal(violations.length, 0, `Hot-loop zero-GC violations:\n  ${violations.join('\n  ')}`);
  console.log('[Gate 4/5] Hot-loop zero-GC check passed');
}

function installHeadlessDomStubs() {
  const noop = () => {};
  const ctxProxy = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray((w || 1) * (h || 1) * 4) }),
      measureText: (txt) => ({ width: String(txt || '').length * 7 }),
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return noop;
      },
    }
  );

  function makeElement(tag = 'div') {
    const attrs = new Map();
    const classes = new Set();
    const children = [];
    const el = {
      tagName: String(tag).toUpperCase(),
      style: {},
      dataset: {},
      attrs,
      children,
      textContent: '',
      value: '',
      disabled: false,
      width: 256,
      height: 256,
      className: '',
      classList: {
        add: (...names) => names.forEach((n) => classes.add(n)),
        remove: (...names) => names.forEach((n) => classes.delete(n)),
        toggle: (n, force) => {
          if (force === undefined) {
            if (classes.has(n)) classes.delete(n);
            else classes.add(n);
          } else if (force) classes.add(n);
          else classes.delete(n);
        },
        contains: (n) => classes.has(n),
      },
      get childNodes() {
        return children;
      },
      get firstChild() {
        return children[0] || null;
      },
      get lastChild() {
        return children[children.length - 1] || null;
      },
      setAttribute: (k, v) => attrs.set(k, String(v)),
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      removeAttribute: (k) => attrs.delete(k),
      appendChild: (c) => {
        if (c) children.push(c);
        return c;
      },
      append: (...nodes) => {
        for (const n of nodes) if (n) children.push(n);
      },
      removeChild: (c) => {
        const idx = children.indexOf(c);
        if (idx >= 0) children.splice(idx, 1);
        return c;
      },
      replaceChildren: (...nodes) => {
        children.length = 0;
        for (const n of nodes) if (n) children.push(n);
      },
      addEventListener: noop,
      removeEventListener: noop,
      focus: noop,
      blur: noop,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240, right: 320, bottom: 240 }),
      querySelector: () => null,
      querySelectorAll: () => [],
      getContext: () => ctxProxy,
    };
    return el;
  }

  const storage = new Map();
  const localStorageStub = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  };

  globalThis.document = {
    documentElement: { lang: 'en' },
    body: makeElement('body'),
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text) }),
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: () => makeElement('div'),
  };

  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: noop,
    removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    localStorage: localStorageStub,
  };
  globalThis.localStorage = localStorageStub;
}

async function gate5HeadlessSmoke() {
  installHeadlessDomStubs();

  const THREE = await import('three');
  const { GameState } = await import(pathToFileURL(path.join(srcDir, 'state/gameState.js')).href);
  const { RECIPES } = await import(pathToFileURL(path.join(srcDir, 'data/recipesData.js')).href);
  const { SpacecraftBuilder } = await import(pathToFileURL(path.join(srcDir, 'scene/spacecraftBuilder.js')).href);
  const { HudController } = await import(pathToFileURL(path.join(srcDir, 'ui/hudController.js')).href);
  const { TouchControls } = await import(pathToFileURL(path.join(srcDir, 'ui/touchControls.js')).href);
  const { WorldBuilder } = await import(pathToFileURL(path.join(srcDir, 'scene/worldBuilder.js')).href);
  const { buildHomeworldLandscape } = await import(pathToFileURL(path.join(srcDir, 'scene/homeworldLandscape.js')).href);

  // 1. GameState persistence, debounced save vs clear race, and timer expiry
  const state = new GameState();
  state.save(false); // schedule debounced save
  state.clearSavedStorage(); // must cancel pending debounced save
  await new Promise((r) => setTimeout(r, 320));
  assert.equal(state.load(), false, 'clearSavedStorage must cancel pending debounced save');

  const sampleRecipe = RECIPES[0];
  for (const inp of sampleRecipe.inputs) {
    state._addItem(inp.id, inp.count * 2);
  }
  state.save(true); // immediate save
  const stateReloaded = new GameState();
  assert.equal(stateReloaded.load(), true, 'GameState.load() should restore saved state');
  assert.equal(
    stateReloaded.inventory[sampleRecipe.inputs[0].id],
    sampleRecipe.inputs[0].count * 2,
    'Saved inventory should roundtrip'
  );

  // Craft timer expiry check
  const started = state.startCraft(sampleRecipe.id);
  assert.equal(started?.ok, true, `${sampleRecipe.id} should start with sufficient inputs`);
  for (let i = 0; i < 60; i += 1) state.update(0.2);
  assert.ok(
    (state.inventory[sampleRecipe.output.id] || 0) >= sampleRecipe.output.count,
    `Crafted ${sampleRecipe.output.id} should complete on update(dt)`
  );

  // 2. SpacecraftBuilder deferred homeworld invariants (catches homeworldCameraOccluders regression)
  const scene = new THREE.Scene();
  const sb = new SpacecraftBuilder(scene, state, null, null, null, { deferHomeworld: true });
  assert.ok(Array.isArray(sb.homeworldCameraOccluders), 'homeworldCameraOccluders must always be an Array');
  assert.equal(sb.homeworldActivityVisuals, null, 'deferred homeworldActivityVisuals should start null');
  assert.ok(Array.isArray(sb.getHomeworldDynamicColliders()), 'getHomeworldDynamicColliders must return Array');
  // Calling spread like camera controller does must never throw
  const combinedOccluders = [...sb.homeworldCameraOccluders];
  assert.ok(Array.isArray(combinedOccluders));
  sb.ensureHomeworldScene();
  sb.ensureHomeworldScene(); // idempotent second call
  assert.ok(sb.homeworldActivityVisuals !== null, 'ensureHomeworldScene should populate homeworldActivityVisuals');

  // 3. HudController modal smoke
  const hudRoot = globalThis.document.createElement('div');
  const soundStub = new Proxy({}, { get: () => () => {} });
  const hud = new HudController(hudRoot, state, soundStub, { onTogglePause: () => {} });
  hud.openStationModal('furnace');
  hud.openStationModal('both');
  hud.openRecipeGuide();
  hud.openPauseModal();
  hud.closeModal();

  // 4. TouchControls, WorldBuilder, buildHomeworldLandscape smoke
  const touch = new TouchControls(hudRoot, { onMove: () => {}, onInteract: () => {} });
  assert.ok(touch);
  const world = new WorldBuilder(new THREE.Scene(), state);
  assert.ok(world);
  const landscapeColliders = [];
  const landscape = buildHomeworldLandscape(new THREE.Scene(), landscapeColliders);
  assert.ok(landscape && landscapeColliders.length > 0, 'buildHomeworldLandscape should populate colliders');

  console.log('[Gate 5/5] Headless white-box smoke checks passed');
}

async function main() {
  const jsFiles = collectJsFiles(srcDir);
  gate1SyntaxCheck(jsFiles);
  gate2CircularImports(jsFiles);
  gate3SecurityAndOffline(jsFiles);
  gate4HotLoopZeroGc(jsFiles);
  await gate5HeadlessSmoke();
  console.log('All pre-build checks PASSED.');
}

main().catch((err) => {
  console.error('\nPre-build check FAILED:', err?.stack || err);
  process.exit(1);
});
