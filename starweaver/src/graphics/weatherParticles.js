import * as THREE from 'three';

/**
 * 100% Stateless GPU Vertex-Wrapped Weather & Nocturnal Particle System (Zero CPU Loop / Zero GC!).
 * 1. `sandMesh`: High-velocity windblown desert sand streaks & dust wisps during Sandstorms.
 * 2. `starDustMesh`: Serene floating bioluminescent star-dust motes under the Milky Way Night sky.
 *
 * All particle wrapping around `uCamPos` happens on the GPU in GLSL using `fract()`, costing < 0.25ms!
 */
export class WeatherParticles {
  constructor(scene, { isMobile = false } = {}) {
    this.scene = scene;
    this.isMobile = isMobile;
    this.enabled = true;

    this._camPos = new THREE.Vector3();
    this._buildSandstormStreaks(isMobile ? 96 : 420);
    this._buildNocturnalStarDust(isMobile ? 72 : 200);
  }

  _buildSandstormStreaks(count) {
    const baseGeo = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = baseGeo.index;
    geo.attributes.position = baseGeo.attributes.position;
    geo.attributes.uv = baseGeo.attributes.uv;
    geo.instanceCount = count;

    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      // Pseudo-random deterministic distribution
      const s1 = fractSin(i * 12.9898 + 1.7);
      const s2 = fractSin(i * 78.233 + 5.3);
      const s3 = fractSin(i * 39.425 + 9.1);
      const s4 = fractSin(i * 93.173 + 2.9);
      seeds[i * 4] = s1;
      seeds[i * 4 + 1] = s2;
      seeds[i * 4 + 2] = s3;
      seeds[i * 4 + 3] = s4;
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    baseGeo.dispose();

    this.sandUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uNightFactor: { value: 0 },
      uCamPos: { value: new THREE.Vector3() },
      uWindDir: { value: new THREE.Vector3(0.92, -0.12, 0.36).normalize() },
      uWispScale: { value: this.isMobile ? 0.56 : 1.0 }
    };

    const mat = new THREE.ShaderMaterial({
      name: 'sw-gpu-sandstorm',
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: this.sandUniforms,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uCamPos;
        uniform vec3 uWindDir;
        uniform float uWispScale;
        varying vec2 vUv;
        varying float vAlpha;

        void main() {
          vUv = uv;
          vec3 box = vec3(38.0, 14.0, 38.0);
          float spd = (15.0 + aSeed.w * 11.0) * (0.55 + 0.45 * uIntensity);

          // Wrap seamlessly inside camera-centered volume
          vec3 worldOrigin = aSeed.xyz * box + uWindDir * (uTime * spd);
          vec3 rel = fract((worldOrigin - (uCamPos - box * 0.5)) / box) * box - box * 0.5;
          vec3 center = uCamPos + rel;
          center.y = max(center.y, -1.5);

          // Soft boundary fade at box edges + near-camera lens fade (prevents full-screen overdraw!)
          vec3 edge = 1.0 - smoothstep(vec3(0.36), vec3(0.50), abs(rel / box));
          float camDist = length(cameraPosition - center);
          float nearFade = smoothstep(1.35, 3.8, camDist);
          float isWisp = step(0.76, aSeed.w);
          vAlpha = edge.x * edge.y * edge.z * nearFade * mix(0.50, 0.14, isWisp) * uIntensity;

          // Zero-cost vertex collapse when alpha is negligible -> zero rasterized pixels!
          if (vAlpha < 0.006) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          // Velocity-aligned billboard basis
          vec3 toCam = normalize(cameraPosition - center);
          vec3 right = normalize(uWindDir);
          vec3 up = normalize(cross(toCam, right));

          float len = mix(0.52 + aSeed.x * 0.62, (1.85 + aSeed.x * 1.05) * uWispScale, isWisp);
          float thick = mix(0.042 + aSeed.y * 0.032, (0.42 + aSeed.y * 0.28) * uWispScale, isWisp);

          vec3 wp = center + right * (position.x * len) + up * (position.y * thick);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        uniform float uNightFactor;
        varying vec2 vUv;
        varying float vAlpha;

        void main() {
          vec2 d = vUv - 0.5;
          float mask = exp(-dot(d * vec2(2.4, 3.2), d * vec2(2.4, 3.2)) * 2.2);
          float a = clamp(mask * vAlpha, 0.0, 0.72);

          vec3 daySand = vec3(0.95, 0.72, 0.48);
          vec3 nightSand = vec3(0.26, 0.22, 0.24);
          vec3 col = mix(daySand, nightSand, uNightFactor);
          gl_FragColor = vec4(col, a);
        }
      `
    });

    this.sandMesh = new THREE.Mesh(geo, mat);
    this.sandMesh.name = 'weather-sandstorm';
    this.sandMesh.frustumCulled = false;
    this.sandMesh.visible = false;
    this.sandMesh.renderOrder = 6;
    this.scene.add(this.sandMesh);
  }

  _buildNocturnalStarDust(count) {
    const baseGeo = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = baseGeo.index;
    geo.attributes.position = baseGeo.attributes.position;
    geo.attributes.uv = baseGeo.attributes.uv;
    geo.instanceCount = count;

    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = fractSin(i * 19.31 + 0.7);
      seeds[i * 4 + 1] = fractSin(i * 47.89 + 3.1);
      seeds[i * 4 + 2] = fractSin(i * 83.17 + 6.4);
      seeds[i * 4 + 3] = fractSin(i * 61.53 + 8.2);
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    baseGeo.dispose();

    this.starDustUniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uCamPos: { value: new THREE.Vector3() }
    };

    const mat = new THREE.ShaderMaterial({
      name: 'sw-gpu-stardust',
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.starDustUniforms,
      vertexShader: `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform float uIntensity;
        uniform vec3 uCamPos;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vUv = uv;
          vec3 box = vec3(30.0, 11.0, 30.0);
          vec3 drift = vec3(
            sin(uTime * 0.45 + aSeed.w * 6.28) * 1.2 + uTime * 0.25,
            uTime * (0.32 + aSeed.y * 0.25),
            cos(uTime * 0.38 + aSeed.x * 6.28) * 1.2
          );

          vec3 worldOrigin = aSeed.xyz * box + drift;
          vec3 rel = fract((worldOrigin - (uCamPos - box * 0.5)) / box) * box - box * 0.5;
          vec3 center = uCamPos + rel;
          center.y = max(center.y, 0.25);

          vec3 edge = 1.0 - smoothstep(vec3(0.34), vec3(0.49), abs(rel / box));
          float pulse = 0.55 + 0.45 * sin(uTime * (2.0 + aSeed.w * 2.5) + aSeed.z * 25.0);
          vAlpha = edge.x * edge.y * edge.z * pulse * uIntensity * 0.85;
          if (vAlpha < 0.006) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
            return;
          }

          // Camera-facing soft glowing mote
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          float sz = (0.08 + aSeed.w * 0.09) * (0.7 + 0.3 * pulse);
          vec3 wp = center + (right * position.x + up * position.y) * sz;
          vColor = mix(vec3(0.42, 0.92, 1.0), vec3(1.0, 0.84, 0.48), step(0.68, aSeed.w));

          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        precision mediump float;
        varying vec2 vUv;
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          float r = length(vUv - 0.5) * 2.0;
          float glow = pow(max(1.0 - r, 0.0), 2.4);
          float a = glow * vAlpha;
          gl_FragColor = vec4(vColor * (1.8 * a), a);
        }
      `
    });

    this.starDustMesh = new THREE.Mesh(geo, mat);
    this.starDustMesh.name = 'weather-stardust';
    this.starDustMesh.frustumCulled = false;
    this.starDustMesh.visible = false;
    this.starDustMesh.renderOrder = 7;
    this.scene.add(this.starDustMesh);
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.enabled) {
      this.sandMesh.visible = false;
      this.starDustMesh.visible = false;
    }
  }

  update(elapsed, camera, sandstormWeight = 0, nightFactor = 0) {
    if (!this.enabled || !camera) {
      this.sandMesh.visible = false;
      this.starDustMesh.visible = false;
      return;
    }

    this._camPos.setFromMatrixPosition(camera.matrixWorld);

    if (sandstormWeight > 0.012) {
      this.sandMesh.visible = true;
      this.sandUniforms.uTime.value = elapsed;
      this.sandUniforms.uIntensity.value = sandstormWeight;
      this.sandUniforms.uNightFactor.value = nightFactor;
      this.sandUniforms.uCamPos.value.copy(this._camPos);
    } else {
      this.sandMesh.visible = false;
    }

    const starDustAmt = nightFactor * (1.0 - Math.min(1.0, sandstormWeight * 1.4));
    if (starDustAmt > 0.04) {
      this.starDustMesh.visible = true;
      this.starDustUniforms.uTime.value = elapsed;
      this.starDustUniforms.uIntensity.value = starDustAmt;
      this.starDustUniforms.uCamPos.value.copy(this._camPos);
    } else {
      this.starDustMesh.visible = false;
    }
  }
}

function fractSin(x) {
  const s = Math.sin(x) * 43758.5453123;
  return s - Math.floor(s);
}
