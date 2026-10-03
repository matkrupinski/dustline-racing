import { displayedGear, MPH_PER_MPS } from './gears.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Sound-only RPM: shares the displayed gearbox, never changes vehicle physics.
export function engineRPM(vehicle, controls) {
  const gear = displayedGear(vehicle);
  const progress = gear === 'R' ? vehicle.speed / 9
    : (vehicle.speed * MPH_PER_MPS - (gear - 1) * 17) / 17;
  const load = gear === 'R' ? controls.brake : controls.throttle;
  return clamp(900 + clamp(vehicle.speed / 4, 0, 1) * 1800
    + clamp(progress, 0, 1) * 3400 + load * 350, 900, 6450);
}

// One persistent engine graph; only short shift/backfire voices allocate nodes.
// Created by a user gesture, so browsers with autoplay restrictions stay silent
// until Start/accelerate/unmute. No external samples or network requests.
export class VehicleAudio {
  constructor(createContext = () => {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return Context ? new Context({ latencyHint: 'interactive' }) : null;
  }) {
    this.createContext = createContext;
    this.context = null;
    this.muted = false;
    this.unavailable = false;
    this.voices = new Set();
    this.pending = null;
    this.shiftUntil = 0;
  }

  async unlock() {
    if (this.muted || this.unavailable) return false;
    try {
      if (!this.context) {
        const context = this.createContext();
        if (!context) { this.unavailable = true; return false; }
        this.context = context;
        this.buildGraph();
      }
      if (this.context.state !== 'running') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      // Audio failure must never prevent a race or be reported as WebGL failure.
      this.reset();
      return false;
    }
  }

  buildGraph() {
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.12;
    this.master.connect(compressor).connect(ctx.destination);

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 450;
    this.engineFilter.Q.value = 0.55;
    // Cut inaudible sub-bass, then emphasize the useful low exhaust body.
    const subCut = ctx.createBiquadFilter(), bass = ctx.createBiquadFilter();
    subCut.type = 'highpass'; subCut.frequency.value = 28; subCut.Q.value = 0.5;
    bass.type = 'lowshelf'; bass.frequency.value = 170; bass.gain.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(subCut).connect(bass).connect(this.engineGain).connect(this.master);

    // Smooth low harmonics replace the old sharp, saw-like firing buzz. A strong
    // sine rumble stays audible at idle instead of dropping below hearing range.
    const real = new Float32Array(6), imaginary = new Float32Array([0, 1, 0.22, 0.06, 0.025, 0.01]);
    this.engine = ctx.createOscillator();
    this.engine.setPeriodicWave(ctx.createPeriodicWave(real, imaginary));
    this.engine.frequency.value = 900 / 42;
    this.engine.connect(this.engineFilter);
    this.rumble = ctx.createOscillator();
    this.rumble.type = 'sine';
    this.rumble.frequency.value = 45 + 900 / 110;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.95;
    this.rumble.connect(rumbleGain).connect(this.engineFilter);

    this.noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    this.mechanical = ctx.createBufferSource();
    this.mechanical.buffer = this.noiseBuffer;
    this.mechanical.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'lowpass';
    this.noiseFilter.Q.value = 0.5;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.mechanical.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);
    this.engine.start(); this.rumble.start(); this.mechanical.start();
  }

  trigger(direction) {
    if (!this.muted && this.context?.state === 'running' && (direction === 'up' || direction === 'down')) {
      this.pending = direction;
    }
  }

  update(vehicle, controls, active) {
    if (!this.context || !this.master) return;
    if (!active || this.muted) { this.reset(); return; }
    const now = this.context.currentTime;
    // Discard bursts while the browser has interrupted/suspended audio.
    if (this.context.state !== 'running') { this.pending = null; return; }
    if (this.pending) {
      const direction = this.pending;
      this.pending = null;
      this.shiftDirection = direction;
      this.shiftUntil = now + (direction === 'down' ? 0.12 : 0.085);
      this.playShift(direction);
    }
    this.updateEngine(vehicle, controls);
  }

  updateEngine(vehicle, controls) {
    const now = this.context.currentTime;
    const shifting = now < this.shiftUntil;
    const rpm = engineRPM(vehicle, controls) + (shifting && this.shiftDirection === 'down' ? 700 : 0);
    const load = vehicle.forwardSpeed < -0.3 ? controls.brake : controls.throttle;
    this.engine.frequency.setTargetAtTime(rpm / 42, now, 0.075);
    this.rumble.frequency.setTargetAtTime(45 + rpm / 110, now, 0.095);
    this.engineFilter.frequency.setTargetAtTime(320 + rpm * 0.075 + load * 160, now, 0.1);
    this.noiseFilter.frequency.setTargetAtTime(220 + rpm * 0.025, now, 0.1);
    this.engineGain.gain.setTargetAtTime((0.12 + load * 0.09) * (shifting ? 0.35 : 1), now, 0.04);
    this.noiseGain.gain.setTargetAtTime(0.007 + load * 0.01, now, 0.06);
    this.master.gain.setTargetAtTime(0.65, now, 0.025);
  }

  // A mechanical click, a broadband exhaust crack and a low falling thump.
  // Downshifts get a longer/louder burst, matching ExhaustEffects' visual cue.
  playShift(direction) {
    const ctx = this.context, now = ctx.currentTime, down = direction === 'down';
    this.noiseVoice(now, 0.07, 450, 0.12, 'bandpass');
    this.noiseVoice(now, down ? 0.23 : 0.15, 1200, down ? 0.45 : 0.28, 'lowpass');
    const boom = ctx.createOscillator(), gain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(down ? 95 : 75, now);
    boom.frequency.exponentialRampToValueAtTime(38, now + 0.16);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(down ? 0.55 : 0.42, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    boom.connect(gain).connect(this.master);
    this.trackVoice(boom, [gain], now, 0.21);
  }

  noiseVoice(now, duration, frequency, volume, type) {
    const ctx = this.context, source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    this.trackVoice(source, [filter, gain], now, duration + 0.01);
  }

  trackVoice(source, nodes, now, duration) {
    // Bounded even if a future caller bypasses the gearbox's shift cooldown.
    if (this.voices.size >= 9) this.stopVoice(this.voices.values().next().value);
    const voice = { source, nodes };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      nodes.forEach((node) => node.disconnect());
      this.voices.delete(voice);
    };
    source.start(now); source.stop(now + duration);
  }

  stopVoice(voice) {
    voice.source.stop();
    voice.source.disconnect();
    voice.nodes.forEach((node) => node.disconnect());
    this.voices.delete(voice);
  }

  reset() {
    this.pending = null;
    this.shiftUntil = 0;
    this.voices.forEach((voice) => this.stopVoice(voice));
    if (!this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.015);
    this.engine.frequency.cancelScheduledValues(now);
    this.engine.frequency.setValueAtTime(900 / 42, now);
    this.rumble.frequency.cancelScheduledValues(now);
    this.rumble.frequency.setValueAtTime(45 + 900 / 110, now);
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.reset();
    else void this.unlock();
  }

  dispose() {
    this.reset();
    if (!this.context) return;
    this.engine?.stop(); this.rumble?.stop(); this.mechanical?.stop();
    void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
  }
}
