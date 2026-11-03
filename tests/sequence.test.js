import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RomanceSequence } from '../src/sequence.js';
import { GestureStabilizer } from '../src/gestures.js';

function completeCountdown(sequence) {
  for (const gesture of ['three', 'two', 'one']) assert.equal(sequence.accept(gesture)?.scene, gesture);
}

function state(sequence) {
  return {
    scene: sequence.scene,
    next: sequence.next,
    armed: sequence.armed,
    countdownStep: sequence.countdownStep,
    countdownComplete: sequence.countdownComplete,
    expectedNumber: sequence.expectedNumber,
  };
}

test('opening numbers must be confirmed in order 3 → 2 → 1', () => {
  const sequence = new RomanceSequence();
  for (const gesture of ['one', 'two', 'one', 'unknown', null]) {
    assert.equal(sequence.accept(gesture), null);
    assert.equal(sequence.countdownStep, 0);
    assert.equal(sequence.scene, 'welcome');
  }
  for (const [gesture, expectedNumber] of [['three', 2], ['two', 1], ['one', null]]) {
    assert.equal(sequence.accept(gesture)?.scene, gesture);
    assert.equal(sequence.expectedNumber, expectedNumber);
  }
  assert.equal(sequence.countdownComplete, true);
  assert.equal(sequence.next, 0);
  assert.equal(sequence.armed, true);
});

test('transition fists never consume romance or alter countdown at any unfinished step', () => {
  const sequence = new RomanceSequence();
  for (const nextGesture of ['three', 'two', 'one']) {
    const before = state(sequence);
    for (let frame = 0; frame < 60; frame += 1) assert.equal(sequence.accept('fist'), null);
    assert.deepEqual(state(sequence), before);
    assert.equal(sequence.accept(nextGesture)?.scene, nextGesture);
  }
  assert.equal(sequence.accept('fist')?.scene, 'love', 'the fresh fist after 1 needs no intervening open palm');
  assert.equal(sequence.next, 1);
  for (let frame = 0; frame < 60; frame += 1) assert.equal(sequence.accept('fist'), null);
  assert.equal(sequence.next, 1);
});

test('wrong-order and repeated previous numbers cannot skip or restart the countdown', () => {
  const sequence = new RomanceSequence();
  sequence.accept('three');
  const afterThree = state(sequence);
  for (const gesture of ['three', 'one', 'fist', 'unknown', null]) assert.equal(sequence.accept(gesture), null);
  assert.deepEqual(state(sequence), afterThree);
  sequence.accept('two');
  const afterTwo = state(sequence);
  for (const gesture of ['two', 'three', 'fist', 'unknown', null]) assert.equal(sequence.accept(gesture), null);
  assert.deepEqual(state(sequence), afterTwo);
  assert.equal(sequence.accept('one')?.scene, 'one');
  assert.equal(sequence.countdownComplete, true);
});

test('open palms scatter without consuming or resetting countdown progress', () => {
  const sequence = new RomanceSequence();
  for (const [gesture, step] of [['three', 1], ['two', 2]]) {
    sequence.accept(gesture);
    for (let repeat = 0; repeat < 3; repeat += 1) {
      assert.equal(sequence.accept('open')?.scene, 'scatter');
      assert.equal(sequence.countdownStep, step);
      assert.equal(sequence.next, 0);
      assert.equal(sequence.accept('fist'), null);
    }
  }
  assert.equal(sequence.accept('one')?.scene, 'one');
  assert.equal(sequence.accept('fist')?.scene, 'love');
});

test('after countdown, only an open palm rearms the original romance cycle', () => {
  const sequence = new RomanceSequence();
  completeCountdown(sequence);
  assert.equal(sequence.accept('fist')?.scene, 'love');
  for (const gesture of ['one', 'two', 'three']) {
    assert.equal(sequence.accept(gesture)?.scene, gesture);
    assert.equal(sequence.accept('fist'), null, 'number gestures must not rearm a consumed fist');
    assert.equal(sequence.next, 1);
  }
  for (const scene of ['name', 'surprise', 'love']) {
    sequence.accept('open');
    sequence.accept('open');
    sequence.accept('two');
    assert.equal(sequence.accept('fist')?.scene, scene);
    assert.equal(sequence.accept('fist'), null);
    assert.equal(sequence.countdownComplete, true, 'later cycles never restart the opening countdown');
  }
});

test('tracking gaps and stabilizer resets preserve countdown and romance latches', () => {
  const sequence = new RomanceSequence();
  const stabilizer = new GestureStabilizer();
  let time = 0;
  function confirm(gesture) {
    for (let frame = 0; frame < 9; frame += 1) {
      time += 50;
      const stable = stabilizer.update({ gesture, confidence: 0.98 }, time);
      if (stable.changed) sequence.accept(stable.gesture);
    }
  }
  confirm('three');
  confirm('fist');
  stabilizer.update(null, time += 2000);
  stabilizer.reset();
  confirm('fist');
  assert.equal(sequence.countdownStep, 1);
  assert.equal(sequence.next, 0);
  confirm('two');
  confirm('fist');
  confirm('one');
  confirm('fist');
  assert.equal(sequence.scene, 'love');
  assert.equal(sequence.next, 1);
  stabilizer.reset();
  confirm('fist');
  assert.equal(sequence.next, 1, 'a renewed tracking session cannot repeat a held fist');
  confirm('open');
  confirm('fist');
  assert.equal(sequence.scene, 'name');
});
