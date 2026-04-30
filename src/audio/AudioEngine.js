import {
  INSTRUMENTS, INSTRUMENT_REGISTERS, CHROMAS, chromaOctaveToHz,
  samplePath, nearestSample, midiToHz, CHROMA_TO_MIDI_BASE
} from './constants.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sampleCache = {};
    this.masterGain = null;
  }

  // Must be called synchronously from a user gesture (button click)
  initSync() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  async init() {
    this.initSync();
  }

  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ── Sample loading ─────────────────────────────────────────────────────────

  async loadSample(instrumentId, chroma, octave) {
    const key = `${instrumentId}/${chroma}${octave}`;
    if (this.sampleCache[key]) return this.sampleCache[key];

    const path = samplePath(instrumentId, chroma, octave);
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
      this.sampleCache[key] = audioBuf;
      return audioBuf;
    } catch (e) {
      return null;
    }
  }

  async preloadInstrument(instrumentId) {
    const reg = INSTRUMENT_REGISTERS[instrumentId];
    const promises = [];
    for (let oct = reg.min; oct <= reg.max; oct++) {
      for (const chroma of CHROMAS) {
        promises.push(this.loadSample(instrumentId, chroma, oct));
      }
    }
    await Promise.allSettled(promises);
  }

  // ── Noise buffers ──────────────────────────────────────────────────────────

  _makeWhiteNoiseBuffer(durationSec) {
    const sampleRate = this.ctx.sampleRate;
    const frameCount = Math.ceil(sampleRate * durationSec);
    const buf = this.ctx.createBuffer(1, frameCount, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _makePinkNoiseBuffer(durationSec) {
    const sampleRate = this.ctx.sampleRate;
    const frameCount = Math.ceil(sampleRate * durationSec);
    const buf = this.ctx.createBuffer(1, frameCount, sampleRate);
    const data = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + white*0.0555179;
      b1 = 0.99332*b1 + white*0.0750759;
      b2 = 0.96900*b2 + white*0.1538520;
      b3 = 0.86650*b3 + white*0.3104856;
      b4 = 0.55000*b4 + white*0.5329522;
      b5 = -0.7616*b5 - white*0.0168980;
      data[i] = (b0+b1+b2+b3+b4+b5+b6 + white*0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buf;
  }

  _makeBrownNoiseBuffer(durationSec) {
    const sampleRate = this.ctx.sampleRate;
    const frameCount = Math.ceil(sampleRate * durationSec);
    const buf = this.ctx.createBuffer(1, frameCount, sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  // ── Playback primitives ────────────────────────────────────────────────────

  _playBuffer(buf, startTime, gainValue = 1.0, dest = null) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    src.connect(g);
    g.connect(dest || this.masterGain);
    src.start(startTime);
    return src;
  }

  // Play sine wave at given Hz
  playSine(hz, startTime, durationSec, gainValue = 0.5) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const g = this.ctx.createGain();
    g.gain.value = gainValue;
    // Short fade in/out to avoid clicks
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(gainValue, startTime + 0.01);
    g.gain.setValueAtTime(gainValue, startTime + durationSec - 0.02);
    g.gain.linearRampToValueAtTime(0, startTime + durationSec);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(startTime);
    osc.stop(startTime + durationSec);
    return osc;
  }

  // Play instrument sample with optional cent offset
  async playInstrumentSample(instrumentId, chroma, octave, startTime, durationSec = 1.5, centOffset = 0) {
    const { chroma: nearChroma, octave: nearOctave, detuneOffset } =
      nearestSample(instrumentId, chroma, octave);
    const buf = await this.loadSample(instrumentId, nearChroma, nearOctave);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.detune.value = detuneOffset + centOffset;
    const g = this.ctx.createGain();
    g.gain.value = 0.8;
    g.gain.setValueAtTime(0.8, startTime + durationSec - 0.05);
    g.gain.linearRampToValueAtTime(0, startTime + durationSec);
    src.connect(g);
    g.connect(this.masterGain);
    src.start(startTime);
    return src;
  }

  // Play sample with noise overlay (noise-masked stimulus)
  async playNoiseMasked(instrumentId, chroma, octave, startTime, durationSec, noiseType = 'white', noiseDb = 7) {
    const instrumentSrc = await this.playInstrumentSample(instrumentId, chroma, octave, startTime, durationSec);

    const noiseBuf = noiseType === 'pink'
      ? this._makePinkNoiseBuffer(durationSec)
      : this._makeWhiteNoiseBuffer(durationSec);

    // noiseDb below instrument — linear gain from dB difference
    const noiseGain = Math.pow(10, -noiseDb / 20) * 0.4;
    this._playBuffer(noiseBuf, startTime, noiseGain);
    return instrumentSrc;
  }

  // ── Buffer wipe state machine ──────────────────────────────────────────────

  // Brown noise with center notch at targetHz
  _playNotchedBrownNoise(startTime, durationSec, targetHz) {
    const buf = this._makeBrownNoiseBuffer(durationSec);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const notch = this.ctx.createBiquadFilter();
    notch.type = 'notch';
    notch.frequency.value = targetHz;
    notch.Q.value = 12;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(notch);
    notch.connect(g);
    g.connect(this.masterGain);
    src.start(startTime);
    src.stop(startTime + durationSec);
  }

  _playKeySpam(startTime, count = 10, stopTime = null) {
    const stop = stopTime || (startTime + 1.5);
    for (let i = 0; i < count; i++) {
      const inst = INSTRUMENTS[Math.floor(Math.random() * INSTRUMENTS.length)];
      const reg = INSTRUMENT_REGISTERS[inst];
      const oct = reg.min + Math.floor(Math.random() * (reg.max - reg.min + 1));
      const chroma = CHROMAS[Math.floor(Math.random() * CHROMAS.length)];
      const noteStart = startTime + Math.random() * 0.3;
      const hz = chromaOctaveToHz(chroma, oct);
      const { chroma: nearChroma, octave: nearOct, detuneOffset } = nearestSample(inst, chroma, oct);
      this.loadSample(inst, nearChroma, nearOct).then(buf => {
        if (buf) {
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          src.detune.value = detuneOffset;
          const g = this.ctx.createGain();
          g.gain.value = 0.12;
          src.connect(g);
          g.connect(this.masterGain);
          src.start(noteStart);
          src.stop(stop);
        } else {
          this.playSine(hz, noteStart, Math.max(0.1, stop - noteStart), 0.08);
        }
      });
    }
  }

  _playWhiteNoiseSegment(startTime, durationSec) {
    const buf = this._makeWhiteNoiseBuffer(durationSec);
    this._playBuffer(buf, startTime, 0.3);
  }

  _playRandomMelody(startTime, durationSec, instrumentId) {
    const notesPerSec = 4;
    const totalNotes = Math.floor(durationSec * notesPerSec);
    const melodyEnd = startTime + durationSec;
    const reg = INSTRUMENT_REGISTERS[instrumentId];
    for (let i = 0; i < totalNotes; i++) {
      const noteTime = startTime + i / notesPerSec;
      const chroma = CHROMAS[Math.floor(Math.random() * CHROMAS.length)];
      const oct = reg.min + Math.floor(Math.random() * (reg.max - reg.min + 1));
      const hz = chromaOctaveToHz(chroma, oct);
      const { chroma: nearChroma, octave: nearOct, detuneOffset } = nearestSample(instrumentId, chroma, oct);
      this.loadSample(instrumentId, nearChroma, nearOct).then(buf => {
        if (buf) {
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          src.detune.value = detuneOffset;
          const g = this.ctx.createGain();
          g.gain.value = 0.25;
          src.connect(g);
          g.connect(this.masterGain);
          src.start(noteTime);
          src.stop(melodyEnd);
        } else {
          this.playSine(hz, noteTime, Math.max(0.1, melodyEnd - noteTime), 0.18);
        }
      });
    }
  }

  // Full 10-second buffer wipe. Returns the scheduled end time.
  runBufferWipe(targetHz, instrumentId) {
    const t = this.ctx.currentTime + 0.05;

    // 0–2s: notched brown noise
    this._playNotchedBrownNoise(t, 2, targetHz);
    // 2–3s: key spam 1
    this._playKeySpam(t + 2, 10, t + 3);
    // 3–5s: white noise
    this._playWhiteNoiseSegment(t + 3, 2);
    // 5–7s: random melodic sequence
    this._playRandomMelody(t + 5, 2, instrumentId);
    // 7–8s: key spam 2
    this._playKeySpam(t + 7, 10, t + 8);
    // 8–10s: notched brown noise
    this._playNotchedBrownNoise(t + 8, 2, targetHz);

    return t + 10;
  }

  // Short 5-second noise purge (post-failure correction)
  runNoisePurge() {
    const t = this.ctx.currentTime + 0.05;
    this._playWhiteNoiseSegment(t, 2.5);
    this._playKeySpam(t + 2.5, 8);
    return t + 5;
  }

  // Play the target note clearly (optional post-correction reveal)
  async playCorrectNote(chroma, octave, instrumentId) {
    const t = this.ctx.currentTime + 0.05;
    await this.playInstrumentSample(instrumentId, chroma, octave, t, 2);
  }
}

export const audioEngine = new AudioEngine();
