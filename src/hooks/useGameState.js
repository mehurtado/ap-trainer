import { useState, useEffect, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine.js';
import { generateTrial, playTrial } from '../audio/TrialEngine.js';
import { generateProgression, playProgression } from '../audio/ProgressionEngine.js';
import { MatrixStore } from '../audio/ConfusionMatrix.js';
import { CHROMAS, INSTRUMENTS, chromaOctaveToHz } from '../audio/constants.js';
import { saveTrial, getAllTrials, getMeta, setMeta, putRecord } from '../db/db.js';
import { AdaptiveStats, buildChromaAccuracy } from '../audio/AdaptiveStats.js';

const ADVANCEMENT_TRIALS = 50;
const FATIGUE_WINDOW = 5;
const FATIGUE_THRESHOLD = 0.70;
const COLD_START_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours


function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getWindowBounds() {
  return { minMs: 500, maxMs: 3000 };
}

export function useGameState() {
  const [screen, setScreen] = useState('home'); // 'home' | 'trial' | 'wipe' | 'feedback' | 'dashboard' | 'ambient' | 'micro'
  const [level, setLevel] = useState(1);
  const [sessionType, setSessionType] = useState('evening');
  const [trialIndex, setTrialIndex] = useState(0);
  const [currentTrial, setCurrentTrial] = useState(null);
  const [feedback, setFeedback] = useState(null);   // { correct, guess, target, neighbors, isTimeout, confidence }
  const [secondInstinctPrompt, setSecondInstinctPrompt] = useState(false);
  const [, setWipeEndTime] = useState(0);
  const [wipeProgress, setWipeProgress] = useState(0);
  const [isColdStart, setIsColdStart] = useState(false);
  const [sessionFatigue, setSessionFatigue] = useState(false);
  const [recentResults, setRecentResults] = useState([]);  // rolling window
  const [streak, setStreak] = useState(0);
  const [showConfidenceOverlay, setShowConfidenceOverlay] = useState(false);
  const [pendingGuess, setPendingGuess] = useState(null);
  const [audioStartMs, setAudioStartMs] = useState(0);
  const [activeNotes, setActiveNotes] = useState(CHROMAS);
  const [consecutiveResults, setConsecutiveResults] = useState([]);
  const [notExactModeState, setNotExactModeState] = useState(false);
  const [showDirectionOverlay, setShowDirectionOverlay] = useState(false);
  const [adaptiveMode, setAdaptiveModeState] = useState(false);
  const [noiseScrambleModeState, setNoiseScrambleModeState] = useState(false);
  const [currentProgression, setCurrentProgression] = useState(null);
  const [audioEndMs, setAudioEndMs] = useState(0);
  const [progressionFeedback, setProgressionFeedback] = useState(null);
  const [progressionPlaying, setProgressionPlaying] = useState(false);
  const [responseWindowMs, setResponseWindowMs] = useState(1500);
  const [, setConsecutiveCorrectTiming] = useState(0);

  const measurementSession = useRef(null);
  const measurementBlock = useRef(null);
  const matrixStore = useRef(new MatrixStore());
  const wipeTimer = useRef(null);
  const lastTrialTime = useRef(null);
  const drillNotesRef = useRef(null);
  const customConfigRef = useRef(null);
  const adaptiveStatsRef = useRef(null);
  const perNoteAccuracyRef = useRef({});
  const progressionPlayingRef = useRef(false);
  const progressionPlayTimer = useRef(null);

  // Load persisted level and streak on mount
  useEffect(() => {
    getMeta('level').then(v => { if (v) setLevel(v); });
    getMeta('streak').then(v => { if (v) setStreak(v); });
    getMeta('lastTrialTime').then(v => { if (v) lastTrialTime.current = v; });
    getMeta('adaptiveMode').then(v => { if (v != null) setAdaptiveModeState(v); });
    getMeta('notExactMode').then(v => { if (v != null) setNotExactModeState(v); });
    getMeta('noiseScrambleMode').then(v => { if (v != null) setNoiseScrambleModeState(v); });
    getMeta('responseWindowMs').then(v => { if (v != null) setResponseWindowMs(v); });
  }, []);



  // Detect cold start
  function checkColdStart() {
    const last = lastTrialTime.current;
    if (!last) return true;
    return Date.now() - last > COLD_START_GAP_MS;
  }

  function setAdaptiveMode(v) {
    setAdaptiveModeState(v);
    setMeta('adaptiveMode', v);
  }

  function setNotExactMode(v) {
    setNotExactModeState(v);
    setMeta('notExactMode', v);
  }

  function setNoiseScrambleMode(v) {
    setNoiseScrambleModeState(v);
    setMeta('noiseScrambleMode', v);
  }

  // Runs once per session start, always (see Decision C: perNoteAccuracy must
  // always be fresh for mastery-weighted note selection, independent of
  // adaptiveMode). When adaptiveMode is off, skip building the full
  // AdaptiveStats instance (and its unused instrument/octave/type/direction
  // tallies) and compute only the chroma accuracy we actually need.
  async function loadPerTrialState(type = 'manual') {
    const session = { id: crypto.randomUUID(), training_epoch: await getMeta('curriculumEpoch') ?? 'legacy', started_at: new Date().toISOString(), ended_at: null, session_type: type, canonical_condition: false, device_context: navigator.userAgent, optional_notes: 'Manual practice: acquisition context was not measured', schema_version: 2, evidence_policy: 'excluded from canonical estimates until context and audio protocol are comparable' };
    await putRecord('sessions', session);
    measurementSession.current = session;
    const trials = await getAllTrials();
    if (adaptiveMode) {
      const stats = new AdaptiveStats(trials);
      adaptiveStatsRef.current = stats;
      perNoteAccuracyRef.current = stats.getChromaStats();
    } else {
      adaptiveStatsRef.current = null;
      perNoteAccuracyRef.current = buildChromaAccuracy(trials);
    }
  }

  // These wrappers must be called synchronously from button click handlers
  // so that initSync() runs within the user gesture (browser AudioContext policy).
  function beginSession(type) {
    audioEngine.initSync();
    startSession(type);
  }

  function beginMicro() {
    audioEngine.initSync();
    startMicro();
  }

  function beginDrill(notes) {
    audioEngine.initSync();
    startDrill(notes);
  }

  function beginCustom(config) {
    audioEngine.initSync();
    startCustom(config);
  }

  function beginProgression() {
    audioEngine.initSync();
    startProgressionSession();
  }

  async function startSession(type = 'evening') {
    setSessionType(type);
    setTrialIndex(0);
    setRecentResults([]);
    setConsecutiveResults([]);
    setSessionFatigue(false);
    setConsecutiveCorrectTiming(0);
    const cold = checkColdStart();
    setIsColdStart(cold);
    await loadPerTrialState(type);
    setScreen('trial');
    launchTrial(0, type, cold);
  }

  async function startMicro() {
    setSessionType('micro');
    setTrialIndex(0);
    setRecentResults([]);
    setSessionFatigue(false);
    setConsecutiveCorrectTiming(0);
    setIsColdStart(false);
    await loadPerTrialState();
    setScreen('trial');
    launchTrial(0, 'micro', false);
  }

  async function startDrill(notes) {
    drillNotesRef.current = notes;
    setSessionType('drill');
    setTrialIndex(0);
    setRecentResults([]);
    setConsecutiveResults([]);
    setSessionFatigue(false);
    setConsecutiveCorrectTiming(0);
    setIsColdStart(false);
    await loadPerTrialState();
    setScreen('trial');
    launchTrial(0, 'drill', false);
  }

  // config: { notes: string[], weights: {chroma: number}, outOfSetProb: number, allowedStimTypes: string[] }
  async function startCustom(config) {
    customConfigRef.current = config;
    setSessionType('custom');
    setTrialIndex(0);
    setRecentResults([]);
    setConsecutiveResults([]);
    setSessionFatigue(false);
    setConsecutiveCorrectTiming(0);
    setIsColdStart(false);
    await loadPerTrialState();
    setScreen('trial');
    launchTrial(0, 'custom', false);
  }

  // ── Chord progression session ─────────────────────────────────────────────
  const PROGRESSION_SESSION_TRIALS = 10;

  async function startProgressionSession() {
    setSessionType('progression');
    setTrialIndex(0);
    setRecentResults([]);
    setConsecutiveResults([]);
    setSessionFatigue(false);
    setConsecutiveCorrectTiming(0);
    setIsColdStart(false);
    await loadPerTrialState();
    // Preload piano samples so the first progression starts on time.
    audioEngine.preloadInstrument('piano');
    setScreen('progression');
    launchProgressionTrial();
  }

  async function launchProgressionTrial() {
    clearTimeout(progressionPlayTimer.current);
    progressionPlayingRef.current = false;
    setProgressionPlaying(false);
    const notes = CHROMAS;
    setActiveNotes(notes);
    const prog = generateProgression({ activeNotes: notes, level });
    setCurrentProgression(prog);
    setProgressionFeedback(null);
    setAudioEndMs(0);
  }

  async function playProgressionAgain() {
    if (!currentProgression || progressionPlayingRef.current) return;
    progressionPlayingRef.current = true;
    setProgressionPlaying(true);
    const endMs = await playProgression(currentProgression);
    setAudioEndMs(endMs);
    clearTimeout(progressionPlayTimer.current);
    progressionPlayTimer.current = setTimeout(() => {
      progressionPlayingRef.current = false;
      setProgressionPlaying(false);
    }, Math.max(0, endMs - Date.now()));
  }

  function handleProgressionGuess(chroma) {
    const prog = currentProgression;
    if (!prog) return;
    const latencyMs = Math.max(0, Date.now() - audioEndMs);
    const correct = chroma === prog.tonic;

    const trialLog = {
      is_cold_start: false,
      target_chroma: prog.tonic,
      target_octave: null,
      is_out_of_set: false,
      active_set_size: prog.activeSetSize,
      cents_offset: 0,
      cents_direction: 'none',
      instrument_id: 'piano',
      sine_wave_flag: false,
      noise_masked_flag: false,
      noise_type: 'none',
      dropout_type: 'none',
      tonal_context_flag: false,
      attention_cue: 'none',
      user_guess: chroma,
      user_guess_direction: 'none',
      confidence: 'high',
      latency_ms: latencyMs,
      result_bool: correct,
      timeout_flag: false,
      second_instinct_flag: false,
      second_instinct_note: null,
      level,
      session_fatigue_flag: false,
      session_type: 'progression',
      drill_mode_flag: false,
      drill_notes: null,
      response_window_ms: 0,
      notes: '',
      progression_flag: true,
      progression_quality: prog.quality,
      progression_length: prog.length,
      progression_degrees: prog.degrees.join('-'),
    };
    saveTrial(trialLog);

    setConsecutiveResults(prev => [...prev, correct]);

    setProgressionFeedback({ correct, guess: chroma, target: prog.tonic, quality: prog.quality });
    setScreen('progression-feedback');
  }

  function proceedProgressionAfterFeedback() {
    if (trialIndex >= PROGRESSION_SESSION_TRIALS - 1) {
      setScreen('home');
      return;
    }

    // Scrambling phase: run the same buffer wipe used between note trials so
    // the previous progression's key doesn't linger in memory.
    setScreen('wipe');
    setWipeProgress(0);

    const tonicHz = currentProgression
      ? chromaOctaveToHz(currentProgression.tonic, 4, 0)
      : 440;
    audioEngine.runBufferWipe(tonicHz, 'piano');

    const wipeEnd = Date.now() + 10000;
    setWipeEndTime(wipeEnd);

    const interval = setInterval(() => {
      const remaining = wipeEnd - Date.now();
      const progress = Math.max(0, 1 - remaining / 10000);
      setWipeProgress(progress);
      if (remaining <= 0) {
        clearInterval(interval);
        wipeTimer.current = null;
        const nextIdx = trialIndex + 1;
        setTrialIndex(nextIdx);
        launchProgressionTrial();
        setScreen('progression');
      }
    }, 100);
    wipeTimer.current = interval;
  }

  async function launchTrial(idx, sessType, cold) {
    const inst = INSTRUMENTS[Math.floor(Math.random() * INSTRUMENTS.length)];
    const customConfig = sessType === 'custom' ? customConfigRef.current : null;
    const notes = (sessType === 'drill' && drillNotesRef.current)
      ? drillNotesRef.current
      : customConfig
        ? customConfig.notes
        : CHROMAS;
    // Ensure response window bounds in case of unexpected state before trial generated
    let currentWindowMs = responseWindowMs;
    const { minMs, maxMs } = getWindowBounds(level);
    currentWindowMs = clamp(currentWindowMs, minMs, maxMs);
    if (currentWindowMs !== responseWindowMs) {
      setResponseWindowMs(currentWindowMs);
      setMeta('responseWindowMs', currentWindowMs);
    }

    setActiveNotes(notes); // keeps NoteGrid/SI-grid in sync with the set actually sampled (fixes the drill-desync bug above)
    const trial = generateTrial({
      activeNotes: notes,
      level,
      instrumentId: inst,
      trialIndexInSession: idx,
      confusionMatrix: matrixStore.current.instruments[inst] || matrixStore.current.all,
      sessionType: sessType,
      adaptiveStats: adaptiveStatsRef.current,
      responseWindowMs: currentWindowMs,
      perNoteAccuracy: perNoteAccuracyRef.current,
      noiseScramble: noiseScrambleModeState,
      customWeights: customConfig ? customConfig.weights : null,
      customOutOfSetProb: customConfig ? customConfig.outOfSetProb : null,
      allowedStimTypes: customConfig ? customConfig.allowedStimTypes : null,
    });
    const block = { id: crypto.randomUUID(), session_id: measurementSession.current.id, session_type: sessType, training_epoch: measurementSession.current.training_epoch, block_index: idx, explicit_response_set: [...notes], sampling_distribution: customConfig?.weights ?? null, out_of_set_distribution: null, response_window_ms: currentWindowMs, feedback_policy: 'immediate', scheduler_version: 'manual-1', learner_model_version: '1', stimulus_generator_version: 'legacy-audio-1', schema_version: 2, scheduler_decision: { action: 'user-configured practice' }, scheduler_state_snapshot: { custom_config: customConfig }, trials: [{...trial}], block_length: 1, created_at: new Date().toISOString() };
    await putRecord('blocks', block);
    measurementBlock.current = block;
    trial.isColdStart = cold && idx === 0;
    trial.sessionType = sessType;
    trial.activeSetSize = notes.length;
    // Reset audio onset before the new trial renders so the response-window
    // timer (keyed on audioStartMs) doesn't start from a stale previous value.
    setAudioStartMs(0);
    setCurrentTrial(trial);

    const startMs = await playTrial(trial);
    setAudioStartMs(startMs);
    setShowConfidenceOverlay(false);
    setShowDirectionOverlay(false);
    setSecondInstinctPrompt(false);
    setPendingGuess(null);
  }

  function handleNotePress(chroma) {
    if (screen !== 'trial') return;
    if (showConfidenceOverlay || showDirectionOverlay) return;
    const latencyMs = Date.now() - audioStartMs;
    if (latencyMs > currentTrial.responseWindowMs) {
      // Already timed out — ignore late presses
      return;
    }
    setPendingGuess({ chroma, latencyMs });
    if (notExactModeState && currentTrial.stimType === 'detuned') {
      setShowDirectionOverlay(true);
    } else {
      setShowConfidenceOverlay(true);
    }
  }

  function handleDirectionPress(direction) {
    if (!pendingGuess) return;
    setPendingGuess(prev => ({ ...prev, direction }));
    setShowDirectionOverlay(false);
    setShowConfidenceOverlay(true);
  }

  function handleConfidence(conf) {
    if (!pendingGuess) return;
    setShowConfidenceOverlay(false);
    submitGuess(pendingGuess.chroma, pendingGuess.latencyMs, conf);
  }

  function handleTimeout() {
    if (screen !== 'trial') return;
    submitGuess('__timeout__', currentTrial.responseWindowMs, 'low');
  }

  async function submitGuess(chroma, latencyMs, confidence) {
    const trial = currentTrial;
    const isTimeout = chroma === '__timeout__';
    const isDirectionTested = notExactModeState && trial.stimType === 'detuned';
    const correct = !isTimeout && (
      trial.isOutOfSet
        ? chroma === 'OTHER'
        : chroma === trial.targetChroma &&
          (isDirectionTested ? pendingGuess?.direction === trial.centDirection : true)
    );

    if (!correct && !isTimeout && confidence === 'low') {
      // Need second instinct prompt
      setSecondInstinctPrompt({ chroma, latencyMs, confidence, correct });
      return;
    }

    await finalizeGuess(chroma, latencyMs, confidence, correct, isTimeout, false, null);
  }

  function handleSecondInstinct(hadSecondInstinct, secondInstinctNote) {
    if (!secondInstinctPrompt) return;
    const { chroma, latencyMs, confidence, correct } = secondInstinctPrompt;
    setSecondInstinctPrompt(false);
    finalizeGuess(chroma, latencyMs, confidence, correct, false, hadSecondInstinct, secondInstinctNote);
  }

  async function finalizeGuess(chroma, latencyMs, confidence, correct, isTimeout, hadSecondInstinct, secondInstinctNote) {
    const trial = currentTrial;
    const isSine = trial.stimType === 'sine';

    // Record in confusion matrices
    matrixStore.current.record(
      trial.targetChroma,
      isTimeout ? trial.targetChroma : chroma,  // timeout counts as wrong
      correct,
      confidence === 'high',
      isSine,
      latencyMs,
      trial.instrument
    );

    // Fatigue check
    const newRecent = [...recentResults.slice(-(FATIGUE_WINDOW - 1)), correct ? 1 : 0];
    setRecentResults(newRecent);
    const newConsec = [...consecutiveResults, correct].slice(-ADVANCEMENT_TRIALS);
    setConsecutiveResults(newConsec);

    const fatigue = newRecent.length >= FATIGUE_WINDOW &&
      newRecent.reduce((a, b) => a + b, 0) / newRecent.length < FATIGUE_THRESHOLD;
    if (fatigue) setSessionFatigue(true);

    // Update streak
    if (trial.isColdStart && correct) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setMeta('streak', newStreak);
    }

    // Log time
    lastTrialTime.current = Date.now();
    setMeta('lastTrialTime', Date.now());

    // Persist trial
    const trialLog = {
      id: crypto.randomUUID(), schema_version: 2, learner_model_version: '1', scheduler_version: 'manual-1', stimulus_generator_version: 'legacy-audio-1', benchmark_version: null,
      session_id: measurementSession.current.id, block_id: measurementBlock.current.id, training_epoch: measurementSession.current.training_epoch,
      canonical_condition: false, trial_purpose: 'manual', evidence_policy: 'noncanonical manual observations; excluded from canonical scheduling',
      trial_index_session: trialIndex, trial_index_block: 0, explicit_response_set: [...activeNotes], target_pitch: trial.targetChroma, response: isTimeout ? 'TIMEOUT' : chroma, first_response: chroma, correct,
      octave: trial.octave, timbre: trial.instrument, stimulus_type: trial.stimType, detuning: trial.centOffset, noise_configuration: trial.stimType === 'noise' ? trial.noiseType : null,
      second_instinct: secondInstinctNote, second_instinct_latency: null, sample_id: null, sample_onset_offset: null, input_method: 'unmeasured', feedback_policy: 'immediate',
      is_cold_start: trial.isColdStart || false,
      target_chroma: trial.targetChroma,
      target_octave: trial.octave,
      is_out_of_set: trial.isOutOfSet,
      active_set_size: trial.activeSetSize,
      cents_offset: trial.centOffset,
      cents_direction: trial.centDirection,
      instrument_id: trial.instrument,
      sine_wave_flag: trial.stimType === 'sine',
      noise_masked_flag: trial.stimType === 'noise',
      noise_type: trial.stimType === 'noise' ? trial.noiseType : 'none',
      dropout_type: 'none',
      tonal_context_flag: false,
      attention_cue: 'none',
      user_guess: isTimeout ? 'TIMEOUT' : chroma,
      user_guess_direction: pendingGuess?.direction || 'none',
      confidence,
      latency_ms: latencyMs,
      result_bool: correct,
      timeout_flag: isTimeout,
      second_instinct_flag: hadSecondInstinct,
      second_instinct_note: secondInstinctNote,
      level,
      session_fatigue_flag: fatigue,
      session_type: trial.sessionType,
      drill_mode_flag: trial.sessionType === 'drill',
      drill_notes: trial.sessionType === 'drill' ? drillNotesRef.current : null,
      response_window_ms: trial.responseWindowMs,
      notes: '',
    };
    await saveTrial(trialLog);

    // Get confusion neighbors for feedback
    const topPairs = matrixStore.current.all.topConfusedPairs(2)
      .filter(p => p.target === trial.targetChroma)
      .map(p => p.response);

    setFeedback({
      correct,
      guess: isTimeout ? 'TIMEOUT' : chroma,
      target: trial.targetChroma,
      isTimeout,
      isOutOfSet: trial.isOutOfSet,
      confidence,
      neighbors: topPairs,
      guessDirection: pendingGuess?.direction,
      targetDirection: trial.centDirection,
      wasDirectionTested: notExactModeState && trial.stimType === 'detuned',
    });

    setScreen('feedback');
  }

  async function proceedAfterFeedback() {
    if (sessionType === 'micro' && trialIndex >= 2) {
      setScreen('home');
      return;
    }
    if (sessionFatigue && sessionType !== 'drill' && sessionType !== 'custom') {
      setScreen('home');
      return;
    }

    setScreen('wipe');
    setWipeProgress(0);

    // Run the 10-second wipe with proper target Hz
    audioEngine.runBufferWipe(
      currentTrial?.hz || 440,
      currentTrial?.instrument || 'piano'
    );

    const wipeEnd = Date.now() + 10000;
    setWipeEndTime(wipeEnd);

    const interval = setInterval(() => {
      const remaining = wipeEnd - Date.now();
      const progress = Math.max(0, 1 - remaining / 10000);
      setWipeProgress(progress);
      if (remaining <= 0) {
        clearInterval(interval);
        wipeTimer.current = null;
        const nextIdx = trialIndex + 1;
        setTrialIndex(nextIdx);
        launchTrial(nextIdx, sessionType, false);
        setScreen('trial');
      }
    }, 100);
    wipeTimer.current = interval;
  }

  function goHome() {
    if (wipeTimer.current) clearInterval(wipeTimer.current);
    clearTimeout(progressionPlayTimer.current);
    progressionPlayingRef.current = false;
    setProgressionPlaying(false);
    audioEngine.stop();
    if (measurementSession.current) putRecord('sessions', { ...measurementSession.current, ended_at: new Date().toISOString() }).catch(() => {});
    setScreen('home');
  }

  return {
    screen, setScreen,
    level,
    setLevel: (v) => { setLevel(v); setMeta('level', v); },
    sessionType,
    trialIndex,
    currentTrial,
    feedback,
    secondInstinctPrompt,
    wipeProgress,
    isColdStart,
    sessionFatigue,
    streak,
    activeNotes,
    notExactMode: notExactModeState, setNotExactMode,
    adaptiveMode, setAdaptiveMode,
    noiseScrambleMode: noiseScrambleModeState, setNoiseScrambleMode,
    showConfidenceOverlay,
    showDirectionOverlay,
    pendingGuess,
    audioStartMs,
    consecutiveResults,
    matrixStore,
    startSession: beginSession,
    startMicro: beginMicro,
    startDrill: beginDrill,
    startCustom: beginCustom,
    startProgression: beginProgression,
    currentProgression,
    audioEndMs,
    progressionFeedback,
    progressionPlaying,
    playProgressionAgain,
    handleProgressionGuess,
    proceedProgressionAfterFeedback,
    handleNotePress,
    handleDirectionPress,
    handleConfidence,
    handleTimeout,
    handleSecondInstinct,
    proceedAfterFeedback,
    goHome,
  };
}
