import * as THREE from 'three';

/**
 * WebGL2 GPU Procedural PBR Material & Micro-Weathering Baker.
 * Renders 100% seamless multi-channel textures (sRGB Albedo + Linear ORM [AO, Roughness, Metalness]
 * + 16-bit Height -> 8-tap Sobel Normal Map) directly on the GPU at up to 1024x1024 resolution.
 * Falls back gracefully if off-screen rendering is unavailable.
 */

const QUAD_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const NOISE_COMMON = `
  precision highp float;
  varying vec2 vUv;
  uniform float uSeed;
  uniform float uMode; // 0 = Albedo (sRGB), 1 = ORM (Linear: R=AO, G=Rough, B=Metal), 2 = 16-bit Height
  #define TAU 6.28318530718
  #define sat(x) clamp(x, 0.0, 1.0)

  vec3 hash3(vec2 c, vec2 per, float s) {
    vec2 w = mod(c, per);
    vec3 p3 = fract(vec3(w.xyx + vec3(s + uSeed, s * 1.7 + uSeed, s * 3.1)) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yzz) * p3.zyx);
  }

  float gnoise(vec2 p, vec2 per, float s) {
    vec2 i = floor(p);
    vec2 f = p - i;
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(hash3(i, per, s).xy * 2.0 - 1.0, f);
    float b = dot(hash3(i + vec2(1.0, 0.0), per, s).xy * 2.0 - 1.0, f - vec2(1.0, 0.0));
    float c = dot(hash3(i + vec2(0.0, 1.0), per, s).xy * 2.0 - 1.0, f - vec2(0.0, 1.0));
    float d = dot(hash3(i + vec2(1.0, 1.0), per, s).xy * 2.0 - 1.0, f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  float fbm(vec2 uv, vec2 freq, int oct, float s) {
    float amp = 0.5;
    float sum = 0.0;
    float norm = 0.0;
    vec2 f = freq;
    for (int i = 0; i < 6; i++) {
      if (i >= oct) break;
      sum += amp * gnoise(uv * f, f, s + float(i) * 7.13);
      norm += amp;
      amp *= 0.5;
      f *= 2.0;
    }
    return sat((sum / max(norm, 1e-4)) * 1.75 + 0.5);
  }

  // Periodic Voronoi: x = F1, y = F2, z = cellRandA, w = cellRandB
  vec4 voronoi(vec2 uv, vec2 freq, float s) {
    vec2 p = uv * freq;
    vec2 i = floor(p);
    vec2 f = p - i;
    float d1 = 9.0;
    float d2 = 9.0;
    vec2 id = vec2(0.0);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec3 r = hash3(i + o, freq, s);
        vec2 diff = o + r.xy - f;
        float dd = dot(diff, diff);
        if (dd < d1) {
          d2 = d1;
          d1 = dd;
          id = vec2(r.z, fract(r.z * 37.0 + r.x * 13.0));
        } else if (dd < d2) {
          d2 = dd;
        }
      }
    }
    return vec4(sqrt(d1), sqrt(d2), id);
  }

  float scratches(vec2 uv, float freq, float s, float width, float density) {
    vec2 p = uv * freq;
    vec2 i = floor(p);
    vec2 fr = p - i;
    float m = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y));
        vec3 r = hash3(i + o, vec2(freq), s);
        vec3 r2 = hash3(i + o, vec2(freq), s + 29.0);
        vec2 c = o + r.xy - fr;
        float ang = r.z * TAU;
        vec2 dir = vec2(cos(ang), sin(ang));
        float along = dot(c, dir);
        float across = dot(c, vec2(-dir.y, dir.x));
        float len = 0.16 + r2.x * 0.68;
        float stroke = smoothstep(width, width * 0.25, abs(across)) *
                       smoothstep(len, len * 0.65, abs(along)) *
                       step(r2.y, density);
        m = max(m, stroke * (0.4 + 0.6 * r2.z));
      }
    }
    return m;
  }

  void outputPBR(vec3 srgbAlbedo, float height, float ao, float rough, float metal) {
    if (uMode < 0.5) {
      gl_FragColor = vec4(clamp(srgbAlbedo, 0.0, 1.0), 1.0);
    } else if (uMode < 1.5) {
      gl_FragColor = vec4(sat(ao), clamp(rough, 0.04, 1.0), sat(metal), 1.0);
    } else {
      float hh = sat(height) * 255.0;
      float hi = floor(hh);
      float lo = hh - hi;
      gl_FragColor = vec4(hi / 255.0, lo, 0.0, 1.0);
    }
  }
`;

const SURFACE_SHADERS = {
  sand: `
    void main() {
      vec2 uv = vUv;
      float macro = fbm(uv, vec2(3.0, 3.0), 4, 1.0);
      float warp = fbm(uv, vec2(5.0, 5.0), 3, 4.0);
      // Asymmetric wind-blown desert ripples (sharp windward crest, soft leeward trough)
      float phase = (uv.y * 5.0 + uv.x * 2.0 + (warp - 0.5) * 0.85) * TAU;
      float ripple = sin(phase - 0.38 * sin(phase)) * 0.5 + 0.5;
      float secRipple = sin((uv.x * 11.0 - uv.y * 7.0 + (macro - 0.5) * 1.1) * TAU) * 0.5 + 0.5;

      vec4 grain = voronoi(uv, vec2(140.0, 140.0), 9.0);
      vec4 pebble = voronoi(uv, vec2(38.0, 38.0), 15.0);
      float pebMask = smoothstep(0.24, 0.08, pebble.x) * step(0.84, pebble.z);
      float mica = step(0.965, grain.z) * smoothstep(0.35, 0.05, grain.x);

      float fine = fbm(uv, vec2(96.0, 96.0), 2, 21.0);
      float h = ripple * 0.56 + secRipple * 0.14 + fine * 0.18 + pebMask * 0.22 - (1.0 - grain.x) * 0.04;

      vec3 troughCol = vec3(0.82, 0.63, 0.46);
      vec3 crestCol = vec3(0.97, 0.86, 0.72);
      vec3 col = mix(troughCol, crestCol, smoothstep(0.2, 0.85, ripple));
      col *= 0.90 + 0.18 * macro + (fine - 0.5) * 0.08;
      col = mix(col, vec3(0.58, 0.42, 0.33), pebMask * 0.72);
      col += vec3(0.12, 0.10, 0.08) * mica;

      float ao = mix(0.78, 1.0, smoothstep(0.08, 0.65, ripple)) * (1.0 - pebMask * 0.16);
      float rough = mix(0.95, 0.78, ripple) - mica * 0.52 - pebMask * 0.12;
      outputPBR(col, h, ao, rough, 0.02 + mica * 0.15);
    }
  `,
  rock: `
    void main() {
      vec2 uv = vUv;
      float warp = fbm(uv, vec2(4.0, 4.0), 4, 2.0);
      float crag = fbm(uv, vec2(12.0, 12.0), 5, 6.0);
      float fine = fbm(uv, vec2(72.0, 72.0), 3, 11.0);

      // Sedimentary canyon strata bands + fracture fissures
      float strataPhase = (uv.y * 6.0 + (warp - 0.5) * 0.9 + (crag - 0.5) * 0.25) * TAU;
      float strata = sin(strataPhase) * 0.5 + 0.5;
      float ledge = smoothstep(0.68, 0.92, strata);

      vec2 wuv = uv + (vec2(warp, crag) - 0.5) * 0.08;
      vec4 cr = voronoi(wuv, vec2(9.0, 9.0), 18.0);
      float fissure = smoothstep(0.038, 0.006, cr.y - cr.x);
      vec4 pitV = voronoi(uv, vec2(64.0, 64.0), 25.0);
      float pit = smoothstep(0.22, 0.04, pitV.x) * step(0.68, pitV.z);

      float h = strata * 0.38 + crag * 0.42 + fine * 0.20 + ledge * 0.12 - fissure * 0.36 - pit * 0.18;

      vec3 ochre = vec3(0.76, 0.51, 0.38);
      vec3 rustBand = vec3(0.56, 0.31, 0.24);
      vec3 paleCap = vec3(0.88, 0.68, 0.52);
      vec3 col = mix(rustBand, ochre, smoothstep(0.18, 0.72, strata));
      col = mix(col, paleCap, ledge * 0.55);
      col *= 0.82 + 0.34 * crag + (fine - 0.5) * 0.12;
      col *= 1.0 - fissure * 0.58 - pit * 0.28;

      float ao = sat(1.0 - fissure * 0.62 - pit * 0.32 - (1.0 - strata) * 0.18);
      float rough = 0.88 - ledge * 0.12 + fissure * 0.08 + (fine - 0.5) * 0.10;
      outputPBR(col, h, ao, rough, 0.04);
    }
  `,
  hull_white: `
    void main() {
      vec2 uv = vUv;
      // Aerospace staggered armor panels (2 rows x 2 staggered columns per tile)
      float rows = 2.0;
      float ry = uv.y * rows;
      float rIdx = floor(ry);
      float fy = fract(ry);
      float sx = uv.x * 2.0 + 0.5 * mod(rIdx, 2.0);
      float cIdx = floor(sx);
      float fx = fract(sx);

      vec3 cellRnd = hash3(vec2(cIdx, rIdx), vec2(4.0, 2.0), 3.0);
      float seamX = min(fx, 1.0 - fx) * 2.0;
      float seamY = min(fy, 1.0 - fy) * 2.0;
      float dSeam = min(seamX, seamY);
      float groove = 1.0 - smoothstep(0.008, 0.022, dSeam);
      float bevel = smoothstep(0.018, 0.048, dSeam) * (1.0 - smoothstep(0.048, 0.085, dSeam));

      // Corner & perimeter aerospace rivets
      vec2 rLocal = vec2(min(fx, 1.0 - fx), min(fy, 1.0 - fy));
      float rivetDist = length(rLocal - vec2(0.055, 0.075));
      float rivet = 1.0 - smoothstep(0.011, 0.019, rivetDist);

      // Brushed alloy grain + sandstorm edge chipping & reentry thermal streaks
      float brush = fbm(uv, vec2(4.0, 140.0), 2, 8.0);
      float macro = fbm(uv, vec2(4.0, 4.0), 4, 12.0);
      float scr = scratches(uv, 18.0, 19.0, 0.012, 0.42);
      float edgeZone = 1.0 - smoothstep(0.02, 0.14, dSeam);
      float chipNoise = fbm(uv, vec2(28.0, 28.0), 4, 31.0);
      float chip = smoothstep(0.76, 0.86, chipNoise + edgeZone * 0.24);
      float primer = smoothstep(0.68, 0.76, chipNoise + edgeZone * 0.22) * (1.0 - chip);

      float streak = fbm(uv, vec2(32.0, 2.0), 3, 41.0);
      float soot = smoothstep(0.58, 0.88, streak) * smoothstep(0.18, 0.0, fy) * 0.28;

      vec3 baseCol = mix(vec3(0.86, 0.90, 0.95), vec3(0.93, 0.95, 0.98), cellRnd.x);
      baseCol *= 0.95 + 0.08 * (macro - 0.5) + 0.04 * (brush - 0.5);
      baseCol *= 1.0 - soot;
      baseCol = mix(baseCol, vec3(0.54, 0.46, 0.42), primer * 0.65);
      baseCol = mix(baseCol, vec3(0.58, 0.63, 0.70), chip);
      baseCol = mix(baseCol, vec3(0.32, 0.38, 0.46), groove * 0.82);
      baseCol = mix(baseCol, vec3(0.52, 0.58, 0.66), rivet * 0.75);
      baseCol += vec3(0.08) * scr;

      float h = 0.65 + (brush - 0.5) * 0.04 + bevel * 0.08 - groove * 0.48 + rivet * 0.22 - chip * 0.14 - scr * 0.10;
      float ao = sat(1.0 - groove * 0.58 - rivet * 0.15 - soot * 0.18);
      float rough = 0.28 + (macro - 0.5) * 0.10 + soot * 0.24 - scr * 0.08;
      rough = mix(rough, 0.68, primer);
      rough = mix(rough, 0.22, chip);
      rough = mix(rough, 0.75, groove);
      float metal = mix(0.24, 0.92, max(chip, rivet * 0.8));

      outputPBR(baseCol, h, ao, rough, metal);
    }
  `,
  titanium_dark: `
    void main() {
      vec2 uv = vUv;
      float milled = fbm(uv, vec2(6.0, 160.0), 3, 5.0);
      float smudge = fbm(uv, vec2(6.0, 6.0), 4, 9.0);
      vec4 grain = voronoi(uv, vec2(110.0, 110.0), 14.0);
      float scr = scratches(uv, 16.0, 22.0, 0.014, 0.48);

      // Subtle structural rib seams
      float rib = smoothstep(0.018, 0.005, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
      float edgeWear = smoothstep(0.08, 0.012, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y))) *
                       smoothstep(0.45, 0.78, fbm(uv, vec2(20.0, 20.0), 3, 27.0));
      float brightMetal = sat(edgeWear * 0.75 + scr * 0.65);

      vec3 col = vec3(0.19, 0.24, 0.31) * (0.88 + 0.22 * smudge + 0.10 * (milled - 0.5));
      col = mix(col, vec3(0.62, 0.67, 0.74), brightMetal);
      col = mix(col, vec3(0.08, 0.10, 0.14), rib * 0.85);

      float h = 0.55 + (milled - 0.5) * 0.08 + (grain.x - 0.5) * 0.05 - scr * 0.18 - rib * 0.38;
      float ao = sat(1.0 - rib * 0.55);
      float rough = 0.46 + (smudge - 0.5) * 0.22 - brightMetal * 0.20;
      float metal = mix(0.76, 0.96, brightMetal);
      outputPBR(col, h, ao, rough, metal);
    }
  `,
  painted_orange: `
    void main() {
      vec2 uv = vUv;
      float macro = fbm(uv, vec2(4.0, 4.0), 4, 3.0);
      float fine = fbm(uv, vec2(90.0, 90.0), 2, 7.0);
      float chalk = smoothstep(0.42, 0.85, fbm(uv, vec2(3.0, 6.0), 4, 13.0));
      float scr = scratches(uv, 14.0, 17.0, 0.012, 0.38);

      vec4 flk = voronoi(uv, vec2(26.0, 18.0), 23.0);
      float chipMask = step(0.84, flk.z) * smoothstep(0.24, 0.10, flk.x + (fine - 0.5) * 0.12);
      float primer = step(0.84, flk.z) * smoothstep(0.32, 0.20, flk.x) * (1.0 - chipMask);

      vec3 paint = vec3(0.94, 0.49, 0.22) * (0.92 + 0.14 * macro);
      paint = mix(paint, vec3(0.98, 0.66, 0.42), chalk * 0.22);
      vec3 col = mix(paint, vec3(0.45, 0.36, 0.32), primer * 0.8);
      col = mix(col, vec3(0.62, 0.66, 0.72), max(chipMask, scr * 0.55));

      float h = 0.62 + (fine - 0.5) * 0.05 - primer * 0.12 - chipMask * 0.24 - scr * 0.14;
      float ao = sat(1.0 - chipMask * 0.20);
      float rough = 0.30 + chalk * 0.18 + (macro - 0.5) * 0.10;
      rough = mix(rough, 0.72, primer);
      rough = mix(rough, 0.26, chipMask);
      float metal = mix(0.18, 0.92, max(chipMask, scr * 0.5));
      outputPBR(col, h, ao, rough, metal);
    }
  `,
  brushed_copper: `
    void main() {
      vec2 uv = vUv;
      float brush1 = fbm(uv, vec2(3.0, 180.0), 3, 2.0);
      float brush2 = fbm(uv, vec2(8.0, 90.0), 2, 6.0);
      float patina = smoothstep(0.55, 0.88, fbm(uv, vec2(5.0, 5.0), 4, 15.0));
      float scr = scratches(uv, 15.0, 31.0, 0.010, 0.35);

      vec3 cop = vec3(0.90, 0.53, 0.29) * (0.88 + 0.18 * brush1 + 0.10 * (brush2 - 0.5));
      cop = mix(cop, vec3(0.58, 0.32, 0.22), patina * 0.42);
      cop += vec3(0.12, 0.09, 0.06) * scr;

      float h = 0.55 + (brush1 - 0.5) * 0.14 + (brush2 - 0.5) * 0.08 - scr * 0.15;
      float rough = 0.22 + patina * 0.24 + (brush2 - 0.5) * 0.08 - scr * 0.05;
      outputPBR(cop, h, 1.0 - patina * 0.12, rough, 0.92 - patina * 0.16);
    }
  `,
  station_deck: `
    void main() {
      vec2 uv = vUv;
      // Industrial raised diamond tread plate (8x8 grid)
      vec2 g = uv * 8.0;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      float alt = mod(id.x + id.y, 2.0);
      vec2 rf = alt > 0.5 ? vec2(f.x + f.y, -f.x + f.y) * 0.7071 : vec2(f.x - f.y, f.x + f.y) * 0.7071;

      // Elongated diamond lug shape
      float lugDist = abs(rf.x) * 2.6 + abs(rf.y) * 0.95;
      float lug = 1.0 - smoothstep(0.32, 0.46, lugDist);
      float lugTop = 1.0 - smoothstep(0.18, 0.32, lugDist);

      float grime = fbm(uv, vec2(5.0, 5.0), 4, 10.0);
      float fine = fbm(uv, vec2(110.0, 110.0), 2, 18.0);
      float oil = smoothstep(0.68, 0.88, fbm(uv, vec2(3.0, 3.0), 4, 24.0));

      vec3 valleyCol = vec3(0.28, 0.33, 0.40) * (0.82 + 0.26 * grime);
      valleyCol = mix(valleyCol, vec3(0.46, 0.36, 0.28), smoothstep(0.55, 0.85, grime) * 0.35);
      vec3 lugCol = vec3(0.64, 0.70, 0.78) * (0.92 + 0.14 * fine);
      vec3 col = mix(valleyCol, lugCol, lugTop);
      col *= 1.0 - oil * 0.35;

      float h = 0.32 + lug * 0.46 + (fine - 0.5) * 0.05;
      float ao = mix(0.68, 1.0, lug);
      float rough = mix(0.72, 0.26, lugTop) - oil * 0.22 + (grime - 0.5) * 0.12;
      float metal = mix(0.58, 0.92, lugTop);
      outputPBR(col, h, ao, rough, metal);
    }
  `
};

const SOBEL_NORMAL_FRAG = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tHeight;
  uniform float uTexel;
  uniform float uStrength;

  float sampleH(vec2 uv) {
    vec4 t = texture2D(tHeight, uv);
    return t.r + t.g / 255.0;
  }

  void main() {
    vec2 e = vec2(uTexel, 0.0);
    float l  = sampleH(vUv - e.xy);
    float r  = sampleH(vUv + e.xy);
    float d  = sampleH(vUv - e.yx);
    float u  = sampleH(vUv + e.yx);
    float ld = sampleH(vUv - vec2(uTexel, uTexel));
    float rd = sampleH(vUv + vec2(uTexel, -uTexel));
    float lu = sampleH(vUv + vec2(-uTexel, uTexel));
    float ru = sampleH(vUv + vec2(uTexel, uTexel));

    float gx = (r - l) * 0.5 + (ru + rd - lu - ld) * 0.25;
    float gy = (u - d) * 0.5 + (ru + lu - rd - ld) * 0.25;
    vec3 n = normalize(vec3(-gx * uStrength, -gy * uStrength, 1.0));
    gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
  }
`;

const MATERIAL_SPECS = {
  sand: { shader: 'sand', scale: 1.0, repeat: [24, 24], bump: 3.4, seed: 11 },
  rock: { shader: 'rock', scale: 1.0, repeat: [3, 3], bump: 5.2, seed: 23 },
  hull_white: { shader: 'hull_white', scale: 1.0, repeat: [3, 2], bump: 4.5, seed: 37 },
  titanium_dark: { shader: 'titanium_dark', scale: 0.5, repeat: [2, 2], bump: 3.0, seed: 51 },
  painted_orange: { shader: 'painted_orange', scale: 0.5, repeat: [2, 2], bump: 3.2, seed: 67 },
  brushed_copper: { shader: 'brushed_copper', scale: 0.5, repeat: [2, 2], bump: 2.6, seed: 83 },
  station_deck: { shader: 'station_deck', scale: 0.5, repeat: [3, 3], bump: 5.8, seed: 97 }
};

export function bakeGpuPbrLibrary(renderer, { isMobile = false } = {}) {
  if (!renderer) return null;

  const baseRes = isMobile ? 512 : 1024;
  const maxAniso = Math.min(
    isMobile ? 4 : 8,
    renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() || 1 : 1
  );

  const prevTarget = renderer.getRenderTarget();
  const prevToneMapping = renderer.toneMapping;
  const prevAutoClear = renderer.autoClear;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = true;

  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const sobelMat = new THREE.ShaderMaterial({
    vertexShader: QUAD_VERT,
    fragmentShader: SOBEL_NORMAL_FRAG,
    uniforms: {
      tHeight: { value: null },
      uTexel: { value: 1 / 512 },
      uStrength: { value: 3.0 }
    },
    depthTest: false,
    depthWrite: false,
    toneMapped: false
  });

  const renderTargetsToKeep = [];
  const tempHeightTargets = new Map();
  const library = {};

  try {
    const getHeightTarget = (res) => {
      if (!tempHeightTargets.has(res)) {
        const hrt = new THREE.WebGLRenderTarget(res, res, {
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
          wrapS: THREE.RepeatWrapping,
          wrapT: THREE.RepeatWrapping,
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          depthBuffer: false,
          stencilBuffer: false,
          generateMipmaps: false
        });
        tempHeightTargets.set(res, hrt);
      }
      return tempHeightTargets.get(res);
    };

    const createPersistentTarget = (res, colorSpace, repeat) => {
      const rt = new THREE.WebGLRenderTarget(res, res, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        colorSpace,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
        generateMipmaps: true
      });
      rt.texture.anisotropy = maxAniso;
      rt.texture.repeat.set(repeat[0], repeat[1]);
      renderTargetsToKeep.push(rt);
      return rt;
    };

    for (const [key, spec] of Object.entries(MATERIAL_SPECS)) {
      const res = Math.max(256, Math.round(baseRes * spec.scale));
      const surfMat = new THREE.ShaderMaterial({
        vertexShader: QUAD_VERT,
        fragmentShader: `${NOISE_COMMON}\n${SURFACE_SHADERS[spec.shader]}`,
        uniforms: {
          uSeed: { value: spec.seed },
          uMode: { value: 0 }
        },
        depthTest: false,
        depthWrite: false,
        toneMapped: false
      });

      const albedoRT = createPersistentTarget(res, THREE.SRGBColorSpace, spec.repeat);
      const ormRT = createPersistentTarget(res, THREE.NoColorSpace, spec.repeat);
      const normalRT = createPersistentTarget(res, THREE.NoColorSpace, spec.repeat);
      const heightRT = getHeightTarget(res);

      // Pass 1: sRGB Albedo
      surfMat.uniforms.uMode.value = 0;
      quadMesh.material = surfMat;
      renderer.setRenderTarget(albedoRT);
      renderer.render(quadScene, orthoCam);

      // Pass 2: Linear ORM (R = AO, G = Roughness, B = Metalness)
      surfMat.uniforms.uMode.value = 1;
      renderer.setRenderTarget(ormRT);
      renderer.render(quadScene, orthoCam);

      // Pass 3: 16-bit Packed Height -> 8-tap Sobel Normal Map
      surfMat.uniforms.uMode.value = 2;
      renderer.setRenderTarget(heightRT);
      renderer.render(quadScene, orthoCam);

      sobelMat.uniforms.tHeight.value = heightRT.texture;
      sobelMat.uniforms.uTexel.value = 1 / res;
      sobelMat.uniforms.uStrength.value = spec.bump * (res / 256);
      quadMesh.material = sobelMat;
      renderer.setRenderTarget(normalRT);
      renderer.render(quadScene, orthoCam);

      surfMat.dispose();

      library[key] = {
        map: albedoRT.texture,
        ormMap: ormRT.texture,
        normalMap: normalRT.texture,
        resolution: res
      };
    }
  } catch (err) {
    console.warn('[GpuMaterialBaker] fallback triggered:', err);
    for (const rt of renderTargetsToKeep) rt.dispose();
    return null;
  } finally {
    for (const hrt of tempHeightTargets.values()) hrt.dispose();
    sobelMat.dispose();
    quadGeo.dispose();
    renderer.setRenderTarget(prevTarget);
    renderer.toneMapping = prevToneMapping;
    renderer.autoClear = prevAutoClear;
  }

  library._targets = renderTargetsToKeep;
  library.setAnisotropy = (aniso) => {
    for (const rt of renderTargetsToKeep) {
      if (rt.texture.anisotropy !== aniso) {
        rt.texture.anisotropy = aniso;
        rt.texture.needsUpdate = true;
      }
    }
  };
  return library;
}

/**
 * Injects world-space 3D macro variation + Kharis-4 windblown desert dust settling
 * onto upward-facing recesses and ground-contact skirts of industrial/rock PBR materials.
 */
export function applyWorldWeathering(
  material,
  {
    dustAmount = 0.22,
    macroContrast = 0.12,
    macroScale = 0.28,
    groundSkirt = 0.35,
    keyTag = 'sw_weather_v1'
  } = {}
) {
  if (!material) return material;
  const prevCompile = material.onBeforeCompile;

  material.customProgramCacheKey = () =>
    `${keyTag}_${dustAmount.toFixed(2)}_${macroContrast.toFixed(2)}_${groundSkirt.toFixed(2)}`;

  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.uSwDust = { value: dustAmount };
    shader.uniforms.uSwMacro = { value: new THREE.Vector2(macroContrast, macroScale) };
    shader.uniforms.uSwSkirt = { value: groundSkirt };

    shader.vertexShader =
      `varying vec3 vSwWorldPos;\nvarying vec3 vSwWorldNrm;\n` +
      shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vec4 swWp = vec4(transformed, 1.0);
        vec3 swWn = objectNormal;
        #ifdef USE_INSTANCING
          swWp = instanceMatrix * swWp;
          swWn = mat3(instanceMatrix) * swWn;
        #endif
        vSwWorldPos = (modelMatrix * swWp).xyz;
        vSwWorldNrm = normalize(mat3(modelMatrix) * swWn);`
      );

    shader.fragmentShader =
      `varying vec3 vSwWorldPos;\nvarying vec3 vSwWorldNrm;\nuniform float uSwDust;\nuniform vec2 uSwMacro;\nuniform float uSwSkirt;\n
      float swHash3(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float swNoise3(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(
            mix(swHash3(i), swHash3(i + vec3(1,0,0)), f.x),
            mix(swHash3(i + vec3(0,1,0)), swHash3(i + vec3(1,1,0)), f.x),
            f.y
          ),
          mix(
            mix(swHash3(i + vec3(0,0,1)), swHash3(i + vec3(1,0,1)), f.x),
            mix(swHash3(i + vec3(0,1,1)), swHash3(i + vec3(1,1,1)), f.x),
            f.y
          ),
          f.z
        );
      }\n` +
      shader.fragmentShader
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float swM1 = swNoise3(vSwWorldPos * uSwMacro.y);
          float swM2 = swNoise3(vSwWorldPos * (uSwMacro.y * 3.3) + 7.1);
          float swMacroVal = (swM1 * 0.65 + swM2 * 0.35) - 0.5;
          diffuseColor.rgb *= 1.0 + swMacroVal * uSwMacro.x * 2.0;

          // Desert windblown dust settling on upward surfaces & lower ground contact skirts
          float swUpMask = smoothstep(0.22, 0.88, normalize(vSwWorldNrm).y);
          float swLowSkirt = (1.0 - smoothstep(0.05, 1.35, max(vSwWorldPos.y, 0.0))) * uSwSkirt;
          float swDustMask = clamp((swUpMask * 0.65 + swLowSkirt * 0.85) * (0.55 + 0.75 * swM2) * uSwDust, 0.0, 0.65);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.56, 0.38), swDustMask);`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + swMacroVal * 0.12, 0.05, 1.0);
          roughnessFactor = mix(roughnessFactor, 0.88, swDustMask * 0.75);`
        );
  };

  return material;
}
