// Fetches fixtures, results and tables from API-Football and writes data.json for the page.
// Usage:  APISPORTS_KEY=xxx node scripts/update.mjs
//         node scripts/update.mjs --mock      (uses test/mock/*.json, no network)
// Safety: a competition that fails or comes back empty keeps its previous data, and
// data.json is only replaced when the new file passes validation.

import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(ROOT, ...p);
const MOCK = process.argv.includes('--mock');
const KEY = process.env.APISPORTS_KEY;
const BASE = 'https://v3.football.api-sports.io';
const TZ = 'Asia/Riyadh';

const readJSON = async (f, fallback) => { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return fallback; } };
const cfg = await readJSON(P('config/competitions.json'));
const editorial = await readJSON(P('config/editorial.json'), {});
const arRaw = await readJSON(P('config/teams-ar.json'), {});
const previous = await readJSON(P('data.json'), { matches: [], tables: {} });

// ---------- names ----------
const DROP = new Set(['al', 'el', 'fc', 'sc', 'cf', 'club', 'saudi', 'sfc', 'afc']);
export function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(t => t && !DROP.has(t)).join(' ');
}
const AR = new Map(Object.entries(arRaw).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [norm(k), v]));
const missing = new Set();
function ar(name) {
  const hit = AR.get(norm(name));
  if (!hit) missing.add(name);
  return hit || name;
}
const BIG = new Set((cfg.bigClubs || []).map(norm));

// ---------- api ----------
let calls = 0;
async function api(endpoint, params) {
  if (MOCK) {
    const f = P('test/mock', `${endpoint}_${params.league ?? 'team' + params.team}.json`);
    return readJSON(f, { response: [] });
  }
  const url = new URL(BASE + '/' + endpoint);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls++;
    const res = await fetch(url, { headers: { 'x-apisports-key': KEY } });
    if (res.status === 429 || res.status >= 500) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
    const body = await res.json();
    const errs = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
    if (errs && errs.length) throw new Error(`${endpoint} ${JSON.stringify(params)}: ${JSON.stringify(body.errors)}`);
    return body;
  }
  throw new Error(`${endpoint} ${JSON.stringify(params)}: gave up after retries`);
}

// ---------- transform ----------
const FT = new Set(['FT', 'AET', 'PEN']);
const LIVE = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE', 'SUSP']);
const OFF = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);

export function roundAr(r) {
  if (!r) return '';
  let m = r.match(/(?:Regular Season|League Stage|Group Stage|Matchday)\s*-\s*(\d+)/i);
  if (m) return 'الجولة ' + m[1];
  m = r.match(/Group\s+([A-Z])\s*-\s*(\d+)/i);
  if (m) return `المجموعة ${m[1]} · الجولة ${m[2]}`;
  const map = { 'Round of 32': 'دور الـ32', 'Round of 16': 'دور الـ16', 'Quarter-finals': 'ربع النهائي', 'Semi-finals': 'نصف النهائي', 'Final': 'النهائي', 'Play-offs': 'الملحق', 'Preliminary Round': 'الدور التمهيدي' };
  for (const [k, v] of Object.entries(map)) if (r.includes(k)) return v;
  return r;
}

export function toMatch(code, f) {
  const st = f.fixture.status.short;
  const status = FT.has(st) ? 'ft' : LIVE.has(st) ? 'live' : OFF.has(st) ? 'off' : 'ns';
  const h = f.teams.home.name, a = f.teams.away.name;
  const m = {
    c: code, id: f.fixture.id, t: new Date(f.fixture.date).toISOString(), st: status,
    h: ar(h), a: ar(a),
    big: code === 'spl' || code === 'acle' || code === 'kcup' || code === 'ksa' || BIG.has(norm(h)) || BIG.has(norm(a)),
    round: roundAr(f.league.round)
  };
  if (status === 'ft' || status === 'live') { m.hs = f.goals.home ?? 0; m.as = f.goals.away ?? 0; }
  if (status === 'live' && f.fixture.status.elapsed != null) m.min = f.fixture.status.elapsed;
  if (st === 'TBD') m.notime = true;
  if (code === 'spl' || code === 'ksa') {
    const v = [f.fixture.venue?.name, f.fixture.venue?.city].filter(Boolean).join('، ');
    if (v) m.venue = v;
  }
  if (code === 'ksa') m.comp = f.league.name;
  return m;
}

export function toTable(resp) {
  const rows = resp?.[0]?.league?.standings?.[0] || [];
  return rows.map(r => ({
    r: r.rank, n: ar(r.team.name), w: r.all.win, d: r.all.draw, l: r.all.lose,
    gf: r.all.goals.for, ga: r.all.goals.against, p: r.points
  }));
}

function ymd(d) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }

function pickSpotlight(matches, tables) {
  if (editorial.spotlight) return editorial.spotlight;
  const now = Date.now();
  const top = new Set((tables.spl || []).slice(0, 4).map(r => r.n));
  const next = matches.filter(m => m.st === 'ns' && new Date(m.t) > now).sort((x, y) => x.t.localeCompare(y.t));
  const s = next.find(m => m.c === 'spl' && top.has(m.h) && top.has(m.a))
        || next.find(m => m.c === 'ksa')
        || next.find(m => m.c === 'acle');
  if (!s) return null;
  const rank = n => (tables.spl || []).find(r => r.n === n)?.r;
  const note = s.c === 'spl' && rank(s.h) && rank(s.a) ? `مواجهة بين المركزين ${rank(s.h)} و${rank(s.a)}` : (s.round || '');
  return { c: s.c, t: s.t, h: s.h, a: s.a, venue: s.venue || '', note };
}

// ---------- run ----------
if (!MOCK && !KEY) { console.error('APISPORTS_KEY is not set'); process.exit(1); }

const now = new Date();
const from = ymd(new Date(now - cfg.window.pastDays * 864e5));
const to = ymd(new Date(+now + cfg.window.futureDays * 864e5));
const matches = [], tables = {}, failed = [];

for (const comp of cfg.competitions) {
  try {
    const q = comp.team ? { team: comp.team, season: comp.season, from, to, timezone: TZ }
                        : { league: comp.id, season: comp.season, from, to, timezone: TZ };
    const fx = await api('fixtures', q);
    const got = (fx.response || []).map(f => toMatch(comp.code, f));
    if (got.length) matches.push(...got);
    else matches.push(...previous.matches.filter(m => m.c === comp.code && new Date(m.t) > new Date(now - cfg.window.pastDays * 864e5)));

    if (comp.table) {
      const s = await api('standings', { league: comp.id, season: comp.season });
      const t = toTable(s.response);
      tables[comp.code] = t.length ? t : (previous.tables?.[comp.code] || []);
    }
  } catch (e) {
    failed.push(comp.code);
    console.error(`[${comp.code}] ${e.message} — keeping previous data`);
    matches.push(...previous.matches.filter(m => m.c === comp.code));
    if (comp.table && previous.tables?.[comp.code]) tables[comp.code] = previous.tables[comp.code];
  }
}

// de-duplicate (a national-team match can also appear under another competition)
const seen = new Set();
const unique = matches.filter(m => { const k = m.id ?? `${m.c}|${m.t}|${m.h}`; if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => a.t.localeCompare(b.t));

const out = {
  updated: now.toISOString(),
  notice: editorial.notice || '',
  spotlight: pickSpotlight(unique, tables),
  dates: editorial.dates || [],
  matches: unique,
  tables
};

// validation: never publish an obviously broken file
const problems = [];
if (!unique.length) problems.push('no matches at all');
if (failed.length === cfg.competitions.length) problems.push('every competition failed');
for (const m of unique) if (!m.h || !m.a || isNaN(new Date(m.t))) { problems.push('malformed match ' + JSON.stringify(m)); break; }
if (problems.length) { console.error('Not writing data.json: ' + problems.join('; ')); process.exit(1); }

await writeFile(P('data.json.tmp'), JSON.stringify(out));
await rename(P('data.json.tmp'), P('data.json'));
await writeFile(P('missing-names.txt'), [...missing].sort().join('\n') + (missing.size ? '\n' : ''));
console.log(`data.json: ${unique.length} matches, ${Object.keys(tables).length} tables, ${calls} API calls` +
  (failed.length ? `, kept old data for: ${failed.join(', ')}` : '') +
  (missing.size ? `, ${missing.size} names without Arabic (see missing-names.txt)` : ''));
