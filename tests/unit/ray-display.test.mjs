import test from 'node:test';
import assert from 'node:assert/strict';
import { RAY_MATERIALS, displayedRaySegments, rayExitStub, rayProfile, rayMarkers, sideViewPose } from '../../dist/modules/ray-display.js';
const segment = (t0,t1,material) => ({t0,t1,material});
const css = material => '#'+RAY_MATERIALS[material].color.toString(16).padStart(6,'0');
const close = (actual, expected, label) => actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-9,`${label}[${i}] ${v} != ${expected[i]}`));

test('drawn segments keep air inside the path and drop air after the last material interval', () => {
  const trace={segments:[segment(0,2,'air'),segment(2,5,'concrete'),segment(5,7,'air'),segment(7,9,'rock'),segment(9,500,'air')]};
  assert.deepEqual(displayedRaySegments(trace).map(s=>s.material),['air','concrete','air','rock']);
  assert.deepEqual(displayedRaySegments({segments:[segment(0,900,'air')]}),[]);
  assert.deepEqual(displayedRaySegments({segments:[]}),[]);
});

test('a short stub of open air follows the exit, capped at a quarter of the drawn length', () => {
  assert.deepEqual(rayExitStub({segments:[segment(0,2,'air'),segment(2,10,'concrete'),segment(10,500,'air')]}),{t0:10,t1:12.5});
  assert.deepEqual(rayExitStub({segments:[segment(0,10,'concrete'),segment(10,11,'air')]}),{t0:10,t1:11});
  assert.equal(rayExitStub({segments:[segment(0,10,'concrete')]}),null);
  assert.equal(rayExitStub({segments:[segment(0,10,'concrete'),segment(11,20,'air')]}),null,'no stub across a gap');
  assert.equal(rayExitStub({segments:[segment(0,50,'air')]}),null);
});

test('profile merges subdivisions of one material, keeps gaps, and uses the ray colors', () => {
  const profile=rayProfile({segments:[segment(0,2,'air'),segment(2,4,'concrete'),segment(4,6,'concrete'),segment(6,8,'water'),segment(9,10,'rock'),segment(10,80,'air')]});
  assert.equal(profile.lengthM,10);
  assert.deepEqual(profile.parts,[
    {material:'air',label:RAY_MATERIALS.air.label,color:css('air'),fromM:0,toM:2},
    {material:'concrete',label:RAY_MATERIALS.concrete.label,color:css('concrete'),fromM:2,toM:6},
    {material:'water',label:RAY_MATERIALS.water.label,color:css('water'),fromM:6,toM:8},
    {material:'rock',label:RAY_MATERIALS.rock.label,color:css('rock'),fromM:9,toM:10}
  ]);
  assert.deepEqual(rayProfile({segments:[segment(0,50,'air')]}),{lengthM:0,parts:[]});
});

test('a material without a defined color falls back to white and is labelled by its id', () => {
  assert.deepEqual(rayProfile({segments:[segment(0,3,'ice')]}).parts,[{material:'ice',label:'ice',color:'#ffffff',fromM:0,toM:3}]);
});

test('markers sit at surface crossings from the trace, labelled by kind and distance', () => {
  const markers=rayMarkers({segments:[segment(0,4.7,'air'),segment(4.7,20,'concrete'),segment(20,37.1,'rock'),segment(37.1,300,'air')]});
  assert.deepEqual(markers,[
    {distanceM:4.7,kind:'entry',label:'入 4.7 m'},
    {distanceM:20,kind:'interface',label:'界 20.0 m'},
    {distanceM:37.1,kind:'exit',label:'出 37.1 m'}
  ]);
  assert.deepEqual(rayMarkers({segments:[segment(0,9,'air')]}),[]);
});

test('side view looks at the middle of the ray from a direction perpendicular to it, far enough to fit it', () => {
  const pose=sideViewPose({origin:[0,0,0],direction:[1,0,0],lengthM:40,eye:[-30,5,10],fovDeg:40,aspect:2});
  close(pose.target,[20,0,0],'target');
  const view=pose.position.map((v,i)=>v-pose.target[i]),distance=Math.hypot(...view);
  assert.ok(Math.abs(view[0])<1e-9,'view direction is perpendicular to the ray');
  assert.ok(distance>=20/Math.tan(20*Math.PI/180),'the whole ray fits the vertical field of view');
  close(view.map(v=>v/distance),[0,5/Math.hypot(5,10),10/Math.hypot(5,10)],'keeps the side the camera was on');
});

test('side view falls back to a perpendicular from the up axis when the camera looks along the ray', () => {
  const pose=sideViewPose({origin:[0,0,0],direction:[1,0,0],lengthM:10,eye:[-5,0,0],fovDeg:40,aspect:1,up:[0,1,0]});
  const view=pose.position.map((v,i)=>v-pose.target[i]);
  assert.ok(Math.abs(view[0])<1e-9);assert.ok(Math.hypot(...view)>0);
});
