const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** A purely visual instrument. It never emits a gesture or advances the story. */
export class InteractionField {
  constructor() {
    this.charge = 0;
    this.presence = 0;
    this.still = 0;
    this.reacquire = 0;
    this.active = false;
    this.lastRelease = -100;
    this.serial = 0;
    this.waves = Array.from({ length: 4 }, () => ({ x: 0, y: 0, at: -100, strength: 0 }));
  }
  update({ dt, time, speed, x, y, active }) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, .1);
    speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    active = Boolean(active && Number.isFinite(x) && Number.isFinite(y));
    if (active && !this.active) this.reacquire = .45;
    this.active = active;
    this.reacquire = Math.max(0, this.reacquire - dt);
    this.presence += ((active ? 1 : 0) - this.presence) * (1 - Math.exp(-dt * 5));
    if (!active || this.reacquire > 0) {
      this.still = 0;
      this.charge *= Math.exp(-dt * 5);
      return null;
    }
    let wave = null;
    if (speed > .64 && this.charge > .34 && time - this.lastRelease > 1.1) {
      wave = this.waves[this.serial++ % this.waves.length];
      Object.assign(wave, { x: clamp(x, -1, 1) * 4.6, y: clamp(y, -1, 1) * 2.8, at: time, strength: this.charge });
      this.lastRelease = time;
      this.charge = 0;
      this.still = 0;
    }
    if (speed < .20) this.still += dt;
    else this.still = Math.max(0, this.still - dt * 2.8);
    const target = clamp((this.still - .35) / 1.65);
    this.charge += (target - this.charge) * (1 - Math.exp(-dt * (target > this.charge ? 2.6 : 1.8)));
    return wave;
  }
}

// Shared by points, glass petals and ripple light. Fixed four-wave budget.
export const fieldGLSL = /* glsl */`
uniform vec4 uWaves[4];
uniform float uCharge,uHandPresence;
float fieldWave(vec2 point,float time){
  float wave=0.;
  for(int i=0;i<4;i++){
    float age=time-uWaves[i].z;
    float d=length(point-uWaves[i].xy);
    float shell=d-age*3.8;
    float alive=step(0.,age)*(1.-smoothstep(1.6,3.3,age));
    wave+=sin(shell*5.5)*exp(-shell*shell*2.1)*uWaves[i].w*alive;
  }
  return wave;
}
`;
