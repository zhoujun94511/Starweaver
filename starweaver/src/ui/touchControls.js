// Dedicated Multi-Touch Virtual Joystick & Contextual Action Pad for Mobile / Tablet (pointer: coarse).
// Remains 100% hidden on desktop mouse/keyboard setups; activates automatically on touch-capable devices.

import { el } from './domHelpers.js';

export class TouchControls {
  constructor(root, state, sound, callbacks) {
    this.root = root;
    this.state = state;
    this.sound = sound;
    this.callbacks = callbacks; // { onPrimaryAction, onInspectAction, onSonarAction }

    this.moveVec = { x: 0, z: 0 };
    this.flyHeld = false;

    this._joyPointerId = null;
    this._joyOrigin = { x: 0, y: 0 };
    this._maxRadius = 46;

    this._jetPointerId = null;
    this._lastActionAt = 0;
    this._lastStateSig = '';

    this.touchActive = this._detectInitialTouchCapability();
    this.compactViewport = this._detectCompactViewport();
    this._visibleAllowed = false;

    this._buildDom();
    this._bindEvents();
    this._syncBodyClass();
    this.setGameplayVisible(false);
  }

  _detectInitialTouchCapability() {
    if (typeof window === 'undefined') return false;
    const coarse =
      window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const fineOnly =
      window.matchMedia &&
      window.matchMedia('(pointer: fine)').matches &&
      !coarse;
    if (coarse) return true;
    if (!fineOnly && navigator.maxTouchPoints > 0) return true;
    return false;
  }

  _detectCompactViewport() {
    if (typeof window === 'undefined') return false;
    const w = window.innerWidth || 1440;
    const h = window.innerHeight || 900;
    return w <= 1180 || h <= 620;
  }

  isControlPadActive() {
    const manualPref = this.state?.settings?.onScreenControls;
    if (manualPref === true) return true;
    if (manualPref === false && !this.touchActive) return false;
    return Boolean(this.touchActive || this.compactViewport);
  }

  _syncBodyClass() {
    if (typeof document !== 'undefined') {
      const active = this.isControlPadActive();
      const prev = document.body.classList.contains('touch-active');
      document.body.classList.toggle('touch-active', active);
      if (prev !== active && this.callbacks.onTouchModeChange) {
        this.callbacks.onTouchModeChange(active);
      }
    }
  }

  _buildDom() {
    this.layer = el('div', 'touch-controls-layer hidden');

    // 1. Left Thumb Virtual Analog Joystick Zone
    this.joyZone = el('div', 'touch-joy-zone');
    this.joyBase = el('div', 'touch-joy-base');
    this.joyKnob = el('div', 'touch-joy-knob');
    this.joyBase.appendChild(this.joyKnob);
    this.joyZone.appendChild(this.joyBase);

    // 2. Right Thumb Contextual Action & Flight Cluster
    this.cluster = el('div', 'touch-action-cluster');

    this.subRow = el('div', 'touch-sub-row');
    this.btnInspect = el('button', 'touch-pad-btn sub hidden');
    this.btnInspectIcon = el('span', 'touch-btn-icon', '🔍');
    const initialZh = this.state.lang === 'zh';
    this.btnInspectLbl = el('span', 'touch-btn-lbl', initialZh ? '详情' : 'INFO');
    this.btnInspect.append(this.btnInspectIcon, this.btnInspectLbl);

    this.btnSonar = el('button', 'touch-pad-btn sonar hidden');
    this.btnSonarIcon = el('span', 'touch-btn-icon', '📡');
    this.btnSonarLbl = el('span', 'touch-btn-lbl', initialZh ? '声呐' : 'SONAR');
    this.btnSonar.append(this.btnSonarIcon, this.btnSonarLbl);
    this.subRow.append(this.btnInspect, this.btnSonar);

    this.mainRow = el('div', 'touch-main-row');
    this.btnJet = el('button', 'touch-pad-btn jet hidden');
    this.btnJetIcon = el('span', 'touch-btn-icon', '🚀');
    this.btnJetLbl = el('span', 'touch-btn-lbl', initialZh ? '喷气' : 'FLY');
    this.btnJet.append(this.btnJetIcon, this.btnJetLbl);

    this.btnAct = el('button', 'touch-pad-btn primary-act idle');
    this.btnActIcon = el('span', 'touch-btn-icon', '✋');
    this.btnActLbl = el('span', 'touch-btn-lbl', initialZh ? '交互' : 'ACT');
    this.btnAct.append(this.btnActIcon, this.btnActLbl);

    this.mainRow.append(this.btnJet, this.btnAct);
    this.cluster.append(this.subRow, this.mainRow);

    this.layer.append(this.joyZone, this.cluster);
    this.root.appendChild(this.layer);
  }

  _bindEvents() {
    // Dynamically wake up touch controls on hybrid touch laptops or DevTools touch toggle!
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' && !this.touchActive) {
          this.touchActive = true;
          this._syncBodyClass();
          this._refreshLayerVisibility();
        }
      },
      { passive: true }
    );

    if (window.matchMedia) {
      const mq = window.matchMedia('(pointer: coarse)');
      if (mq.addEventListener) {
        mq.addEventListener('change', (ev) => {
          this.touchActive = ev.matches;
          this.compactViewport = this._detectCompactViewport();
          this._syncBodyClass();
          this._refreshLayerVisibility();
        });
      }
    }

    // Reveal on-screen joystick & action pad automatically whenever resized into medium/small viewports!
    window.addEventListener('resize', () => {
      const nextCompact = this._detectCompactViewport();
      const nextTouch = this._detectInitialTouchCapability() || this.touchActive;
      if (nextCompact !== this.compactViewport || nextTouch !== this.touchActive) {
        this.compactViewport = nextCompact;
        this.touchActive = nextTouch;
        this._syncBodyClass();
        this._refreshLayerVisibility();
      }
    });

    // --- Virtual Joystick Multi-Touch Safe Handlers ---
    const endJoystick = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== this._joyPointerId) {
        return;
      }
      if (this._joyPointerId !== null) {
        try {
          if (this.joyZone.hasPointerCapture(this._joyPointerId)) {
            this.joyZone.releasePointerCapture(this._joyPointerId);
          }
        } catch {
          // Ignore
        }
      }
      this._joyPointerId = null;
      this.moveVec.x = 0;
      this.moveVec.z = 0;
      this.joyBase.classList.remove('active');
      this.joyBase.style.transform = 'translate3d(0px, 0px, 0px)';
      this.joyKnob.style.transform = 'translate3d(0px, 0px, 0px)';
    };

    this.joyZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound.ensureContext();
      if (this._joyPointerId !== null) return;

      this._joyPointerId = e.pointerId;
      const rect = this.joyBase.getBoundingClientRect();
      const baseCx = rect.left + rect.width * 0.5;
      const baseCy = rect.top + rect.height * 0.5;
      // Floating thumb-anchor within 26px of pad center so initial touch never jumps or feels off-axis!
      const rawOffX = e.clientX - baseCx;
      const rawOffY = e.clientY - baseCy;
      const offDist = Math.hypot(rawOffX, rawOffY);
      const maxFloat = 26;
      const floatX = offDist > maxFloat ? (rawOffX / offDist) * maxFloat : rawOffX;
      const floatY = offDist > maxFloat ? (rawOffY / offDist) * maxFloat : rawOffY;
      this._joyOrigin.x = baseCx + floatX;
      this._joyOrigin.y = baseCy + floatY;
      this.joyBase.style.transform = `translate3d(${floatX.toFixed(1)}px, ${floatY.toFixed(1)}px, 0px)`;
      this.joyBase.classList.add('active');

      try {
        this.joyZone.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
      this._updateJoystickDelta(e.clientX, e.clientY);
    });

    this.joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._joyPointerId) return;
      e.preventDefault();
      e.stopPropagation();
      this._updateJoystickDelta(e.clientX, e.clientY);
    });

    this.joyZone.addEventListener('pointerup', endJoystick);
    this.joyZone.addEventListener('pointercancel', endJoystick);
    this.joyZone.addEventListener('lostpointercapture', endJoystick);

    // --- Hold-to-Fly Jetpack Button Multi-Touch Safe Handlers ---
    const endJet = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== this._jetPointerId) {
        return;
      }
      if (this._jetPointerId !== null) {
        try {
          if (this.btnJet.hasPointerCapture(this._jetPointerId)) {
            this.btnJet.releasePointerCapture(this._jetPointerId);
          }
        } catch {
          // Ignore
        }
      }
      this._jetPointerId = null;
      this.flyHeld = false;
      this.btnJet.classList.remove('held');
    };

    this.btnJet.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound.ensureContext();
      if (this._jetPointerId !== null) return;
      this._jetPointerId = e.pointerId;
      this.flyHeld = true;
      this.btnJet.classList.add('held');
      try {
        this.btnJet.setPointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    });

    this.btnJet.addEventListener('pointerup', endJet);
    this.btnJet.addEventListener('pointercancel', endJet);
    this.btnJet.addEventListener('lostpointercapture', endJet);

    // --- Primary Action [E], Sonar [V] & Inspect [F] Buttons (with anti-double-bounce guard) ---
    const guardTap = (handler) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound.ensureContext();
      const now = performance.now();
      if (now - this._lastActionAt < 170) return;
      this._lastActionAt = now;
      handler();
    };

    this.btnAct.addEventListener(
      'pointerdown',
      guardTap(() => {
        if (this.callbacks.onPrimaryAction) this.callbacks.onPrimaryAction();
      })
    );

    this.btnSonar.addEventListener(
      'pointerdown',
      guardTap(() => {
        if (this.callbacks.onSonarAction) this.callbacks.onSonarAction();
      })
    );

    this.btnInspect.addEventListener(
      'pointerdown',
      guardTap(() => {
        if (this.callbacks.onInspectAction) this.callbacks.onInspectAction();
      })
    );

    window.addEventListener('blur', () => this.resetInputState());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.resetInputState();
      });
    }
  }

  _updateJoystickDelta(clientX, clientY) {
    const dx = clientX - this._joyOrigin.x;
    const dy = clientY - this._joyOrigin.y;
    const dist = Math.hypot(dx, dy);
    const maxR = this._maxRadius;

    let clampedX = dx;
    let clampedY = dy;
    if (dist > maxR) {
      clampedX = (dx / dist) * maxR;
      clampedY = (dy / dist) * maxR;
    }

    if (this.joyKnob) {
      this.joyKnob.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0px)`;
    }

    // Continuous radial deadzone remap: smoothly ramps from 0.0 -> 1.0 with slight analog curve!
    const deadZone = 0.085;
    const norm = Math.min(1, dist / maxR);
    if (norm <= deadZone || dist < 1e-4) {
      this.moveVec.x = 0;
      this.moveVec.z = 0;
    } else {
      const remapped = (norm - deadZone) / (1 - deadZone);
      const curved = remapped * (0.78 + 0.22 * remapped);
      this.moveVec.x = (dx / dist) * curved;
      this.moveVec.z = (dy / dist) * curved;
    }
  }

  resetInputState() {
    // Release browser pointer capture before clearing IDs. Otherwise a hidden
    // tab can keep routing stale move/up events to the old joystick or jetpack
    // element after visibility is restored.
    const release = (el, pointerId) => {
      if (pointerId === null || !el || typeof el.hasPointerCapture !== 'function') return;
      try {
        if (el.hasPointerCapture(pointerId) && typeof el.releasePointerCapture === 'function') {
          el.releasePointerCapture(pointerId);
        }
      } catch {
        // Capture may already have been canceled by the browser.
      }
    };
    release(this.joyZone, this._joyPointerId);
    release(this.btnJet, this._jetPointerId);
    this._joyPointerId = null;
    this._jetPointerId = null;
    this.moveVec.x = 0;
    this.moveVec.z = 0;
    this.flyHeld = false;
    if (this.joyBase) {
      this.joyBase.classList.remove('active');
      this.joyBase.style.transform = 'translate3d(0px, 0px, 0px)';
    }
    if (this.joyKnob) this.joyKnob.style.transform = 'translate3d(0px, 0px, 0px)';
    if (this.btnJet) this.btnJet.classList.remove('held');
  }

  setGameplayVisible(visible) {
    this._visibleAllowed = Boolean(visible);
    if (!this._visibleAllowed) {
      this.resetInputState();
    }
    this._refreshLayerVisibility();
  }

  _refreshLayerVisibility() {
    const show = this.isControlPadActive() && this._visibleAllowed;
    this.layer.classList.toggle('hidden', !show);
  }

  refreshVisibility() {
    this.compactViewport = this._detectCompactViewport();
    this._syncBodyClass();
    this._refreshLayerVisibility();
  }

  updateContext(nearestTarget, { passiveRoam = false, homeworldRoam = false } = {}) {
    if (!this.isControlPadActive() || !this._visibleAllowed) return;

    const zh = this.state.lang === 'zh';
    const hasDrill = !passiveRoam && !homeworldRoam && this.state.hasEquipment('drill');
    const hasJetpack = this.state.hasEquipment('jetpack');
    const canInspect = Boolean(
      !passiveRoam && nearestTarget && nearestTarget.inspectTitle && nearestTarget.kind !== 'log'
    );

    let actIcon = homeworldRoam ? '💬' : '✋';
    let actLabel = homeworldRoam ? (zh ? '巡检' : 'ACT') : (zh ? '交互' : 'ACT');
    let actReady = false;

    if (nearestTarget) {
      actReady = true;
      switch (nearestTarget.kind) {
        case 'homeworld_activity':
          actIcon = '◎';
          actLabel = zh ? '巡检' : 'CHECK';
          break;
        case 'homeworld_crew_chat':
          actIcon = '💬';
          actLabel = zh ? '交谈' : 'TALK';
          break;
        case 'sky_plaque':
          actIcon = nearestTarget.id === 'sky_arch' ? '⏱' : '🏛️';
          actLabel = nearestTarget.id === 'sky_arch'
            ? (zh ? '竞速' : 'TRIAL')
            : (zh ? '铭牌' : 'PLAQUE');
          break;
        case 'weather_beacon':
          actIcon = nearestTarget.done ? '⚡' : '📡';
          actLabel = nearestTarget.done
            ? (zh ? '折跃' : 'WARP')
            : (zh ? '并网' : 'LINK');
          break;
        case 'resource':
          if (!nearestTarget.available) {
            actIcon = '⏳';
            actLabel = zh ? '恢复中' : 'WAIT';
            actReady = false;
          } else if (nearestTarget.node && nearestTarget.node.subsurface) {
            actIcon = '⛏️';
            actLabel = zh ? '钻探' : 'DRILL';
          } else {
            actIcon = '✋';
            actLabel = zh ? '采集' : 'GATHER';
          }
          break;
        case 'station':
          actIcon = '🔥';
          actLabel = zh ? '工坊' : 'CRAFT';
          break;
        case 'repair':
          actIcon = '🔧';
          actLabel = zh ? '安装' : 'INSTALL';
          break;
        case 'launch_ramp':
          actIcon = '🚀';
          actLabel = zh ? '起飞' : 'LAUNCH';
          break;
        case 'log':
          actIcon = '📖';
          actLabel = zh ? '日志' : 'LOG';
          break;
        default:
          actIcon = '⚡';
          actLabel = zh ? '操作' : 'USE';
          break;
      }
    }

    // Only hide primary button in explicit headless passiveRoam tests; keep action button visible in gameplay & Homeworld!
    const hideAction = Boolean(passiveRoam);
    const sig = `${zh ? 1 : 0}|${hideAction ? 1 : 0}|${hasDrill ? 1 : 0}|${hasJetpack ? 1 : 0}|${canInspect ? 1 : 0}|${actReady ? 1 : 0}|${actIcon}|${actLabel}`;
    if (this._lastStateSig === sig) return;
    this._lastStateSig = sig;

    this.btnSonar.classList.toggle('hidden', !hasDrill);
    this.btnSonarLbl.textContent = zh ? '声呐' : 'SONAR';

    this.btnJet.classList.toggle('hidden', !hasJetpack);
    this.btnJetLbl.textContent = zh ? '喷气' : 'FLY';

    this.btnInspect.classList.toggle('hidden', !canInspect);
    this.btnInspectLbl.textContent = zh ? '详情' : 'INFO';

    this.btnAct.classList.toggle('hidden', hideAction);
    this.btnActIcon.textContent = actIcon;
    this.btnActLbl.textContent = actLabel;
    this.btnAct.classList.toggle('ready', actReady);
    this.btnAct.classList.toggle('idle', !actReady);
  }
}
