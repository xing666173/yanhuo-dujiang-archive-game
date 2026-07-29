import { characterVisuals } from '../data/character-visuals.mjs';
import { createCharacterModel } from './character-model.mjs';
import { createCharacterPresentation } from './character-presentation.mjs';

export const PLAYER_CHARACTER_ID = 'chen-yu';

const playerRecord = Object.freeze({
  characterId: PLAYER_CHARACTER_ID,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [0.9, 1.72, 0.88],
  pose: 'neutral'
});

function disposeInstance(instance) {
  try {
    instance?.dispose?.();
  } catch {}
}

export function createPlayerPresentation({
  modelLibrary = null,
  resources,
  quality,
  reducedMotion = false
}) {
  const appearance = { ...characterVisuals[PLAYER_CHARACTER_ID], prop: null };
  let importedInstance = null;

  try {
    importedInstance = modelLibrary?.createCharacter?.(PLAYER_CHARACTER_ID) ?? null;
    if (importedInstance) {
      const presentation = createCharacterPresentation({
        instance: importedInstance,
        record: playerRecord,
        appearance,
        quality,
        reducedMotion
      });
      return {
        group: presentation.group,
        characterId: PLAYER_CHARACTER_ID,
        modelSource: 'imported',
        update({ elapsed = 0, delta = 0, movementMagnitude = 0 } = {}) {
          presentation.update({
            time: elapsed * 1000,
            delta,
            action: movementMagnitude > 0.02 ? 'Walk' : 'Idle'
          });
        },
        setQuality(nextQuality) {
          presentation.setQuality(nextQuality);
        },
        setReducedMotion(value) {
          presentation.setReducedMotion(value);
        },
        dispose() {
          presentation.dispose();
        }
      };
    }
  } catch {
    disposeInstance(importedInstance);
  }

  const model = createCharacterModel(
    { ...appearance, ...playerRecord },
    { resources, quality }
  );
  model.group.userData.modelSource = 'procedural';
  let disposed = false;
  return {
    group: model.group,
    characterId: PLAYER_CHARACTER_ID,
    modelSource: 'procedural',
    update({ elapsed = 0, movementMagnitude = 0 } = {}) {
      if (!disposed) model.update({ elapsed, movementMagnitude });
    },
    setQuality(nextQuality) {
      if (!disposed) model.setQuality(nextQuality);
    },
    setReducedMotion() {},
    dispose() {
      if (disposed) return;
      disposed = true;
      model.group.removeFromParent();
      model.group.clear();
    }
  };
}
