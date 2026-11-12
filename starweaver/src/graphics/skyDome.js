import * as THREE from 'three';

/**
 * Procedural GLSL Sky Dome with atmospheric scattering gradient, high-altitude cirrostratus clouds,
 * twin alien suns with soft corona halos, and horizon haze transition.
 */
export function createSkyDome() {
  const group = new THREE.Group();
  group.name = 'atmospheric-sky';

  const uniforms = {
    uTime: { value: 0 },
    uZenithColor: { value: new THREE.Color('#2b5c94') },
    uMidSkyColor: { value: new THREE.Color('#7ca3c4') },
    uHorizonColor: { value: new THREE.Color('#f5bd86') },
    uGroundHaze: { value: new THREE.Color('#d99362') },
    uSunDir: { value: new THREE.Vector3(42, 64, 28).normalize() },
    uCloudTint: { value: new THREE.Color('#fff1dc') },
    uSpaceBlend: { value: 0.0 } // 0 = planet atmosphere, 1 = deep starry space during liftoff!
  };

  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform float uTime;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uGroundHaze;
      uniform vec3 uSunDir;
      uniform vec3 uCloudTint;
      uniform float uSpaceBlend;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.04;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 d = normalize(vDir);
        float y = clamp(d.y, -1.0, 1.0);

        // Multi-band atmospheric sky gradient
        vec3 atmo;
        if (y >= 0.0) {
          vec3 lowMix = mix(uHorizonColor, uMidSkyColor, smoothstep(0.0, 0.28, y));
          atmo = mix(lowMix, uZenithColor, smoothstep(0.22, 0.88, y));
        } else {
          atmo = mix(uHorizonColor, uGroundHaze, smoothstep(0.0, 0.35, -y));
        }

        // Solar Mie scattering glow around primary sun
        float sunCos = max(dot(d, normalize(uSunDir)), 0.0);
        atmo += vec3(1.0, 0.84, 0.58) * pow(sunCos, 8.0) * 0.32;
        atmo += vec3(1.0, 0.96, 0.86) * smoothstep(0.9965, 0.9994, sunCos) * 2.2;

        // Soft drifting high-altitude wispy clouds
        if (y > 0.04 && uSpaceBlend < 0.95) {
          vec2 cloudUv = d.xz / (y + 0.18) * 1.35 + vec2(uTime * 0.008, uTime * 0.003);
          float c = fbm(cloudUv);
          float cloudMask = smoothstep(0.54, 0.82, c) * smoothstep(0.04, 0.26, y) * (1.0 - uSpaceBlend);
          atmo = mix(atmo, uCloudTint, cloudMask * 0.42);
        }

        // Deep space starfield blend for Act 2 orbital ascent
        vec3 deepSpace = vec3(0.02, 0.04, 0.10);
        float starCell = hash(floor(d.xy * 260.0 + d.z * 190.0));
        float star = step(0.996, starCell) * (0.6 + 0.4 * sin(uTime * 3.0 + starCell * 90.0));
        deepSpace += vec3(0.85, 0.92, 1.0) * star * 1.6;

        vec3 finalCol = mix(atmo, deepSpace, clamp(uSpaceBlend, 0.0, 1.0));
        gl_FragColor = vec4(finalCol, 1.0);
      }
    `
  });

  const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(280, 40, 28), skyMat);
  group.add(domeMesh);

  function setMode(mode, spaceBlend = 0) {
    uniforms.uSpaceBlend.value = spaceBlend;
    if (mode === 'homeworld') {
      uniforms.uZenithColor.value.set('#1f7ae0');
      uniforms.uMidSkyColor.value.set('#68c2ff');
      uniforms.uHorizonColor.value.set('#ccf4ff');
      uniforms.uGroundHaze.value.set('#7be0a0');
      uniforms.uCloudTint.value.set('#ffffff');
    } else {
      uniforms.uZenithColor.value.set('#2b5c94');
      uniforms.uMidSkyColor.value.set('#7ca3c4');
      uniforms.uHorizonColor.value.set('#f5bd86');
      uniforms.uGroundHaze.value.set('#d99362');
      uniforms.uCloudTint.value.set('#fff1dc');
    }
  }

  return { group, uniforms, setMode };
}
