// Dedicated Multi-Touch Virtual Joystick & Contextual Action Pad for Mobile / Tablet (pointer: coarse).
// Remains 100% hidden on desktop mouse/keyboard setups; activates automatically on touch-capable devices.

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

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

  _syncBodyClass() {
    if (typeof document !== 'undefined') {
      const prev = document.body.classList.contains('touch-active');
      document.body.classList.toggle('touch-active', this.touchActive);
      if (prev !== this.touchActive && this.callbacks.onTouchModeChange) {
        this.callbacks.onTouchModeChange(this.touchActive);
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
    this.btnInspectLbl = el('span', 'touch-btn-lbl', '详情');
    this.btnInspect.append(this.btnInspectIcon, this.btnInspectLbl);

    this.btnSonar = el('button', 'touch-pad-btn sonar hidden');
    this.btnSonarIcon = el('span', 'touch-btn-icon', '📡');
    this.btnSonarLbl = el('span', 'touch-btn-lbl', '声呐');
    this.btnSonar.append(this.btnSonarIcon, this.btnSonarLbl);
    this.subRow.append(this.btnInspect, this.btnSonar);

    this.mainRow = el('div', 'touch-main-row');
    this.btnJet = el('button', 'touch-pad-btn jet hidden');
    this.btnJetIcon = el('span', 'touch-btn-icon', '🚀');
    this.btnJetLbl = el('span', 'touch-btn-lbl', '喷气');
    this.btnJet.append(this.btnJetIcon, this.btnJetLbl);

    this.btnAct = el('button', 'touch-pad-btn primary-act idle');
    this.btnActIcon = el('span', 'touch-btn-icon', '✋');
    this.btnActLbl = el('span', 'touch-btn-lbl', '交互');
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
          this._syncBodyClass();
          this._refreshLayerVisibility();
        });
      }
    }

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
      this.joyKnob.style.transform = 'translate3d(0px, 0px, 0px)';
    };

    this.joyZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.sound.ensureContext();
      if (this._joyPointerId !== null) return;

      this._joyPointerId = e.pointerId;
      const rect = this.joyBase.getBoundingClientRect();
      this._joyOrigin.x = rect.left + rect.width * 0.5;
      this._joyOrigin.y = rect.top + rect.height * 0.5;
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

    this.joyKnob.style.transform = `translate3d(${clampedX.toFixed(1)}px, ${clampedY.toFixed(1)}px, 0px)`;

    const norm = Math.min(1, dist / maxR);
    if (norm < 0.11) {
      this.moveVec.x = 0;
      this.moveVec.z = 0;
    } else {
      this.moveVec.x = clampedX / maxR;
      this.moveVec.z = clampedY / maxR;
    }
  }

  resetInputState() {
    this._joyPointerId = null;
    this._jetPointerId = null;
    this.moveVec.x = 0;
    this.moveVec.z = 0;
    this.flyHeld = false;
    if (this.joyBase) this.joyBase.classList.remove('active');
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
    const show = this.touchActive && this._visibleAllowed;
    this.layer.classList.toggle('hidden', !show);
  }

  updateContext(nearestTarget) {
    if (!this.touchActive || !this._visibleAllowed) return;

    const zh = this.state.lang === 'zh';
    const hasDrill = this.state.hasEquipment('drill');
    const hasJetpack = this.state.hasEquipment('jetpack');
    const canInspect = Boolean(
      nearestTarget && nearestTarget.inspectTitle && nearestTarget.kind !== 'log'
    );

    let actIcon = '✋';
    let actLabel = zh ? '交互' : 'ACT';
    let actReady = false;

    if (nearestTarget) {
      actReady = true;
      switch (nearestTarget.kind) {
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

    const sig = `${zh ? 1 : 0}|${hasDrill ? 1 : 0}|${hasJetpack ? 1 : 0}|${canInspect ? 1 : 0}|${actReady ? 1 : 0}|${actIcon}|${actLabel}`;
    if (this._lastStateSig === sig) return;
    this._lastStateSig = sig;

    this.btnSonar.classList.toggle('hidden', !hasDrill);
    this.btnSonarLbl.textContent = zh ? '声呐' : 'SONAR';

    this.btnJet.classList.toggle('hidden', !hasJetpack);
    this.btnJetLbl.textContent = zh ? '喷气' : 'FLY';

    this.btnInspect.classList.toggle('hidden', !canInspect);
    this.btnInspectLbl.textContent = zh ? '详情' : 'INFO';

    this.btnActIcon.textContent = actIcon;
    this.btnActLbl.textContent = actLabel;
    this.btnAct.classList.toggle('ready', actReady);
    this.btnAct.classList.toggle('idle', !actReady);
  }
}
