import { el, clearChildren } from './domHelpers.js';
import { HOMEWORLD_COPY } from '../data/homeworldActivities.js';

export function renderPauseModal(hud, homeworldHudCopy) {
  hud.workbenchDrawer.classList.add('hidden');
  if (!hud.inHomeworldRoamMode) {
    hud.topRight.classList.remove('hidden');
  }
  hud.activeModal = 'pause';
  hud.modalBackdrop.classList.remove('hidden', 'title-mode');
  clearChildren(hud.modalPanel);

  const header = el('div', 'modal-header');
  header.append(
    el('div', 'modal-title', hud.state.ui('btnPause')),
    hud._makeCloseButton()
  );
  hud.modalPanel.appendChild(header);

  // 1. User-Customizable HUD & Non-Essential Hints Box!
  const prefBox = el('div', 'queue-box');
  prefBox.appendChild(el('div', 'section-label', hud.inHomeworldRoamMode ?
    hud.state.text(homeworldHudCopy.navigation) : hud.state.ui('hudPrefsLabel')));
  const prefRow = el('div', 'station-tabs');
  prefRow.style.flexWrap = 'wrap';

  const prefItems = hud.inHomeworldRoamMode ? [
    ['guideArrow', homeworldHudCopy.guideArrow],
    ['showCompass', homeworldHudCopy.compass]
  ] : [
    ['guideArrow', 'prefGuideArrow'],
    ['showCompass', 'prefTopCompass'],
    ['showWorldLabels', 'prefWorldLabels'],
    ['showIdleTips', 'prefIdleTips']
  ];
  for (const [pKey, labelKey] of prefItems) {
    const enabled = hud.state.settings[pKey] !== false;
    const pb = el(
      'button',
      `hud-btn${enabled ? ' primary' : ''}`,
      `${enabled ? '✓ ' : '○ '}${typeof labelKey === 'string' ? hud.state.ui(labelKey) : hud.state.text(labelKey)}`
    );
    pb.setAttribute('data-hud-pref', pKey);
    pb.addEventListener('click', () => {
      hud.sound.playUiClick();
      hud.state.setHudPref(pKey, !enabled);
      hud.openPauseModal();
    });
    prefRow.appendChild(pb);
  }
  prefBox.appendChild(prefRow);
  hud.modalPanel.appendChild(prefBox);

  // 2. Audio, Language & Graphics Quality Settings (accessible on mobile & small screens!)
  const qBox = el('div', 'queue-box');
  qBox.appendChild(el('div', 'section-label', hud.state.ui('qualityLabel')));
  const qRow = el('div', 'station-tabs');
  qRow.style.flexWrap = 'wrap';
  for (const [qVal, qKey] of [
    ['ultra', 'qualityUltra'],
    ['high', 'qualityHigh'],
    ['medium', 'qualityMedium'],
    ['low', 'qualityLow']
  ]) {
    const qb = el(
      'button',
      `hud-btn${hud.state.settings.quality === qVal ? ' primary' : ''}`,
      hud.state.ui(qKey)
    );
    qb.addEventListener('click', () => {
      hud.sound.playUiClick();
      hud.state.setQuality(qVal);
      hud.actions.onQualityChange(qVal);
      hud.openPauseModal();
    });
    qRow.appendChild(qb);
  }

  const audioBtn = el(
    'button',
    `hud-btn${!hud.state.settings.muted ? ' primary' : ''}`,
    hud.state.settings.muted ? hud.state.ui('audioOff') : hud.state.ui('audioOn')
  );
  audioBtn.addEventListener('click', () => {
    hud.state.setMuted(!hud.state.settings.muted);
    hud.sound.setMuted(hud.state.settings.muted);
    if (!hud.state.settings.muted) hud.sound.playUiClick();
    hud.openPauseModal();
  });

  const langBtn = el('button', 'hud-btn', hud.state.ui('langToggle'));
  langBtn.addEventListener('click', () => {
    hud.sound.playUiClick();
    hud.state.setLang(hud.state.lang === 'en' ? 'zh' : 'en');
    hud.openPauseModal();
  });

  qRow.append(audioBtn, langBtn);
  qBox.appendChild(qRow);
  const isTouch = (typeof document !== 'undefined' && document.body.classList.contains('touch-active')) ||
    (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  if (isTouch) {
    const medium = hud.state.ui('qualityMedium');
    qBox.appendChild(el('div', 'hero-sub', hud.state.text({
      zh: `长时间游玩建议选择“${medium}”。高和极高档持续功耗更高；暂停可让场景停止持续绘制。`,
      en: `For longer sessions, use ${medium}. High and Ultra draw more power over time; pausing stops continuous scene rendering.`
    })));
  }
  hud.modalPanel.appendChild(qBox);

  // 2.5 Planetary Day-Night Cycle & Kharis-4 Desert Weather Controls!
  const envBox = el('div', 'queue-box');
  if (hud.inHomeworldRoamMode) {
    envBox.append(el('div', 'section-label', hud.state.text(homeworldHudCopy.environment)),
      el('div', 'hero-sub', hud.state.text(homeworldHudCopy.environmentNote)));
    if (hud.state.isHomeworldAtmosphereUnlocked?.()) {
      const atmoRow = el('div', 'station-tabs');
      atmoRow.style.marginTop = '8px';
      atmoRow.style.flexWrap = 'wrap';
      const curAtmo = hud.state.getHomeworldAtmosphere();
      for (const [mVal, mCopy] of [
        ['dawn', HOMEWORLD_COPY.atmoDawn],
        ['sunset', HOMEWORLD_COPY.atmoSunset],
        ['night', HOMEWORLD_COPY.atmoNight]
      ]) {
        const ab = el(
          'button',
          `hud-btn${curAtmo === mVal ? ' primary' : ''}`,
          hud.state.text(mCopy)
        );
        ab.addEventListener('click', () => {
          hud.sound.playUiClick();
          hud.state.setHomeworldAtmosphere(mVal);
          hud.openPauseModal();
        });
        atmoRow.appendChild(ab);
      }
      envBox.appendChild(atmoRow);
    }
  } else {
    envBox.appendChild(el('div', 'section-label', hud.state.ui('envTimeLabel')));
    const timeRow = el('div', 'station-tabs');
    timeRow.style.flexWrap = 'wrap';
    const curTimeMode = hud.state.settings.timeMode || 'cycle';
    for (const [tVal, tKey] of [
      ['cycle', 'timeCycle'],
      ['day', 'timeDay'],
      ['night', 'timeNight']
    ]) {
      const tb = el(
        'button',
        `hud-btn${curTimeMode === tVal ? ' primary' : ''}`,
        hud.state.ui(tKey)
      );
      tb.addEventListener('click', () => {
        hud.sound.playUiClick();
        hud.state.setTimeMode(tVal);
        hud.openPauseModal();
      });
      timeRow.appendChild(tb);
    }
    envBox.appendChild(timeRow);

    const wLabel = el('div', 'section-label', hud.state.ui('envWeatherLabel'));
    wLabel.style.marginTop = '10px';
    envBox.appendChild(wLabel);
    const weatherRow = el('div', 'station-tabs');
    weatherRow.style.flexWrap = 'wrap';
    const curWeatherMode = hud.state.settings.weatherMode || 'dynamic';
    for (const [wVal, wKey] of [
      ['dynamic', 'weatherDynamic'],
      ['clear', 'weatherClear'],
      ['overcast', 'weatherOvercast'],
      ['sandstorm', 'weatherSandstorm']
    ]) {
      const wb = el(
        'button',
        `hud-btn${curWeatherMode === wVal ? ' primary' : ''}`,
        hud.state.ui(wKey)
      );
      wb.addEventListener('click', () => {
        hud.sound.playUiClick();
        hud.state.setWeatherMode(wVal);
        hud.openPauseModal();
      });
      weatherRow.appendChild(wb);
    }
    envBox.appendChild(weatherRow);
  }
  hud.modalPanel.appendChild(envBox);

  const actCol = el('div', 'recipe-grid');

  const btnResume = el('button', 'hud-btn primary', hud.inHomeworldRoamMode ?
    hud.state.text(homeworldHudCopy.resume) : hud.state.ui('btnResume'));
  btnResume.addEventListener('click', () => hud.closeModal());

  const btnUnstuck = el('button', 'hud-btn', hud.inHomeworldRoamMode ?
    hud.state.text(homeworldHudCopy.unstuck) : hud.state.ui('btnRestartLevel'));
  btnUnstuck.addEventListener('click', () => {
    hud.closeModal();
    hud.actions.onUnstuck();
  });

  actCol.append(btnResume, btnUnstuck);

  if (!hud.confirmingReset) {
    const btnReset = el('button', 'hud-btn', hud.state.ui('btnResetGame'));
    btnReset.addEventListener('click', () => {
      hud.sound.playUiClick();
      hud.confirmingReset = true;
      hud.openPauseModal();
    });
    actCol.appendChild(btnReset);
  } else {
    const confirmBox = el('div', 'queue-box');
    confirmBox.appendChild(el('div', 'recipe-missing', hud.state.ui('confirmReset')));
    const cRow = el('div', 'station-tabs');
    cRow.style.marginTop = '8px';
    const yesBtn = el('button', 'hud-btn primary', hud.state.ui('btnConfirmYes'));
    yesBtn.addEventListener('click', () => {
      hud.closeModal();
      hud.actions.onResetGame();
    });
    const noBtn = el('button', 'hud-btn', hud.state.ui('btnCancel'));
    noBtn.addEventListener('click', () => {
      hud.confirmingReset = false;
      hud.openPauseModal();
    });
    cRow.append(yesBtn, noBtn);
    confirmBox.appendChild(cRow);
    actCol.appendChild(confirmBox);
  }

  hud.modalPanel.appendChild(actCol);
}
