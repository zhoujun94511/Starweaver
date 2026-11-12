import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const CinematicGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uVignette: { value: 0.24 },
    uSaturation: { value: 1.08 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSaturation;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 col = texel.rgb;

      // Subtle saturation & contrast lift
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      // Gentle cinematic vignette around screen edges
      vec2 centered = vUv - 0.5;
      float distSq = dot(centered, centered);
      col *= smoothstep(0.85, 0.22, distSq * uVignette * 2.4);

      gl_FragColor = vec4(col, texel.a);
    }
  `
};

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
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.quality = 'high';
    this.isMobile = detectCoarseMobile();
    this.composer = null;
    this.bloomPass = null;
    this.gradePass = null;
    this.fxaaPass = null;

    this._initComposer();
  }

  _initComposer() {
    try {
      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      const dpr = this.renderer.getPixelRatio() || 1;
      const effW = Math.max(1, Math.round(w * dpr));
      const effH = Math.max(1, Math.round(h * dpr));

      const isWebGL2 = Boolean(this.renderer.capabilities && this.renderer.capabilities.isWebGL2);

      // Mobile TBDR Thermal Optimization:
      // Avoid 4x MSAA off-screen HalfFloat resolve on mobile tile GPUs (which causes massive memory bandwidth heat!).
      // At 2.0x Retina DPR on high-PPI mobile screens, sub-pixel density naturally eliminates edge aliasing!
      const rt = new THREE.WebGLRenderTarget(effW, effH, {
        type: THREE.HalfFloatType,
        samples: isWebGL2 && !this.isMobile ? 4 : 0
      });

      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);

      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // High-threshold HDR selective Bloom: on mobile, evaluate internal Gaussian pyramid at 0.5x dimensions
      // (Bloom is low-frequency light glow, so 0.5x pyramid looks identical while cutting Bloom fill-rate by 75%!)
      const bloomScale = this.isMobile ? 0.5 : 1.0;
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(
          Math.max(1, Math.round(effW * bloomScale)),
          Math.max(1, Math.round(effH * bloomScale))
        ),
        0.34,
        0.48,
        1.08
      );
      this.composer.addPass(this.bloomPass);

      this.gradePass = new ShaderPass(CinematicGradeShader);
      this.composer.addPass(this.gradePass);

      const outputPass = new OutputPass();
      this.composer.addPass(outputPass);

      // Lightweight screen-space FXAA strictly when MSAA=0 (mobile TBDR path) for silky-smooth edges with near-zero heat!
      this.fxaaPass = new ShaderPass(FXAAShader);
      this.fxaaPass.material.uniforms.resolution.value.set(1 / effW, 1 / effH);
      this.fxaaPass.enabled = Boolean(this.isMobile || !isWebGL2);
      this.composer.addPass(this.fxaaPass);
    } catch {
      this.composer = null;
      this.enabled = false;
    }
  }

  setQuality(quality) {
    this.quality = quality;
    this.isMobile = detectCoarseMobile();
    if (!this.composer) return;

    if (quality === 'low') {
      this.enabled = false;
    } else if (quality === 'medium') {
      // On mobile Medium ("Balanced"), bypass multi-pass EffectComposer directly to native backbuffer
      // (hardware Tile MSAA + ACESFilmicToneMapping) for ultra-cool sustained 60 FPS!
      if (this.isMobile) {
        this.enabled = false;
      } else {
        this.enabled = true;
        this.bloomPass.enabled = true;
        this.bloomPass.strength = 0.28;
      }
    } else {
      this.enabled = true;
      this.bloomPass.enabled = true;
      this.bloomPass.strength = 0.35;
    }
  }

  resize(width, height, pixelRatio = this.renderer.getPixelRatio() || 1) {
    if (!this.composer) return;
    this.isMobile = detectCoarseMobile();
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const dpr = Math.max(1, Number(pixelRatio) || 1);

    const isWebGL2 = Boolean(this.renderer.capabilities && this.renderer.capabilities.isWebGL2);
    const desiredSamples = isWebGL2 && !this.isMobile ? 4 : 0;

    if (
      this._lastW === w &&
      this._lastH === h &&
      this._lastDpr === dpr &&
      this._lastSamples === desiredSamples
    ) {
      return;
    }
    this._lastW = w;
    this._lastH = h;
    this._lastDpr = dpr;
    this._lastSamples = desiredSamples;

    if (this.composer.renderTarget1 && this.composer.renderTarget1.samples !== desiredSamples) {
      this.composer.renderTarget1.samples = desiredSamples;
      this.composer.renderTarget1.dispose();
    }
    if (this.composer.renderTarget2 && this.composer.renderTarget2.samples !== desiredSamples) {
      this.composer.renderTarget2.samples = desiredSamples;
      this.composer.renderTarget2.dispose();
    }

    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
    const effW = Math.max(1, Math.round(w * dpr));
    const effH = Math.max(1, Math.round(h * dpr));
    if (this.bloomPass) {
      const bloomScale = this.isMobile ? 0.5 : 1.0;
      this.bloomPass.resolution.set(
        Math.max(1, Math.round(effW * bloomScale)),
        Math.max(1, Math.round(effH * bloomScale))
      );
    }
    if (this.fxaaPass) {
      this.fxaaPass.enabled = desiredSamples === 0;
      this.fxaaPass.material.uniforms.resolution.value.set(1 / effW, 1 / effH);
    }
  }

  render() {
    if (this.enabled && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
