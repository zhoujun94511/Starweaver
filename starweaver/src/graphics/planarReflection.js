import * as THREE from 'three';

/**
 * Real-Time Oblique-Clipped Planar Reflection System + Organic Shoreline Brine Pool Shader.
 * Renders an inverted virtual camera into a mipmapped HalfFloat/Byte texture so shallow
 * crystalline brine & coolant seep pools on Kharis-4 reflect the Starweaver hull, holographic
 * stations, mesas, and self-shadowed clouds with wind-rippled distortion and damp-sand rims.
 */
export class PlanarReflectionSystem {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.enabled = true;
    this.resolutionScale = 0.5; // 0.5 on High, 0.75 on Ultra, 0 on Low / Mobile Medium

    this.virtualCamera = new THREE.PerspectiveCamera();
    this.renderTarget = new THREE.WebGLRenderTarget(512, 256, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: true,
      depthBuffer: true,
      stencilBuffer: false
    });
    this.renderTarget.texture.name = 'starweaverPlanarReflection';

    this.textureMatrix = new THREE.Matrix4();
    this._biasMatrix = new THREE.Matrix4().set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );

    // Scratch math objects (zero per-frame allocations)
    this._camWorldPos = new THREE.Vector3();
    this._lookTarget = new THREE.Vector3();
    this._rotMat = new THREE.Matrix4();
    this._clipPlane = new THREE.Plane();
    this._clipVec = new THREE.Vector4();
    this._qVec = new THREE.Vector4();
    this._drawSize = new THREE.Vector2();
    this._upNormal = new THREE.Vector3(0, 1, 0);

    this.pools = [];
    this.excludeObjects = [];
    this._prevPoolVis = [];
    this._prevExcludeVis = [];
    this.activePool = null;
    this._frameCounter = 0;

    this.sharedUniforms = {
      uTime: { value: 0 },
      uReflMap: { value: this.renderTarget.texture },
      uReflMatrix: { value: this.textureMatrix },
      uReflActive: { value: 0 },
      uNightFactor: { value: 0 },
      uSunDir: { value: new THREE.Vector3(42, 64, 28).normalize() }
    };
  }

  registerExcludedObject(obj) {
    if (obj && !this.excludeObjects.includes(obj)) {
      this.excludeObjects.push(obj);
    }
  }

  setQuality(quality, isMobile = false) {
    if (quality === 'low' || (isMobile && quality !== 'ultra')) {
      this.enabled = false;
      this.resolutionScale = 0;
      this.sharedUniforms.uReflActive.value = 0;
    } else if (quality === 'medium') {
      this.enabled = true;
      this.resolutionScale = 0.35;
    } else if (quality === 'ultra') {
      this.enabled = true;
      this.resolutionScale = isMobile ? 0.45 : 0.72;
    } else {
      // 'high'
      this.enabled = true;
      this.resolutionScale = isMobile ? 0.38 : 0.52;
    }
  }

  /**
   * Creates an organic desert crystalline brine / endothermic coolant seep pool mesh
   * with soft radial + FBM shoreline transition from mirror liquid -> soaked dark sand -> dry sand.
   */
  createBrinePool({
    x,
    y,
    z,
    radiusX = 4.2,
    radiusZ = 3.1,
    rotationY = 0.25,
    tintDeep = '#0d3b4c',
    tintRim = '#2ec4d6',
    sandColor = '#b87c52',
    normalMap = null
  }) {
    const geo = new THREE.PlaneGeometry(radiusX * 2.5, radiusZ * 2.5, 40, 40);
    geo.rotateX(-Math.PI / 2);

    const poolUniforms = {
      uTime: this.sharedUniforms.uTime,
      uReflMap: this.sharedUniforms.uReflMap,
      uReflMatrix: this.sharedUniforms.uReflMatrix,
      uReflActive: this.sharedUniforms.uReflActive,
      uNightFactor: this.sharedUniforms.uNightFactor,
      uSunDir: this.sharedUniforms.uSunDir,
      uPoolHalf: { value: new THREE.Vector2(radiusX, radiusZ) },
      uDeepCol: { value: new THREE.Color(tintDeep) },
      uRimCol: { value: new THREE.Color(tintRim) },
      uWetSandCol: { value: new THREE.Color(sandColor) },
      uNormalTex: { value: normalMap },
      uHasNormalTex: { value: normalMap ? 1.0 : 0.0 },
      uIsCurrentPlane: { value: 1.0 }
    };

    const mat = new THREE.ShaderMaterial({
      name: 'crystalline-brine-pool',
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      uniforms: poolUniforms,
      vertexShader: `
        varying vec2 vLocalXZ;
        varying vec3 vWorldPos;
        void main() {
          vLocalXZ = position.xz;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec2 vLocalXZ;
        varying vec3 vWorldPos;

        uniform float uTime;
        uniform sampler2D uReflMap;
        uniform mat4 uReflMatrix;
        uniform float uReflActive;
        uniform float uNightFactor;
        uniform float uIsCurrentPlane;
        uniform vec3 uSunDir;
        uniform vec2 uPoolHalf;
        uniform vec3 uDeepCol;
        uniform vec3 uRimCol;
        uniform vec3 uWetSandCol;
        uniform sampler2D uNormalTex;
        uniform float uHasNormalTex;

        float hash2(vec2 p) {
          vec3 p3 = fract(vec3(p.xyx) * 0.1031);
          p3 += dot(p3, p3.yzx + 33.33);
          return fract((p3.x + p3.y) * p3.z);
        }

        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
            mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        float fbmPool(vec2 p) {
          float s = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            s += a * vnoise(p);
            p = mat2(0.8, -0.6, 0.6, 0.8) * p * 2.1 + 5.7;
            a *= 0.5;
          }
          return s / 0.9375;
        }

        void main() {
          vec2 q = vLocalXZ / max(uPoolHalf, vec2(0.1));
          float baseR = length(q);
          float shoreNoise = (fbmPool(vWorldPos.xz * 0.68 + 3.1) - 0.5) * 0.34 +
                             (fbmPool(vWorldPos.xz * 2.3 - 1.7) - 0.5) * 0.12;
          float dist = baseR + shoreNoise;

          // Outer damp-sand halo (dist 0.88 -> 1.18), inner liquid pool (dist < 0.88)
          float outerMask = 1.0 - smoothstep(0.96, 1.22, dist);
          if (outerMask <= 0.004) discard;

          float waterDepth = clamp((0.88 - dist) / 0.62, 0.0, 1.0);
          float puddleMask = smoothstep(0.90, 0.78, dist);
          float saltCrust = smoothstep(0.74, 0.84, dist) * (1.0 - smoothstep(0.84, 0.94, dist));

          // Animated dual-wave micro-ripples on liquid surface
          vec2 wUv1 = vWorldPos.xz * 0.42 + vec2(uTime * 0.035, uTime * 0.021);
          vec2 wUv2 = vWorldPos.xz * 0.78 - vec2(uTime * 0.028, -uTime * 0.032);
          float r1 = vnoise(wUv1 * 6.0) - 0.5;
          float r2 = vnoise(wUv2 * 9.5) - 0.5;
          vec2 rippleN = vec2(r1 + r2 * 0.7, (r1 - r2) * 0.8) * 0.045 * puddleMask;
          if (uHasNormalTex > 0.5) {
            vec2 tn = texture2D(uNormalTex, wUv1 * 0.35).xy * 2.0 - 1.0;
            rippleN += tn * 0.018 * puddleMask;
          }

          vec3 N = normalize(vec3(-rippleN.x * 2.4, 1.0, -rippleN.y * 2.4));
          vec3 V = normalize(cameraPosition - vWorldPos);
          float ndv = clamp(dot(N, V), 0.02, 1.0);
          // Schlick Fresnel (F0 = 0.035 for mineral brine)
          float fresnel = 0.035 + 0.965 * pow(1.0 - ndv, 4.6);

          // Sample oblique-clipped planar reflection texture (or analytic sky fallback)
          vec3 dayFb = mix(vec3(0.92, 0.70, 0.48), vec3(0.22, 0.44, 0.68), clamp(V.y * 1.4, 0.0, 1.0));
          vec3 nightFb = mix(vec3(0.04, 0.08, 0.16), vec3(0.015, 0.03, 0.08), clamp(V.y * 1.4, 0.0, 1.0));
          vec3 skyFallback = mix(dayFb, nightFb, uNightFactor);
          vec3 reflCol = skyFallback;
          if (uReflActive > 0.5 && uIsCurrentPlane > 0.5) {
            vec4 rc = uReflMatrix * vec4(vWorldPos.x, vWorldPos.y, vWorldPos.z, 1.0);
            vec2 ruv = rc.xy / max(rc.w, 1e-4) + rippleN * 0.55;
            ruv = clamp(ruv, vec2(0.004), vec2(0.996));
            reflCol = texture2D(uReflMap, ruv).rgb;
          }

          // Sun specular glitter across brine ripples
          vec3 L = normalize(uSunDir);
          vec3 H = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 220.0) * 3.8 * puddleMask;
          vec3 specCol = vec3(1.0, 0.93, 0.78) * spec;

          // Liquid absorption tint + mineral turquoise rim + white crystalline salt ring
          vec3 liquidBody = mix(uRimCol * 0.68, uDeepCol, smoothstep(0.05, 0.85, waterDepth));
          vec3 waterCol = mix(liquidBody, reflCol, clamp(fresnel * 0.92 + 0.16, 0.0, 0.96)) + specCol;

          // Damp dark sand bank outside liquid rim + pale evaporite salt crust at shoreline
          vec3 dampSand = uWetSandCol * 0.54;
          vec3 surfaceCol = mix(dampSand, waterCol, puddleMask);
          surfaceCol = mix(surfaceCol, vec3(0.94, 0.90, 0.84), saltCrust * 0.42);

          float alpha = mix(outerMask * 0.68, 0.96, puddleMask);
          gl_FragColor = vec4(surfaceCol, clamp(alpha, 0.0, 0.98));
        }
      `
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotationY;
    mesh.renderOrder = 2;

    const poolRecord = {
      mesh,
      uniforms: poolUniforms,
      x,
      y,
      z,
      maxRadius: Math.max(radiusX, radiusZ) * 1.3
    };
    this.pools.push(poolRecord);
    return mesh;
  }

  update(elapsed, mainCamera, forceEveryFrame = false) {
    this.sharedUniforms.uTime.value = elapsed;
    if (!this.enabled || this.resolutionScale <= 0 || this.pools.length === 0) {
      this.sharedUniforms.uReflActive.value = 0;
      return;
    }

    mainCamera.updateMatrixWorld();
    this._camWorldPos.setFromMatrixPosition(mainCamera.matrixWorld);

    // Pick closest visible brine pool within 58m of camera
    let bestPool = null;
    let bestDistSq = 58 * 58;
    for (const p of this.pools) {
      if (!p.mesh.visible) continue;
      const dx = p.x - this._camWorldPos.x;
      const dz = p.z - this._camWorldPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestPool = p;
      }
    }

    for (const p of this.pools) {
      p.uniforms.uIsCurrentPlane.value = p === bestPool ? 1.0 : 0.0;
    }

    if (!bestPool || this._camWorldPos.y <= bestPool.y + 0.08) {
      this.sharedUniforms.uReflActive.value = 0;
      return;
    }

    // Throttle reflection rasterization to every 2nd frame unless in cutscene or Ultra
    this._frameCounter++;
    if (!forceEveryFrame && this.resolutionScale < 0.65 && (this._frameCounter & 1) === 1 && this.sharedUniforms.uReflActive.value > 0.5 && this.activePool === bestPool) {
      return;
    }
    this.activePool = bestPool;

    // Resize reflection renderTarget proportionally to drawingBuffer
    const drawSize = this.renderer.getDrawingBufferSize(this._drawSize);
    const targetW = Math.max(128, Math.round((drawSize.x * this.resolutionScale) / 16) * 16);
    const targetH = Math.max(64, Math.round((drawSize.y * this.resolutionScale) / 16) * 16);
    if (this.renderTarget.width !== targetW || this.renderTarget.height !== targetH) {
      this.renderTarget.setSize(targetW, targetH);
    }

    const planeY = bestPool.y;
    const vCam = this.virtualCamera;

    // Mirror camera across y = planeY
    this._rotMat.extractRotation(mainCamera.matrixWorld);
    this._lookTarget.set(0, 0, -1).applyMatrix4(this._rotMat).add(this._camWorldPos);

    vCam.position.set(
      this._camWorldPos.x,
      2.0 * planeY - this._camWorldPos.y,
      this._camWorldPos.z
    );
    vCam.up.set(0, 1, 0).applyMatrix4(this._rotMat);
    vCam.up.y = -vCam.up.y;
    this._lookTarget.y = 2.0 * planeY - this._lookTarget.y;
    vCam.lookAt(this._lookTarget);

    vCam.fov = mainCamera.fov;
    vCam.aspect = mainCamera.aspect;
    vCam.near = mainCamera.near;
    vCam.far = mainCamera.far;
    vCam.updateMatrixWorld(true);
    vCam.projectionMatrix.copy(mainCamera.projectionMatrix);

    // Update projective UV matrix before oblique near-plane modification
    this.textureMatrix.copy(this._biasMatrix);
    this.textureMatrix.multiply(vCam.projectionMatrix);
    this.textureMatrix.multiply(vCam.matrixWorldInverse);

    // Lengyel Oblique Near-Plane Clipping so geometry below water plane never leaks into reflection
    this._clipPlane.set(this._upNormal, -planeY + 0.02);
    this._clipPlane.applyMatrix4(vCam.matrixWorldInverse);
    this._clipVec.set(
      this._clipPlane.normal.x,
      this._clipPlane.normal.y,
      this._clipPlane.normal.z,
      this._clipPlane.constant
    );

    const proj = vCam.projectionMatrix.elements;
    this._qVec.x = (Math.sign(this._clipVec.x) + proj[8]) / proj[0];
    this._qVec.y = (Math.sign(this._clipVec.y) + proj[9]) / proj[5];
    this._qVec.z = -1.0;
    this._qVec.w = (1.0 + proj[10]) / proj[14];

    this._clipVec.multiplyScalar(2.0 / this._clipVec.dot(this._qVec));
    proj[2] = this._clipVec.x;
    proj[6] = this._clipVec.y;
    proj[10] = this._clipVec.z + 1.0 - 0.008;
    proj[14] = this._clipVec.w;
    vCam.projectionMatrixInverse.copy(vCam.projectionMatrix).invert();

    // Hide pool meshes and 3D UI billboards/holograms while rendering reflection
    for (let i = 0; i < this.pools.length; i++) {
      this._prevPoolVis[i] = this.pools[i].mesh.visible;
      this.pools[i].mesh.visible = false;
    }
    for (let i = 0; i < this.excludeObjects.length; i++) {
      const obj = this.excludeObjects[i];
      this._prevExcludeVis[i] = obj.visible;
      obj.visible = false;
    }

    const prevRT = this.renderer.getRenderTarget();
    const prevShadowAuto = this.renderer.shadowMap.autoUpdate;
    const prevTone = this.renderer.toneMapping;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    try {
      this.renderer.setRenderTarget(this.renderTarget);
      this.renderer.clear(true, true, false);
      this.renderer.render(this.scene, vCam);
      this.sharedUniforms.uReflActive.value = 1.0;
    } finally {
      for (let i = 0; i < this.pools.length; i++) {
        this.pools[i].mesh.visible = this._prevPoolVis[i];
      }
      for (let i = 0; i < this.excludeObjects.length; i++) {
        this.excludeObjects[i].visible = this._prevExcludeVis[i];
      }
      this.renderer.setRenderTarget(prevRT);
      this.renderer.shadowMap.autoUpdate = prevShadowAuto;
      this.renderer.toneMapping = prevTone;
    }
  }
}
