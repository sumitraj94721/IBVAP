/**
 * AI Border Surveillance CCTV Command Center (SIH 26187)
 * Tactical Web Audio Synthesizer
 * Generates synthetic radar beeps and threat alert chimes without external audio assets.
 */

class TacticalAudioController {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.lastAlarmTime = 0;
    this.alarmCooldownMs = 3500; // Prevent alarm spamming
  }

  init() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  playTargetLock() {
    if (this.isMuted) return;
    this.init();
    if (!this.audioCtx) return;

    try {
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(1320, this.audioCtx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.05, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.1);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.1);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  }

  playThreatAlarm() {
    if (this.isMuted) return;
    const now = Date.now();
    if (now - this.lastAlarmTime < this.alarmCooldownMs) {
      return; // Respect cooldown
    }
    this.lastAlarmTime = now;
    this.init();
    if (!this.audioCtx) return;

    try {
      const nowCtx = this.audioCtx.currentTime;

      // Pulse 1
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(950, nowCtx);
      osc1.frequency.linearRampToValueAtTime(650, nowCtx + 0.15);
      gain1.gain.setValueAtTime(0.12, nowCtx);
      gain1.gain.exponentialRampToValueAtTime(0.01, nowCtx + 0.18);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(nowCtx);
      osc1.stop(nowCtx + 0.18);

      // Pulse 2
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(950, nowCtx + 0.22);
      osc2.frequency.linearRampToValueAtTime(650, nowCtx + 0.37);
      gain2.gain.setValueAtTime(0.12, nowCtx + 0.22);
      gain2.gain.exponentialRampToValueAtTime(0.01, nowCtx + 0.4);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(nowCtx + 0.22);
      osc2.stop(nowCtx + 0.4);

    } catch (e) {
      console.warn("Alarm audio error:", e);
    }
  }
}

window.tacticalAudio = new TacticalAudioController();
