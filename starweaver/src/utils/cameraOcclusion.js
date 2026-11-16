// First intersection of a sightline and a finite vertical cylinder. Height and
// horizontal intervals must overlap: testing only the horizontal entry height
// misses a camera that enters foliage from below or ends inside a crown.
export function cameraCylinderEntry(lx, ly, lz, dx, dy, dz, cx, cz, radius,
  bottomY = -Infinity, topY = Infinity, margin = 0) {
  const r = radius + margin;
  if (Math.max(lx, dx) < cx - r || Math.min(lx, dx) > cx + r ||
    Math.max(lz, dz) < cz - r || Math.min(lz, dz) > cz + r) return Infinity;
  const vx = dx - lx, vy = dy - ly, vz = dz - lz;
  const ox = lx - cx, oz = lz - cz;
  const a = vx * vx + vz * vz;
  let enter = 0, exit = 1;
  if (a < 1e-10) {
    if (ox * ox + oz * oz > r * r) return Infinity;
  } else {
    const b = 2 * (ox * vx + oz * vz);
    const discriminant = b * b - 4 * a * (ox * ox + oz * oz - r * r);
    if (discriminant <= 0) return Infinity;
    const root = Math.sqrt(discriminant);
    enter = Math.max(0, (-b - root) / (2 * a));
    exit = Math.min(1, (-b + root) / (2 * a));
  }
  if (Math.abs(vy) < 1e-10) {
    if (ly < bottomY || ly > topY) return Infinity;
  } else {
    const aY = (bottomY - ly) / vy, bY = (topY - ly) / vy;
    enter = Math.max(enter, Math.min(aY, bY));
    exit = Math.min(exit, Math.max(aY, bY));
  }
  return enter <= exit && exit > 0.0001 && enter < 1 ? enter : Infinity;
}
