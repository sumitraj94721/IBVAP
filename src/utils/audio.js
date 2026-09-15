// Web Audio API Synthetic Sound Generator for IBVAP Tactical Command Center
// Requires no external audio files - 100% self-contained and stable

class SoundManager {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
    this.sirenInterval = null;
    this.isSirenActive = false;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.isSirenActive) {
      this.stopSiren();
    }
    return this.isMuted;
  }

  // Tactical subtle radar blip
  playRadarPing() {
    if (this.isMuted) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1450, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(720, ctx.currentTime + 0.12);

      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.13);
    } catch (e) {
      console.warn('Audio playRadarPing error:', e);
    }
  }

  // Alert ping for new detected threat
  playAlertChime(severity = 'HIGH') {
    if (this.isMuted) return;
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = severity === 'CRITICAL' ? 'sawtooth' : 'triangle';
      const baseFreq = severity === 'CRITICAL' ? 880 : severity === 'HIGH' ? 660 : 440;

      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.setValueAtTime(baseFreq * 1.5, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn('Audio playAlertChime error:', e);
    }
  }

  // Tactical Emergency Siren for drill / critical alerts
  toggleSiren(onStateChange) {
    if (this.isSirenActive) {
      this.stopSiren();
      if (onStateChange) onStateChange(false);
      return false;
    } else {
      this.startSiren();
      if (onStateChange) onStateChange(true);
      return true;
    }
  }

  startSiren() {
    if (this.isSirenActive) return;
    this.isSirenActive = true;
    if (this.isMuted) return;

    const playCycle = () => {
      try {
        const ctx = this.getAudioContext();
        if (!ctx || !this.isSirenActive || this.isMuted) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(950, ctx.currentTime + 0.4);
        osc.frequency.linearRampToValueAtTime(500, ctx.currentTime + 0.8);

        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.8);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      } catch (e) {
        console.warn('Siren cycle error:', e);
      }
    };

    playCycle();
    this.sirenInterval = setInterval(playCycle, 850);
  }

  stopSiren() {
    this.isSirenActive = false;
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
  }
}

export const soundManager = new SoundManager();
