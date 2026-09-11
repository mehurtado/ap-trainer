import { useEffect, useMemo, useRef, useState } from 'react';
import { CHROMAS, INSTRUMENTS, nearestSample, chromaOctaveToHz } from '../audio/constants.js';
import { audioEngine } from '../audio/AudioEngine.js';
import { getAllTrials, getMeta, setMeta, getRecords, putRecord, saveTrial, exportJSON } from '../db/db.js';
import { estimate, VERSIONS, contextKey, benchmarkEligible, isCanonical } from '../curriculum/model.js';
import { schedule, generateSequence } from '../curriculum/scheduler.js';
import { benchmark } from '../curriculum/benchmark.js';
import { playStimulus } from '../curriculum/audio.js';
import './Curriculum.css';
import WipeScreen from './WipeScreen.jsx';
import CurriculumAnalytics from './CurriculumAnalytics.jsx';
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const id = () => crypto.randomUUID();
export default function Curriculum({
  onManual, onDashboard, theme, toggleTheme
}) {
  const [data, setData] = useState(null),
    [view, setView] = useState('home'),
    [error, setError] = useState('');
  const [experience, setExperience] = useState('new'),
    [sober, setSober] = useState(true),
    [focused, setFocused] = useState(true),
    [output, setOutput] = useState('headphones'),
    [notes, setNotes] = useState(''),
    [alertness, setAlertness] = useState('ordinary');
  const [session, setSession] = useState(null),
    [block, setBlock] = useState(null),
    [index, setIndex] = useState(0),
    [results, setResults] = useState([]),
    [ready, setReady] = useState(false),
    [answer, setAnswer] = useState(null),
    [second, setSecond] = useState(''),
    [busy, setBusy] = useState(false);
  const [wipeProgress, setWipeProgress] = useState(0);
  const gate = useRef(false),
    timer = useRef(null),
    generation = useRef(0),
    onset = useRef(null),
    pending = useRef(null),
    secondStart = useRef(0),
    secondLatency = useRef(null);
  useEffect(() => {
    let live = true;
    const lifecycle = generation;
    Promise.all([getAllTrials(), getMeta('curriculumEpoch'), getRecords('blocks')]).then(async ([trials, epoch, blocks]) => {
      if (!epoch) {
        epoch = id();
        await putRecord('epochs', {
          id: epoch,
          started_at: new Date().toISOString(),
          reason: 'adaptive curriculum introduction',
          ...VERSIONS
        });
        await setMeta('curriculumEpoch', epoch);
      }
      if (live) setData({
        trials,
        epoch,
        blocks: blocks.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      });
    }).catch(e => setError(e.message));
    return () => {
      live = false;
      lifecycle.current++;
      clearTimeout(timer.current);
      audioEngine.stop();
    };
  }, []);
  const model = useMemo(() => data ? estimate(data.trials, data.epoch) : null, [data]);
  // Pre-decode every distinct sample a block will need so the first trial's
  // onset timing isn't skewed by a cache-miss fetch+decode.
  async function warmSamples(trials) {
    const seen = new Set();
    await Promise.all(trials.filter(t => INSTRUMENTS.includes(t.timbre)).map(t => {
      const near = nearestSample(t.timbre, t.target_pitch, t.octave),
        key = `${t.timbre}/${near.chroma}${near.octave}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return audioEngine.loadSample(t.timbre, near.chroma, near.octave);
    }));
  }
  async function createBlock(s, fresh = data) {
    const m = estimate(fresh.trials, fresh.epoch),
      previous = fresh.blocks.filter(b => b.session_type === 'adaptive' && b.training_epoch === fresh.epoch).at(-1);
    let b;
    if (s.session_type === 'benchmark' || s.session_type === 'mapping' && experience === 'returning') {
      b = benchmark(seed());
      if (s.session_type === 'mapping') b = {
        ...b,
        block_length: 48,
        benchmark_version: null,
        trials: b.trials.slice(0, 48).map(t => ({
          ...t,
          trial_purpose: 'probe'
        }))
      };
    } else {
      b = schedule(m, previous, seed(), undefined, contextKey(s));
      b.trials = generateSequence(b);
      if (s.session_type === 'mapping') b.trials = b.trials.map(t => ({
        ...t,
        trial_purpose: 'probe'
      }));
    }
    b = {
      ...b,
      id: id(),
      session_id: s.id,
      session_type: s.session_type,
      training_epoch: s.training_epoch,
      block_index: fresh.blocks.filter(x => x.session_id === s.id).length,
      created_at: new Date().toISOString()
    };
    b.trials = b.trials.map(t => ({ ...t, intertrial_ms: 10000 }));
    await putRecord('blocks', b);
    await warmSamples(b.trials);
    setData({
      ...fresh,
      blocks: [...fresh.blocks, b]
    });
    setBlock(b);
    setIndex(0);
    setResults([]);
    setAnswer(null);
    return b;
  }
  async function start(type) {
    audioEngine.initSync();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const s = {
        id: id(),
        training_epoch: data.epoch,
        started_at: new Date().toISOString(),
        ended_at: null,
        session_type: type,
        canonical_condition: sober && focused && alertness !== 'low',
        sober,
        focused,
        distraction_type: focused ? 'none' : notes || 'unspecified',
        subjective_alertness: alertness,
        audio_output: output,
        device_context: navigator.userAgent,
        optional_notes: notes,
        experience,
        ...VERSIONS
      };
      if (type === 'benchmark' && !benchmarkEligible(s)) {
        throw new Error('Benchmarks require sober, focused, ordinary or high alertness, and headphones. Regular training is available in every context.');
      }
      await putRecord('sessions', s);
      setSession(s);
      const b = await createBlock(s);
      await play(0, b);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function play(i = index, activeBlock = block) {
    audioEngine.initSync();
    const token = ++generation.current;
    clearTimeout(timer.current);
    setReady(false);
    setAnswer(null);
    setSecond('');
    secondLatency.current = null;
    pending.current = null;
    gate.current = false;
    setView('wipe');
    setWipeProgress(0);
    try {
      await audioEngine.resume();
      if (token !== generation.current) return;
      const ctx = audioEngine.ctx;
      const previous = i > 0 ? activeBlock.trials[i - 1] : data.trials.at(-1);
      const targetHz = previous
        ? chromaOctaveToHz(previous.target_pitch || previous.target_chroma || 'A', previous.octave || 4)
        : 440;
      const instrument = INSTRUMENTS.includes(previous?.timbre) ? previous.timbre : 'piano';
      const end = audioEngine.runBufferWipe(targetHz, instrument);
      const begin = end - 10;
      // Follow the audio clock: suspended audio must never shorten the wipe.
      const waitForWipe = async () => {
        if (token !== generation.current) return;
        setWipeProgress(Math.max(0, Math.min(1, (ctx.currentTime - begin) / 10)));
        if (ctx.currentTime < end) {
          timer.current = setTimeout(waitForWipe, 50);
          return;
        }
        try {
          if (token !== generation.current) return;
          const timing = await playStimulus(activeBlock.trials[i]);
          if (token !== generation.current) return;
          setView('trial');
          onset.current = timing;
          timer.current = setTimeout(() => {
            if (token !== generation.current) return;
            setReady(true);
            timer.current = setTimeout(() => capture('TIMEOUT', i, 'pointer', activeBlock), Math.max(0, timing.onset + activeBlock.response_window_ms - performance.now()));
          }, Math.max(0, timing.onset - performance.now()));
        } catch (e) {
          setError(e.message);
        }
      };
      timer.current = setTimeout(waitForWipe, 50);
    } catch (e) {
      setError(e.message);
    }
  }
  function capture(response, i = index, input = 'pointer', activeBlock = block) {
    if (gate.current) return;
    gate.current = true;
    clearTimeout(timer.current);
    setReady(false);
    const latency = Math.max(0, performance.now() - onset.current.onset),
      r = latency > activeBlock.response_window_ms ? 'TIMEOUT' : response;
    pending.current = {
      response: r,
      latency_ms: Math.min(latency, activeBlock.response_window_ms),
      input_method: input,
      index: i,
      sample_id: onset.current.sampleId,
      sample_onset_offset: onset.current.sampleOnsetOffsetMs
    };
    secondStart.current = performance.now();
    setView('confidence');
  }
  async function record(confidence = .7) {
    if (!pending.current || busy) return;
    setBusy(true);
    const p = pending.current;
    pending.current = null;
    setError('');
    const t = block.trials[p.index],
      explicit = block.explicit_response_set,
      correct = p.response === (explicit.includes(t.target_pitch) ? t.target_pitch : 'OTHER'),
      prior = data.trials.filter(x => x.target_pitch === t.target_pitch).at(-1);
    const row = {
      id: id(),
      ...VERSIONS,
      ...t,
      ...p,
      timestamp: new Date().toISOString(),
      session_id: session.id,
      block_id: block.id,
      training_epoch: session.training_epoch,
      session_type: session.session_type,
      canonical_condition: session.canonical_condition,
      session_context: session,
      trial_index_session: data.trials.filter(x => x.session_id === session.id).length,
      trial_index_block: p.index,
      explicit_response_set: [...explicit],
      first_response: p.response,
      correct,
      confidence: p.response === 'TIMEOUT' ? null : Number(confidence),
      second_instinct: second || null,
      second_instinct_latency: second ? secondLatency.current : null,
      response_window_ms: block.response_window_ms,
      feedback_policy: t.trial_purpose === 'training' ? 'immediate' : 'after block',
      replay_count: 0,
      timing_method: onset.current.timing_method,
      audio_output_type: output,
      device_context: navigator.userAgent,
      delay_since_exposure_ms: prior ? Date.now() - Date.parse(prior.timestamp) : null,
      previous_pitch: data.trials.filter(x => x.session_id === session.id).at(-1)?.target_pitch ?? null,
      scheduler_reason: block.scheduler_decision.action,
      target_scheduler_role: block.scheduler_state_snapshot.roles[t.target_pitch],
      target_ability_state_at_trial: model.pitches[t.target_pitch].ability_state
    };
    try {
      await saveTrial(row);
      pending.current = null;
      setData({
        ...data,
        trials: [...data.trials, row]
      });
      setResults([...results, row]);
      setAnswer(row);
      setView('feedback');
    } catch (e) {
      pending.current = p;
      setError(`Response was not saved: ${e.message}. Retry saving.`);
    } finally {
      setBusy(false);
    }
  }
  function next() {
    if (index + 1 >= block.trials.length) {
      setView('summary');
      return;
    }
    setIndex(index + 1);
    play(index + 1);
  }
  async function finish() {
    generation.current++;
    clearTimeout(timer.current);
    audioEngine.stop();
    setReady(false);
    try {
      if (session) await putRecord('sessions', {
        ...session,
        ended_at: new Date().toISOString()
      });
      setView('home');
    } catch (e) {
      setError(e.message);
    }
  }
  async function newEpoch() {
    try {
      const epoch = id();
      await putRecord('epochs', {
        id: epoch,
        started_at: new Date().toISOString(),
        reason: 'explicit user reset',
        ...VERSIONS
      });
      await setMeta('curriculumEpoch', epoch);
      setData({
        ...data,
        epoch
      });
    } catch (e) {
      setError(e.message);
    }
  }
  async function backup() {
    try {
      const blob = new Blob([JSON.stringify(await exportJSON())], {
          type: 'application/json'
        }),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = 'ap-trainer-backup.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  }
  if (!data) return <main className="curriculum"><h1>AP Trainer</h1><p>{error || 'Loading your history…'}</p></main>;
  if (view === 'wipe') return <WipeScreen progress={wipeProgress} onQuit={finish} />;
  if (view === 'home') return <div className="screen home-screen">
    <header className="home-header"><div className="home-brand"><h1 className="app-title">AP Trainer</h1><span className="app-tagline">Absolute pitch training</span></div><button className="theme-btn" aria-label="Toggle theme" onClick={toggleTheme}>{theme === 'dark' ? '○' : '●'}</button></header>
    {error && <p role="alert">{error}</p>}
    <div className="home-layout">
      <aside className="home-side"><div className="stat-row"><div className="stat"><span className="stat-value">{data.trials.length}</span><span className="stat-label">notes played</span></div></div>
        <nav className="curriculum-home-nav" aria-label="Practice tools"><button className="pill-btn" onClick={onManual}>More ways to play</button><button className="pill-btn" onClick={onDashboard}>Dashboard</button><button className="pill-btn" onClick={() => setView('settings')}>Settings</button><button className="pill-btn" onClick={() => setView('map')}>Progress</button></nav>
      </aside>
      <button className="session-btn primary" disabled={busy} onClick={() => start('adaptive')}><span className="btn-title">{busy ? 'Getting ready…' : 'Start training'}</span><span className="btn-sub">Listen. Pick a note. Find your rhythm.</span></button>
    </div>
  </div>;
  return <main className="curriculum"><header><h1>AP Trainer</h1><p>Absolute pitch training</p></header>{error && <p role="alert">{error}</p>}
 {view === 'settings' && <><h2>Settings</h2><div className="curriculum-controls"><label>Experience <select value={experience} onChange={e => setExperience(e.target.value)}><option value="new">New / untrained</option><option value="returning">Returning / pretrained</option></select></label><label><input type="checkbox" checked={sober} onChange={e => setSober(e.target.checked)} /> Sober</label><label><input type="checkbox" checked={focused} onChange={e => setFocused(e.target.checked)} /> Focused, no concurrent task</label><label>Alertness <select value={alertness} onChange={e => setAlertness(e.target.value)}><option>ordinary</option><option>high</option><option>low</option></select></label><label>Audio <select value={output} onChange={e => setOutput(e.target.value)}><option>headphones</option><option>speakers</option><option>other</option></select></label><label>Context / notes <input value={notes} onChange={e => setNotes(e.target.value)} /></label></div><details><summary>Training tools</summary><div className="curriculum-actions"><button disabled={busy} onClick={() => start('mapping')}>Check starting ability</button><button disabled={busy} onClick={() => start('benchmark')}>Benchmark · 72 trials</button><button onClick={() => setView('map')}>Learner diagnostics</button><button onClick={backup}>Download full backup</button><button onClick={newEpoch}>Restart learning estimates</button></div><p>Restarting estimates preserves your history and gives earlier results less weight.</p></details><button onClick={() => setView('home')}>Back</button></>}
 {view === 'trial' && <><h2>Trial {index + 1} / {block.trials.length}</h2><p aria-live="polite">{ready ? 'Identify the pitch' : 'Listen…'}</p><PitchGrid selectable={block.explicit_response_set} handler={(p, input) => capture(p, index, input)} disabled={!ready} /></>}
 {view === 'confidence' && <div className="confidence-overlay"><p>How sure are you?</p>{[[.4, 'Low'], [.7, 'Medium'], [.95, 'High']].map(([value, label]) => <button className="conf-btn" key={value} disabled={busy} onClick={() => record(value)}>{label}</button>)}<details><summary>Second instinct</summary><label>Another guess <select value={second} onChange={e => {
          setSecond(e.target.value);
          secondLatency.current = performance.now() - secondStart.current;
        }}><option value="">None</option>{block.explicit_response_set.map(p => <option key={p}>{p}</option>)}{block.explicit_response_set.length < 12 && <option>OTHER</option>}</select></label></details></div>}
 {view === 'feedback' && <><h2>{answer.trial_purpose === 'training' ? answer.correct ? 'Correct' : 'Keep listening' : 'Response saved'}</h2>{answer.trial_purpose === 'training' && <p>Target: {answer.target_pitch}{block.explicit_response_set.includes(answer.target_pitch) ? '' : ' · OTHER'} · Your answer: {answer.response}</p>}<button onClick={next}>{index + 1 === block.trials.length ? 'Review block' : 'Next trial'}</button></>}
 {view === 'summary' && <><h2>{session.session_type === 'benchmark' ? 'Benchmark results' : 'Round complete'}</h2><p>{session.session_type === 'adaptive' ? 'Here’s how that round went.' : 'Your answers are ready to review.'}</p><p>Note accuracy: {pct((() => {
          const rates = block.explicit_response_set.map(p => results.filter(t => t.target_pitch === p)).filter(a => a.length).map(a => a.filter(t => t.correct).length / a.length);
          return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
        })())}</p><p>Other-note accuracy: {pct((() => {
          const a = results.filter(t => !block.explicit_response_set.includes(t.target_pitch));
          return a.length ? a.filter(t => t.correct).length / a.length : null;
        })())}</p><details><summary>Review responses</summary>{results.map((t, i) => <p key={i}>{i + 1}. {t.target_pitch} → {t.response} · {t.correct ? 'correct' : 'incorrect'}</p>)}</details>{session.session_type === 'adaptive' && <button onClick={() => createBlock(session).then(b => play(0, b)).catch(e => setError(e.message))}>Keep going</button>}<button onClick={finish}>Finish session</button></>}
 {view === 'map' && <><h2>Your twelve-pitch learner map</h2><p>Stability requires specificity, speed, multiple sessions, and delayed probes. Estimated ranges show uncertainty.</p><div className="pitch-map">{CHROMAS.map(p => {
          const s = model.pitches[p],
            last = data.blocks.filter(b => b.session_type === 'adaptive').at(-1);
          return <article key={p}><h3>{p} · {s.ability_state}</h3><p>Role: {last?.scheduler_state_snapshot.roles[p] ?? 'exploration'}</p><p>{s.observation_count} named observations · {s.exposure_count} encounters</p><p>Acquisition: {s.acquisition_state} · Sober transfer: {s.canonical_estimate.status} · Cross-context: {s.context_generalization}</p><details><summary>Context estimates</summary>{Object.entries(s.contexts).map(([key, c]) => <p key={key}>{key}: {c.observation_count} observations · estimated accuracy {pct(c.shrunk_accuracy)} · median {c.median_rt == null ? '—' : Math.round(c.median_rt) + ' ms'}</p>)}</details><p>Canonical: {pct(s.canonical_accuracy)} · Estimate {pct(s.accuracy.lower)}–{pct(s.accuracy.upper)}</p><p>Training: {pct(s.training_accuracy)} · Benchmark: {pct(s.benchmark_accuracy)}</p><p>Median RT: {s.median_rt == null ? '—' : `${Math.round(s.median_rt)} ms`} · Trend: {s.trend == null ? '—' : `${Math.round(s.trend * 100)} points`}</p><p>False positives: {pct(s.falsePositive.mean)} · Upper bound {pct(s.falsePositive.upper)}</p><p>Confidence error (Brier): {s.confidence_calibration?.toFixed(2) ?? '—'}</p><p>Delayed probes: {s.retention.delayed_correct}/{s.retention.delayed_probes} · Last probe: {s.retention.last_probe ?? 'none'}</p><details><summary>Confusions & robustness</summary><p>{Object.entries(s.confusion).filter(([q, n]) => q !== p && n).sort((a, b) => b[1] - a[1]).map(([q, n]) => `${q}: ${n}`).join(' · ') || 'No observed confusions'}</p>{Object.entries(s.robustness).map(([key, groups]) => <p key={key}>{key}: {Object.entries(groups).map(([k, v]) => `${k} ${pct(v.accuracy)} (n=${v.count})`).join(' · ') || 'No evidence'}</p>)}</details></article>;
        })}</div><CurriculumAnalytics trials={data.trials.filter(t => t.schema_version === 2)} blocks={data.blocks} model={model} /><h2>Benchmark history</h2>{data.blocks.filter(b => b.session_type === 'benchmark').map(b => {
        const rows = data.trials.filter(t => t.block_id === b.id);
        return <p key={b.id}>{b.created_at} · v{b.benchmark_version} · {rows.length}/{b.block_length} trials · {rows.length !== b.block_length ? 'incomplete' : rows.every(t => isCanonical(t) && t.session_context?.audio_output === 'headphones') ? pct(rows.filter(t => t.correct).length / rows.length) : 'nonstandard conditions — excluded from comparison'}</p>;
      })}<button onClick={() => setView('home')}>Back</button></>}
 {!['home', 'map', 'settings'].includes(view) && <button className="quit" disabled={busy} onClick={finish}>End session</button>}
 </main>;
}

function PitchGrid({ selectable, handler, disabled = false }) {
    return <div className="curriculum-grid">{CHROMAS.map(p => <button key={p} disabled={disabled || !selectable.includes(p)} onClick={e => handler(p, e.detail === 0 ? 'keyboard' : 'pointer')}>{p}</button>)}{selectable.length < 12 && <button className="other" disabled={disabled} onClick={e => handler('OTHER', e.detail === 0 ? 'keyboard' : 'pointer')}>OTHER</button>}</div>;
  }
