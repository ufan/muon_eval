// Picking small markers by their distance on screen (CSS pixels): the id of the nearest visible point within
// `radiusPx` of the pointer, or null. Points behind the camera or off screen come in as not visible.
export function nearestScreenPoint(points, [x, y], radiusPx) {
  let best = null, bestDistance = radiusPx;
  for (const point of points) {
    if (!point.visible) continue;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance <= bestDistance) { best = point.id; bestDistance = distance; }
  }
  return best;
}
