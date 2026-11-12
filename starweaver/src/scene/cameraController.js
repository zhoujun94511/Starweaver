import * as THREE from 'three';
import { clamp, damp, getTerrainHeight } from '../utils/math.js';

export class CameraController {
  constructor(camera, domElement, state) {
    this.camera = camera;
    this.domElement = domElement;
    this.state = state;

    // Cinematic third-person horizon-framing camera angle
    this.yaw = 0.44;
    this.pitch = 0.27;
    this.distance = 11.2;

    this.currentLookAt = new THREE.Vector3(4.8, 1.65, 5.8);
    this.currentPos = new THREE.Vector3(9.5, 4.8, 15.6);

    // Pre-allocated scratch vectors — zero per-frame GC allocations!
    this._desiredLook = new THREE.Vector3();
    this._posePos = new THREE.Vector3();
    this._poseLook = new THREE.Vector3();

    this.showcase = null;
    this.stationFocus = null;

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
        this.pitch = clamp(this.pitch + dy * (sens * 0.82), 0.14, 1.02);
      } else if (this._activePointers.size === 2) {
        rec.x = e.clientX;
        rec.y = e.clientY;
        const dist = this._computePinchDistance();
        if (this._pinchPrevDist > 0 && dist > 0) {
          const delta = dist - this._pinchPrevDist;
          this.distance = clamp(this.distance - delta * 0.042, 7.5, 21.0);
        }
        this._pinchPrevDist = dist;
      }
    });

    this.domElement.addEventListener('pointerup', onPointerEnd);
    this.domElement.addEventListener('pointercancel', onPointerEnd);
    this.domElement.addEventListener('lostpointercapture', onPointerEnd);

    window.addEventListener('blur', () => {
      this._activePointers.clear();
      this._pinchPrevDist = 0;
    });

    this.domElement.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = clamp(this.distance + e.deltaY * 0.01, 7.5, 21.0);
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
    this.showcase = {
      lookTarget: lookTarget.clone(),
      desiredPos: lookTarget.clone().add(camOffset),
      timer: duration
    };
  }

  clearShowcase() {
    this.showcase = null;
  }

  setStationFocus(stationPos) {
    const y = getTerrainHeight(stationPos.x, stationPos.z, this.state.isBridgeExtended());
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const rightBias = aspect < 1.05 ? 0.25 : aspect < 1.4 ? 1.25 : 1.85;
    const distZ = aspect < 1.05 ? 6.8 : 5.6;
    this.stationFocus = {
      lookAt: new THREE.Vector3(stationPos.x + rightBias, y + 1.45, stationPos.z - 0.3),
      desiredPos: new THREE.Vector3(
        stationPos.x + rightBias + 1.05,
        y + 3.15,
        stationPos.z + distZ
      )
    };
  }

  clearStationFocus() {
    this.stationFocus = null;
  }

  getDesiredFollowPose(targetPos) {
    this._poseLook.set(targetPos.x, targetPos.y + 1.58, targetPos.z);
    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance;
    const dx = this._poseLook.x + Math.sin(this.yaw) * horizDist;
    const dz = this._poseLook.z + Math.cos(this.yaw) * horizDist;
    let dy = this._poseLook.y + vertDist;
    const groundAtCam = getTerrainHeight(dx, dz, this.state.isBridgeExtended());
    if (groundAtCam > -2.5) {
      dy = Math.max(dy, groundAtCam + 1.85);
    }
    this._posePos.set(dx, dy, dz);
    return {
      position: this._posePos,
      lookAt: this._poseLook
    };
  }

  snapToPose(pose) {
    this.currentPos.copy(pose.position);
    this.currentLookAt.copy(pose.lookAt);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }

  update(dt, targetPos, overridePose = null) {
    if (overridePose) {
      this.currentPos.copy(overridePose.position);
      this.currentLookAt.copy(overridePose.lookAt);
      this.camera.position.copy(overridePose.position);
      this.camera.lookAt(overridePose.lookAt);
      return;
    }

    if (this.stationFocus) {
      this.currentPos.lerp(this.stationFocus.desiredPos, Math.min(1, dt * 6.0));
      this.currentLookAt.lerp(this.stationFocus.lookAt, Math.min(1, dt * 6.5));
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
      return;
    }

    if (this.showcase && this.showcase.timer > 0) {
      this.showcase.timer -= dt;
      this.currentPos.lerp(this.showcase.desiredPos, Math.min(1, dt * 4.5));
      this.currentLookAt.lerp(this.showcase.lookTarget, Math.min(1, dt * 5.5));
      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
      if (this.showcase.timer <= 0) {
        this.showcase = null;
      }
      return;
    }

    this._desiredLook.set(targetPos.x, targetPos.y + 1.58, targetPos.z);
    this.currentLookAt.x = damp(this.currentLookAt.x, this._desiredLook.x, 10, dt);
    this.currentLookAt.y = damp(this.currentLookAt.y, this._desiredLook.y, 10, dt);
    this.currentLookAt.z = damp(this.currentLookAt.z, this._desiredLook.z, 10, dt);

    const horizDist = Math.cos(this.pitch) * this.distance;
    const vertDist = Math.sin(this.pitch) * this.distance;

    const desiredX = this.currentLookAt.x + Math.sin(this.yaw) * horizDist;
    const desiredZ = this.currentLookAt.z + Math.cos(this.yaw) * horizDist;
    let desiredY = this.currentLookAt.y + vertDist;

    const groundAtCam = getTerrainHeight(
      desiredX,
      desiredZ,
      this.state.isBridgeExtended()
    );
    if (groundAtCam > -2.5) {
      desiredY = Math.max(desiredY, groundAtCam + 1.85);
    }

    this.currentPos.x = damp(this.currentPos.x, desiredX, 9, dt);
    this.currentPos.y = damp(this.currentPos.y, desiredY, 9, dt);
    this.currentPos.z = damp(this.currentPos.z, desiredZ, 9, dt);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLookAt);
  }
}
