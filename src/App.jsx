import AppNav from './components/AppNav.jsx';
import { useGameState } from './hooks/useGameState.js';
import { useTheme } from './hooks/useTheme.js';
import HomeScreen from './components/HomeScreen.jsx';
import TrialScreen from './components/TrialScreen.jsx';
import FeedbackScreen from './components/FeedbackScreen.jsx';
import WipeScreen from './components/WipeScreen.jsx';
import Dashboard from './components/Dashboard.jsx';
import AmbientLog from './components/AmbientLog.jsx';
import ProgressionScreen from './components/ProgressionScreen.jsx';
import ProgressionFeedback from './components/ProgressionFeedback.jsx';
import './App.css';
import { useState, useSyncExternalStore } from 'react';
import Account from './components/Account.jsx';
import { subscribeCloud, getCloudSnapshot } from './cloud/runtime.js';
import Curriculum from './components/Curriculum.jsx';

export default function App() {
  const [manual, setManual] = useState(false);
  const [dashboard, setDashboard] = useState(false);
  const [trainingView, setTrainingView] = useState('home');
  const [pendingScreen, setPendingScreen] = useState(null);
  const { theme, toggle: toggleTheme } = useTheme();
  const cloud = useSyncExternalStore(subscribeCloud, getCloudSnapshot);
  if (!cloud.ready) return <p>Switching account…</p>;
  const goTraining = () => { setTrainingView('home'); setDashboard(false); setManual(false); setPendingScreen(null); };
  const goPractice = () => { setDashboard(false); setManual(true); setPendingScreen(null); };
  const goDashboard = () => { setDashboard(true); setManual(false); };
  const goSettings = () => { setTrainingView('settings'); setDashboard(false); setManual(false); };
  const goDetails = () => { setTrainingView('map'); setDashboard(false); setManual(false); };
  return <><Account />{dashboard ? <Dashboard onBack={goTraining} onPractice={goPractice} onSettings={goSettings} onDetails={goDetails} /> : manual
    ? <ManualPractice
        onReturn={goTraining}
        onDashboard={goDashboard}
        onSettings={goSettings}
        onDetails={goDetails}
        initialScreen={pendingScreen}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    : <Curriculum
        initialView={trainingView}
        onManual={goPractice}
        onDashboard={goDashboard}
        theme={theme}
        toggleTheme={toggleTheme}
      />}</>;
}

function ManualPractice({ onReturn, onDashboard, onSettings, onDetails, initialScreen, theme, toggleTheme }) {
  const g = useGameState(initialScreen);
  if (g.screen === 'home') {
    return (
      <><AppNav current="practice" onTraining={onReturn} onDashboard={onDashboard} onSettings={onSettings} onDetails={onDetails} /><HomeScreen manualOnly
        level={g.level}
        streak={g.streak}
        onStartEvening={() => g.startSession('evening')}
        onStartColdStart={() => g.startSession('cold_start')}
        onStartMicro={g.startMicro}
        onDashboard={onDashboard}
        onAmbient={() => g.setScreen('ambient')}
        onSetLevel={g.setLevel}
        onStartDrill={g.startDrill}
        onStartCustom={g.startCustom}
        onStartProgression={g.startProgression}
        theme={theme}
        onToggleTheme={toggleTheme}
        adaptiveMode={g.adaptiveMode}
        onToggleAdaptive={() => g.setAdaptiveMode(!g.adaptiveMode)}
        notExactMode={g.notExactMode}
        onToggleNotExact={() => g.setNotExactMode(!g.notExactMode)}
        noiseScrambleMode={g.noiseScrambleMode}
        onToggleNoiseScramble={() => g.setNoiseScrambleMode(!g.noiseScrambleMode)}
      /></>
    );
  }

  if (g.screen === 'trial') {
    const correct = g.consecutiveResults.filter(Boolean).length;
    const total = g.consecutiveResults.length;
    return (
      <TrialScreen
        currentTrial={g.currentTrial}
        audioStartMs={g.audioStartMs}
        activeNotes={g.activeNotes}
        onNotePress={g.handleNotePress}
        onTimeout={g.handleTimeout}
        showConfidenceOverlay={g.showConfidenceOverlay}
        onConfidence={g.handleConfidence}
        secondInstinctPrompt={g.secondInstinctPrompt}
        onSecondInstinct={g.handleSecondInstinct}
        level={g.level}
        trialIndex={g.trialIndex}
        notExactMode={g.notExactMode}
        showDirectionOverlay={g.showDirectionOverlay}
        onDirectionPress={g.handleDirectionPress}
        sessionCorrect={correct}
        sessionTotal={total}
        onQuit={g.goHome}
      />
    );
  }

  if (g.screen === 'progression') {
    const correct = g.consecutiveResults.filter(Boolean).length;
    const total = g.consecutiveResults.length;
    return (
      <ProgressionScreen
        currentProgression={g.currentProgression}
        activeNotes={g.activeNotes}
        onGuess={g.handleProgressionGuess}
        onPlayAgain={g.playProgressionAgain}
        isPlaying={g.progressionPlaying}
        onQuit={g.goHome}
        level={g.level}
        trialIndex={g.trialIndex}
        sessionCorrect={correct}
        sessionTotal={total}
      />
    );
  }

  if (g.screen === 'progression-feedback') {
    return (
      <ProgressionFeedback
        feedback={g.progressionFeedback}
        onContinue={g.proceedProgressionAfterFeedback}
      />
    );
  }

  if (g.screen === 'feedback') {
    return (
      <FeedbackScreen
        feedback={g.feedback}
        onContinue={g.proceedAfterFeedback}
        sessionFatigue={g.sessionFatigue}
      />
    );
  }

  if (g.screen === 'wipe') {
    return <WipeScreen progress={g.wipeProgress} onQuit={g.goHome} />;
  }

  if (g.screen === 'dashboard') {
    return <Dashboard onBack={g.goHome} />;
  }

  if (g.screen === 'ambient') {
    return <AmbientLog onBack={g.goHome} />;
  }

  return null;
}
