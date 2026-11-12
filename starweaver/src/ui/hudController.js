import { CREW_LOGS, MATERIALS, RECIPES } from '../data/gameData.js';

// Safe DOM helper — exclusively uses createElement & textContent (never innerHTML).
function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '' && text !== null && text !== undefined) {
    node.textContent = String(text);
  }
  return node;
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

const MASTER_ICON_CACHE = new Map();

/**
 * Draws a crisp procedural 2D icon for any material/component onto a <canvas> element.
 * Caches master vector renders per (mat.id, small) and fast-blits clones in O(1)!
 */
function createMaterialIconCanvas(mat, small = false) {
  const px = small ? 52 : 76;
  const cacheKey = `${mat.id}:${small ? 's' : 'l'}`;

  let master = MASTER_ICON_CACHE.get(cacheKey);
  if (!master) {
    master = document.createElement('canvas');
    master.width = px;
    master.height = px;
    _drawMasterIcon(master, mat, small, px);
    MASTER_ICON_CACHE.set(cacheKey, master);
  }

  const clone = document.createElement('canvas');
  clone.width = px;
  clone.height = px;
  clone.className = small ? 'mat-icon-canvas small' : 'mat-icon-canvas';
  clone.getContext('2d').drawImage(master, 0, 0);
  return clone;
}

function _drawMasterIcon(canvas, mat, small, px) {
  const ctx = canvas.getContext('2d');
  const c = px * 0.5;
  const r = px * 0.34;
  const col = mat.color || '#8ecae6';

  // Soft radial backlight glow
  const glow = ctx.createRadialGradient(c, c, r * 0.1, c, c, r * 1.25);
  glow.addColorStop(0, `${col}55`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, px, px);

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (mat.category === 'ship_module') {
    // Octagonal radiant ship core + outer energy ring
    ctx.strokeStyle = col;
    ctx.lineWidth = small ? 2.2 : 3;
    ctx.beginPath();
    ctx.arc(c, c, r * 1.05, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
      const vx = c + Math.cos(a) * r * 0.74;
      const vy = c + Math.sin(a) * r * 0.74;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (mat.category === 'equipment') {
    if (mat.equipmentSlot === 'drill') {
      // Conical spiral auger drill icon
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.62, c - r * 0.68);
      ctx.lineTo(c + r * 0.62, c - r * 0.68);
      ctx.lineTo(c, c + r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffffffcc';
      ctx.lineWidth = small ? 2 : 3;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.45, c - r * 0.32);
      ctx.lineTo(c + r * 0.35, c - r * 0.12);
      ctx.moveTo(c - r * 0.28, c + r * 0.12);
      ctx.lineTo(c + r * 0.2, c + r * 0.32);
      ctx.stroke();
    } else {
      // Swept twin thruster wings icon
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c, c - r * 0.45);
      ctx.lineTo(c + r * 0.95, c - r * 0.15);
      ctx.lineTo(c + r * 0.68, c + r * 0.55);
      ctx.lineTo(c, c + r * 0.2);
      ctx.lineTo(c - r * 0.68, c + r * 0.55);
      ctx.lineTo(c - r * 0.95, c - r * 0.15);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c - r * 0.1, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (mat.category === 'subcomponent') {
    // Hexagonal precision module + circuit pins
    ctx.fillStyle = col;
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const vx = c + Math.cos(a) * r * 0.86;
      const vy = c + Math.sin(a) * r * 0.86;
      if (i === 0) ctx.moveTo(vx, vy);
      else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0d1b2a';
    ctx.beginPath();
    ctx.arc(c, c, r * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(c, c, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  } else if (mat.category === 'refined') {
    if (mat.id.includes('lens') || mat.id.includes('wire')) {
      // Optical lens / silver coil torus
      ctx.strokeStyle = col;
      ctx.lineWidth = small ? 4.5 : 6.5;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffffcc';
      ctx.beginPath();
      ctx.arc(c - r * 0.22, c - r * 0.22, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (mat.id.includes('canister') || mat.id.includes('rod') || mat.id.includes('core')) {
      // Cylindrical fuel cell / filter cartridge
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(c - r * 0.52, c - r * 0.82, r * 1.04, r * 1.64, r * 0.35);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillRect(c - r * 0.24, c - r * 0.52, r * 0.2, r * 1.04);
    } else {
      // Beveled metallic ingot / structural plate
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.65, c - r * 0.48);
      ctx.lineTo(c + r * 0.65, c - r * 0.48);
      ctx.lineTo(c + r * 0.92, c + r * 0.48);
      ctx.lineTo(c - r * 0.92, c + r * 0.48);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(c - r * 0.52, c - r * 0.36);
      ctx.lineTo(c + r * 0.52, c - r * 0.36);
      ctx.lineTo(c + r * 0.68, c - r * 0.02);
      ctx.lineTo(c - r * 0.68, c - r * 0.02);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    // Raw materials: Crystal shards vs Ore chunk
    const isCrystal =
      mat.id.includes('crystal') || mat.id === 'lumen_core' || mat.id === 'coolant_gel';
    ctx.fillStyle = col;
    if (isCrystal) {
      // Twin crystal spires
      ctx.beginPath();
      ctx.moveTo(c - r * 0.1, c - r * 0.95);
      ctx.lineTo(c + r * 0.42, c - r * 0.1);
      ctx.lineTo(c + r * 0.18, c + r * 0.85);
      ctx.lineTo(c - r * 0.46, c + r * 0.65);
      ctx.lineTo(c - r * 0.55, c - r * 0.25);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath();
      ctx.moveTo(c - r * 0.1, c - r * 0.9);
      ctx.lineTo(c + r * 0.12, c - r * 0.1);
      ctx.lineTo(c - r * 0.28, c + r * 0.5);
      ctx.closePath();
      ctx.fill();
    } else {
      // Craggy ore nugget
      ctx.beginPath();
      ctx.moveTo(c - r * 0.35, c - r * 0.78);
      ctx.lineTo(c + r * 0.55, c - r * 0.62);
      ctx.lineTo(c + r * 0.85, c + r * 0.15);
      ctx.lineTo(c + r * 0.32, c + r * 0.78);
      ctx.lineTo(c - r * 0.68, c + r * 0.62);
      ctx.lineTo(c - r * 0.82, c - r * 0.12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(c - r * 0.2, c - r * 0.25, r * 0.24, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
  return canvas;
}

export class HudController {
  constructor(root, state, sound, actions) {
    this.root = root;
    this.state = state;
    this.sound = sound;
    this.actions = actions;

    // null | 'title' | 'station' | 'inspect' | 'pause' | 'level_complete' | 'ending'
    this.activeModal = null;
    this.workbenchMode = 'furnace'; // 'furnace' | 'fabricator' | 'outpost' | 'handbook'
    this.stationFilter = 'furnace'; // 'all' | 'furnace' | 'fabricator'
    this.stationInteractive = false;
    this.confirmingReset = false;
    this.toastTimer = 0;

    const autoCollapse = this._shouldAutoCollapseDrawers();
    this.leftCollapsed = autoCollapse;
    this.bagCollapsed = autoCollapse;
    this.rightCollapsed = autoCollapse;
    this._userToggledLeft = false;
    this._userToggledBag = false;
    this._userToggledRight = false;

    // Frame-level DOM dirty-check caches (eliminates 60–120Hz redundant layout/text writes!)
    this._lastFuelPct = -1;
    this._lastCompassSig = '';
    this._lastPromptSig = '';
    this._lastHintSig = '';
    this._lastIntroSig = '';
    this._lastQueueSig = '';

    this._buildDomSkeleton();
    this._bindStateEvents();
    this._bindResponsiveDrawerSync();
    this.renderAll();
  }

  _shouldAutoCollapseDrawers() {
    if (typeof window === 'undefined') return false;
    const coarse =
      window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const touchCls =
      typeof document !== 'undefined' &&
      document.body.classList.contains('touch-active');
    return (
      coarse ||
      touchCls ||
      window.innerWidth <= 1240 ||
      window.innerHeight <= 720
    );
  }

  _bindResponsiveDrawerSync() {
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', () => this.syncResponsiveDrawers());
  }

  syncResponsiveDrawers() {
    const compact = this._shouldAutoCollapseDrawers();
    if (!this._userToggledLeft) this.leftCollapsed = compact;
    if (!this._userToggledBag) this.bagCollapsed = compact;
    if (!this._userToggledRight) this.rightCollapsed = compact;
    this._applyDrawerVisibility();
  }

  setLeftCollapsed(flag, byUser = false) {
    if (byUser) this._userToggledLeft = true;
    this.leftCollapsed = Boolean(flag);
    this._applyDrawerVisibility();
  }

  setBagCollapsed(flag, byUser = false) {
    if (byUser) this._userToggledBag = true;
    this.bagCollapsed = Boolean(flag);
    this._applyDrawerVisibility();
  }

  setRightCollapsed(flag, byUser = false) {
    if (byUser) this._userToggledRight = true;
    this.rightCollapsed = Boolean(flag);
    this._applyDrawerVisibility();
  }

  _applyDrawerVisibility() {
    if (this.leftDrawerTab && this.leftDrawerBody) {
      this.leftDrawerTab.classList.toggle('hidden', !this.leftCollapsed);
      this.leftDrawerBody.classList.toggle('hidden', this.leftCollapsed);
    }
    if (this.bagDrawerTab && this.bagCardBody) {
      this.bagDrawerTab.classList.toggle('hidden', !this.bagCollapsed);
      this.bagCardBody.classList.toggle('hidden', this.bagCollapsed);
    }
    if (this.rightMiniBar && this.rightDrawerBody) {
      this.rightMiniBar.classList.toggle('hidden', !this.rightCollapsed);
      this.rightDrawerBody.classList.toggle('hidden', this.rightCollapsed);
    }
  }

  _buildDomSkeleton() {
    clearChildren(this.root);

    // 1. Top-Left: Collapsible Slide-Away Mission & Side-Tasks Drawer
    this.topLeft = el('div', 'hud-top-left');

    this.leftDrawerTab = el('button', 'drawer-pill-tab left-pill hidden');
    this.leftTabLabelEl = el('span', 'pill-tab-text');
    const leftTabMiniTrack = el('span', 'pill-mini-track');
    this.leftTabMiniFill = el('span', 'pill-mini-fill');
    leftTabMiniTrack.appendChild(this.leftTabMiniFill);
    this.leftDrawerTab.append(this.leftTabLabelEl, leftTabMiniTrack);
    this.leftDrawerTab.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setLeftCollapsed(false, true);
    });

    this.leftDrawerBody = el('div', 'left-drawer-body');
    this.missionCard = el('div', 'hud-card mission-card');
    const missionHeadRow = el('div', 'mission-head-row');
    this.levelTitleEl = el('div', 'level-header');
    this.missionFoldBtn = el('button', 'drawer-fold-chip');
    this.missionFoldBtn.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setLeftCollapsed(true, true);
    });
    missionHeadRow.append(this.levelTitleEl, this.missionFoldBtn);

    this.missionSummaryEl = el('div', 'mission-summary');
    this.levelProgressBar = el('div', 'progress-bar-track');
    this.levelProgressFill = el('div', 'progress-bar-fill');
    this.levelProgressBar.appendChild(this.levelProgressFill);
    this.stepsContainer = el('div', 'step-list');
    this.missionCard.append(
      missionHeadRow,
      this.missionSummaryEl,
      this.levelProgressBar,
      this.stepsContainer
    );

    this.sideCard = el('div', 'hud-card side-card');
    this.sideHeaderEl = el('div', 'section-label');
    this.sideListEl = el('div', 'side-list');
    this.sideCard.append(this.sideHeaderEl, this.sideListEl);

    this.leftDrawerBody.append(this.missionCard, this.sideCard);
    this.topLeft.append(this.leftDrawerTab, this.leftDrawerBody);

    // 1.5 Top-Center: Smart Next-Step Guidance Compass Pill (with quick hide × button!)
    this.topCenter = el('div', 'hud-top-center');
    this.compassBadgeEl = el('span', 'compass-badge');
    this.compassTextEl = el('span', 'compass-text');
    this.compassDistEl = el('span', 'compass-dist');
    this.compassHideBtn = el('button', 'compass-close-btn', '×');
    this.compassHideBtn.title = 'Hide Next-Step Banner';
    this.compassHideBtn.addEventListener('click', () => {
      this.sound.playUiClick();
      this.state.setHudPref('showCompass', false);
    });
    this.topCenter.append(
      this.compassBadgeEl,
      this.compassTextEl,
      this.compassDistEl,
      this.compassHideBtn
    );

    // 2. Top-Right: Compact Toolbar + Collapsible Ship & Jetpack Status Drawer
    this.topRight = el('div', 'hud-top-right');
    this.toolbarRow = el('div', 'toolbar-row');

    this.btnCleanView = el('button', 'hud-btn');
    this.btnCleanView.addEventListener('click', () => {
      this.sound.playUiClick();
      const nowClean = this.state.toggleCleanView();
      if (nowClean) {
        this.setLeftCollapsed(true, true);
        this.setBagCollapsed(true, true);
        this.setRightCollapsed(true, true);
      }
    });

    this.btnNavArrow = el('button', 'hud-btn desktop-only-btn');
    this.btnNavArrow.addEventListener('click', () => {
      this.sound.playUiClick();
      this.state.setGuideArrow(this.state.settings.guideArrow === false);
    });

    this.btnGuide = el('button', 'hud-btn', 'Recipes [C]');
    this.btnGuide.addEventListener('click', () => {
      this.sound.playModalOpen();
      this.openRecipeGuide();
    });

    this.btnAudio = el('button', 'hud-btn desktop-only-btn');
    this.btnAudio.addEventListener('click', () => {
      this.state.setMuted(!this.state.settings.muted);
      this.sound.setMuted(this.state.settings.muted);
      if (!this.state.settings.muted) this.sound.playUiClick();
    });

    this.btnLang = el('button', 'hud-btn desktop-only-btn');
    this.btnLang.addEventListener('click', () => {
      this.sound.playUiClick();
      this.state.setLang(this.state.lang === 'en' ? 'zh' : 'en');
    });

    this.btnPause = el('button', 'hud-btn');
    this.btnPause.addEventListener('click', () => {
      this.sound.playModalOpen();
      this.openPauseModal();
    });

    this.toolbarRow.append(
      this.btnCleanView,
      this.btnNavArrow,
      this.btnGuide,
      this.btnAudio,
      this.btnLang,
      this.btnPause
    );

    // Collapsed Right Mini-Bar (Slim Ship Pill + Inline Jetpack Fuel Micro-Gauge)
    this.rightMiniBar = el('div', 'right-mini-bar hidden');
    this.rightExpandBtn = el('button', 'drawer-pill-tab right-pill');
    this.rightExpandBtn.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setRightCollapsed(false, true);
    });
    this.miniJetWrap = el('div', 'mini-jet-pill hidden');
    const mjIcon = el('span', '', '🚀');
    const mjTrack = el('span', 'mini-jet-track');
    this.miniJetFillEl = el('span', 'mini-jet-fill');
    this.miniJetFillEl.style.width = '100%';
    mjTrack.appendChild(this.miniJetFillEl);
    this.miniJetPctEl = el('span', 'mini-jet-pct', '100%');
    this.miniJetWrap.append(mjIcon, mjTrack, this.miniJetPctEl);
    this.rightMiniBar.append(this.miniJetWrap, this.rightExpandBtn);

    // Expanded Right Status Body
    this.rightDrawerBody = el('div', 'right-drawer-body');
    this.shipCard = el('div', 'hud-card ship-status-card');
    const shipHeadRow = el('div', 'mission-head-row');
    this.shipHeaderEl = el('div', 'ship-header');
    this.rightFoldBtn = el('button', 'drawer-fold-chip');
    this.rightFoldBtn.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setRightCollapsed(true, true);
    });
    shipHeadRow.append(this.shipHeaderEl, this.rightFoldBtn);

    this.shipBarTrack = el('div', 'progress-bar-track');
    this.shipBarFill = el('div', 'progress-bar-fill');
    this.shipBarTrack.appendChild(this.shipBarFill);
    this.shipPillsEl = el('div', 'ship-pills');
    this.shipCard.append(shipHeadRow, this.shipBarTrack, this.shipPillsEl);

    this.gearCard = el('div', 'hud-card gear-status-card hidden');
    this.gearBadgesRow = el('div', 'gear-badges-row');
    this.jetpackGaugeWrap = el('div', 'jetpack-gauge-wrap hidden');
    const jHeader = el('div', 'jetpack-gauge-header');
    this.jetpackLabelEl = el('span');
    this.jetpackPctEl = el('span', '', '100%');
    jHeader.append(this.jetpackLabelEl, this.jetpackPctEl);
    const jTrack = el('div', 'jetpack-bar-track');
    this.jetpackFillEl = el('div', 'jetpack-bar-fill');
    this.jetpackFillEl.style.width = '100%';
    jTrack.appendChild(this.jetpackFillEl);
    this.jetpackGaugeWrap.append(jHeader, jTrack);
    this.gearCard.append(this.gearBadgesRow, this.jetpackGaugeWrap);

    this.rightDrawerBody.append(this.shipCard, this.gearCard);
    this.topRight.append(this.toolbarRow, this.rightMiniBar, this.rightDrawerBody);

    // 3. Bottom-Left: Collapsible Cargo Drawer
    this.bottomLeft = el('div', 'hud-bottom-left-wrap');
    this.bagDrawerTab = el('button', 'drawer-pill-tab bag-pill hidden');
    this.bagDrawerTab.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setBagCollapsed(false, true);
    });

    this.bagCardBody = el('div', 'hud-card hud-bottom-left-card');
    const invHeadRow = el('div', 'mission-head-row');
    this.invHeaderEl = el('div', 'section-label');
    this.invHeaderEl.style.marginBottom = '0';
    this.bagFoldBtn = el('button', 'drawer-fold-chip');
    this.bagFoldBtn.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setBagCollapsed(true, true);
    });
    invHeadRow.append(this.invHeaderEl, this.bagFoldBtn);
    this.invGridEl = el('div', 'inv-grid');
    this.bagCardBody.append(invHeadRow, this.invGridEl);
    this.bottomLeft.append(this.bagDrawerTab, this.bagCardBody);

    this._applyDrawerVisibility();

    // 4. Bottom-Center: Toast + Idle Hint + Nearby Interaction Prompt + Control Guide Footer
    this.bottomCenter = el('div', 'hud-bottom-center');
    this.toastEl = el('div', 'toast-banner hidden');
    this.hintBannerEl = el('div', 'hud-card hint-banner hidden');
    this.hintTextEl = el('span');
    this.hintCloseBtn = el('button', 'hud-btn', '×');
    this.hintCloseBtn.addEventListener('click', () => {
      this.hintBannerEl.classList.add('hidden');
      this.actions.onDismissHint();
    });
    this.hintBannerEl.append(this.hintTextEl, this.hintCloseBtn);

    this.promptBox = el('div', 'interact-prompt hidden');
    this.promptMainText = el('div');
    this.promptSubText = el('div', 'inspect-subprompt');
    this.promptBox.append(this.promptMainText, this.promptSubText);

    this.bottomCenter.append(this.toastEl, this.hintBannerEl, this.promptBox);
    this.controlsFooter = el('div', 'controls-footer');

    // 5. Diegetic Right-Side Workbench Console & Portable Blueprint Pad (No full-screen blur!)
    this.workbenchDrawer = el('div', 'workbench-drawer hidden');

    // 6. Intro Cutscene Cinema Letterbox & Subtitles
    this.cinemaOverlay = el('div', 'cinema-overlay hidden');
    const cTop = el('div', 'cinema-bar-top');
    this.cinemaSkipBtn = el('button', 'cinema-skip-btn');
    this.cinemaSkipBtn.addEventListener('click', () => {
      if (this.actions.onSkipIntro) this.actions.onSkipIntro();
    });
    cTop.appendChild(this.cinemaSkipBtn);

    const cBot = el('div', 'cinema-bar-bottom');
    this.cinemaSubtitleEl = el('div', 'cinema-subtitle');
    this.cinemaDotsEl = el('div', 'cinema-dots');
    this.cinemaDotNodes = [el('span', 'cinema-dot'), el('span', 'cinema-dot'), el('span', 'cinema-dot')];
    this.cinemaDotsEl.append(...this.cinemaDotNodes);
    cBot.append(this.cinemaSubtitleEl, this.cinemaDotsEl);
    this.cinemaOverlay.append(cTop, cBot);

    // 7. Modal Backdrop (Title, Pause, Inspect, Level Complete, Ending)
    this.modalBackdrop = el('div', 'modal-backdrop hidden');
    this.modalPanel = el('div', 'modal-panel');
    this.modalBackdrop.appendChild(this.modalPanel);

    this.root.append(
      this.topLeft,
      this.topCenter,
      this.topRight,
      this.bottomLeft,
      this.bottomCenter,
      this.controlsFooter,
      this.workbenchDrawer,
      this.cinemaOverlay,
      this.modalBackdrop
    );
  }

  _bindStateEvents() {
    this.state.on((event, detail) => {
      if (event === 'craft_completed') {
        const mat = MATERIALS[detail.outputId];
        this.showToast(`+${detail.count} ${this.state.text(mat.name)}`, 'good');
        this.sound.playCraftComplete();
      }
      if (event === 'equipment_unlocked') {
        this.sound.playRepairInstall();
        const toastKey =
          detail.slot === 'drill' ? 'equipDrillToast' : 'equipJetpackToast';
        this.showToast(this.state.ui(toastKey), 'celebrate');
      }
      if (event === 'side_task_completed') {
        this.sound.playFacilityActivate();
        this.showToast(
          `${this.state.text(detail.task.label)} ✓ (${this.state.text(detail.task.rewardText)})`,
          'celebrate'
        );
      }
      if (event === 'level_completed' && detail.levelDef) {
        this.openLevelCompleteModal(detail.levelDef);
      }

      if (event === 'queue_tick') {
        if (this.activeModal === 'station') {
          this._renderQueueOnly();
        }
        return;
      }

      this.renderAll();
      if (this.activeModal === 'station') {
        this._renderWorkbenchBody();
      }
    });
  }

  isBlockingGameplay() {
    return this.activeModal !== null;
  }

  setHudVisible(visible) {
    const method = visible ? 'remove' : 'add';
    this.topLeft.classList[method]('hidden');
    this.topCenter.classList[method]('hidden');
    this.topRight.classList[method]('hidden');
    this.bottomLeft.classList[method]('hidden');
    this.bottomCenter.classList[method]('hidden');
    this.controlsFooter.classList[method]('hidden');
    if (visible) {
      this._lastCompassSig = '';
      this._lastPromptSig = '';
      this._lastHintSig = '';
      this._lastFuelPct = -1;
    }
  }

  setIntroOverlay(visible, actIndex = 0, subtitleText = '') {
    if (!visible) {
      if (this._lastIntroSig !== 'hidden') {
        this._lastIntroSig = 'hidden';
        this.cinemaOverlay.classList.add('hidden');
      }
      return;
    }
    const sig = `${actIndex}|${subtitleText}`;
    if (this._lastIntroSig === sig) return;
    this._lastIntroSig = sig;

    this.cinemaOverlay.classList.remove('hidden');
    this.cinemaSkipBtn.textContent = this.state.ui('introSkipBtn');
    this.cinemaSubtitleEl.textContent = subtitleText;
    this.cinemaDotNodes.forEach((dot, idx) => {
      dot.className = idx === actIndex ? 'cinema-dot active' : 'cinema-dot';
    });
  }

  showToast(message, style = 'good') {
    this.toastEl.textContent = message;
    this.toastEl.className = `toast-banner ${style}`;
    this.toastTimer = 3.6;
  }

  updateFrame(dt, nearestTarget, idleHintText, activeWaypoint = null, jetFuelPct = 100) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        this.toastEl.classList.add('hidden');
      }
    }

    if (this.state.hasEquipment('jetpack') && this.jetpackFillEl) {
      const clamped = Math.round(Math.max(0, Math.min(100, jetFuelPct)));
      if (this._lastFuelPct !== clamped) {
        this._lastFuelPct = clamped;
        this.jetpackFillEl.style.width = `${clamped}%`;
        this.jetpackPctEl.textContent = `${clamped}%`;
        if (this.miniJetFillEl && this.miniJetPctEl) {
          this.miniJetFillEl.style.width = `${clamped}%`;
          this.miniJetPctEl.textContent = `${clamped}%`;
        }
      }
    }

    const blocking = this.isBlockingGameplay();
    const allowCompass = this.state.settings.showCompass !== false;
    const allowIdleTips = this.state.settings.showIdleTips !== false;

    if (activeWaypoint && !blocking && allowCompass) {
      const distStr =
        activeWaypoint.distMeters <= 3 ? '● HERE' : `${activeWaypoint.distMeters}m`;
      const cSig = `${activeWaypoint.color}|${activeWaypoint.label}|${distStr}|${this.state.lang}`;
      if (this._lastCompassSig !== cSig) {
        this._lastCompassSig = cSig;
        this.topCenter.classList.remove('hidden');
        this.topCenter.style.borderColor = activeWaypoint.color || '#5ce8ff';
        this.compassBadgeEl.textContent = this.state.ui('navCompassPrefix');
        this.compassTextEl.textContent = activeWaypoint.label;
        this.compassDistEl.textContent = distStr;
      }
    } else if (this._lastCompassSig !== 'hidden') {
      this._lastCompassSig = 'hidden';
      this.topCenter.classList.add('hidden');
    }

    if (nearestTarget && !blocking) {
      const isTouch =
        typeof document !== 'undefined' &&
        document.body.classList.contains('touch-active');
      const rawPrompt = isTouch
        ? nearestTarget.prompt.replace(/^\[[A-Za-z]+\]\s*/, '')
        : nearestTarget.prompt;
      const showInspect = Boolean(
        !isTouch && nearestTarget.inspectTitle && nearestTarget.kind !== 'log'
      );
      const pSig = `${rawPrompt}|${showInspect ? 1 : 0}|${this.state.lang}|${isTouch ? 1 : 0}`;
      if (this._lastPromptSig !== pSig) {
        this._lastPromptSig = pSig;
        this.promptBox.classList.remove('hidden');
        this.promptMainText.textContent = rawPrompt;
        if (showInspect) {
          this.promptSubText.textContent = this.state.ui('promptInspectKey');
          this.promptSubText.classList.remove('hidden');
        } else {
          this.promptSubText.classList.add('hidden');
        }
      }
    } else if (this._lastPromptSig !== 'hidden') {
      this._lastPromptSig = 'hidden';
      this.promptBox.classList.add('hidden');
    }

    if (idleHintText && !blocking && allowIdleTips) {
      if (this._lastHintSig !== idleHintText) {
        this._lastHintSig = idleHintText;
        this.hintTextEl.textContent = `${this.state.ui('hintPrefix')}${idleHintText}`;
        this.hintBannerEl.classList.remove('hidden');
      }
    } else if (this._lastHintSig !== 'hidden') {
      this._lastHintSig = 'hidden';
      this.hintBannerEl.classList.add('hidden');
    }
  }

  renderAll() {
    const isTouch =
      typeof document !== 'undefined' &&
      document.body.classList.contains('touch-active');
    const stripKey = (s) => (isTouch ? String(s).replace(/\s*\[[^\]]+\]/g, '') : s);

    const cleanActive = this.state.isCleanViewActive();
    this.btnCleanView.textContent = cleanActive
      ? this.state.ui('btnCleanViewOff')
      : this.state.ui('btnCleanViewOn');
    this.btnCleanView.classList.toggle('primary', cleanActive);

    const foldText = this.state.ui('drawerCollapse');
    this.missionFoldBtn.textContent = foldText;
    this.bagFoldBtn.textContent = foldText;
    this.rightFoldBtn.textContent = this.state.lang === 'zh' ? '▴ 收起' : '▴ Hide';

    this.btnNavArrow.textContent = stripKey(
      this.state.settings.guideArrow === false
        ? this.state.ui('navToggleOff')
        : this.state.ui('navToggleOn')
    );
    this.btnGuide.textContent = stripKey(
      this.state.lang === 'zh' ? '📖 蓝图 [C]' : '📖 Blueprints [C]'
    );
    this.btnAudio.textContent = this.state.settings.muted
      ? this.state.ui('audioOff')
      : this.state.ui('audioOn');
    this.btnLang.textContent = this.state.ui('langToggle');
    this.btnPause.textContent =
      this.state.lang === 'zh' ? '⚙ 设置' : '⚙ Menu';
    this.controlsFooter.textContent = this.state.ui('controlsSummary');

    // Layer 2: Current-Level Main Repair Objective + Left Collapsed Pill Summary
    const lvlProg = this.state.getCurrentLevelProgress();
    const pctStr = `${Math.round(lvlProg.fraction * 100)}%`;
    this.levelTitleEl.textContent = lvlProg.title;
    this.missionSummaryEl.textContent = lvlProg.summary;
    this.levelProgressFill.style.width = pctStr;
    this.leftTabLabelEl.textContent = `${this.state.ui('tabMissionShort', {
      level: lvlProg.level,
      done: lvlProg.doneSteps,
      total: lvlProg.totalSteps
    })} ▸`;
    this.leftTabMiniFill.style.width = pctStr;

    clearChildren(this.stepsContainer);
    for (const step of lvlProg.steps) {
      const row = el('div', `step-row${step.done ? ' done' : ''}`);
      const nameSpan = el('span', '', `${step.done ? '✓ ' : '○ '}${step.label}`);
      const countSpan = el('strong', '', `${step.current}/${step.needed}`);
      row.append(nameSpan, countSpan);
      this.stepsContainer.appendChild(row);
    }

    // Layer 1: Optional Side Tasks
    this.sideHeaderEl.textContent = this.state.ui('sideTasksTitle');
    clearChildren(this.sideListEl);
    const sideStatuses = this.state.getSideTasksStatus();
    for (const st of sideStatuses) {
      const item = el('div', `side-item${st.completed ? ' done' : ''}`);
      const top = el(
        'div',
        '',
        `${st.completed ? '★ ' : '• '}${st.label}: ${st.current}/${st.target}`
      );
      const rew = el('div', 'side-reward', st.rewardText);
      item.append(top, rew);
      this.sideListEl.appendChild(item);
    }

    // Layer 3: Global Spacecraft Repair Progress + Collapsed Right Mini-Bar
    const globalProg = this.state.getGlobalRepairProgress();
    this.shipHeaderEl.textContent = this.state.ui('shipSystemsRepaired', {
      done: globalProg.repairedCount,
      total: globalProg.totalSystems
    });
    this.shipBarFill.style.width = `${Math.round(
      (globalProg.repairedCount / globalProg.totalSystems) * 100
    )}%`;
    this.rightExpandBtn.textContent = `${this.state.ui('tabShipShort', {
      done: globalProg.repairedCount,
      total: globalProg.totalSystems
    })} ▾`;

    clearChildren(this.shipPillsEl);
    const shortLabels =
      this.state.lang === 'zh'
        ? ['1.电力', '2.通信', '3.维生', '4.导航', '5.推进']
        : ['1.Power', '2.Comms', '3.LifeSup', '4.Nav', '5.Thrust'];
    globalProg.systems.forEach((sys, i) => {
      const pill = el(
        'span',
        `ship-pill${sys.repaired ? ' online' : ''}`,
        `${sys.repaired ? '✓ ' : ''}${shortLabels[i]}`
      );
      this.shipPillsEl.appendChild(pill);
    });

    // Equipped Upgrades & Jetpack Fuel Bar
    const hasDrill = this.state.hasEquipment('drill');
    const hasJetpack = this.state.hasEquipment('jetpack');
    this.miniJetWrap.classList.toggle('hidden', !hasJetpack);

    if (hasDrill || hasJetpack) {
      this.gearCard.classList.remove('hidden');
      clearChildren(this.gearBadgesRow);
      if (hasDrill) {
        const dChip = el(
          'button',
          'gear-chip drill',
          stripKey(this.state.ui('gearDrillBadge'))
        );
        dChip.addEventListener('click', () => {
          if (this.actions.onTriggerSonar) this.actions.onTriggerSonar();
        });
        this.gearBadgesRow.appendChild(dChip);
      }
      if (hasJetpack) {
        const jChip = el(
          'span',
          'gear-chip',
          stripKey(this.state.ui('gearJetpackBadge'))
        );
        this.gearBadgesRow.appendChild(jChip);
        this.jetpackLabelEl.textContent = this.state.ui('jetpackGaugeLabel');
        this.jetpackGaugeWrap.classList.remove('hidden');
      } else {
        this.jetpackGaugeWrap.classList.add('hidden');
      }
    } else {
      this.gearCard.classList.add('hidden');
    }

    // Persistent Inventory + Collapsed Bag Pill Summary
    this.invHeaderEl.textContent = this.state.ui('inventoryTitle');
    clearChildren(this.invGridEl);
    const heldEntries = Object.values(MATERIALS).filter(
      (m) => this.state.getItemCount(m.id) > 0
    );
    const totalItemCount = heldEntries.reduce(
      (sum, m) => sum + this.state.getItemCount(m.id),
      0
    );
    this.bagDrawerTab.textContent = `${this.state.ui('tabBagShort', {
      count: totalItemCount
    })} ▸`;

    if (heldEntries.length === 0) {
      this.invGridEl.appendChild(
        el('div', 'mission-summary', this.state.ui('emptyInventory'))
      );
    } else {
      for (const mat of heldEntries) {
        const chip = el('div', 'inv-chip');
        const dot = el('span', 'inv-dot');
        dot.style.backgroundColor = mat.color;
        const label = el('span', '', this.state.text(mat.name));
        const cnt = el('span', 'inv-count', `×${this.state.getItemCount(mat.id)}`);
        chip.append(dot, label, cnt);
        this.invGridEl.appendChild(chip);
      }
    }
    this._applyDrawerVisibility();
  }

  // --- Modals & Diegetic Workbench Drawer ---
  closeModal() {
    const prevModal = this.activeModal;
    if (prevModal !== null) {
      this.sound.playModalClose();
    }
    this.activeModal = null;
    this.confirmingReset = false;
    this.modalBackdrop.classList.add('hidden');
    this.modalBackdrop.classList.remove('title-mode');
    this.workbenchDrawer.classList.add('hidden');

    if (prevModal === 'station') {
      this.topLeft.classList.remove('hidden');
      this.topRight.classList.remove('hidden');
      if (this.actions.onCloseStation) {
        this.actions.onCloseStation();
      }
    }
  }

  openTitleModal(hasSave) {
    this.activeModal = 'title';
    this.workbenchDrawer.classList.add('hidden');
    // Hide noisy task HUD panels while on the scenic Title Screen!
    this.setHudVisible(false);

    this.modalBackdrop.classList.remove('hidden');
    this.modalBackdrop.classList.add('title-mode');
    clearChildren(this.modalPanel);

    const wrap = el('div', 'hero-panel');
    wrap.style.margin = '0 auto';
    const title = el('div', 'hero-title', this.state.ui('gameTitle'));
    const sub = el('div', 'hero-sub', this.state.ui('gameSubtitle'));

    const actions = el('div', 'hero-actions');
    if (hasSave) {
      const btnCont = el('button', 'hud-btn primary', this.state.ui('continueMission'));
      btnCont.addEventListener('click', () => {
        this.closeModal();
        this.actions.onContinueMission();
      });
      actions.appendChild(btnCont);
    }

    const btnNew = el(
      'button',
      hasSave ? 'hud-btn' : 'hud-btn primary',
      this.state.ui('startAdventure')
    );
    btnNew.addEventListener('click', () => {
      this.closeModal();
      this.actions.onStartMission();
    });

    const btnLang = el('button', 'hud-btn', this.state.ui('langToggle'));
    btnLang.addEventListener('click', () => {
      this.sound.playUiClick();
      this.state.setLang(this.state.lang === 'en' ? 'zh' : 'en');
      this.openTitleModal(hasSave);
    });

    actions.append(btnNew, btnLang);
    wrap.append(title, sub, actions);

    if (!this.state.storageAvailable) {
      const note = el('div', 'recipe-missing', this.state.ui('storageFallbackNote'));
      note.style.marginTop = '14px';
      wrap.appendChild(note);
    }

    this.modalPanel.appendChild(wrap);
  }

  openStationModal(stationMode = 'furnace') {
    this.activeModal = 'station';
    this.stationInteractive = true;
    this.modalBackdrop.classList.add('hidden');
    // Keep left viewport clean so player clearly sees Milo & the live 3D machine!
    this.topLeft.classList.add('hidden');
    this.topRight.classList.add('hidden');
    this.topCenter.classList.add('hidden');

    if (stationMode === 'both') {
      this.workbenchMode = 'outpost';
      this.stationFilter = 'furnace';
    } else if (stationMode === 'furnace') {
      this.workbenchMode = 'furnace';
      this.stationFilter = 'furnace';
    } else {
      this.workbenchMode = 'fabricator';
      this.stationFilter = 'fabricator';
    }

    this.workbenchDrawer.className = `workbench-drawer theme-${this.workbenchMode}`;
    this._renderWorkbenchBody();
  }

  openRecipeGuide() {
    this.activeModal = 'station';
    this.stationInteractive = false;
    this.workbenchMode = 'handbook';
    this.stationFilter = 'all';
    this.modalBackdrop.classList.add('hidden');
    this.topLeft.classList.add('hidden');
    this.topRight.classList.add('hidden');
    this.topCenter.classList.add('hidden');

    this.workbenchDrawer.className = 'workbench-drawer theme-handbook';
    this._renderWorkbenchBody();
  }

  _renderQueueOnly(force = false) {
    if (!this.queueBoxEl) return;
    const head = this.state.craftingQueue[0];
    const headPct = head
      ? Math.round(((head.total - head.remaining) / head.total) * 100)
      : -1;
    const sig = `${this.state.lang}|${this.state.craftingQueue.length}|${head ? head.jobId : 0}|${headPct}`;
    if (!force && this._lastQueueSig === sig) return;
    this._lastQueueSig = sig;

    clearChildren(this.queueBoxEl);
    const title = el('div', 'section-label', this.state.ui('activeQueue'));
    this.queueBoxEl.appendChild(title);

    if (this.state.craftingQueue.length === 0) {
      this.queueBoxEl.appendChild(
        el('div', 'recipe-io', this.state.ui('queueEmpty'))
      );
      return;
    }

    this.state.craftingQueue.forEach((job, idx) => {
      const rec = RECIPES.find((r) => r.id === job.recipeId);
      const outMat = MATERIALS[rec.output.id];
      const pct = Math.round(((job.total - job.remaining) / job.total) * 100);
      const row = el(
        'div',
        'recipe-io',
        `${idx + 1}. ${this.state.text(outMat.name)} — ${pct}%`
      );
      this.queueBoxEl.appendChild(row);
      if (idx === 0) {
        const track = el('div', 'progress-bar-track');
        track.style.marginTop = '5px';
        const fill = el('div', 'progress-bar-fill');
        fill.style.width = `${pct}%`;
        track.appendChild(fill);
        this.queueBoxEl.appendChild(track);
      }
    });
  }

  _renderWorkbenchBody() {
    clearChildren(this.workbenchDrawer);

    // 1. Thematic Station / Handbook Header
    const header = el('div', 'wb-header');
    const titleRow = el('div', 'wb-title-row');

    let emblemIcon = '📖';
    let mainTitle = this.state.ui('handbookTitle');
    let subTitle = this.state.ui('handbookSub');

    if (this.workbenchMode === 'furnace') {
      emblemIcon = '🔥';
      mainTitle = this.state.ui('btnFurnace');
      subTitle = this.state.ui('furnaceSub');
    } else if (this.workbenchMode === 'fabricator') {
      emblemIcon = '⚙️';
      mainTitle = this.state.ui('btnFabricator');
      subTitle = this.state.ui('fabricatorSub');
    } else if (this.workbenchMode === 'outpost') {
      emblemIcon = '🧪';
      mainTitle =
        this.state.lang === 'zh'
          ? '前哨科研双模工程台'
          : 'Outpost Field Dual-Workbench';
      subTitle = this.state.ui('outpostSub');
    }

    const emblem = el('div', 'wb-emblem', emblemIcon);
    const titleTextCol = el('div');
    titleTextCol.append(
      el('div', 'wb-title', mainTitle),
      el('div', 'wb-subtitle', subTitle)
    );
    titleRow.append(emblem, titleTextCol);
    header.append(titleRow, this._makeCloseButton());
    this.workbenchDrawer.appendChild(header);

    // 2. Mode Tabs (for Outpost Dual-Workbench OR Portable Blueprint Pad [C])
    if (this.workbenchMode === 'outpost') {
      const bar = el('div', 'wb-controls-bar');
      for (const [modeKey, label] of [
        ['furnace', `🔥 ${this.state.ui('filterFurnace')}`],
        ['fabricator', `⚙️ ${this.state.ui('filterFabricator')}`]
      ]) {
        const b = el(
          'button',
          `hud-btn${this.stationFilter === modeKey ? ' primary' : ''}`,
          label
        );
        b.addEventListener('click', () => {
          this.sound.playUiClick();
          this.stationFilter = modeKey;
          this._renderWorkbenchBody();
        });
        bar.appendChild(b);
      }
      this.workbenchDrawer.appendChild(bar);
    } else if (this.workbenchMode === 'handbook') {
      const bar = el('div', 'wb-controls-bar');
      for (const [modeKey, label] of [
        ['all', this.state.ui('filterAll')],
        ['furnace', `🔥 ${this.state.ui('filterFurnace')}`],
        ['fabricator', `⚙️ ${this.state.ui('filterFabricator')}`]
      ]) {
        const b = el(
          'button',
          `hud-btn${this.stationFilter === modeKey ? ' primary' : ''}`,
          label
        );
        b.addEventListener('click', () => {
          this.sound.playUiClick();
          this.stationFilter = modeKey;
          this._renderWorkbenchBody();
        });
        bar.appendChild(b);
      }
      this.workbenchDrawer.appendChild(bar);
    }

    // 3. Live Processing Queue Strip (shown on real workstations or if queue has active jobs)
    if (this.stationInteractive || this.state.craftingQueue.length > 0) {
      this.queueBoxEl = el('div', 'wb-queue-strip');
      this._renderQueueOnly(true);
      this.workbenchDrawer.appendChild(this.queueBoxEl);
    } else {
      this.queueBoxEl = null;
    }

    // 4. Tactile Schematic Recipe Cards
    const scrollBody = el('div', 'wb-scroll-body');
    const filteredRecipes = RECIPES.filter((r) =>
      this.stationFilter === 'all' ? true : r.station === this.stationFilter
    ).sort((a, b) => {
      const ua = a.unlockLevel <= this.state.currentLevel ? 0 : 1;
      const ub = b.unlockLevel <= this.state.currentLevel ? 0 : 1;
      if (ua !== ub) return ua - ub;
      const da = this.state.diagnoseRecipe(a.id).ok ? 0 : 1;
      const db = this.state.diagnoseRecipe(b.id).ok ? 0 : 1;
      if (da !== db) return da - db;
      return a.unlockLevel - b.unlockLevel;
    });

    const isFurnaceSkin = this.workbenchMode === 'furnace';
    const primaryBtnClass = isFurnaceSkin ? 'amber-primary' : 'primary';

    for (const rec of filteredRecipes) {
      const unlocked = rec.unlockLevel <= this.state.currentLevel;
      const diag = this.state.diagnoseRecipe(rec.id);
      const outMat = MATERIALS[rec.output.id];

      const card = el(
        'div',
        `schematic-card${diag.ok ? ' ready' : ''}${!unlocked ? ' locked' : ''}`
      );

      // --- Card Top Row: Icon + Output Name + Category Badge + Action Buttons ---
      const topRow = el('div', 'schematic-top');
      const outInfo = el('div', 'schematic-out-info');
      outInfo.appendChild(createMaterialIconCanvas(outMat, false));

      const outTextCol = el('div');
      outTextCol.appendChild(
        el('div', 'schematic-title', `${this.state.text(outMat.name)} ×${rec.output.count}`)
      );

      const catKey =
        outMat.category === 'ship_module'
          ? 'badgeShipCore'
          : outMat.category === 'equipment'
            ? 'badgeEquipment'
            : outMat.category === 'subcomponent'
              ? 'badgeSubAssembly'
              : 'badgeRefined';
      outTextCol.appendChild(
        el(
          'span',
          `schematic-cat-badge${outMat.category === 'ship_module' || outMat.category === 'equipment' ? ' core' : ''}`,
          this.state.ui(catKey)
        )
      );
      outInfo.appendChild(outTextCol);

      // Right side of Top Row: Interactive Craft Buttons vs Field Handbook Station Badge!
      const rightCtrl = el('div', 'recipe-actions');
      if (diag.reason === 'already_crafted_main') {
        rightCtrl.appendChild(
          el('span', 'ship-pill online', `✓ ${this.state.ui('btnCraftedOnce')}`)
        );
      } else if (diag.reason === 'already_equipped') {
        rightCtrl.appendChild(
          el('span', 'ship-pill online', this.state.ui('btnEquipped'))
        );
      } else if (this.stationInteractive) {
        const btn = el(
          'button',
          `hud-btn${diag.ok ? ` ${primaryBtnClass}` : ''}`,
          this.state.ui('btnCraft')
        );
        btn.disabled = !diag.ok;
        btn.addEventListener('click', () => {
          const res = this.state.startCraft(rec.id);
          if (res.ok) {
            this.sound.playCraftStart(rec.station);
            this._renderWorkbenchBody();
          } else {
            this.sound.playError();
          }
        });
        rightCtrl.appendChild(btn);

        const maxBatch = this.state.getMaxCraftableCount(rec.id);
        if (!rec.oneTimeMainComponent && maxBatch >= 2) {
          const batchCount = Math.min(maxBatch, 4);
          const batchBtn = el(
            'button',
            `hud-btn ${primaryBtnClass}`,
            this.state.ui('btnCraftBatch', { count: batchCount })
          );
          batchBtn.addEventListener('click', () => {
            let started = 0;
            for (let i = 0; i < batchCount; i++) {
              const r = this.state.startCraft(rec.id);
              if (r.ok) started++;
              else break;
            }
            if (started > 0) {
              this.sound.playCraftStart(rec.station);
              this._renderWorkbenchBody();
            } else {
              this.sound.playError();
            }
          });
          rightCtrl.appendChild(batchBtn);
        }
      } else {
        // In Portable Blueprint Pad [C]: clean informational station badge instead of confusing disabled Craft button!
        const stName =
          rec.station === 'furnace'
            ? `🔥 ${this.state.ui('btnFurnace')}`
            : `⚙️ ${this.state.ui('btnFabricator')}`;
        rightCtrl.appendChild(
          el('span', 'station-loc-pill', this.state.ui('goStationHint', { station: stName }))
        );
      }

      topRow.append(outInfo, rightCtrl);
      card.appendChild(topRow);

      // --- Card Middle Row: Visual Ingredient Schematic Flow ---
      const flowRow = el('div', 'schematic-flow');
      const inputsWrap = el('div', 'schematic-inputs');

      rec.inputs.forEach((inp, idx) => {
        if (idx > 0) {
          inputsWrap.appendChild(el('span', 'flow-arrow', '+'));
        }
        const m = MATERIALS[inp.id];
        const have = this.state.getItemCount(inp.id);
        const enough = have >= inp.count;
        const pill = el('div', `ing-pill ${enough ? 'enough' : 'short'}`);
        pill.appendChild(createMaterialIconCanvas(m, true));
        pill.appendChild(el('span', '', this.state.text(m.name)));
        pill.appendChild(el('span', 'ing-qty', `${have}/${inp.count}`));
        inputsWrap.appendChild(pill);
      });

      const processSymbol = rec.station === 'furnace' ? '━━🔥━━▶' : '━━⚡━━▶';
      const outSummary = el(
        'span',
        'flow-arrow',
        `${processSymbol} ×${rec.output.count}`
      );
      flowRow.append(inputsWrap, outSummary);
      card.appendChild(flowRow);

      // --- Card Footer: Unlock Level or Missing Source Region Guidance ---
      if (!unlocked) {
        card.appendChild(
          el(
            'div',
            'schematic-footer',
            `🔒 ${this.state.ui('unlockedAtLevel', { level: rec.unlockLevel })}`
          )
        );
      } else if (diag.missing.length > 0 && diag.reason !== 'already_crafted_main') {
        const missText = diag.missing
          .map((m) => {
            const name = this.state.text(MATERIALS[m.id].name);
            const where = m.craftedIn
              ? m.craftedIn === 'furnace'
                ? this.state.ui('btnFurnace')
                : this.state.ui('btnFabricator')
              : m.regions.join(' / ');
            return `${m.missingCount}× ${name} (${where})`;
          })
          .join(' • ');
        card.appendChild(
          el(
            'div',
            'schematic-footer',
            `📍 ${this.state.ui('missingMaterials', { items: missText })}`
          )
        );
      }

      scrollBody.appendChild(card);
    }

    this.workbenchDrawer.appendChild(scrollBody);
  }

  openInspectModal(titleText, bodyText) {
    this.workbenchDrawer.classList.add('hidden');
    this.activeModal = 'inspect';
    this.modalBackdrop.classList.remove('hidden', 'title-mode');
    clearChildren(this.modalPanel);

    const header = el('div', 'modal-header');
    header.append(el('div', 'modal-title', titleText), this._makeCloseButton());

    const body = el('div', 'hero-sub', bodyText);
    body.style.marginTop = '8px';

    this.modalPanel.append(header, body);
  }

  openLevelCompleteModal(levelDef) {
    this.workbenchDrawer.classList.add('hidden');
    this.topRight.classList.remove('hidden');
    this.activeModal = 'level_complete';
    this.modalBackdrop.classList.remove('hidden', 'title-mode');
    clearChildren(this.modalPanel);

    const wrap = el('div', 'hero-panel');
    wrap.style.margin = '0 auto';
    const title = el('div', 'hero-title', this.state.ui('levelCompleteTitle'));
    const sub = el('div', 'level-header', this.state.text(levelDef.title));
    sub.style.marginBottom = '14px';

    const unlockBox = el('div', 'queue-box');
    unlockBox.style.textAlign = 'left';
    unlockBox.appendChild(el('div', 'section-label', this.state.ui('unlockedHeader')));
    for (const u of levelDef.unlockSummary) {
      unlockBox.appendChild(el('div', 'step-row done', `★ ${this.state.text(u)}`));
    }

    const btnCont = el('button', 'hud-btn primary', this.state.ui('btnContinueNext'));
    btnCont.addEventListener('click', () => this.closeModal());

    wrap.append(title, sub, unlockBox, btnCont);
    this.modalPanel.appendChild(wrap);
  }

  openPauseModal() {
    this.workbenchDrawer.classList.add('hidden');
    this.topRight.classList.remove('hidden');
    this.activeModal = 'pause';
    this.modalBackdrop.classList.remove('hidden', 'title-mode');
    clearChildren(this.modalPanel);

    const header = el('div', 'modal-header');
    header.append(
      el('div', 'modal-title', this.state.ui('btnPause')),
      this._makeCloseButton()
    );
    this.modalPanel.appendChild(header);

    // 1. User-Customizable HUD & Non-Essential Hints Box!
    const prefBox = el('div', 'queue-box');
    prefBox.appendChild(el('div', 'section-label', this.state.ui('hudPrefsLabel')));
    const prefRow = el('div', 'station-tabs');
    prefRow.style.flexWrap = 'wrap';

    const prefItems = [
      ['guideArrow', 'prefGuideArrow'],
      ['showCompass', 'prefTopCompass'],
      ['showWorldLabels', 'prefWorldLabels'],
      ['showIdleTips', 'prefIdleTips']
    ];
    for (const [pKey, labelKey] of prefItems) {
      const enabled = this.state.settings[pKey] !== false;
      const pb = el(
        'button',
        `hud-btn${enabled ? ' primary' : ''}`,
        `${enabled ? '✓ ' : '○ '}${this.state.ui(labelKey)}`
      );
      pb.addEventListener('click', () => {
        this.sound.playUiClick();
        this.state.setHudPref(pKey, !enabled);
        this.openPauseModal();
      });
      prefRow.appendChild(pb);
    }
    prefBox.appendChild(prefRow);
    this.modalPanel.appendChild(prefBox);

    // 2. Audio, Language & Graphics Quality Settings (accessible on mobile & small screens!)
    const qBox = el('div', 'queue-box');
    qBox.appendChild(el('div', 'section-label', this.state.ui('qualityLabel')));
    const qRow = el('div', 'station-tabs');
    qRow.style.flexWrap = 'wrap';
    for (const [qVal, qKey] of [
      ['high', 'qualityHigh'],
      ['medium', 'qualityMedium'],
      ['low', 'qualityLow']
    ]) {
      const qb = el(
        'button',
        `hud-btn${this.state.settings.quality === qVal ? ' primary' : ''}`,
        this.state.ui(qKey)
      );
      qb.addEventListener('click', () => {
        this.sound.playUiClick();
        this.state.setQuality(qVal);
        this.actions.onQualityChange(qVal);
        this.openPauseModal();
      });
      qRow.appendChild(qb);
    }

    const audioBtn = el(
      'button',
      `hud-btn${!this.state.settings.muted ? ' primary' : ''}`,
      this.state.settings.muted ? this.state.ui('audioOff') : this.state.ui('audioOn')
    );
    audioBtn.addEventListener('click', () => {
      this.state.setMuted(!this.state.settings.muted);
      this.sound.setMuted(this.state.settings.muted);
      if (!this.state.settings.muted) this.sound.playUiClick();
      this.openPauseModal();
    });

    const langBtn = el('button', 'hud-btn', this.state.ui('langToggle'));
    langBtn.addEventListener('click', () => {
      this.sound.playUiClick();
      this.state.setLang(this.state.lang === 'en' ? 'zh' : 'en');
      this.openPauseModal();
    });

    qRow.append(audioBtn, langBtn);
    qBox.appendChild(qRow);
    this.modalPanel.appendChild(qBox);

    const actCol = el('div', 'recipe-grid');

    const btnResume = el('button', 'hud-btn primary', this.state.ui('btnResume'));
    btnResume.addEventListener('click', () => this.closeModal());

    const btnUnstuck = el('button', 'hud-btn', this.state.ui('btnRestartLevel'));
    btnUnstuck.addEventListener('click', () => {
      this.closeModal();
      this.actions.onUnstuck();
    });

    actCol.append(btnResume, btnUnstuck);

    if (!this.confirmingReset) {
      const btnReset = el('button', 'hud-btn', this.state.ui('btnResetGame'));
      btnReset.addEventListener('click', () => {
        this.sound.playUiClick();
        this.confirmingReset = true;
        this.openPauseModal();
      });
      actCol.appendChild(btnReset);
    } else {
      const confirmBox = el('div', 'queue-box');
      confirmBox.appendChild(el('div', 'recipe-missing', this.state.ui('confirmReset')));
      const cRow = el('div', 'station-tabs');
      cRow.style.marginTop = '8px';
      const yesBtn = el('button', 'hud-btn primary', this.state.ui('btnConfirmYes'));
      yesBtn.addEventListener('click', () => {
        this.closeModal();
        this.actions.onResetGame();
      });
      const noBtn = el('button', 'hud-btn', this.state.ui('btnCancel'));
      noBtn.addEventListener('click', () => {
        this.confirmingReset = false;
        this.openPauseModal();
      });
      cRow.append(yesBtn, noBtn);
      confirmBox.appendChild(cRow);
      actCol.appendChild(confirmBox);
    }

    this.modalPanel.appendChild(actCol);
  }

  openEndingModal() {
    this.workbenchDrawer.classList.add('hidden');
    this.activeModal = 'ending';
    this.modalBackdrop.classList.remove('hidden', 'title-mode');
    clearChildren(this.modalPanel);

    const wrap = el('div', 'hero-panel');
    wrap.style.margin = '0 auto';

    const title = el('div', 'hero-title', this.state.ui('endingTitle'));
    const sub = el('div', 'hero-sub', this.state.ui('endingSubtitle'));

    const statsGrid = el('div', 'stats-grid');
    const globalProg = this.state.getGlobalRepairProgress();
    const sideCount = this.state.getAllCompletedSideTaskCount();
    const logsCount = Object.keys(this.state.logsRead).length;
    const totalLogs = Object.keys(CREW_LOGS).length;

    const statItems = [
      [this.state.ui('statSystems'), `${globalProg.repairedCount}/${globalProg.totalSystems}`],
      [this.state.ui('statSideTasks'), `${sideCount.done}/${sideCount.total}`],
      [this.state.ui('statLogs'), `${logsCount}/${totalLogs}`],
      [this.state.ui('statCrafted'), String(this.state.stats.totalCrafted)]
    ];

    for (const [label, val] of statItems) {
      const box = el('div', 'stat-box');
      box.append(el('div', 'mission-summary', label), el('div', 'stat-val', val));
      statsGrid.appendChild(box);
    }

    const actions = el('div', 'hero-actions');
    const btnReplay = el('button', 'hud-btn primary', this.state.ui('btnReplayLaunch'));
    btnReplay.addEventListener('click', () => {
      this.closeModal();
      this.actions.onReplayLaunch();
    });

    const btnRoam = el('button', 'hud-btn', this.state.ui('btnFreeRoam'));
    btnRoam.addEventListener('click', () => {
      this.closeModal();
      this.actions.onFreeRoam();
    });

    const btnAgain = el('button', 'hud-btn', this.state.ui('btnPlayAgain'));
    btnAgain.addEventListener('click', () => {
      this.closeModal();
      this.actions.onResetGame();
    });

    actions.append(btnReplay, btnRoam, btnAgain);
    wrap.append(title, sub, statsGrid, actions);
    this.modalPanel.appendChild(wrap);
  }

  _makeCloseButton() {
    const isTouch =
      typeof document !== 'undefined' &&
      document.body.classList.contains('touch-active');
    const txt = isTouch
      ? this.state.ui('btnClose').replace(/\s*\[[^\]]+\]/g, '')
      : this.state.ui('btnClose');
    const btn = el('button', 'hud-btn', txt);
    btn.addEventListener('click', () => this.closeModal());
    return btn;
  }
}
