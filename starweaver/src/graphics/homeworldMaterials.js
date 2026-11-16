import * as THREE from 'three';
import { HOMEWORLD_CONFIG } from '../data/homeworldData.js';

/**
 * Reuses the existing GPU-baked library, without cloning textures or changing
 * their transforms (the desert and ship still use those same texture objects).
 * World projection keeps grain in metres after heterogeneous meshes are merged.
 * Geometry must use derivative tangents (no precomputed tangent attribute).
 * All PBR channels use the same projection, including the derivative tangent
 * frame for the normal map. Weathering is local to the meadow's Y=420 plane.
 */
export function createHomeworldSurfaceMaterial(pbrLibrary, {
  name = 'homeworld-surface', surface = 'hull_white',
  color = '#c9cec1', roughness = 0.75, metalness = 0.12,
  normalStrength = 0.16, worldScale = 0.65,
  weathering = 0.16, moss = 0.05, ...options
} = {}) {
  const pbr = pbrLibrary?.[surface];
  const material = new THREE.MeshStandardMaterial({
    name, color, roughness, metalness,
    map: pbr?.map || null,
    normalMap: pbr?.normalMap || null,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    aoMap: pbr?.ormMap || null, aoMapIntensity: 0.55,
    roughnessMap: pbr?.ormMap || null,
    metalnessMap: pbr?.ormMap || null,
    ...options
  });
  // Scalar metalness describes the actual substrate. The shared sand/rock ORM
  // must not accidentally make dielectric stone metallic.
  const isFoliage = name === 'folded-leaves' || name === 'nursery-leaves';
  const isBark = name === 'grove-bark';
  const isRidgeOrRock = surface === 'rock';
  material.userData.homeworldPbr = { surface, worldScale, baseY: HOMEWORLD_CONFIG.baseY };
  material.customProgramCacheKey = () => `hw_pbr_v2_${name}_${surface}_${worldScale}_${weathering}_${moss}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHwSurface = { value: new THREE.Vector4(worldScale, weathering, moss, HOMEWORLD_CONFIG.baseY) };
    shader.vertexShader = 'varying vec3 vHwWorldPosition;\nvarying vec3 vHwWorldNormal;\n' +
      shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 hwVertex = vec4(transformed, 1.0);
        vec3 hwObjectNormal = objectNormal;
        #ifdef USE_INSTANCING
          hwVertex = instanceMatrix * hwVertex;
          hwObjectNormal /= vec3(dot(instanceMatrix[0].xyz, instanceMatrix[0].xyz),
            dot(instanceMatrix[1].xyz, instanceMatrix[1].xyz), dot(instanceMatrix[2].xyz, instanceMatrix[2].xyz));
          hwObjectNormal = mat3(instanceMatrix) * hwObjectNormal;
        #endif
        vHwWorldPosition = (modelMatrix * hwVertex).xyz;
        vHwWorldNormal = inverseTransformDirection(normalMatrix * hwObjectNormal, viewMatrix);
      `);
    shader.fragmentShader = `varying vec3 vHwWorldPosition;
      varying vec3 vHwWorldNormal;
      uniform vec4 uHwSurface;
      float hwNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        vec4 h = fract(sin(vec4(dot(i, vec2(127.1,311.7)), dot(i+vec2(1,0),vec2(127.1,311.7)),
          dot(i+vec2(0,1),vec2(127.1,311.7)), dot(i+vec2(1),vec2(127.1,311.7)))) * 43758.5453);
        return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      vec3 hwPosition = vHwWorldPosition - vec3(0.0, uHwSurface.w, 0.0);
      vec3 hwNormal = normalize(vHwWorldNormal);
      vec3 hwAxis = abs(hwNormal);
      float hwLargest = max(hwAxis.x, max(hwAxis.y, hwAxis.z));
      float hwSmallest = min(hwAxis.x, min(hwAxis.y, hwAxis.z));
      float hwSecond = hwAxis.x + hwAxis.y + hwAxis.z - hwLargest - hwSmallest;
      // Retain 3D macro PBR normal/AO relief out to the alpine mountain ring while
      // gently attenuating high-frequency grain at far distance to prevent subpixel Moiré!
      float hwCamDist = length(vHwWorldPosition - cameraPosition);
      float hwDistFade = mix(0.44, 1.0, 1.0 - smoothstep(28.0, 82.0, hwCamDist)) *
        (1.0 - 0.32 * smoothstep(105.0, 190.0, hwCamDist));
      float hwProjectionDetail = smoothstep(0.03, 0.24, hwLargest - hwSecond) * hwDistFade;
      float hwMacro = hwNoise(hwPosition.xz * 0.37 + hwPosition.y * 0.12);
      float hwFine = hwNoise(hwPosition.xz * 2.3 + hwPosition.y * 0.57);
      // Box projection costs one sample per PBR channel, so mobile does not pay
      // for six full triplanar samples on every near-screen building fragment.
      vec2 hwSurfaceUv = hwAxis.y > max(hwAxis.x, hwAxis.z) ? hwPosition.xz :
        (hwAxis.x > hwAxis.z ? hwPosition.zy : hwPosition.xy);
      hwSurfaceUv *= uHwSurface.x;
      ${surface === 'sand' ? 'hwSurfaceUv = mat2(0.82, -0.57, 0.57, 0.82) * hwSurfaceUv + vec2(hwMacro - 0.5, hwFine - 0.5) * 0.38;' : ''}
      float hwContact = 1.0 - smoothstep(0.03, 0.95, max(0.0, hwPosition.y));
      float hwWear = clamp((0.35 + hwFine * 0.65) * uHwSurface.y, 0.0, 0.6);
      float hwMoss = clamp((hwContact * 0.82 + max(0.0, hwNormal.y) * 0.18) *
        smoothstep(0.3, 0.75, hwMacro) * uHwSurface.z, 0.0, 0.5);
      float hwSunFacet = dot(hwNormal, normalize(vec3(0.52, 0.74, 0.42)));
      float hwHemi = clamp(hwNormal.y * 0.5 + 0.5, 0.0, 1.0);
    `);
    // Expand only the relevant standard chunks. Keep Three's PBR lighting,
    // PMREM, shadows, fog and color management, and its native fallback when
    // the baked library is absent during white-box geometry verification.
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec3 hwAlbedo = texture2D(map, hwSurfaceUv).rgb;
        float hwGrain = dot(hwAlbedo, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb *= mix(0.98, clamp(0.70 + hwGrain * 0.56, 0.72, 1.24), hwProjectionDetail);
      #endif
    `).replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 0.92 + hwMacro * 0.16;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.76,0.81,0.69), hwWear);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.115,0.17,0.095), hwMoss);
      diffuseColor.rgb *= 1.0 - hwContact * uHwSurface.y * 0.28;
      ${isRidgeOrRock ? `
        // Organic non-periodic rock fractures, mineral grain & sun-facet relief (no horizontal sin(y) zebra bands!)
        float hwFracture = smoothstep(0.24, 0.78, hwMacro * 0.62 + hwFine * 0.38);
        diffuseColor.rgb *= (0.86 + 0.22 * hwFracture) * (0.84 + 0.28 * clamp(hwSunFacet * 0.5 + 0.5, 0.0, 1.0));
        diffuseColor.rgb *= 0.86 + 0.20 * hwHemi;
      ` : ''}
      ${isFoliage ? `
        // 3D botanical leaf translucency, midrib relief & warm sunlit crown rim!
        float hwLeafBacklight = pow(clamp(-hwSunFacet * 0.65 + 0.45, 0.0, 1.0), 1.6);
        float hwLeafSunTop = smoothstep(-0.15, 0.75, hwSunFacet) * smoothstep(0.25, 0.92, hwHemi);
        diffuseColor.rgb = mix(diffuseColor.rgb * vec3(0.72, 0.84, 0.76), diffuseColor.rgb * vec3(1.16, 1.20, 0.94), hwLeafSunTop);
        diffuseColor.rgb += vec3(0.12, 0.22, 0.06) * hwLeafBacklight * (0.55 + 0.45 * hwFine);
      ` : ''}
    `);
    for (const chunk of ['roughnessmap_fragment', 'metalnessmap_fragment', 'aomap_fragment',
      'normal_fragment_begin', 'normal_fragment_maps']) {
      let source = THREE.ShaderChunk[chunk]
        .replace(/vRoughnessMapUv|vMetalnessMapUv|vAoMapUv|vNormalMapUv/g, 'hwSurfaceUv');
      source = source.replace('mapN.xy *= normalScale;', 'mapN.xy *= normalScale * hwProjectionDetail;')
        .replace('roughnessFactor *= texelRoughness.g;',
          'roughnessFactor *= mix(0.8, texelRoughness.g, hwProjectionDetail);')
        .replace('metalnessFactor *= texelMetalness.b;',
          `metalnessFactor *= mix(${surface === 'rock' || surface === 'sand' ? '0.0' : '0.8'}, texelMetalness.b, hwProjectionDetail);`)
        .replace('( texture2D( aoMap, hwSurfaceUv ).r - 1.0 )',
          '( mix(0.95, texture2D( aoMap, hwSurfaceUv ).r, hwProjectionDetail) - 1.0 )');
      if (chunk === 'roughnessmap_fragment') source += `
        roughnessFactor = clamp(mix(roughnessFactor, 0.91, hwWear + hwMoss * 0.7) +
          (hwFine - 0.5) * 0.06, 0.08, 1.0);`;
      shader.fragmentShader = shader.fragmentShader.replace(`#include <${chunk}>`, source);
    }
  };
  return material;
}
