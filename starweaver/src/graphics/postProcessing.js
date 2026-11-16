import * as THREE from 'three';

/**
 * Next-Gen Cinematic Multi-Pass Post-Processing Pipeline for Starweaver.
 * Bridges the generational visual gap with:
 * 1. Linear HDR Scene RenderTarget + Hardware DepthTexture
 * 2. Half-Resolution Linear Depth + View-Space Normal Reconstruction + 12/16-Tap SSAO (fades cleanly on sunlit highlights)
 * 3. Half-Resolution Raymarched Volumetric God-Rays (samples Sun ShadowMap + direction-aware atmospheric aerial perspective)
 * 4. Joint Bilateral Depth-Aware Upsample & Energy-Conserving Composite
 * 5. 5-Level Dual-Filter Karis Pyramid Bloom (firefly-free) + Subtle Anamorphic Horizontal Flare Streak
 * 6. Temporal Log-Luminance Auto-Exposure + Depth-Occluded Solar Glare / Ghosts + Procedural Lens Dirt
 * 7. ACES + Blender AgX Hybrid Filmic Curve + Split-Tone Cinematic Grade + Contrast-Aware Unsharp Mask + FXAA + Film Grain
 */

const FULLSCREEN_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const COMMON_GLSL = `
  precision highp float;
  varying vec2 vUv;

  float ign(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
  }

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float luma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
  }
`;

const DEPTH_HALF_FRAG = `
  ${COMMON_GLSL}
  #include <packing>
  uniform sampler2D tDepth;
  uniform vec2 uFullTexel;
  uniform float uNear;
  uniform float uFar;

  void main() {
    // Sample exact centers of the 2x2 full-res texel quad and pack 24/32-bit linear depth into RGBA8.
    // Eliminates 10-bit HalfFloat depth quantization terraces that caused horizontal scanlines in SSAO!
    vec2 q = uFullTexel * 0.5;
    float d0 = texture2D(tDepth, vUv + vec2(-q.x, -q.y)).r;
    float d1 = texture2D(tDepth, vUv + vec2( q.x, -q.y)).r;
    float d2 = texture2D(tDepth, vUv + vec2(-q.x,  q.y)).r;
    float d3 = texture2D(tDepth, vUv + vec2( q.x,  q.y)).r;
    float d = min(min(d0, d1), min(d2, d3));
    float z = (uNear * uFar) / max(uFar - d * (uFar - uNear), 1e-4);
    gl_FragColor = packDepthToRGBA(clamp(z / uFar, 0.0, 1.0));
  }
`;

const SSAO_FRAG = `
  ${COMMON_GLSL}
  #include <packing>
  uniform sampler2D tDepthHalf;
  uniform float uFar;
  uniform vec2 uTanHalf;
  uniform vec2 uTexel;
  uniform float uRadius;
  uniform float uIntensity;
  uniform float uAspect;

  float readHalfZ(vec2 uv) {
    return unpackRGBAToDepth(texture2D(tDepthHalf, uv)) * uFar;
  }

  vec3 viewPos(vec2 uv, float z) {
    return vec3((uv * 2.0 - 1.0) * uTanHalf * z, -z);
  }

  void main() {
    float z0 = readHalfZ(vUv);
    if (z0 <= 0.15 || z0 > 135.0) {
      gl_FragColor = vec4(1.0);
      return;
    }

    vec3 P = viewPos(vUv, z0);
    vec2 ox = vec2(uTexel.x, 0.0);
    vec2 oy = vec2(0.0, uTexel.y);

    float zl = readHalfZ(vUv - ox);
    float zr = readHalfZ(vUv + ox);
    float zd = readHalfZ(vUv - oy);
    float zu = readHalfZ(vUv + oy);

    vec3 dx = abs(zl - z0) < abs(zr - z0) ? P - viewPos(vUv - ox, zl) : viewPos(vUv + ox, zr) - P;
    vec3 dy = abs(zd - z0) < abs(zu - z0) ? P - viewPos(vUv - oy, zd) : viewPos(vUv + oy, zu) - P;
    vec3 N = normalize(cross(dx, dy));

    float rad = uRadius * (0.65 + 0.35 * clamp(z0 / 14.0, 0.0, 1.0));
    float rUv = clamp(rad / max(2.0 * z0 * uTanHalf.y, 1e-3), 2.5 * uTexel.y, 0.13);
    float R2 = rad * rad;
    float rot = ign(gl_FragCoord.xy) * 6.2831853;

    float occ = 0.0;
    for (int i = 0; i < AO_TAPS; i++) {
      float f = (float(i) + 0.5) / float(AO_TAPS);
      float ang = f * 18.849556 + rot;
      vec2 offset = vec2(cos(ang) / max(uAspect, 0.2), sin(ang)) * (f * rUv);
      vec2 suv = vUv + offset;
      float sz = readHalfZ(suv);
      vec3 V = viewPos(suv, sz) - P;
      float vv = dot(V, V);
      float vn = dot(V, N);
      float falloff = max(R2 - vv, 0.0);
      occ += falloff * falloff * falloff * max((vn - (0.036 + 0.0065 * z0)) / (vv + 0.010), 0.0);
    }

    float ao = max(0.0, 1.0 - (uIntensity * occ * 4.8) / max(R2 * R2 * R2 * float(AO_TAPS), 1e-5));
    ao = mix(ao, 1.0, smoothstep(60.0, 130.0, z0));
    gl_FragColor = vec4(ao, ao, ao, 1.0);
  }
`;

const VOLUMETRIC_FRAG = `
  ${COMMON_GLSL}
  #include <packing>

  uniform sampler2D tDepthHalf;
  uniform sampler2D tShadow;
  uniform float uHasShadow;
  uniform mat4 uShadowMatrix;
  uniform mat4 uCamWorld;
  uniform vec3 uCamPos;
  uniform float uPlaneBaseY;
  uniform vec2 uTanHalf;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uHorizonSun;
  uniform vec3 uHorizonAway;
  uniform float uFarZ;
  uniform float uMaxDist;
  uniform float uSigma;
  uniform float uSpaceBlend;
  uniform float uNightFactor;

  float heightDensity(float y, float planeBaseY) {
    return 0.28 + 0.72 * exp(-max((y - planeBaseY) + 1.5, 0.0) / 14.0);
  }

  float hgPhase(float mu, float g) {
    float g2 = g * g;
    return (1.0 - g2) / (12.566371 * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
  }

  float sampleSunVisibility(vec3 worldPos) {
    vec4 sc = uShadowMatrix * vec4(worldPos, 1.0);
    sc.xyz /= max(sc.w, 1e-5);
    if (sc.x <= 0.01 || sc.x >= 0.99 || sc.y <= 0.01 || sc.y >= 0.99 || sc.z <= 0.0 || sc.z >= 1.0) {
      return 1.0;
    }
    float depth = unpackRGBAToDepth(texture2D(tShadow, sc.xy));
    return step(sc.z - 0.0008, depth);
  }

  void main() {
    if (uSpaceBlend > 0.92) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }

    float z = unpackRGBAToDepth(texture2D(tDepthHalf, vUv)) * uFarZ;
    vec3 viewRay = vec3((vUv * 2.0 - 1.0) * uTanHalf, -1.0);
    float rayLen = length(viewRay);
    vec3 rd = normalize(mat3(uCamWorld) * viewRay);
    float planeBaseY = uPlaneBaseY;

    float worldDist = z * rayLen;
    bool isSky = z > uFarZ * 0.96;
    float skyRayScale = mix(0.45, 0.08, uNightFactor);
    float marchDist = min(worldDist, isSky ? uMaxDist * skyRayScale : uMaxDist);

    vec3 sunD = normalize(uSunDir);
    float mu = dot(rd, sunD);
    float phase = min(hgPhase(mu, 0.74) * 0.58 + hgPhase(mu, 0.22) * 0.42, 1.25);

    float azSun = clamp(dot(normalize(rd.xz + vec2(1e-5)), normalize(sunD.xz)) * 0.5 + 0.5, 0.0, 1.0);
    vec3 dayAmb = mix(uHorizonAway, uHorizonSun, pow(azSun, 1.6)) * 0.28;
    vec3 nightAmb = vec3(0.025, 0.048, 0.095) * 0.22;
    vec3 ambCol = mix(dayAmb, nightAmb, uNightFactor);

    float jitter = ign(gl_FragCoord.xy);
    vec3 accum = vec3(0.0);
    float trans = 1.0;
    float tPrev = 0.0;
    float planetFade = 1.0 - clamp(uSpaceBlend, 0.0, 1.0);

    for (int i = 0; i < VOL_STEPS; i++) {
      float f = (float(i) + 1.0) / float(VOL_STEPS);
      float t1 = marchDist * f * (0.38 + 0.62 * f);
      float ds = t1 - tPrev;
      vec3 p = uCamPos + rd * (tPrev + ds * jitter);

      float sh = uHasShadow > 0.5 ? sampleSunVisibility(p) : 1.0;
      float ext = uSigma * heightDensity(p.y, planeBaseY) * planetFade;
      float stepT = exp(-ext * ds);

      // Emphasize mid-ground canyon & arch shafts without washing out foreground feet/grass
      float nearBoost = smoothstep(2.5, 8.5, tPrev) * mix(1.75, 0.62, smoothstep(8.5, 72.0, tPrev));
      float nightRayDim = mix(1.45, 0.42, uNightFactor);
      vec3 inScatter = uSunColor * (phase * sh * nearBoost * nightRayDim) + ambCol * (0.45 + 0.55 * sh);
      accum += trans * inScatter * (1.0 - stepT);
      trans *= stepT;
      tPrev = t1;
    }

    // Direction-aware analytic aerial perspective for far mesas & canyon horizon (> uMaxDist)
    if (!isSky && worldDist > uMaxDist) {
      float farSpan = worldDist - uMaxDist;
      float farTau = uSigma * 0.52 * farSpan * planetFade;
      float farT = exp(-farTau);
      vec3 dayFarHaze = mix(uHorizonAway * 0.72, uHorizonSun * 0.92, pow(azSun, 1.8));
      vec3 nightFarHaze = vec3(0.032, 0.058, 0.115);
      vec3 farHaze = mix(dayFarHaze, nightFarHaze, uNightFactor);
      accum += trans * farHaze * (1.0 - farT);
      trans *= farT;
    }

    gl_FragColor = vec4(accum, trans);
  }
`;

const BILATERAL_BLUR_FRAG = `
  ${COMMON_GLSL}
  #include <packing>
  uniform sampler2D tSrc;
  uniform sampler2D tDepthHalf;
  uniform float uFar;
  uniform vec2 uDir;
  uniform float uDepthTol;

  float readHalfZ(vec2 uv) {
    return unpackRGBAToDepth(texture2D(tDepthHalf, uv)) * uFar;
  }

  void main() {
    float z0 = min(readHalfZ(vUv), 320.0);
    vec4 sum = vec4(0.0);
    float wSum = 0.0;
    for (int i = -4; i <= 4; i++) {
      float fi = float(i);
      vec2 uv = vUv + uDir * fi;
      float z = min(readHalfZ(uv), 320.0);
      float wSpatial = exp(-(fi * fi) * 0.14);
      float wDepth = max(0.0, 1.0 - abs(z - z0) / (uDepthTol * z0 + 0.04));
      float w = wSpatial * wDepth;
      sum += texture2D(tSrc, uv) * w;
      wSum += w;
    }
    gl_FragColor = wSum > 1e-4 ? sum / wSum : texture2D(tSrc, vUv);
  }
`;

const COMPOSITE_AO_VOL_FRAG = `
  ${COMMON_GLSL}
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tDepthHalf;
  uniform sampler2D tAO;
  uniform sampler2D tVol;
  uniform vec2 uHalfRes;
  uniform float uNear;
  uniform float uFar;
  uniform float uAoOn;
  uniform float uVolOn;
  uniform float uAoStrength;

  void main() {
    vec3 col = max(texture2D(tColor, vUv).rgb, vec3(0.0));
    float d = texture2D(tDepth, vUv).r;

    if (d < 0.99998) {
      float z = min((uNear * uFar) / max(uFar - d * (uFar - uNear), 1e-4), 320.0);
      vec2 hp = vUv * uHalfRes - 0.5;
      vec2 f = fract(hp);
      vec2 baseUv = (floor(hp) + 0.5) / uHalfRes;
      vec2 texel = 1.0 / uHalfRes;

      float ao = 0.0;
      vec4 vol = vec4(0.0);
      float ws = 0.0;

      for (int k = 0; k < 4; k++) {
        vec2 o = vec2(mod(float(k), 2.0), floor(float(k) * 0.5));
        vec2 suv = baseUv + o * texel;
        float zh = min(unpackRGBAToDepth(texture2D(tDepthHalf, suv)) * uFar, 320.0);
        float wBilinear = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
        float w = max(wBilinear / (0.018 + abs(zh - z) / max(z, 0.1)), 1e-5);
        ao += texture2D(tAO, suv).r * w;
        vol += texture2D(tVol, suv) * w;
        ws += w;
      }
      ao /= ws;
      vol /= ws;

      if (uAoOn > 0.5) {
        // Fade SSAO on brightly sunlit surfaces so white ceramic & bright sand never look smudged
        float sunlit = smoothstep(0.25, 1.15, luma(col));
        float aoFactor = mix(1.0, ao, uAoStrength * (1.0 - 0.72 * sunlit));
        // Single-pass cool cobalt-indigo shadow tint in crevices for rich warm-cool contrast
        col *= vec3(
          aoFactor * 0.96,
          aoFactor * 0.985,
          min(1.0, aoFactor * 1.03)
        );
      }
      if (uVolOn > 0.5) {
        col = col * vol.a + vol.rgb;
      }
    } else if (uVolOn > 0.5) {
      vec4 skyVol = texture2D(tVol, vUv);
      col = col * skyVol.a + skyVol.rgb;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

const BLOOM_DOWN_FRAG = `
  ${COMMON_GLSL}
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uFirst;
  uniform float uThreshold;

  vec3 fetchTap(vec2 o) {
    vec3 c = clamp(texture2D(tSrc, vUv + o * uTexel).rgb, vec3(0.0), vec3(120.0));
    if (uFirst > 0.5) {
      float lum = luma(c);
      float knee = uThreshold * 0.45;
      float soft = clamp(lum - uThreshold + knee, 0.0, 2.0 * knee);
      soft = (soft * soft) / max(4.0 * knee, 1e-4);
      float contrib = max(soft, lum - uThreshold) / max(lum, 1e-4);
      c *= clamp(contrib, 0.0, 1.0);
    }
    return c;
  }

  float karisW(vec3 c) {
    return 1.0 / (1.0 + luma(c) * 0.12);
  }

  void main() {
    vec3 a = fetchTap(vec2(-2.0,  2.0));
    vec3 b = fetchTap(vec2( 0.0,  2.0));
    vec3 c = fetchTap(vec2( 2.0,  2.0));
    vec3 d = fetchTap(vec2(-2.0,  0.0));
    vec3 e = fetchTap(vec2( 0.0,  0.0));
    vec3 f = fetchTap(vec2( 2.0,  0.0));
    vec3 g = fetchTap(vec2(-2.0, -2.0));
    vec3 h = fetchTap(vec2( 0.0, -2.0));
    vec3 i = fetchTap(vec2( 2.0, -2.0));
    vec3 j = fetchTap(vec2(-1.0,  1.0));
    vec3 k = fetchTap(vec2( 1.0,  1.0));
    vec3 l = fetchTap(vec2(-1.0, -1.0));
    vec3 m = fetchTap(vec2( 1.0, -1.0));

    vec3 outCol;
    if (uFirst > 0.5) {
      vec3 g0 = (a + b + d + e) * 0.25;
      vec3 g1 = (b + c + e + f) * 0.25;
      vec3 g2 = (d + e + g + h) * 0.25;
      vec3 g3 = (e + f + h + i) * 0.25;
      vec3 g4 = (j + k + l + m) * 0.25;
      float w0 = karisW(g0) * 0.125;
      float w1 = karisW(g1) * 0.125;
      float w2 = karisW(g2) * 0.125;
      float w3 = karisW(g3) * 0.125;
      float w4 = karisW(g4) * 0.5;
      outCol = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / max(w0 + w1 + w2 + w3 + w4, 1e-4);
    } else {
      outCol = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    }
    gl_FragColor = vec4(outCol, 1.0);
  }
`;

const BLOOM_UP_FRAG = `
  ${COMMON_GLSL}
  uniform sampler2D tLow;
  uniform sampler2D tHigh;
  uniform vec2 uTexel;
  uniform float uRadiusMix;

  void main() {
    vec2 o = uTexel;
    vec3 tent = texture2D(tLow, vUv).rgb * 4.0;
    tent += (
      texture2D(tLow, vUv + vec2(o.x, 0.0)).rgb +
      texture2D(tLow, vUv - vec2(o.x, 0.0)).rgb +
      texture2D(tLow, vUv + vec2(0.0, o.y)).rgb +
      texture2D(tLow, vUv - vec2(0.0, o.y)).rgb
    ) * 2.0;
    tent +=
      texture2D(tLow, vUv + o).rgb +
      texture2D(tLow, vUv - o).rgb +
      texture2D(tLow, vUv + vec2(o.x, -o.y)).rgb +
      texture2D(tLow, vUv + vec2(-o.x, o.y)).rgb;
    tent *= 1.0 / 16.0;

    gl_FragColor = vec4(texture2D(tHigh, vUv).rgb + tent * uRadiusMix, 1.0);
  }
`;

const ANAMORPHIC_STREAK_FRAG = `
  ${COMMON_GLSL}
  uniform sampler2D tSrc;
  uniform vec2 uStep;
  uniform float uFirstPass;

  vec3 sampleSoftY(vec2 uv, float dy) {
    vec3 res = vec3(0.0);
    if (dy <= 0.0) {
      #if __VERSION__ >= 300
        res = textureLod(tSrc, uv, 0.0).rgb;
      #else
        res = texture2D(tSrc, uv).rgb;
      #endif
    } else {
      #if __VERSION__ >= 300
        vec3 c0 = textureLod(tSrc, uv - vec2(0.0, dy), 0.0).rgb;
        vec3 c1 = textureLod(tSrc, uv, 0.0).rgb;
        vec3 c2 = textureLod(tSrc, uv + vec2(0.0, dy), 0.0).rgb;
      #else
        vec3 c0 = texture2D(tSrc, uv - vec2(0.0, dy)).rgb;
        vec3 c1 = texture2D(tSrc, uv).rgb;
        vec3 c2 = texture2D(tSrc, uv + vec2(0.0, dy)).rgb;
      #endif
      vec3 avg = c1 * 0.5 + (c0 + c2) * 0.25;
      // Gate out low-energy terrain glints so only true high-emission cores produce lens streaks
      float lum = luma(avg);
      res = avg * smoothstep(1.35, 3.2, lum);
    }
    return res;
  }

  void main() {
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    float dy = uFirstPass > 0.5 ? uStep.y : 0.0;
    vec2 hStep = vec2(uStep.x, 0.0);
    for (int i = -5; i <= 5; i++) {
      float x = float(i);
      float w = exp(-x * x / 11.0);
      acc += sampleSoftY(vUv + hStep * x, dy) * w;
      ws += w;
    }
    gl_FragColor = vec4(acc / ws, 1.0);
  }
`;

const ADAPT_EXPOSURE_FRAG = `
  ${COMMON_GLSL}
  uniform sampler2D tPrev;
  uniform sampler2D tScene;
  uniform sampler2D tDepth;
  uniform vec2 uSunUv;
  uniform float uSunOn;
  uniform float uAspect;
  uniform float uRate;
  uniform float uVisRate;

  void main() {
    float logSum = 0.0;
    float wSum = 0.0;
    for (int y = 0; y < 5; y++) {
      for (int x = 0; x < 7; x++) {
        vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(7.0, 5.0);
        float w = 1.0 - 0.72 * smoothstep(0.12, 0.56, length(uv - 0.5));
        float l = luma(texture2D(tScene, uv).rgb);
        logSum += log(clamp(l, 0.02, 25.0)) * w;
        wSum += w;
      }
    }
    float avgLum = clamp(exp(logSum / wSum), 0.04, 16.0);

    // 10-tap Vogel disk depth occlusion check around projected sun screen UV
    float sunVis = 0.0;
    if (uSunOn > 0.001) {
      for (int i = 0; i < 10; i++) {
        float r = sqrt((float(i) + 0.5) / 10.0) * 0.014;
        float th = float(i) * 2.39996323;
        vec2 suv = uSunUv + vec2(cos(th) / max(uAspect, 0.3), sin(th)) * r;
        if (suv.x >= 0.0 && suv.x <= 1.0 && suv.y >= 0.0 && suv.y <= 1.0) {
          sunVis += step(0.99992, texture2D(tDepth, suv).r);
        }
      }
      sunVis = (sunVis / 10.0) * uSunOn;
    }

    vec4 prev = texture2D(tPrev, vec2(0.5));
    float adapted = mix(prev.r, avgLum, uRate);
    if (!(adapted > 0.0) || adapted > 100.0) adapted = avgLum;
    float smoothVis = mix(prev.g, sunVis, uVisRate);
    if (!(smoothVis >= 0.0)) smoothVis = sunVis;

    gl_FragColor = vec4(adapted, smoothVis, 0.0, 1.0);
  }
`;

const LENS_DIRT_FRAG = `
  ${COMMON_GLSL}
  uniform float uAspect;

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash12(i), hash12(i + vec2(1.0, 0.0)), f.x),
      mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 p = vUv * vec2(uAspect, 1.0);
    float bokeh = 0.0;
    for (int i = 0; i < 48; i++) {
      float fi = float(i);
      vec2 c = vec2(hash12(vec2(fi, 2.1)), hash12(vec2(fi, 8.7))) * vec2(uAspect, 1.0);
      float sz = mix(0.015, 0.075, pow(hash12(vec2(fi, 5.3)), 2.6));
      float r = length(p - c) / sz;
      float ring = smoothstep(1.0, 0.84, r) * (0.35 + 0.65 * smoothstep(0.35, 0.96, r));
      bokeh += ring * mix(0.14, 0.55, hash12(vec2(fi, 9.4)));
    }
    float smudge = vnoise(vUv * vec2(6.0, 9.0) + 2.3) * vnoise(vUv * 3.1 + 7.4);
    float edgeMask = 0.35 + 0.85 * smoothstep(0.16, 0.72, length(vUv - 0.5));
    vec3 col = vec3(bokeh * 0.45 + smudge * 0.65) * edgeMask * vec3(1.0, 0.94, 0.86);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CINEMATIC_GRADE_FRAG = `
  ${COMMON_GLSL}
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform sampler2D tStreak;
  uniform sampler2D tDirt;
  uniform sampler2D tAdapt;

  uniform float uAspect;
  uniform float uBloomStrength;
  uniform float uStreakStrength;
  uniform float uDirtStrength;
  uniform float uFlareStrength;
  uniform vec2 uSunUv;
  uniform vec3 uSunCol;
  uniform float uBaseExposure;
  uniform float uAgxMix;
  uniform float uVignette;
  uniform float uSaturation;
  uniform float uCA;

  // Blender / Filament AgX Base Fit for butter-smooth highlight roll-off
  const mat3 REC2020_TO_SRGB = mat3(
    vec3( 1.6605, -0.1246, -0.0182),
    vec3(-0.5876,  1.1329, -0.1006),
    vec3(-0.0728, -0.0083,  1.1187)
  );
  const mat3 SRGB_TO_REC2020 = mat3(
    vec3(0.6274, 0.0691, 0.0164),
    vec3(0.3293, 0.9195, 0.0880),
    vec3(0.0433, 0.0113, 0.8956)
  );

  vec3 agxCurve(vec3 x) {
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  }

  vec3 toneMapAgX(vec3 color) {
    const mat3 inset = mat3(
      vec3(0.856627, 0.137319, 0.111898),
      vec3(0.095121, 0.761242, 0.076799),
      vec3(0.048252, 0.101439, 0.811302)
    );
    const mat3 outset = mat3(
      vec3( 1.127101, -0.141330, -0.141330),
      vec3(-0.110607,  1.157824, -0.110607),
      vec3(-0.016494, -0.016494,  1.251936)
    );
    color = inset * (SRGB_TO_REC2020 * max(color, vec3(0.0)));
    color = clamp((log2(max(color, 1e-10)) - (-12.47393)) / (4.026069 - (-12.47393)), 0.0, 1.0);
    color = agxCurve(color);
    // Punchy chroma & contrast lift
    float l = luma(color);
    color = pow(max(color, vec3(0.0)), vec3(1.12));
    color = l + (color - l) * 1.18;
    color = outset * color;
    color = pow(max(color, vec3(0.0)), vec3(2.2));
    return clamp(REC2020_TO_SRGB * color, 0.0, 1.0);
  }

  vec3 rrtOdtFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }

  vec3 toneMapACES(vec3 c) {
    const mat3 inM = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 outM = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    return clamp(outM * rrtOdtFit(inM * (max(c, vec3(0.0)) * 1.22)), 0.0, 1.0);
  }

  vec3 linearToSRGB(vec3 c) {
    return mix(
      c * 12.92,
      1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
      step(vec3(0.0031308), c)
    );
  }

  vec3 computeSolarLensFlare(vec2 uv, vec2 sunUv, float vis) {
    vec2 asp = vec2(uAspect, 1.0);
    vec2 p = (uv - 0.5) * asp;
    vec2 s = (sunUv - 0.5) * asp;
    vec2 dv = p - s;
    float r = length(dv);

    float ang = atan(dv.y, dv.x);
    float spikes = pow(abs(cos(ang * 3.0 + 0.35)), 26.0) + 0.55 * pow(abs(cos(ang * 4.0 - 0.9)), 38.0);
    vec3 glare = uSunCol * (0.015 / (r * r * 10.0 + 0.012) + 0.085 * exp(-r * 3.4));
    glare += uSunCol * spikes * 0.24 * exp(-r * 5.8);

    // Subtle multi-coated optical ghosts along center axis
    vec3 ghosts = vec3(0.0);
    ghosts += vec3(0.32, 0.82, 0.72) * smoothstep(0.08, 0.045, length(p + s * 0.42)) * 0.045;
    ghosts += vec3(0.95, 0.56, 0.30) * smoothstep(0.045, 0.024, length(p + s * 0.86)) * 0.065;
    ghosts += vec3(0.45, 0.62, 1.00) * smoothstep(0.15, 0.095, length(p + s * 1.32)) * 0.038;

    return (glare + ghosts * uSunCol * 1.8) * vis;
  }

  void main() {
    vec2 centered = vUv - 0.5;
    float r2 = dot(centered * vec2(uAspect, 1.0), centered * vec2(uAspect, 1.0)) /
               max(0.25 * (uAspect * uAspect + 1.0), 0.1);

    // Subtle edge chromatic dispersion
    vec2 caOff = centered * r2 * uCA;
    vec3 col = vec3(
      texture2D(tScene, vUv + caOff).r,
      texture2D(tScene, vUv).g,
      texture2D(tScene, vUv - caOff).b
    );

    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 dirt = texture2D(tDirt, vUv).rgb;
    col += bloom * uBloomStrength;
    col += bloom * dirt * uDirtStrength;
    col += texture2D(tStreak, vUv).rgb * vec3(0.55, 0.78, 1.0) * uStreakStrength;

    vec4 adapt = texture2D(tAdapt, vec2(0.5));
    float sunVis = adapt.g;
    if (sunVis > 0.002 && uFlareStrength > 0.001) {
      vec3 fl = computeSolarLensFlare(vUv, uSunUv, sunVis) * uFlareStrength;
      col += fl * (1.0 + dirt * 1.4);
    }

    // Gentle auto-exposure bounded tightly around golden desert key so look stays vibrant
    float avgLum = max(adapt.r, 0.08);
    float autoGain = clamp(pow(0.34 / avgLum, 0.32), 0.84, 1.24);
    col *= uBaseExposure * autoGain;

    // Hybrid ACES + AgX filmic tone mapping (crisp contrast + smooth sky/flame highlight roll-off)
    col = mix(toneMapACES(col), toneMapAgX(col), uAgxMix);

    // Split-tone cinematic color grade: cool sapphire-teal shadows, warm golden-cream highlights
    float l = luma(col);
    vec3 shadowTint = vec3(0.92, 0.99, 1.07);
    vec3 highTint   = vec3(1.04, 1.00, 0.95);
    col *= mix(shadowTint, highTint, smoothstep(0.06, 0.62, l));

    // Gentle filmic S-curve + saturation lift
    col = mix(col, col * col * (3.0 - 2.0 * col), 0.14);
    l = luma(col);
    col = mix(vec3(l), col, uSaturation);

    // Soft natural lens vignette
    float vig = smoothstep(0.18, 1.08, r2);
    col *= 1.0 - uVignette * vig * vig;

    vec3 srgb = linearToSRGB(clamp(col, 0.0, 1.0));
    gl_FragColor = vec4(srgb, dot(srgb, vec3(0.299, 0.587, 0.114)));
  }
`;

const FINAL_SHARPEN_FXAA_FRAG = `
  ${COMMON_GLSL}
  uniform sampler2D tLdr;
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uSharpen;
  uniform float uGrain;
  uniform float uFxaaOn;

  void main() {
    vec4 M  = texture2D(tLdr, vUv);
    vec4 NW = texture2D(tLdr, vUv + vec2(-1.0, -1.0) * uTexel);
    vec4 NE = texture2D(tLdr, vUv + vec2( 1.0, -1.0) * uTexel);
    vec4 SW = texture2D(tLdr, vUv + vec2(-1.0,  1.0) * uTexel);
    vec4 SE = texture2D(tLdr, vUv + vec2( 1.0,  1.0) * uTexel);

    vec3 col = M.rgb;
    float lMin = min(M.a, min(min(NW.a, NE.a), min(SW.a, SE.a)));
    float lMax = max(M.a, max(max(NW.a, NE.a), max(SW.a, SE.a)));
    float contrast = lMax - lMin;

    // Fast luminance-guided FXAA on high-contrast silhouette edges
    if (uFxaaOn > 0.5 && contrast > max(0.0312, lMax * 0.10)) {
      vec2 dir = vec2(-((NW.a + NE.a) - (SW.a + SE.a)), (NW.a + SW.a) - (NE.a + SE.a));
      float dirReduce = max((NW.a + NE.a + SW.a + SE.a) * 0.03125, 0.0078125);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uTexel;

      vec4 A = 0.5 * (
        texture2D(tLdr, vUv + dir * (1.0 / 3.0 - 0.5)) +
        texture2D(tLdr, vUv + dir * (2.0 / 3.0 - 0.5))
      );
      vec4 B = A * 0.5 + 0.25 * (
        texture2D(tLdr, vUv - dir * 0.5) +
        texture2D(tLdr, vUv + dir * 0.5)
      );
      col = (B.a < lMin || B.a > lMax) ? A.rgb : B.rgb;
    }

    // Contrast-aware fine texture unsharp mask (enhances sand grains, rivets & rock crags without ringing!)
    if (uSharpen > 0.001) {
      vec3 blur = (NW.rgb + NE.rgb + SW.rgb + SE.rgb) * 0.25;
      col += (M.rgb - blur) * uSharpen * (1.0 - smoothstep(0.05, 0.24, contrast));
    }

    // Subtle animated film grain + 8-bit gradient anti-banding dither
    if (uGrain > 0.0005) {
      vec2 seed = gl_FragCoord.xy + fract(uTime * vec2(7.13, 3.71)) * vec2(251.3, 167.9);
      float g = hash12(seed) + hash12(seed + 41.7) - 1.0;
      col += g * uGrain * (1.0 - 0.6 * smoothstep(0.3, 0.95, M.a));
    }
    col += (hash12(gl_FragCoord.xy * 1.31 + 7.0) - 0.5) / 255.0;

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

function detectCoarseMobile() {
  if (typeof window === 'undefined') return false;
  const coarse =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  const maxTouch =
    typeof navigator !== 'undefined' && Number(navigator.maxTouchPoints) > 0;
  return Boolean(
    coarse ||
      (('ontouchstart' in window || maxTouch) &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024)
  );
}

export class PostProcessingPipeline {
  constructor(renderer, scene, camera, world = null) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.world = world;

    this.enabled = true;
    this.quality = 'high';
    this.isMobile = detectCoarseMobile();
    this.isWebGL2 = Boolean(renderer.capabilities && renderer.capabilities.isWebGL2);

    this.bloomLevels = 5;
    this.adaptIndex = 0;
    this.frameIndex = 0;
    this._exposureResetPending = false;
    this.dirtBaked = false;

    this._sunProjScratch = new THREE.Vector3();
    this._camPosScratch = new THREE.Vector3();
    this._camDirScratch = new THREE.Vector3();
    this._sunDirNorm = new THREE.Vector3(42, 64, 28).normalize();

    this._initTargetsAndPasses();
  }

  _makeTarget(w, h, { type = THREE.HalfFloatType, filter = THREE.LinearFilter, depthTexture = null, depthBuffer = false } = {}) {
    return new THREE.WebGLRenderTarget(w, h, {
      format: THREE.RGBAFormat,
      type,
      minFilter: filter,
      magFilter: filter,
      depthBuffer,
      stencilBuffer: false,
      depthTexture,
      generateMipmaps: false
    });
  }

  _makePass(name, fragmentShader, uniforms, defines = {}) {
    const mat = new THREE.ShaderMaterial({
      name: `sw-post-${name}`,
      vertexShader: FULLSCREEN_VERT,
      fragmentShader,
      uniforms,
      defines,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    this._materials.push(mat);
    return mat;
  }

  _initTargetsAndPasses() {
    this._materials = [];
    this._targets = [];

    try {
      // Fullscreen triangle (zero diagonal quad seam, 1 vertex fetch faster than PlaneGeometry)
      const triGeo = new THREE.BufferGeometry();
      triGeo.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3)
      );
      triGeo.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2)
      );
      this._fsQuad = new THREE.Mesh(triGeo, null);
      this._fsQuad.frustumCulled = false;
      this._fsScene = new THREE.Scene();
      this._fsScene.add(this._fsQuad);
      this._fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

      const depthTex = new THREE.DepthTexture(4, 4);
      depthTex.type = this.isWebGL2 ? THREE.UnsignedIntType : THREE.UnsignedShortType;
      depthTex.minFilter = THREE.NearestFilter;
      depthTex.magFilter = THREE.NearestFilter;
      this.depthTexture = depthTex;

      const hdrType = THREE.HalfFloatType;
      const ldrType = THREE.UnsignedByteType;

      this.rt = {
        sceneHdr: this._makeTarget(4, 4, {
          type: hdrType,
          filter: THREE.LinearFilter,
          depthBuffer: true,
          depthTexture: depthTex
        }),
        compositedHdr: this._makeTarget(4, 4, { type: hdrType, filter: THREE.LinearFilter }),
        depthHalf: this._makeTarget(2, 2, { type: ldrType, filter: THREE.NearestFilter }),
        aoA: this._makeTarget(2, 2, { type: ldrType, filter: THREE.LinearFilter }),
        aoB: this._makeTarget(2, 2, { type: ldrType, filter: THREE.LinearFilter }),
        volA: this._makeTarget(2, 2, { type: hdrType, filter: THREE.LinearFilter }),
        volB: this._makeTarget(2, 2, { type: hdrType, filter: THREE.LinearFilter }),
        bloomDown: [],
        bloomUp: [],
        streakA: this._makeTarget(2, 2, { type: hdrType, filter: THREE.LinearFilter }),
        streakB: this._makeTarget(2, 2, { type: hdrType, filter: THREE.LinearFilter }),
        adapt: [
          this._makeTarget(1, 1, { type: hdrType, filter: THREE.NearestFilter }),
          this._makeTarget(1, 1, { type: hdrType, filter: THREE.NearestFilter })
        ],
        dirt: this._makeTarget(384, 216, { type: ldrType, filter: THREE.LinearFilter }),
        ldr: this._makeTarget(4, 4, { type: ldrType, filter: THREE.LinearFilter })
      };

      for (let i = 0; i < this.bloomLevels; i++) {
        this.rt.bloomDown.push(this._makeTarget(2, 2, { type: hdrType, filter: THREE.LinearFilter }));
        if (i < this.bloomLevels - 1) {
          this.rt.bloomUp.push(this._makeTarget(2, 2, { type: hdrType, filter: THREE.LinearFilter }));
        }
      }

      this.passes = {
        depthHalf: this._makePass('depth-half', DEPTH_HALF_FRAG, {
          tDepth: { value: depthTex },
          uFullTexel: { value: new THREE.Vector2(1 / 4, 1 / 4) },
          uNear: { value: 0.2 },
          uFar: { value: 450 }
        }),
        ssao: this._makePass(
          'ssao',
          SSAO_FRAG,
          {
            tDepthHalf: { value: this.rt.depthHalf.texture },
            uFar: { value: 450 },
            uTanHalf: { value: new THREE.Vector2(1, 1) },
            uTexel: { value: new THREE.Vector2(1, 1) },
            uRadius: { value: 1.15 },
            uIntensity: { value: 1.55 },
            uAspect: { value: 1.77 }
          },
          { AO_TAPS: 12 }
        ),
        volumetric: this._makePass(
          'volumetric',
          VOLUMETRIC_FRAG,
          {
            tDepthHalf: { value: this.rt.depthHalf.texture },
            tShadow: { value: null },
            uHasShadow: { value: 0 },
            uShadowMatrix: { value: new THREE.Matrix4() },
            uCamWorld: { value: new THREE.Matrix4() },
            uCamPos: { value: new THREE.Vector3() },
            uPlaneBaseY: { value: 0 },
            uTanHalf: { value: new THREE.Vector2(1, 1) },
            uSunDir: { value: this._sunDirNorm.clone() },
            uSunColor: { value: new THREE.Color('#ffd89c') },
            uHorizonSun: { value: new THREE.Color('#ffbe78') },
            uHorizonAway: { value: new THREE.Color('#6e7399') },
            uFarZ: { value: 450 },
            uMaxDist: { value: 115 },
            uSigma: { value: 0.0028 },
            uSpaceBlend: { value: 0 },
            uNightFactor: { value: 0 }
          },
          { VOL_STEPS: 12 }
        ),
        blur: this._makePass('bilateral-blur', BILATERAL_BLUR_FRAG, {
          tSrc: { value: null },
          tDepthHalf: { value: this.rt.depthHalf.texture },
          uFar: { value: 450 },
          uDir: { value: new THREE.Vector2() },
          uDepthTol: { value: 0.06 }
        }),
        composite: this._makePass('composite', COMPOSITE_AO_VOL_FRAG, {
          tColor: { value: this.rt.sceneHdr.texture },
          tDepth: { value: depthTex },
          tDepthHalf: { value: this.rt.depthHalf.texture },
          tAO: { value: this.rt.aoA.texture },
          tVol: { value: this.rt.volA.texture },
          uHalfRes: { value: new THREE.Vector2(2, 2) },
          uNear: { value: 0.2 },
          uFar: { value: 450 },
          uAoOn: { value: 1 },
          uVolOn: { value: 1 },
          uAoStrength: { value: 0.92 }
        }),
        bloomDown: this._makePass('bloom-down', BLOOM_DOWN_FRAG, {
          tSrc: { value: null },
          uTexel: { value: new THREE.Vector2() },
          uFirst: { value: 1 },
          uThreshold: { value: 1.08 }
        }),
        bloomUp: this._makePass('bloom-up', BLOOM_UP_FRAG, {
          tLow: { value: null },
          tHigh: { value: null },
          uTexel: { value: new THREE.Vector2() },
          uRadiusMix: { value: 0.68 }
        }),
        streak: this._makePass('streak', ANAMORPHIC_STREAK_FRAG, {
          tSrc: { value: null },
          uStep: { value: new THREE.Vector2() },
          uFirstPass: { value: 1 }
        }),
        adapt: this._makePass('adapt', ADAPT_EXPOSURE_FRAG, {
          tPrev: { value: this.rt.adapt[0].texture },
          tScene: { value: this.rt.compositedHdr.texture },
          tDepth: { value: depthTex },
          uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
          uSunOn: { value: 0 },
          uAspect: { value: 1.77 },
          uRate: { value: 0.05 },
          uVisRate: { value: 0.25 }
        }),
        dirt: this._makePass('lens-dirt', LENS_DIRT_FRAG, {
          uAspect: { value: 16 / 9 }
        }),
        grade: this._makePass('grade', CINEMATIC_GRADE_FRAG, {
          tScene: { value: this.rt.compositedHdr.texture },
          tBloom: { value: this.rt.bloomUp[0].texture },
          tStreak: { value: this.rt.streakB.texture },
          tDirt: { value: this.rt.dirt.texture },
          tAdapt: { value: this.rt.adapt[0].texture },
          uAspect: { value: 1.77 },
          uBloomStrength: { value: 0.30 },
          uStreakStrength: { value: 0.045 },
          uDirtStrength: { value: 0.12 },
          uFlareStrength: { value: 0.22 },
          uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
          uSunCol: { value: new THREE.Color('#ffe8ba') },
          uBaseExposure: { value: 1.04 },
          uAgxMix: { value: 0.34 },
          uVignette: { value: 0.26 },
          uSaturation: { value: 1.10 },
          uCA: { value: 0.0011 }
        }),
        final: this._makePass('final', FINAL_SHARPEN_FXAA_FRAG, {
          tLdr: { value: this.rt.ldr.texture },
          uTexel: { value: new THREE.Vector2() },
          uTime: { value: 0 },
          uSharpen: { value: 0.28 },
          uGrain: { value: 0.014 },
          uFxaaOn: { value: 1 }
        })
      };

      const w = Math.max(2, window.innerWidth);
      const h = Math.max(2, window.innerHeight);
      this.resize(w, h, this.renderer.getPixelRatio() || 1);
      this.setQuality(this.quality);
    } catch (err) {
      console.warn('[PostProcessing] fallback to direct forward rendering:', err);
      this.enabled = false;
      this.rt = null;
    }
  }

  _blit(passMat, target) {
    this._fsQuad.material = passMat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this._fsScene, this._fsCam);
  }

  resetExposure() {
    this._exposureResetPending = true;
  }

  setQuality(quality) {
    this.quality = quality;
    this.isMobile = detectCoarseMobile();
    if (!this.rt) return;

    if (quality === 'low') {
      this.enabled = false;
      return;
    }

    if (quality === 'medium' && this.isMobile) {
      // Mobile Balanced mode: render directly to hardware Tile MSAA + ACES backbuffer for cool 60 FPS
      this.enabled = false;
      return;
    }

    this.enabled = true;

    const aoTaps = quality === 'ultra' ? 16 : 12;
    const volSteps = quality === 'ultra' ? 16 : quality === 'high' ? 12 : 8;

    if (this.passes.ssao.defines.AO_TAPS !== aoTaps) {
      this.passes.ssao.defines.AO_TAPS = aoTaps;
      this.passes.ssao.needsUpdate = true;
    }
    if (this.passes.volumetric.defines.VOL_STEPS !== volSteps) {
      this.passes.volumetric.defines.VOL_STEPS = volSteps;
      this.passes.volumetric.needsUpdate = true;
    }

    this._aoEnabled = quality === 'high' || quality === 'ultra';
    this._volEnabled = !this.isMobile && (quality === 'high' || quality === 'ultra');
    // The anamorphic pass is a horizontal bloom blur. On coarse/mobile
    // compositors it aliases into visible scanline-like bands while the
    // camera or player is moving, especially over the high-contrast sand
    // floor. Keep the cinematic streak on desktop, but route mobile High /
    // Ultra through the clean grade path so bright objects retain bloom
    // without producing motion-locked horizontal bands.
    this._streakEnabled = !this.isMobile && (quality === 'high' || quality === 'ultra');

    this.passes.grade.uniforms.uFlareStrength.value =
      quality === 'ultra' ? 0.22 : quality === 'high' ? 0.18 : 0.08;
    this.passes.final.uniforms.uSharpen.value =
      quality === 'ultra' ? 0.24 : quality === 'high' ? 0.22 : 0.15;
  }

  resize(width, height, pixelRatio = this.renderer.getPixelRatio() || 1) {
    if (!this.rt) return;
    this.isMobile = detectCoarseMobile();

    const dpr = Math.max(1, Number(pixelRatio) || 1);
    // Force exact even dimensions so half-res SSAO/Volumetric buffers maintain an exact 1:2 texel ratio (zero Moiré beat bands!)
    const effW = Math.max(8, Math.round((width * dpr) * 0.5) * 2);
    const effH = Math.max(8, Math.round((height * dpr) * 0.5) * 2);
    const hw = Math.max(4, effW >> 1);
    const hh = Math.max(4, effH >> 1);

    if (this._effW === effW && this._effH === effH) return;
    this._effW = effW;
    this._effH = effH;
    this._hw = hw;
    this._hh = hh;

    this.rt.sceneHdr.setSize(effW, effH);
    this.rt.compositedHdr.setSize(effW, effH);
    this.rt.ldr.setSize(effW, effH);

    this.rt.depthHalf.setSize(hw, hh);
    this.rt.aoA.setSize(hw, hh);
    this.rt.aoB.setSize(hw, hh);
    this.rt.volA.setSize(hw, hh);
    this.rt.volB.setSize(hw, hh);

    let bw = hw;
    let bh = hh;
    for (let i = 0; i < this.bloomLevels; i++) {
      this.rt.bloomDown[i].setSize(bw, bh);
      if (i < this.bloomLevels - 1) {
        this.rt.bloomUp[i].setSize(bw, bh);
      }
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }

    const sw = this.rt.bloomDown[2].width;
    const sh = this.rt.bloomDown[2].height;
    this.rt.streakA.setSize(sw, sh);
    this.rt.streakB.setSize(sw, sh);
  }

  render(dt = 0.016, elapsed = 0) {
    if (!this.enabled || !this.rt) {
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.02;
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.frameIndex++;
    const prevTone = this.renderer.toneMapping;
    const prevExp = this.renderer.toneMappingExposure;

    try {
      if (!this.dirtBaked) {
        this.passes.dirt.uniforms.uAspect.value = this._effW / Math.max(1, this._effH);
        this._blit(this.passes.dirt, this.rt.dirt);
        this.dirtBaked = true;
      }

      // 1. Render linear untonemapped HDR scene + hardware DepthTexture
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.renderer.toneMappingExposure = 1.0;
      this.renderer.setRenderTarget(this.rt.sceneHdr);
      this.renderer.clear(true, true, false);
      this.renderer.render(this.scene, this.camera);

      const proj = this.camera.projectionMatrix.elements;
      const tanHalfX = 1.0 / Math.max(proj[0], 1e-4);
      const tanHalfY = 1.0 / Math.max(proj[5], 1e-4);
      const aspect = tanHalfX / Math.max(tanHalfY, 1e-4);
      const halfTexelX = 1.0 / this._hw;
      const halfTexelY = 1.0 / this._hh;

      // 2. Downsample linear depth
      this.passes.depthHalf.uniforms.uFullTexel.value.set(1.0 / this._effW, 1.0 / this._effH);
      this.passes.depthHalf.uniforms.uNear.value = this.camera.near;
      this.passes.depthHalf.uniforms.uFar.value = this.camera.far;
      this._blit(this.passes.depthHalf, this.rt.depthHalf);

      // 3. Half-resolution SSAO + separable depth-aware bilateral blur
      if (this._aoEnabled) {
        const ssaoU = this.passes.ssao.uniforms;
        ssaoU.uFar.value = this.camera.far;
        ssaoU.uTanHalf.value.set(tanHalfX, tanHalfY);
        ssaoU.uTexel.value.set(halfTexelX, halfTexelY);
        ssaoU.uAspect.value = aspect;
        this._blit(this.passes.ssao, this.rt.aoA);

        const blurU = this.passes.blur.uniforms;
        blurU.uFar.value = this.camera.far;
        blurU.uDepthTol.value = 0.045;
        blurU.tSrc.value = this.rt.aoA.texture;
        blurU.uDir.value.set(halfTexelX, 0);
        this._blit(this.passes.blur, this.rt.aoB);

        blurU.tSrc.value = this.rt.aoB.texture;
        blurU.uDir.value.set(0, halfTexelY);
        this._blit(this.passes.blur, this.rt.aoA);
      }

      // 4. Half-resolution Volumetric God-Rays & Direction-Aware Aerial Perspective
      const skyU = this.world && this.world.skyDome ? this.world.skyDome.uniforms : null;
      const spaceBlend = skyU ? skyU.uSpaceBlend.value : 0;

      if (this._volEnabled) {
        const volU = this.passes.volumetric.uniforms;
        const sunLight = this.world ? this.world.sunLight : null;
        const shadowTex =
          sunLight && sunLight.castShadow && sunLight.shadow && sunLight.shadow.map
            ? sunLight.shadow.map.texture
            : null;

        volU.tShadow.value = shadowTex;
        volU.uHasShadow.value = shadowTex ? 1.0 : 0.0;
        if (shadowTex) {
          volU.uShadowMatrix.value.copy(sunLight.shadow.matrix);
        }

        this.camera.updateMatrixWorld();
        volU.uCamWorld.value.copy(this.camera.matrixWorld);
        volU.uCamPos.value.setFromMatrixPosition(this.camera.matrixWorld);
        volU.uPlaneBaseY.value =
          this.planeBaseY !== undefined
            ? this.planeBaseY
            : volU.uCamPos.value.y > 200.0
              ? 420.0
              : 0.0;
        volU.uTanHalf.value.set(tanHalfX, tanHalfY);
        volU.uFarZ.value = this.camera.far;
        volU.uSpaceBlend.value = spaceBlend;
        volU.uNightFactor.value = skyU ? skyU.uNightFactor.value : 0;

        if (skyU) {
          volU.uHorizonSun.value.copy(skyU.uHorizonColor.value);
          volU.uHorizonAway.value.copy(skyU.uHorizonAway.value);
        }

        this._blit(this.passes.volumetric, this.rt.volA);

        const blurU = this.passes.blur.uniforms;
        blurU.uFar.value = this.camera.far;
        blurU.uDepthTol.value = 0.25;
        blurU.tSrc.value = this.rt.volA.texture;
        blurU.uDir.value.set(halfTexelX, 0);
        this._blit(this.passes.blur, this.rt.volB);

        blurU.tSrc.value = this.rt.volB.texture;
        blurU.uDir.value.set(0, halfTexelY);
        this._blit(this.passes.blur, this.rt.volA);
      }

      // 5. Bilateral Composite of SSAO + Volumetric Scattering onto HDR Scene
      const compU = this.passes.composite.uniforms;
      compU.uHalfRes.value.set(this._hw, this._hh);
      compU.uNear.value = this.camera.near;
      compU.uFar.value = this.camera.far;
      compU.uAoOn.value = this._aoEnabled ? 1.0 : 0.0;
      compU.uVolOn.value = this._volEnabled ? 1.0 : 0.0;
      this._blit(this.passes.composite, this.rt.compositedHdr);

      // 6. 5-Level Dual-Filter Karis Bloom Pyramid + Anamorphic Horizontal Streak
      let srcTex = this.rt.compositedHdr.texture;
      let srcW = this._effW;
      let srcH = this._effH;
      for (let i = 0; i < this.bloomLevels; i++) {
        this.passes.bloomDown.uniforms.tSrc.value = srcTex;
        this.passes.bloomDown.uniforms.uTexel.value.set(1 / srcW, 1 / srcH);
        this.passes.bloomDown.uniforms.uFirst.value = i === 0 ? 1.0 : 0.0;
        this._blit(this.passes.bloomDown, this.rt.bloomDown[i]);
        srcTex = this.rt.bloomDown[i].texture;
        srcW = this.rt.bloomDown[i].width;
        srcH = this.rt.bloomDown[i].height;
      }

      let lowRT = this.rt.bloomDown[this.bloomLevels - 1];
      for (let i = this.bloomLevels - 2; i >= 0; i--) {
        this.passes.bloomUp.uniforms.tLow.value = lowRT.texture;
        this.passes.bloomUp.uniforms.tHigh.value = this.rt.bloomDown[i].texture;
        this.passes.bloomUp.uniforms.uTexel.value.set(1 / lowRT.width, 1 / lowRT.height);
        this._blit(this.passes.bloomUp, this.rt.bloomUp[i]);
        lowRT = this.rt.bloomUp[i];
      }

      if (this._streakEnabled) {
        const stTexelX = 1.0 / Math.max(1, this.rt.streakA.width);
        const stTexelY = 1.0 / Math.max(1, this.rt.streakA.height);
        this.passes.streak.uniforms.tSrc.value = this.rt.bloomDown[2].texture;
        this.passes.streak.uniforms.uFirstPass.value = 1.0;
        this.passes.streak.uniforms.uStep.value.set(stTexelX * 1.35, stTexelY);
        this._blit(this.passes.streak, this.rt.streakA);

        this.passes.streak.uniforms.tSrc.value = this.rt.streakA.texture;
        this.passes.streak.uniforms.uFirstPass.value = 0.0;
        this.passes.streak.uniforms.uStep.value.set(stTexelX * 3.4, 0);
        this._blit(this.passes.streak, this.rt.streakB);
      }

      // 7. Temporal Auto-Exposure & Depth-Occluded Solar Glare Check
      this._camPosScratch.setFromMatrixPosition(this.camera.matrixWorld);
      this._sunProjScratch
        .copy(this._sunDirNorm)
        .multiplyScalar(400)
        .add(this._camPosScratch)
        .project(this.camera);
      this.camera.getWorldDirection(this._camDirScratch);

      const facingSun = this._camDirScratch.dot(this._sunDirNorm) > 0.06;
      const sunScreenEdge = Math.max(
        Math.abs(this._sunProjScratch.x),
        Math.abs(this._sunProjScratch.y)
      );
      const sunOn =
        facingSun && spaceBlend < 0.85
          ? (1.0 - clamp01((sunScreenEdge - 0.95) / 0.35)) * (1.0 - spaceBlend)
          : 0.0;
      const sunUvX = this._sunProjScratch.x * 0.5 + 0.5;
      const sunUvY = this._sunProjScratch.y * 0.5 + 0.5;

      const prevAdapt = this.rt.adapt[this.adaptIndex];
      const nextAdapt = this.rt.adapt[1 - this.adaptIndex];
      const adaptU = this.passes.adapt.uniforms;
      adaptU.tPrev.value = prevAdapt.texture;
      adaptU.tScene.value = this.rt.bloomDown[this.bloomLevels - 1].texture;
      adaptU.uSunUv.value.set(sunUvX, sunUvY);
      adaptU.uSunOn.value = sunOn;
      adaptU.uAspect.value = aspect;
      const firstFrames = this.frameIndex <= 2 || this._exposureResetPending;
      adaptU.uRate.value = firstFrames ? 1.0 : 1.0 - Math.exp(-dt / 1.25);
      adaptU.uVisRate.value = firstFrames ? 1.0 : 1.0 - Math.exp(-dt / 0.12);
      this._blit(this.passes.adapt, nextAdapt);
      this._exposureResetPending = false;
      this.adaptIndex = 1 - this.adaptIndex;

      // 8. ACES + AgX Hybrid Tone Mapping, Lens Glare & Cinematic Split-Tone Grade -> LDR
      const gradeU = this.passes.grade.uniforms;
      gradeU.tAdapt.value = nextAdapt.texture;
      gradeU.uAspect.value = aspect;
      gradeU.uSunUv.value.set(sunUvX, sunUvY);
      gradeU.uStreakStrength.value = this._streakEnabled ? 0.024 : 0.0;
      this._blit(this.passes.grade, this.rt.ldr);

      // 9. Contrast-Aware Fine Detail Unsharp Mask + Luminance FXAA + Film Grain -> Screen
      const finalU = this.passes.final.uniforms;
      finalU.uTexel.value.set(1 / this._effW, 1 / this._effH);
      finalU.uTime.value = elapsed;
      this._blit(this.passes.final, null);
    } finally {
      this.renderer.toneMapping = prevTone;
      this.renderer.toneMappingExposure = prevExp;
      this.renderer.setRenderTarget(null);
    }
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
