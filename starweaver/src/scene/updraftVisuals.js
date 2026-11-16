import * as THREE from 'three';

/**
 * Shared procedural visual builder & updater for spiral updraft thermal columns
 * across both Desert (Kharis-4) and Homeworld (Emerald Valley).
 */
export function buildUpdraftVisuals(parent, updrafts, getBaseY, {
  prefix = 'updraft',
  defaultColor = '#63ffbe',
  ringRadius = 1.65,
  beamHeight = 16,
  sharedRingMat = null,
  sharedBeamMat = null
} = {}) {
  const rings = [];
  const ringGeo = new THREE.TorusGeometry(ringRadius, 0.085, 6, 22);
  ringGeo.rotateX(Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.16, 0.34, beamHeight, 8);

  for (let i = 0; i < updrafts.length; i++) {
    const u = updrafts[i];
    const baseY = getBaseY(u.x, u.z);
    const color = u.color || defaultColor;
    const rMat = sharedRingMat || new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const bMat = sharedBeamMat || new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.14,
      depthWrite: false
    });
    const beam = new THREE.Mesh(beamGeo, bMat);
    beam.position.set(u.x, baseY + beamHeight * 0.5, u.z);
    beam.name = `${prefix}-beam-${u.id}`;
    parent.add(beam);

    const span = Math.min(20, u.topOffset * 0.68);
    const radiusScale = u.radius / 2.2;
    for (let k = 0; k < 4; k++) {
      const mesh = new THREE.Mesh(ringGeo, rMat);
      mesh.position.set(u.x, baseY + 1.0 + k * 4.0, u.z);
      mesh.scale.setScalar(radiusScale * (0.7 + k * 0.14));
      mesh.name = `${prefix}-${u.id}-${k}`;
      parent.add(mesh);
      rings.push({ mesh, baseY, phase: k * 0.25, radiusScale, span });
    }
  }
  return rings;
}

export function updateUpdraftVisuals(rings, elapsed, speed = 0.43) {
  if (!rings) return;
  for (let i = 0; i < rings.length; i++) {
    const item = rings[i];
    const cycle = (elapsed * speed + item.phase) % 1;
    item.mesh.position.y = item.baseY + 0.6 + cycle * item.span;
    item.mesh.rotation.y = elapsed * 1.45 + i;
    item.mesh.scale.setScalar(item.radiusScale * (0.65 + cycle * 0.45));
  }
}
