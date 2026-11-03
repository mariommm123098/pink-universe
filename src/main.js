import { ParticleArt } from './art.js';
import { loadParticleFont } from './shapes.js';
import { classifyHand, GestureStabilizer, mirroredPalm } from './gestures.js';
import { RomanceSequence } from './sequence.js';
import { HandTracker } from './tracker.js';
import { HandOverlay } from './hand-overlay.js';
import { AmbientAudio } from './audio.js';

const $ = id => document.getElementById(id);
const overlays = [...document.querySelectorAll('.overlay')];
const sequence = new RomanceSequence();
const stabilizer = new GestureStabilizer();
const audio = new AmbientAudio();
const handOverlay = new HandOverlay($('hand-overlay'), $('camera-video'));
let preferences = { name: '小猫', message: 'I ♥ U', quality: 'auto' };
try {
  const saved = JSON.parse(localStorage.getItem('little-cat-magic') || 'null');
  if (saved) preferences = {
    name: Array.from(String(saved.name || '小猫')).slice(0, 12).join(''),
    message: Array.from(String(saved.message || 'I ♥ U')).slice(0, 36).join(''),
    quality: ['auto', 'high', 'low'].includes(saved.quality) ? saved.quality : 'auto',
  };
} catch {}

let art;
let mode = 'welcome';
let starting = false;
let startGeneration = 0;
let previewWanted = true;
let uiHidden = false;
let activeGesture = 'unknown';
let fontState = 'idle';
let fontPromise;
let pendingFocus;
let toastTimer;
let idleTimer;
let fatalError = false;
let retryIntent = 'camera';

function notify(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2400);
}
function syncPreferences() {
  $('name-input').value = preferences.name;
  $('message-input').value = preferences.message;
  $('quality-input').value = preferences.quality;
}
function syncControls() {
  const cameraOn = mode === 'camera';
  $('camera-button').setAttribute('aria-pressed', String(cameraOn));
  $('camera-button').setAttribute('aria-label', cameraOn ? '关闭摄像头' : '开启摄像头');
  $('camera-button').title = cameraOn ? '关闭摄像头' : '开启摄像头';
  $('camera-button').querySelector('use').setAttribute('href', cameraOn ? '#i-camera' : '#i-camera-off');
  $('camera-button').disabled = starting;
  $('camera-setting').setAttribute('aria-checked', String(cameraOn));
  $('camera-setting').disabled = starting;
  $('preview-setting').setAttribute('aria-checked', String(previewWanted));
  $('preview-setting').disabled = !cameraOn;
  $('demo-setting').setAttribute('aria-checked', String(mode === 'demo'));
  $('camera-preview').hidden = !cameraOn || !previewWanted;
  if (cameraOn) handOverlay.draw(); else handOverlay.clear();
  $('demo-badge').hidden = mode !== 'demo';
  document.body.classList.toggle('demo-mode', mode === 'demo');
}
function noteActivity() {
  document.body.classList.remove('controls-idle');
  clearTimeout(idleTimer);
  if (mode !== 'welcome') idleTimer = setTimeout(() => document.body.classList.add('controls-idle'), 2800);
}
function openOverlay(id) {
  const wasOpen = overlays.some(el => !el.hidden);
  if (!wasOpen) pendingFocus = document.activeElement;
  overlays.forEach(el => { el.hidden = el.id !== id; });
  $('welcome').inert = true;
  $('experience').inert = true;
  $('restore-ui').inert = true;
  document.body.classList.remove('controls-idle');
  const focus = $(id).querySelector('input,button');
  setTimeout(() => { if (!$(id).hidden) focus?.focus({ preventScroll: true }); }, 30);
}
function closeOverlays(restore = true) {
  overlays.forEach(el => { el.hidden = true; });
  $('welcome').inert = mode !== 'welcome';
  $('experience').inert = uiHidden;
  $('restore-ui').inert = false;
  if (restore) {
    const target = pendingFocus?.getClientRects().length && !pendingFocus.closest('[inert]') ? pendingFocus : mode === 'welcome' ? $('start-button') : $('settings-button');
    target?.focus({ preventScroll: true });
  }
  noteActivity();
}
function ensureFont() {
  if (fontState === 'ready') return Promise.resolve();
  if (fontState === 'loading') return fontPromise;
  fontState = 'loading';
  fontPromise = loadParticleFont().then(() => { fontState = 'ready'; }).catch(error => {
    fontState = 'error';
    throw new Error('FONT_LOAD: ' + error.message);
  });
  return fontPromise;
}
function showError(error) {
  const code = error?.name || '';
  const message = error?.message || '';
  let title = '摄像头不可用';
  let text = '关闭占用摄像头的其他应用后重试。';
  if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
    title = '摄像头权限未开启';
    text = '请在地址栏的权限设置中允许使用摄像头。';
  } else if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
    title = '未检测到摄像头';
    text = '连接摄像头后重试，或使用演示模式。';
  } else if (message.includes('SECURE_CONTEXT')) {
    title = '需要安全连接';
    text = '请使用 HTTPS 或 localhost 访问。';
  } else if (message.includes('MODEL')) {
    title = '手势识别不可用';
    text = '请重试，或使用演示模式。';
  } else if (message.includes('FONT')) {
    title = '字体加载失败';
    text = '请检查本地字体文件后重试。';
  } else if (message === 'CAMERA_ENDED') {
    title = '摄像头连接中断';
    text = '请检查设备后重试。';
  } else if (message === 'GRAPHICS') {
    title = '无法启动画面';
    text = '请开启浏览器硬件加速后重新加载。';
  } else if (message === 'CONTEXT_LOST') {
    title = '图形连接中断';
    text = '请重新加载页面。';
  }
  $('error-title').textContent = title;
  $('error-message').textContent = text;
  $('retry-camera').textContent = fatalError ? '重新加载' : '重试';
  $('error-demo').hidden = fatalError;
  openOverlay('error-overlay');
}

const tracker = new HandTracker($('camera-video'), onHandResult, onTrackerStatus);
function onTrackerStatus(status) {
  if (status === 'permission') $('loading-text').textContent = '请允许使用摄像头，画面仅在本机处理。';
  else if (status === 'model') $('loading-text').textContent = '正在加载手势识别。';
  else if (status === 'ended' || status === 'inference-error') {
    ++startGeneration;
    starting = false;
    $('start-button').disabled = false;
    tracker.stop();
    if (mode === 'camera') mode = 'paused';
    stabilizer.reset();
    syncControls();
    showError(new Error(status === 'ended' ? 'CAMERA_ENDED' : 'MODEL_RUNTIME'));
  }
}
async function startCamera() {
  if (fatalError || !art) { location.reload(); return; }
  if (starting) return;
  retryIntent = 'camera';
  const generation = ++startGeneration;
  starting = true;
  $('start-button').disabled = true;
  syncControls();
  openOverlay('loading-overlay');
  try {
    const [started] = await Promise.all([tracker.start(), ensureFont()]);
    if (generation !== startGeneration || !started) return;
    enterExperience('camera');
  } catch (error) {
    if (generation === startGeneration) {
      tracker.stop();
      if (mode === 'camera') mode = 'paused';
      showError(error);
    }
  } finally {
    if (generation === startGeneration) {
      starting = false;
      $('start-button').disabled = false;
      syncControls();
    }
  }
}
async function startDemo() {
  if (!art || fatalError) return;
  retryIntent = 'demo';
  const generation = ++startGeneration;
  tracker.stop();
  handOverlay.clear();
  starting = false;
  $('start-button').disabled = false;
  if (fontState !== 'ready') {
    openOverlay('loading-overlay');
    $('loading-text').textContent = '正在加载字体。';
  }
  try {
    await ensureFont();
    if (generation !== startGeneration) return;
    enterExperience('demo');
  } catch (error) { if (generation === startGeneration) showError(error); }
}
function pauseCamera() {
  art?.releaseInput();
  ++startGeneration;
  starting = false;
  tracker.stop();
  stabilizer.reset();
  if (mode !== 'welcome') mode = 'paused';
  $('start-button').disabled = false;
  syncControls();
}
function toggleCamera() { if (mode === 'camera') pauseCamera(); else startCamera(); }
function enterExperience(nextMode) {
  const first = mode === 'welcome';
  mode = nextMode;
  art.setInputMode(nextMode);
  stabilizer.reset();
  if (first) {
    $('welcome').classList.add('leaving');
    setTimeout(() => { $('welcome').hidden = true; }, 650);
    $('experience').hidden = false;
    art.enter();
    performGesture('open');
  }
  closeOverlays(false);
  syncControls();
  noteActivity();
}
function performGesture(gesture) {
  const result = sequence.accept(gesture);
  if (!result) return;
  activeGesture = gesture;
  art.setCountdown(sequence.countdownStep);
  renderScene(result.scene);
  document.querySelectorAll('[data-gesture]').forEach(el => el.classList.toggle('active', el.dataset.gesture === gesture));
}
function renderScene(scene) {
  art.setScene(scene, preferences);
  audio.cue(art.mode);
  document.body.dataset.scene = art.mode;
  const descriptions = {
    scatter: '粉色粒子：散开', one: '粒子数字 1', two: '粒子数字 2', three: '粒子数字 3',
    love: `粒子文字：${preferences.message}；粒子名字：${preferences.name}`,
    name: `粒子文字：${preferences.message}；粒子名字：${preferences.name}`,
    surprise: `粒子文字：${preferences.message}；粒子名字：${preferences.name}`,
  };
  $('artwork').setAttribute('aria-label', descriptions[scene] || '粉色粒子互动场景');
  $('artwork').dataset.scene = scene;
}
function onHandResult({ landmarks, world }) {
  if (mode !== 'camera') return;
  handOverlay.update(landmarks);
  const now = performance.now();
  if (!landmarks) { art.releaseInput(); stabilizer.update(null, now); return; }
  const video = $('camera-video');
  const result = classifyHand(landmarks, world, video.videoWidth / video.videoHeight || 4 / 3);
  const stable = stabilizer.update(result, now);
  const palm = mirroredPalm(landmarks);
  art.setPointer(palm.x, palm.y);
  if (stable.changed) performGesture(stable.gesture);
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    closeOverlays(false);
  } catch { notify('当前浏览器不支持全屏。'); }
}
function toggleUI() {
  if (mode === 'welcome') return;
  closeOverlays(false);
  uiHidden = !uiHidden;
  $('experience').hidden = uiHidden;
  $('experience').inert = uiHidden;
  $('restore-ui').hidden = !uiHidden;
}

$('start-button').addEventListener('click', startCamera);
$('cancel-camera').addEventListener('click', startDemo);
$('error-demo').addEventListener('click', startDemo);
$('retry-camera').addEventListener('click', () => fatalError ? location.reload() : retryIntent === 'demo' ? startDemo() : startCamera());
$('camera-button').addEventListener('click', toggleCamera);
$('camera-setting').addEventListener('click', toggleCamera);
$('settings-button').addEventListener('click', () => { syncPreferences(); syncControls(); openOverlay('settings-overlay'); });
$('help-button').addEventListener('click', () => openOverlay('help-overlay'));
$('demo-badge').addEventListener('click', () => openOverlay('help-overlay'));
$('hide-preview').addEventListener('click', () => { previewWanted = false; syncControls(); });
$('preview-setting').addEventListener('click', () => { previewWanted = !previewWanted; syncControls(); });
$('demo-setting').addEventListener('click', () => mode === 'demo' ? startCamera() : startDemo());
$('fullscreen-button').addEventListener('click', fullscreen);
$('hide-ui').addEventListener('click', toggleUI);
$('restore-ui').addEventListener('click', toggleUI);
$('sound-button').addEventListener('click', async () => {
  try { $('sound-button').setAttribute('aria-checked', String(await audio.toggle())); }
  catch { notify('声音不可用。'); }
});
document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => closeOverlays()));
overlays.forEach(el => el.addEventListener('click', event => {
  if (event.target === el && el.id !== 'loading-overlay') closeOverlays();
}));
document.querySelectorAll('[data-gesture]').forEach(el => el.addEventListener('click', () => {
  if (mode === 'demo') performGesture(el.dataset.gesture);
}));
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  const name = Array.from($('name-input').value.trim()).slice(0, 12).join('');
  const message = Array.from($('message-input').value.trim()).slice(0, 36).join('');
  if (!name || !message) { notify('请输入名字和文字。'); return; }
  try {
    await ensureFont();
    preferences = { name, message, quality: $('quality-input').value };
    try { localStorage.setItem('little-cat-magic', JSON.stringify(preferences)); } catch {}
    art.setQuality(preferences.quality);
    syncPreferences();
    if (mode !== 'welcome' && ['love', 'name', 'surprise'].includes(sequence.scene)) renderScene(sequence.scene);
    closeOverlays();
  } catch (error) { showError(error); }
});
window.addEventListener('pointermove', event => {
  noteActivity();
  if (mode === 'demo' && !event.target.closest('.overlay,.corner-controls,.camera-preview')) {
    art?.setPointer((event.clientX / innerWidth - .5) * 2, (.5 - event.clientY / innerHeight) * 2);
  }
}, { passive: true });
window.addEventListener('pointerdown', noteActivity, { passive: true });
window.addEventListener('keydown', event => {
  const overlay = overlays.find(el => !el.hidden);
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (overlay && event.key === 'Escape') {
    event.preventDefault();
    if (overlay.id === 'loading-overlay') startDemo(); else closeOverlays();
    return;
  }
  if (overlay && event.key === 'Tab') {
    const focusable = [...overlay.querySelectorAll('button,input,select,a')].filter(el => !el.disabled && el.getClientRects().length);
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    return;
  }
  if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
  if (overlay && overlay.id !== 'help-overlay') return;
  if (event.key === ' ' && document.activeElement?.tagName === 'BUTTON') return;
  const gesture = { '0': 'open', '1': 'one', '2': 'two', '3': 'three', ' ': 'fist' }[event.key];
  if (event.repeat) { if (mode === 'demo' && gesture) event.preventDefault(); return; }
  if (event.key.toLowerCase() === 'f') { event.preventDefault(); fullscreen(); }
  else if (event.key.toLowerCase() === 'h') { event.preventDefault(); toggleUI(); }
  else if (mode === 'demo' && gesture) { event.preventDefault(); performGesture(gesture); }
});
window.addEventListener('pointerleave', () => { if(mode==='demo')art?.releaseInput(); });
document.addEventListener('visibilitychange', () => { art?.releaseInput(); stabilizer.reset(); if (document.hidden) handOverlay.clear(); audio.suspendWhenHidden(); });
window.addEventListener('pagehide', event => {
  ++startGeneration;
  starting = false;
  tracker.stop(); handOverlay.clear(); stabilizer.reset();
  if (mode === 'camera') mode = 'paused';
  if (event.persisted) {
    $('start-button').disabled = false;
    closeOverlays(false); syncControls();
  } else { art?.dispose(); audio.dispose(); }
});
$('artwork').addEventListener('webglcontextlost', event => {
  event.preventDefault();
  tracker.stop();
  handOverlay.clear();
  fatalError = true;
  showError(new Error('CONTEXT_LOST'));
});

syncPreferences();
try {
  art = new ParticleArt($('artwork'));
  art.setQuality(preferences.quality);
} catch (error) {
  console.error('Graphics initialization failed:', error);
  fatalError = true;
  showError(new Error('GRAPHICS'));
}
ensureFont().catch(() => {});
Object.defineProperty(window, 'magicStatus', { get: () => ({
  mode, scene: sequence.scene, next: sequence.next, armed: sequence.armed,
  countdownComplete: sequence.countdownComplete,
  countdownExpected: ({ 3: 'three', 2: 'two', 1: 'one' })[sequence.expectedNumber] || null,
  font: fontState, particles: art?.activeCount, gesture: activeGesture,
  tracking: !!tracker.running, preview: !($('camera-preview').hidden), starting,
}) });
