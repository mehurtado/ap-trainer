import { useState, useEffect, useCallback, useRef } from 'react';
import { audioEngine } from '../audio/AudioEngine.js';
import { generateTrial, playTrial, getActiveNotes } from '../audio/TrialEngine.js';
import { MatrixStore } from '../audio/ConfusionMatrix.js';
import { LEVEL_NOTES, CHROMAS, INSTRUMENTS } from '../audio/constants.js';
import { saveTrial, getMeta, setMeta } from '../db/db.js';

const ADVANCEMENT_TRIALS = 50;
const ADVANCEMENT_ACCURACY = 0.90;
const ADVANCEMENT_LATENCY_MS = 1200;
const FATIGUE_WINDOW = 5;
const FATIGUE_THRESHOLD = 0.70;
const COLD_START_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours

export function useGameState() {
  const [screen, setScreen] = useState('home'); // 'home' | 'trial' | 'wipe' | 'feedback' | 'dashboard' | 'ambient' | 'micro'
  const [level, setLevel] = useState(1);
  const [sessionType, setSessionType] = useState('evening');
  const [trialIndex, setTrialIndex] = useState(0);
  const [currentTrial, setCurrentTrial] = useState(null);
  const [feedback, setFeedback] = useState(null);   // { correct, guess, target, neighbors }
  const [, setWipeEndTime] = useState(0);
  const [wipeProgress, setWipeProgress] = useState(0);
  const [isColdStart, setIsColdStart] = useState(false);
  const [sessionFatigue, setSessionFatigue] = useState(false);
  const [recentResults, setRecentResults] = useState([]);  // rolling window
  const [streak, setStreak] = useState(0);
  const [cognitiveLoad, setCognitiveLoad] = useState('low');
  const [intoxicationFlag, setIntoxicationFlag] = useState('none');
  const [contaminationFlag, setContaminationFlag] = useState(false);
  const [showConfidenceOverlay, setShowConfidenceOverlay] = useState(false);
  const [pendingGuess, setPendingGuess] = useState(null);
  const [audioStartMs, setAudioStartMs] = useState(0);
  const [activeNotes, setActiveNotes] = useState(LEVEL_NOTES[1]);
  const [consecutiveResults, setConsecutiveResults] = useState([]);
  const [notExactMode, setNotExactMode] = useState(false);

  const matrixStore = useRef(new MatrixStore());
  const wipeTimer = useRef(null);
  const lastTrialTime = useRef(null);
  const binaryNotesRef = useRef(null);

  // Load persisted level and streak on mount
  useEffect(() => {
    getMeta('level').then(v => { if (v) setLevel(v); });
    getMeta('streak').then(v => { if (v) setStreak(v); });
    getMeta('lastTrialTime').then(v => {
      if (v) lastTrialTime.current = v;
    });
  }, []);

  useEffect(() => {
    setActiveNotes(LEVEL_NOTES[level] || CHROMAS);
  }, [level]);

  // Detect cold start
  function checkColdStart() {
    const last = lastTrialTime.current;
    if (!last) return true;
    return Date.now() - last > COLD_START_GAP_MS;
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

  function beginBinary(note1, note2) {
    audioEngine.initSync();
    startBinary(note1, note2);
  }

  async function startSession(type = 'evening') {
    setSessionType(type);
    setTrialIndex(0);
    setRecentResults([]);
    setConsecutiveResults([]);
    setSessionFatigue(false);
    const cold = checkColdStart();
    setIsColdStart(cold);
    setScreen('trial');
    launchTrial(0, type, cold);
  }

  async function startMicro() {
    setSessionType('micro');
    setTrialIndex(0);
    setRecentResults([]);
    setSessionFatigue(false);
    setIsColdStart(false);
    setScreen('trial');
    launchTrial(0, 'micro', false);
  }

  async function startBinary(note1, note2) {
    binaryNotesRef.current = [note1, note2];
    setSessionType('binary');
    setTrialIndex(0);
    setRecentResults([]);
    setConsecutiveResults([]);
    setSessionFatigue(false);
    setIsColdStart(false);
    setScreen('trial');
    launchTrial(0, 'binary', false);
  }

  async function launchTrial(idx, sessType, cold) {
    const inst = INSTRUMENTS[Math.floor(Math.random() * INSTRUMENTS.length)];
    const notes = (sessType === 'binary' && binaryNotesRef.current)
      ? binaryNotesRef.current
      : LEVEL_NOTES[level] || CHROMAS;
    const trial = generateTrial({
      activeNotes: notes,
      level,
      instrumentId: inst,
      trialIndexInSession: idx,
      confusionMatrix: matrixStore.current.all,
    });
    trial.isColdStart = cold && idx === 0;
    trial.sessionType = sessType;
    setCurrentTrial(trial);

    const startMs = await playTrial(trial);
    setAudioStartMs(startMs);
    setShowConfidenceOverlay(false);
    setPendingGuess(null);
  }

  function handleNotePress(chroma) {
    if (screen !== 'trial') return;
    if (showConfidenceOverlay) return;
    const latencyMs = Date.now() - audioStartMs;
    if (latencyMs > currentTrial.responseWindowMs) {
      // Already timed out — ignore late presses
      return;
    }
    setPendingGuess({ chroma, latencyMs });
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
    const correct = !isTimeout && chroma === trial.targetChroma &&
      (notExactMode ? pendingGuess?.direction === trial.centDirection : true);
    const isSine = trial.stimType === 'sine';

    // Record in confusion matrices
    matrixStore.current.record(
      trial.targetChroma,
      isTimeout ? trial.targetChroma : chroma,  // timeout counts as wrong
      correct,
      confidence === 'high',
      isSine
    );

    // Fatigue check
    const newRecent = [...recentResults.slice(-(FATIGUE_WINDOW - 1)), correct ? 1 : 0];
    setRecentResults(newRecent);
    const newConsec = [...consecutiveResults, correct];
    setConsecutiveResults(newConsec);

    const fatigue = newRecent.length >= FATIGUE_WINDOW &&
      newRecent.reduce((a, b) => a + b, 0) / newRecent.length < FATIGUE_THRESHOLD;
    if (fatigue) setSessionFatigue(true);

    // Advancement check (last 50 trials) — disabled in binary mode
    if (trial.sessionType !== 'binary') {
      const last50 = newConsec.slice(-ADVANCEMENT_TRIALS);
      if (last50.length >= ADVANCEMENT_TRIALS) {
        const acc = last50.filter(Boolean).length / ADVANCEMENT_TRIALS;
        if (acc >= ADVANCEMENT_ACCURACY && level < 12) {
          const newLevel = level + 1;
          setLevel(newLevel);
          setMeta('level', newLevel);
        }
      }
    }

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
      is_cold_start: trial.isColdStart || false,
      target_chroma: trial.targetChroma,
      target_octave: trial.octave,
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
      user_guess_direction: 'none',
      confidence,
      latency_ms: latencyMs,
      result_bool: correct,
      timeout_flag: isTimeout,
      level,
      session_fatigue_flag: fatigue,
      cognitive_load_level: cognitiveLoad,
      intoxication_flag: intoxicationFlag,
      session_type: trial.sessionType,
      contamination_flag: contaminationFlag,
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
      neighbors: topPairs,
    });

    setScreen('feedback');
  }

  async function proceedAfterFeedback() {
    if (sessionType === 'micro' && trialIndex >= 2) {
      setScreen('home');
      return;
    }
    if (sessionFatigue && sessionType !== 'binary') {
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
    audioEngine.stop();
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
    wipeProgress,
    isColdStart,
    sessionFatigue,
    streak,
    activeNotes,
    notExactMode, setNotExactMode,
    showConfidenceOverlay,
    pendingGuess,
    cognitiveLoad, setCognitiveLoad,
    intoxicationFlag, setIntoxicationFlag,
    contaminationFlag, setContaminationFlag,
    consecutiveResults,
    matrixStore,
    startSession: beginSession,
    startMicro: beginMicro,
    startBinary: beginBinary,
    handleNotePress,
    handleConfidence,
    handleTimeout,
    proceedAfterFeedback,
    goHome,
  };
}
