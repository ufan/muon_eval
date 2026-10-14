import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, demoFootnote, snapshotLayout, demoFileName, cycleView } from '../../dist/modules/demo-snapshot.js';

// Demonstration mode (#17, FR-M5): a clean view for customers whose screenshots always carry the identity and
// the limitations of the numbers. Pure layout; the page draws the operations on a canvas.
test('text wraps by display width: a CJK character is one unit, other characters about half', () => {
  assert.deepEqual(wrapText('近似评估结果', 4), ['近似评估', '结果']);
  assert.deepEqual(wrapText('abcd efgh', 3), ['abcd', 'efgh']);
  assert.deepEqual(wrapText('', 5), []);
});

test('the footnote names the release, scenario, exposure and detector and says what the numbers are not', () => {
  const lines = demoFootnote({ release: 'dam@1.0', scenario: 'low', exposureDays: 30, detector: 'JW-S400', date: new Date(2026, 9, 14) });
  const text = lines.join(' ');
  for (const part of ['dam@1.0', 'low', '30 天', 'JW-S400', '2026-10-14', '快速评估', '非施工或安全结论']) assert.ok(text.includes(part), part);
});

test('the layout keeps every element inside the image: caption top left, footnote at the bottom, labels clamped', () => {
  const width = 800, height = 500;
  const ops = snapshotLayout({ width, height, caption: { title: '大坝 · 部署组合 1', subtitle: '4 个点位' }, legend: [{ color: '#ff4fb3', text: '工作点位' }, { text: '覆盖：综合等级' }],
    footnote: ['近似评估，非施工结论', 'dam@1.0 · low'], labels: [{ text: '上层廊道 B', color: '#4fc3f7', x: 795, y: 3 }, { text: 'C', color: '#ffd54f', x: 100, y: 200 }] });
  const texts = ops.filter(op => op.type === 'text');
  for (const op of ops) {
    const x = op.x, y = op.y;
    assert.ok(x >= 0 && x <= width && y >= 0 && y <= height, JSON.stringify(op));
    if (op.type === 'rect') assert.ok(x + op.w <= width && y + op.h <= height, JSON.stringify(op));
  }
  const title = texts.find(op => op.text.startsWith('大坝'));
  assert.ok(title.x < 40 && title.y < 60);
  const foot = texts.filter(op => op.text.startsWith('近似') || op.text.startsWith('dam@'));
  assert.equal(foot.length, 2); assert.ok(foot.every(op => op.y > height - 60));
  const label = texts.find(op => op.text === '上层廊道 B');
  assert.ok(label.x < 795 && label.y >= label.size, JSON.stringify(label));
  // Its background box stays inside too (checked above for every rect).
  assert.ok(ops.some(op => op.type === 'rect' && op.x <= label.x && op.x + op.w >= label.x));
  assert.ok(ops.some(op => op.type === 'dot' && op.fill === '#ff4fb3'));
});

test('file names and guided views', () => {
  assert.equal(demoFileName('dam@1.0+schema0.7', new Date(2026, 9, 14, 8, 5)), 'muography-demo-dam_1.0_schema0.7-20261014-0805.png');
  const views = ['perspective', 'front', 'saved-1'];
  assert.equal(cycleView(views, 'front', 1), 'saved-1'); assert.equal(cycleView(views, 'saved-1', 1), 'perspective');
  assert.equal(cycleView(views, 'perspective', -1), 'saved-1'); assert.equal(cycleView(views, 'unknown', 1), 'perspective');
});

// Short animations (#17 follow-up, FR-M5): camera paths in the model frame (z up), drawn frame by frame.
import { interpolateView, tourFrames, orbitFrames } from '../../dist/modules/demo-snapshot.js';
const close = (a, b, e = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < e);
const dist = v => Math.hypot(...v.position.map((p, i) => p - v.target[i]));

test('a move between two views turns around the target and changes distance smoothly', () => {
  const a = { position: [100, 0, 0], target: [0, 0, 0] }, b = { position: [0, 50, 10], target: [0, 0, 10] };
  assert.ok(close(interpolateView(a, b, 0).position, a.position) && close(interpolateView(a, b, 1).position, b.position));
  const mid = interpolateView(a, b, .5);
  assert.ok(close(mid.target, [0, 0, 5]));
  // Eased: half way in time is half way in the move; the offset turns (not a straight cut through the target).
  const offset = mid.position.map((v, i) => v - mid.target[i]);
  assert.ok(Math.abs(Math.atan2(offset[1], offset[0]) - Math.PI / 4) < 1e-6, String(offset));
  assert.ok(dist(mid) > 50 && dist(mid) < 100);
  // Opposite directions still turn (about the vertical), never through the target.
  const c = { position: [-100, 0, 0], target: [0, 0, 0] }, half = interpolateView(a, c, .5);
  assert.ok(Math.abs(dist(half) - 100) < 1e-6);
});

test('a tour holds each view and moves between them; an orbit closes on itself at constant height and distance', () => {
  const views = [{ position: [100, 0, 0], target: [0, 0, 0] }, { position: [0, 100, 20], target: [0, 0, 0] }, { position: [0, 0, 100], target: [0, 0, 0] }];
  const frames = tourFrames(views, { fps: 10, moveSeconds: 2, holdSeconds: 1 });
  assert.equal(frames.length, 10 * (3 * 1 + 2 * 2));
  assert.ok(close(frames[0].position, views[0].position) && close(frames[9].position, views[0].position));
  assert.ok(close(frames.at(-1).position, views[2].position));
  const orbit = orbitFrames(views[1], { fps: 10, seconds: 4 });
  assert.equal(orbit.length, 40);
  assert.ok(orbit.every(v => Math.abs(v.position[2] - 20) < 1e-9 && Math.abs(dist(v) - dist(views[1])) < 1e-9));
  assert.ok(close(orbit[10].position, [-100, 0, 20], 1e-6), String(orbit[10].position));
  assert.equal(demoFileName('d', new Date(2026, 9, 14, 8, 5), 'webm'), 'muography-demo-d-20261014-0805.webm');
});
