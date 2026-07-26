import { characters } from '../data/characters.mjs';

const BASE_VIEW_KEYS = ['loading', 'menu', 'chapters', 'hud', 'complete', 'fallback'];
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
  const views = {
    loading: find(root, '#loading-view'),
    menu: find(root, '#main-menu'),
    chapters: find(root, '#chapter-menu'),
    hud: find(root, '#hud'),
    complete: find(root, '#chapter-complete'),
    settings: find(root, '#settings-panel'),
    fallback: find(root, '#webgl-fallback')
  };
  const status = find(root, '#game-status');
  const layers = [...root.querySelectorAll('.game-layer')];
  const newGameButton = find(root, '[data-action="new-game"]');
  const teacherButton = find(root, '[data-action="teacher-browse"]');
  const settingsButton = find(root, '[data-action="settings"]');
  const closeSettingsButton = find(root, '[data-action="close-settings"]');
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

  function showBaseView(key) {
    activeBaseView = key;
    for (const viewKey of BASE_VIEW_KEYS) setVisible(views[viewKey], viewKey === key);
    setVisible(views.settings, false);
    setModalIsolation(false);
  }

  function restoreSettingsFocus() {
    const opener = settingsOpener;
    settingsOpener = null;
    if (opener?.isConnected && !opener.closest('[hidden]')) opener.focus();
  }

  function closeSettings() {
    setVisible(views.settings, false);
    setModalIsolation(false);
    restoreSettingsFocus();
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
  function handleTeacherBrowse() { handlers.onTeacherBrowse?.(); }
  function handleOpenSettings(event) {
    handlers.onSettings?.();
    openSettings({}, event.currentTarget);
  }

  newGameButton?.addEventListener('click', handleNewGame);
  teacherButton?.addEventListener('click', handleTeacherBrowse);
  settingsButton?.addEventListener('click', handleOpenSettings);
  closeSettingsButton?.addEventListener('click', closeSettings);
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
    showChapterMenu({ chapters = [] } = {}) {
      const list = find(views.chapters, '[data-chapter-list]');
      if (list) list.replaceChildren(...chapters.map((chapter) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = chapter.title;
        button.setAttribute('aria-label', `${chapter.title} ${chapter.description || ''}`.trim());
        return button;
      }));
      showBaseView('chapters');
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
      showBaseView('complete');
    },
    showSettings(settings = {}) {
      openSettings(settings);
    },
    showFallback(message = '当前设备不支持 WebGL') {
      if (views.fallback) views.fallback.textContent = message;
      showBaseView('fallback');
      if (status) status.textContent = message;
    },
    hideOverlay() {
      activeBaseView = null;
      for (const viewKey of BASE_VIEW_KEYS) setVisible(views[viewKey], false);
      setVisible(views.settings, false);
      setModalIsolation(false);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      newGameButton?.removeEventListener('click', handleNewGame);
      teacherButton?.removeEventListener('click', handleTeacherBrowse);
      settingsButton?.removeEventListener('click', handleOpenSettings);
      closeSettingsButton?.removeEventListener('click', closeSettings);
      views.settings?.removeEventListener('input', handleSettingsChange);
      views.settings?.removeEventListener('change', handleSettingsChange);
      root.removeEventListener('keydown', handleSettingsKeydown);
      setModalIsolation(false);
    }
  };
}
