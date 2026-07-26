export function createSceneDisposer({
  group,
  markerById,
  animations,
  disposeResources
}) {
  let disposed = false;

  return () => {
    if (disposed) return;
    disposed = true;
    group.traverse((object) => {
      if (object.isLight && typeof object.shadow?.dispose === 'function') {
        object.shadow.dispose();
      }
    });
    group.removeFromParent();
    disposeResources();
    markerById.clear();
    animations.length = 0;
    group.clear();
  };
}
