// One transition definition is used by the GPU and by snapshots when a new
// gesture interrupts a morph. Ambient motion stays in the shader, applied once.
const TAU = Math.PI * 2;
const ARC_X = .65, ARC_Y = .5, ARC_Z = 1.4;
const STAGGER = .10;

const profile = (duration, arc, rise = 0, curl = 0) => Object.freeze({ duration, arc, rise, curl, stagger: STAGGER });
const digit = profile(.78, .26);
const fallback = profile(.9, .6);
const profiles = Object.freeze({
  one: digit, two: digit, three: digit,
  scatter: profile(.9, .7, 0, .32),
  love: profile(1.05, .6, 0, -.25),
  name: profile(1.18, .6, .58, .10),
  surprise: profile(1.38, .66, .55, .44),
});

export function motionForScene(mode) { return profiles[mode] || fallback; }

export const transitionGLSL = `
vec3 transitionPosition(vec3 from,vec3 target,vec3 seed,float elapsed,float duration,float stagger,float arcScale,float rise,float curl){
  float t=clamp((elapsed-seed.x*stagger)/duration,0.,1.);
  float remaining=1.-t;
  float e=1.-remaining*remaining*remaining;
  float arc=(t>0. && t<1.)?sin(e*${Math.PI}):0.;
  vec3 p=from+(target-from)*e;
  float turn=curl*arc*(.35+seed.z*.65);
  p.xy=mat2(cos(turn),sin(turn),-sin(turn),cos(turn))*p.xy;
  p.x+=sin(e*${TAU}+seed.y*${TAU})*arc*${ARC_X}*arcScale;
  p.y+=cos(e*${Math.PI}+seed.z*${TAU})*arc*${ARC_Y}*arcScale-rise*arc*(.8+seed.y*1.5);
  p.z+=sin(e*${Math.PI}+seed.x*${TAU})*arc*${ARC_Z}*arcScale;
  return p;
}`;

export function sampleTransitionBuffer(from, target, seeds, elapsed, { duration, stagger, arc: arcScale, rise, curl = 0 }) {
  const positions = new Float32Array(from.length);
  for (let j = 0; j < from.length; j += 3) {
    const t = Math.max(0, Math.min(1, (elapsed - seeds[j] * stagger) / duration));
    const remaining = 1 - t, e = 1 - remaining * remaining * remaining;
    const arc = t > 0 && t < 1 ? Math.sin(e * Math.PI) : 0;
    positions[j] = from[j] + (target[j] - from[j]) * e + Math.sin(e * TAU + seeds[j + 1] * TAU) * arc * ARC_X * arcScale;
    positions[j + 1] = from[j + 1] + (target[j + 1] - from[j + 1]) * e + Math.cos(e * Math.PI + seeds[j + 2] * TAU) * arc * ARC_Y * arcScale - rise * arc * (.8 + seeds[j + 1] * 1.5);
    const turn = curl * arc * (.35 + seeds[j + 2] * .65);
    const bx = from[j] + (target[j] - from[j]) * e;
    const by = from[j + 1] + (target[j + 1] - from[j + 1]) * e;
    positions[j] += bx * (Math.cos(turn) - 1) - by * Math.sin(turn);
    positions[j + 1] += bx * Math.sin(turn) + by * (Math.cos(turn) - 1);
    positions[j + 2] = from[j + 2] + (target[j + 2] - from[j + 2]) * e + Math.sin(e * Math.PI + seeds[j] * TAU) * arc * ARC_Z * arcScale;
  }
  return positions;
}
