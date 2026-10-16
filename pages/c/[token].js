// What a card's QR opens when scanned with a normal phone camera.
// - Logged-in staff: shows the guest and a Check in button. Nothing happens until they tap it.
// - Anyone else (e.g. the guest): a friendly welcome. Nothing is changed.
// The door scanner at /scan checks guests in directly.
import { useState } from 'react';
import { getRole } from '../../lib/session';
import { getGuest, getSettings } from '../../lib/store';

export async function getServerSideProps({ req, res, params }) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(params.token || '').toLowerCase();
  const role = getRole(req);
  try {
    const [g, s] = await Promise.all([getGuest(id), getSettings()]);
    return { props: {
      mode: role ? 'staff' : 'guest',
      id,
      name: g ? g.name : null,
      checkedAt: g ? g.checkedAt : null,
      venue: s.venue || '',
    } };
  } catch (e) {
    console.error(e);
    return { props: { mode: role ? 'staff' : 'guest', id, name: null, checkedAt: null, venue: '', error: true } };
  }
}

const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' });

function StaffView({ id, name, checkedAt, error }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function checkIn() {
    setBusy(true);
    try {
      const r = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: id, via: 'camera' }) });
      if (r.status === 401) { window.location.href = '/login?next=/c/' + id; return; }
      const d = await r.json();
      setResult(r.ok ? d : { status: 'error' });
    } catch { setResult({ status: 'error' }); }
    setBusy(false);
  }

  let kind, mark, title, text;
  if (error) { kind = 'error'; mark = '×'; title = 'Could not load'; text = 'The guest list could not be reached. Try again.'; }
  else if (!name) { kind = 'unknown'; mark = '×'; title = 'Not recognised'; text = 'This card is not on the guest list.'; }
  else if (result?.status === 'ok') { kind = 'ok'; mark = '✓'; title = name; text = `Checked in at ${time(result.at)}`; }
  else if (result?.status === 'already' || (!result && checkedAt)) { kind = 'already'; mark = '!'; title = name; text = `Already checked in at ${time(result?.at || checkedAt)}. This card has been used.`; }
  else if (result) { kind = 'error'; mark = '×'; title = 'Could not check in'; text = 'Try again in a moment.'; }
  else { kind = 'pending'; mark = ''; title = name; text = 'Not checked in yet.'; }

  return (
    <div className={`result ${kind === 'pending' ? 'ok' : kind}`}>
      <div className="card" style={kind === 'pending' ? { background: 'var(--surface)', borderColor: 'var(--line)' } : undefined}>
        {mark && <div className="mark">{mark}</div>}
        <div className="big">{title}</div>
        <p>{text}</p>
        {kind === 'pending' && <button className="btn primary big" onClick={checkIn} disabled={busy}>{busy ? 'Checking in…' : 'Check in'}</button>}
        <a className="btn big" href="/scan">Open door scanner</a>
      </div>
    </div>
  );
}

export default function Pass(props) {
  if (props.mode === 'staff') return <StaffView {...props} />;
  const { name, venue } = props;
  return (
    <main className="guest">
      <div className="inner">
        <div className="brand"><small>iDealz · Friday, October 23 · 2:30 PM</small></div>
        {name ? (
          <>
            <h1>Hi {name}, see you there.</h1>
            <p className="hint">Show your invitation card at the entrance and our team will scan it.{venue ? ` Venue: ${venue}.` : ''}</p>
          </>
        ) : (
          <>
            <h1>This invitation isn&rsquo;t valid</h1>
            <p className="hint">Please contact iDealz if you think this is a mistake.</p>
          </>
        )}
      </div>
    </main>
  );
}
