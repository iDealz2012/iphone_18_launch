import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Login failed.'); setBusy(false); return; }
      const next = typeof router.query.next === 'string' && router.query.next.startsWith('/') ? router.query.next : (d.role === 'admin' ? '/admin' : '/scan');
      window.location.href = next;
    } catch { setErr('No connection. Check the internet and try again.'); setBusy(false); }
  }

  return (
    <main className="login">
      <form onSubmit={submit}>
        <div className="brand"><small>iDealz · Oct 23</small><b>hello18 Check-in</b></div>
        <label className="lbl" htmlFor="pw">Password
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" required />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Log in'}</button>
        <p className="hint">Admins manage guests and cards. Door staff scan passes.</p>
      </form>
    </main>
  );
}
