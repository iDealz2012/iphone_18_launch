import { requireRole } from '../../lib/session';
import { getSettings, saveSettings } from '../../lib/store';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      if (!requireRole(req, res, 'staff')) return;
      return res.json(await getSettings());
    }
    if (req.method === 'POST') {
      if (!requireRole(req, res, 'admin')) return;
      return res.json(await saveSettings(req.body || {}));
    }
    res.status(405).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Settings could not be saved. Try again.' });
  }
}
