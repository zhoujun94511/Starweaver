import { HOMEWORLD_LANDMARKS, HOMEWORLD_CALIBRATION, HOMEWORLD_COPY } from '../data/homeworldActivities.js';
import { el, clearChildren } from './domHelpers.js';
import { createCollapsibleDrawer, createJetpackPill, clearHudRegion } from './hudPrimitives.js';
import { createMaterialIconCanvas } from './materialIcons.js';
import { formatSolarFluxBadge, renderQueueOnly, renderWorkbenchBody } from './workbenchModal.js';
import { renderPauseModal } from './pauseSettingsModal.js';
import {
  CREW_LOGS,
  EQUIPMENT_DEFS,
  LEVELS,
  MATERIALS,
  RECIPES,
  REGIONS,
  STATION_TYPES,
  locateRegionId
} from '../data/gameData.js';

const HOMEWORLD_HUD_COPY = {
  navigation: { zh: '家园巡检引导', en: 'Homeworld watch guidance' },
  guideArrow: { zh: '3D 巡检方向标', en: '3D watch direction marker' },
  compass: { zh: '下一处巡检地点', en: 'Next watch destination' },
  environment: { zh: '翡翠河谷', en: 'Emerald Valley' },
  environmentNote: {
    zh: '晴朗日光下的生态聚落。沿步道探索观测坡、生态苗圃与河岸能源站，巡检进度会自动保存。',
    en: 'A sunlit ecological settlement. Follow the paths to the observatory, nursery and riverside power station. Watch progress is saved automatically.'
  },
  resume: { zh: '继续家园漫游', en: 'Resume homeworld stroll' },
  unstuck: { zh: '返回停机坪（脱困）', en: 'Return to the landing pad (unstuck)' },
  controls: {
    zh: 'WASD / 方向键 移动 · 拖动 转视角 · 滚轮 缩放 · E 交谈/设备 · F 详情 · C 巡检手账 · Space 喷气 · Esc 设置',
    en: 'WASD / arrows Move · Drag Orbit · Wheel Zoom · E Talk / device · F Details · C Watch journal · Space Jetpack · Esc Settings'
  },
  touchControls: {
    zh: '左摇杆移动 · 拖动画面转视角 · 双指缩放 · 靠近角色或设备交谈/操作 · 巡检手账查看下一站',
    en: 'Joystick Move · Drag Orbit · Pinch Zoom · Approach crew or devices to interact · Watch journal Next stop'
  }
};
const DESERT_FEEDBACK_EVENTS = new Set([
  'craft_completed', 'equipment_unlocked', 'drone_delivered', 'side_task_completed', 'level_completed'
]);

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
    this.inHomeworldRoamMode = false;
    this._worldPlane = 'desert';
    this._worldRegionId = null;
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
    if (this.hwLeftTab && this.hwLeftBody) {
      this.hwLeftTab.classList.toggle('hidden', !this.leftCollapsed);
      this.hwLeftBody.classList.toggle('hidden', this.leftCollapsed);
    }
    if (this.hwBagTab && this.hwBagBody) {
      this.hwBagTab.classList.toggle('hidden', !this.bagCollapsed);
      this.hwBagBody.classList.toggle('hidden', this.bagCollapsed);
    }
  }

  _buildDomSkeleton() {
    clearChildren(this.root);

    // 1. Top-Left: Collapsible Slide-Away Mission & Side-Tasks Drawer (shared primitive)
    const desertMissionDrawer = createCollapsibleDrawer({
      wrapClass: 'hud-top-left',
      tabClass: 'drawer-pill-tab left-pill hidden',
      bodyClass: 'left-drawer-body',
      cardClass: 'hud-card mission-card',
      titleClass: 'level-header',
      withMiniProgress: true,
      onExpand: () => {
        this.sound.playUiClick();
        this.setLeftCollapsed(false, true);
      },
      onCollapse: () => {
        this.sound.playUiClick();
        this.setLeftCollapsed(true, true);
      }
    });
    this.topLeft = desertMissionDrawer.wrap;
    this.leftDrawerTab = desertMissionDrawer.tab;
    this.leftTabLabelEl = desertMissionDrawer.tabLabel;
    this.leftTabMiniFill = desertMissionDrawer.miniFill;
    this.leftDrawerBody = desertMissionDrawer.body;
    this.missionCard = desertMissionDrawer.card;
    this.levelTitleEl = desertMissionDrawer.titleEl;
    this.missionFoldBtn = desertMissionDrawer.foldBtn;

    this.missionSummaryEl = el('div', 'mission-summary');
    this.levelProgressBar = el('div', 'progress-bar-track');
    this.levelProgressFill = el('div', 'progress-bar-fill');
    this.levelProgressBar.appendChild(this.levelProgressFill);
    this.stepsContainer = el('div', 'step-list');
    this.missionCard.append(
      this.missionSummaryEl,
      this.levelProgressBar,
      this.stepsContainer
    );

    this.sideCard = el('div', 'hud-card side-card');
    this.sideHeaderEl = el('div', 'section-label');
    this.sideListEl = el('div', 'side-list');
    this.sideCard.append(this.sideHeaderEl, this.sideListEl);

    this.leftDrawerBody.append(this.sideCard);

    // 1.5 Top-Center: Smart Next-Step Guidance Compass Pill (with quick hide × button!)
    this.topCenter = el('div', 'hud-top-center');
    this.compassBadgeEl = el('span', 'compass-badge');
    this.compassTextEl = el('span', 'compass-text');
    this.compassDistEl = el('span', 'compass-dist');
    this.compassHideBtn = el('button', 'compass-close-btn', '×');
    this.compassHideBtn.title = this.state.ui('compassHideTitle');
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
        this.setHomeworldActionsOpen?.(false);
      } else if (!this._shouldAutoCollapseDrawers()) {
        // Restore expanded drawers on wide desktop screens when toggling back to Full Hints!
        this.setLeftCollapsed(false, true);
        this.setBagCollapsed(false, true);
        this.setRightCollapsed(false, true);
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
    const desertJetPill = createJetpackPill({
      wrapClass: 'mini-jet-pill hidden',
      pctClass: 'mini-jet-pct'
    });
    this.miniJetWrap = desertJetPill.wrap;
    this.miniJetFillEl = desertJetPill.fillEl;
    this.miniJetPctEl = desertJetPill.pctEl;
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
    this.shipHomeworldWrap = el('div');
    this.shipHomeworldWrap.style.marginTop = '8px';
    this.shipCard.append(shipHeadRow, this.shipBarTrack, this.shipPillsEl, this.shipHomeworldWrap);

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

    // 3. Bottom-Left: Collapsible Cargo Drawer (shared primitive)
    const desertBagDrawer = createCollapsibleDrawer({
      wrapClass: 'hud-bottom-left-wrap',
      tabClass: 'drawer-pill-tab bag-pill hidden',
      bodyClass: 'hud-card hud-bottom-left-card',
      titleClass: 'section-label',
      onExpand: () => {
        this.sound.playUiClick();
        this.setBagCollapsed(false, true);
      },
      onCollapse: () => {
        this.sound.playUiClick();
        this.setBagCollapsed(true, true);
      }
    });
    this.bottomLeft = desertBagDrawer.wrap;
    this.bagDrawerTab = desertBagDrawer.tab;
    this.bagCardBody = desertBagDrawer.body;
    this.invHeaderEl = desertBagDrawer.titleEl;
    this.invHeaderEl.style.marginBottom = '0';
    this.bagFoldBtn = desertBagDrawer.foldBtn;
    this.invGridEl = el('div', 'inv-grid');
    this.bagCardBody.appendChild(this.invGridEl);

    this._applyDrawerVisibility();

    // 4. Bottom-Center: Aerial/Resonance Status Pill + Toast + Idle Hint + Nearby Interaction Prompt + Control Guide Footer
    this.bottomCenter = el('div', 'hud-bottom-center');
    this.aerialStatusPill = el('div', 'toast-banner hidden');
    this.aerialStatusPill.style.borderColor = '#5ce8ff';
    this.aerialStatusPill.style.fontSize = '12px';
    this.aerialStatusPill.style.padding = '5px 12px';
    this._lastAerialStatusText = '';
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

    this.bottomCenter.append(this.aerialStatusPill, this.toastEl, this.hintBannerEl, this.promptBox);
    this.controlsFooter = el('div', 'controls-footer');

    // 5. Diegetic Right-Side Workbench Console & Portable Blueprint Pad (No full-screen blur!)
    this.workbenchDrawer = el('div', 'workbench-drawer hidden');

    // 6. Intro & Launch Cutscene Cinema Letterbox & Subtitles
    this.cinemaOverlay = el('div', 'cinema-overlay hidden');
    const cTop = el('div', 'cinema-bar-top');
    this.cinemaSkipBtn = el('button', 'cinema-skip-btn');
    this.cinemaSkipBtn.addEventListener('click', () => {
      if (this._cinemaKind === 'launch' && this.actions.onSkipLaunch) {
        this.actions.onSkipLaunch();
      } else if (this.actions.onSkipIntro) {
        this.actions.onSkipIntro();
      }
    });
    cTop.appendChild(this.cinemaSkipBtn);

    const cBot = el('div', 'cinema-bar-bottom');
    this.cinemaSubtitleEl = el('div', 'cinema-subtitle');
    this.cinemaDotsEl = el('div', 'cinema-dots');
    this.cinemaDotNodes = [
      el('span', 'cinema-dot'),
      el('span', 'cinema-dot'),
      el('span', 'cinema-dot'),
      el('span', 'cinema-dot')
    ];
    this.cinemaDotsEl.append(...this.cinemaDotNodes);
    cBot.append(this.cinemaSubtitleEl, this.cinemaDotsEl);
    this.cinemaOverlay.append(cTop, cBot);

    // 6.5 Homeworld Meadow Free-Stroll Top Floating Pill!
    this.homeworldBar = el('div', 'homeworld-roam-bar hidden');
    this.homeworldBarTitle = el('button', 'homeworld-roam-title');
    this.homeworldBarTitle.type = 'button';
    this.homeworldBarTitle.setAttribute('aria-expanded', 'false');
    this.setHomeworldActionsOpen = (open) => {
      const next = Boolean(open);
      this.homeworldBar?.classList.toggle('menu-open', next);
      this.homeworldBarTitle?.setAttribute('aria-expanded', String(next));
      this.homeworldActionsDock?.classList.toggle('menu-open', next);
    };
    this.homeworldBarTitle.addEventListener('click', () => {
      this.sound.playUiClick();
      const expanded = !this.homeworldBar.classList.contains('menu-open');
      this.setHomeworldActionsOpen(expanded);
    });
    this.homeworldObjective = el('button', 'hw-objective-pill');
    this.homeworldObjective.type = 'button';
    this.homeworldObjective.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setHomeworldActionsOpen(false);
      this.actions.onHomeworldJournal?.();
    });
    this.btnHwSummary = el('button', 'hud-btn primary');
    this.btnHwSummary.addEventListener('click', () => {
      this.sound.playModalOpen();
      this.setHomeworldActionsOpen(false);
      this.openEndingModal();
    });
    this.btnHwDesert = el('button', 'hud-btn');
    this.btnHwDesert.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setHomeworldActionsOpen(false);
      if (this.actions.onFreeRoam) this.actions.onFreeRoam();
    });
    this.btnHwReplay = el('button', 'hud-btn');
    this.btnHwReplay.addEventListener('click', () => {
      this.sound.playUiClick();
      this.setHomeworldActionsOpen(false);
      if (this.actions.onReplayLaunch) this.actions.onReplayLaunch();
    });
    // Keep one settings action and its original listener in both worlds.
    this.btnHwPause = this.btnPause;
    const hwJetPill = createJetpackPill({
      wrapClass: 'hw-jet-pill hidden',
      pctClass: 'hw-jet-pct'
    });
    this.hwJetWrap = hwJetPill.wrap;
    this.hwJetLabel = hwJetPill.labelEl;
    this.hwJetFillEl = hwJetPill.fillEl;
    this.hwJetPctEl = hwJetPill.pctEl;
    this._jetpackPills = [desertJetPill, hwJetPill];

    this.homeworldBar.append(
      this.homeworldBarTitle,
      this.homeworldObjective,
      this.hwJetWrap
    );
    this.homeworldActionsDock = el('div', 'homeworld-actions-dock hidden');
    this.homeworldActionsDock.append(
      this.btnHwSummary,
      this.btnHwDesert,
      this.btnHwReplay
    );
    this.homeworldHeader = el('div', 'homeworld-header hidden');
    this.homeworldHeader.appendChild(this.homeworldBar);

    // 6.6 Homeworld-Dedicated Mission & Ecological Archive Drawers (shared primitive, isolated DOM)
    const hwMissionDrawer = createCollapsibleDrawer({
      wrapClass: 'hud-top-left hw-mission-drawer hidden',
      tabClass: 'drawer-pill-tab left-pill hw-emerald-pill hidden',
      bodyClass: 'left-drawer-body',
      cardClass: 'hud-card mission-card hw-emerald-card',
      titleClass: 'level-header hw-emerald-title',
      withMiniProgress: true,
      onExpand: () => {
        this.sound.playUiClick();
        this.setLeftCollapsed(false, true);
      },
      onCollapse: () => {
        this.sound.playUiClick();
        this.setLeftCollapsed(true, true);
      }
    });
    this.hwMissionWrap = hwMissionDrawer.wrap;
    this.hwLeftTab = hwMissionDrawer.tab;
    this.hwLeftTabLabel = hwMissionDrawer.tabLabel;
    this.hwLeftMiniFill = hwMissionDrawer.miniFill;
    this.hwLeftBody = hwMissionDrawer.body;
    this.hwTitleEl = hwMissionDrawer.titleEl;
    this.hwFoldBtn = hwMissionDrawer.foldBtn;
    const hwMissionCard = hwMissionDrawer.card;

    this.hwSummaryEl = el('div', 'mission-summary');
    const hwProgTrack = el('div', 'progress-bar-track');
    this.hwProgFill = el('div', 'progress-bar-fill');
    hwProgTrack.appendChild(this.hwProgFill);
    this.hwStepsList = el('div', 'step-list');
    this.hwViewBtnWrap = el('div');
    this.hwViewBtnWrap.style.marginTop = '8px';
    this.hwTelemetrySection = el('div', 'side-tasks-section');
    this.hwTelemetrySection.style.marginTop = '10px';
    this.hwTelemetryHeaderEl = el('div', 'section-label');
    this.hwTelemetryListEl = el('div', 'side-list');
    this.hwTelemetrySection.append(this.hwTelemetryHeaderEl, this.hwTelemetryListEl);
    hwMissionCard.append(
      this.hwSummaryEl,
      hwProgTrack,
      this.hwStepsList,
      this.hwViewBtnWrap,
      this.hwTelemetrySection
    );

    const hwArchiveDrawer = createCollapsibleDrawer({
      wrapClass: 'hud-bottom-left-wrap hw-archive-drawer hidden',
      tabClass: 'drawer-pill-tab bag-pill hw-emerald-pill hidden',
      bodyClass: 'hud-card hud-bottom-left-card hw-emerald-card',
      titleClass: 'section-label',
      onExpand: () => {
        this.sound.playUiClick();
        this.setBagCollapsed(false, true);
      },
      onCollapse: () => {
        this.sound.playUiClick();
        this.setBagCollapsed(true, true);
      }
    });
    this.hwArchiveWrap = hwArchiveDrawer.wrap;
    this.hwBagTab = hwArchiveDrawer.tab;
    this.hwBagBody = hwArchiveDrawer.body;
    this.hwArchiveTitleEl = hwArchiveDrawer.titleEl;
    this.hwArchiveTitleEl.style.marginBottom = '0';
    this.hwBagFoldBtn = hwArchiveDrawer.foldBtn;
    this.hwArchiveGrid = el('div', 'inv-grid');
    this.hwBagBody.appendChild(this.hwArchiveGrid);

    this._applyDrawerVisibility();

    // 7. Modal Backdrop (Title, Pause, Inspect, Level Complete, Ending)
    this.modalBackdrop = el('div', 'modal-backdrop hidden');
    this.modalPanel = el('div', 'modal-panel');
    this.modalBackdrop.appendChild(this.modalPanel);

    this.root.append(
      this.topLeft,
      this.topCenter,
      this.topRight,
      this.bottomLeft,
      this.hwMissionWrap,
      this.hwArchiveWrap,
      this.bottomCenter,
      this.controlsFooter,
      this.homeworldHeader,
      this.homeworldActionsDock,
      this.workbenchDrawer,
      this.cinemaOverlay,
      this.modalBackdrop
    );
  }

  _bindStateEvents() {
    this.state.on((event, detail) => {
      // Language changes can happen while a toast, idle hint, compass or cinema
      // subtitle is still on screen. Those transient strings were produced by
      // the previous locale and otherwise survive until their own timer/next
      // world tick, which is the source of intermittent mixed-language HUD.
      // Invalidate all locale-sensitive caches immediately and let the next
      // authoritative render repopulate them from GameState.text/ui().
      if (event === 'settings_changed' && detail && detail.lang) {
        this.toastTimer = 0;
        if (this.toastEl) {
          this.toastEl.className = 'toast-banner hidden';
          this.toastEl.textContent = '';
        }
        this._lastCompassSig = '';
        this._lastPromptSig = '';
        this._lastHintSig = '';
        this._lastQueueSig = '';
        this._lastIntroSig = '';
        this._homeworldObjectiveSig = '';
        this.homeworldObjective.textContent = this.state.text(HOMEWORLD_COPY.journal);
        if (this.activeModal === 'homeworld_journal' && this._homeworldActivity) {
          this.openHomeworldJournal(this._homeworldActivity);
        } else if (this.activeModal === 'homeworld_calibration' && this._homeworldCalibrationAction) {
          this.openHomeworldCalibration(this._homeworldCalibrationAction);
        }
        // A subtitle is passed in as a resolved string by the cutscene driver,
        // so it cannot be translated safely here. Hide it for this frame; the
        // cutscene's next act will provide the new locale string.
        if (this.cinemaOverlay && !this.cinemaOverlay.classList.contains('hidden')) {
          this.cinemaOverlay.classList.add('hidden');
        }
      }
      if (
        event === 'world_plane_changed' ||
        event === 'homeworld_survey_changed' ||
        event === 'mechanism_updated' ||
        event === 'log_read' ||
        event === 'side_task_completed' ||
        event === 'game_launched'
      ) {
        this._lastCompassSig = '';
        this._lastPromptSig = '';
        this._homeworldObjectiveSig = '';
      }
      if (this.inHomeworldRoamMode && DESERT_FEEDBACK_EVENTS.has(event)) {
        this.renderAll();
        return;
      }
      if (event === 'craft_completed') {
        const mat = MATERIALS[detail.outputId];
        this.showToast(`+${detail.count} ${this.state.text(mat.name)}`, 'good');
        this.sound.playCraftComplete();
      }
      if (event === 'equipment_unlocked') {
        this.sound.playRepairInstall();
        const eqDef = EQUIPMENT_DEFS[detail.slot];
        const toastKey = eqDef ? eqDef.toastKey : 'equipJetpackToast';
        this.showToast(this.state.ui(toastKey), 'celebrate');
      }
      if (event === 'drone_delivered') {
        const mat = MATERIALS[detail.materialId];
        if (mat && this.activeModal === null) {
          this.showToast(
            this.state.ui('droneDeliverToast', {
              count: detail.count,
              name: this.state.text(mat.name)
            }),
            'good'
          );
        }
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
    if (this.inHomeworldRoamMode) {
      this.topLeft.classList.add('hidden');
      this.topRight.classList.add('hidden');
      this.bottomLeft.classList.add('hidden');
    } else {
      if (this.hwMissionWrap) this.hwMissionWrap.classList.add('hidden');
      if (this.hwArchiveWrap) this.hwArchiveWrap.classList.add('hidden');
    }
    if (visible) {
      this._lastCompassSig = '';
      this._lastPromptSig = '';
      this._lastHintSig = '';
      this._lastFuelPct = -1;
    }
  }

  setIntroOverlay(visible, actIndex = 0, subtitleText = '', totalActs = 3, kind = 'intro') {
    if (!visible) {
      if (this._lastIntroSig !== 'hidden') {
        this._lastIntroSig = 'hidden';
        this.cinemaOverlay.classList.add('hidden');
      }
      return;
    }
    this._cinemaKind = kind;
    const sig = `${kind}|${actIndex}|${totalActs}|${subtitleText}`;
    if (this._lastIntroSig === sig) return;
    this._lastIntroSig = sig;

    this.cinemaOverlay.classList.remove('hidden');
    this.cinemaSkipBtn.textContent = this.state.ui(
      kind === 'launch' ? 'launchSkipBtn' : 'introSkipBtn'
    );
    this.cinemaSubtitleEl.textContent = subtitleText;
    this.cinemaDotNodes.forEach((dot, idx) => {
      if (idx >= totalActs) {
        dot.className = 'cinema-dot hidden';
      } else {
        dot.className = idx === actIndex ? 'cinema-dot active' : 'cinema-dot';
      }
    });
  }

  setHomeworldRoamVisible(visible) {
    const changed = this.inHomeworldRoamMode !== Boolean(visible);
    this.inHomeworldRoamMode = Boolean(visible);
    if (!this.homeworldBar) return;
    this.homeworldBar.classList.toggle('hidden', !visible);
    this.homeworldHeader.classList.toggle('hidden', !visible);
    if (this.homeworldActionsDock) this.homeworldActionsDock.classList.toggle('hidden', !visible);
    if (this.hwMissionWrap) this.hwMissionWrap.classList.toggle('hidden', !visible);
    if (this.hwArchiveWrap) this.hwArchiveWrap.classList.toggle('hidden', !visible);
    if (this.controlsFooter) this.controlsFooter.classList.toggle('hidden', !visible);
    // Moving the original toolbar preserves every global control, listener and
    // locale update. Hiding desert progress must not hide the settings with it.
    if (visible) {
      this.homeworldHeader.appendChild(this.toolbarRow);
      this.toolbarRow.classList.add('homeworld-utility-row');
      // The toolbar has already moved into the homeworld header. Hide the desert
      // mission, ship and cargo drawers themselves so their old text cannot sit
      // underneath the valley watch.
      for (const node of [this.topLeft, this.topRight, this.bottomLeft]) {
        if (node) node.classList.add('hidden');
      }
    } else {
      this.topRight.insertBefore(this.toolbarRow, this.topRight.firstChild);
      this.toolbarRow.classList.remove('homeworld-utility-row');
    }
    this.bottomCenter.classList.toggle('hidden', !visible);
    if (visible) {
      this._lastFuelPct = -1;
      this._lastPromptSig = '';
      this._homeworldObjectiveSig = '';
      this.homeworldBar.classList.remove('menu-open');
      this.homeworldActionsDock?.classList.remove('menu-open');
      this.homeworldBarTitle.setAttribute('aria-expanded', 'false');
      this._syncHomeworldBarTexts();
    }
    if (changed) {
      // Resolved strings from the old world cannot survive into a different
      // interaction context while waiting for the next guidance frame.
      this.toastTimer = 0;
      for (const node of [this.toastEl, this.hintBannerEl, this.promptBox, this.topCenter]) node.classList.add('hidden');
      for (const node of [this.toastEl, this.hintTextEl, this.promptMainText, this.promptSubText,
        this.compassTextEl, this.compassDistEl]) node.textContent = '';
      this._lastCompassSig = this._lastPromptSig = this._lastHintSig = this._homeworldObjectiveSig = '';
      if (visible) {
        if (this.activeModal === 'station') this.closeModal();
        clearHudRegion(
          ['levelTitleEl', 'missionSummaryEl', 'leftTabLabelEl', 'sideHeaderEl',
            'shipHeaderEl', 'rightExpandBtn', 'invHeaderEl', 'bagDrawerTab', 'jetpackLabelEl'].map((k) => this[k]),
          ['stepsContainer', 'sideListEl', 'shipPillsEl', 'shipHomeworldWrap', 'gearBadgesRow', 'invGridEl'].map((k) => this[k])
        );
      } else {
        clearHudRegion(
          ['hwTitleEl', 'hwSummaryEl', 'hwLeftTabLabel', 'hwArchiveTitleEl', 'hwBagTab', 'hwTelemetryHeaderEl'].map((k) => this[k]),
          ['hwStepsList', 'hwArchiveGrid', 'hwViewBtnWrap', 'hwTelemetryListEl'].map((k) => this[k])
        );
      }
      if (this.activeModal !== 'title' && this.activeModal !== 'ending') {
        this.renderAll();
      }
    }
  }

  updateHomeworldObjective(waypoint) {
    if (waypoint?.worldPlane !== 'homeworld') return;
    const survey = this.state.homeworldSurvey;
    const count = HOMEWORLD_LANDMARKS.reduce((total, point) => total + Number(survey.records[point.id]), 0);
    const beaconProg =
      typeof this.state.getMechanismProgress === 'function'
        ? this.state.getMechanismProgress('weather_beacons')
        : { done: 0, total: 5 };
    const progress = survey.completed ? (this.state.lang === 'zh' ? '返航纪念章 ✓' : 'Medallion ✓') :
      `${this.state.lang === 'zh' ? '巡检' : 'Watch'} ${count}/3${count === 3 ? ` · ⚡${survey.calibration}/3` : ''}`;
    const telemetrySuffix =
      survey.completed && beaconProg.done > 0 ? ` · 📡${beaconProg.done}/${beaconProg.total}` : '';
    const text = survey.completed ? `${progress}${telemetrySuffix}` : `${progress} · ${waypoint.label} ${waypoint.distMeters}m`;
    if (this._homeworldObjectiveSig === text) return;
    this._homeworldObjectiveSig = text;
    this.homeworldObjective.textContent = text;
    this.homeworldObjective.title = `${this.state.text(HOMEWORLD_COPY.journal)}: ${text}`;
    this.homeworldObjective.setAttribute('aria-label', this.homeworldObjective.title);
  }

  _syncHomeworldBarTexts() {
    if (!this.homeworldBar) return;
    this.homeworldBarTitle.textContent = this.state.ui('homeworldBannerTitle');
    this.btnHwSummary.textContent = this.state.ui('homeworldShowSummary');
    this.btnHwDesert.textContent = this.state.ui('homeworldReturnKharis');
    this.btnHwReplay.textContent = this.state.ui('btnReplayLaunch');
    this.homeworldObjective.classList.toggle('hidden', this.state.settings.showCompass === false);
    if (this.btnHwPause) {
      this.btnHwPause.textContent = this.state.lang === 'zh' ? '⚙ 设置' : '⚙ Menu';
    }
    if (this.hwJetWrap) {
      this.hwJetWrap.classList.toggle('hidden', !this.state.hasEquipment('jetpack'));
    }
  }

  noteWorldFocus(plane, x, z) {
    const nextPlane = plane === 'homeworld' ? 'homeworld' : 'desert';
    const regionId = nextPlane === 'homeworld' ? null : locateRegionId(x, z);
    if (this._worldPlane === nextPlane && this._worldRegionId === regionId) return;
    this._worldPlane = nextPlane;
    this._worldRegionId = regionId;
    if (
      this.inHomeworldRoamMode ||
      this.activeModal === 'title' ||
      this.activeModal === 'ending'
    ) {
      return;
    }
    this.renderAll();
  }

  _sceneLevelDef() {
    if (!this._worldRegionId) return null;
    const level = LEVELS.find((entry) => entry.regionId === this._worldRegionId);
    if (!level || level.level > (this.state.currentLevel || 1)) return null;
    return level;
  }

  _focusLevelNumber() {
    const regionId = this.activeStationFacility?.region || this._worldRegionId || null;
    if (regionId) {
      const level = LEVELS.find((entry) => entry.regionId === regionId);
      if (level) return Math.min(level.level, this.state.currentLevel || level.level);
    }
    return this.state.currentLevel || 1;
  }

  _regionShortName(regionId) {
    const region = regionId ? REGIONS[regionId] : null;
    if (!region) return '';
    return this.state.text(region.name).split(/[（(]/)[0].trim();
  }

  showToast(message, style = 'good') {
    this.toastEl.textContent = message;
    this.toastEl.className = `toast-banner ${style}`;
    this.toastTimer = 3.6;
  }

  updateFrame(dt, nearestTarget, idleHintText, activeWaypoint = null, jetFuelPct = 100, aerialStatusText = '') {
    if (this.inHomeworldRoamMode) {
      if (
        nearestTarget?.kind !== 'homeworld_activity' &&
        nearestTarget?.kind !== 'homeworld_crew_chat' &&
        nearestTarget?.kind !== 'sky_plaque'
      ) {
        nearestTarget = null;
      }
      if (activeWaypoint?.worldPlane !== 'homeworld') activeWaypoint = null;
      idleHintText = null;
    }
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
        if (this._jetpackPills?.length) {
          for (const pill of this._jetpackPills) pill.update(clamped);
        } else {
          if (this.miniJetFillEl && this.miniJetPctEl) {
            this.miniJetFillEl.style.width = `${clamped}%`;
            this.miniJetPctEl.textContent = `${clamped}%`;
          }
          if (this.hwJetFillEl && this.hwJetPctEl) {
            this.hwJetFillEl.style.width = `${clamped}%`;
            this.hwJetPctEl.textContent = `${clamped}%`;
          }
        }
      }
    }

    const blocking = this.isBlockingGameplay();
    const nextAerialText = !blocking && aerialStatusText ? aerialStatusText : '';
    if (this.aerialStatusPill && this._lastAerialStatusText !== nextAerialText) {
      this._lastAerialStatusText = nextAerialText;
      if (nextAerialText) {
        this.aerialStatusPill.textContent = nextAerialText;
        this.aerialStatusPill.classList.remove('hidden');
      } else {
        this.aerialStatusPill.classList.add('hidden');
      }
    }
    // Homeworld navigation occupies the existing objective pill in its header;
    // the desert's independent top-centre compass would overlap that header.
    const allowCompass = !this.inHomeworldRoamMode && this.state.settings.showCompass !== false;
    const allowIdleTips = this.state.settings.showIdleTips !== false;
    const isTouch =
      typeof document !== 'undefined' &&
      document.body.classList.contains('touch-active');

    if (activeWaypoint && !blocking && allowCompass) {
      const distStr =
        activeWaypoint.distMeters <= 3
          ? `● ${this.state.ui('waypointHere')}`
          : `${activeWaypoint.distMeters}m`;
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

    // On touch portrait layouts the generic guidance card and the nearby
    // interaction prompt compete for the same bottom-safe band. The nearby
    // prompt is actionable, so suppress the idle card while a target is in
    // range and restore it as soon as the player moves away.
    const suppressIdleHintForTouchTarget =
      isTouch && Boolean(nearestTarget);
    if (
      idleHintText &&
      !blocking &&
      allowIdleTips &&
      !suppressIdleHintForTouchTarget
    ) {
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
    this.compassHideBtn.title = this.state.ui('compassHideTitle');

    this.btnNavArrow.textContent = stripKey(
      this.state.settings.guideArrow === false
        ? this.state.ui('navToggleOff')
        : this.state.ui('navToggleOn')
    );
    this.btnGuide.textContent = stripKey(
      this.inHomeworldRoamMode ? `📖 ${this.state.text(HOMEWORLD_COPY.journal)} [C]` :
        this.state.lang === 'zh' ? '📖 蓝图 [C]' : '📖 Blueprints [C]'
    );
    this.btnAudio.textContent = this.state.settings.muted
      ? this.state.ui('audioOff')
      : this.state.ui('audioOn');
    this.btnLang.textContent = this.state.ui('langToggle');
    this.btnPause.textContent =
      this.state.lang === 'zh' ? '⚙ 设置' : '⚙ Menu';
    this.controlsFooter.textContent = this.inHomeworldRoamMode ?
      this.state.text(isTouch ? HOMEWORLD_HUD_COPY.touchControls : HOMEWORLD_HUD_COPY.controls) :
      this.state.ui('controlsSummary');

    // The postgame watch has its own authoritative progress and interactions.
    // Do not repopulate hidden desert mission/material panels on settings or
    // background crafting events after the toolbar has moved to the homeworld.
    if (this.inHomeworldRoamMode) {
      this._syncHomeworldBarTexts();
      this._renderHomeworldDrawers(foldText);
      this._applyDrawerVisibility();
      return;
    }

    // Layer 2: Current-Level Main Repair Objective (or Post-Game Climate Expedition!) + Left Collapsed Pill Summary
    const lvlProg = this.state.getCurrentLevelProgress();
    const pctStr = `${Math.round(lvlProg.fraction * 100)}%`;
    this.levelTitleEl.textContent = lvlProg.title;
    this.missionSummaryEl.textContent = lvlProg.summary;
    this.levelProgressFill.style.width = pctStr;
    this.leftTabLabelEl.textContent = lvlProg.isPostGame
      ? `${this.state.lang === 'zh' ? '📡 科考' : '📡 Grid'} (${lvlProg.doneSteps}/${lvlProg.totalSteps}) ▸`
      : `${this.state.ui('tabMissionShort', {
          level: lvlProg.level,
          done: lvlProg.doneSteps,
          total: lvlProg.totalSteps
        })} ▸`;
    this.leftTabMiniFill.style.width = pctStr;

    clearChildren(this.stepsContainer);
    for (const step of lvlProg.steps) {
      const here = Boolean(
        lvlProg.isPostGame && step.regionId && step.regionId === this._worldRegionId && !step.done
      );
      const row = el('div', `step-row${step.done ? ' done' : ''}${here ? ' here' : ''}`);
      const prefix = step.done ? '✓ ' : here ? '▶ ' : '○ ';
      const nameSpan = el('span', '', `${prefix}${step.label}`);
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
    for (const sys of globalProg.systems) {
      const pill = el(
        'span',
        `ship-pill${sys.repaired ? ' online' : ''}`,
        `${sys.repaired ? '✓ ' : ''}${sys.shortLabel}`
      );
      this.shipPillsEl.appendChild(pill);
    }
    if (this.shipHomeworldWrap) {
      clearChildren(this.shipHomeworldWrap);
      if (this.state.launchedHome) {
        const hwProg =
          typeof this.state.getHomeworldProgress === 'function'
            ? this.state.getHomeworldProgress()
            : { doneSteps: 0, totalSteps: 5 };
        const btnReturnHw = el(
          'button',
          'hud-btn primary',
          this.state.lang === 'zh'
            ? `🌿 返回翡翠母星 (${hwProg.doneSteps}/${hwProg.totalSteps})`
            : `🌿 Return to Homeworld (${hwProg.doneSteps}/${hwProg.totalSteps})`
        );
        btnReturnHw.style.width = '100%';
        btnReturnHw.addEventListener('click', () => {
          this.sound.playUiClick();
          if (this.actions.onWalkHomeworld) this.actions.onWalkHomeworld();
        });
        this.shipHomeworldWrap.appendChild(btnReturnHw);
      }
    }

    // Declaratively render Equipped Upgrades & Jetpack Fuel Bar from EQUIPMENT_DEFS
    const unlockedGear = Object.values(EQUIPMENT_DEFS).filter((def) =>
      this.state.hasEquipment(def.slot)
    );
    const hasFuelGear = unlockedGear.some((def) => def.showsFuelGauge);
    this.miniJetWrap.classList.toggle('hidden', !hasFuelGear);

    if (unlockedGear.length > 0) {
      this.gearCard.classList.remove('hidden');
      clearChildren(this.gearBadgesRow);
      for (const def of unlockedGear) {
        if (def.actionId === 'sonar') {
          const dChip = el(
            'button',
            'gear-chip drill',
            stripKey(this.state.ui(def.badgeKey))
          );
          dChip.addEventListener('click', () => {
            if (this.actions.onTriggerSonar) this.actions.onTriggerSonar();
          });
          this.gearBadgesRow.appendChild(dChip);
        } else {
          const gChip = el(
            'span',
            'gear-chip',
            stripKey(this.state.ui(def.badgeKey))
          );
          this.gearBadgesRow.appendChild(gChip);
        }
      }
      if (hasFuelGear) {
        this.jetpackLabelEl.textContent = this.state.ui('jetpackGaugeLabel');
        this.jetpackGaugeWrap.classList.remove('hidden');
      } else {
        this.jetpackGaugeWrap.classList.add('hidden');
      }
    } else {
      this.gearCard.classList.add('hidden');
    }

    // Cargo follows the region under the player's feet. A material counts as local
    // only when this region is its primary source, or it belongs to this region's
    // own recipe chain. Shared ores that merely also spawn here stay in reserve.
    const zh = this.state.lang === 'zh';
    const objectiveDef = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, (this.state.currentLevel || 1) - 1))];
    const sceneDef = this._sceneLevelDef() || objectiveDef;
    const sceneRegion = sceneDef ? REGIONS[sceneDef.regionId] : null;
    const isPostGame = Boolean(this.state.launchedHome);
    const shortRegion = sceneRegion ? this._regionShortName(sceneRegion.id) : '';

    if (isPostGame && shortRegion) {
      this.invHeaderEl.textContent = zh
        ? `📡 ${shortRegion} · 科考物资`
        : `📡 ${shortRegion} · Expedition Cargo`;
    } else if (shortRegion) {
      this.invHeaderEl.textContent = `${shortRegion} · ${this.state.ui('inventoryTitle')}`;
    } else {
      this.invHeaderEl.textContent = this.state.ui('inventoryTitle');
    }

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

    if (isPostGame) {
      const beaconProg = this.state.getMechanismProgress('weather_beacons');
      const logsDone = Object.keys(this.state.logsRead).length;
      const logsTotal = Object.keys(CREW_LOGS).length;
      const hwProg =
        typeof this.state.getHomeworldProgress === 'function'
          ? this.state.getHomeworldProgress()
          : { doneSteps: 0, totalSteps: 5 };
      for (const [col, txt] of [
        ['#66ffc2', `${zh ? '遥测信标' : 'Beacons'} ${beaconProg.done}/${beaconProg.total}`],
        ['#78f5ff', `${zh ? '船员日志' : 'Crew Logs'} ${logsDone}/${logsTotal}`],
        ['#ffd266', `${zh ? '母星巡检' : 'Valley Watch'} ${hwProg.doneSteps}/${hwProg.totalSteps}`]
      ]) {
        const bChip = el('div', 'inv-chip current-zone');
        const bDot = el('span', 'inv-dot');
        bDot.style.backgroundColor = col;
        bChip.append(bDot, el('span', '', txt));
        this.invGridEl.appendChild(bChip);
      }
    }

    const focusMatIds = new Set();
    if (sceneDef) {
      focusMatIds.add(sceneDef.requiredComponentId);
      for (const mat of Object.values(MATERIALS)) {
        if (Array.isArray(mat.sourceRegions) && mat.sourceRegions[0] === sceneDef.regionId) {
          focusMatIds.add(mat.id);
        }
      }
      for (const rec of RECIPES) {
        if (rec.unlockLevel !== sceneDef.level) continue;
        focusMatIds.add(rec.output.id);
        for (const inp of rec.inputs) {
          const source = MATERIALS[inp.id]?.sourceRegions;
          if (!source || source[0] === sceneDef.regionId) focusMatIds.add(inp.id);
        }
      }
    }

    // Sort held items: Current-scene focus materials FIRST, then ship modules/subcomponents, then older leftovers
    const sortedHeld = heldEntries.slice().sort((a, b) => {
      const fa = focusMatIds.has(a.id) ? 0 : 1;
      const fb = focusMatIds.has(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return 0;
    });

    for (const mat of sortedHeld) {
      const isFocus = focusMatIds.has(mat.id);
      const chip = el('div', `inv-chip${isFocus ? ' current-zone' : ' reserve-zone'}`);
      const dot = el('span', 'inv-dot');
      dot.style.backgroundColor = mat.color;
      const label = el('span', '', this.state.text(mat.name));
      const cnt = el('span', 'inv-count', `×${this.state.getItemCount(mat.id)}`);
      chip.append(dot, label, cnt);
      this.invGridEl.appendChild(chip);
    }

    const showLocalTargets = sceneDef && (isPostGame || sceneDef.level === (this.state.currentLevel || 1));
    if (showLocalTargets) {
      const uncollectedBiomeRaws = Object.values(MATERIALS).filter(
        (m) =>
          m.category === 'raw' &&
          Array.isArray(m.sourceRegions) &&
          m.sourceRegions[0] === sceneDef.regionId &&
          this.state.getItemCount(m.id) === 0
      );
      for (const rawMat of uncollectedBiomeRaws) {
        const hintChip = el('div', 'inv-chip zone-target');
        const dot = el('span', 'inv-dot');
        dot.style.backgroundColor = rawMat.color;
        hintChip.append(
          dot,
          el('span', '', this.state.text(rawMat.name)),
          el('span', 'inv-count', zh ? '待采' : '0')
        );
        this.invGridEl.appendChild(hintChip);
      }
    }

    if (this.invGridEl.childNodes.length === 0) {
      this.invGridEl.appendChild(
        el('div', 'mission-summary', this.state.ui('emptyInventory'))
      );
    }
    this._syncHomeworldBarTexts();
    this._applyDrawerVisibility();
  }

  _renderHomeworldDrawers(foldText) {
    if (!this.hwMissionWrap || !this.hwArchiveWrap || typeof this.state.getHomeworldProgress !== 'function') {
      return;
    }
    const hwProg = this.state.getHomeworldProgress();
    const zh = this.state.lang === 'zh';
    const pctStr = `${Math.round(hwProg.fraction * 100)}%`;

    this.hwTitleEl.textContent = hwProg.title;
    this.hwSummaryEl.textContent = hwProg.summary;
    this.hwFoldBtn.textContent = foldText;
    this.hwBagFoldBtn.textContent = foldText;
    this.hwProgFill.style.width = pctStr;
    this.hwLeftTabLabel.textContent = `🌿 ${zh ? '家园巡检' : 'Watch'} (${hwProg.doneSteps}/${hwProg.totalSteps}) ▸`;
    this.hwLeftMiniFill.style.width = pctStr;

    clearChildren(this.hwStepsList);
    for (const step of hwProg.steps) {
      const row = el('div', `step-row${step.done ? ' done' : ''}${step.active ? ' here' : ''}`);
      const prefix = step.done ? '✓ ' : step.active ? '▶ ' : '○ ';
      row.append(
        el('span', '', `${prefix}${step.label}`),
        el('strong', '', `${step.current}/${step.needed}`)
      );
      this.hwStepsList.appendChild(row);
    }

    clearChildren(this.hwViewBtnWrap);
    if (this.state.homeworldSurvey?.completed) {
      const vBtn = el('button', 'hud-btn primary', `🏞️ ${this.state.text(HOMEWORLD_COPY.view)}`);
      vBtn.style.width = '100%';
      vBtn.addEventListener('click', () => this.actions.onHomeworldView?.());
      this.hwViewBtnWrap.appendChild(vBtn);

      if (hwProg.atmosphereUnlocked) {
        const atmoRow = el('div', 'station-tabs');
        atmoRow.style.marginTop = '6px';
        atmoRow.style.flexWrap = 'wrap';
        const curAtmo = hwProg.atmosphereMode || 'dawn';
        for (const [mVal, mCopy] of [
          ['dawn', HOMEWORLD_COPY.atmoDawn],
          ['sunset', HOMEWORLD_COPY.atmoSunset],
          ['night', HOMEWORLD_COPY.atmoNight]
        ]) {
          const ab = el(
            'button',
            `hud-btn${curAtmo === mVal ? ' primary' : ''}`,
            this.state.text(mCopy)
          );
          ab.style.flex = '1 1 auto';
          ab.addEventListener('click', () => {
            this.sound.playUiClick();
            this.state.setHomeworldAtmosphere(mVal);
            this.showToast(
              `${this.state.text(HOMEWORLD_COPY.atmoSwitched)}${this.state.text(mCopy)}`,
              'celebrate'
            );
          });
          atmoRow.appendChild(ab);
        }
        this.hwViewBtnWrap.appendChild(atmoRow);
      }
    }

    if (this.hwTelemetrySection && this.hwTelemetryHeaderEl && this.hwTelemetryListEl) {
      clearChildren(this.hwTelemetryListEl);
      const links = Array.isArray(hwProg.telemetryLinks) ? hwProg.telemetryLinks : [];
      if (links.length > 0) {
        this.hwTelemetrySection.classList.remove('hidden');
        this.hwTelemetryHeaderEl.textContent = zh
          ? '跨星区科考遥测链路'
          : 'Expedition Telemetry Links';
        for (const link of links) {
          const isDone = Boolean(link.completed ?? link.done);
          const total = link.target ?? link.needed;
          const item = el('div', `side-item${isDone ? ' done' : ''}`);
          item.append(
            el('div', '', `${isDone ? '★ ' : '• '}${link.label}: ${link.current}/${total}`),
            el('div', 'side-reward', link.rewardText)
          );
          this.hwTelemetryListEl.appendChild(item);
        }
      } else {
        this.hwTelemetrySection.classList.add('hidden');
      }
    }

    this.hwArchiveTitleEl.textContent = zh ? '🏅 家园生态档案与纪念物' : '🏅 Valley Archives & Relics';
    this.hwBagTab.textContent = `🏅 ${zh ? '家园档案' : 'Relics'} (${hwProg.unlockedArchiveCount}/${hwProg.archives.length}) ▸`;
    clearChildren(this.hwArchiveGrid);
    for (const item of hwProg.archives) {
      const chip = el('div', `inv-chip ${item.unlocked ? 'current-zone' : 'zone-target'}`);
      const dot = el('span', 'inv-dot');
      dot.style.backgroundColor = item.color;
      chip.append(
        dot,
        el('span', '', item.name),
        el('span', 'inv-count', item.status)
      );
      this.hwArchiveGrid.appendChild(chip);
    }
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
    this.modalBackdrop.classList.remove('title-mode', 'ending-mode');
    this.workbenchDrawer.classList.add('hidden');

    if (prevModal === 'station') {
      if (!this.inHomeworldRoamMode) {
        this.topLeft.classList.remove('hidden');
        this.topRight.classList.remove('hidden');
        // Workbench and blueprint views temporarily hide the compass. Invalidate
        // its frame cache so the unchanged waypoint is painted again immediately
        // after closing instead of leaving navigation hidden forever.
        this._lastCompassSig = '';
        this.topCenter.classList.remove('hidden');
      }
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

  openStationModal(stationMode = 'furnace', stationFacility = null) {
    this.activeModal = 'station';
    this.stationInteractive = true;
    this.activeStationFacility = stationFacility;
    this.modalBackdrop.classList.add('hidden');
    // Keep left viewport clean so player clearly sees Milo & the live 3D machine!
    this.topLeft.classList.add('hidden');
    this.topRight.classList.add('hidden');
    this.topCenter.classList.add('hidden');

    const supportedKinds =
      stationFacility && Array.isArray(stationFacility.stationKinds)
        ? stationFacility.stationKinds
        : stationMode === 'both'
          ? Object.keys(STATION_TYPES)
          : [stationMode];

    if (supportedKinds.length > 1) {
      this.workbenchMode = 'outpost';
      // Default field workstations directly to Current-Level Focus so new-biome recipes appear cleanly!
      this.stationFilter = 'level_focus';
    } else {
      const singleKind = supportedKinds[0] || 'furnace';
      const stMeta = STATION_TYPES[singleKind] || STATION_TYPES.furnace;
      this.workbenchMode = stMeta.themeClass || singleKind;
      this.stationFilter = singleKind;
    }

    this.workbenchDrawer.className = `workbench-drawer theme-${this.workbenchMode}`;
    this._renderWorkbenchBody();
  }

  openRecipeGuide() {
    if (this.inHomeworldRoamMode) {
      this.actions.onHomeworldJournal?.();
      return;
    }
    this.activeModal = 'station';
    this.stationInteractive = false;
    this.activeStationFacility = null;
    this.workbenchMode = 'handbook';
    this.stationFilter = 'all';
    this.modalBackdrop.classList.add('hidden');
    this.topLeft.classList.add('hidden');
    this.topRight.classList.add('hidden');
    this.topCenter.classList.add('hidden');

    this.workbenchDrawer.className = 'workbench-drawer theme-handbook';
    this._renderWorkbenchBody();
  }

  _formatSolarFluxBadge() {
    return formatSolarFluxBadge(this);
  }

  _renderQueueOnly(force = false) {
    return renderQueueOnly(this, force);
  }

  _renderWorkbenchBody() {
    return renderWorkbenchBody(this);
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

  openHomeworldJournal(activitySystem) {
    if (!activitySystem) return;
    this._homeworldActivity = activitySystem;
    this.openInspectModal(this.state.text(HOMEWORLD_COPY.title), activitySystem.journalText());
    this.activeModal = 'homeworld_journal';
    this.modalPanel.lastChild.style.whiteSpace = 'pre-line';
    if (this.state.homeworldSurvey.completed) {
      if (this.state.isHomeworldAtmosphereUnlocked?.()) {
        const curAtmo = this.state.getHomeworldAtmosphere();
        const curCopy =
          curAtmo === 'sunset'
            ? HOMEWORLD_COPY.atmoSunset
            : curAtmo === 'night'
              ? HOMEWORLD_COPY.atmoNight
              : HOMEWORLD_COPY.atmoDawn;
        const atmoBtn = el(
          'button',
          'hud-btn',
          `${this.state.text(HOMEWORLD_COPY.cycleAtmosphere)} · ${this.state.text(curCopy)}`
        );
        atmoBtn.style.marginRight = '8px';
        atmoBtn.addEventListener('click', () => {
          this.sound.playUiClick();
          const next = this.state.cycleHomeworldAtmosphere();
          const nextCopy =
            next === 'sunset'
              ? HOMEWORLD_COPY.atmoSunset
              : next === 'night'
                ? HOMEWORLD_COPY.atmoNight
                : HOMEWORLD_COPY.atmoDawn;
          this.showToast(
            `${this.state.text(HOMEWORLD_COPY.atmoSwitched)}${this.state.text(nextCopy)}`,
            'celebrate'
          );
          this.openHomeworldJournal(activitySystem);
        });
        this.modalPanel.appendChild(atmoBtn);
      }
      const view = el('button', 'hud-btn primary', this.state.text(HOMEWORLD_COPY.view));
      view.addEventListener('click', () => this.actions.onHomeworldView?.());
      this.modalPanel.appendChild(view);
    }
  }

  openHomeworldCalibration(onSelect, feedback = '') {
    this._homeworldCalibrationAction = onSelect;
    this.openInspectModal(this.state.text(HOMEWORLD_COPY.calibrate), this.state.text(HOMEWORLD_COPY.sequence));
    this.activeModal = 'homeworld_calibration';
    const controls = el('div', 'hw-calibration-controls');
    const stage = this.state.homeworldSurvey.calibration;
    for (let i = 0; i < HOMEWORLD_CALIBRATION.length; i++) {
      const step = HOMEWORLD_CALIBRATION[i];
      const button = el('button', `hud-btn${i === stage ? ' primary' : ''}`,
        `${i < stage ? '✓' : `${i + 1}.`} ${this.state.text(step.name)}`);
      button.disabled = i < stage;
      button.addEventListener('click', () => {
        const result = onSelect(step.id);
        const message = result.ok ? '' : this.state.text(result.reason === 'out_of_range' ?
          { zh: '请返回能源站控制台旁操作。', en: 'Return to the power console to operate it.' } : HOMEWORLD_COPY.wrongOrder);
        this.openHomeworldCalibration(onSelect, message);
      });
      controls.appendChild(button);
    }
    this.modalPanel.appendChild(controls);
    if (feedback || stage === HOMEWORLD_CALIBRATION.length) {
      this.modalPanel.appendChild(el('div', 'hero-sub', feedback || this.state.text(HOMEWORLD_COPY.restored)));
    }
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
    return renderPauseModal(this, HOMEWORLD_HUD_COPY);
  }

  openEndingModal() {
    this.workbenchDrawer.classList.add('hidden');
    this.activeModal = 'ending';
    this.setHomeworldRoamVisible(false);
    this.modalBackdrop.classList.remove('hidden', 'title-mode');
    this.modalBackdrop.classList.add('ending-mode');
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
    const btnWalkHome = el('button', 'hud-btn primary', this.state.ui('btnWalkHomeworld'));
    btnWalkHome.addEventListener('click', () => {
      this.closeModal();
      if (this.actions.onWalkHomeworld) this.actions.onWalkHomeworld();
    });

    const btnRoam = el('button', 'hud-btn', this.state.ui('btnFreeRoam'));
    btnRoam.addEventListener('click', () => {
      this.closeModal();
      this.actions.onFreeRoam();
    });

    const btnReplay = el('button', 'hud-btn', this.state.ui('btnReplayLaunch'));
    btnReplay.addEventListener('click', () => {
      this.closeModal();
      this.actions.onReplayLaunch();
    });

    const btnAgain = el('button', 'hud-btn', this.state.ui('btnPlayAgain'));
    btnAgain.addEventListener('click', () => {
      this.closeModal();
      this.actions.onResetGame();
    });

    actions.append(btnWalkHome, btnRoam, btnReplay, btnAgain);
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
