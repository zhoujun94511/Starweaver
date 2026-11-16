import * as THREE from 'three';
import { getTerrainHeight } from '../utils/math.js';

const MAX_PARTICLES = 260;
const MAX_DUST = 96;

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

    // Dedicated soft radial-gradient billboard system for wheel dust & smoke puffs
    const dustPos = new Float32Array(MAX_DUST * 3);
    const dustSize = new Float32Array(MAX_DUST);
    const dustAlpha = new Float32Array(MAX_DUST);
    const dustColor = new Float32Array(MAX_DUST * 3);
    for (let i = 0; i < MAX_DUST; i++) {
      dustPos[i * 3 + 1] = -999;
      dustAlpha[i] = 0;
    }
    const dustGeo = new THREE.BufferGeometry();
    this._dustPosAttr = new THREE.BufferAttribute(dustPos, 3);
    this._dustPosAttr.setUsage(THREE.DynamicDrawUsage);
    this._dustSizeAttr = new THREE.BufferAttribute(dustSize, 1);
    this._dustSizeAttr.setUsage(THREE.DynamicDrawUsage);
    this._dustAlphaAttr = new THREE.BufferAttribute(dustAlpha, 1);
    this._dustAlphaAttr.setUsage(THREE.DynamicDrawUsage);
    this._dustColorAttr = new THREE.BufferAttribute(dustColor, 3);
    this._dustColorAttr.setUsage(THREE.DynamicDrawUsage);
    dustGeo.setAttribute('position', this._dustPosAttr);
    dustGeo.setAttribute('aSize', this._dustSizeAttr);
    dustGeo.setAttribute('aAlpha', this._dustAlphaAttr);
    dustGeo.setAttribute('aColor', this._dustColorAttr);

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uScale: { value: 520.0 * dpr }
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        uniform float uScale;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * (uScale / max(0.5, -mvPosition.z)), 4.0, 140.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          if (vAlpha <= 0.004) discard;
          vec2 d = gl_PointCoord - vec2(0.5);
          float r2 = dot(d, d) * 4.0;
          if (r2 >= 1.0) discard;
          float soft = pow(1.0 - r2, 1.45);
          gl_FragColor = vec4(vColor, vAlpha * soft);
        }
      `
    });

    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.dustPoints.frustumCulled = false;
    this.dustPoints.renderOrder = 4;
    this.scene.add(this.dustPoints);

    this.dustPool = Array.from({ length: MAX_DUST }, () => ({
      active: false,
      life: 0,
      maxLife: 0.55,
      x: 0,
      y: -999,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size0: 0.34,
      size1: 0.78,
      alpha0: 0.34
    }));
    this._dustCursor = 0;
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    this.mesh.visible = this.enabled;
    this.dustPoints.visible = this.enabled;
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

  emitSoftPlume(x, y, z, color = '#ff70d0', { vx = 0, vy = 1.6, vz = 0, size0 = 0.42, size1 = 0.98, maxLife = 1.15, alpha0 = 0.46 } = {}) {
    if (!this.enabled) return;
    const idx = this._dustCursor;
    this._dustCursor = (this._dustCursor + 1) % MAX_DUST;
    const p = this.dustPool[idx];
    p.active = true;
    p.life = 0;
    p.maxLife = maxLife;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size0 = size0;
    p.size1 = size1;
    p.alpha0 = alpha0;

    const i3 = idx * 3;
    const posArr = this._dustPosAttr.array;
    const colArr = this._dustColorAttr.array;
    posArr[i3] = x;
    posArr[i3 + 1] = y;
    posArr[i3 + 2] = z;
    this._dustSizeAttr.array[idx] = size0;
    this._dustAlphaAttr.array[idx] = alpha0;
    this._tmpColor.set(color);
    colArr[i3] = this._tmpColor.r;
    colArr[i3 + 1] = this._tmpColor.g;
    colArr[i3 + 2] = this._tmpColor.b;
    this._dustPosAttr.needsUpdate = true;
    this._dustSizeAttr.needsUpdate = true;
    this._dustAlphaAttr.needsUpdate = true;
    this._dustColorAttr.needsUpdate = true;
  }

  emitWheelDust(x, y, z, yaw) {
    if (!this.enabled) return;
    const backX = -Math.sin(yaw) * 0.44;
    const backZ = -Math.cos(yaw) * 0.44;
    const posArr = this._dustPosAttr.array;
    const colArr = this._dustColorAttr.array;
    const sizeArr = this._dustSizeAttr.array;
    const alphaArr = this._dustAlphaAttr.array;
    for (const side of [-0.34, 0.34]) {
      const idx = this._dustCursor;
      this._dustCursor = (this._dustCursor + 1) % MAX_DUST;
      const p = this.dustPool[idx];
      const sx = x + backX + Math.cos(yaw) * side + (Math.random() - 0.5) * 0.08;
      const sy = y + 0.14 + Math.random() * 0.06;
      const sz = z + backZ - Math.sin(yaw) * side + (Math.random() - 0.5) * 0.08;

      p.active = true;
      p.life = 0;
      p.maxLife = 0.54 + Math.random() * 0.16;
      p.x = sx;
      p.y = sy;
      p.z = sz;
      p.vx = -Math.sin(yaw) * 0.35 + (Math.random() - 0.5) * 0.55;
      p.vy = 0.42 + Math.random() * 0.42;
      p.vz = -Math.cos(yaw) * 0.35 + (Math.random() - 0.5) * 0.55;
      p.size0 = 0.46 + Math.random() * 0.10;
      p.size1 = 0.96 + Math.random() * 0.20;
      p.alpha0 = 0.56;

      const i3 = idx * 3;
      posArr[i3] = sx;
      posArr[i3 + 1] = sy;
      posArr[i3 + 2] = sz;
      sizeArr[idx] = p.size0;
      alphaArr[idx] = p.alpha0;
      // Warm desert dust tint
      this._tmpColor.set('#f4d6b8');
      colArr[i3] = this._tmpColor.r;
      colArr[i3 + 1] = this._tmpColor.g;
      colArr[i3 + 2] = this._tmpColor.b;
    }
    this._dustPosAttr.needsUpdate = true;
    this._dustSizeAttr.needsUpdate = true;
    this._dustAlphaAttr.needsUpdate = true;
    this._dustColorAttr.needsUpdate = true;
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

  emitJetpackTrail(x, y, z, yaw, velX = 0, velZ = 0) {
    if (!this.enabled) return;
    const backDirX = -Math.sin(yaw);
    const backDirZ = -Math.cos(yaw);
    const backX = backDirX * 0.52;
    const backZ = backDirZ * 0.52;
    const exhaustVx = -velX * 0.48 + backDirX * 0.95;
    const exhaustVz = -velZ * 0.48 + backDirZ * 0.95;
    for (const side of [-0.28, 0.28]) {
      const sx = x + backX + Math.cos(yaw) * side;
      const sz = z + backZ - Math.sin(yaw) * side;
      this._spawn({
        x: sx,
        y: y + 0.42,
        z: sz,
        vx: exhaustVx + (Math.random() - 0.5) * 0.65,
        vy: -2.4 - Math.random() * 1.2,
        vz: exhaustVz + (Math.random() - 0.5) * 0.65,
        gravity: 0.5,
        scale0: 0.68,
        scale1: 0.05,
        maxLife: 0.36,
        color: '#6cf7ff',
        glowBoost: 1.9
      });
    }
  }

  emitCelebrationSparkles(x, z, baseY = null) {
    if (!this.enabled) return;
    const y = (baseY !== null ? baseY : getTerrainHeight(x, z, true)) + 1.3;
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

  update(dt, furnaceBusy = false, { ambient = true } = {}) {
    if (!this.enabled) return;

    // Continuous ambient emitters: Furnace chimney embers & Northern Geothermal Vents (desert plane only!)
    if (ambient) {
      this._ambientTimer += dt;
      if (this._ambientTimer > 0.09) {
        this._ambientTimer = 0;
        // Solar Furnace rear-right chimney spark (8.2 + 0.34, 2.2 - 0.44)
        const fy = getTerrainHeight(8.2, 2.2, false) + 3.12;
        this._spawn({
          x: 8.54 + (Math.random() - 0.5) * 0.22,
          y: fy,
          z: 1.76 + (Math.random() - 0.5) * 0.22,
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
        this.emitSoftPlume(
          vx + (Math.random() - 0.5) * 0.4,
          vy,
          vz + (Math.random() - 0.5) * 0.4,
          '#ff86dc',
          {
            vx: (Math.random() - 0.5) * 0.55,
            vy: 1.85 + Math.random() * 1.15,
            vz: (Math.random() - 0.5) * 0.55,
            size0: 0.44,
            size1: 1.08,
            maxLife: 1.25,
            alpha0: 0.44
          }
        );
      }
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

    let anyDustUpdated = false;
    const posArr = this._dustPosAttr.array;
    const sizeArr = this._dustSizeAttr.array;
    const alphaArr = this._dustAlphaAttr.array;
    for (let i = 0; i < MAX_DUST; i++) {
      const p = this.dustPool[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        posArr[i * 3 + 1] = -999;
        alphaArr[i] = 0;
        anyDustUpdated = true;
        continue;
      }
      const t = p.life / p.maxLife;
      p.vy *= Math.max(0, 1 - dt * 1.4);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const i3 = i * 3;
      posArr[i3] = p.x;
      posArr[i3 + 1] = p.y;
      posArr[i3 + 2] = p.z;
      sizeArr[i] = p.size0 + (p.size1 - p.size0) * t;
      // Smooth fade-in (first 12%) and natural lingering fade-out
      const fadeIn = t < 0.12 ? t / 0.12 : 1.0;
      const fadeOut = (1.0 - t) * (1.0 - t * 0.35);
      alphaArr[i] = p.alpha0 * fadeIn * fadeOut;
      anyDustUpdated = true;
    }
    if (anyDustUpdated) {
      this._dustPosAttr.needsUpdate = true;
      this._dustSizeAttr.needsUpdate = true;
      this._dustAlphaAttr.needsUpdate = true;
    }
  }
}
