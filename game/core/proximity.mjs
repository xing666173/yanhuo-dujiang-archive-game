export function getNearestHotspot(position, hotspots, radius = 1.5) {
  let nearest = null;
  let nearestDistance = Infinity;

  for (const hotspot of hotspots) {
    const dx = hotspot.position[0] - position[0];
    const dz = hotspot.position[2] - position[2];
    const distance = Math.hypot(dx, dz);
    const interactionRadius = Number.isFinite(hotspot.radius) ? hotspot.radius : radius;
    if (distance <= interactionRadius && distance < nearestDistance) {
      nearest = hotspot;
      nearestDistance = distance;
    }
  }

  return nearest;
}
