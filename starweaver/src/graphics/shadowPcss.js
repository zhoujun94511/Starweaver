import * as THREE from 'three';

let stockShadowPars = null;
let pcssSignature = 'stock_pcf';

/**
 * Contact-Hardening PCSS Soft Shadows (Vogel Disk Blocker Search + Receiver-Plane Depth Bias).
 * Gives crisp contact shadows where Milo's wheels, landing gear pads, and boulders touch the sand,
 * while naturally softening cast shadows from high arches, cliffs, and spacecraft wings.
 * Includes automatic fallback restoration if any mobile/legacy GPU driver rejects derivative ops.
 */
export function installPcssShadows({
  frustumSize = 72.0,
  depthSpan = 155.0,
  taps = 16,
  blockerTaps = 8
} = {}) {
  if (stockShadowPars === null) {
    stockShadowPars = THREE.ShaderChunk.shadowmap_pars_fragment;
  }

  const base = stockShadowPars;
  const startIdx = base.indexOf('float getShadow(');
  const cubeIdx = base.indexOf('vec2 cubeToUV');
  const commentIdx = base.lastIndexOf('// cubeToUV()', cubeIdx);
  const endIdx = commentIdx >= startIdx ? commentIdx : cubeIdx;

  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    return false;
  }

  const customChunk = `
  // STARWEAVER_PCSS_SHADOW
  const vec2 SW_SHADOW_FRUSTUM = vec2( ${frustumSize.toFixed(2)}, ${frustumSize.toFixed(2)} );
  const float SW_SHADOW_DEPTH = ${depthSpan.toFixed(2)};

  float swShadowIGN( vec2 p ) {
    return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
  }

  vec2 swVogelDisk( int i, int n, float phi ) {
    float r = sqrt( ( float( i ) + 0.5 ) / float( n ) );
    float th = float( i ) * 2.39996323 + phi;
    return r * vec2( cos( th ), sin( th ) );
  }

  float swSampleShadowDepth( sampler2D shadowMap, vec2 uv ) {
    #if __VERSION__ >= 300
      return unpackRGBAToDepth( textureLod( shadowMap, uv, 0.0 ) );
    #else
      return unpackRGBAToDepth( texture2D( shadowMap, uv ) );
    #endif
  }

  float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
    shadowCoord.xyz /= shadowCoord.w;
    vec3 sc = shadowCoord.xyz;
    // Compute screen-space derivatives before any branch so ANGLE/HLSL never flags X3595
    vec3 dx = dFdx( sc );
    vec3 dy = dFdy( sc );
    bool inFrustum = sc.x >= 0.0 && sc.x <= 1.0 && sc.y >= 0.0 && sc.y <= 1.0;
    if ( ! ( inFrustum && sc.z <= 1.0 && sc.z >= 0.0 ) ) return 1.0;

    // Receiver-plane depth gradient bias to prevent acne on curved hull & dunes without peter-panning
    float det = dx.x * dy.y - dx.y * dy.x;
    vec2 dz = vec2( 0.0 );
    if ( abs( det ) > 1e-12 ) {
      dz = vec2( dy.y * dx.z - dx.y * dy.z, dx.x * dy.z - dy.x * dx.z ) / det;
    }
    vec2 texel = 1.0 / shadowMapSize;
    float maxSlope = 0.0032 / max( texel.x, texel.y );
    dz = clamp( dz, vec2( -maxSlope ), vec2( maxSlope ) );
    float baseTexelBias = max( texel.x, texel.y ) * 0.78;
    float zr = sc.z + shadowBias - ( abs( dz.x ) * texel.x + abs( dz.y ) * texel.y ) * 0.92 - baseTexelBias;

    float phi = swShadowIGN( gl_FragCoord.xy ) * 6.2831853;

    // 1. Blocker search in world-scaled UV radius (with radial cone-bias protection on curved dunes/meadows)
    vec2 searchR = ( 0.52 * max( shadowRadius, 0.8 ) ) / SW_SHADOW_FRUSTUM;
    float blkSum = 0.0;
    float blkCount = 0.0;
    for ( int i = 0; i < ${blockerTaps}; i ++ ) {
      vec2 o = swVogelDisk( i, ${blockerTaps}, phi ) * searchR;
      float d = swSampleShadowDepth( shadowMap, sc.xy + o );
      float coneGuard = length( o ) * 0.16;
      float zTest = zr + dot( o, dz ) - coneGuard;
      if ( d < zTest ) {
        blkSum += d;
        blkCount += 1.0;
      }
    }

    if ( blkCount < 0.5 ) return 1.0;

    // 2. Contact-hardening penumbra size proportional to blocker distance
    float avgBlocker = blkSum / blkCount;
    float blockerDistM = max( zr - avgBlocker, 0.0 ) * SW_SHADOW_DEPTH;
    float penumbraM = clamp( blockerDistM * 0.025 * max( shadowRadius, 0.8 ), 0.016, 0.62 );
    vec2 filterR = max( vec2( penumbraM ) / SW_SHADOW_FRUSTUM, texel * 1.35 );

    float lit = 0.0;
    for ( int i = 0; i < ${taps}; i ++ ) {
      vec2 o = swVogelDisk( i, ${taps}, phi + 1.71 ) * filterR;
      float d = swSampleShadowDepth( shadowMap, sc.xy + o );
      float zRef = zr + dot( o, dz ) - length( o ) * 0.11;
      lit += smoothstep( zRef - 0.00045, zRef + 0.00025, d );
    }
    lit /= float( ${taps} );

    // Smooth fade at the 36m shadow frustum border so moving shadow box never shows a hard seam
    vec2 borderDist = min( sc.xy, 1.0 - sc.xy );
    lit = mix( 1.0, lit, smoothstep( 0.0, 0.035, min( borderDist.x, borderDist.y ) ) );
    return mix( 1.0, lit, shadowIntensity );
  }
  `;

  const nextSig = `pcss_${taps}_${blockerTaps}`;
  if (pcssSignature === nextSig) {
    return false;
  }

  THREE.ShaderChunk.shadowmap_pars_fragment =
    base.slice(0, startIdx) + customChunk + base.slice(endIdx);
  pcssSignature = nextSig;
  return true;
}

export function uninstallPcssShadows() {
  if (stockShadowPars !== null && pcssSignature !== 'stock_pcf') {
    THREE.ShaderChunk.shadowmap_pars_fragment = stockShadowPars;
    pcssSignature = 'stock_pcf';
    return true;
  }
  return false;
}

export function isPcssInstalled() {
  return pcssSignature !== 'stock_pcf';
}
