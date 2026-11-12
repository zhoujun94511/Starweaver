import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { artifactFileName, formatBuildStamp, readVersion } from './dist-artifact.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

async function buildStandalone() {
  fs.mkdirSync(distDir, { recursive: true });
  for (const name of fs.readdirSync(distDir)) {
    if (name === 'starweaver.html' || /^starweaver-.*\.html$/.test(name)) {
      fs.unlinkSync(path.join(distDir, name));
    }
  }

  const version = readVersion(rootDir);
  const stamp = formatBuildStamp();
  const outHtmlPath = path.join(distDir, artifactFileName(version, stamp.fileStamp));

  const cssRaw = fs.readFileSync(path.join(rootDir, 'src/ui/styles.css'), 'utf8');
  const cssResult = await esbuild.transform(cssRaw, {
    loader: 'css',
    minify: true
  });

  const jsResult = await esbuild.build({
    entryPoints: [path.join(rootDir, 'src/main.js')],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2020'],
    write: false
  });

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
  <style>${cssResult.code.trim()}</style>
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <div id="hud-root"></div>
  <script>${safeJs}</script>
</body>
</html>
`;

  fs.writeFileSync(outHtmlPath, html, 'utf8');
  const pagesDir = path.join(rootDir, '..', 'docs');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.copyFileSync(outHtmlPath, path.join(pagesDir, 'index.html'));
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
