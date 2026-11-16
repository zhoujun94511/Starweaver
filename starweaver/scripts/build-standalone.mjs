import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { artifactFileName, formatBuildStamp, readVersion } from './dist-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const FAVICON_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='15' fill='%230c1828'/%3E%3Ccircle cx='32' cy='10' r='4.2' fill='%235ce8ff'/%3E%3Cpath d='M32 14v5' stroke='%234b627d' stroke-width='3.5' stroke-linecap='round'/%3E%3Crect x='11' y='19' width='42' height='31' rx='13' fill='%23f4f8ff' stroke='%23ff9238' stroke-width='3'/%3E%3Crect x='17' y='25' width='30' height='16' rx='7' fill='%23102033'/%3E%3Ccircle cx='25.5' cy='33' r='3.6' fill='%235ce8ff'/%3E%3Ccircle cx='38.5' cy='33' r='3.6' fill='%235ce8ff'/%3E%3Cpath d='M28.5 38.5q3.5 3 7 0' fill='none' stroke='%2352ffb8' stroke-width='2.2' stroke-linecap='round'/%3E%3Crect x='22' y='52' width='20' height='5' rx='2.5' fill='%23ff9238'/%3E%3C/svg%3E";

function findEsbuildCli() {
  const packageName = `@esbuild/${process.platform}-${process.arch}`;
  const binaryName = process.platform === 'win32' ? 'esbuild.exe' : 'bin/esbuild';
  const candidate = path.join(rootDir, 'node_modules', packageName, binaryName);
  return fs.existsSync(candidate) ? candidate : null;
}

function runEsbuildCli(args, input) {
  const cli = findEsbuildCli();
  if (!cli) return null;
  return execFileSync(cli, args, {
    cwd: rootDir,
    input,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true
  });
}

async function transformCss(cssRaw) {
  try {
    return await esbuild.transform(cssRaw, { loader: 'css', minify: true });
  } catch (err) {
    if (err?.code !== 'EPERM') throw err;
    const code = runEsbuildCli(['--loader=css', '--minify', '--outfile=-'], cssRaw);
    if (code === null) throw err;
    return { code };
  }
}

async function bundleJavaScript(entryPoint) {
  try {
    return await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      minify: true,
      format: 'iife',
      target: ['es2020'],
      write: false
    });
  } catch (err) {
    if (err?.code !== 'EPERM') throw err;
    const text = runEsbuildCli(
      [entryPoint, '--bundle', '--minify', '--format=iife', '--target=es2020', '--outfile=-'],
      undefined
    );
    if (text === null) throw err;
    return { outputFiles: [{ text }] };
  }
}

async function buildStandalone() {
  fs.mkdirSync(distDir, { recursive: true });

  const version = readVersion(rootDir);
  const stamp = formatBuildStamp();
  const outHtmlPath = path.join(distDir, artifactFileName(version, stamp.fileStamp));

  const cssRaw = fs.readFileSync(path.join(rootDir, 'src/ui/styles.css'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
  const bootStyleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/i);
  const bootSplashMatch = indexHtml.match(/<div\s+id=["']boot-splash["'][\s\S]*?<\/div>\s*(?=<canvas\b)/i);
  if (!bootStyleMatch || !bootSplashMatch) {
    throw new Error('index.html must contain inline #boot-splash <style> and <div id="boot-splash">');
  }
  const bootCssResult = await transformCss(bootStyleMatch[1]);
  const cssResult = await transformCss(cssRaw);
  const jsResult = await bundleJavaScript(path.join(rootDir, 'src/main.js'));

  const rawJs = jsResult.outputFiles[0].text;
  // Safely escape any closing script tag sequence inside string literals
  const safeJs = rawJs.replace(/<\/script/gi, '<\\/script');

  const html = `<!DOCTYPE html>
<!-- starweaver ${version} | ${stamp.display} -->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="version" content="${version}" />
  <meta name="build-time" content="${stamp.iso}" />
  <title>Starweaver</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}" />
  <style>${bootCssResult.code.trim()}${cssResult.code.trim()}</style>
</head>
<body>
  ${bootSplashMatch[0].trim()}
  <canvas id="game-canvas" role="img" aria-label="Starweaver 3D game canvas"></canvas>
  <div id="hud-root"></div>
  <script>${safeJs}</script>
</body>
</html>
`;

  // Stage both destinations first. A failed write/copy must leave the previous
  // known-good artifact available for offline play and review.
  const tempHtmlPath = `${outHtmlPath}.tmp-${process.pid}`;
  const pagesDir = path.join(rootDir, '..', 'docs');
  fs.mkdirSync(pagesDir, { recursive: true });
  const tempDocsPath = path.join(pagesDir, `index.html.tmp-${process.pid}`);
  try {
    fs.writeFileSync(tempHtmlPath, html, 'utf8');
    fs.copyFileSync(tempHtmlPath, tempDocsPath);
    fs.renameSync(tempHtmlPath, outHtmlPath);
    fs.rmSync(path.join(pagesDir, 'index.html'), { force: true });
    fs.renameSync(tempDocsPath, path.join(pagesDir, 'index.html'));

    // Cleanup is last so a compiler or filesystem failure preserves the old
    // artifact. Keep only the newest versioned deliverable.
    for (const name of fs.readdirSync(distDir)) {
      if (name === 'starweaver.html' || (/^starweaver-.*\.html$/.test(name) && name !== path.basename(outHtmlPath))) {
        fs.unlinkSync(path.join(distDir, name));
      }
    }
  } finally {
    fs.rmSync(tempHtmlPath, { force: true });
    fs.rmSync(tempDocsPath, { force: true });
  }
  const stat = fs.statSync(outHtmlPath);
  const mb = (stat.size / (1024 * 1024)).toFixed(3);
  console.log(`Built standalone HTML: ${outHtmlPath}`);
  console.log(`Version: ${version}`);
  console.log(`Built at: ${stamp.display}`);
  console.log(`Exact size: ${stat.size} bytes (${mb} MB)`);
}

buildStandalone().catch((err) => {
  console.error(err);
  process.exit(1);
});
