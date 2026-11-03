import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectHand, HandOverlay } from '../src/hand-overlay.js';

const hand = (x, y) => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
test('skeleton matches the 4:3 preview mirror exactly once', () => {
  assert.deepEqual(projectHand(hand(.25, .75), 640, 480, 144, 108)[8], { x: 108, y: 81 });
  assert.deepEqual(projectHand(hand(.75, .25), 640, 480, 112, 84)[20], { x: 28, y: 21 });
});
test('wide and portrait camera frames use the same centered cover crop as the video', () => {
  assert.deepEqual(projectHand(hand(.25, .5), 1280, 720, 144, 108)[0], { x: 120, y: 54 });
  assert.deepEqual(projectHand(hand(.5, .25), 480, 640, 144, 108)[0], { x: 72, y: 6 });
  assert.deepEqual(projectHand(hand(.5, .5), 1920, 1080, 144, 108)[0], { x: 72, y: 54 });
});
test('missing or malformed tracking data cannot draw a stale skeleton', () => {
  for (const points of [null, [], hand(NaN, .5), [...hand(.5, .5).slice(0, 20), null]]) {
    assert.equal(projectHand(points, 640, 480, 144, 108), null);
  }
  assert.equal(projectHand(hand(.5, .5), 0, 0, 144, 108), null);
  assert.equal(projectHand(hand(.5, .5), 640, 480, 0, 0), null);
  const cleared = [];
  const overlay = Object.create(HandOverlay.prototype);
  overlay.canvas = { width: 288, height: 216, dataset: { tracked: 'true' } };
  overlay.context = { clearRect: (...args) => cleared.push(args) };
  overlay.landmarks = hand(.5, .5);
  overlay.clear();
  assert.equal(overlay.landmarks, null);
  assert.equal(overlay.canvas.dataset.tracked, 'false');
  assert.deepEqual(cleared, [[0, 0, 288, 216]]);
});
