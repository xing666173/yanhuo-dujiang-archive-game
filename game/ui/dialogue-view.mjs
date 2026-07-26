export const AUTO_ADVANCE_DELAY = 650;

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
    layer.innerHTML = '<div class="dialogue-frame"><div data-portrait></div><div><div><p data-speaker></p><button type="button" data-skip aria-label="跳过当前对话">››</button></div><button type="button" data-dialogue-line></button><div data-choice-list></div><p data-dialogue-status aria-live="polite" aria-atomic="true"></p></div></div><aside data-dialogue-history hidden></aside>';
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
    if (destroyed || !autoPlay || !complete || layer?.hidden) return;
    autoTimer = setTimeout(() => {
      autoTimer = null;
      if (!destroyed && autoPlay && complete && !layer?.hidden) handlers.onAdvance?.();
    }, AUTO_ADVANCE_DELAY);
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
  }

  line?.addEventListener('click', handleLineClick);
  skip?.addEventListener('click', handleSkip);

  return {
    renderNode(node = {}, character = {}) {
      if (destroyed) return;
      clearTimers();
      fullText = node.text || '';
      complete = false;
      if (speaker) speaker.textContent = character.name || node.speaker || '';
      if (liveStatus) liveStatus.textContent = `${character.name || node.speaker || ''} ${fullText}`.trim();
      if (portrait && character.portrait) {
        const index = expressionIndex[node.expression] ?? expressionIndex.calm;
        portrait.style.backgroundImage = `url("${character.portrait}")`;
        portrait.style.backgroundSize = '500% 100%';
        portrait.style.backgroundPositionX = `${index * 25}%`;
      }
      if (line) line.textContent = '';
      if (choices) choices.replaceChildren(...(node.choices || []).map((choice) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = typeof choice === 'string' ? choice : choice.label;
        button.addEventListener('click', () => handlers.onChoice?.(choice), { once: true });
        return button;
      }));
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
    hide() {
      clearTimers();
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
      const item = document.createElement('p');
      item.textContent = `${entry.speaker || ''} ${entry.text || ''}`.trim();
      history.append(item);
    },
    showHistory() {
      if (history) history.hidden = false;
    },
    hideHistory() {
      if (history) history.hidden = true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimers();
      line?.removeEventListener('click', handleLineClick);
      skip?.removeEventListener('click', handleSkip);
      root.dataset.dialogueActive = 'false';
    }
  };
}
