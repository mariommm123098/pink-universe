import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motionForScene, sampleTransitionBuffer } from '../src/motion.js';

const modes = ['scatter', 'one', 'two', 'three', 'love', 'name', 'surprise'];
const seeds = new Float32Array([0, .2, .8, .25, .7, .1, .6, .4, .55, .999, .95, .35]);
const from = new Float32Array([-3, 1, .5, 2, -2, 1, .8, 2.5, -1, -1, -3, .2]);
const target = new Float32Array([1, 2, 0, -1, -1, 0, 3, .5, 0, -2, 1, 0]);
const next = new Float32Array([-4, -1, 0, 2.5, 3, 0, 1, -2, 0, 4, 2, 0]);

test('interrupting a morph starts the next morph at the exact visible base position', () => {
  for (const mode of modes) for (const elapsed of [0, .04, .16, .43, .8, 1.22, 2.1]) {
    const snapshot = sampleTransitionBuffer(from, target, seeds, elapsed, motionForScene(mode));
    for (const nextMode of modes) {
      const restarted = sampleTransitionBuffer(snapshot, next, seeds, 0, motionForScene(nextMode));
      assert.deepEqual(restarted, snapshot, `${mode} → ${nextMode} at ${elapsed}s must not jump`);
      const firstStep = sampleTransitionBuffer(snapshot, next, seeds, .00001, motionForScene(nextMode));
      firstStep.forEach((value, i) => assert.ok(Math.abs(value - snapshot[i]) < .002, 'the first movement must be continuous'));
    }
  }
});

test('all particles reach their exact target after the last stagger, without a residual arc', () => {
  for (const mode of modes) {
    const profile = motionForScene(mode);
    for (const elapsed of [profile.duration + profile.stagger, 90]) {
      assert.deepEqual(sampleTransitionBuffer(from, target, seeds, elapsed, profile), target, mode);
    }
    assert.deepEqual(sampleTransitionBuffer(from, target, seeds, -.1, profile), from, 'future transitions stay at their source');
  }
});

test('even the last digit particles move most of the distance within 300ms and settle within 900ms', () => {
  const origin = new Float32Array(seeds.length), destination = new Float32Array(seeds.length);
  for (let i = 0; i < destination.length; i += 3) destination[i] = 10;
  for (const mode of ['one', 'two', 'three']) {
    const profile = motionForScene(mode);
    const early = sampleTransitionBuffer(origin, destination, seeds, .3, profile);
    for (let i = 0; i < early.length; i += 3) assert.ok(early[i] > 5, `${mode}: delayed particle should already be over halfway`);
    assert.deepEqual(sampleTransitionBuffer(origin, destination, seeds, .9, profile), destination);
  }
});

test('rapid gestures can retarget repeatedly without NaNs, lost particles or unbounded coordinates', () => {
  let snapshot = from;
  for (let i = 0; i < 160; i += 1) {
    const goal = i % 2 ? target : next;
    snapshot = sampleTransitionBuffer(snapshot, goal, seeds, .04 + (i % 7) * .035, motionForScene(modes[i % modes.length]));
    assert.equal(snapshot.length, from.length);
    snapshot.forEach(value => assert.ok(Number.isFinite(value) && Math.abs(value) < 8));
  }
});

test('digit arcs stay compact while name reveal retains its upward return', () => {
  const origin = new Float32Array(3), seed = new Float32Array([0, .4, .3]);
  const digit = motionForScene('one'), name = motionForScene('name');
  let digitDeviation = 0, lowestName = 0;
  for (let i = 1; i < 100; i += 1) {
    const p = sampleTransitionBuffer(origin, origin, seed, digit.duration * i / 100, digit);
    digitDeviation = Math.max(digitDeviation, Math.hypot(...p));
    lowestName = Math.min(lowestName, sampleTransitionBuffer(origin, origin, seed, name.duration * i / 100, name)[1]);
  }
  assert.ok(digitDeviation < .45, 'digits should not make wide excursions before becoming readable');
  assert.ok(lowestName < -.6, 'the name retains a visible upward gathering path');
  assert.equal(sampleTransitionBuffer(origin, origin, seed, name.duration + name.stagger, name)[1], 0);
});
