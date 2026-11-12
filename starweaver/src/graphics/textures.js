import * as THREE from 'three';
import { fbm2D, clamp, mulberry32 } from '../utils/math.js';

// Procedural PBR Albedo, Normal, Roughness, Decal & Glow Sprite generators — 100% offline.

function heightGridToNormalTexture(heights, size, strength = 2.4, repeatX = 1, repeatY = 1) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => {
    const wx = ((x % size) + size) % size;
    const wy = ((y % size) + size) % size;
    return heights[wy * size + wx];
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = at(x - 1, y);
      const hR = at(x + 1, y);
      const hD = at(x, y - 1);
      const hU = at(x, y + 1);

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1.0 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      data[idx] = Math.round(((dx * invLen) * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round(((dy * invLen) * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round(((dz * invLen) * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

export function createSandPBRTextures(size = 256) {
  const albedoData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const rand = mulberry32(441122);

  for (let y = 0; y < size; y++) {
    const ay = (y / size) * Math.PI * 2;
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    for (let x = 0; x < size; x++) {
      // Truly 100% seamless periodic torus-mapped coordinates (zero tile seam lines!)
      const ax = (x / size) * Math.PI * 2;
      const cx = Math.cos(ax);
      const sx = Math.sin(ax);

      const p1 = fbm2D(cx * 1.8 + 4.1, cy * 1.8 + sx * 0.9 + 2.3, 3);
      const p2 = fbm2D(sx * 2.4 - 1.7, sy * 2.4 + cy * 0.8 + 6.5, 3);
      const fineGrain = fbm2D(cx * 5.2 + sy * 3.1 + 9.0, sx * 5.2 + cy * 3.1 - 3.4, 2);

      // Gentle organic wind-ripple phase with exact integer period around ay
      const wave = Math.sin(ay * 3.0 + ax * 1.0 + (p1 - 0.5) * 3.6) * 0.5 + 0.5;
      const sparkle = rand() > 0.986 ? 0.08 : 0.0;

      const h = wave * 0.52 + p2 * 0.28 + fineGrain * 0.2;
      heights[y * size + x] = h;

      const shade = clamp(0.9 + (h - 0.5) * 0.14 + sparkle, 0.78, 1.0);
      const idx = (y * size + x) * 4;
      albedoData[idx] = Math.round(246 * shade);
      albedoData[idx + 1] = Math.round(212 * shade);
      albedoData[idx + 2] = Math.round(178 * shade);
      albedoData[idx + 3] = 255;

      const roughVal = Math.round(clamp(0.93 - wave * 0.1 - sparkle * 1.2, 0.56, 0.97) * 255);
      roughData[idx] = roughVal;
      roughData[idx + 1] = roughVal;
      roughData[idx + 2] = roughVal;
      roughData[idx + 3] = 255;
    }
  }

  const repeatCount = 22;
  const map = new THREE.DataTexture(albedoData, size, size, THREE.RGBAFormat);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatCount, repeatCount);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const roughnessMap = new THREE.DataTexture(roughData, size, size, THREE.RGBAFormat);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(repeatCount, repeatCount);
  roughnessMap.magFilter = THREE.LinearFilter;
  roughnessMap.minFilter = THREE.LinearMipmapLinearFilter;
  roughnessMap.generateMipmaps = true;
  roughnessMap.needsUpdate = true;

  const normalMap = heightGridToNormalTexture(heights, size, 2.3, repeatCount, repeatCount);

  return { map, normalMap, roughnessMap };
}

export function createRockPBRTextures(size = 128) {
  const albedoData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const ay = (y / size) * Math.PI * 2;
    const cy = Math.cos(ay);
    const sy = Math.sin(ay);
    for (let x = 0; x < size; x++) {
      const ax = (x / size) * Math.PI * 2;
      const cx = Math.cos(ax);
      const sx = Math.sin(ax);

      // Truly seamless torus-mapped sedimentary strata & micro-crags!
      const crag = fbm2D(cx * 2.2 + sy * 1.1 + 5.4, sx * 2.2 + cy * 1.1 - 2.8, 3);
      const strata = Math.sin(ay * 4.0 + (crag - 0.5) * 3.2) * 0.5 + 0.5;
      const h = strata * 0.45 + crag * 0.55;
      heights[y * size + x] = h;

      const idx = (y * size + x) * 4;
      const r = clamp(188 + strata * 30 + (crag - 0.5) * 38, 120, 238);
      const g = clamp(128 + strata * 22 + (crag - 0.5) * 28, 82, 188);
      const b = clamp(98 + strata * 16 + (crag - 0.5) * 22, 62, 152);
      albedoData[idx] = Math.round(r);
      albedoData[idx + 1] = Math.round(g);
      albedoData[idx + 2] = Math.round(b);
      albedoData[idx + 3] = 255;
    }
  }

  const map = new THREE.DataTexture(albedoData, size, size, THREE.RGBAFormat);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const normalMap = heightGridToNormalTexture(heights, size, 3.4, 3, 3);
  return { map, normalMap };
}

export function createMetalHullPBR(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Brushed aerospace alloy base
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#e5ecf5');
  grad.addColorStop(0.5, '#d5dfec');
  grad.addColorStop(1, '#dce5f2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle horizontal brushed micro-lines
  ctx.fillStyle = 'rgba(120, 140, 165, 0.08)';
  for (let y = 0; y < size; y += 2) {
    ctx.fillRect(0, y, size, 1);
  }

  // Alternating hull plating panels with subtle tint variation
  const panels = [
    [6, 6, size - 12, size * 0.46 - 8, '#dfe7f2'],
    [6, size * 0.46 + 4, size * 0.52 - 8, size * 0.54 - 10, '#d2dce9'],
    [size * 0.52 + 4, size * 0.46 + 4, size * 0.48 - 10, size * 0.54 - 10, '#e3ebf6']
  ];

  // Height buffer for Normal Map generation
  const heights = new Float32Array(size * size);
  heights.fill(0.75);

  for (const [px, py, pw, ph, tint] of panels) {
    ctx.fillStyle = tint;
    ctx.fillRect(px, py, pw, ph);
    // Bevel highlight & groove seam
    ctx.strokeStyle = '#8b99ad';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px, py, pw, ph);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2, py + 2, pw - 4, ph - 4);

    // Carve panel seam grooves into heightfield
    const x0 = Math.max(0, Math.floor(px));
    const y0 = Math.max(0, Math.floor(py));
    const x1 = Math.min(size - 1, Math.floor(px + pw));
    const y1 = Math.min(size - 1, Math.floor(py + ph));
    for (let x = x0; x <= x1; x++) {
      heights[y0 * size + x] = 0.15;
      heights[y1 * size + x] = 0.15;
    }
    for (let y = y0; y <= y1; y++) {
      heights[y * size + x0] = 0.15;
      heights[y * size + x1] = 0.15;
    }

    // Precision aerospace fasteners / rivets
    ctx.fillStyle = '#738296';
    const rPts = [
      [px + 10, py + 10],
      [px + pw - 10, py + 10],
      [px + 10, py + ph - 10],
      [px + pw - 10, py + ph - 10]
    ];
    for (const [rx, ry] of rPts) {
      ctx.beginPath();
      ctx.arc(rx, ry, 2.6, 0, Math.PI * 2);
      ctx.fill();
      const ix = Math.round(rx);
      const iy = Math.round(ry);
      if (ix > 1 && ix < size - 2 && iy > 1 && iy < size - 2) {
        heights[iy * size + ix] = 1.0;
      }
    }
  }

  // Subtle technical stencil accent stripe
  ctx.fillStyle = 'rgba(232, 122, 61, 0.85)';
  ctx.fillRect(18, 18, 42, 6);

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 2);
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = heightGridToNormalTexture(heights, size, 2.8, 3, 2);
  return { map, normalMap };
}

export function createMetalHullTexture(size = 256) {
  return createMetalHullPBR(size).map;
}

export function createScorchDecalTexture(size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  const grad = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    size * 0.06,
    size * 0.5,
    size * 0.5,
    size * 0.48
  );
  grad.addColorStop(0, 'rgba(28, 20, 18, 0.88)');
  grad.addColorStop(0.45, 'rgba(56, 36, 26, 0.62)');
  grad.addColorStop(0.78, 'rgba(98, 62, 40, 0.25)');
  grad.addColorStop(1, 'rgba(120, 78, 50, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGlowSpriteTexture(size = 128, innerColor = '#ffffff', midColor = '#ffd89b') {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, innerColor);
  grad.addColorStop(0.28, midColor);
  grad.addColorStop(0.65, 'rgba(255, 190, 120, 0.16)');
  grad.addColorStop(1, 'rgba(255, 190, 120, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSoftAOShadowTexture(size = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size * 0.5;
  const grad = ctx.createRadialGradient(c, c, c * 0.08, c, c, c);
  grad.addColorStop(0, 'rgba(24, 12, 6, 0.62)');
  grad.addColorStop(0.48, 'rgba(36, 18, 10, 0.34)');
  grad.addColorStop(0.82, 'rgba(48, 24, 14, 0.08)');
  grad.addColorStop(1, 'rgba(48, 24, 14, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createHazardStripeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1e2530';
  ctx.fillRect(0, 0, 128, 32);
  ctx.fillStyle = '#f5ab38';
  for (let i = -32; i < 160; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 12, 0);
    ctx.lineTo(i, 32);
    ctx.lineTo(i - 12, 32);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSignpostTexture(titleText, arrowDir = '→', accent = '#5ce6ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 576;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  function updateLabel(nextText) {
    ctx.save();
    ctx.scale(2, 2);
    const bg = ctx.createLinearGradient(0, 0, 0, 96);
    bg.addColorStop(0, '#1a273b');
    bg.addColorStop(1, '#0f1826');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 288, 96);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, 278, 86);

    ctx.fillStyle = accent;
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(arrowDir, 16, 48);

    ctx.fillStyle = '#f2f8ff';
    ctx.font = 'bold 21px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(String(nextText).slice(0, 20), 60, 48);
    ctx.restore();
    tex.needsUpdate = true;
  }

  updateLabel(titleText);
  tex.updateLabel = updateLabel;
  return tex;
}

export function createFloatingBadgeTexture(titleText, subtitleText, accent = '#ffbe4d') {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  function updateBadge(title, sub) {
    ctx.save();
    ctx.scale(2, 2);
    ctx.clearRect(0, 0, 320, 96);
    ctx.fillStyle = 'rgba(12, 22, 36, 0.88)';
    ctx.beginPath();
    ctx.roundRect(6, 8, 308, 80, 18);
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(6, 8, 308, 80, 18);
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.font = 'bold 24px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(title), 160, 36);

    ctx.fillStyle = '#d8e8fa';
    ctx.font = '600 16px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(String(sub), 160, 66);
    ctx.restore();
    tex.needsUpdate = true;
  }

  updateBadge(titleText, subtitleText);
  tex.updateBadge = updateBadge;
  return tex;
}

export function createVisorCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  function drawMood(mood = 'normal', blink = false) {
    // Deep glossy OLED screen backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, 128);
    bg.addColorStop(0, '#07111e');
    bg.addColorStop(1, '#0d1d30');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 128);

    // Crisp subtle OLED scanlines
    ctx.fillStyle = 'rgba(86, 240, 255, 0.06)';
    for (let y = 0; y < 128; y += 4) {
      ctx.fillRect(0, y, 256, 2);
    }

    const leftX = 80;
    const rightX = 176;
    const centerY = 66;

    ctx.save();
    ctx.shadowBlur = 14;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';

    if (blink) {
      ctx.strokeStyle = '#62f4ff';
      ctx.shadowColor = '#28d8ff';
      ctx.beginPath();
      ctx.moveTo(leftX - 22, centerY);
      ctx.lineTo(leftX + 22, centerY);
      ctx.moveTo(rightX - 22, centerY);
      ctx.lineTo(rightX + 22, centerY);
      ctx.stroke();
    } else if (mood === 'sleep') {
      ctx.strokeStyle = 'rgba(90, 185, 220, 0.42)';
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#1b6d8c';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(leftX, centerY + 2, 16, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightX, centerY + 2, 16, Math.PI * 0.12, Math.PI * 0.88);
      ctx.stroke();
    } else if (mood === 'happy' || mood === 'celebrate') {
      const col = mood === 'celebrate' ? '#ffe066' : '#5cffba';
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.arc(leftX, centerY + 8, 22, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rightX, centerY + 8, 22, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();

      // Cute warm LED blush cheeks
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#ff7aa8';
      ctx.fillStyle = 'rgba(255, 130, 172, 0.72)';
      ctx.beginPath();
      ctx.ellipse(44, 90, 12, 7, 0, 0, Math.PI * 2);
      ctx.ellipse(212, 90, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (mood === 'work') {
      ctx.strokeStyle = '#ffc252';
      ctx.fillStyle = '#ffc252';
      ctx.shadowColor = '#ff9900';
      ctx.beginPath();
      ctx.moveTo(leftX - 22, centerY - 8);
      ctx.lineTo(leftX + 22, centerY + 3);
      ctx.moveTo(rightX - 22, centerY + 3);
      ctx.lineTo(rightX + 22, centerY - 8);
      ctx.stroke();
      ctx.fillRect(leftX - 11, centerY + 3, 22, 15);
      ctx.fillRect(rightX - 11, centerY + 3, 22, 15);
    } else {
      // Expressive glowing rounded eyes + specular catchlight
      ctx.fillStyle = '#5ef2ff';
      ctx.shadowColor = '#1ec8ff';
      ctx.beginPath();
      ctx.roundRect(leftX - 19, centerY - 23, 38, 46, 16);
      ctx.roundRect(rightX - 19, centerY - 23, 38, 46, 16);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(leftX + 7, centerY - 9, 6.5, 0, Math.PI * 2);
      ctx.arc(rightX + 7, centerY - 9, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.arc(leftX - 6, centerY + 10, 3.2, 0, Math.PI * 2);
      ctx.arc(rightX - 6, centerY + 10, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    texture.needsUpdate = true;
  }

  drawMood('normal', false);
  return { canvas, texture, drawMood };
}
