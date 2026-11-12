import * as THREE from 'three';
import { getTerrainHeight } from '../utils/math.js';

const MAX_PARTICLES = 260;

/**
 * Zero-GC pooled InstancedMesh particle system for wheel dust, ore harvest bursts,
 * furnace sparks, geothermal plasma steam plumes, and repair celebration sparkles.
 */
export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;
    this.enabled = true;

    const geo = new THREE.IcosahedronGeometry(0.16, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.9
    });

    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    // Initialize per-instance color buffer
    const colors = new Float32Array(MAX_PARTICLES * 3);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
    this.scene.add(this.mesh);

    this.pool = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      life: 0,
      maxLife: 1,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      gravity: 0,
      scale0: 1,
      scale1: 0
    }));

    this._cursor = 0;
    this._dummy = new THREE.Object3D();
    this._tmpColor = new THREE.Color();
    this._ambientTimer = 0;

    // Hide all slots initially
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this._dummy.position.set(0, -999, 0);
      this._dummy.scale.setScalar(0.0001);
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    this.mesh.visible = this.enabled;
  }

  _spawn(opts) {
    if (!this.enabled) return;
    const p = this.pool[this._cursor];
    this._cursor = (this._cursor + 1) % MAX_PARTICLES;

    p.active = true;
    p.life = 0;
    p.maxLife = opts.maxLife || 0.7;
    p.x = opts.x;
    p.y = opts.y;
    p.z = opts.z;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.vz = opts.vz || 0;
    p.gravity = opts.gravity !== undefined ? opts.gravity : -4.0;
    p.scale0 = opts.scale0 || 0.8;
    p.scale1 = opts.scale1 !== undefined ? opts.scale1 : 0.05;

    this._tmpColor.set(opts.color || '#ffffff');
    if (opts.glowBoost) {
      this._tmpColor.multiplyScalar(opts.glowBoost);
    }
    this.mesh.setColorAt((this._cursor + MAX_PARTICLES - 1) % MAX_PARTICLES, this._tmpColor);
    this.mesh.instanceColor.needsUpdate = true;
  }

  emitWheelDust(x, y, z, yaw) {
    if (!this.enabled) return;
    const backX = -Math.sin(yaw) * 0.45;
    const backZ = -Math.cos(yaw) * 0.45;
    for (const side of [-0.36, 0.36]) {
      const sx = x + backX + Math.cos(yaw) * side;
      const sz = z + backZ - Math.sin(yaw) * side;
      this._spawn({
        x: sx,
        y: y + 0.14,
        z: sz,
        vx: (Math.random() - 0.5) * 0.9,
        vy: 0.45 + Math.random() * 0.55,
        vz: (Math.random() - 0.5) * 0.9,
        gravity: -0.6,
        scale0: 0.72,
        scale1: 1.35,
        maxLife: 0.48,
        color: '#e8bc92'
      });
    }
  }

  emitHarvestBurst(x, z, hexColor = '#7ce8ff', baseY = null) {
    if (!this.enabled) return;
    const y = (baseY !== null ? baseY : getTerrainHeight(x, z, true)) + 0.55;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1.4 + Math.random() * 3.2;
      this._spawn({
        x: x + (Math.random() - 0.5) * 0.35,
        y,
        z: z + (Math.random() - 0.5) * 0.35,
        vx: Math.cos(a) * spd,
        vy: 2.2 + Math.random() * 3.0,
        vz: Math.sin(a) * spd,
        gravity: -8.5,
        scale0: 0.85,
        scale1: 0.05,
        maxLife: 0.62 + Math.random() * 0.25,
        color: hexColor,
        glowBoost: 1.6
      });
    }
  }

  emitDrillGeyser(x, y, z, mineralColor = '#7ce8ff') {
    if (!this.enabled) return;
    // Geyser of desert earth clods + bright unearthed mineral sparks!
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
      const isCrystal = i % 2 === 0;
      const spd = 1.2 + Math.random() * 2.8;
      this._spawn({
        x: x + (Math.random() - 0.5) * 0.45,
        y: y + 0.22,
        z: z + (Math.random() - 0.5) * 0.45,
        vx: Math.cos(a) * spd,
        vy: 3.4 + Math.random() * 4.2,
        vz: Math.sin(a) * spd,
        gravity: -9.5,
        scale0: isCrystal ? 0.92 : 1.05,
        scale1: 0.06,
        maxLife: 0.72 + Math.random() * 0.28,
        color: isCrystal ? mineralColor : '#c9885b',
        glowBoost: isCrystal ? 1.9 : 1.0
      });
    }
  }

  emitJetpackTrail(x, y, z, yaw) {
    if (!this.enabled) return;
    const backX = -Math.sin(yaw) * 0.52;
    const backZ = -Math.cos(yaw) * 0.52;
    for (const side of [-0.28, 0.28]) {
      const sx = x + backX + Math.cos(yaw) * side;
      const sz = z + backZ - Math.sin(yaw) * side;
      this._spawn({
        x: sx,
        y: y + 0.42,
        z: sz,
        vx: (Math.random() - 0.5) * 0.7,
        vy: -2.6 - Math.random() * 1.4,
        vz: (Math.random() - 0.5) * 0.7,
        gravity: 0.5,
        scale0: 0.68,
        scale1: 0.05,
        maxLife: 0.36,
        color: '#6cf7ff',
        glowBoost: 1.9
      });
    }
  }

  emitCelebrationSparkles(x, z) {
    if (!this.enabled) return;
    const y = getTerrainHeight(x, z, true) + 1.3;
    const palette = ['#66f7ff', '#52ffb8', '#ffe066', '#ff85d8'];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const spd = 1.8 + Math.random() * 3.6;
      this._spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * spd,
        vy: 2.8 + Math.random() * 3.8,
        vz: Math.sin(a) * spd,
        gravity: -6.2,
        scale0: 0.95,
        scale1: 0.04,
        maxLife: 0.85 + Math.random() * 0.35,
        color: palette[i % palette.length],
        glowBoost: 2.0
      });
    }
  }

  emitCrashImpact(x = 0, z = 0) {
    if (!this.enabled) return;
    const y = getTerrainHeight(x, z, false) + 0.45;
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const spd = 3.2 + Math.random() * 6.5;
      const isSpark = i % 5 === 0;
      this._spawn({
        x: x + Math.cos(a) * 1.8,
        y: y + Math.random() * 0.6,
        z: z + Math.sin(a) * 2.4,
        vx: Math.cos(a) * spd,
        vy: 1.8 + Math.random() * 4.2,
        vz: Math.sin(a) * spd,
        gravity: isSpark ? -7.5 : -2.6,
        scale0: isSpark ? 0.65 : 1.35,
        scale1: isSpark ? 0.05 : 2.6,
        maxLife: isSpark ? 0.75 : 1.35 + Math.random() * 0.4,
        color: isSpark ? '#ff9d3b' : '#e8be96',
        glowBoost: isSpark ? 2.2 : 1.0
      });
    }
  }

  update(dt, furnaceBusy = false) {
    if (!this.enabled) return;

    // Continuous ambient emitters: Furnace chimney embers & Northern Geothermal Vents
    this._ambientTimer += dt;
    if (this._ambientTimer > 0.09) {
      this._ambientTimer = 0;
      // Solar Furnace chimney spark (8.2, 2.2)
      const fy = getTerrainHeight(8.2, 2.2, false) + 3.05;
      this._spawn({
        x: 8.2 + (Math.random() - 0.5) * 0.24,
        y: fy,
        z: 2.05 + (Math.random() - 0.5) * 0.24,
        vx: (Math.random() - 0.5) * 0.45,
        vy: furnaceBusy ? 2.4 + Math.random() * 1.4 : 1.1 + Math.random() * 0.7,
        vz: (Math.random() - 0.5) * 0.45,
        gravity: 0.35,
        scale0: furnaceBusy ? 0.68 : 0.42,
        scale1: 0.02,
        maxLife: 0.95,
        color: furnaceBusy ? '#ffaa38' : '#ff7b29',
        glowBoost: furnaceBusy ? 2.2 : 1.4
      });

      // Geothermal Vent plasma wisps in North region
      const vents = [
        [-4.2, -39.0],
        [5.0, -47.0],
        [-5.8, -54.5]
      ];
      const [vx, vz] = vents[Math.floor(Math.random() * vents.length)];
      const vy = getTerrainHeight(vx, vz, false) + 1.95;
      this._spawn({
        x: vx + (Math.random() - 0.5) * 0.4,
        y: vy,
        z: vz + (Math.random() - 0.5) * 0.4,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 1.9 + Math.random() * 1.3,
        vz: (Math.random() - 0.5) * 0.6,
        gravity: 0.25,
        scale0: 0.75,
        scale1: 1.5,
        maxLife: 1.25,
        color: '#ff70d0',
        glowBoost: 1.5
      });
    }

    let anyUpdated = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this._dummy.position.set(0, -999, 0);
        this._dummy.scale.setScalar(0.0001);
        this._dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this._dummy.matrix);
        anyUpdated = true;
        continue;
      }

      const t = p.life / p.maxLife;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const s = p.scale0 + (p.scale1 - p.scale0) * t;
      const fade = t > 0.7 ? (1 - t) / 0.3 : 1.0;

      this._dummy.position.set(p.x, p.y, p.z);
      this._dummy.rotation.set(p.life * 4.0, p.life * 3.0, 0);
      this._dummy.scale.setScalar(Math.max(0.001, s * fade));
      this._dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this._dummy.matrix);
      anyUpdated = true;
    }

    if (anyUpdated) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
