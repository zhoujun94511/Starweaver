import * as THREE from 'three';

/**
 * Next-Gen Procedural HDR Atmospheric Sky, Milky Way Starfield, Analytical Ringed Gas-Giant Planet & Dynamic Weather Clouds.
 * Features:
 * - Dynamic Day <-> Twilight <-> Starry Milky Way Night transition (`uNightFactor`: 0..1)
 * - Analytical Ray-Traced Colossal Ringed Gas-Giant Neighbor (`Kharis Prime`) with turbulent bands,
 *   Cassini ring divisions, planet-on-ring umbra shadow, and daytime atmospheric veiling!
 * - Weather-driven cloud deck (`uCloudCoverage`: Clear -> Overcast) & amber sandstorm veil (`uDustVeil`: 0..1)
 * - Seamless `uEnv` clamp mode for firefly-free Day & Night PMREM IBL environment baking
 * - Seamless `uSpaceBlend` transition to deep orbital space during Act 2 launch ascent
 */
export const SKY_PALETTES = {
  desert: {
    zenith: '#183b6b',
    midSky: '#4f7ea8',
    horizonSun: '#ffbe78',
    horizonAway: '#6e7399',
    groundHaze: '#b8683c',
    sunColor: '#fff0cf',
    cloudCool: '#4d607d',
    cloudDark: '#26324a'
  },
  homeworld: {
    zenith: '#125bc7',
    midSky: '#4ea8f5',
    horizonSun: '#d8f6ff',
    horizonAway: '#7eb8eb',
    groundHaze: '#4eb879',
    sunColor: '#fffbe8',
    cloudCool: '#9ec5e8',
    cloudDark: '#5b84b0'
  }
};

export const KHARIS_PLANET_DIR = new THREE.Vector3(-0.55, 0.22, -0.805).normalize();

export function createSkyDome({ isMobile = false } = {}) {
  const group = new THREE.Group();
  group.name = 'atmospheric-sky';

  const pal = SKY_PALETTES.desert;
  const uniforms = {
    uTime: { value: 0 },
    uEnv: { value: 0 }, // 1.0 when baking into PMREM to suppress sun-disc fireflies
    uNightFactor: { value: 0.0 }, // 0.0 = bright day, 0.5 = twilight, 1.0 = starry galactic night
    uCloudCoverage: { value: 0.48 }, // 0.35 = clear, 0.86 = overcast
    uDustVeil: { value: 0.0 }, // 0.0 = calm, 1.0 = peak desert sandstorm
    uMobileFast: { value: isMobile ? 1.0 : 0.0 },
    uZenithColor: { value: new THREE.Color(pal.zenith) },
    uMidSkyColor: { value: new THREE.Color(pal.midSky) },
    uHorizonColor: { value: new THREE.Color(pal.horizonSun) },
    uHorizonAway: { value: new THREE.Color(pal.horizonAway) },
    uGroundHaze: { value: new THREE.Color(pal.groundHaze) },
    uSunDir: { value: new THREE.Vector3(42, 64, 28).normalize() },
    uTwinDir: { value: new THREE.Vector3(68, 46, 54).normalize() },
    uPlanetDir: { value: KHARIS_PLANET_DIR.clone() },
    uSunColor: { value: new THREE.Color(pal.sunColor) },
    uCloudCool: { value: new THREE.Color(pal.cloudCool) },
    uCloudDark: { value: new THREE.Color(pal.cloudDark) },
    uSpaceBlend: { value: 0.0 },
    uIsHomeworld: { value: 0.0 }
  };

  const skyMat = new THREE.ShaderMaterial({
    name: 'starweaver-hdr-sky',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    depthFunc: THREE.LessEqualDepth,
    fog: false,
    toneMapped: true,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec3 vDir;
      uniform float uTime;
      uniform float uEnv;
      uniform float uNightFactor;
      uniform float uCloudCoverage;
      uniform float uDustVeil;
      uniform float uMobileFast;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uHorizonAway;
      uniform vec3 uGroundHaze;
      uniform vec3 uSunDir;
      uniform vec3 uTwinDir;
      uniform vec3 uPlanetDir;
      uniform vec3 uSunColor;
      uniform vec3 uCloudCool;
      uniform vec3 uCloudDark;
      uniform float uSpaceBlend;
      uniform float uIsHomeworld;

      float hash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm4(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = rot * p * 2.03 + vec2(13.7, 7.3);
          a *= 0.5;
        }
        return v / 0.9375;
      }

      float fbm5(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = rot * p * 2.05 + vec2(5.1, 19.4);
          a *= 0.5;
        }
        return v / 0.96875;
      }

      // Renders Milky Way galactic band + multi-scale twinkling starfield
      vec3 evalGalacticStarfield(vec3 d, float time) {
        vec3 nightBase = mix(vec3(0.012, 0.022, 0.048), vec3(0.005, 0.010, 0.026), clamp(d.y, 0.0, 1.0));

        // Tilted Galactic Plane coordinate frame
        vec3 galUp = normalize(vec3(0.46, 0.74, -0.49));
        vec3 galRight = normalize(cross(galUp, vec3(0.0, 1.0, 0.0)));
        vec3 galFwd = cross(galRight, galUp);

        float galLat = dot(d, galUp);
        float galLon = atan(dot(d, galFwd), dot(d, galRight));
        vec2 galUv = vec2(galLon * 1.65, galLat * 4.2);

        float bandEnvelope = exp(-galLat * galLat * 11.5);
        float neb1 = fbm5(galUv * 1.4 + vec2(2.3, -1.1));
        float neb2 = fbm4(galUv * 3.1 - vec2(4.7, 3.2));
        // Dark interstellar dust lane carving down the spine of the Milky Way
        float dustRift = smoothstep(0.44, 0.74, fbm5(galUv * vec2(2.1, 3.6) + 8.5)) * exp(-galLat * galLat * 38.0);

        vec3 coreCol = mix(vec3(0.14, 0.34, 0.65), vec3(0.68, 0.46, 0.32), smoothstep(-1.2, 1.2, sin(galLon)));
        vec3 rimNeb = vec3(0.08, 0.42, 0.58) * neb2;
        vec3 milkyWay = (coreCol * smoothstep(0.28, 0.82, neb1) * 0.85 + rimNeb * 0.38) * bandEnvelope;
        milkyWay *= 1.0 - dustRift * 0.72;

        // Tier 1: Bright crisp primary stars (octahedral/cubic cell hash avoids polar distortion)
        vec3 cellA = floor(d * 215.0);
        float hA = hash31(cellA);
        vec3 ctrA = normalize(cellA + 0.5);
        float angA = length(d - ctrA) * 215.0;
        float twinkleA = 0.72 + 0.28 * sin(time * (2.2 + hA * 3.5) + hA * 90.0);
        float starA = step(0.9915, hA) * smoothstep(0.48, 0.08, angA) * twinkleA;
        vec3 starTintA = mix(vec3(0.74, 0.88, 1.0), vec3(1.0, 0.84, 0.62), fract(hA * 31.7));

        // Tier 2: Dense fine star-dust concentrated along Milky Way band
        vec3 cellB = floor(d * 420.0);
        float hB = hash31(cellB + 19.3);
        float threshB = mix(0.9965, 0.982, bandEnvelope);
        float starB = step(threshB, hB) * (0.55 + 0.45 * fract(hB * 53.1));

        return nightBase + milkyWay * 0.95 + starTintA * starA * 2.8 + vec3(0.76, 0.86, 1.0) * starB * 0.75;
      }

      // Analytical Ray-Traced Colossal Ringed Gas-Giant ("Kharis Prime") + Tilted Icy Ring System
      // Returns vec4(rgbEmission, occlusionAlpha)
      vec4 evalGiantRingedPlanet(vec3 d, vec3 pCenterDir, vec3 lightDir, float time) {
        if (d.y < -0.05) return vec4(0.0);

        float Rp = 0.175; // ~20 degrees apparent diameter!
        vec3 C = normalize(pCenterDir);

        // 1. Ray-Sphere intersection: |t*d - C|^2 = Rp^2
        float b = dot(d, C);
        float c = dot(C, C) - Rp * Rp;
        float disc = b * b - c;
        bool hitPlanet = false;
        float tPlanet = 1e9;
        vec3 pHit = vec3(0.0);
        vec3 pNrm = vec3(0.0);

        if (b > 0.0 && disc > 0.0) {
          tPlanet = b - sqrt(disc);
          hitPlanet = true;
          pHit = d * tPlanet;
          pNrm = normalize(pHit - C);
        }

        // 2. Tilted Planetary Ring Plane intersection: dot(t*d - C, ringN) = 0
        vec3 ringN = normalize(vec3(0.32, 0.86, -0.39));
        vec3 ringX = normalize(cross(ringN, vec3(0.0, 0.0, 1.0)));
        vec3 ringZ = cross(ringX, ringN);

        float denom = dot(d, ringN);
        bool hitRing = false;
        float tRing = 1e9;
        vec3 ringCol = vec3(0.0);
        float ringAlpha = 0.0;

        if (abs(denom) > 1e-4) {
          float tr = dot(C, ringN) / denom;
          if (tr > 0.0) {
            vec3 rPos = d * tr - C;
            float rDist = length(rPos);
            float rInner = Rp * 1.36;
            float rOuter = Rp * 2.48;
            if (rDist >= rInner && rDist <= rOuter) {
              float u = (rDist - rInner) / (rOuter - rInner);
              // Concentric ringlets + sharp Cassini Division gap around u = 0.56..0.64
              float cassini = 1.0 - 0.88 * smoothstep(0.54, 0.57, u) * (1.0 - smoothstep(0.62, 0.65, u));
              float encke = 1.0 - 0.55 * smoothstep(0.84, 0.855, u) * (1.0 - smoothstep(0.865, 0.88, u));
              float fineBands = 0.62 + 0.38 * sin(u * 92.0 + sin(u * 23.0) * 1.5);
              float edgeFade = smoothstep(0.0, 0.06, u) * (1.0 - smoothstep(0.92, 1.0, u));

              ringAlpha = clamp(edgeFade * cassini * encke * fineBands * 0.82, 0.0, 0.90);

              // Cylindrical umbra shadow of the gas giant cast onto the back of the rings!
              float alongL = dot(rPos, lightDir);
              vec3 perpL = rPos - lightDir * alongL;
              float planetUmbra = alongL < 0.0 ? smoothstep(Rp * 0.94, Rp * 1.05, length(perpL)) : 1.0;

              vec3 innerTint = vec3(0.95, 0.82, 0.66);
              vec3 outerTint = vec3(0.68, 0.85, 0.98);
              vec3 baseRing = mix(innerTint, outerTint, smoothstep(0.15, 0.85, u));
              baseRing *= 0.85 + 0.15 * sin(u * 190.0);

              ringCol = baseRing * (0.06 + 0.94 * planetUmbra);
              hitRing = ringAlpha > 0.005;
              tRing = tr;
            }
          }
        }

        if (!hitPlanet && !hitRing) return vec4(0.0);

        vec3 planetCol = vec3(0.0);
        if (hitPlanet) {
          // Local planetary latitude & longitude for swirling Jovian cloud belts
          float lat = dot(pNrm, ringN);
          float lon = atan(dot(pNrm, ringZ), dot(pNrm, ringX)) + time * 0.005;
          float turb = fbm4(vec2(lon * 2.4, lat * 6.5) + vec2(time * 0.002, 0.0));
          float bandPhase = lat * 13.5 + (turb - 0.5) * 1.65;

          vec3 beltCream = vec3(0.92, 0.80, 0.66);
          vec3 beltOchre = vec3(0.76, 0.46, 0.32);
          vec3 beltAzure = vec3(0.30, 0.52, 0.74);

          vec3 albedo = mix(beltOchre, beltCream, sin(bandPhase) * 0.5 + 0.5);
          albedo = mix(albedo, beltAzure, smoothstep(0.32, 0.82, abs(lat)) * 0.72);

          //Shadow cast by rings onto the planet sphere
          float ringShadow = 1.0;
          float lDenom = dot(lightDir, ringN);
          if (abs(lDenom) > 1e-4) {
            float ts = -dot(pHit - C, ringN) / lDenom;
            if (ts > 0.0) {
              vec3 sHit = (pHit - C) + lightDir * ts;
              float sr = length(sHit);
              if (sr >= Rp * 1.36 && sr <= Rp * 2.48) {
                float su = (sr - Rp * 1.36) / (Rp * 1.12);
                float sCassini = 1.0 - 0.85 * smoothstep(0.54, 0.57, su) * (1.0 - smoothstep(0.62, 0.65, su));
                ringShadow = 1.0 - 0.58 * sCassini;
              }
            }
          }

          float ndl = dot(pNrm, lightDir);
          float diff = smoothstep(-0.08, 0.75, ndl) * ringShadow;
          float limb = 1.0 - clamp(dot(pNrm, -d), 0.0, 1.0);
          // Atmospheric Rayleigh cyan-blue limb rim on sunlit crescent
          vec3 atmoRim = vec3(0.38, 0.76, 1.0) * pow(limb, 3.2) * smoothstep(-0.18, 0.45, ndl) * 0.95;
          // Subtle nightside planet-shine so the dark hemisphere subtly silhouettes the stars
          vec3 nightSide = albedo * 0.018;

          planetCol = albedo * diff * 1.18 + atmoRim + nightSide;
        }

        // Composite Planet Sphere & Rings in exact depth order
        float horizonFade = smoothstep(0.0, 0.09, d.y);
        if (hitPlanet && hitRing) {
          if (tRing < tPlanet) {
            // Front arc of rings passes in front of gas giant!
            vec3 comp = mix(planetCol, ringCol, ringAlpha);
            return vec4(comp * horizonFade, horizonFade);
          } else {
            // Planet body completely occludes back arc of rings!
            return vec4(planetCol * horizonFade, horizonFade);
          }
        } else if (hitPlanet) {
          return vec4(planetCol * horizonFade, horizonFade);
        } else {
          return vec4(ringCol * ringAlpha * horizonFade, ringAlpha * horizonFade);
        }
      }

      void main() {
        vec3 d = normalize(vDir);
        vec3 sunD = normalize(uSunDir);
        vec3 twinD = normalize(uTwinDir);
        float y = clamp(d.y, -1.0, 1.0);
        float h = max(y, 0.0);

        float nightK = clamp(uNightFactor, 0.0, 1.0);
        float dayK = 1.0 - nightK;
        float dustK = clamp(uDustVeil, 0.0, 1.0) * (1.0 - uIsHomeworld) * (1.0 - uSpaceBlend);

        // Azimuthal alignment toward primary sun (0 = opposite horizon, 1 = sunward horizon)
        float azSun = clamp(dot(normalize(d.xz + vec2(1e-5)), normalize(sunD.xz)) * 0.5 + 0.5, 0.0, 1.0);
        float mu = max(dot(d, sunD), 0.0);
        float twinMu = max(dot(d, twinD), 0.0);

        // 1. Daytime & Twilight Atmospheric Scattering
        vec3 horCol = mix(uHorizonAway, uHorizonColor, pow(azSun, 1.55));
        horCol += uSunColor * vec3(1.0, 0.68, 0.34) * pow(azSun, 9.0) * 0.42 * dayK;

        vec3 daySky;
        if (y >= 0.0) {
          vec3 midMix = mix(uMidSkyColor * 0.92, mix(uMidSkyColor, uHorizonColor, 0.42), pow(azSun, 2.4));
          vec3 lowBand = mix(horCol, midMix, smoothstep(0.0, 0.24, h));
          daySky = mix(lowBand, uZenithColor, pow(smoothstep(0.14, 0.92, h), 0.82));
        } else {
          vec3 bounce = mix(uGroundHaze * 0.78, uGroundHaze * 1.18, pow(azSun, 2.0));
          daySky = mix(horCol, bounce, smoothstep(0.0, 0.42, -y));
        }

        // Multi-lobe Mie solar aureole (fades out as sun sets below horizon)
        float sunAbove = smoothstep(-0.08, 0.16, sunD.y);
        daySky += uSunColor * vec3(1.0, 0.85, 0.62) * (
          pow(mu, 7.0) * 0.20 +
          pow(mu, 42.0) * 0.55 +
          pow(mu, 320.0) * 1.65
        ) * sunAbove;

        float kharisMask = (1.0 - uIsHomeworld) * (1.0 - uSpaceBlend);
        float twinAbove = smoothstep(-0.06, 0.16, twinD.y);
        daySky += vec3(1.0, 0.62, 0.44) * (pow(twinMu, 24.0) * 0.18 + pow(twinMu, 260.0) * 0.65) * kharisMask * twinAbove;

        // 2. Nighttime Galactic Milky Way + Colossal Ringed Neighbor Planet
        vec3 nightSky;
        if (y >= 0.0) {
          nightSky = evalGalacticStarfield(d, uTime);
          // Subtle nocturnal horizon airglow
          vec3 nightHor = mix(vec3(0.035, 0.065, 0.13), vec3(0.11, 0.075, 0.14), azSun);
          nightSky = mix(nightHor, nightSky, smoothstep(0.0, 0.22, h));
        } else {
          nightSky = mix(vec3(0.035, 0.065, 0.13), vec3(0.02, 0.025, 0.045), smoothstep(0.0, 0.4, -y));
        }

        vec3 skyCol = mix(daySky, nightSky, nightK);

        // Composite Colossal Ringed Planet (faintly veiled in daytime blue sky, blazing crisp at sunset/night!)
        if ((1.0 - uSpaceBlend) > 0.01 && (kharisMask > 0.01 || nightK > 0.05) && y > -0.02) {
          vec3 planetSunDir = normalize(vec3(0.62, 0.38, 0.68));
          vec4 planet = evalGiantRingedPlanet(d, uPlanetDir, planetSunDir, uTime);
          if (planet.a > 0.001) {
            // In daytime, atmospheric Rayleigh scatter veils the dark side and softens contrast to ~24%
            float dayVis = 0.24 * (1.0 - dustK * 0.85);
            float nightVis = 1.0 - dustK * 0.72;
            vec3 veiledPlanet = daySky + planet.rgb * dayVis;
            vec3 crispPlanet = mix(skyCol, planet.rgb, planet.a);
            skyCol = mix(
              mix(skyCol, veiledPlanet, planet.a),
              crispPlanet,
              smoothstep(0.15, 0.85, nightK) * nightVis
            );
          }
        }

        // 3. Weather-Driven Self-Shadowing Cloud Deck (skip costly cloud FBM when choked by dense sandstorm on mobile!)
        if (y > 0.015 && uSpaceBlend < 0.98 && (uMobileFast < 0.5 || dustK < 0.78)) {
          vec2 cuv = d.xz / (h + 0.13) * vec2(0.72, 1.05);
          float windSpeed = mix(1.0, 3.2, dustK);
          vec2 wind = vec2(0.0075, 0.0028) * uTime * windSpeed;
          vec2 q = cuv + wind;
          float warp = uMobileFast > 0.5 ? noise(q * 0.55 + 4.3) : fbm4(q * 0.48 + 4.3);
          vec2 qq = q + (warp - 0.5) * 1.05;

          float dens = uMobileFast > 0.5 ? fbm4(qq) : fbm5(qq);
          float ridge = uMobileFast > 0.5
            ? 0.5
            : 1.0 - abs(2.0 * fbm4(qq * 2.7 + 8.1) - 1.0);
          dens = dens * 0.84 + (ridge - 0.5) * 0.16 * smoothstep(0.03, 0.28, h);

          float covLow = mix(0.62, 0.24, clamp(uCloudCoverage, 0.0, 1.0));
          float covHigh = mix(0.86, 0.56, clamp(uCloudCoverage, 0.0, 1.0));
          float sunHole = smoothstep(0.92, 0.996, mu) * (1.0 - smoothstep(0.55, 0.9, uCloudCoverage));
          float cov = smoothstep(covLow, covHigh, dens) * (1.0 - 0.82 * sunHole);
          cov *= smoothstep(0.015, 0.16, h) * (1.0 - uSpaceBlend);

          vec2 sunStep = normalize(sunD.xz + vec2(1e-5)) * 0.20;
          float densSun = uMobileFast > 0.5 ? fbm4(qq + sunStep) : fbm5(qq + sunStep);
          float relief = clamp((dens - densSun) * 4.2 + 0.52, 0.0, 1.0);
          float thick = smoothstep(0.45, 0.82, dens);

          vec3 dayCloudBody = mix(uCloudCool, uCloudDark, thick * 0.75) * (0.68 + 0.65 * relief * relief);
          float rim = cov * (1.0 - cov) * 4.0;
          vec3 warmLit = mix(uHorizonColor, uSunColor, 0.55) * (
            (0.28 + 1.15 * relief * relief) * (0.35 + 0.85 * pow(azSun, 3.0)) +
            rim * (0.55 + 1.45 * pow(mu, 4.0))
          ) * sunAbove;
          vec3 dayCloud = dayCloudBody + warmLit * 0.68;

          // Night clouds softly lit from below by planet-light & camp glow, occluding stars behind them
          vec3 nightCloud = mix(vec3(0.025, 0.042, 0.078), vec3(0.065, 0.105, 0.175), relief) * (1.0 - thick * 0.35);
          vec3 cloudCol = mix(dayCloud, nightCloud, nightK);
          vec3 horRef = mix(horCol * 0.95, vec3(0.04, 0.065, 0.12), nightK);
          cloudCol = mix(horRef, cloudCol, smoothstep(0.02, 0.26, h));

          skyCol = mix(skyCol, cloudCol, cov * 0.90);
        }

        // 4. Crisp HDR Solar Discs (attenuated by overcast clouds, duststorm & horizon set)
        float directMask = (1.0 - uEnv) * (1.0 - uSpaceBlend) * (1.0 - dustK * 0.82) * (1.0 - smoothstep(0.6, 0.95, uCloudCoverage) * 0.75);
        float sunDisc = smoothstep(0.99955, 0.99986, mu) * smoothstep(-0.02, 0.05, sunD.y);
        skyCol += uSunColor * sunDisc * 18.0 * directMask;

        float twinDisc = smoothstep(0.99972, 0.99991, twinMu) * smoothstep(-0.02, 0.05, twinD.y);
        skyCol += vec3(1.0, 0.72, 0.55) * twinDisc * 6.5 * directMask * kharisMask;

        // 5. Atmospheric Sandstorm Billowing Dust Wall Veil (fast trig-free 2-tap noise on mobile!)
        if (dustK > 0.005) {
          float stormSwirl;
          if (uMobileFast > 0.5) {
            vec2 sp = d.xz * 2.6 + vec2(-uTime * 0.22, y * 3.8 - uTime * 0.06);
            stormSwirl = noise(sp) * 0.65 + noise(sp * 2.1 + 4.7) * 0.35;
          } else {
            stormSwirl = fbm4(vec2(atan(d.z, d.x) * 3.0 - uTime * 0.18, y * 4.5 - uTime * 0.05));
          }
          vec3 dayDustCol = mix(vec3(0.86, 0.56, 0.32), vec3(0.96, 0.72, 0.46), pow(azSun, 2.0));
          vec3 nightDustCol = vec3(0.14, 0.095, 0.075);
          vec3 stormCol = mix(dayDustCol, nightDustCol, nightK) * (0.86 + 0.24 * stormSwirl);
          float stormHeightMask = mix(1.0, 0.48, smoothstep(0.05, 0.72, h));
          skyCol = mix(skyCol, stormCol, clamp(dustK * stormHeightMask * 0.88, 0.0, 0.92));
        }

        // 6. High-altitude orbital nebula & starfield for Act 2 launch ascent
        vec3 deepSpace = vec3(0.012, 0.024, 0.058);
        if (uSpaceBlend > 0.001) {
          deepSpace = evalGalacticStarfield(d, uTime);
        }

        vec3 finalCol = mix(skyCol, deepSpace, clamp(uSpaceBlend, 0.0, 1.0));
        finalCol = mix(finalCol, min(finalCol, vec3(5.5)), uEnv);
        gl_FragColor = vec4(max(finalCol, vec3(0.0)), 1.0);
      }
    `
  });

  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const domeMesh = new THREE.Mesh(geometry, skyMat);
  domeMesh.name = 'hdr-skybox';
  domeMesh.frustumCulled = false;
  domeMesh.renderOrder = -1000;
  domeMesh.matrixAutoUpdate = false;
  group.add(domeMesh);

  function setMode(mode, spaceBlend = 0) {
    uniforms.uSpaceBlend.value = spaceBlend;
    const p = mode === 'homeworld' ? SKY_PALETTES.homeworld : SKY_PALETTES.desert;
    uniforms.uIsHomeworld.value = mode === 'homeworld' ? 1.0 : 0.0;
    if (mode === 'homeworld') {
      uniforms.uNightFactor.value = 0.0;
      uniforms.uDustVeil.value = 0.0;
      uniforms.uCloudCoverage.value = 0.42;
    }
    uniforms.uZenithColor.value.set(p.zenith);
    uniforms.uMidSkyColor.value.set(p.midSky);
    uniforms.uHorizonColor.value.set(p.horizonSun);
    uniforms.uHorizonAway.value.set(p.horizonAway);
    uniforms.uGroundHaze.value.set(p.groundHaze);
    uniforms.uSunColor.value.set(p.sunColor);
    uniforms.uCloudCool.value.set(p.cloudCool);
    uniforms.uCloudDark.value.set(p.cloudDark);
  }

  return { group, mesh: domeMesh, material: skyMat, geometry, uniforms, setMode };
}
