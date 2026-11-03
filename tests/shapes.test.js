import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scatterTargets, heartTargets } from '../src/shapes.js';

test('orbital and heart targets remain deterministic, finite, and safe to project at every quality', () => {
  for (const count of [0, 1, 8000, 16000]) {
    for (const build of [scatterTargets, heartTargets]) {
      const shape = build(count);
      assert.equal(shape.length, count * 3);
      assert.deepEqual(shape, build(count), 'morph targets must stay stable between gestures');
      for (let i = 0; i < shape.length; i += 3) {
        assert.ok(Number.isFinite(shape[i]) && Math.abs(shape[i]) < 6.5);
        assert.ok(Number.isFinite(shape[i + 1]) && Math.abs(shape[i + 1]) < 3.5);
        assert.ok(Number.isFinite(shape[i + 2]) && Math.abs(shape[i + 2]) < 2.5);
      }
    }
  }
});

test('open-hand sculpture has an empty aperture and depth on both sides of the focal plane', () => {
  const shape = scatterTargets(16000);
  let front = 0, back = 0;
  for (let i = 0; i < shape.length; i += 3) {
    assert.ok(Math.hypot(shape[i], shape[i + 1] / .6) > .8, 'the center must stay clear');
    if (shape[i + 2] > .5) front++;
    if (shape[i + 2] < -.5) back++;
  }
  assert.ok(front > 1600 && back > 1600, 'the sculpture must remain spatial at reduced quality');
});
