import { el, clearChildren } from './domHelpers.js';
import { createMaterialIconCanvas } from './materialIcons.js';
import { LEVELS, MATERIALS, RECIPES, STATION_TYPES } from '../data/gameData.js';

export function formatSolarFluxBadge(hud) {
  const info = hud.state.getSolarStatusInfo();
  const multStr = info.multiplier.toFixed(2).replace(/\.00$/, '.0').replace(/(\.\d)0$/, '$1');
  if (info.stateTag === 'boost') {
    return hud.state.ui('solarBoostBadge', {
      pct: Math.round((info.multiplier - 1) * 100),
      mult: multStr
    });
  }
  if (info.stateTag === 'buffered') {
    return hud.state.ui('solarBufferedBadge', { mult: multStr });
  }
  if (info.stateTag === 'low') {
    return hud.state.ui('solarLowBadge', { mult: multStr });
  }
  return hud.state.ui('solarNormalBadge', { mult: multStr });
}

export function renderQueueOnly(hud, force = false) {
  if (!hud.queueBoxEl) return;
  const head = hud.state.craftingQueue[0];
  const headPct = head
    ? Math.round(((head.total - head.remaining) / head.total) * 100)
    : -1;
  const solarInfo = hud.state.getSolarStatusInfo();
  const sig = `${hud.state.lang}|${hud.state.craftingQueue.length}|${head ? head.jobId : 0}|${headPct}|${solarInfo.multiplier}|${solarInfo.stateTag}`;
  if (!force && hud._lastQueueSig === sig) return;
  hud._lastQueueSig = sig;

  clearChildren(hud.queueBoxEl);
  const titleRow = el('div', 'wb-title-row');
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.marginBottom = '4px';
  titleRow.appendChild(el('div', 'section-label', hud.state.ui('activeQueue')));
  if (
    hud.stationFilter === 'furnace' ||
    hud.stationFilter === 'all' ||
    (head && head.station === 'furnace')
  ) {
    const fluxPill = el(
      'span',
      `ship-pill${solarInfo.stateTag === 'boost' || solarInfo.stateTag === 'buffered' ? ' online' : ''}`,
      formatSolarFluxBadge(hud)
    );
    titleRow.appendChild(fluxPill);
  }
  hud.queueBoxEl.appendChild(titleRow);

  if (hud.state.craftingQueue.length === 0) {
    hud.queueBoxEl.appendChild(
      el('div', 'recipe-io', hud.state.ui('queueEmpty'))
    );
    return;
  }

  hud.state.craftingQueue.forEach((job, idx) => {
    const rec = RECIPES.find((r) => r.id === job.recipeId);
    const outMat = MATERIALS[rec.output.id];
    const pct = Math.round(((job.total - job.remaining) / job.total) * 100);
    const speedMult = hud.state.getStationSpeedMultiplier(job.station);
    const effSec = Math.max(0.1, job.remaining / Math.max(0.1, speedMult)).toFixed(1);
    const row = el(
      'div',
      'recipe-io',
      `${idx + 1}. ${hud.state.text(outMat.name)} — ${pct}% (${effSec}s)`
    );
    hud.queueBoxEl.appendChild(row);
    if (idx === 0) {
      const track = el('div', 'progress-bar-track');
      track.style.marginTop = '5px';
      const fill = el('div', 'progress-bar-fill');
      fill.style.width = `${pct}%`;
      track.appendChild(fill);
      hud.queueBoxEl.appendChild(track);
    }
  });
}

export function renderWorkbenchBody(hud) {
  clearChildren(hud.workbenchDrawer);

  // 1. Declarative Station / Handbook Header from STATION_TYPES
  const header = el('div', 'wb-header');
  const titleRow = el('div', 'wb-title-row');

  let emblemIcon = '📖';
  let mainTitle = hud.state.ui('handbookTitle');
  let subTitle = hud.state.ui('handbookSub');

  if (hud.workbenchMode === 'outpost') {
    emblemIcon = '🧪';
    mainTitle = hud.activeStationFacility
      ? hud.state.text(hud.activeStationFacility.name)
      : hud.state.lang === 'zh'
        ? '前哨科研双模工程台'
        : 'Outpost Field Dual-Workbench';
    subTitle = hud.state.ui('outpostSub');
  } else if (STATION_TYPES[hud.stationFilter] && hud.workbenchMode !== 'handbook') {
    const stMeta = STATION_TYPES[hud.stationFilter];
    emblemIcon = stMeta.icon;
    mainTitle = hud.activeStationFacility
      ? hud.state.text(hud.activeStationFacility.name)
      : hud.state.text(stMeta.name);
    subTitle = hud.state.text(stMeta.subTitle);
  }

  const emblem = el('div', 'wb-emblem', emblemIcon);
  const titleTextCol = el('div');
  titleTextCol.append(
    el('div', 'wb-title', mainTitle),
    el('div', 'wb-subtitle', subTitle)
  );
  titleRow.append(emblem, titleTextCol);
  header.append(titleRow, hud._makeCloseButton());
  hud.workbenchDrawer.appendChild(header);

  // 2. Declarative Mode Filter Tabs — the open workstation's own region, not the oldest recipe list.
  const stationEntries = Object.values(STATION_TYPES);
  const zh = hud.state.lang === 'zh';
  const curLvl = hud._focusLevelNumber();
  if (hud.workbenchMode === 'outpost' || hud.workbenchMode === 'handbook') {
    const bar = el('div', 'wb-controls-bar');
    const focusPlace = hud._regionShortName(
      hud.activeStationFacility?.region || hud._worldRegionId
    );
    const focusLabel = focusPlace
      ? `🎯 ${focusPlace}`
      : (zh ? `🎯 第${curLvl}关` : `🎯 Lv.${curLvl}`);
    const tabDefs =
      hud.workbenchMode === 'handbook'
        ? [
            ['level_focus', focusLabel],
            ['all', hud.state.ui('filterAll')]
          ]
        : [
            ['level_focus', focusLabel]
          ];
    for (const stMeta of stationEntries) {
      tabDefs.push([stMeta.id, `${stMeta.icon} ${hud.state.text(stMeta.filterLabel)}`]);
    }
    for (const [modeKey, label] of tabDefs) {
      const b = el(
        'button',
        `hud-btn${hud.stationFilter === modeKey ? ' primary' : ''}`,
        label
      );
      b.addEventListener('click', () => {
        hud.sound.playUiClick();
        hud.stationFilter = modeKey;
        renderWorkbenchBody(hud);
      });
      bar.appendChild(b);
    }
    hud.workbenchDrawer.appendChild(bar);
  }

  // 3. Live Processing Queue Strip (shown on real workstations or if queue has active jobs)
  if (hud.stationInteractive || hud.state.craftingQueue.length > 0) {
    hud.queueBoxEl = el('div', 'wb-queue-strip');
    renderQueueOnly(hud, true);
    hud.workbenchDrawer.appendChild(hud.queueBoxEl);
  } else {
    hud.queueBoxEl = null;
  }

  // 4. Tactile Schematic Recipe Cards — Current-Level / New-Biome Recipes Sorted FIRST!
  const scrollBody = el('div', 'wb-scroll-body');
  const curLvlDef = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, curLvl - 1))];
  const curMainRec = curLvlDef ? RECIPES.find((r) => r.output.id === curLvlDef.requiredComponentId) : null;
  const curRelevantIds = new Set();
  if (curMainRec) {
    const collectDeps = (itemId) => {
      if (curRelevantIds.has(itemId)) return;
      curRelevantIds.add(itemId);
      const r = RECIPES.find((x) => x.output.id === itemId);
      if (r) for (const inp of r.inputs) collectDeps(inp.id);
    };
    collectDeps(curMainRec.output.id);
  }
  for (const r of RECIPES) {
    if (r.unlockLevel === curLvl) curRelevantIds.add(r.output.id);
  }

  const filteredRecipes = RECIPES.filter((r) => {
    if (hud.stationFilter === 'all') return true;
    if (hud.stationFilter === 'level_focus') {
      return r.unlockLevel === curLvl || curRelevantIds.has(r.output.id);
    }
    return r.station === hud.stationFilter;
  }).sort((a, b) => {
    const ua = a.unlockLevel <= curLvl ? 0 : 1;
    const ub = b.unlockLevel <= curLvl ? 0 : 1;
    if (ua !== ub) return ua - ub;
    const diagA = hud.state.diagnoseRecipe(a.id);
    const diagB = hud.state.diagnoseRecipe(b.id);
    const doneA = diagA.reason === 'already_crafted_main' || diagA.reason === 'already_equipped' ? 1 : 0;
    const doneB = diagB.reason === 'already_crafted_main' || diagB.reason === 'already_equipped' ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    // Prioritize current-level / active-dependency recipes ABOVE old Level 1 leftovers!
    const relA = a.unlockLevel === curLvl || curRelevantIds.has(a.output.id) ? 0 : 1;
    const relB = b.unlockLevel === curLvl || curRelevantIds.has(b.output.id) ? 0 : 1;
    if (relA !== relB) return relA - relB;
    const da = diagA.ok ? 0 : 1;
    const db = diagB.ok ? 0 : 1;
    if (da !== db) return da - db;
    return b.unlockLevel - a.unlockLevel;
  });

  for (const rec of filteredRecipes) {
    const unlocked = rec.unlockLevel <= hud.state.currentLevel;
    const diag = hud.state.diagnoseRecipe(rec.id);
    const outMat = MATERIALS[rec.output.id];
    const recStationMeta = STATION_TYPES[rec.station] || STATION_TYPES.fabricator;
    const primaryBtnClass =
      recStationMeta.id === 'furnace' && hud.workbenchMode === 'furnace'
        ? 'amber-primary'
        : 'primary';

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
      el('div', 'schematic-title', `${hud.state.text(outMat.name)} ×${rec.output.count}`)
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
        hud.state.ui(catKey)
      )
    );
    outInfo.appendChild(outTextCol);

    // Right side of Top Row: Interactive Craft Buttons vs Field Handbook Station Badge!
    const rightCtrl = el('div', 'recipe-actions');
    if (diag.reason === 'already_crafted_main') {
      const isInstalled = Boolean(rec.targetRepairId && hud.state.repairs[rec.targetRepairId]);
      const isInBackpack = hud.state.getItemCount(rec.output.id) > 0;
      const pillClass = isInstalled ? 'ship-pill online' : 'ship-pill';
      const pillText = isInstalled
        ? `✓ ${hud.state.ui('btnComponentInstalled')}`
        : isInBackpack
          ? `★ ${hud.state.ui('btnComponentReadyToInstall')}`
          : `⏳ ${hud.state.ui('btnComponentQueued')}`;
      rightCtrl.appendChild(el('span', pillClass, pillText));
    } else if (diag.reason === 'already_equipped') {
      const isEquipped = hud.state.hasEquipment(rec.oneTimeEquipment);
      rightCtrl.appendChild(
        el(
          'span',
          isEquipped ? 'ship-pill online' : 'ship-pill',
          isEquipped ? hud.state.ui('btnEquipped') : `⏳ ${hud.state.ui('btnComponentQueued')}`
        )
      );
    } else if (hud.stationInteractive) {
      const btn = el(
        'button',
        `hud-btn${diag.ok ? ` ${primaryBtnClass}` : ''}`,
        hud.state.ui('btnCraft')
      );
      btn.disabled = !diag.ok;
      btn.addEventListener('click', () => {
        const res = hud.state.startCraft(rec.id);
        if (res.ok) {
          hud.sound.playCraftStart(recStationMeta.soundStyle || rec.station);
          renderWorkbenchBody(hud);
        } else {
          hud.sound.playError();
        }
      });
      rightCtrl.appendChild(btn);

      const maxBatch = hud.state.getMaxCraftableCount(rec.id);
      if (!rec.oneTimeMainComponent && maxBatch >= 2) {
        const batchCount = Math.min(maxBatch, 4);
        const batchBtn = el(
          'button',
          `hud-btn ${primaryBtnClass}`,
          hud.state.ui('btnCraftBatch', { count: batchCount })
        );
        batchBtn.addEventListener('click', () => {
          let started = 0;
          for (let i = 0; i < batchCount; i++) {
            const r = hud.state.startCraft(rec.id);
            if (r.ok) started++;
            else break;
          }
          if (started > 0) {
            hud.sound.playCraftStart(recStationMeta.soundStyle || rec.station);
            renderWorkbenchBody(hud);
          } else {
            hud.sound.playError();
          }
        });
        rightCtrl.appendChild(batchBtn);
      }
    } else {
      // In Portable Blueprint Pad [C]: clean informational station badge from STATION_TYPES!
      const stName = `${recStationMeta.icon} ${hud.state.text(recStationMeta.name)}`;
      rightCtrl.appendChild(
        el('span', 'station-loc-pill', hud.state.ui('goStationHint', { station: stName }))
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
      const have = hud.state.getItemCount(inp.id);
      const enough = have >= inp.count;
      const pill = el('div', `ing-pill ${enough ? 'enough' : 'short'}`);
      pill.appendChild(createMaterialIconCanvas(m, true));
      pill.appendChild(el('span', '', hud.state.text(m.name)));
      pill.appendChild(el('span', 'ing-qty', `${have}/${inp.count}`));
      inputsWrap.appendChild(pill);
    });

    const processSymbol = recStationMeta.processSymbol || '━━▶';
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
          `🔒 ${hud.state.ui('unlockedAtLevel', { level: rec.unlockLevel })}`
        )
      );
    } else if (diag.missing.length > 0 && diag.reason !== 'already_crafted_main') {
      const missText = diag.missing
        .map((m) => {
          const name = hud.state.text(MATERIALS[m.id].name);
          const craftedMeta = m.craftedIn ? STATION_TYPES[m.craftedIn] : null;
          const where = craftedMeta
            ? hud.state.text(craftedMeta.name)
            : m.regions.join(' / ');
          return `${m.missingCount}× ${name} (${where})`;
        })
        .join(' • ');
      card.appendChild(
        el(
          'div',
          'schematic-footer',
          `📍 ${hud.state.ui('missingMaterials', { items: missText })}`
        )
      );
    }

    scrollBody.appendChild(card);
  }

  hud.workbenchDrawer.appendChild(scrollBody);
}
