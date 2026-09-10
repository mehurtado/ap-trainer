import { audioEngine } from '../audio/AudioEngine.js';
import { chromaOctaveToHz, nearestSample, INSTRUMENTS } from '../audio/constants.js';

export async function playStimulus(trial) {
  await audioEngine.resume();
  const ctx = audioEngine.ctx;
  if (!ctx || ctx.state !== 'running') throw new Error('Audio is unavailable. Please try again.');

  // Resolve and decode the sample (if any) BEFORE computing the scheduled
  // start time — a cache-miss fetch+decode can take far longer than the
  // pre-roll below, and computing `start` first would report an onset that
  // audio has already missed.
  let buf = null, detuneOffset = 0, sampleId = null, onsetOffsetSec = 0;
  if (INSTRUMENTS.includes(trial.timbre)) {
    const near = nearestSample(trial.timbre, trial.target_pitch, trial.octave);
    detuneOffset = near.detuneOffset;
    buf = await audioEngine.loadSample(trial.timbre, near.chroma, near.octave);
    if (buf) {
      sampleId = `${trial.timbre}/${near.chroma}${near.octave}`;
      onsetOffsetSec = audioEngine.getOnsetOffset(trial.timbre, near.chroma, near.octave);
    }
  }
  const totalDetuneCents = detuneOffset + (trial.detuning || 0);
  // detune changes playback rate; scale the measured (sample-time) offset
  // to real time so the perceptual onset still lands on the reported time.
  const scaledOffsetSec = onsetOffsetSec / Math.pow(2, totalDetuneCents / 1200);

  // The pre-roll must cover the (detune-scaled) leading-silence offset we're
  // about to schedule the sample early by, or src.start() below would be
  // called with a time already in the past.
  const start = ctx.currentTime + Math.max(.08, scaledOffsetSec + .02),
    stamp = ctx.getOutputTimestamp?.();
  const onset = stamp?.contextTime > 0 ? stamp.performanceTime + (start - stamp.contextTime) * 1000 : performance.now() + (start - ctx.currentTime + (ctx.baseLatency || 0)) * 1000;
  const timing_method = stamp?.contextTime > 0 ? 'output-timestamp' : 'audio-clock-plus-base-latency';

  if (buf) {
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buf;
    src.detune.value = totalDetuneCents;
    gain.gain.value = .8;
    gain.gain.setValueAtTime(.8, start + .65);
    gain.gain.linearRampToValueAtTime(0, start + .8);
    src.connect(gain);
    gain.connect(audioEngine.masterGain);
    // Start early by the (rate-scaled) leading-silence/attack offset so the
    // audible onset — not frame 0 of the buffer — lands at `start`.
    src.start(start - scaledOffsetSec);
    src.stop(start + .81);
  } else {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.frequency.value = chromaOctaveToHz(trial.target_pitch, trial.octave, trial.detuning || 0);
    if (trial.timbre === 'held-out-harmonics') osc.setPeriodicWave(ctx.createPeriodicWave(new Float32Array(6), new Float32Array([0, 1, .3, .2, .1, .05])));
    else osc.type = 'sine';
    // Match the legacy sine-playback level (AudioEngine.playSine's default)
    // rather than an arbitrary quieter value, so oscillator-timbre trials
    // aren't a systematically quieter condition than the .8-gain sample trials.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(.5, start + .01);
    gain.gain.setValueAtTime(.5, start + .65);
    gain.gain.linearRampToValueAtTime(0, start + .8);
    osc.connect(gain);
    gain.connect(audioEngine.masterGain);
    osc.start(start);
    osc.stop(start + .81);
  }

  return {
    onset,
    timing_method,
    sampleId,
    sampleOnsetOffsetMs: scaledOffsetSec * 1000
  };
}
