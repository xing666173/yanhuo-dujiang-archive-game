function find(root, selector) {
  return root.querySelector(selector);
}

function setVisible(element, visible) {
  if (element) element.hidden = !visible;
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

  for (const character of Object.values(characters)) {
    if (!character.portrait) continue;
    const portrait = new Image();
    portrait.src = character.portrait;
  }

  find(root, '[data-action="new-game"]')?.addEventListener('click', () => handlers.onNewGame?.());
  find(root, '[data-action="teacher-browse"]')?.addEventListener('click', () => handlers.onTeacherBrowse?.());
  find(root, '[data-action="settings"]')?.addEventListener('click', () => {
    handlers.onSettings?.();
    setVisible(views.settings, true);
  });
  find(root, '[data-action="close-settings"]')?.addEventListener('click', () => setVisible(views.settings, false));
  find(root, '[aria-label="减少动态效果"]')?.addEventListener('change', (event) => {
    root.dataset.reducedMotion = String(event.currentTarget.checked);
  });

  return {
    showLoading({ message = '正在准备场景', progress = 0 } = {}) {
      setVisible(views.loading, true);
      const messageNode = find(views.loading, '[data-loading-message]');
      const progressNode = find(views.loading, '[data-loading-progress]');
      if (messageNode) messageNode.textContent = message;
      if (progressNode) progressNode.value = progress;
      if (status) status.textContent = message;
    },
    showMainMenu({ hasSave = false } = {}) {
      setVisible(views.menu, true);
      const continueButton = find(views.menu, '[data-action="continue"]');
      setVisible(continueButton, hasSave);
      if (status) status.textContent = '主菜单已打开';
    },
    showChapterMenu({ chapters = [] } = {}) {
      const list = find(views.chapters, '[data-chapter-list]');
      if (list) {
        list.replaceChildren(...chapters.map((chapter) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = chapter.title;
          button.setAttribute('aria-label', `${chapter.title} ${chapter.description || ''}`.trim());
          return button;
        }));
      }
      setVisible(views.chapters, true);
    },
    showHud({ chapterTitle = '' } = {}) {
      const title = find(views.hud, '[data-chapter-title]');
      if (title) title.textContent = chapterTitle;
      setVisible(views.hud, true);
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
      setVisible(views.complete, true);
    },
    showSettings(settings = {}) {
      const quality = settings.quality || 'auto';
      const qualityInput = find(views.settings, `[name="quality"][value="${quality}"]`);
      if (qualityInput) qualityInput.checked = true;
      for (const [name, value] of Object.entries(settings)) {
        const control = find(views.settings, `[name="${name}"]`);
        if (control && control.type === 'checkbox') control.checked = Boolean(value);
      }
      setVisible(views.settings, true);
    },
    showFallback(message = '当前设备不支持 WebGL') {
      if (views.fallback) views.fallback.textContent = message;
      setVisible(views.fallback, true);
      if (status) status.textContent = message;
    },
    hideOverlay() {
      for (const view of Object.values(views)) setVisible(view, false);
    }
  };
}
import { characters } from '../data/characters.mjs';
