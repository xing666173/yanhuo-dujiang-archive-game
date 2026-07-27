function normalized(value = {}) {
  const x = Number.isFinite(Number(value.x)) ? Number(value.x) : 0;
  const y = Number.isFinite(Number(value.y)) ? Number(value.y) : 0;
  const magnitude = Math.hypot(x, y);
  const divisor = Math.max(1, magnitude);
  return { x: x / divisor, y: y / divisor };
}

export function createMovementInput({ onChange = () => {} } = {}) {
  const sources = new Map();
  let current = { x: 0, y: 0 };

  function emit() {
    const next = normalized([...sources.values()].reduce(
      (sum, value) => ({ x: sum.x + value.x, y: sum.y + value.y }),
      { x: 0, y: 0 }
    ));
    if (next.x === current.x && next.y === current.y) return;
    current = next;
    onChange({ ...current });
  }

  return {
    setSource(name, value) {
      sources.set(name, normalized(value));
      emit();
    },
    clearSource(name) {
      sources.delete(name);
      emit();
    },
    clearAll() {
      sources.clear();
      emit();
    },
    getValue() {
      return { ...current };
    }
  };
}
