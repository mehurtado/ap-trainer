const { performance } = require('perf_hooks');

const trials = [];
for (let i = 0; i < 100000; i++) {
  trials.push({
    result_bool: Math.random() > 0.5,
    sine_wave_flag: Math.random() > 0.8,
    timeout_flag: Math.random() > 0.9,
    user_guess: Math.random() > 0.95 ? 'TIMEOUT' : 'C',
    latency_ms: Math.random() > 0.1 ? Math.floor(Math.random() * 5000) : null,
    second_instinct_flag: Math.random() > 0.7,
    second_instinct_note: 'C',
    target_chroma: Math.random() > 0.5 ? 'C' : 'D',
  });
}

function originalStats() {
  const totalTrials   = trials.length;
  const correctTrials = trials.filter(t => t.result_bool).length;
  const overallAcc    = totalTrials
    ? (correctTrials / totalTrials * 100).toFixed(1) : '--';

  const sineTrials = trials.filter(t => t.sine_wave_flag);
  const sineAcc    = sineTrials.length
    ? (sineTrials.filter(t => t.result_bool).length / sineTrials.length * 100).toFixed(1) : '--';

  const timeouts    = trials.filter(t => t.timeout_flag || t.user_guess === 'TIMEOUT').length;
  const timeoutFreq = totalTrials
    ? (timeouts / totalTrials * 100).toFixed(1) : '--';

  const validRt      = trials.filter(t => typeof t.latency_ms === 'number' && t.latency_ms > 0 && !t.timeout_flag);
  const avgRt        = validRt.length
    ? Math.round(validRt.reduce((s, t) => s + t.latency_ms, 0) / validRt.length) : '--';
  const validRtCorr  = validRt.filter(t => t.result_bool);
  const avgRtCorrect = validRtCorr.length
    ? Math.round(validRtCorr.reduce((s, t) => s + t.latency_ms, 0) / validRtCorr.length) : '--';

  const siTrials = trials.filter(t => t.second_instinct_flag === true);
  const siAcc    = siTrials.length
    ? (siTrials.filter(t => t.second_instinct_note === t.target_chroma).length / siTrials.length * 100).toFixed(1)
    : '--';

  return { totalTrials, overallAcc, sineAcc, timeoutFreq, avgRt, avgRtCorrect, siAcc };
}

function optimizedStats() {
  let correctTrials = 0;
  let sineTotal = 0;
  let sineCorrect = 0;
  let timeouts = 0;
  let validRtTotal = 0;
  let validRtSum = 0;
  let validRtCorrTotal = 0;
  let validRtCorrSum = 0;
  let siTotal = 0;
  let siCorrect = 0;

  for (let i = 0; i < trials.length; i++) {
    const t = trials[i];
    if (t.result_bool) correctTrials++;

    if (t.sine_wave_flag) {
      sineTotal++;
      if (t.result_bool) sineCorrect++;
    }

    if (t.timeout_flag || t.user_guess === 'TIMEOUT') {
      timeouts++;
    }

    if (typeof t.latency_ms === 'number' && t.latency_ms > 0 && !t.timeout_flag) {
      validRtTotal++;
      validRtSum += t.latency_ms;
      if (t.result_bool) {
        validRtCorrTotal++;
        validRtCorrSum += t.latency_ms;
      }
    }

    if (t.second_instinct_flag === true) {
      siTotal++;
      if (t.second_instinct_note === t.target_chroma) {
        siCorrect++;
      }
    }
  }

  const totalTrials = trials.length;
  const overallAcc = totalTrials ? (correctTrials / totalTrials * 100).toFixed(1) : '--';
  const sineAcc = sineTotal ? (sineCorrect / sineTotal * 100).toFixed(1) : '--';
  const timeoutFreq = totalTrials ? (timeouts / totalTrials * 100).toFixed(1) : '--';
  const avgRt = validRtTotal ? Math.round(validRtSum / validRtTotal) : '--';
  const avgRtCorrect = validRtCorrTotal ? Math.round(validRtCorrSum / validRtCorrTotal) : '--';
  const siAcc = siTotal ? (siCorrect / siTotal * 100).toFixed(1) : '--';

  return { totalTrials, overallAcc, sineAcc, timeoutFreq, avgRt, avgRtCorrect, siAcc };
}

// Warmup
for (let i = 0; i < 100; i++) {
  originalStats();
  optimizedStats();
}

let start = performance.now();
for (let i = 0; i < 100; i++) {
  originalStats();
}
const timeOriginal = performance.now() - start;

start = performance.now();
for (let i = 0; i < 100; i++) {
  optimizedStats();
}
const timeOptimized = performance.now() - start;

console.log("Original Time:  ", timeOriginal.toFixed(2), "ms");
console.log("Optimized Time: ", timeOptimized.toFixed(2), "ms");
console.log("Improvement:    ", ((timeOriginal - timeOptimized) / timeOriginal * 100).toFixed(2) + "%");
console.log("Original Output:  ", originalStats());
console.log("Optimized Output: ", optimizedStats());
