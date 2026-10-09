// @ts-check
// View-only SVG paths; numerical extraction and graph mapping remain separate.
export function contributionPathData(lines) {
  return lines.map(line => line.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ')).join(' ');
}

export function drawContributionPaths(svg, layers, bins) {
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren(); svg.setAttribute('viewBox', `0 0 ${bins} ${bins}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  for (const { material, color, overlay, mapped, pathData } of layers) {
    if (!mapped.lines.length) continue;
    const d = pathData ?? contributionPathData(mapped.lines);
    for (const [stroke, width, role] of [['#08121d', 3.5, 'halo'], [color, 1.5, 'contour']]) {
      const path = document.createElementNS(ns, 'path');
      for (const [key, value] of Object.entries({ d, fill: 'none', stroke, 'stroke-width': width,
        'vector-effect': 'non-scaling-stroke', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' })) path.setAttribute(key, value);
      path.dataset.material = material; path.dataset.level = overlay.settings.level;
      path.dataset.state = overlay.state; path.dataset.role = role;
      svg.append(path);
    }
  }
}
