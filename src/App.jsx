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
import { useState } from 'react';
import Curriculum from './components/Curriculum.jsx';

export default function App() {
  const [manual, setManual] = useState(false);
  const [pendingScreen, setPendingScreen] = useState(null);
  const { theme, toggle: toggleTheme } = useTheme();
  return manual
    ? <ManualPractice
        onReturn={() => { setManual(false); setPendingScreen(null); }}
        initialScreen={pendingScreen}
        theme={theme}
        toggleTheme={toggleTheme}
      />
    : <Curriculum
        onManual={() => setManual(true)}
        onDashboard={() => { setManual(true); setPendingScreen('dashboard'); }}
        theme={theme}
        toggleTheme={toggleTheme}
      />;
}

function ManualPractice({ onReturn, initialScreen, theme, toggleTheme }) {
  const g = useGameState(initialScreen);
  if (g.screen === 'home') {
    return (
      <><button className="back-btn" onClick={onReturn}>Back to training</button><HomeScreen manualOnly
        level={g.level}
        streak={g.streak}
        onStartEvening={() => g.startSession('evening')}
        onStartColdStart={() => g.startSession('cold_start')}
        onStartMicro={g.startMicro}
        onDashboard={() => g.setScreen('dashboard')}
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
