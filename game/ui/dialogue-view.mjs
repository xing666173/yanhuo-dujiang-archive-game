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
  let fullText = '';
  let complete = true;
  let typewriter;

  function reveal() {
    clearInterval(typewriter);
    if (line) line.textContent = fullText;
    complete = true;
  }

  line?.addEventListener('click', () => {
    if (!complete) reveal();
    else handlers.onAdvance?.();
  });
  layer?.querySelector('[data-skip]')?.addEventListener('click', reveal);

  return {
    renderNode(node = {}, character = {}) {
      clearInterval(typewriter);
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
        button.addEventListener('click', () => handlers.onChoice?.(choice));
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
      if (layer) layer.hidden = false;
      root.querySelector('#main-menu')?.setAttribute('hidden', '');
      root.dataset.dialogueActive = 'true';
    },
    hide() {
      clearInterval(typewriter);
      if (layer) layer.hidden = true;
      root.dataset.dialogueActive = 'false';
    },
    setAutoPlay(enabled) {
      if (layer) layer.dataset.autoPlay = String(Boolean(enabled));
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
    }
  };
}
