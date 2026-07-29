const CAMERA_PITCH = Math.PI / 10;

export function calculateThirdPersonCamera({
  player,
  targetHeight,
  distance,
  yaw,
  shoulder,
  aspect = 1
}) {
  const portrait = Number.isFinite(aspect) && aspect > 0 && aspect < 0.75;
  const framedDistance = portrait ? distance * 1.16 : distance;
  const framedTargetHeight = portrait ? targetHeight + 0.12 : targetHeight;
  const framedShoulder = portrait ? 0 : shoulder;
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  const target = [
    player[0] + rightX * framedShoulder,
    player[1] + framedTargetHeight,
    player[2] + rightZ * framedShoulder
  ];
  const horizontalDistance = Math.cos(CAMERA_PITCH) * framedDistance;
  const position = [
    target[0] + Math.sin(yaw) * horizontalDistance,
    target[1] + Math.sin(CAMERA_PITCH) * framedDistance,
    target[2] + Math.cos(yaw) * horizontalDistance
  ];
  return { position, target };
}
