import * as THREE from 'three';

/**
 * Generates zero-network-asset HDR-like IBL Environment Maps via THREE.PMREMGenerator.
 * Gives metallic & glossy PBR surfaces (Starweaver hull, Milo's clearcoat shell, copper pipes,
 * crystals) rich sky-to-ground reflections instead of flat dark plastic shading.
 */
export function createPlanetEnvironments(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const desertEnv = buildSkyProbe(pmrem, {
    zenith: new THREE.Color('#3b6fa8'),
    horizon: new THREE.Color('#ffcf96'),
    ground: new THREE.Color('#b86b3d'),
    sunColor: new THREE.Color('#fff6dc'),
    sunIntensity: 6.0,
    rimColor: new THREE.Color('#6ce8ff')
  });

  const homeworldEnv = buildSkyProbe(pmrem, {
    zenith: new THREE.Color('#2d8cf0'),
    horizon: new THREE.Color('#b8f0ff'),
    ground: new THREE.Color('#3ca865'),
    sunColor: new THREE.Color('#fffbe6'),
    sunIntensity: 5.5,
    rimColor: new THREE.Color('#9effc8')
  });

  pmrem.dispose();
  return {
    desert: desertEnv.texture,
    homeworld: homeworldEnv.texture
  };
}

function buildSkyProbe(pmrem, palette) {
  const envScene = new THREE.Scene();

  const skyGeo = new THREE.SphereGeometry(60, 32, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: palette.zenith },
      uHorizon: { value: palette.horizon },
      uGround: { value: palette.ground }
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vWorldPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vWorldPos;
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float y = dir.y;
        vec3 col = y >= 0.0
          ? mix(uHorizon, uZenith, pow(y, 0.58))
          : mix(uHorizon, uGround, pow(-y, 0.45));
        gl_FragColor = vec4(col * 1.15, 1.0);
      }
    `
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // Emissive sun reflector card for crisp specular highlights on rounded metal/robot shell
  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(6.5, 16, 16),
    new THREE.MeshBasicMaterial({
      color: palette.sunColor.clone().multiplyScalar(palette.sunIntensity)
    })
  );
  sunDisc.position.set(28, 36, 18);
  envScene.add(sunDisc);

  // Cool sky fill card on opposite side for pleasing warm-cool rim contrast
  const coolFill = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 16),
    new THREE.MeshBasicMaterial({
      color: palette.rimColor.clone().multiplyScalar(1.35),
      side: THREE.DoubleSide
    })
  );
  coolFill.position.set(-34, 18, -24);
  coolFill.lookAt(0, 0, 0);
  envScene.add(coolFill);

  const rt = pmrem.fromScene(envScene, 0.035);
  skyGeo.dispose();
  skyMat.dispose();
  return rt;
}
