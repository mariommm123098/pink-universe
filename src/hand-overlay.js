const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const TIPS = new Set([4, 8, 12, 16, 20]);

/** Match object-fit: cover and the preview video's single horizontal mirror. */
export function projectHand(landmarks, videoWidth, videoHeight, width, height) {
  if (landmarks?.length !== 21 || ![videoWidth, videoHeight, width, height].every(n => Number.isFinite(n) && n > 0)
    || !landmarks.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const scale = Math.max(width / videoWidth, height / videoHeight);
  const cropX = (width - videoWidth * scale) / 2;
  const cropY = (height - videoHeight * scale) / 2;
  return landmarks.map(p => ({ x: width - (p.x * videoWidth * scale + cropX), y: p.y * videoHeight * scale + cropY }));
}

export class HandOverlay {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.context = canvas.getContext('2d');
    this.landmarks = null;
    this.canvas.dataset.tracked = 'false';
    this.resizeObserver = new ResizeObserver(() => this.draw());
    this.resizeObserver.observe(canvas);
  }
  update(landmarks) {
    this.landmarks = landmarks;
    this.draw();
  }
  clear() {
    this.landmarks = null;
    this.canvas.dataset.tracked = 'false';
    this.context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
  draw() {
    const ctx = this.context;
    if (!ctx) return;
    const { width, height } = this.canvas.getBoundingClientRect();
    const points = projectHand(this.landmarks, this.video.videoWidth, this.video.videoHeight, width, height);
    if (!points) {
      this.canvas.dataset.tracked = 'false';
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffa6d6';
    ctx.lineWidth = 1.05;
    ctx.shadowColor = '#ff61b9';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    for (const [from, to] of CONNECTIONS) {
      ctx.moveTo(points[from].x, points[from].y);
      ctx.lineTo(points[to].x, points[to].y);
    }
    ctx.stroke();
    for (let i = 0; i < points.length; i++) {
      const p = points[i], tip = TIPS.has(i);
      if (tip) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffc2e171'; ctx.lineWidth = .65; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, tip ? 1.65 : 1.15, 0, Math.PI * 2);
      ctx.fillStyle = tip ? '#fff2fb' : '#ffbadf';
      ctx.shadowBlur = tip ? 6 : 3;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    this.canvas.dataset.tracked = 'true';
  }
}
