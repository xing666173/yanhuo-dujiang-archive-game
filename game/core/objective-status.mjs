const REED_HOTSPOTS = new Set(['camera-spot', 'notes-spot', 'voice-spot']);

export function describeObjective({ sceneId, completedHotspotIds = [] } = {}) {
  if (sceneId === 'activity-room') return '前往路线板，确认出发计划';
  if (sceneId !== 'reeds-wetland') return '';

  const completedCount = new Set(
    completedHotspotIds.filter((id) => REED_HOTSPOTS.has(id))
  ).size;
  if (completedCount === 0) return '沿栈道完成三项现场记录';
  if (completedCount >= REED_HOTSPOTS.size) return '三项记录完成，整理今日回响';
  return `现场记录 ${completedCount} / ${REED_HOTSPOTS.size}`;
}
