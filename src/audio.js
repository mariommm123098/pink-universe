/** Locally synthesized, deliberately quiet. Sound is off until enabled. */
export class AmbientAudio {
  async toggle() {
    if (!this.context) {
      this.context = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.context.createGain(); this.master.gain.value = 0; this.master.connect(this.context.destination);
      [174.614,261.626,349.228,440,523.251].forEach((frequency,i)=>{
        const oscillator=this.context.createOscillator(),gain=this.context.createGain();
        oscillator.type='sine';oscillator.frequency.value=frequency;oscillator.detune.value=i%2?3:-3;
        gain.gain.value=.008/(1+i*.4);oscillator.connect(gain);gain.connect(this.master);oscillator.start();
        const lfo=this.context.createOscillator(),lg=this.context.createGain();lfo.frequency.value=.06+i*.017;lg.gain.value=.002;lfo.connect(lg);lg.connect(gain.gain);lfo.start();
      });
    }
    await this.context.resume(); this.enabled=!this.enabled;
    this.master.gain.setTargetAtTime(this.enabled?.7:0,this.context.currentTime,.9);
    return this.enabled;
  }
  cue(scene) {
    if(!this.enabled||!this.context||document.hidden)return;
    const notes={three:[349.228],two:[440],one:[523.251],love:[349.228,440,523.251],name:[261.626,392,523.251],surprise:[349.228,440,523.251,698.456,880],scatter:[174.614,349.228]}[scene];
    if(!notes)return;
    const now=this.context.currentTime;
    notes.forEach((frequency,i)=>{
      const oscillator=this.context.createOscillator(),gain=this.context.createGain(),at=now+i*.11;
      oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.045/Math.sqrt(notes.length),at+.035);gain.gain.exponentialRampToValueAtTime(.0001,at+2.1);
      oscillator.connect(gain);gain.connect(this.master);oscillator.start(at);oscillator.stop(at+2.2);
      oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
  }
  suspendWhenHidden() { if(this.context) { if(document.hidden)this.context.suspend();else if(this.enabled)this.context.resume(); } }
  dispose() { this.context?.close();this.enabled=false; }
}
