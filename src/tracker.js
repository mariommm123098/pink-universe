export class HandTracker {
  constructor(video, onResult, onStatus) { this.video = video; this.onResult = onResult; this.onStatus = onStatus; this.generation = 0; }
  async start() {
    this.stop();
    const generation = ++this.generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('SECURE_CONTEXT');
    // Each start owns its resources, including permission requests that finish after stop().
    const session = { stream: null, worker: null, cancelInit: null };
    this.session = session;
    const isCurrent = () => generation === this.generation && this.session === session;
    this.onStatus('permission');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
      session.stream = stream;
      if (!isCurrent()) { this.disposeSession(session); return false; }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      // A permission revocation or disconnected camera can happen while play()
      // or the model is still loading. Report it then, not only after ready.
      const cameraEnded = () => {
        if (!isCurrent()) return;
        this.stop();
        this.onStatus('ended');
      };
      track.addEventListener('ended', cameraEnded, { once: true });
      if (track.readyState === 'ended') { cameraEnded(); return false; }
      this.video.srcObject = stream;
      await this.video.play();
      if (!isCurrent()) { this.disposeSession(session); return false; }
      this.onStatus('model');
      const worker = new Worker(new URL('hand-tracking.worker.js', document.baseURI));
      session.worker = worker;
      this.worker = worker;
      await new Promise((resolve, reject) => {
        let settled = false;
        const finish = error => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          session.cancelInit = null;
          if (error) reject(error); else resolve();
        };
        const timeout = setTimeout(() => finish(new Error('MODEL_TIMEOUT')), 35000);
        session.cancelInit = () => finish();
        worker.onmessage = ({ data }) => {
          if (!isCurrent()) return;
          if (data.type === 'ready') finish();
          else if (data.type === 'error') finish(new Error('MODEL_LOAD: ' + data.message));
        };
        worker.onerror = event => { if (isCurrent()) finish(new Error('MODEL_LOAD: ' + event.message)); };
        worker.postMessage({ type: 'init', wasmRoot: new URL('mediapipe/wasm', document.baseURI).href, modelPath: new URL('models/hand_landmarker.task', document.baseURI).href });
      });
      if (!isCurrent()) { this.disposeSession(session); return false; }
      worker.onmessage = ({ data }) => {
        if (!isCurrent() || !this.running) return;
        this.busy = false;
        if (data.type === 'result') { this.frameErrors = 0; this.interval = Math.max(42, Math.min(95, data.elapsed * 1.5)); this.onResult(data); }
        else if (data.type === 'frame-error' && ++this.frameErrors > 8) this.onStatus('inference-error');
      };
      worker.onerror = () => { if (isCurrent() && this.running) this.onStatus('inference-error'); };
      this.running = true; this.busy = false; this.frameErrors = 0; this.captureErrors = 0; this.interval = 48; this.last = -Infinity; this.lastVideo = -1;
      this.onStatus('ready');
      this.loop();
      return true;
    } catch (error) {
      if (!isCurrent()) { this.disposeSession(session); return false; }
      this.stop();
      throw error;
    }
  }
  loop = async () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (document.hidden || this.busy || now - this.last < this.interval || this.video.readyState < 2 || this.video.currentTime === this.lastVideo) return;
    this.busy = true; this.last = now; this.lastVideo = this.video.currentTime;
    const generation = this.generation, session = this.session, worker = this.worker;
    const isCurrent = () => this.running && generation === this.generation && this.session === session;
    let frame;
    try {
      frame = await createImageBitmap(this.video);
      if (!isCurrent()) { frame.close(); return; }
      this.captureErrors = 0;
      worker.postMessage({ type: 'frame', frame, timestamp: now }, [frame]);
    } catch {
      frame?.close();
      if (!isCurrent()) return;
      this.busy = false;
      if (++this.captureErrors > 10) this.onStatus('inference-error');
    }
  };
  disposeSession(session) {
    if (!session) return;
    session.cancelInit?.(); session.cancelInit = null;
    const worker = session.worker; session.worker = null;
    if (worker) {
      worker.onmessage = null; worker.onerror = null; worker.terminate();
      if (this.worker === worker) this.worker = null;
    }
    const stream = session.stream; session.stream = null;
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      if (this.stream === stream) this.stream = null;
      if (this.video.srcObject === stream) this.video.srcObject = null;
    }
  }
  stop() {
    ++this.generation;
    this.running = false; this.busy = false; cancelAnimationFrame(this.raf);
    const session = this.session; this.session = null;
    this.disposeSession(session);
  }
}
