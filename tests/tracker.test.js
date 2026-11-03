import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HandTracker } from '../src/tracker.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
function stream() {
  const ended = [];
  const track = { stops: 0, stop() { this.stops++; }, addEventListener(type, callback) { if (type === 'ended') ended.push(callback); } };
  return { track, ended, getTracks: () => [track], getVideoTracks: () => [track] };
}
function setup(t, { capture = false } = {}) {
  const requests = [], plays = [], workers = [], captures = [], results = [], statuses = [];
  const video = { srcObject: null, readyState: capture ? 2 : 0, currentTime: 0, play() { const pending = deferred(); plays.push(pending); return pending.promise; } };
  let rafId = 0;
  const globals = {
    window: { isSecureContext: true },
    document: { baseURI: 'https://example.test/art/', hidden: false },
    navigator: { mediaDevices: { getUserMedia(options) { const pending = deferred(); requests.push({ ...pending, options }); return pending.promise; } } },
    Worker: class {
      constructor(url) { this.url = url; this.messages = []; this.terminations = 0; workers.push(this); }
      postMessage(data) { this.messages.push(data); }
      terminate() { this.terminations++; }
      emit(data) { this.onmessage?.({ data }); }
    },
    requestAnimationFrame: () => ++rafId,
    cancelAnimationFrame: () => {},
    createImageBitmap: () => { const pending = deferred(); captures.push(pending); return pending.promise; },
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const tracker = new HandTracker(video, result => results.push(result), status => statuses.push(status));
  t.after(() => {
    tracker.stop();
    for (const key of Object.keys(globals)) {
      if (originals[key]) Object.defineProperty(globalThis, key, originals[key]);
      else delete globalThis[key];
    }
  });
  async function ready(start, device = stream()) {
    requests.at(-1).resolve(device); await flush();
    plays.at(-1).resolve(); await flush();
    workers.at(-1).emit({ type: 'ready' });
    assert.equal(await start, true);
    return device;
  }
  return { tracker, video, requests, plays, workers, captures, results, statuses, ready };
}

test('late permission grants dispose only their own stream and preserve the newer camera', async t => {
  const env = setup(t), oldDevice = stream();
  const oldStart = env.tracker.start();
  env.tracker.stop();
  const newStart = env.tracker.start(), newDevice = await env.ready(newStart);
  env.requests[0].resolve(oldDevice);
  assert.equal(await oldStart, false);
  assert.equal(oldDevice.track.stops, 1);
  assert.equal(newDevice.track.stops, 0);
  assert.equal(env.video.srcObject, newDevice);
  assert.equal(env.tracker.stream, newDevice);
  assert.equal(env.tracker.worker, env.workers[0]);
  assert.equal(env.tracker.running, true);
  assert.deepEqual(env.requests[1].options, { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
  assert.equal(env.workers[0].messages[0].wasmRoot, 'https://example.test/art/mediapipe/wasm');
  assert.equal(env.workers[0].messages[0].modelPath, 'https://example.test/art/models/hand_landmarker.task');
  env.tracker.stop();
  assert.equal(newDevice.track.stops, 1);
  assert.equal(env.workers[0].terminations, 1);
});

test('a stopped pending video.play cannot create a worker or clear the replacement stream', async t => {
  const env = setup(t), oldDevice = stream();
  const oldStart = env.tracker.start();
  env.requests[0].resolve(oldDevice); await flush();
  const oldPlay = env.plays[0];
  assert.equal(env.video.srcObject, oldDevice);
  env.tracker.stop();
  const newDevice = await env.ready(env.tracker.start());
  oldPlay.resolve();
  assert.equal(await oldStart, false);
  assert.equal(env.workers.length, 1);
  assert.equal(oldDevice.track.stops, 1);
  assert.equal(newDevice.track.stops, 0);
  assert.equal(env.video.srcObject, newDevice);
  assert.equal(env.tracker.running, true);
});

test('a superseded play rejection is cancellation, while its replacement keeps running', async t => {
  const env = setup(t), oldDevice = stream();
  const oldStart = env.tracker.start();
  env.requests[0].resolve(oldDevice); await flush();
  const newDevice = await env.ready(env.tracker.start());
  env.plays[0].reject(new Error('interrupted playback'));
  assert.equal(await oldStart, false);
  assert.equal(env.tracker.stream, newDevice);
  assert.equal(env.tracker.running, true);
  assert.equal(oldDevice.track.stops, 1);
});

test('stopping model initialization settles start and ignores queued initialization callbacks', async t => {
  const env = setup(t), oldDevice = stream();
  const oldStart = env.tracker.start();
  env.requests[0].resolve(oldDevice); await flush();
  env.plays[0].resolve(); await flush();
  const oldWorker = env.workers[0], oldMessage = oldWorker.onmessage, oldError = oldWorker.onerror;
  env.tracker.stop();
  assert.equal(await oldStart, false);
  const newDevice = await env.ready(env.tracker.start());
  const statuses = [...env.statuses];
  oldMessage({ data: { type: 'ready' } });
  oldMessage({ data: { type: 'error', message: 'stale failure' } });
  oldError({ message: 'stale worker error' });
  assert.deepEqual(env.statuses, statuses);
  assert.equal(env.tracker.stream, newDevice);
  assert.equal(env.tracker.worker, env.workers[1]);
  assert.equal(oldWorker.terminations, 1);
  assert.equal(oldDevice.track.stops, 1);
});

test('stale results, worker errors and track ended events cannot affect a replacement session', async t => {
  const env = setup(t);
  const oldDevice = await env.ready(env.tracker.start());
  const oldWorker = env.workers[0], oldMessage = oldWorker.onmessage, oldError = oldWorker.onerror;
  await env.ready(env.tracker.start());
  const statuses = [...env.statuses];
  env.tracker.busy = true;
  oldMessage({ data: { type: 'result', elapsed: 99, landmarks: ['old'] } });
  for (let i = 0; i < 10; i++) oldMessage({ data: { type: 'frame-error' } });
  oldError({}); oldDevice.ended[0]();
  assert.equal(env.results.length, 0);
  assert.equal(env.tracker.busy, true);
  assert.equal(env.tracker.frameErrors, 0);
  assert.deepEqual(env.statuses, statuses);
  const result = { type: 'result', elapsed: 20, landmarks: ['current'] };
  env.workers[1].emit(result);
  assert.deepEqual(env.results, [result]);
  assert.equal(env.tracker.busy, false);
  assert.equal(env.tracker.interval, 42);
  const stoppedMessage = env.workers[1].onmessage;
  env.tracker.stop();
  stoppedMessage({ data: result });
  assert.equal(env.results.length, 1);
});

test('a bitmap captured before restart is closed and never sent to the replacement worker', async t => {
  const env = setup(t, { capture: true });
  await env.ready(env.tracker.start());
  assert.equal(env.captures.length, 1);
  await env.ready(env.tracker.start());
  assert.equal(env.captures.length, 2);
  const oldFrame = { closes: 0, close() { this.closes++; } };
  env.captures[0].resolve(oldFrame); await flush();
  assert.equal(oldFrame.closes, 1);
  assert.equal(env.tracker.busy, true);
  assert.equal(env.workers[0].messages.length, 1);
  assert.equal(env.workers[1].messages.length, 1);
  const currentFrame = { close() {} };
  env.captures[1].resolve(currentFrame); await flush();
  assert.equal(env.workers[1].messages[1].type, 'frame');
  assert.equal(env.workers[1].messages[1].frame, currentFrame);
});

test('a rejected stale capture cannot clear the replacement inference lock', async t => {
  const env = setup(t, { capture: true });
  await env.ready(env.tracker.start());
  await env.ready(env.tracker.start());
  env.captures[0].reject(new Error('old capture failed')); await flush();
  assert.equal(env.tracker.busy, true);
  assert.equal(env.tracker.captureErrors, 0);
  assert.equal(env.statuses.includes('inference-error'), false);
  env.captures[1].resolve({ close() {} }); await flush();
});

test('a current model failure still rejects and releases its camera and worker', async t => {
  const env = setup(t), device = stream();
  const start = env.tracker.start();
  env.requests[0].resolve(device); await flush();
  env.plays[0].resolve(); await flush();
  env.workers[0].emit({ type: 'error', message: 'missing model' });
  await assert.rejects(start, /MODEL_LOAD: missing model/);
  assert.equal(device.track.stops, 1);
  assert.equal(env.workers[0].terminations, 1);
  assert.equal(env.tracker.running, false);
  assert.equal(env.video.srcObject, null);
});

test('a camera disconnected while model initialization is pending cancels startup promptly', async t => {
  const env = setup(t), device = stream();
  const start = env.tracker.start();
  env.requests[0].resolve(device); await flush();
  env.plays[0].resolve(); await flush();
  const worker = env.workers[0], staleReady = worker.onmessage;
  device.ended[0]();
  assert.equal(await start, false);
  assert.equal(env.statuses.at(-1), 'ended');
  assert.equal(env.statuses.includes('ready'), false);
  assert.equal(env.tracker.running, false);
  assert.equal(device.track.stops, 1);
  assert.equal(worker.terminations, 1);
  assert.equal(env.video.srcObject, null);
  staleReady({ data: { type: 'ready' } });
  assert.equal(env.statuses.includes('ready'), false);
});

test('an ended track returned by a delayed permission grant never starts playback or model loading', async t => {
  const env = setup(t), device = stream();
  device.track.readyState = 'ended';
  const start = env.tracker.start();
  env.requests[0].resolve(device);
  assert.equal(await start, false);
  assert.deepEqual(env.statuses, ['permission', 'ended']);
  assert.equal(env.plays.length, 0);
  assert.equal(env.workers.length, 0);
  assert.equal(device.track.stops, 1);
  assert.equal(env.video.srcObject, null);
});

test('a camera disconnected before playback starts cannot later finish startup', async t => {
  const env = setup(t), device = stream();
  const start = env.tracker.start();
  env.requests[0].resolve(device); await flush();
  device.ended[0]();
  assert.equal(env.statuses.at(-1), 'ended');
  assert.equal(device.track.stops, 1);
  env.plays[0].resolve();
  assert.equal(await start, false);
  assert.equal(env.workers.length, 0);
  assert.equal(env.video.srcObject, null);
});
