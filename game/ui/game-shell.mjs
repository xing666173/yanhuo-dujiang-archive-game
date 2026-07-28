import { characters } from '../data/characters.mjs';

const BASE_VIEW_KEYS = ['loading', 'menu', 'hud', 'complete', 'fallback'];
const SETTING_NAMES = ['music', 'ambience', 'uiSound'];

function find(root, selector) {
  return root.querySelector(selector);
}

function setVisible(element, visible) {
  if (element) element.hidden = !visible;
}

function clampVolume(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function settingValue(value) {
  const number = Number(value);
  return clampVolume(number > 1 ? number / 100 : number);
}

function focusableElements(container) {
  return [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')]
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

export function createGameShell(root, handlers = {}) {
  const ownerDocument = root.ownerDocument;
  const pauseButton = find(root, '[data-action="pause"]');
  const pauseParent = pauseButton?.parentElement || null;
  const pauseNextSibling = pauseButton?.nextSibling || null;
  const runtimeControls = ownerDocument.createElement('nav');
  runtimeControls.className = 'game-layer runtime-controls';
  runtimeControls.dataset.layoutRegion = 'runtime-controls';
  runtimeControls.setAttribute('aria-label', '场景控制');
  runtimeControls.hidden = true;
  const controlDefinitions = [
    ['history', '对话记录', '▤', '记录'],
    ['auto-play', '自动播放', '▶', '自动'],
    ['scene-settings', '场景设置', '⚙', '设置']
  ];
  for (const [action, label, icon, text] of controlDefinitions) {
    const button = ownerDocument.createElement('button');
    const controlIcon = ownerDocument.createElement('span');
    const controlLabel = ownerDocument.createElement('span');
    button.type = 'button';
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = label;
    controlIcon.dataset.controlIcon = '';
    controlIcon.setAttribute('aria-hidden', 'true');
    controlIcon.textContent = icon;
    controlLabel.dataset.controlLabel = '';
    controlLabel.textContent = text;
    button.append(controlIcon, controlLabel);
    runtimeControls.append(button);
  }
  if (pauseButton) runtimeControls.append(pauseButton);
  root.append(runtimeControls);
  const interactionPrompt = ownerDocument.createElement('button');
  interactionPrompt.type = 'button';
  interactionPrompt.className = 'interaction-prompt';
  interactionPrompt.dataset.action = 'interact-prompt';
  interactionPrompt.dataset.layoutRegion = 'hotspot-prompt';
  interactionPrompt.title = '互动';
  const promptIcon = ownerDocument.createElement('span');
  const promptLabel = ownerDocument.createElement('span');
  promptIcon.setAttribute('aria-hidden', 'true');
  promptIcon.textContent = '◎';
  promptLabel.textContent = '互动';
  interactionPrompt.append(promptIcon, promptLabel);
  interactionPrompt.hidden = true;
  root.append(interactionPrompt);

  const views = {
    loading: find(root, '#loading-view'),
    menu: find(root, '#main-menu'),
    hud: find(root, '#hud'),
    complete: find(root, '#chapter-complete'),
    settings: find(root, '#settings-panel'),
    fallback: find(root, '#webgl-fallback')
  };
  const status = find(root, '#game-status');
  const layers = [...root.querySelectorAll('.game-layer')];
  const desktopControls = find(root, '#desktop-controls');
  const touchControls = find(root, '#touch-controls');
  const continueButton = find(root, '[data-action="continue"]');
  const newGameButton = find(root, '[data-action="new-game"]');
  const settingsButton = find(root, '[data-action="settings"]');
  const closeSettingsButton = find(root, '[data-action="close-settings"]');
  const historyButton = find(runtimeControls, '[data-action="history"]');
  const autoPlayButton = find(runtimeControls, '[data-action="auto-play"]');
  const sceneSettingsButton = find(runtimeControls, '[data-action="scene-settings"]');
  let activeBaseView = null;
  let settingsOpener = null;
  let destroyed = false;

  for (const character of Object.values(characters)) {
    if (!character.portrait) continue;
    const portrait = new Image();
    portrait.src = character.portrait;
  }

  function readSettings() {
    const quality = find(views.settings, '[name="quality"]:checked')?.value || 'auto';
    const values = { quality };
    for (const name of SETTING_NAMES) {
      values[name] = clampVolume(Number(find(views.settings, `[name="${name}"]`)?.value || 0) / 100);
    }
    values.autoPlay = Boolean(find(views.settings, '[name="autoPlay"]')?.checked);
    values.reducedMotion = Boolean(find(views.settings, '[name="reducedMotion"]')?.checked);
    return values;
  }

  function setModalIsolation(enabled) {
    for (const layer of layers) {
      if (layer === views.settings) continue;
      layer.inert = enabled;
      if (enabled) layer.setAttribute('aria-hidden', 'true');
      else if (!layer.hidden) layer.removeAttribute('aria-hidden');
    }
  }

  function syncGameplayActive() {
    const taskOpen = root.dataset.fieldTaskActive === 'true';
    const gameplayControlsVisible = activeBaseView === 'hud'
      && views.settings?.hidden
      && !taskOpen;
    root.dataset.gameplayActive = String(gameplayControlsVisible);
    runtimeControls.hidden = !gameplayControlsVisible;
    if (pauseButton) pauseButton.hidden = !gameplayControlsVisible;
    if (desktopControls) desktopControls.hidden = !gameplayControlsVisible;
    if (touchControls) touchControls.hidden = !gameplayControlsVisible;
    interactionPrompt.hidden = !(gameplayControlsVisible && root.dataset.interactionAvailable === 'true');
  }

  function canReceiveFocus(element) {
    return element === root.ownerDocument.body || Boolean(
      element?.isConnected
      && !element.disabled
      && !element.inert
      && !element.closest('[hidden], [inert]')
      && element.getClientRects().length
    );
  }

  function fallbackFocusTarget(viewKey = activeBaseView) {
    const viewTarget = viewKey === 'menu'
      ? focusableElements(views[viewKey] || root).find(canReceiveFocus)
      : null;
    if (viewTarget) return viewTarget;
    const body = root.ownerDocument.body;
    if (!body.hasAttribute('tabindex')) body.tabIndex = -1;
    return body;
  }

  function closeSettings({ fallbackView = activeBaseView } = {}) {
    const wasOpen = !views.settings?.hidden;
    setVisible(views.settings, false);
    setModalIsolation(false);
    syncGameplayActive();
    if (!wasOpen) return;
    handlers.onSettingsVisibilityChange?.(false);
    const opener = settingsOpener;
    settingsOpener = null;
    const target = canReceiveFocus(opener) ? opener : fallbackFocusTarget(fallbackView);
    target?.focus();
  }

  function showBaseView(key) {
    activeBaseView = key;
    for (const viewKey of BASE_VIEW_KEYS) setVisible(views[viewKey], viewKey === key);
    closeSettings({ fallbackView: key });
  }

  function openSettings(settings = {}, opener = null) {
    const quality = ['auto', 'high', 'low'].includes(settings.quality) ? settings.quality : 'auto';
    const qualityInput = find(views.settings, `[name="quality"][value="${quality}"]`);
    if (qualityInput) qualityInput.checked = true;
    for (const name of SETTING_NAMES) {
      const control = find(views.settings, `[name="${name}"]`);
      if (control && name in settings) control.value = String(Math.round(settingValue(settings[name]) * 100));
    }
    for (const name of ['autoPlay', 'reducedMotion']) {
      const control = find(views.settings, `[name="${name}"]`);
      if (control && name in settings) control.checked = Boolean(settings[name]);
    }
    root.dataset.reducedMotion = String(Boolean(find(views.settings, '[name="reducedMotion"]')?.checked));
    settingsOpener = opener || root.ownerDocument.activeElement;
    setVisible(views.settings, true);
    setModalIsolation(true);
    syncGameplayActive();
    handlers.onSettingsVisibilityChange?.(true);
    (closeSettingsButton || focusableElements(views.settings)[0])?.focus();
  }

  function handleSettingsKeydown(event) {
    if (destroyed || views.settings?.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = focusableElements(views.settings);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables.at(-1);
    if (event.shiftKey && root.ownerDocument.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && root.ownerDocument.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleSettingsChange(event) {
    if (destroyed || !event.target.matches('[name="quality"], [name="music"], [name="ambience"], [name="uiSound"], [name="autoPlay"], [name="reducedMotion"]')) return;
    root.dataset.reducedMotion = String(Boolean(find(views.settings, '[name="reducedMotion"]')?.checked));
    handlers.onSettingsChange?.(readSettings());
  }

  function handleNewGame() { handlers.onNewGame?.(); }
  function handleContinue() { handlers.onContinue?.(); }
  function handleOpenSettings(event) {
    const settings = handlers.onSettings?.() || {};
    openSettings(settings, event.currentTarget);
  }
  function handlePause() { handlers.onPause?.(); }
  function handleHistory() { handlers.onHistory?.(); }
  function handleAutoPlay() { handlers.onAutoPlay?.(); }
  function handleInteract() { handlers.onInteract?.(); }

  continueButton?.addEventListener('click', handleContinue);
  newGameButton?.addEventListener('click', handleNewGame);
  settingsButton?.addEventListener('click', handleOpenSettings);
  closeSettingsButton?.addEventListener('click', closeSettings);
  pauseButton?.addEventListener('click', handlePause);
  historyButton?.addEventListener('click', handleHistory);
  autoPlayButton?.addEventListener('click', handleAutoPlay);
  sceneSettingsButton?.addEventListener('click', handleOpenSettings);
  interactionPrompt.addEventListener('click', handleInteract);
  views.settings?.addEventListener('input', handleSettingsChange);
  views.settings?.addEventListener('change', handleSettingsChange);
  root.addEventListener('keydown', handleSettingsKeydown);

  return {
    showLoading({ message = '正在准备场景', progress = 0 } = {}) {
      showBaseView('loading');
      const messageNode = find(views.loading, '[data-loading-message]');
      const progressNode = find(views.loading, '[data-loading-progress]');
      if (messageNode) messageNode.textContent = message;
      if (progressNode) progressNode.value = progress;
      if (status) status.textContent = message;
    },
    showMainMenu({ hasSave = false } = {}) {
      showBaseView('menu');
      setVisible(find(views.menu, '[data-action="continue"]'), hasSave);
      if (status) status.textContent = '主菜单已打开';
    },
    showHud({ chapterTitle = '' } = {}) {
      const title = find(views.hud, '[data-chapter-title]');
      if (title) title.textContent = chapterTitle;
      showBaseView('hud');
      if (status) status.textContent = chapterTitle;
    },
    showChapterComplete({ summary = '', stats = [] } = {}) {
      const summaryNode = find(views.complete, '[data-complete-summary]');
      const statsNode = find(views.complete, '[data-complete-stats]');
      if (summaryNode) summaryNode.textContent = summary;
      if (statsNode) statsNode.replaceChildren(...stats.map((stat) => {
        const item = document.createElement('li');
        item.textContent = stat;
        return item;
      }));
      let returnLink = find(views.complete, '[data-return-results]');
      if (!returnLink) {
        returnLink = ownerDocument.createElement('a');
        returnLink.href = '../';
        returnLink.dataset.returnResults = '';
        returnLink.textContent = '返回成果页';
        views.complete?.append(returnLink);
      }
      showBaseView('complete');
    },
    showSettings(settings = {}) {
      openSettings(settings);
    },
    showFallback(message = '当前设备不支持 WebGL') {
      if (views.fallback) {
        const text = ownerDocument.createElement('p');
        text.textContent = message;
        const link = ownerDocument.createElement('a');
        link.href = '../';
        link.textContent = '返回成果页';
        views.fallback.replaceChildren(text, link);
      }
      showBaseView('fallback');
      if (status) status.textContent = message;
    },
    hideOverlay() {
      activeBaseView = null;
      for (const viewKey of BASE_VIEW_KEYS) setVisible(views[viewKey], false);
      closeSettings({ fallbackView: null });
    },
    setHotspot(hotspot) {
      root.dataset.interactionAvailable = String(Boolean(hotspot));
      interactionPrompt.hidden = !hotspot || root.dataset.gameplayActive !== 'true';
      interactionPrompt.setAttribute('aria-label', hotspot ? `互动 ${hotspot.id}` : '附近暂无互动');
      const button = find(root, '[data-interact]');
      if (button) {
        button.disabled = !hotspot;
        button.setAttribute('aria-label', hotspot ? `互动 ${hotspot.id}` : '附近暂无互动');
      }
    },
    setAutoPlayActive(active) {
      autoPlayButton?.setAttribute('aria-pressed', String(Boolean(active)));
    },
    setFieldTaskActive(active) {
      root.dataset.fieldTaskActive = String(Boolean(active));
      syncGameplayActive();
    },
    isSettingsOpen() {
      return Boolean(views.settings && !views.settings.hidden);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      continueButton?.removeEventListener('click', handleContinue);
      newGameButton?.removeEventListener('click', handleNewGame);
      settingsButton?.removeEventListener('click', handleOpenSettings);
      closeSettingsButton?.removeEventListener('click', closeSettings);
      pauseButton?.removeEventListener('click', handlePause);
      historyButton?.removeEventListener('click', handleHistory);
      autoPlayButton?.removeEventListener('click', handleAutoPlay);
      sceneSettingsButton?.removeEventListener('click', handleOpenSettings);
      interactionPrompt.removeEventListener('click', handleInteract);
      views.settings?.removeEventListener('input', handleSettingsChange);
      views.settings?.removeEventListener('change', handleSettingsChange);
      root.removeEventListener('keydown', handleSettingsKeydown);
      closeSettings({ fallbackView: null });
      root.dataset.gameplayActive = 'false';
      root.dataset.fieldTaskActive = 'false';
      if (pauseButton) {
        const sibling = pauseNextSibling?.parentNode === pauseParent ? pauseNextSibling : null;
        if (pauseParent?.isConnected) pauseParent.insertBefore(pauseButton, sibling);
        else root.append(pauseButton);
      }
      runtimeControls.remove();
      interactionPrompt.remove();
    }
  };
}
