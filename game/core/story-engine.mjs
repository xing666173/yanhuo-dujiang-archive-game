export function createInitialStoryState() {
  return {
    version: 1,
    activeScriptId: null,
    activeNodeId: null,
    stats: { truth: 0, empathy: 0, expression: 0 },
    cooperation: 0,
    readNodes: [],
    choices: {},
    completedScripts: []
  };
}

function assertRestorableStoryState(scripts, state) {
  const choiceNodes = new Map();
  for (const script of Object.values(scripts)) {
    for (const node of Object.values(script.nodes)) {
      if (node.type === 'choice') choiceNodes.set(node.id, node);
    }
  }

  for (const [choiceId, optionId] of Object.entries(state.choices || {})) {
    const choiceNode = choiceNodes.get(choiceId);
    if (!choiceNode) throw new Error(`Unknown restored choice: ${choiceId}`);
    if (!choiceNode.options.some((option) => option.id === optionId)) {
      throw new Error(`Unknown selected option for ${choiceId}: ${optionId}`);
    }
  }

  for (const scriptId of state.completedScripts || []) {
    if (!scripts[scriptId]) throw new Error(`Unknown completed script: ${scriptId}`);
  }

  const activeIdsAreNull = state?.activeScriptId === null && state?.activeNodeId === null;
  if (activeIdsAreNull) return;

  const activeScript = scripts[state?.activeScriptId];
  if (!activeScript) throw new Error(`Unknown restored script: ${state?.activeScriptId}`);
  const activeNode = activeScript.nodes[state?.activeNodeId];
  if (!activeNode) throw new Error(`Unknown restored node: ${state?.activeNodeId}`);
  if (!state.readNodes?.includes(activeNode.id)) {
    throw new Error(`Active restored node was not read: ${activeNode.id}`);
  }
  if (activeNode.type === 'choice' && Object.hasOwn(state.choices || {}, activeNode.id)) {
    throw new Error(`Active choice is already selected: ${activeNode.id}`);
  }
}

export function storyStateCanRestore({ scripts, state }) {
  try {
    assertRestorableStoryState(scripts, state);
    return true;
  } catch {
    return false;
  }
}

export function createStoryEngine({ scripts, state }) {
  let current = structuredClone(state);

  function applyEffects(effects = {}, direction = 1, clampToZero = false) {
    for (const key of ['truth', 'empathy', 'expression']) {
      const next = current.stats[key] + direction * Number(effects[key] || 0);
      current.stats[key] = clampToZero ? Math.max(0, next) : next;
    }
    const nextCooperation = current.cooperation
      + direction * Number(effects.cooperation || 0);
    current.cooperation = clampToZero
      ? Math.max(0, nextCooperation)
      : nextCooperation;
  }

  function getScript() {
    const script = scripts[current.activeScriptId];
    if (!script) throw new Error(`Unknown script: ${current.activeScriptId}`);
    return script;
  }

  function getNodeById(nodeId) {
    const node = getScript().nodes[nodeId];
    if (!node) throw new Error(`Unknown node: ${nodeId}`);
    return node;
  }

  function getNode() {
    if (!current.activeNodeId) return null;
    return structuredClone(getNodeById(current.activeNodeId));
  }

  function moveTo(nodeId) {
    const script = getScript();
    const node = getNodeById(nodeId);

    current.activeNodeId = nodeId;
    if (!current.readNodes.includes(nodeId)) current.readNodes.push(nodeId);
    if (node.type === 'end' && !current.completedScripts.includes(script.id)) {
      current.completedScripts.push(script.id);
    }
  }

  return {
    start(scriptId) {
      if (!scripts[scriptId]) throw new Error(`Unknown script: ${scriptId}`);
      current.activeScriptId = scriptId;
      moveTo(scripts[scriptId].entry);
      return getNode();
    },
    advance() {
      const node = getNode();
      if (!node || !['line', 'effect'].includes(node.type)) {
        throw new Error('Active node cannot advance');
      }
      moveTo(node.next);
      return getNode();
    },
    choose(optionId) {
      const node = getNode();
      if (!node || node.type !== 'choice') throw new Error('Active node is not a choice');
      if (current.choices[node.id]) throw new Error(`Choice already made: ${node.id}`);

      const option = node.options.find((item) => item.id === optionId);
      if (!option) throw new Error(`Unknown option: ${optionId}`);
      getNodeById(option.next);

      applyEffects(option.effects);
      current.choices[node.id] = option.id;
      moveTo(option.next);
      return getNode();
    },
    restore(state) {
      assertRestorableStoryState(scripts, state);
      current = structuredClone(state);
      return getNode();
    },
    clearScriptCheckpoint(scriptId) {
      const script = scripts[scriptId];
      if (!script) throw new Error(`Unknown script: ${scriptId}`);
      const nodeIds = new Set(Object.keys(script.nodes));
      current.readNodes = current.readNodes.filter((nodeId) => !nodeIds.has(nodeId));
      for (const choiceId of Object.keys(current.choices)) {
        if (!nodeIds.has(choiceId)) continue;
        const choiceNode = script.nodes[choiceId];
        const selectedOption = choiceNode?.options?.find((option) => (
          option.id === current.choices[choiceId]
        ));
        if (selectedOption) applyEffects(selectedOption.effects, -1, true);
        delete current.choices[choiceId];
      }
      current.completedScripts = current.completedScripts.filter((id) => id !== scriptId);
      if (current.activeScriptId === scriptId) {
        current.activeScriptId = null;
        current.activeNodeId = null;
      }
      return structuredClone(current);
    },
    getNode,
    getState: () => structuredClone(current)
  };
}
