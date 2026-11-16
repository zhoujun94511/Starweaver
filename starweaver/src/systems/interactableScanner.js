/**
 * Shared zero-GC spatial proximity scanner for interactable targets across any world.
 */
export function findNearestInteractable(
  candidates,
  rx,
  ry,
  rz,
  maxHorizDist,
  maxVertDiff,
  getY = null
) {
  let best = null;
  let bestDist = maxHorizDist;
  for (let i = 0; i < candidates.length; i++) {
    const target = candidates[i];
    const ty = getY ? getY(target) : target.y;
    if (Math.abs(ry - ty) > maxVertDiff) continue;
    const d = Math.hypot(rx - target.x, rz - target.z);
    if (d < bestDist) {
      bestDist = d;
      best = target;
    }
  }
  return best;
}
