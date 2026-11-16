import { LEVELS } from '../data/gameData.js';
import { clearChildren, el } from '../ui/domHelpers.js';

const DEBUG_COPY = {
  pill: { zh: '🛠', en: '🛠' },
  title: { zh: '🛠 星织号 QA 调试台', en: '🛠 Starweaver QA Console' },
  secLevel: { zh: '关卡跃迁', en: 'Level Jump' },
  secWorld: { zh: '星球与巡检', en: 'World & Survey' },
  secTeleport: { zh: '地标传送', en: 'Teleport' },
  secCraft: { zh: '装备 / 材料 / 倍速', en: 'Gear / Craft / Speed' },
  secAtmo: { zh: '天象与气候', en: 'Atmosphere' },
  desert: { zh: '荒漠', en: 'Desert' },
  homeworld: { zh: '母星', en: 'Homeworld' },
  hw100: { zh: '母星 100%', en: 'HW 100%' },
  go: { zh: '传送', en: 'Go' },
  allGear: { zh: '全装备', en: 'All Gear' },
  lvlMats: { zh: '+本关料', en: '+Level Mats' },
  finishQueue: { zh: '秒完队列', en: 'Finish Queue' },
  day: { zh: '白昼', en: 'Day' },
  night: { zh: '星夜', en: 'Night' },
  storm: { zh: '沙暴', en: 'Storm' },
  hwDawn: { zh: '母星晨光', en: 'HW Dawn' },
  hwDusk: { zh: '母星晚霞', en: 'HW Dusk' },
  hwNight: { zh: '母星晴夜', en: 'HW Night' }
};

/**
 * Lightweight, lazy-mounted Debug Overlay (activated by ?debug=1 or F9).
 * Collapsed to a tiny pill by default and localized reactively with GameState.lang.
 */
export class DebugPanel {
  constructor(parentRoot, actions, state, { showPillWhenCollapsed = false } = {}) {
    this.actions = actions;
    this.state = state;
    this.showPillWhenCollapsed = Boolean(showPillWhenCollapsed);
    this.expanded = false;
    this._telemetryTimer = 0;

    this.root = el('div', 'debug-panel-root hidden');
    this.toggleBtn = el('button', 'debug-pill-toggle');
    this.toggleBtn.type = 'button';
    this.toggleBtn.addEventListener('click', () => this.setExpanded(!this.expanded));

    this.card = el('div', 'debug-card hidden');
    this._buildControls();
    this.refreshLocale();

    this.state?.on?.((event, detail) => {
      if (event === 'settings_changed' && detail?.lang) {
        this.refreshLocale();
      }
    });

    this.root.append(this.toggleBtn, this.card);
    parentRoot.appendChild(this.root);
  }

  _t(key) {
    const lang = this.state?.lang === 'en' ? 'en' : 'zh';
    return DEBUG_COPY[key]?.[lang] || key;
  }

  _buildControls() {
    clearChildren(this.card);
    const header = el('div', 'debug-header');
    this.titleEl = el('span', 'debug-title');
    const closeBtn = el('button', 'debug-mini-btn', '×');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.setExpanded(false));
    header.append(this.titleEl, closeBtn);
    this.card.appendChild(header);

    this.telemetryEl = el('div', 'debug-telemetry', 'FPS: -- | Geo: --');
    this.card.appendChild(this.telemetryEl);

    this.secLevelEl = el('div', 'debug-section-label');
    const lvlGrid = el('div', 'debug-btn-grid');
    this._lvlBtns = [];
    for (const def of LEVELS) {
      const btn = el('button', 'debug-mini-btn', `L${def.level}`);
      btn.type = 'button';
      btn.addEventListener('click', () => this.actions.jumpToLevel(def.level));
      lvlGrid.appendChild(btn);
      this._lvlBtns.push({ btn, def });
    }
    this.card.append(this.secLevelEl, lvlGrid);

    const mkBtn = (key, onClick, literal = null) => {
      const b = el('button', 'debug-mini-btn', literal || '');
      b.type = 'button';
      b.addEventListener('click', onClick);
      if (key) this._i18nNodes.push({ el: b, key });
      return b;
    };
    this._i18nNodes = [
      { el: this.toggleBtn, key: 'pill' },
      { el: this.titleEl, key: 'title' },
      { el: this.secLevelEl, key: 'secLevel' }
    ];

    this.secWorldEl = el('div', 'debug-section-label');
    this._i18nNodes.push({ el: this.secWorldEl, key: 'secWorld' });
    const worldRow = el('div', 'debug-btn-row');
    worldRow.append(
      mkBtn('desert', () => this.actions.warpToWorld('desert')),
      mkBtn('homeworld', () => this.actions.warpToWorld('homeworld')),
      mkBtn('hw100', () => this.actions.warpToWorld('homeworld', { completeSurvey: true }))
    );
    this.card.append(this.secWorldEl, worldRow);

    this.secTeleportEl = el('div', 'debug-section-label');
    this._i18nNodes.push({ el: this.secTeleportEl, key: 'secTeleport' });
    const tpRow = el('div', 'debug-btn-row');
    this.teleportSelect = el('select', 'debug-select');
    this.teleportSelect.id = 'debug-teleport-select';
    this.teleportSelect.name = 'debug-teleport';
    tpRow.append(
      this.teleportSelect,
      mkBtn('go', () => this.actions.teleportTo(this.teleportSelect.value))
    );
    this.card.append(this.secTeleportEl, tpRow);

    this.secCraftEl = el('div', 'debug-section-label');
    this._i18nNodes.push({ el: this.secCraftEl, key: 'secCraft' });
    const craftRow = el('div', 'debug-btn-row');
    craftRow.append(
      mkBtn('allGear', () => this.actions.grantAllGear()),
      mkBtn('lvlMats', () => this.actions.grantCurrentLevelMaterials()),
      mkBtn('finishQueue', () => this.actions.completeQueueNow())
    );
    const speedRow = el('div', 'debug-btn-row');
    speedRow.append(
      mkBtn(null, () => this.actions.setTimeScale(1), '1x'),
      mkBtn(null, () => this.actions.setTimeScale(3), '3x'),
      mkBtn(null, () => this.actions.setTimeScale(8), '8x')
    );
    this.card.append(this.secCraftEl, craftRow, speedRow);

    this.secAtmoEl = el('div', 'debug-section-label');
    this._i18nNodes.push({ el: this.secAtmoEl, key: 'secAtmo' });
    const atmoRow = el('div', 'debug-btn-grid');
    atmoRow.append(
      mkBtn('day', () => this.actions.setAtmosphereMode('day')),
      mkBtn('night', () => this.actions.setAtmosphereMode('night')),
      mkBtn('storm', () => this.actions.setAtmosphereMode('sandstorm')),
      mkBtn('hwDawn', () => this.actions.setAtmosphereMode('hw_dawn')),
      mkBtn('hwDusk', () => this.actions.setAtmosphereMode('hw_sunset')),
      mkBtn('hwNight', () => this.actions.setAtmosphereMode('hw_night'))
    );
    this.card.append(this.secAtmoEl, atmoRow);
  }

  refreshLocale() {
    for (const item of this._i18nNodes) {
      item.el.textContent = this._t(item.key);
    }
    const lang = this.state?.lang === 'en' ? 'en' : 'zh';
    for (const { btn, def } of this._lvlBtns) {
      btn.title = def.title?.[lang] || `Level ${def.level}`;
    }
    const prevValue = this.teleportSelect.value;
    clearChildren(this.teleportSelect);
    for (const lm of this.actions.getTeleportLandmarks()) {
      const opt = el('option', '', lm.label);
      opt.value = lm.id;
      this.teleportSelect.appendChild(opt);
    }
    if (prevValue) this.teleportSelect.value = prevValue;
    if (this.expanded) this._refreshTelemetry();
  }

  setExpanded(flag) {
    this.expanded = Boolean(flag);
    const showRoot = this.expanded || this.showPillWhenCollapsed;
    this.root.classList.toggle('hidden', !showRoot);
    this.card.classList.toggle('hidden', !this.expanded);
    this.toggleBtn.classList.toggle('hidden', this.expanded || !this.showPillWhenCollapsed);
    if (this.expanded) {
      this._refreshTelemetry();
    }
  }

  toggle() {
    this.setExpanded(!this.expanded);
  }

  _refreshTelemetry() {
    const t = this.actions.getTelemetry();
    this.telemetryEl.textContent = `FPS:${t.fps} | Geo:${t.geos} | ${t.plane} (Y=${t.baseY}) | L${t.level} | (${t.x},${t.y},${t.z}) | ${t.timeScale}x`;
  }

  update(dt) {
    if (!this.expanded) return;
    this._telemetryTimer += dt;
    if (this._telemetryTimer >= 0.25) {
      this._telemetryTimer = 0;
      this._refreshTelemetry();
    }
  }
}
