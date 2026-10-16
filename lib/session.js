// Signed login cookie. Two roles: "admin" (guest list + cards) and "staff" (door scanning).
import crypto from 'crypto';

const COOKIE = 'lc_session';
const HOURS = 14;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET is missing or shorter than 16 characters');
  return s;
}
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function roleForPassword(pw) {
  const admin = process.env.ADMIN_PASSWORD, staff = process.env.STAFF_PASSWORD;
  if (admin && safeEqual(pw, admin)) return 'admin';
  if (staff && safeEqual(pw, staff)) return 'staff';
  return null;
}

export function setSession(res, role) {
  const payload = Buffer.from(JSON.stringify({ role, exp: Date.now() + HOURS * 3600e3 })).toString('base64url');
  const value = `${payload}.${sign(payload)}`;
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${HOURS * 3600}${secure}`);
}

export function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function getRole(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  try {
    if (!safeEqual(sig, sign(payload))) return null;
    const { role, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!exp || Date.now() > exp) return null;
    return role === 'admin' || role === 'staff' ? role : null;
  } catch { return null; }
}

// For API routes: returns the role or ends the response with 401/403.
export function requireRole(req, res, needed) {
  const role = getRole(req);
  if (!role) { res.status(401).json({ error: 'Please log in again.' }); return null; }
  if (needed === 'admin' && role !== 'admin') { res.status(403).json({ error: 'Admin login needed.' }); return null; }
  return role;
}
