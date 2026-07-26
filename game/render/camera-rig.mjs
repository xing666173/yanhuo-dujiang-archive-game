const CAMERA_PITCH = Math.PI / 10;

export function calculateThirdPersonCamera({
  player,
  targetHeight,
  distance,
  yaw,
  shoulder
}) {
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const target = [
    player[0] + rightX * shoulder,
    player[1] + targetHeight,
    player[2] + rightZ * shoulder
  ];
  const horizontalDistance = Math.cos(CAMERA_PITCH) * distance;
  const position = [
    target[0] + Math.sin(yaw) * horizontalDistance,
    target[1] + Math.sin(CAMERA_PITCH) * distance,
    target[2] + Math.cos(yaw) * horizontalDistance
  ];
  return { position, target };
}
