import { roleForPassword, setSession } from '../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const role = roleForPassword(String(req.body?.password || ''));
  if (!role) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return res.status(401).json({ error: 'Wrong password.' });
  }
  setSession(res, role);
  res.json({ role });
}
