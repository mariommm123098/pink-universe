import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHand, GestureStabilizer, mirroredPalm } from '../src/gestures.js';

function hand(extended, { hook = false, thumb = 'folded', gap = 0 } = {}) {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  p[0] = { x: 0, y: 0, z: 0 };
  const bases = [[-.045,.075],[0,.09],[.034,.08],[.063,.06]];
  for (let f=0;f<4;f++) {
    const [x,y]=bases[f], m=5+f*4;
    p[m]={x,y,z:0};
    if(extended.includes(f)) {
      p[m+1]={x:x+(f-1)*.003,y:y+.045,z:0};
      p[m+2]={x:x+(f-1)*.005,y:y+.075,z:0};
      p[m+3]={x:x+(f-1)*.007,y:y+.103,z:0};
    } else {
      p[m+1]={x,y:y+.035,z:0};
      p[m+2]={x:x+.005,y:y+.017,z:.008};
      p[m+3]={x:x+.008,y:y-.008,z:.004};
    }
  }
  p[1]={x:-.035,y:.025,z:0};p[2]={x:-.065,y:.047,z:0};
  if(thumb==='out') {p[3]={x:-.1,y:.07,z:0};p[4]={x:-.137,y:.094,z:0};}
  else {p[3]={x:-.04,y:.068,z:0};p[4]={x:-.012,y:.061,z:.003};}
  if(hook){p[3]={x:.0,y:.035,z:.01};p[4]={x:p[20].x-gap,y:p[20].y+.006,z:.004};}
  const landmarks=p.map(v=>({x:.48+v.x*2.5,y:.8-v.y*2.5,z:v.z*2.5}));
  return { landmarks, world:p };
}
function classify(h){return classifyHand(h.landmarks,h.world);}
// Synthetic landmark regressions, not camera recordings. x/y describe the visible
// contour; independently perturbed world z models depth ambiguity at an occlusion.
function palmFacingThree({ face = 1, rotation = 0, mirror = 1, tilt = 0, noise = 0, edgeOn = false, tightPinky = false, thumbGap = 0 } = {}) {
  const h = hand([0,1,2], { hook: true });
  h.world[1] = { x: -.035, y: .025, z: 0 };
  h.world[2] = { x: -.006, y: .050, z: -.003 * face };
  h.world[3] = { x: .037, y: .0845, z: -.004 * face };
  h.world[4] = { x: .080, y: .119, z: -.005 * face };
  // A naturally curved little finger, not an unnaturally tight fold into the palm.
  h.world[18] = { x: .076, y: .103, z: -.006 * face };
  h.world[19] = { x: .094, y: .135, z: -.017 * face };
  h.world[20] = { x: .074, y: .126, z: -.008 * face };
  if (tightPinky) {
    h.world[18] = { x: .095, y: .120, z: -.006 * face };
    h.world[19] = { x: .110, y: .130, z: -.017 * face };
    h.world[20] = { x: .080, y: .119, z: -.005 * face };
  }
  h.world[4].x -= thumbGap;
  const truth = h.world.map(p => {
    const x = (p.x * Math.cos(tilt) + p.z * Math.sin(tilt)) * mirror * (edgeOn ? .12 : 1);
    const z = -p.x * Math.sin(tilt) + p.z * Math.cos(tilt);
    return { x: x * Math.cos(rotation) - p.y * Math.sin(rotation), y: x * Math.sin(rotation) + p.y * Math.cos(rotation), z };
  });
  h.world = truth.map(p => ({ ...p }));
  h.world[4].z += noise * face;
  h.world[20].z -= noise * .8 * face;
  h.world[14].z += noise * .7;
  h.world[15].z -= noise * .6;
  h.world[16].z += noise;
  h.landmarks = truth.map((p, i) => ({ x: .5 + p.x * 2.5 / (4 / 3), y: .65 - p.y * 2.5, z: h.world[i].z * 2.5 }));
  return h;
}
test('real geometric combinations distinguish 1, V, open palm, fist',()=>{
  for(const [f,opts,expected]of [[[0],{},'one'],[[0,1],{},'two'],[[0,1,2,3],{thumb:'out'},'open'],[[],{},'fist']]) {
    const result=classify(hand(f,opts));assert.equal(result.gesture,expected,JSON.stringify(result));assert.ok(result.confidence>=.68);
  }
});
test('specified 3 requires index, middle, ring and tolerates imperfect thumb/little contact',()=>{
  for(const gap of [0,.015,.035,.055])assert.equal(classify(hand([0,1,2],{hook:true,gap})).gesture,'three');
  assert.equal(classify(hand([0,1],{thumb:'out'})).gesture,'unknown','thumb + index + middle must not be called 3 or 2');
  assert.equal(classify(hand([0,1,2],{thumb:'out'})).gesture,'unknown','three extended with an unhooked thumb must not be called 3');
});
test('classification is independent of hand rotation, left/right mirroring and scale',()=>{
  for(const rotation of [-1.1,-.5,0,.6,1.5])for(const mirror of [-1,1])for(const size of [.7,1,1.4]){
    const h=hand([0,1,2],{hook:true,gap:.025});
    h.world=h.world.map(p=>({x:(p.x*Math.cos(rotation)-p.y*Math.sin(rotation))*mirror*size,y:(p.x*Math.sin(rotation)+p.y*Math.cos(rotation))*size,z:p.z*size}));
    assert.equal(classify(h).gesture,'three');
  }
});
test('a palm-facing CMC/MCP thumb hook and naturally curved little finger count as the specified 3',()=>{
  const result = classify(palmFacingThree());
  assert.ok(result.thumbRadius > .94, 'this hook reaches the outer palm, beyond the old radius limit');
  assert.ok(result.fingers.pinky > .48, 'the little finger is curved rather than completely folded');
  assert.equal(result.gesture, 'three', JSON.stringify(result));
  assert.equal(result.threeEvidence, 'projection');
  assert.ok(result.confidence >= .68);
});
test('a CMC hook with a straight distal thumb is valid even when its tip reaches the outer palm',()=>{
  const h = palmFacingThree({ tightPinky: true }), result = classify(h);
  const u = ['x','y','z'].map(axis => h.world[2][axis] - h.world[3][axis]);
  const v = ['x','y','z'].map(axis => h.world[4][axis] - h.world[3][axis]);
  const angle = Math.acos(Math.max(-1, Math.min(1, u.reduce((sum, value, i) => sum + value * v[i], 0) / (Math.hypot(...u) * Math.hypot(...v))))) * 180 / Math.PI;
  assert.ok(angle > 168 && result.thumbRadius > .94, 'both old thumb-hook alternatives reject this CMC hook');
  assert.ok(result.fingers.pinky < .48 && result.fingers.ring > .66 && result.thumbPinkyGap < .82, 'all other original 3 requirements are satisfied');
  assert.equal(result.gesture, 'three', JSON.stringify(result));
  assert.equal(result.threeEvidence, 'projection');
  assert.ok(result.confidence >= .68);
});
test('the same physical hook survives only-world depth noise and mild imperfect fingertip contact',()=>{
  const h = hand([0,1,2], { hook: true, gap: .015 });
  assert.equal(classify(h).threeEvidence, 'world', 'the unchanged physical pose originally satisfies 3D evidence');
  h.world = h.world.map(p => ({ ...p }));
  h.world[4].z += .10; h.world[20].z -= .08;
  h.world[14].z += .07; h.world[15].z -= .06; h.world[16].z += .10;
  const noisy = classify(h);
  assert.ok(noisy.thumbPinkyGap > .82 && noisy.fingers.ring < .66, 'original world-only classification would reject this same visible pose');
  assert.equal(noisy.gesture, 'three', JSON.stringify(noisy));
  assert.equal(noisy.threeEvidence, 'projection');
  assert.ok(noisy.confidence >= .68);
  for (const thumbGap of [0, .025, .045]) {
    const mildContact = classify(palmFacingThree({ noise: .065, thumbGap }));
    assert.equal(mildContact.gesture, 'three', JSON.stringify({ thumbGap, mildContact }));
    assert.ok(mildContact.confidence >= .68, 'intended imperfect contacts must pass the stabilizer confidence gate');
  }
});
test('front/back depth ambiguity at touching tips and an extended ring finger uses reliable image evidence',()=>{
  for (const face of [-1, 1]) for (const noise of [.035, .065, .095]) for (const mirror of [-1, 1]) for (const rotation of [-.85, 0, .9]) for (const tilt of [-.3, .25]) {
    const result = classify(palmFacingThree({ face, noise, mirror, rotation, tilt }));
    assert.equal(result.gesture, 'three', JSON.stringify({ face, noise, mirror, rotation, tilt, result }));
    assert.equal(result.threeEvidence, 'projection');
    assert.ok(result.confidence >= .68);
  }
  const corrupted = classify(palmFacingThree({ noise: .095 }));
  assert.ok(corrupted.thumbPinkyGap > .82, 'world depth incorrectly separates the touching tips');
  assert.ok(corrupted.fingers.ring < .66, 'world depth distorts the visible extended ring finger');
});
test('projected 3 still rejects a straight little finger, an outward thumb and non-contact folds',()=>{
  const open = hand([0,1,2,3], { thumb: 'out' });
  assert.notEqual(classify(open).gesture, 'three');
  const straightPinky = palmFacingThree({ noise: .065 });
  const openPinky = hand([0,1,2,3]);
  for (const i of [18,19,20]) {
    straightPinky.world[i] = openPinky.world[i];
    const p = openPinky.world[i];
    straightPinky.landmarks[i] = { x: .5 + p.x * 2.5 / (4 / 3), y: .65 - p.y * 2.5, z: p.z * 2.5 };
  }
  assert.notEqual(classify(straightPinky).gesture, 'three', 'four extended fingers cannot be 3');
  for (const h of [hand([0,1], { thumb: 'out' }), hand([0,1,2], { thumb: 'out' }), hand([0,1,2])]) {
    h.world[4].z += .08;
    assert.notEqual(classify(h).gesture, 'three', JSON.stringify(classify(h)));
  }
});
test('a nearly edge-on palm cannot use the depth-discarding projected fallback',()=>{
  const result = classify(palmFacingThree({ noise: .095, edgeOn: true }));
  assert.notEqual(result.threeEvidence, 'projection');
  assert.equal(result.gesture, 'unknown');
});
test('missing, malformed and small hands remain unknown',()=>{
  assert.equal(classifyHand(null).gesture,'unknown');assert.equal(classifyHand([]).gesture,'unknown');
  const h=hand([0]);h.landmarks[8].x=NaN;assert.equal(classify(h).gesture,'unknown');
  h.landmarks[8]=null;assert.equal(classify(h).gesture,'unknown');
  assert.equal(classifyHand(Array.from({length:21},()=>({x:.5,y:.5,z:0}))).gesture,'unknown');
  const fallback = hand([0]);fallback.world[8]=null;
  assert.equal(classify(fallback).gesture,'one','malformed world coordinates fall back to valid image landmarks');
  const projected = palmFacingThree({noise:.095});
  for(const aspect of [NaN,Infinity,0,-1])assert.equal(classifyHand(projected.landmarks,projected.world,aspect).gesture,'three');
});
test('short jitter and low confidence do not confirm, valid evidence confirms quickly',()=>{
  const s=new GestureStabilizer();
  assert.equal(s.update({gesture:'one',confidence:.95},0).changed,false);
  assert.equal(s.update({gesture:'two',confidence:.95},40).changed,false);
  assert.equal(s.update({gesture:'one',confidence:.95},70).changed,false);
  assert.equal(s.update({gesture:'one',confidence:.2},90).changed,false);
  for(const now of [120,180])assert.equal(s.update({gesture:'three',confidence:.92},now).changed,false);
  assert.equal(s.update({gesture:'three',confidence:.92},240).changed,true);
  assert.equal(s.update({gesture:'three',confidence:.92},280).changed,false);
  assert.equal(s.update(null,300).changed,false);
});
test('digits/open confirm in 110–120 ms with at least three samples; fists require 170 ms and four',()=>{
  for (const [gesture, duration] of [['one',120],['two',120],['three',120],['open',110]]) {
    const s = new GestureStabilizer();
    assert.equal(s.update({ gesture, confidence: .9 }, 0).changed, false);
    assert.equal(s.update({ gesture, confidence: .9 }, duration - 1).changed, false);
    assert.equal(s.update({ gesture, confidence: .9 }, duration).changed, true);
  }
  const s = new GestureStabilizer();
  for (const now of [0, 85, 169]) assert.equal(s.update({gesture:'fist',confidence:.95},now).changed,false);
  assert.equal(s.update({gesture:'fist',confidence:.95},170).changed,true);
  const sparse = new GestureStabilizer();
  sparse.update({gesture:'fist',confidence:.95},0);
  sparse.update({gesture:'fist',confidence:.95},90);
  assert.equal(sparse.update({gesture:'fist',confidence:.95},180).changed,false,'three samples cannot confirm a fist');
  assert.equal(sparse.update({gesture:'fist',confidence:.95},220).changed,true);
});
test('long missing interval requires fresh confirmation, no spontaneous fist',()=>{
  const s=new GestureStabilizer();s.update({gesture:'fist',confidence:.95},0);s.update({gesture:'fist',confidence:.95},60);
  s.update(null,1000);assert.equal(s.update({gesture:'fist',confidence:.95},1100).changed,false);
  for(const now of [1150,1200])assert.equal(s.update({gesture:'fist',confidence:.95},now).changed,false);
  assert.equal(s.update({gesture:'fist',confidence:.95},1270).changed,true);
  const digit = new GestureStabilizer();
  digit.update({gesture:'one',confidence:.95},0); digit.update({gesture:'one',confidence:.95},60);
  assert.equal(digit.update({gesture:'one',confidence:.95},400).changed,false,'a sampling gap resets prior evidence');
  assert.equal(digit.update({gesture:'one',confidence:.95},460).changed,false);
  assert.equal(digit.update({gesture:'one',confidence:.95},520).changed,true);
});
test('camera horizontal coordinates are mirrored once, vertical motion is intuitive',()=>{
  const pts=Array.from({length:21},()=>({x:.25,y:.25,z:0}));
  assert.deepEqual(mirroredPalm(pts),{x:.5,y:.5});
});
