import test from 'node:test';
import assert from 'node:assert/strict';
import { projectStructuralSegment } from '../../dist/modules/structural-reference-projection.js';
import { detectorBasis } from '../../dist/modules/material-projection.js';
const config = { origin: [0,0,0], azimuthDeg: 0, elevationDeg: 0,
  slopeBounds: { sx: [-1,1], sy: [-1,1] }, rayLengthM: 100, nearDepthM: 1e-6 };
const close = (a,b,tolerance=1e-12) => assert.ok(Math.abs(a-b) <= tolerance, `${a} != ${b}`);

test('perspective depth scaling and translated/rotated views preserve slope conventions', () => {
  const result = projectStructuralSegment([[2,1,.5],[6,1,.5]], config);
  assert.equal(result.state, 'ready');
  assert.deepEqual(result.segmentSlope, [[.5,.25],[1/6,1/12]]);
  assert.deepEqual(result.parameterInterval, [0,1]);
  const view = { ...config, origin: [10,20,30], azimuthDeg: 37, elevationDeg: 23 };
  const basis = detectorBasis(view.azimuthDeg, view.elevationDeg);
  const points = [2,6].map(depth => view.origin.map((x,i) => x + depth*basis.forward[i] + basis.right[i] + .5*basis.up[i]));
  const rotated = projectStructuralSegment(points, view);
  rotated.segmentSlope.forEach((p,i) => p.forEach((x,j) => close(x, result.segmentSlope[i][j])));
});

test('observer-plane crossings clip whole 3D lines before division', () => {
  const result = projectStructuralSegment([[-2,1,0],[2,1,0]], config);
  assert.equal(result.state, 'clipped');
  assert.deepEqual(result.parameterInterval, [.75,1]);
  assert.deepEqual(result.segmentSlope, [[1,0],[.5,0]]);
  const near = projectStructuralSegment([[-1,0,0],[1,.1,0]], { ...config, nearDepthM: .2, slopeBounds: { sx: [-10,10], sy: [-10,10] } });
  assert.equal(near.state, 'clipped'); close(near.parameterInterval[0], .6);
  assert.ok(near.segmentSlope.flat().every(Number.isFinite));
  assert.equal(projectStructuralSegment([[-2,1,0],[-1,2,0]], config).state, 'outside-field');
});

test('field crossings retain segments with both endpoints outside without generating frame edges', () => {
  const source = [[2,-4,0],[2,4,0]], copy = structuredClone(source);
  const result = projectStructuralSegment(source, config);
  assert.equal(result.state, 'clipped');
  assert.deepEqual(result.parameterInterval, [.25,.75]);
  assert.deepEqual(result.segmentModel, [[2,-2,0],[2,2,0]]);
  assert.deepEqual(result.segmentSlope, [[-1,0],[1,0]]);
  assert.deepEqual(source, copy);
  const narrow = projectStructuralSegment(source, { ...config, slopeBounds: { sx: [-.3,.4], sy: [-.2,.2] } });
  narrow.segmentSlope.forEach((p,i) => close(p[0], [-.3,.4][i]));
  assert.equal(projectStructuralSegment([[2,-4,4],[2,4,4]], config).state, 'outside-field');
  // Touching a single corner produces no physical line.
  assert.equal(projectStructuralSegment([[2,0,4],[2,4,0]], config).state, 'outside-field');
});

test('radial range uses the whole segment sphere intersection, not endpoint tests or far depth', () => {
  const view = { ...config, rayLengthM: 5, slopeBounds: { sx: [-10,10], sy: [-10,10] } };
  const result = projectStructuralSegment([[3,-10,0],[3,10,0]], view);
  assert.equal(result.state, 'clipped');
  close(result.parameterInterval[0], .3); close(result.parameterInterval[1], .7);
  result.endpointRangeM.forEach(x => close(x,5));
  result.segmentSlope.forEach((p,i) => close(p[0], [-4/3,4/3][i]));
  assert.equal(projectStructuralSegment([[5,-1,0],[5,1,0]], view).state, 'outside-field');
  assert.equal(projectStructuralSegment([[3,6,0],[4,6,0]], view).state, 'outside-field');
  const reversed = projectStructuralSegment([[3,10,0],[3,-10,0]], view);
  reversed.segmentSlope.forEach((p,i) => close(p[0], result.segmentSlope[1-i][0]));
});

test('each surviving segment stays on its source line and satisfies its explicit scope', () => {
  // Deterministic broad moderate-scale cases, including combined constraints.
  let seed=917;
  const random=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/2**32; };
  for(let i=0;i<1000;i++) {
    const source=Array.from({length:2},()=>Array.from({length:3},()=>random()*20-10));
    const result=projectStructuralSegment(source,{...config,rayLengthM:7});
    if (!result.segmentModel) continue;
    result.parameterInterval.forEach((t,j)=>{
      result.segmentModel[j].forEach((x,k)=>close(x,source[0][k]+t*(source[1][k]-source[0][k]),1e-10));
      assert.ok(result.endpointRangeM[j]<=7+1e-10);
      assert.ok(result.segmentModel[j][0]>=config.nearDepthM-1e-10);
      assert.ok(result.segmentSlope[j].every(x=>x>=-1-1e-10&&x<=1+1e-10));
    });
  }
});

test('point/radial projections and malformed scopes cannot produce invalid lines', () => {
  assert.equal(projectStructuralSegment([[2,0,0],[3,0,0]], config).reason,'point-projection');
  assert.equal(projectStructuralSegment([[2,0,0],[2,0,0]], config).reason,'zero-length-source');
  for (const change of [{nearDepthM:0},{nearDepthM:undefined},{rayLengthM:Infinity},{slopeBounds:{sx:[1,-1],sy:[-1,1]}},{origin:[NaN,0,0]}]) {
    assert.throws(()=>projectStructuralSegment([[2,0,0],[2,1,0]],{...config,...change}));
  }
});
