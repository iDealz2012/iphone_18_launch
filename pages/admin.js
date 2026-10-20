import { useCallback, useEffect, useRef, useState } from 'react';
import { getRole } from '../lib/session';
import { drawCard, passUrl, canvasToBlob, fileNameFor } from '../lib/card';

export async function getServerSideProps({ req }) {
  const role = getRole(req);
  if (role !== 'admin') return { redirect: { destination: '/login?next=/admin', permanent: false } };
  return { props: {} };
}

const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo' });

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json' } });
  if (r.status === 401 || r.status === 403) { window.location.href = '/login?next=/admin'; throw new Error('auth'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Try again.');
  return d;
}

export default function Admin() {
  const [guests, setGuests] = useState([]);
  const [venue, setVenue] = useState('');
  const [venueSaved, setVenueSaved] = useState('');
  const [memory, setMemory] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [bulkShowPhone, setBulkShowPhone] = useState(false);
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [filter, setFilter] = useState('');
  const [card, setCard] = useState(null);       // guest shown in the card preview
  const [toast, setToast] = useState('');
  const [armed, setArmed] = useState('');       // id armed for removal
  const [zipping, setZipping] = useState('');
  const [lastBatch, setLastBatch] = useState(null); // guests from the latest paste
  const [origin, setOrigin] = useState('');
  const canvasRef = useRef(null);
  const toastT = useRef(null);
  const venueLoaded = useRef(false);

  const say = (m) => { setToast(m); clearTimeout(toastT.current); toastT.current = setTimeout(() => setToast(''), 2800); };

  const load = useCallback(async () => {
    try {
      const d = await api('/api/guests');
      setGuests(d.guests); setMemory(!!d.usingMemory);
      setVenueSaved(d.settings.venue || '');
      if (!venueLoaded.current) { venueLoaded.current = true; setVenue(d.settings.venue || ''); }
    } catch (e) { if (e.message !== 'auth') say(e.message); }
  }, []);

  useEffect(() => { setOrigin(window.location.origin); load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  // Draw the open card
  useEffect(() => {
    if (!card || !canvasRef.current) return;
    drawCard(canvasRef.current, { name: card.name, venue: venueSaved, phone: card.showPhone ? card.phone : '', url: passUrl(origin, card.id) }).catch((e) => say(e.message));
  }, [card, venueSaved, origin]);

  async function addOne(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const d = await api('/api/guests', { method: 'POST', body: JSON.stringify({ guests: [{ name, phone, showPhone }] }) });
      setName(''); setPhone(''); setShowPhone(false);
      await load();
      if (d.created[0]) setCard(d.created[0]);
    } catch (err) { if (err.message !== 'auth') say(err.message); }
  }

  async function addBulk() {
    const list = bulk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const parts = l.split(/\t|,/);
      return { name: parts[0].trim(), phone: (parts[1] || '').trim(), showPhone: bulkShowPhone };
    }).filter((g) => g.name);
    if (!list.length) return say('Paste at least one name.');
    try {
      const d = await api('/api/guests', { method: 'POST', body: JSON.stringify({ guests: list }) });
      setBulk(''); setShowBulk(false); await load();
      const batch = { list: d.created, name: `hello18-new-${d.created.length}-cards-${stamp()}.zip` };
      setLastBatch(batch);
      say(`${d.created.length} guest${d.created.length === 1 ? '' : 's'} added. Downloading their cards…`);
      await zipCards(batch.list, batch.name);
    } catch (err) { if (err.message !== 'auth') say(err.message); setZipping(''); }
  }

  async function saveVenue(e) {
    e.preventDefault();
    try { const d = await api('/api/settings', { method: 'POST', body: JSON.stringify({ venue }) }); setVenueSaved(d.venue); say('Venue saved. Every card now shows it.'); }
    catch (err) { if (err.message !== 'auth') say(err.message); }
  }

  async function remove(g) {
    if (armed !== g.id) { setArmed(g.id); setTimeout(() => setArmed((a) => (a === g.id ? '' : a)), 4000); return; }
    try { await api('/api/guests?id=' + g.id, { method: 'DELETE' }); setArmed(''); await load(); say(`${g.name} removed. Their card no longer works.`); }
    catch (err) { if (err.message !== 'auth') say(err.message); }
  }

  async function undo(g) {
    try { await api('/api/checkin?id=' + g.id, { method: 'DELETE' }); await load(); say(`${g.name} marked as not arrived`); }
    catch (err) { if (err.message !== 'auth') say(err.message); }
  }

  async function downloadOne(g) {
    const c = document.createElement('canvas');
    await drawCard(c, { name: g.name, venue: venueSaved, phone: g.showPhone ? g.phone : '', url: passUrl(origin, g.id) });
    saveBlob(await canvasToBlob(c), fileNameFor(g.name));
  }

  function downloadAll() {
    const list = guests.filter((g) => !g.walkIn);
    if (!list.length) return say('Add guests first.');
    return zipCards(list, 'hello18-invitations.zip');
  }

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  async function zipCards(list, zipName) {
    if (zipping) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const c = document.createElement('canvas');
    const used = new Set();
    for (let i = 0; i < list.length; i++) {
      setZipping(`Making cards ${i + 1} / ${list.length}`);
      const g = list[i];
      await drawCard(c, { name: g.name, venue: venueSaved, phone: g.showPhone ? g.phone : '', url: passUrl(origin, g.id) });
      let fn = fileNameFor(g.name);
      if (used.has(fn)) fn = fn.replace('.png', `-${g.id.slice(1, 5)}.png`);
      used.add(fn);
      zip.file(fn, await canvasToBlob(c));
    }
    setZipping('Packing ZIP…');
    const blob = await zip.generateAsync({ type: 'blob' });
    saveBlob(blob, zipName);
    setZipping('');
  }

  function exportCsv() {
    const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const rows = [['Name', 'Phone', 'Type', 'Arrived', 'Arrival time', 'Pass code']];
    guests.forEach((g) => rows.push([g.name, g.phone, g.walkIn ? 'Walk-in' : 'Invited', g.checkedAt ? 'Yes' : 'No', g.checkedAt ? time(g.checkedAt) : '', g.id.toUpperCase()]));
    saveBlob(new Blob(['﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' }), 'hello18-attendance.csv');
  }

  const invited = guests.filter((g) => !g.walkIn);
  const invIn = invited.filter((g) => g.checkedAt);
  const walk = guests.filter((g) => g.walkIn);
  const f = filter.trim().toLowerCase();
  const shown = f ? guests.filter((g) => g.name.toLowerCase().includes(f) || g.phone.includes(f)) : guests;

  return (
    <main className="wrap">
      <div className="top">
        <div className="brand"><small>Admin · Oct 23 · 2:30 PM</small><b>hello18 Guests &amp; Cards</b></div>
        <div className="nav">
          <a className="btn small" href="/scan">Door scanner</a>
          <button className="btn small" onClick={async () => { await fetch('/api/logout', { method: 'POST' }); window.location.href = '/login'; }}>Log out</button>
        </div>
      </div>

      {memory && <div className="note warn">Test mode: no database is connected, so guests disappear when the server restarts. Connect Upstash Redis in Vercel before adding real guests.</div>}

      <div className="stats">
        <div className="stat"><b>{invited.length}</b><span>invited</span></div>
        <div className="stat"><b>{invIn.length}</b><span>invited arrived</span></div>
        <div className="stat"><b>{walk.length}</b><span>walk-ins</span></div>
        <div className="stat"><b>{invIn.length + walk.length}</b><span>total in</span></div>
      </div>

      <form className="block" onSubmit={saveVenue}>
        <h2>Venue on every card</h2>
        <div className="row" style={{ gridTemplateColumns: '1fr auto' }}>
          <input id="venue" type="text" placeholder="e.g. Cinnamon Lakeside" value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={60} />
          <button className="btn" type="submit" disabled={venue.trim() === venueSaved}>Save venue</button>
        </div>
        <p className="hint">{venueSaved ? `Cards show “${venueSaved}”.` : 'No venue yet. Cards are left blank under the name until you save one.'} Changing it updates every card you download afterwards.</p>
      </form>

      <form className="block" onSubmit={addOne}>
        <h2>Add a guest</h2>
        <div className="row">
          <input id="name" type="text" placeholder="Full name, as it should appear on the card" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          <input id="phone" type="tel" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button className="btn primary" type="submit">Create card</button>
        </div>
        <p className="hint">
          <label htmlFor="showPhone" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginRight: 12, color: 'var(--ink)', fontWeight: 600 }}>
            <input id="showPhone" type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} />
            Print phone on card
          </label>
          Their card opens with its own QR, ready to download.{' '}
          <button type="button" className="btn small" onClick={() => setShowBulk((s) => !s)}>{showBulk ? 'Hide' : 'Paste many names'}</button>
        </p>
        {showBulk && (
          <div className="block">
            <textarea id="bulk" placeholder={'One guest per line. Phone is optional:\nPiumi Hansamali, 0771234567\nKasun Perera'} value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <label htmlFor="bulkShowPhone" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
              <input id="bulkShowPhone" type="checkbox" checked={bulkShowPhone} onChange={(e) => setBulkShowPhone(e.target.checked)} />
              Print phone numbers on these cards
            </label>
            <button type="button" className="btn primary" onClick={addBulk}>Add {bulk.split(/\r?\n/).filter((l) => l.trim()).length || ''} guests</button>
          </div>
        )}
      </form>

      <div className="block">
        <div className="top">
          <h2>Guest list</h2>
          <div className="nav">
            {lastBatch && lastBatch.list.length > 0 && (
              <button className="btn small primary" onClick={() => zipCards(lastBatch.list.filter((g) => guests.some((x) => x.id === g.id)), lastBatch.name)} disabled={!!zipping}>
                Download the {lastBatch.list.length} new cards (ZIP)
              </button>
            )}
            <button className="btn small" onClick={downloadAll} disabled={!!zipping}>{zipping || 'Download all cards (ZIP)'}</button>
            <button className="btn small" onClick={exportCsv}>Export attendance</button>
          </div>
        </div>
        <input id="filter" type="search" placeholder="Filter by name or phone" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="list">
          {guests.length === 0 && <div className="empty">No guests yet. Type a name above to create the first card.</div>}
          {guests.length > 0 && shown.length === 0 && <div className="empty">Nobody matches that filter.</div>}
          {shown.map((g) => (
            <div className="item" key={g.id}>
              <div className="who">
                <div className="nm">{g.name}</div>
                <div className="sub">{[g.phone && (g.showPhone ? g.phone + ' (on card)' : g.phone), g.checkedAt ? 'in at ' + time(g.checkedAt) : ''].filter(Boolean).join(' · ') || 'No phone'}</div>
              </div>
              <div className="acts">
                {g.walkIn ? <span className="chip walk">Walk-in</span> : <span className={`chip ${g.checkedAt ? 'in' : 'out'}`}>{g.checkedAt ? 'Arrived' : 'Not yet'}</span>}
                {!g.walkIn && <button className="btn small" onClick={() => setCard(g)}>Card</button>}
                {g.checkedAt && <button className="btn small" onClick={() => undo(g)}>Undo</button>}
                <button className="btn small danger" onClick={() => remove(g)}>{armed === g.id ? 'Confirm remove' : 'Remove'}</button>
              </div>
            </div>
          ))}
        </div>
        <p className="hint">QR codes on cards open <b>{origin || '…'}/c/…</b>. Download cards only from your final web address. If the address changes later, cards already sent will stop working.</p>
      </div>

      {card && (
        <div className="modal" onClick={(e) => { if (e.target === e.currentTarget) setCard(null); }}>
          <div className="sheet">
            <div className="top"><h2>{card.name}</h2><button className="btn small" onClick={() => setCard(null)}>Close</button></div>
            <canvas ref={canvasRef} width="1200" height="1500" />
            <button className="btn primary" onClick={() => downloadOne(card)}>Download card</button>
            <p className="hint">Pass code {card.id.toUpperCase()}</p>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
