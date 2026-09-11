import { useEffect, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient.js';

export default function Auth({ onAuthChange }) {
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      onAuthChange?.(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      onAuthChange?.(newSession);
    });

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupabaseConfigured()) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    const supabase = getSupabaseClient();
    const { error: authError } = mode === 'sign-up'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    if (mode === 'sign-up') {
      setNotice('Check your email to confirm your account.');
    }
    setPassword('');
  }

  async function handleSignOut() {
    setLoading(true);
    setError('');
    await getSupabaseClient().auth.signOut();
    setLoading(false);
  }

  if (session) {
    return (
      <div className="auth-panel auth-signed-in">
        <span className="auth-status">Signed in as {session.user.email}</span>
        <button type="button" className="pill-btn" onClick={handleSignOut} disabled={loading}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <form className="auth-panel" onSubmit={handleSubmit}>
      <div className="auth-tabs">
        <button
          type="button"
          className={`auth-tab${mode === 'sign-in' ? ' active' : ''}`}
          onClick={() => { setMode('sign-in'); setError(''); setNotice(''); }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`auth-tab${mode === 'sign-up' ? ' active' : ''}`}
          onClick={() => { setMode('sign-up'); setError(''); setNotice(''); }}
        >
          Sign up
        </button>
      </div>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        autoComplete="email"
        required
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
        minLength={6}
        required
      />

      {error && <div className="auth-error">{error}</div>}
      {notice && <div className="auth-notice">{notice}</div>}

      <button type="submit" className="pill-btn" disabled={loading}>
        {loading ? 'Please wait...' : mode === 'sign-up' ? 'Create account' : 'Sign in'}
      </button>
    </form>
  );
}
