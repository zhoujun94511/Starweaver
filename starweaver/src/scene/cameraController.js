import * as THREE from 'three';
import { ELEVATED_PLATFORMS } from '../data/gameData.js';
import { clamp, damp, getTerrainHeight } from '../utils/math.js';
import { getHomeworldGroundHeight } from '../data/homeworldData.js';
import { cameraCylinderEntry } from '../utils/cameraOcclusion.js';
import { isHomeworldContext, isHomeworldCollider } from './worldLifecycle.js';

export class CameraController {
  constructor(camera, domElement, state) {
    this.camera = camera;
    this.domElement = domElement;
    this.state = state;

    // Cinematic third-person horizon-framing camera angle
    this.yaw = 0.44;
    this.pitch = 0.27;
    this.distance = 11.4;
    this.targetDistance = 11.4;

    this.currentLookAt = new THREE.Vector3(4.8, 1.65, 5.8);
    this.currentPos = new THREE.Vector3(9.5, 4.8, 15.6);

    // Pre-allocated scratch vectors — zero per-frame GC allocations!
    this._desiredLook = new THREE.Vector3();
    this._posePos = new THREE.Vector3();
    this._poseLook = new THREE.Vector3();
    this._safePosScratch = new THREE.Vector3();
    this._prevTargetPos = new THREE.Vector3();
    this._hasPrevTarget = false;
    this._dynamicDistBonus = 0;

    this.showcase = null;
    this.stationFocus = null;
    this.occluders = [];
    this._occlusionFrac = 1.0;

    // Multi-touch safe pointer map (pointerId -> { x, y }) + two-finger pinch zoom
    this._activePointers = new Map();
    this._pinchPrevDist = 0;

    this._bindEvents();
  }

  _bindEvents() {
    const onPointerEnd = (e) => {
      if (!this._activePointers.has(e.pointerId)) return;
      this._activePointers.delete(e.pointerId);
      if (this._activePointers.size < 2) {
        this._pinchPrevDist = 0;
      }
      try {
        if (this.domElement.hasPointerCapture(e.pointerId)) {
          this.domElement.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore capture release errors on detached pointers
      }
    };

    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
      if (this._activePointers.size >= 2) return;

      this._activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        this.domElement.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if synthetic event lacks pointer capture support
      }

      if (this._activePointers.size === 2) {
        this._pinchPrevDist = this._computePinchDistance();
      }
    });

    this.domElement.addEventListener('pointermove', (e) => {
      const rec = this._activePointers.get(e.pointerId);
      if (!rec) return;

      if (this._activePointers.size === 1) {
        const dx = e.clientX - rec.x;
        const dy = e.clientY - rec.y;
        rec.x = e.clientX;
        rec.y = e.clientY;

        const sens = e.pointerType === 'touch' ? 0.0068 : 0.0055;
        this.yaw -= dx * sens;
        this.pitch = clamp(this.pitch + dy * (sens * 0.82), 0.04, 1.02);
      } else if (this._activePointers.size === 2) {
        rec.x = e.clientX;
        rec.y = e.clientY;
        const dist = this._computePinchDistance();
        if (this._pinchPrevDist > 0 && dist > 0) {
          const delta = dist - this._pinchPrevDist;
          this.targetDistance = clamp(this.targetDistance - delta * 0.042, 8.0, 21.0);
        }
        this._pinchPrevDist = dist;
      }
    });

    this.domElement.addEventListener('pointerup', onPointerEnd);
    this.domElement.addEventListener('pointercancel', onPointerEnd);
    this.domElement.addEventListener('lostpointercapture', onPointerEnd);

    if (typeof window !== 'undefined') {
      window.addEventListener('blur', () => {
        this._activePointers.clear();
        this._pinchPrevDist = 0;
      });
    }

    this.domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.targetDistance = clamp(this.targetDistance + e.deltaY * 0.01, 8.0, 21.0);
      },
      { passive: false }
    );

    this.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _computePinchDistance() {
    const pts = Array.from(this._activePointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  clearPointers() {
    this._activePointers.clear();
    this._pinchPrevDist = 0;
  }

  rotateByKey(dir, dt) {
    this.yaw += dir * 1.65 * dt;
  }

  triggerShowcase(lookTarget, camOffset, duration = 2.1) {
    const rawPos = lookTarget.clone().add(camOffset);
    const safePos = this._constrainCameraSegment(
      lookTarget.x,
      lookTarget.y,
      lookTarget.z,
      rawPos.x,
      rawPos.y,
      rawPos.z,
      new THREE.Vector3()
    );
    this.showcase = {
      lookTarget: lookTarget.clone(),
      desiredPos: safePos,
      timer: duration
    };
  }

  clearShowcase() {
    this.showcase = null;
  }

  setStationFocus(stationPos) {
    const y = getTerrainHeight(stationPos.x, stationPos.z, this.state.isBridgeExtended());
    const aspect = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 1.6;
    const rightBias = aspect < 1.05 ? 0.25 : aspect < 1.4 ? 1.25 : 1.85;
    const distZ = aspect < 1.05 ? 6.8 : 5.6;
    const lookAt = new THREE.Vector3(stationPos.x + rightBias, y + 1.45, stationPos.z - 0.3);
    const desiredPos = this._constrainCameraSegment(
      lookAt.x,
      lookAt.y,
      lookAt.z,
      stationPos.x + rightBias + 1.05,
      y + 3.15,
      stationPos.z + distZ,
      new THREE.Vector3()
    );
    this.stationFocus = {
      lookAt,
      desiredPos
    };
  }

  clearStationFocus() {
    this.stationFocus = null;
  }

  setOccluders(colliders) {
    this.occluders = Array.isArray(colliders)
      ? colliders.filter((c) => c && c.occluder)
      : [];
  }

  /**
   * Analytical zero-GC spring-arm sightline solver:
   * Intersects LookAt -> DesiredCam segment against elevated sky-mesas, canyon cliffs,
   * sandstone archways, outpost dome, and Starweaver fuselage & wings so the camera NEVER clips inside solid geometry!
   */
  _solveSpringArmFraction(lx, ly, lz, dx, dy, dz) {
    let minFrac = 1.0;
    const camMargin = 0.52;

    const testCylinder = (cx, cz, radius, topY, bottomY) => {
      const entry = cameraCylinderEntry(lx, ly, lz, dx, dy, dz, cx, cz, radius,
        bottomY === undefined ? -Infinity : bottomY - 0.25,
        topY === undefined ? Infinity : topY + 0.35, camMargin);
      if (entry > 0.0001 && entry < minFrac) minFrac = Math.max(0.12, entry - 0.025);
    };

    // 1. Check against Elevated Sky-Spire / Basalt Columns (desert plane only!)
    const inHomeworld = isHomeworldContext(this.state, ly);
    if (!inHomeworld) {
      for (const plat of ELEVATED_PLATFORMS) {
        if (ly < plat.topY + 0.25 || dy < plat.topY + 0.25) {
          testCylinder(plat.x, plat.z, plat.radius * 1.18, plat.topY, undefined);
        }
      }
    }

    // 2. Check against active plane occluders (skip desert occluders on Homeworld and vice-versa!)
    for (let i = 0; i < this.occluders.length; i++) {
      const col = this.occluders[i];
      const isHwCol = isHomeworldCollider(col);
      if (isHwCol !== inHomeworld) continue;
      if (col.activeFn && !col.activeFn()) continue;
      testCylinder(col.x, col.z, col.radius, col.maxY, col.occluderMinY);
      const canopy = col.cameraCanopy;
      if (canopy) testCylinder(canopy.x, canopy.z, canopy.radius, canopy.maxY, canopy.minY);
    }

    return minFrac;
  }

  _getCameraGroundY(x, z, refY) {
    if (isHomeworldContext(this.state, refY)) {
      return getHomeworldGroundHeight(x, z);
    }
    return getTerrainHeight(x, z, this.state.isBridgeExtended());
  }

  _constrainCameraSegment(lx, ly, lz, dx, dy, dz, outVec) {
    const liftedY = this._enforceTerrainSightlineClearance(lx, ly, lz, dx, dy, dz);
    const frac = this._solveSpringArmFraction(lx, ly, lz, dx, liftedY, dz);
    const sx = lx + (dx - lx) * frac;
    const sz = lz + (dz - lz) * frac;
    let sy = ly + (liftedY - ly) * frac;
    const gY = this._getCameraGroundY(sx, sz, ly);
    if (gY > -2.5) {
      sy = Math.max(sy, gY + 1.45);
    }
    return outVec.set(sx, sy, sz);
  }

  /**
   * Ensures the entire sightline clears rolling dune crests & crater rims (not just the endpoint!).
   */
  _enforceTerrainSightlineClearance(lx, ly, lz, dx, dy, dz) {
    let liftedY = dy;
    const steps = [0.25, 0.45, 0.65, 0.85, 1.0];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const sx = lx + (dx - lx) * s;
      const sz = lz + (dz - lz) * s;
      const gY = this._getCameraGroundY(sx, sz, ly);
      if (gY > -2.5) {
        const clearance = s === 1.0 ? 1.82 : 0.95 + s * 0.45;
        const minLineY = gY + clearance;
        const curLineY = ly + (liftedY - ly) * s;
        if (curLineY < minLineY) {
          liftedY = ly + (minLineY - ly) / s;
        }
      }
    }
    return liftedY;
  }

  _enforceHomeworldCurrentSightline() {
    // Only clamp against Homeworld terrain when the camera target is actually on the Y=420 plane;
    // otherwise a saved activeWorldPlane='homeworld' would pull the Desert title camera into (0, 2.2, 0.8).
    if (this.currentLookAt.y <= 200) return;
    this._constrainCameraSegment(this.currentLookAt.x, this.currentLookAt.y, this.currentLookAt.z,
      this.currentPos.x, this.currentPos.y, this.currentPos.z, this._safePosScratch);
    this.currentPos.copy(this._safePosScratch);
  }

  _getLookHeightOffset(dist) {
    const t = clamp((dist - 8.0) / 13.0, 0, 1);
    return 1.32 + t * 0.48;
  }

  getDesiredFollowPose(targetPos) {
    const lookH = this._getLookHeightOffset(this.distance);
    this._poseLook.set(targetPos.x, targetPos.y + lookH, targetPos.z);
    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance;
    const fullX = this._poseLook.x + Math.sin(this.yaw) * horizDist;
    const fullZ = this._poseLook.z + Math.cos(this.yaw) * horizDist;
    let fullY = this._poseLook.y + vertDist;

    fullY = this._enforceTerrainSightlineClearance(
      this._poseLook.x,
      this._poseLook.y,
      this._poseLook.z,
      fullX,
      fullY,
      fullZ
    );

    const frac = this._solveSpringArmFraction(
      this._poseLook.x,
      this._poseLook.y,
      this._poseLook.z,
      fullX,
      fullY,
      fullZ
    );
    const dx = this._poseLook.x + (fullX - this._poseLook.x) * frac;
    const dz = this._poseLook.z + (fullZ - this._poseLook.z) * frac;
    const dy = this._poseLook.y + (fullY - this._poseLook.y) * frac;

    this._posePos.set(dx, dy, dz);
    return {
      position: this._posePos,
      lookAt: this._poseLook
    };
  }

  snapToPose(pose) {
    this._occlusionFrac = 1.0;
    this.currentPos.copy(pose.position);
    this.currentLookAt.copy(pose.lookAt);
    this._enforceHomeworldCurrentSightline();
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  update(dt, targetPos, overridePose = null) {
    if (overridePose) {
      this.currentPos.copy(overridePose.position);
      this.currentLookAt.copy(overridePose.lookAt);
      this._enforceHomeworldCurrentSightline();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(overridePose.lookAt);
      return;
    }

    if (this.stationFocus) {
      this.currentLookAt.lerp(this.stationFocus.lookAt, Math.min(1, dt * 6.5));
      const safeTarget = this._constrainCameraSegment(
        this.currentLookAt.x,
        this.currentLookAt.y,
        this.currentLookAt.z,
        this.stationFocus.desiredPos.x,
        this.stationFocus.desiredPos.y,
        this.stationFocus.desiredPos.z,
        this._safePosScratch
      );
      this.currentPos.lerp(safeTarget, Math.min(1, dt * 6.0));
      this._enforceHomeworldCurrentSightline();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
      return;
    }

    if (this.showcase && this.showcase.timer > 0) {
      this.showcase.timer -= dt;
      this.currentLookAt.lerp(this.showcase.lookTarget, Math.min(1, dt * 5.5));
      const safeTarget = this._constrainCameraSegment(
        this.currentLookAt.x,
        this.currentLookAt.y,
        this.currentLookAt.z,
        this.showcase.desiredPos.x,
        this.showcase.desiredPos.y,
        this.showcase.desiredPos.z,
        this._safePosScratch
      );
      this.currentPos.lerp(safeTarget, Math.min(1, dt * 4.5));
      this._enforceHomeworldCurrentSightline();
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
      if (this.showcase.timer <= 0) {
        this.showcase = null;
      }
      return;
    }

    if (this.targetDistance === undefined) this.targetDistance = this.distance;
    if (this._dynamicDistBonus === undefined) this._dynamicDistBonus = 0;

    let speedHoriz = 0;
    let speedVert = 0;
    if (this._hasPrevTarget && dt > 1e-4) {
      const invDt = 1.0 / dt;
      speedHoriz = Math.hypot(
        targetPos.x - this._prevTargetX,
        targetPos.z - this._prevTargetZ
      ) * invDt;
      speedVert = Math.abs(targetPos.y - this._prevTargetY) * invDt;
    }
    this._prevTargetX = targetPos.x;
    this._prevTargetY = targetPos.y;
    this._prevTargetZ = targetPos.z;
    this._hasPrevTarget = true;

    // Smoothly expand arm during jetpack flight or brisk travel, then settle back naturally
    const desiredBonus = clamp((speedHoriz - 3.6) * 0.28, 0, 1.4) + clamp((speedVert - 1.2) * 0.35, 0, 1.0);
    this._dynamicDistBonus = damp(this._dynamicDistBonus, desiredBonus, 3.2, dt);
    this.distance = damp(this.distance, this.targetDistance + this._dynamicDistBonus, 10.5, dt);

    const lookH = this._getLookHeightOffset(this.distance);
    this._desiredLook.set(targetPos.x, targetPos.y + lookH, targetPos.z);
    this.currentLookAt.x = damp(this.currentLookAt.x, this._desiredLook.x, 10, dt);
    this.currentLookAt.y = damp(this.currentLookAt.y, this._desiredLook.y, 10, dt);
    this.currentLookAt.z = damp(this.currentLookAt.z, this._desiredLook.z, 10, dt);

    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance;

    const fullX = this.currentLookAt.x + Math.sin(this.yaw) * horizDist;
    const fullZ = this.currentLookAt.z + Math.cos(this.yaw) * horizDist;
    let fullY = this.currentLookAt.y + vertDist;

    fullY = this._enforceTerrainSightlineClearance(
      this.currentLookAt.x,
      this.currentLookAt.y,
      this.currentLookAt.z,
      fullX,
      fullY,
      fullZ
    );

    const targetFrac = this._solveSpringArmFraction(
      this.currentLookAt.x,
      this.currentLookAt.y,
      this.currentLookAt.z,
      fullX,
      fullY,
      fullZ
    );

    // Asymmetric spring-arm response: pull in smoothly when occluded, ease back gently when clear
    const fracRate = targetFrac < this._occlusionFrac ? 18.0 : 5.5;
    this._occlusionFrac = damp(this._occlusionFrac, targetFrac, fracRate, dt);

    const desiredX = this.currentLookAt.x + (fullX - this.currentLookAt.x) * this._occlusionFrac;
    const desiredZ = this.currentLookAt.z + (fullZ - this.currentLookAt.z) * this._occlusionFrac;
    let desiredY = this.currentLookAt.y + (fullY - this.currentLookAt.y) * this._occlusionFrac;

    const groundAtCam = this._getCameraGroundY(
      desiredX,
      desiredZ,
      this.currentLookAt.y
    );
    if (groundAtCam > -2.5) {
      desiredY = Math.max(desiredY, groundAtCam + 1.45);
    }

    const posRate = targetFrac < 0.98 ? 14 : 9.5;
    this.currentPos.x = damp(this.currentPos.x, desiredX, posRate, dt);
    this.currentPos.y = damp(this.currentPos.y, desiredY, posRate, dt);
    this.currentPos.z = damp(this.currentPos.z, desiredZ, posRate, dt);
    this._enforceHomeworldCurrentSightline();

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
