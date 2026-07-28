export const AUTO_ADVANCE_DELAY = 1600;

export const expressionIndex = {
  calm: 0,
  thinking: 1,
  surprised: 2,
  arguing: 3,
  relieved: 4
};

function ensureMarkup(root) {
  const layer = root.querySelector('#dialogue-layer');
  if (layer && !layer.querySelector('[data-dialogue-line]')) {
    layer.dataset.layoutRegion = 'dialogue';
    layer.innerHTML = '<div class="dialogue-frame"><div class="portrait" data-portrait aria-hidden="true"></div><div class="dialogue-content"><div class="dialogue-heading"><p class="speaker" data-speaker></p><button type="button" class="skip-button" data-skip aria-label="跳过当前对话">››</button></div><button type="button" class="dialogue-line" data-dialogue-line aria-label="显示完整对话或继续"></button><div class="choice-list" data-choice-list data-layout-region="choices"></div><p class="sr-only" data-dialogue-status aria-live="polite" aria-atomic="true"></p></div></div><aside class="history-panel" data-dialogue-history hidden aria-label="对话记录"></aside>';
  }
  return layer;
}

export function createDialogueView(root, handlers = {}) {
  const layer = ensureMarkup(root);
  const portrait = layer?.querySelector('[data-portrait]');
  const speaker = layer?.querySelector('[data-speaker]');
  const line = layer?.querySelector('[data-dialogue-line]');
  const choices = layer?.querySelector('[data-choice-list]');
  const history = layer?.querySelector('[data-dialogue-history]');
  const liveStatus = layer?.querySelector('[data-dialogue-status]');
  const skip = layer?.querySelector('[data-skip]');
  let fullText = '';
  let complete = true;
  let typewriter = null;
  let autoTimer = null;
  let autoPlay = false;
  let currentWasRead = false;
  let portraitRequest = 0;
  const pauseReasons = new Set();
  const historyKeys = new Set();
  let destroyed = false;

  function clearTimers() {
    clearInterval(typewriter);
    clearTimeout(autoTimer);
    typewriter = null;
    autoTimer = null;
  }

  function scheduleAutoAdvance() {
    clearTimeout(autoTimer);
    autoTimer = null;
    const choiceVisible = Boolean(choices?.children.length);
    if (destroyed || !autoPlay || !complete || layer?.hidden || choiceVisible || pauseReasons.size) return;
    const delay = Math.max(AUTO_ADVANCE_DELAY, fullText.length * 70);
    autoTimer = setTimeout(() => {
      autoTimer = null;
      if (!destroyed && autoPlay && complete && !layer?.hidden && !pauseReasons.size) handlers.onAdvance?.();
    }, delay);
  }

  function reveal({ schedule = true } = {}) {
    clearInterval(typewriter);
    typewriter = null;
    if (line) line.textContent = fullText;
    complete = true;
    if (schedule) scheduleAutoAdvance();
  }

  function handleLineClick() {
    clearTimeout(autoTimer);
    autoTimer = null;
    if (!complete) reveal({ schedule: false });
    else handlers.onAdvance?.();
  }

  function handleSkip() {
    clearTimeout(autoTimer);
    autoTimer = null;
    if (!complete) reveal({ schedule: false });
    else if (currentWasRead && !choices?.children.length) handlers.onAdvance?.();
  }

  line?.addEventListener('click', handleLineClick);
  skip?.addEventListener('click', handleSkip);

  return {
    renderNode(node = {}, character = {}, metadata = {}) {
      if (destroyed) return;
      clearTimers();
      fullText = node.text || node.prompt || '';
      complete = false;
      currentWasRead = Boolean(metadata.wasRead);
      if (speaker) speaker.textContent = character.name || node.speaker || '';
      if (liveStatus) liveStatus.textContent = `${character.name || node.speaker || ''} ${fullText}`.trim();
      if (portrait && character.portrait) {
        const request = ++portraitRequest;
        const index = expressionIndex[node.expression] ?? expressionIndex.calm;
        portrait.style.backgroundImage = `url("${character.portrait}")`;
        portrait.style.backgroundSize = '500% 100%';
        portrait.style.backgroundPositionX = `${index * 25}%`;
        portrait.dataset.empty = 'false';
        portrait.removeAttribute('data-portrait-fallback');
        portrait.replaceChildren();
        const image = new Image();
        image.onload = () => {
          if (destroyed || request !== portraitRequest) return;
          portrait.removeAttribute('data-portrait-fallback');
          portrait.replaceChildren();
        };
        image.onerror = () => {
          if (destroyed || request !== portraitRequest) return;
          portrait.style.backgroundImage = 'none';
          portrait.dataset.portraitFallback = 'true';
          const name = document.createElement('span');
          name.textContent = character.name || node.speaker || '';
          portrait.replaceChildren(name);
        };
        image.src = character.portrait;
      } else if (portrait) {
        portraitRequest += 1;
        portrait.style.backgroundImage = 'none';
        portrait.dataset.empty = 'true';
        portrait.removeAttribute('data-portrait-fallback');
        portrait.replaceChildren();
      }
      if (line) line.textContent = '';
      if (choices) choices.replaceChildren(...(node.choices || []).map((choice) => {
        const button = document.createElement('button');
        const label = document.createElement('span');
        button.type = 'button';
        label.dataset.choiceLabel = '';
        label.textContent = typeof choice === 'string' ? choice : choice.label;
        const indicator = document.createElement('span');
        indicator.className = 'choice-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.textContent = '→';
        button.append(label, indicator);
        button.addEventListener('click', () => handlers.onChoice?.(choice), { once: true });
        return button;
      }));
      if (skip) {
        skip.disabled = !currentWasRead;
        skip.title = currentWasRead ? '跳过已读对话' : '当前对话尚未读完';
      }
      const historyKey = node.id || `${character.name || node.speaker || ''}\u0000${fullText}`;
      if (fullText && !historyKeys.has(historyKey)) {
        historyKeys.add(historyKey);
        this.appendHistory({ speaker: character.name || node.speaker || '', text: fullText });
      }
      const reduced = root.dataset.reducedMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || !fullText) {
        reveal();
        return;
      }
      let index = 0;
      typewriter = setInterval(() => {
        index += 1;
        if (line) line.textContent = fullText.slice(0, index);
        if (index >= fullText.length) reveal();
      }, 22);
    },
    show() {
      if (destroyed) return;
      if (layer) layer.hidden = false;
      root.querySelector('#main-menu')?.setAttribute('hidden', '');
      root.dataset.dialogueActive = 'true';
      scheduleAutoAdvance();
    },
    hide({ preserve = false } = {}) {
      if (preserve) reveal({ schedule: false });
      else clearTimers();
      if (layer) layer.hidden = true;
      root.dataset.dialogueActive = 'false';
    },
    setAutoPlay(enabled) {
      autoPlay = Boolean(enabled);
      if (layer) layer.dataset.autoPlay = String(autoPlay);
      clearTimeout(autoTimer);
      autoTimer = null;
      scheduleAutoAdvance();
    },
    appendHistory(entry = {}) {
      if (!history) return;
      const key = `${entry.speaker || ''}\u0000${entry.text || ''}`;
      if (historyKeys.has(key)) return;
      historyKeys.add(key);
      const item = document.createElement('p');
      item.textContent = `${entry.speaker || ''} ${entry.text || ''}`.trim();
      history.append(item);
    },
    showHistory() {
      if (history) history.hidden = false;
      pauseReasons.add('history');
      root.dataset.historyOpen = 'true';
      clearTimeout(autoTimer);
      autoTimer = null;
      handlers.onHistoryChange?.(true);
    },
    hideHistory() {
      if (history) history.hidden = true;
      pauseReasons.delete('history');
      root.dataset.historyOpen = 'false';
      handlers.onHistoryChange?.(false);
      scheduleAutoAdvance();
    },
    setPaused(reason, paused) {
      if (paused) pauseReasons.add(reason);
      else pauseReasons.delete(reason);
      clearTimeout(autoTimer);
      autoTimer = null;
      scheduleAutoAdvance();
    },
    toggleHistory() {
      if (!history) return false;
      if (history.hidden) this.showHistory();
      else this.hideHistory();
      return !history.hidden;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      portraitRequest += 1;
      clearTimers();
      line?.removeEventListener('click', handleLineClick);
      skip?.removeEventListener('click', handleSkip);
      root.dataset.dialogueActive = 'false';
    }
  };
}
