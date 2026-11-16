import * as THREE from 'three';

// Exhaust is a flowing transparent surface, with no opaque cone or animated
// object transforms. Both nozzles share geometry; only phase and throttle vary.
const plumeGeometry = new THREE.CylinderGeometry(0.025, 0.58, 4.8, 24, 18, true);
plumeGeometry.translate(0, 2.4, 0);
plumeGeometry.rotateX(-Math.PI / 2);

const plumeVertex = `
  uniform float uTime;
  uniform float uPhase;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec3 p = position;
    float tail = pow(uv.y, 1.6);
    p.x += sin(uv.y * 11.0 - uTime * 18.0 + uPhase) * tail * 0.07;
    p.y += cos(uv.y * 8.0 - uTime * 15.0 + uPhase) * tail * 0.055;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const plumeFragment = `
  uniform float uTime;
  uniform float uPhase;
  uniform float uThrottle;
  uniform float uCore;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float along = vUv.y;
    float around = vUv.x * 6.283185;
    float flow = sin(around * 3.0 + along * 15.0 - uTime * 22.0 + uPhase);
    flow += sin(around * 7.0 - along * 9.0 + uTime * 14.0) * 0.35;
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float softSide = pow(facing, 0.65);
    float envelope = smoothstep(0.0, 0.055, along) * pow(1.0 - along, 0.85);
    float turbulence = 0.72 + flow * 0.16;
    vec3 cold = mix(vec3(0.14, 0.38, 1.0), vec3(0.42, 0.16, 0.73), along);
    vec3 hot = mix(vec3(0.7, 0.95, 1.0), cold, smoothstep(0.05, 0.65, along));
    vec3 color = mix(hot, vec3(0.72, 0.96, 1.0), uCore * (1.0 - along));
    float ignition = smoothstep(0.0, 0.25, uThrottle);
    float alpha = envelope * softSide * turbulence * ignition * mix(0.48, 0.78, uCore);
    gl_FragColor = vec4(color * mix(1.3, 2.5, uCore), alpha);
  }
`;

export function createThrusterPlume(phase) {
  const group = new THREE.Group();
  group.name = 'flowing-plasma-exhaust';
  const materials = [];
  for (let layer = 0; layer < 2; layer++) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uPhase: { value: phase },
        uThrottle: { value: 0 }, uCore: { value: layer }
      },
      vertexShader: plumeVertex, fragmentShader: plumeFragment,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, toneMapped: false
    });
    const mesh = new THREE.Mesh(plumeGeometry, material);
    if (layer) mesh.scale.set(0.5, 0.5, 0.72);
    mesh.frustumCulled = false;
    group.add(mesh);
    materials.push(material);
  }
  group.userData.materials = materials;
  group.userData.throttle = 0;
  group.userData.targetThrottle = 0;
  group.visible = false;
  return group;
}

export function updateThrusterPlume(plume, dt, elapsed) {
  const fx = plume.userData;
  fx.throttle += (fx.targetThrottle - fx.throttle) * (1 - Math.exp(-dt * 9));
  if (fx.targetThrottle === 0 && fx.throttle < 0.002) fx.throttle = 0;
  plume.visible = fx.throttle > 0.002;
  plume.scale.set(1, 1, 0.28 + fx.throttle * 0.85);
  for (const mat of fx.materials) {
    mat.uniforms.uTime.value = elapsed;
    mat.uniforms.uThrottle.value = fx.throttle;
  }
}

export function createAscentShield() {
  const geometry = new THREE.SphereGeometry(5.6, 32, 22, 0, Math.PI * 2, 0, Math.PI * 0.62);
  geometry.rotateX(Math.PI * 0.5);
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal); vView = -mv.xyz; vLocal = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uOpacity; uniform float uTime;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
        float boundary = smoothstep(-0.37, -0.20, vLocal.z / 5.6);
        float ripple = 0.88 + 0.12 * sin(vLocal.z * 2.0 - uTime * 4.0);
        float alpha = uOpacity * boundary * ripple * (0.035 + rim * 0.7);
        gl_FragColor = vec4(mix(vec3(0.2, 0.6, 0.7), vec3(0.55, 0.9, 1.0), rim), alpha);
      }
    `,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false
  });
  material.opacity = 0;
  const mesh = new THREE.Mesh(geometry, material);
  // Cutscene envelopes retain the ordinary material.opacity interface.
  mesh.onBeforeRender = () => { material.uniforms.uOpacity.value = material.opacity; };
  mesh.visible = false;
  return mesh;
}

export function createLaunchGroundWash() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform float uProgress; uniform float uTime; varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float radius = length(p);
        float angle = atan(p.y, p.x);
        float front = mix(0.15, 0.95, uProgress);
        float grain = 0.72 + sin(angle * 13.0 + radius * 21.0 - uTime * 5.0) * 0.16;
        grain += sin(p.x * 29.0 + sin(p.y * 17.0)) * 0.09;
        float ring = exp(-pow((radius - front) / 0.23, 2.0));
        float fade = smoothstep(0.0, 0.13, uProgress) * (1.0 - smoothstep(0.5, 1.0, uProgress));
        gl_FragColor = vec4(0.58, 0.42, 0.28, ring * grain * fade * 0.24);
      }
    `,
    transparent: true, depthWrite: false, toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0.06, -2.2);
  mesh.visible = false;
  return mesh;
}
