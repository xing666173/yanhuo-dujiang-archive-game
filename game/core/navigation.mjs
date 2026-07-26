export function resolveWalkablePosition(previous, proposed, walkableAreas) {
  const [x, , z] = proposed;
  const isWalkable = walkableAreas.some((area) => (
    x >= area.minX
    && x <= area.maxX
    && z >= area.minZ
    && z <= area.maxZ
  ));

  return isWalkable ? [...proposed] : [...previous];
}
