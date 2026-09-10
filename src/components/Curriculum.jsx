import { useEffect, useMemo, useRef, useState } from 'react';
import { CHROMAS, INSTRUMENTS, nearestSample } from '../audio/constants.js';
import { audioEngine } from '../audio/AudioEngine.js';
import { getAllTrials, getMeta, setMeta, getRecords, putRecord, saveTrial, exportJSON } from '../db/db.js';
import { estimate, VERSIONS } from '../curriculum/model.js';
import { schedule, generateSequence } from '../curriculum/scheduler.js';
import { benchmark } from '../curriculum/benchmark.js';
import { playStimulus } from '../curriculum/audio.js';
import './Curriculum.css';
import CurriculumAnalytics from './CurriculumAnalytics.jsx';
const pct = v => v == null ? '—' : `${Math.round(v * 100)}%`;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const id = () => crypto.randomUUID();
export default function Curriculum({
  onManual
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
    [confidence, setConfidence] = useState(.7),
    [busy, setBusy] = useState(false);
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
      b = schedule(m, previous, seed());
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
    setView('boundary');
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
      await putRecord('sessions', s);
      setSession(s);
      await createBlock(s);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function play(i = index) {
    audioEngine.initSync();
    const token = ++generation.current;
    clearTimeout(timer.current);
    setReady(false);
    setAnswer(null);
    setSecond('');
    secondLatency.current = null;
    pending.current = null;
    gate.current = false;
    setView('trial');
    try {
      const ctx = audioEngine.ctx,
        gapSec = block.trials[i].intertrial_ms / 1000,
        length = Math.floor(ctx.sampleRate * gapSec),
        buf = ctx.createBuffer(1, length, ctx.sampleRate),
        samples = buf.getChannelData(0);
      // Mask the whole intertrial gap at an audible level (matching
      // AudioEngine's established white-noise-mask gain) so the previous
      // trial's pitch doesn't linger in silence right up to the next onset.
      for (let j = 0; j < length; j++) samples[j] = (Math.random() * 2 - 1) * .3;
      const noise = ctx.createBufferSource(),
        noiseGain = ctx.createGain();
      noise.buffer = buf;
      noiseGain.gain.setValueAtTime(.3, ctx.currentTime);
      noiseGain.gain.setValueAtTime(.3, ctx.currentTime + gapSec - .05);
      noiseGain.gain.linearRampToValueAtTime(0, ctx.currentTime + gapSec);
      noise.connect(noiseGain);
      noiseGain.connect(audioEngine.masterGain);
      noise.start();
      timer.current = setTimeout(async () => {
        try {
          if (token !== generation.current) return;
          const timing = await playStimulus(block.trials[i]);
          if (token !== generation.current) return;
          onset.current = timing;
          timer.current = setTimeout(() => {
            if (token !== generation.current) return;
            setReady(true);
            timer.current = setTimeout(() => capture('TIMEOUT', i), Math.max(0, timing.onset + block.response_window_ms - performance.now()));
          }, Math.max(0, timing.onset - performance.now()));
        } catch (e) {
          setError(e.message);
        }
      }, block.trials[i].intertrial_ms);
    } catch (e) {
      setError(e.message);
    }
  }
  function capture(response, i = index, input = 'pointer') {
    if (gate.current) return;
    gate.current = true;
    clearTimeout(timer.current);
    setReady(false);
    const latency = Math.max(0, performance.now() - onset.current.onset),
      r = latency > block.response_window_ms ? 'TIMEOUT' : response;
    pending.current = {
      response: r,
      latency_ms: Math.min(latency, block.response_window_ms),
      input_method: input,
      index: i,
      sample_id: onset.current.sampleId,
      sample_onset_offset: onset.current.sampleOnsetOffsetMs
    };
    secondStart.current = performance.now();
    setView('confidence');
  }
  async function record() {
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
  function grid(selectable, handler, disabled = false) {
    return <div className="curriculum-grid">{CHROMAS.map(p => <button key={p} disabled={disabled || !selectable.includes(p)} onClick={e => handler(p, e.detail === 0 ? 'keyboard' : 'pointer')}>{p}</button>)}{selectable.length < 12 && <button className="other" disabled={disabled} onClick={e => handler('OTHER', e.detail === 0 ? 'keyboard' : 'pointer')}>OTHER</button>}</div>;
  }
  if (!data) return <main className="curriculum"><h1>AP Trainer</h1><p>{error || 'Loading your history…'}</p></main>;
  return <main className="curriculum"><header><h1>AP Trainer</h1><p>Adaptive chromatic curriculum</p></header>{error && <p role="alert">{error}</p>}
 {view === 'home' && <><h2>Twelve pitches. Your pace.</h2><p>Build accurate, fast recognition that lasts. Training adapts between blocks; benchmark results remain separate.</p><div className="curriculum-controls"><label>Experience <select value={experience} onChange={e => setExperience(e.target.value)}><option value="new">New / untrained</option><option value="returning">Returning / pretrained</option></select></label><label><input type="checkbox" checked={sober} onChange={e => setSober(e.target.checked)} /> Sober</label><label><input type="checkbox" checked={focused} onChange={e => setFocused(e.target.checked)} /> Focused, no concurrent task</label><label>Alertness <select value={alertness} onChange={e => setAlertness(e.target.value)}><option>ordinary</option><option>high</option><option>low</option></select></label><label>Audio <select value={output} onChange={e => setOutput(e.target.value)}><option>headphones</option><option>speakers</option><option>other</option></select></label><label>Context / notes <input value={notes} onChange={e => setNotes(e.target.value)} /></label></div><div className="curriculum-actions"><button disabled={busy} onClick={() => start('adaptive')}>Start adaptive training</button><button disabled={busy} onClick={() => start('mapping')}>Map current ability</button><button disabled={busy} onClick={() => start('benchmark')}>Benchmark · 72 trials</button><button onClick={() => setView('map')}>Learner map</button><button onClick={backup}>Download full backup</button><button onClick={newEpoch}>Start a new training epoch</button><button onClick={onManual}>Manual practice & historical tools</button></div><p>Historical trials are preserved. A new epoch restarts curriculum selection and downweights previous evidence without deleting history.</p></>}
 {view === 'boundary' && <><h2>Block {block.block_index + 1}</h2><p>{block.trials.length} trials · {block.explicit_response_set.length} named responses{block.explicit_response_set.length < 12 ? ' plus OTHER' : ''}. These choices stay fixed throughout the block.</p>{grid(block.explicit_response_set, () => {})}<p>OTHER means the sound does not match any named choice. Diagnostic feedback appears after the block.</p><button onClick={() => play()}>Begin block</button></>}
 {view === 'trial' && <><h2>Trial {index + 1} / {block.trials.length}</h2><p aria-live="polite">{ready ? 'Identify the pitch' : 'Listen…'}</p>{grid(block.explicit_response_set, (p, input) => capture(p, index, input), !ready)}</>}
 {view === 'confidence' && <><h2>Response recorded</h2><label>Confidence <select value={confidence} onChange={e => setConfidence(e.target.value)}><option value={.4}>Low</option><option value={.7}>Medium</option><option value={.95}>High</option></select></label><label>Second instinct (optional) <select value={second} onChange={e => {
          setSecond(e.target.value);
          secondLatency.current = performance.now() - secondStart.current;
        }}><option value="">None</option>{block.explicit_response_set.map(p => <option key={p}>{p}</option>)}{block.explicit_response_set.length < 12 && <option>OTHER</option>}</select></label><p>Your first response remains the scored answer.</p><button disabled={busy} onClick={record}>Save response</button></>}
 {view === 'feedback' && <><h2>{answer.trial_purpose === 'training' ? answer.correct ? 'Correct' : 'Keep listening' : 'Response saved'}</h2>{answer.trial_purpose === 'training' && <p>Target: {answer.target_pitch}{block.explicit_response_set.includes(answer.target_pitch) ? '' : ' · OTHER'} · Your answer: {answer.response}</p>}<button onClick={next}>{index + 1 === block.trials.length ? 'Review block' : 'Next trial'}</button></>}
 {view === 'summary' && <><h2>{session.session_type === 'benchmark' ? 'Benchmark results' : 'Block results'}</h2><p>{session.session_type === 'adaptive' ? 'Training performance is conditioned on the adaptive policy.' : 'Diagnostic measurement; feedback was withheld.'}</p><p>Named balanced accuracy: {pct((() => {
          const rates = block.explicit_response_set.map(p => results.filter(t => t.target_pitch === p)).filter(a => a.length).map(a => a.filter(t => t.correct).length / a.length);
          return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
        })())}</p><p>OTHER for this vocabulary: {pct((() => {
          const a = results.filter(t => !block.explicit_response_set.includes(t.target_pitch));
          return a.length ? a.filter(t => t.correct).length / a.length : null;
        })())}</p><details><summary>Review responses</summary>{results.map((t, i) => <p key={i}>{i + 1}. {t.target_pitch} → {t.response} · {t.correct ? 'correct' : 'incorrect'}</p>)}</details>{session.session_type === 'adaptive' && <button onClick={() => createBlock(session).catch(e => setError(e.message))}>Prepare next block</button>}<button onClick={finish}>Finish session</button></>}
 {view === 'map' && <><h2>Your twelve-pitch learner map</h2><p>Stability requires specificity, speed, multiple sessions, and delayed probes. Estimated ranges show uncertainty.</p><div className="pitch-map">{CHROMAS.map(p => {
          const s = model.pitches[p],
            last = data.blocks.filter(b => b.session_type === 'adaptive').at(-1);
          return <article key={p}><h3>{p} · {s.ability_state}</h3><p>Role: {last?.scheduler_state_snapshot.roles[p] ?? 'exploration'}</p><p>{s.observation_count} named observations · {s.exposure_count} encounters</p><p>Canonical: {pct(s.canonical_accuracy)} · Estimate {pct(s.accuracy.lower)}–{pct(s.accuracy.upper)}</p><p>Training: {pct(s.training_accuracy)} · Benchmark: {pct(s.benchmark_accuracy)}</p><p>Median RT: {s.median_rt == null ? '—' : `${Math.round(s.median_rt)} ms`} · Trend: {s.trend == null ? '—' : `${Math.round(s.trend * 100)} points`}</p><p>False positives: {pct(s.falsePositive.mean)} · Upper bound {pct(s.falsePositive.upper)}</p><p>Confidence error (Brier): {s.confidence_calibration?.toFixed(2) ?? '—'}</p><p>Delayed probes: {s.retention.delayed_correct}/{s.retention.delayed_probes} · Last probe: {s.retention.last_probe ?? 'none'}</p><details><summary>Confusions & robustness</summary><p>{Object.entries(s.confusion).filter(([q, n]) => q !== p && n).sort((a, b) => b[1] - a[1]).map(([q, n]) => `${q}: ${n}`).join(' · ') || 'No observed confusions'}</p>{Object.entries(s.robustness).map(([key, groups]) => <p key={key}>{key}: {Object.entries(groups).map(([k, v]) => `${k} ${pct(v.accuracy)} (n=${v.count})`).join(' · ') || 'No evidence'}</p>)}</details></article>;
        })}</div><CurriculumAnalytics trials={data.trials.filter(t => t.schema_version === 2)} blocks={data.blocks} model={model} /><h2>Benchmark history</h2>{data.blocks.filter(b => b.session_type === 'benchmark').map(b => {
        const rows = data.trials.filter(t => t.block_id === b.id);
        return <p key={b.id}>{b.created_at} · v{b.benchmark_version} · {rows.length}/{b.block_length} trials · {rows.length === b.block_length ? pct(rows.filter(t => t.correct).length / rows.length) : 'incomplete'}</p>;
      })}<button onClick={() => setView('home')}>Back</button></>}
 {!['home', 'map'].includes(view) && <button className="quit" disabled={busy} onClick={finish}>End session</button>}
 </main>;
}
