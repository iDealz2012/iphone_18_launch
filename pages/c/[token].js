// What a pass's QR opens.
// - Door staff (logged in) scanning with the phone camera: checks the guest in.
// - Anyone else (e.g. the guest): a friendly welcome, nothing is changed.
import { getRole } from '../../lib/session';
import { getGuest, checkIn, getSettings } from '../../lib/store';

export async function getServerSideProps({ req, res, params }) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String(params.token || '').toLowerCase();
  const role = getRole(req);
  try {
    if (role) {
      const result = await checkIn(id, 'camera');
      return { props: { mode: 'staff', result } };
    }
    const g = await getGuest(id);
    const s = await getSettings();
    return { props: { mode: 'guest', name: g ? g.name : null, venue: s.venue || '' } };
  } catch (e) {
    console.error(e);
    return { props: { mode: role ? 'staff' : 'guest', result: { status: 'error' }, name: null, venue: '' } };
  }
}

const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' });

export default function Pass({ mode, result, name, venue }) {
  if (mode === 'staff') {
    const r = result || { status: 'error' };
    const view = {
      ok: ['✓', r.name, `Checked in at ${r.at ? time(r.at) : ''}`],
      already: ['!', r.name, `Already checked in at ${r.at ? time(r.at) : 'an earlier time'}. This pass has been used.`],
      unknown: ['×', 'Not recognised', 'This pass is not on the guest list.'],
      error: ['×', 'Could not check in', 'The guest list could not be reached. Try again.'],
    }[r.status] || ['×', 'Could not check in', ''];
    return (
      <div className={`result ${r.status}`}>
        <div className="card">
          <div className="mark">{view[0]}</div>
          <div className="big">{view[1]}</div>
          <p>{view[2]}</p>
          <a className="btn primary big" href="/scan">Next guest</a>
        </div>
      </div>
    );
  }
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
