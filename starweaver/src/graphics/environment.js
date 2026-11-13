import * as THREE from 'three';
import { createSkyDome } from './skyDome.js';

/**
 * Generates zero-runtime-cost static HDR IBL Environment Probes via THREE.PMREMGenerator:
 * 1. `desert` (Daytime golden twin-sun desert sky + cloud relief)
 * 2. `desertNight` (Starry Milky Way + colossal cyan-gold ringed planet + nocturnal rim)
 * 3. `homeworld` (Lush emerald meadow + azure sky)
 *
 * Pre-baking Day & Night probes once at boot completely avoids runtime PMREM regeneration stutters!
 */
export function createPlanetEnvironments(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const desertEnv = bakeAtmosphericProbe(pmrem, 'desert', {
    nightFactor: 0.0,
    keyPos: [31.5, 48.0, 21.0],
    sunColor: new THREE.Color('#fff2d4'),
    sunIntensity: 7.5,
    rimColor: new THREE.Color('#6ee2ff'),
    rimIntensity: 1.55,
    groundBounce: new THREE.Color('#c97848'),
    groundIntensity: 0.92
  });

  const desertNightEnv = bakeAtmosphericProbe(pmrem, 'desert', {
    nightFactor: 1.0,
    keyPos: [-28.0, 34.0, -39.0], // Aligned with Giant Ringed Planet ("Kharis Prime") moonlight!
    sunColor: new THREE.Color('#8ecbff'),
    sunIntensity: 3.4,
    rimColor: new THREE.Color('#ffb870'), // Subtle warm camp/nebula counter-rim
    rimIntensity: 0.85,
    groundBounce: new THREE.Color('#24304a'),
    groundIntensity: 0.65
  });

  const homeworldEnv = bakeAtmosphericProbe(pmrem, 'homeworld', {
    nightFactor: 0.0,
    keyPos: [31.5, 48.0, 21.0],
    sunColor: new THREE.Color('#fffbe8'),
    sunIntensity: 6.8,
    rimColor: new THREE.Color('#9effcf'),
    rimIntensity: 1.55,
    groundBounce: new THREE.Color('#3ca868'),
    groundIntensity: 0.92
  });

  pmrem.dispose();
  return {
    desert: desertEnv.texture,
    desertNight: desertNightEnv.texture,
    homeworld: homeworldEnv.texture
  };
}

function bakeAtmosphericProbe(pmrem, mode, opts) {
  const envScene = new THREE.Scene();

  const sky = createSkyDome();
  sky.setMode(mode, 0);
  sky.uniforms.uEnv.value = 1.0;
  sky.uniforms.uNightFactor.value = opts.nightFactor || 0.0;
  sky.uniforms.uTime.value = 12.4;

  const sphereGeo = new THREE.SphereGeometry(80, 48, 32);
  const skyBakeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: sky.uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: sky.material.fragmentShader
  });
  envScene.add(new THREE.Mesh(sphereGeo, skyBakeMat));

  // Crisp key specular highlight disc (Twin Sun by day, Giant Ringed Planet by night)
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(5.8, 20, 16),
    new THREE.MeshBasicMaterial({
      color: opts.sunColor.clone().multiplyScalar(opts.sunIntensity),
      toneMapped: false
    })
  );
  sunDisc.position.set(opts.keyPos[0], opts.keyPos[1], opts.keyPos[2]);
  envScene.add(sunDisc);

  // Opposite-sky rim reflector card for metallic edge separation
  const coolRim = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 18),
    new THREE.MeshBasicMaterial({
      color: opts.rimColor.clone().multiplyScalar(opts.rimIntensity),
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  coolRim.position.set(-opts.keyPos[0] * 0.9, 20, -opts.keyPos[2] * 0.9);
  coolRim.lookAt(0, 0, 0);
  envScene.add(coolRim);

  // Ground bounce disc
  const groundDisc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({
      color: opts.groundBounce.clone().multiplyScalar(opts.groundIntensity),
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  groundDisc.rotation.x = -Math.PI / 2;
  groundDisc.position.y = -14;
  envScene.add(groundDisc);

  const prevToneMapping = rendererToneSafeSave(pmrem);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 160);
  rendererToneSafeRestore(pmrem, prevToneMapping);

  sphereGeo.dispose();
  skyBakeMat.dispose();
  sky.geometry.dispose();
  sky.material.dispose();
  sunDisc.geometry.dispose();
  sunDisc.material.dispose();
  coolRim.geometry.dispose();
  coolRim.material.dispose();
  groundDisc.geometry.dispose();
  groundDisc.material.dispose();

  return rt;
}

function rendererToneSafeSave(pmrem) {
  const r = pmrem && pmrem._renderer;
  if (!r) return null;
  const prev = r.toneMapping;
  r.toneMapping = THREE.NoToneMapping;
  return prev;
}

function rendererToneSafeRestore(pmrem, prev) {
  const r = pmrem && pmrem._renderer;
  if (r && prev !== null) {
    r.toneMapping = prev;
  }
}
