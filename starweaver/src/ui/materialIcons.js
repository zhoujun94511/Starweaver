import { EQUIPMENT_DEFS } from '../data/gameData.js';

const MASTER_ICON_CACHE = new Map();

/**
 * Draws a crisp procedural 2D icon for any material/component onto a <canvas> element.
 * Caches master vector renders per (mat.id, small) and fast-blits clones in O(1)!
 */
export function createMaterialIconCanvas(mat, small = false) {
  const px = small ? 52 : 76;
  const cacheKey = `${mat.id}:${small ? 's' : 'l'}`;

  let master = MASTER_ICON_CACHE.get(cacheKey);
  if (!master) {
    master = document.createElement('canvas');
    master.width = px;
    master.height = px;
    _drawMasterIcon(master, mat, small, px);
    MASTER_ICON_CACHE.set(cacheKey, master);
  }

  const clone = document.createElement('canvas');
  clone.width = px;
  clone.height = px;
  clone.className = small ? 'mat-icon-canvas small' : 'mat-icon-canvas';
  clone.getContext('2d').drawImage(master, 0, 0);
  return clone;
}

function _drawMasterIcon(canvas, mat, small, px) {
  const ctx = canvas.getContext('2d');
  const c = px * 0.5;
  const r = px * 0.34;
  const col = mat.color || '#8ecae6';

  // Soft radial backlight glow
  const glow = ctx.createRadialGradient(c, c, r * 0.1, c, c, r * 1.25);
  glow.addColorStop(0, `${col}55`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, px, px);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (mat.category === 'ship_module') {
    ctx.strokeStyle = col;
    ctx.lineWidth = small ? 2.2 : 3;
    ctx.beginPath();
    ctx.arc(c, c, r * 1.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const vx = c + Math.cos(a) * r * 0.74;
      const vy = c + Math.sin(a) * r * 0.74;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (mat.category === 'equipment') {
    const eqDef = EQUIPMENT_DEFS[mat.equipmentSlot];
    const shape = eqDef ? eqDef.iconShape : 'upgrade';
    if (shape === 'auger') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.62, c - r * 0.68);
      ctx.lineTo(c + r * 0.62, c - r * 0.68);
      ctx.lineTo(c, c + r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffffcc';
      ctx.lineWidth = small ? 2 : 3;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.45, c - r * 0.32);
      ctx.lineTo(c + r * 0.35, c - r * 0.12);
      ctx.moveTo(c - r * 0.28, c + r * 0.12);
      ctx.lineTo(c + r * 0.2, c + r * 0.32);
      ctx.stroke();
    } else if (shape === 'battery') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(c - r * 0.56, c - r * 0.64, r * 1.12, r * 1.38, r * 0.18);
      ctx.fill();
      ctx.fillRect(c - r * 0.24, c - r * 0.84, r * 0.48, r * 0.22);
      ctx.fillStyle = '#0d1b2a';
      ctx.beginPath();
      ctx.moveTo(c + r * 0.1, c - r * 0.42);
      ctx.lineTo(c - r * 0.26, c + r * 0.06);
      ctx.lineTo(c + r * 0.04, c + r * 0.06);
      ctx.lineTo(c - r * 0.12, c + r * 0.54);
      ctx.lineTo(c + r * 0.28, c - r * 0.02);
      ctx.lineTo(c - r * 0.02, c - r * 0.02);
      ctx.closePath();
      ctx.fill();
    } else if (shape === 'drone') {
      ctx.strokeStyle = col;
      ctx.lineWidth = small ? 2.2 : 3;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.88, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'sonar') {
      ctx.strokeStyle = col;
      ctx.lineWidth = small ? 2.2 : 3;
      for (const rr of [0.35, 0.65, 0.95]) {
        ctx.beginPath();
        ctx.arc(c, c + r * 0.25, r * rr, -Math.PI * 0.85, -Math.PI * 0.15);
        ctx.stroke();
      }
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c + r * 0.32, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'treads' || shape === 'tank') {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(c - r * 0.78, c - r * 0.46, r * 1.56, r * 0.92, r * 0.42);
      ctx.fill();
      ctx.fillStyle = '#0d1b2a';
      ctx.beginPath();
      ctx.arc(c - r * 0.34, c, r * 0.22, 0, Math.PI * 2);
      ctx.arc(c + r * 0.34, c, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c, c - r * 0.45);
      ctx.lineTo(c + r * 0.95, c - r * 0.15);
      ctx.lineTo(c + r * 0.68, c + r * 0.55);
      ctx.lineTo(c, c + r * 0.2);
      ctx.lineTo(c - r * 0.68, c + r * 0.55);
      ctx.lineTo(c - r * 0.95, c - r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c - r * 0.1, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mat.category === 'subcomponent') {
    ctx.fillStyle = col;
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const vx = c + Math.cos(a) * r * 0.86;
      const vy = c + Math.sin(a) * r * 0.86;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0d1b2a';
    ctx.beginPath();
    ctx.arc(c, c, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (mat.category === 'refined') {
    if (mat.id.includes('lens') || mat.id.includes('wire')) {
      ctx.strokeStyle = col;
      ctx.lineWidth = small ? 4.5 : 6.5;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffffcc';
      ctx.beginPath();
      ctx.arc(c - r * 0.22, c - r * 0.22, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (mat.id.includes('canister') || mat.id.includes('rod') || mat.id.includes('core')) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(c - r * 0.52, c - r * 0.82, r * 1.04, r * 1.64, r * 0.35);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(c - r * 0.24, c - r * 0.52, r * 0.2, r * 1.04);
    } else {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.65, c - r * 0.48);
      ctx.lineTo(c + r * 0.65, c - r * 0.48);
      ctx.lineTo(c + r * 0.92, c + r * 0.48);
      ctx.lineTo(c - r * 0.92, c + r * 0.48);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(c - r * 0.52, c - r * 0.36);
      ctx.lineTo(c + r * 0.52, c - r * 0.36);
      ctx.lineTo(c + r * 0.68, c - r * 0.02);
      ctx.lineTo(c - r * 0.68, c - r * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    const isCrystal =
      mat.id.includes('crystal') || mat.id === 'lumen_core' || mat.id === 'coolant_gel';
    ctx.fillStyle = col;
    if (isCrystal) {
      ctx.beginPath();
      ctx.moveTo(c - r * 0.1, c - r * 0.95);
      ctx.lineTo(c + r * 0.42, c - r * 0.1);
      ctx.lineTo(c + r * 0.18, c + r * 0.85);
      ctx.lineTo(c - r * 0.46, c + r * 0.65);
      ctx.lineTo(c - r * 0.55, c - r * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(c - r * 0.1, c - r * 0.9);
      ctx.lineTo(c + r * 0.12, c - r * 0.1);
      ctx.lineTo(c - r * 0.28, c + r * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(c - r * 0.35, c - r * 0.78);
      ctx.lineTo(c + r * 0.55, c - r * 0.62);
      ctx.lineTo(c + r * 0.85, c + r * 0.15);
      ctx.lineTo(c + r * 0.32, c + r * 0.78);
      ctx.lineTo(c - r * 0.68, c + r * 0.62);
      ctx.lineTo(c - r * 0.82, c - r * 0.12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(c - r * 0.2, c - r * 0.25, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
