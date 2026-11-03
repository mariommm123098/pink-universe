const COUNTDOWN = ['three', 'two', 'one'];
const ROMANCE = ['love', 'name', 'surprise'];

/** Complete the opening countdown once, then rearm romance only with an open palm. */
export class RomanceSequence {
  constructor() {
    this.next = 0;
    this.armed = true;
    this.scene = 'welcome';
    this.countdownStep = 0;
  }

  get countdownComplete() { return this.countdownStep === COUNTDOWN.length; }
  get expectedNumber() { return [3, 2, 1][this.countdownStep] ?? null; }

  accept(gesture) {
    if (gesture === 'open') { this.armed = true; this.scene = 'scatter'; return { scene: this.scene, index: this.next, armed: true }; }

    if (!this.countdownComplete) {
      // Fists, out-of-order numbers and tracking gaps cannot consume or reset a step.
      if (gesture !== COUNTDOWN[this.countdownStep]) return null;
      this.countdownStep += 1;
      this.scene = gesture;
      return { scene: this.scene, index: this.next, armed: this.armed };
    }

    if (gesture === 'fist') {
      if (!this.armed) return null;
      this.armed = false;
      this.scene = ROMANCE[this.next];
      this.next = (this.next + 1) % ROMANCE.length;
      return { scene: this.scene, index: this.next, armed: false };
    }
    if (['one','two','three'].includes(gesture)) { this.scene = gesture; return { scene: gesture, index: this.next, armed: this.armed }; }
    return null;
  }
}
