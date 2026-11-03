/** Geometric single-hand classifier. All thresholds are relative to palm size. */
export const GESTURES = { OPEN: 'open', ONE: 'one', TWO: 'two', THREE: 'three', FIST: 'fist', UNKNOWN: 'unknown' };
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
const ramp = (v, a, b) => clamp((v - a) / (b - a));
function angle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z ?? 0) - (b.z ?? 0)];
  const d = Math.hypot(...u) * Math.hypot(...v);
  return d < 1e-8 ? 0 : Math.acos(clamp(u.reduce((s, n, i) => s + n * v[i], 0) / d, -1, 1)) * 180 / Math.PI;
}
function extension(p, mcp, pip, dip, tip, palmSize) {
  const straight = ramp(angle(p[mcp], p[pip], p[dip]), 110, 166);
  const end = ramp(angle(p[pip], p[dip], p[tip]), 112, 164);
  // Projection-independent: a bent finger can point upward too. Use joints + reach.
  const reach = ramp((distance(p[tip], p[mcp]) - distance(p[pip], p[mcp])) / palmSize, 0.04, 0.42);
  return straight * 0.43 + end * 0.22 + reach * 0.35;
}
function projectedThree(landmarks, aspect) {
  // Screen x/y remain useful when touching fingertips occlude one another and
  // the model separates their world z. Use this only for a broad, visible palm.
  const p = landmarks.map(v => ({ x: v.x * aspect, y: v.y, z: 0 }));
  const width = distance(p[5], p[17]), length = distance(p[0], p[9]);
  const palm = (width + length) / 2;
  if (width < .012 || length < .012) return null;
  const across = { x: (p[17].x - p[5].x) / width, y: (p[17].y - p[5].y) / width };
  const forward = { x: (p[9].x - p[0].x) / length, y: (p[9].y - p[0].y) / length };
  const palmArea = Math.abs(across.x * forward.y - across.y * forward.x);
  if (palm < .012 || width / length < .55 || palmArea < .5) return null;
  const advance = (a, b) => ((p[b].x - p[a].x) * forward.x + (p[b].y - p[a].y) * forward.y) / palm;
  const extended = [[5,6,7,8],[9,10,11,12],[13,14,15,16]].map(ids => extension(p, ...ids, palm));
  // Three long visible fingers, not a thumb/index/middle count or foreshortened curls.
  const threeLong = extended.every((v, i) => v > .7 && advance(5 + i * 4, 8 + i * 4) > .62 && advance(6 + i * 4, 8 + i * 4) > .22);
  const pinky = extension(p, 17, 18, 19, 20, palm);
  const pinkyAdvance = advance(18, 20);
  const curledPinky = pinky < .74 && pinkyAdvance < .25 && distance(p[20], p[17]) / palm < .88 && Math.min(angle(p[17], p[18], p[19]), angle(p[18], p[19], p[20])) < 153;
  const gap = distance(p[4], p[20]) / palm;
  const thumbInward = ((p[4].x - p[2].x) * across.x + (p[4].y - p[2].y) * across.y) / palm;
  // A hook may bend at CMC/MCP while the distal thumb segment stays almost straight.
  const thumbBent = angle(p[0], p[1], p[2]) < 155 || angle(p[1], p[2], p[3]) < 165 || angle(p[2], p[3], p[4]) < 168;
  const hookedThumb = thumbInward > .25 && gap < .7 && (thumbBent || gap < .38 && thumbInward > .55);
  if (!threeLong || !curledPinky || !hookedThumb) return null;
  const curl = clamp((.4 - pinkyAdvance) / .5);
  return .2 + .8 * (.65 * Math.min(...extended) + .2 * curl + .15 * (1 - clamp(gap / .95)));
}
export function classifyHand(landmarks, worldLandmarks = null, aspect = 4 / 3) {
  if (!Array.isArray(landmarks) || landmarks.length !== 21 || landmarks.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z ?? 0))) return { gesture: 'unknown', confidence: 0 };
  aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
  const hasWorld = Array.isArray(worldLandmarks) && worldLandmarks.length === 21 && worldLandmarks.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  const p = hasWorld ? worldLandmarks : landmarks.map(v => ({ x: v.x * aspect, y: v.y, z: (v.z ?? 0) * aspect }));
  const palmSize = (distance(p[5], p[17]) + distance(p[0], p[9])) / 2;
  if (palmSize < 0.012) return { gesture: 'unknown', confidence: 0 };
  const [index, middle, ring, pinky] = [[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]].map(ids => extension(p, ...ids, palmSize));
  const center = { x: (p[0].x + p[5].x + p[9].x + p[17].x) / 4, y: (p[0].y + p[5].y + p[9].y + p[17].y) / 4, z: ((p[0].z ?? 0) + (p[5].z ?? 0) + (p[9].z ?? 0) + (p[17].z ?? 0)) / 4 };
  const thumbRadius = distance(p[4], center) / palmSize;
  const thumbSpread = distance(p[4], p[5]) / palmSize;
  const thumbAngle = angle(p[2], p[3], p[4]);
  const thumbOut = thumbRadius > 0.94 && thumbSpread > 0.65 && thumbAngle > 145;
  const thumbPinkyGap = distance(p[4], p[20]) / palmSize;
  const thumbTucked = !thumbOut || thumbRadius < 1.02;
  const ext = [index, middle, ring, pinky];
  let gesture = 'unknown', confidence = 0, threeEvidence = null, projectionConfidence;
  // The specified 3: ONLY index + middle + ring extended; thumb & little finger bent,
  // with tips close (up to .82 palm lengths, accommodating an imperfect contact).
  const hookedThumb = thumbAngle < 168 || thumbRadius < 0.94;
  if (index > .68 && middle > .68 && ring > .66 && pinky < .48 && thumbPinkyGap < .82 && hookedThumb) {
    gesture = 'three'; confidence = .2 + .8 * (.72 * Math.min(index, middle, ring) + .18 * (1 - pinky) + .10 * (1 - clamp(thumbPinkyGap / 1.25))); threeEvidence = 'world';
  } else if ((projectionConfidence = projectedThree(landmarks, aspect)) !== null) {
    gesture = 'three'; confidence = projectionConfidence; threeEvidence = 'projection';
  } else if (ext.every(v => v > .66) && thumbRadius > .78 && thumbSpread > .5) {
    gesture = 'open'; confidence = Math.min(...ext) * .88 + .12;
  } else if (index > .7 && middle > .69 && ring < .4 && pinky < .4 && thumbTucked) {
    gesture = 'two'; confidence = .2 + .8 * Math.min(index, middle, 1 - ring, 1 - pinky);
  } else if (index > .7 && middle < .4 && ring < .4 && pinky < .4 && thumbTucked) {
    gesture = 'one'; confidence = .2 + .8 * Math.min(index, 1 - middle, 1 - ring, 1 - pinky);
  } else if (ext.every(v => v < .36) && thumbRadius < 1.1 && !thumbOut) {
    gesture = 'fist'; confidence = .2 + .8 * (1 - Math.max(...ext));
  }
  return { gesture, confidence: clamp(confidence), fingers: { index, middle, ring, pinky }, thumbPinkyGap, thumbRadius, threeEvidence };
}

/** Evidence confirmation + hysteresis; missing hands never synthesize a gesture. */
export class GestureStabilizer {
  constructor() { this.reset(); }
  reset() { this.candidate = 'unknown'; this.since = 0; this.frames = 0; this.stable = 'unknown'; this.lastSeen = -Infinity; this.lastSample = -Infinity; }
  update(result, now) {
    const gap = now - this.lastSample;
    this.lastSample = now;
    if (gap > 210) { this.candidate = 'unknown'; this.frames = 0; this.since = now; }
    if (!result || result.gesture === 'unknown' || result.confidence < .68) {
      this.candidate = 'unknown'; this.frames = 0;
      return { gesture: this.stable, changed: false, progress: 0 };
    }
    this.lastSeen = now;
    if (result.gesture !== this.candidate) { this.candidate = result.gesture; this.since = now; this.frames = 1; }
    else this.frames++;
    const duration = result.gesture === 'fist' ? 170 : result.gesture === 'open' ? 110 : 120;
    const minimumSamples = result.gesture === 'fist' ? 4 : 3;
    const progress = Math.min(1, (now - this.since) / duration);
    if (progress >= 1 && this.frames >= minimumSamples && this.stable !== this.candidate) {
      this.stable = this.candidate;
      return { gesture: this.stable, changed: true, progress: 1 };
    }
    return { gesture: this.stable, changed: false, progress };
  }
}
export function mirroredPalm(landmarks) {
  const ids = [0, 5, 9, 13, 17];
  const x = ids.reduce((n, i) => n + landmarks[i].x, 0) / ids.length;
  const y = ids.reduce((n, i) => n + landmarks[i].y, 0) / ids.length;
  return { x: clamp((1 - x - .5) * 2, -1, 1), y: clamp((.5 - y) * 2, -1, 1) };
}
