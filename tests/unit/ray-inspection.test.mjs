import test from 'node:test';
import assert from 'node:assert/strict';
import { raySurfaceCrossings } from '../../dist/modules/ray-inspection.js';
const segment = (t0,t1,material) => ({t0,t1,material});

test('surface markers follow actual material transitions, including cavities and interfaces', () => {
  assert.deepEqual(raySurfaceCrossings({segments:[segment(0,2,'air'),segment(2,5,'concrete'),segment(5,7,'air'),segment(7,9,'concrete'),segment(9,12,'rock'),segment(12,15,'air')]}),[
    {distanceM:2,kind:'entry',fromMaterial:'air',toMaterial:'concrete'},
    {distanceM:5,kind:'exit',fromMaterial:'concrete',toMaterial:'air'},
    {distanceM:7,kind:'entry',fromMaterial:'air',toMaterial:'concrete'},
    {distanceM:9,kind:'interface',fromMaterial:'concrete',toMaterial:'rock'},
    {distanceM:12,kind:'exit',fromMaterial:'rock',toMaterial:'air'}
  ]);
});

test('origin, trace cutoff, and subdivisions within one material are not surface crossings', () => {
  assert.deepEqual(raySurfaceCrossings({segments:[segment(0,2,'water'),segment(2,4,'water'),segment(4,6,'concrete')]}),[
    {distanceM:4,kind:'interface',fromMaterial:'water',toMaterial:'concrete'}
  ]);
  assert.deepEqual(raySurfaceCrossings({segments:[]}),[]);
  assert.deepEqual(raySurfaceCrossings({segments:[segment(0,10,'air')]}),[]);
});

test('missing intervals do not imply a known surface', () => {
  assert.deepEqual(raySurfaceCrossings({segments:[segment(0,2,'air'),segment(3,5,'steel')]}),[]);
});
