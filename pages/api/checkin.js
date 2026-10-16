import { requireRole } from '../../lib/session';
import { checkIn, undoCheckIn, addGuests, TOKEN_RE } from '../../lib/store';

// POST {token}            -> check a pass in
// POST {walkIn:{name,phone}} -> add + check in a walk-in
// DELETE ?id=             -> undo a check-in (admin)
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'POST') {
      if (!requireRole(req, res, 'staff')) return;
      if (req.body?.walkIn) {
        const [g] = await addGuests([req.body.walkIn], { walkIn: true });
        if (!g) return res.status(400).json({ error: 'Enter a name.' });
        return res.json(await checkIn(g.id, 'walk-in'));
      }
      const token = String(req.body?.token || '').toLowerCase();
      if (!TOKEN_RE.test(token)) return res.json({ status: 'unknown' });
      return res.json(await checkIn(token, String(req.body?.via || 'scan').slice(0, 20)));
    }
    if (req.method === 'DELETE') {
      if (!requireRole(req, res, 'admin')) return;
      await undoCheckIn(String(req.query.id || ''));
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Check-in could not be saved. Try again.' });
  }
}
