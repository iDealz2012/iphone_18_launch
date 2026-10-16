import { requireRole } from '../../lib/session';
import { listGuests, addGuests, removeGuest, getSettings, usingMemory } from '../../lib/store';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const role = requireRole(req, res, 'staff'); if (!role) return;
      const [guests, settings] = await Promise.all([listGuests(), getSettings()]);
      return res.json({ guests, settings, role, usingMemory });
    }
    if (req.method === 'POST') {
      if (!requireRole(req, res, 'admin')) return;
      const list = Array.isArray(req.body?.guests) ? req.body.guests.slice(0, 500) : [];
      const created = await addGuests(list);
      return res.json({ created });
    }
    if (req.method === 'DELETE') {
      if (!requireRole(req, res, 'admin')) return;
      const id = String(req.query.id || '');
      await removeGuest(id);
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'The guest list could not be reached. Try again.' });
  }
}
