// Guest list storage. Uses Upstash Redis on Vercel; falls back to memory
// for local testing when no Redis credentials are set.
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

const K_GUESTS = 'launch:guests';     // hash  token -> {name, phone, walkIn, addedAt}
const K_CHECKINS = 'launch:checkins'; // hash  token -> {at, via}
const K_SETTINGS = 'launch:settings'; // string {venue}

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const usingMemory = !(url && token);

function memoryStore() {
  const g = globalThis;
  if (!g.__launchMem) g.__launchMem = { hashes: {}, strings: {} };
  const m = g.__launchMem;
  const h = (k) => (m.hashes[k] ||= {});
  return {
    async hgetall(k) { return Object.entries(h(k)).flat(); }, // same flat shape as Upstash
    async hget(k, f) { return h(k)[f] ?? null; },
    async hset(k, obj) { Object.assign(h(k), obj); return 1; },
    async hsetnx(k, f, v) { if (f in h(k)) return 0; h(k)[f] = v; return 1; },
    async hdel(k, ...fs) { fs.forEach((f) => delete h(k)[f]); return fs.length; },
    async get(k) { return m.strings[k] ?? null; },
    async set(k, v) { m.strings[k] = v; return 'OK'; },
  };
}

const redis = usingMemory
  ? memoryStore()
  : new Redis({ url, token, automaticDeserialization: false });

const parse = (v) => {
  if (v && typeof v === 'object') return v;
  try { return v ? JSON.parse(v) : null; } catch { return null; }
};

// Upstash returns HGETALL as a flat [field, value, field, value, …] array
// when automatic deserialization is off. Turn it into {field: value}.
async function hashAll(key) {
  const raw = await redis.hgetall(key);
  if (!raw) return {};
  if (!Array.isArray(raw)) return raw;
  const out = {};
  for (let i = 0; i + 1 < raw.length; i += 2) out[raw[i]] = raw[i + 1];
  return out;
}

const ALPH = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newToken() {
  const bytes = crypto.randomBytes(10);
  let s = 'g';
  for (const b of bytes) s += ALPH[b % ALPH.length];
  return s;
}
export const TOKEN_RE = /^g[a-z0-9]{10}$/;

export async function listGuests() {
  const [guests, checks] = await Promise.all([hashAll(K_GUESTS), hashAll(K_CHECKINS)]);
  return Object.entries(guests).filter(([id]) => TOKEN_RE.test(id)).map(([id, v]) => {
    const d = parse(v) || {};
    const ci = parse(checks[id]);
    return { id, name: d.name || '', phone: d.phone || '', walkIn: !!d.walkIn, addedAt: d.addedAt || 0,
      checkedAt: ci ? ci.at : null, via: ci ? ci.via : null };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getGuest(id) {
  if (!TOKEN_RE.test(id)) return null;
  const [d, c] = await Promise.all([redis.hget(K_GUESTS, id), redis.hget(K_CHECKINS, id)]);
  const g = parse(d);
  if (!g) return null;
  const ci = parse(c);
  return { id, ...g, checkedAt: ci ? ci.at : null };
}

export async function addGuests(list, { walkIn = false } = {}) {
  const now = Date.now();
  const obj = {};
  const created = [];
  for (const it of list) {
    const name = String(it.name || '').trim().slice(0, 80);
    if (!name) continue;
    const phone = String(it.phone || '').trim().slice(0, 30);
    const id = newToken();
    obj[id] = JSON.stringify({ name, phone, walkIn, addedAt: now });
    created.push({ id, name, phone, walkIn, addedAt: now, checkedAt: null });
  }
  if (created.length) await redis.hset(K_GUESTS, obj);
  return created;
}

export async function removeGuest(id) {
  await Promise.all([redis.hdel(K_GUESTS, id), redis.hdel(K_CHECKINS, id)]);
}

// Atomic: only the first scan of a pass wins.
export async function checkIn(id, via) {
  const guest = await getGuest(id);
  if (!guest) return { status: 'unknown' };
  const at = Date.now();
  const ok = await redis.hsetnx(K_CHECKINS, id, JSON.stringify({ at, via }));
  if (ok === 1 || ok === true) return { status: 'ok', name: guest.name, walkIn: !!guest.walkIn, at };
  const prev = parse(await redis.hget(K_CHECKINS, id));
  return { status: 'already', name: guest.name, at: prev ? prev.at : null };
}

export async function undoCheckIn(id) {
  await redis.hdel(K_CHECKINS, id);
}

export async function getSettings() {
  return parse(await redis.get(K_SETTINGS)) || { venue: '' };
}
export async function saveSettings(s) {
  const venue = String(s.venue || '').trim().slice(0, 60);
  await redis.set(K_SETTINGS, JSON.stringify({ venue }));
  return { venue };
}
