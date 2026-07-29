const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[href]'
].join(',');

function canReceiveFocus(element, container = null) {
  return Boolean(
    element?.isConnected
    && !element.disabled
    && !element.inert
    && !element.closest('[hidden], [inert]')
    && (!container || container.contains(element))
    && element.getClientRects().length
  );
}

function focusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
    .filter((element) => canReceiveFocus(element, container));
}

function bodyFallback(ownerDocument) {
  const body = ownerDocument.body;
  if (!body.hasAttribute('tabindex')) body.tabIndex = -1;
  return body;
}

export function createModalFocusScope(container) {
  if (!container?.ownerDocument) throw new Error('Modal focus scope requires a container');
  const ownerDocument = container.ownerDocument;
  let restoreTarget = null;
  let open = false;
  let destroyed = false;

  function preferredElement(preferred) {
    if (typeof preferred === 'string') return container.querySelector(preferred);
    return preferred;
  }

  function handleKeydown(event) {
    if (destroyed || !open || event.key !== 'Tab') return;
    const focusables = focusableElements(container);
    if (!focusables.length) {
      event.preventDefault();
      bodyFallback(ownerDocument).focus();
      return;
    }
    const first = focusables[0];
    const last = focusables.at(-1);
    const active = ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !container.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !container.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  ownerDocument.addEventListener('keydown', handleKeydown);

  const scope = {
    open(preferred = null) {
      if (destroyed) return false;
      if (!open) restoreTarget = ownerDocument.activeElement;
      open = true;
      const requested = preferredElement(preferred);
      const target = canReceiveFocus(requested, container)
        ? requested
        : focusableElements(container)[0];
      (target || bodyFallback(ownerDocument)).focus();
      return true;
    },
    close({ restore = true } = {}) {
      if (destroyed || !open) return false;
      open = false;
      const target = restore && canReceiveFocus(restoreTarget)
        ? restoreTarget
        : restore ? bodyFallback(ownerDocument) : null;
      restoreTarget = null;
      target?.focus();
      return true;
    },
    destroy() {
      if (destroyed) return;
      if (open) scope.close({ restore: false });
      destroyed = true;
      ownerDocument.removeEventListener('keydown', handleKeydown);
      restoreTarget = null;
    }
  };

  return scope;
}
