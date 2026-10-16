import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { getRole } from '../lib/session';

export async function getServerSideProps({ req }) {
  const role = getRole(req);
  if (!role) return { redirect: { destination: '/login?next=/scan', permanent: false } };
  return { props: { role } };
}

const TOKEN_IN_URL = /\/c\/(g[a-z0-9]{10})\b/i;
const TOKEN_ONLY = /^(g[a-z0-9]{10})$/i;
const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' });

function tokenFrom(text) {
  const t = String(text || '').trim();
  const m = t.match(TOKEN_IN_URL) || t.match(TOKEN_ONLY);
  return m ? m[1].toLowerCase() : null;
}

export default function Scan({ role }) {
  const [guests, setGuests] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [result, setResult] = useState(null);
  const [q, setQ] = useState('');
  const [walkName, setWalkName] = useState('');
  const [walkPhone, setWalkPhone] = useState('');
  const [cam, setCam] = useState('idle'); // idle | starting | on | denied | unsupported
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const pausedRef = useRef(false);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/guests');
      if (r.status === 401) { window.location.href = '/login?next=/scan'; return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setGuests(d.guests); setLoadErr('');
    } catch { setLoadErr('Can’t reach the guest list. Check the internet connection.'); }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load]);

  const submit = useCallback(async (body) => {
    if (busyRef.current) return;
    busyRef.current = true; pausedRef.current = true;
    try {
      const r = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (r.status === 401) { window.location.href = '/login?next=/scan'; return; }
      const d = await r.json();
      setResult(r.ok ? d : { status: 'error', message: d.error });
      if (d.status === 'ok' && navigator.vibrate) navigator.vibrate(120);
      if (d.status !== 'ok' && navigator.vibrate) navigator.vibrate([80, 60, 80]);
      load();
    } catch {
      setResult({ status: 'error', message: 'No connection. Check the internet and scan again.' });
    } finally { busyRef.current = false; }
  }, [load]);

  // Camera scanning loop
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setCam('unsupported'); return; }
    setCam('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current;
      v.srcObject = stream;
      await v.play();
      setCam('on');
    } catch (e) {
      setCam(e && e.name === 'NotAllowedError' ? 'denied' : 'unsupported');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [startCamera]);

  useEffect(() => {
    if (cam !== 'on') return;
    let raf, last = 0, stopped = false;
    const tick = (ts) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      if (pausedRef.current || ts - last < 200) return;
      last = ts;
      const v = videoRef.current, c = canvasRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      const scale = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const code = jsQR(img.data, c.width, c.height, { inversionAttempts: 'dontInvert' });
      if (!code) return;
      const token = tokenFrom(code.data);
      if (token) submit({ token, via: 'scanner' });
      else { pausedRef.current = true; setResult({ status: 'unknown', message: 'That QR is not a hello18 invitation.' }); }
    };
    raf = requestAnimationFrame(tick);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [cam, submit]);

  function next() { setResult(null); setTimeout(() => { pausedRef.current = false; }, 400); }

  const invited = guests.filter((g) => !g.walkIn);
  const arrived = guests.filter((g) => g.checkedAt);
  const invIn = invited.filter((g) => g.checkedAt);
  const walk = guests.filter((g) => g.walkIn);
  const recent = arrived.slice().sort((a, b) => b.checkedAt - a.checkedAt).slice(0, 6);

  const qq = q.trim().toLowerCase(), digits = qq.replace(/\D/g, '');
  const hits = qq ? guests.filter((g) => g.name.toLowerCase().includes(qq) || (digits.length >= 3 && g.phone.replace(/\D/g, '').includes(digits))).slice(0, 15) : [];

  const view = result && ({
    ok: ['✓', result.name, result.walkIn ? `Walk-in checked in at ${time(result.at)}` : `Welcome! Checked in at ${time(result.at)}`],
    already: ['!', result.name, `Already checked in at ${result.at ? time(result.at) : 'an earlier time'}. This pass has been used.`],
    unknown: ['×', 'Not recognised', result.message || 'This pass is not on the guest list. Search by name or add a walk-in.'],
    error: ['×', 'Could not check in', result.message || 'Try again in a moment.'],
  }[result.status] || ['×', 'Could not check in', '']);

  return (
    <main className="wrap">
      <div className="top">
        <div className="brand"><small>Door · Oct 23</small><b>hello18 Check-in</b></div>
        <div className="nav">
          {role === 'admin' && <a className="btn small" href="/admin">Guests &amp; cards</a>}
          <button className="btn small" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}>Log out</button>
        </div>
      </div>

      <div className="block">
        <div className="counter"><b>{arrived.length}</b><span>arrived · {invIn.length} of {invited.length} invited · {walk.length} walk-in{walk.length === 1 ? '' : 's'}</span></div>
        <div className="bar"><i style={{ width: invited.length ? `${Math.min(100, (invIn.length / invited.length) * 100)}%` : '0' }} /></div>
        {loadErr && <div className="note bad">{loadErr}</div>}
      </div>

      <div className="camera">
        <video ref={videoRef} playsInline muted />
        {cam === 'on' && <div className="frame" />}
        {cam !== 'on' && (
          <div className="msg">
            {cam === 'starting' && 'Starting camera…'}
            {cam === 'idle' && <button className="btn primary" onClick={startCamera}>Start camera</button>}
            {cam === 'denied' && <div>Camera access was blocked. Allow the camera for this site in the browser settings, then <button className="btn small" onClick={startCamera}>try again</button>.</div>}
            {cam === 'unsupported' && <div>The camera isn’t available in this browser. Open this page in Safari or Chrome, or search by name below.</div>}
          </div>
        )}
        <canvas ref={canvasRef} hidden />
      </div>
      <p className="hint">Hold the invitation card&rsquo;s QR inside the frame. It checks in automatically.</p>

      <div className="block">
        <h2>Forgot their card?</h2>
        <input id="search" type="search" placeholder="Search by name or last digits of phone" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        {qq && (
          <div className="list">
            {hits.length === 0 && <div className="empty">No guest matches. Add them as a walk-in below.</div>}
            {hits.map((g) => (
              <div className="item" key={g.id}>
                <div className="who"><div className="nm">{g.name}</div><div className="sub">{[g.phone, g.checkedAt ? 'in at ' + time(g.checkedAt) : ''].filter(Boolean).join(' · ') || 'No phone'}</div></div>
                <div className="acts">
                  {g.checkedAt ? <span className="chip in">Arrived</span>
                    : <button className="btn small primary" onClick={() => { submit({ token: g.id, via: 'search' }); setQ(''); }}>Check in</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="block">
        <h2>Walk-in</h2>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (!walkName.trim()) return; submit({ walkIn: { name: walkName, phone: walkPhone } }); setWalkName(''); setWalkPhone(''); }}>
          <input id="walkName" type="text" placeholder="Name" value={walkName} onChange={(e) => setWalkName(e.target.value)} required />
          <input id="walkPhone" type="tel" placeholder="Phone (optional)" value={walkPhone} onChange={(e) => setWalkPhone(e.target.value)} />
          <button className="btn" type="submit">Check in walk-in</button>
        </form>
      </div>

      <div className="block">
        <h2>Latest arrivals</h2>
        <div className="list">
          {recent.length === 0 && <div className="empty">Arrivals appear here as guests are scanned.</div>}
          {recent.map((g) => (
            <div className="item" key={g.id}>
              <div className="who"><div className="nm">{g.name}</div><div className="sub">{time(g.checkedAt)}</div></div>
              <span className={`chip ${g.walkIn ? 'walk' : 'in'}`}>{g.walkIn ? 'Walk-in' : 'Arrived'}</span>
            </div>
          ))}
        </div>
      </div>

      {result && (
        <div className={`result ${result.status}`} role="alert">
          <div className="card">
            <div className="mark">{view[0]}</div>
            <div className="big">{view[1]}</div>
            <p>{view[2]}</p>
            <button className="btn primary big" onClick={next} autoFocus>Next guest</button>
          </div>
        </div>
      )}
    </main>
  );
}
