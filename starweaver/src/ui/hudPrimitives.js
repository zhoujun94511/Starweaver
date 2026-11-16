import { el, clearChildren } from './domHelpers.js';

/**
 * Shared collapsible drawer primitive used across worlds (Desert & Homeworld).
 * Keeps DOM structure, fold/expand interaction, and optional mini progress bar uniform
 * while allowing each world to supply its own theme classes and isolated containers.
 */
export function createCollapsibleDrawer({
  wrapClass,
  tabClass,
  bodyClass,
  cardClass = '',
  headRowClass = 'mission-head-row',
  titleTag = 'div',
  titleClass = 'level-header',
  foldBtnClass = 'drawer-fold-chip',
  withMiniProgress = false,
  onExpand,
  onCollapse
}) {
  const wrap = el('div', wrapClass);
  const tab = el('button', tabClass);

  let tabLabel = null;
  let miniFill = null;
  if (withMiniProgress) {
    tabLabel = el('span', 'pill-tab-text');
    const miniTrack = el('span', 'pill-mini-track');
    miniFill = el('span', 'pill-mini-fill');
    miniTrack.appendChild(miniFill);
    tab.append(tabLabel, miniTrack);
  }
  if (onExpand) {
    tab.addEventListener('click', onExpand);
  }

  const body = el('div', bodyClass);
  const card = cardClass ? el('div', cardClass) : body;
  const headRow = el('div', headRowClass);
  const titleEl = el(titleTag, titleClass);
  const foldBtn = el('button', foldBtnClass);
  if (onCollapse) {
    foldBtn.addEventListener('click', onCollapse);
  }
  headRow.append(titleEl, foldBtn);

  if (card !== body) {
    card.appendChild(headRow);
    body.appendChild(card);
  } else {
    body.appendChild(headRow);
  }

  wrap.append(tab, body);

  return {
    wrap,
    tab,
    tabLabel,
    miniFill,
    body,
    card,
    headRow,
    titleEl,
    foldBtn
  };
}

/**
 * Shared jetpack fuel mini-pill primitive used in both Desert and Homeworld HUDs.
 */
export function createJetpackPill({
  wrapClass = 'mini-jet-pill hidden',
  labelClass = '',
  pctClass = 'mini-jet-pct',
  iconText = '🚀'
} = {}) {
  const wrap = el('div', wrapClass);
  const labelEl = el('span', labelClass, iconText);
  const trackEl = el('div', 'mini-jet-track');
  const fillEl = el('div', 'mini-jet-fill');
  fillEl.style.width = '100%';
  trackEl.appendChild(fillEl);
  const pctEl = el('span', pctClass, '100%');
  wrap.append(labelEl, trackEl, pctEl);

  return {
    wrap,
    labelEl,
    fillEl,
    pctEl,
    update(pct) {
      const clamped = Math.max(0, Math.min(100, Math.round(pct)));
      fillEl.style.width = `${clamped}%`;
      pctEl.textContent = `${clamped}%`;
    }
  };
}

/**
 * Clears locale-bound text and list children for a planet HUD region during world switches.
 */
export function clearHudRegion(textNodes = [], containerNodes = []) {
  for (const node of textNodes) {
    if (node) node.textContent = '';
  }
  for (const node of containerNodes) {
    if (node) clearChildren(node);
  }
}
