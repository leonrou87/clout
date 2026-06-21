// CLOUT — real news pulse via GDELT (free, no key, indexes worldwide media).
// One artlist call per figure → real deduped headlines + volume + recency-weighted
// sentiment. Feeds the Cultural Momentum Score. GDELT throttles to ~1 req / 5s, so callers
// MUST space requests; this module just does the fetch + scoring for one figure.

const POS = new Set(('win wins won winner victory triumph record breaks breaking surge soars soar rally rallies historic hit star stellar success successful praise praised acclaim award awards honored celebrate celebrated champion champions launch launches debut unveils unveil rise rising boost tops top best brilliant landmark milestone deal signs signed return returns comeback charity raises hailed dominant dominates leads leading sweep golden').split(' '));
const NEG = new Set(('loss lost lose loses defeat slump crisis scandal controversy backlash criticism criticized slammed accused accuses probe lawsuit sues sued fraud arrested charged guilty banned fined injury injured out sidelined feud drama fallout outrage fury slams blasts boycott apology apologizes denies denied resign resigns fired axed flop bomb plunge plunges drops falling decline struggles struggle quit dispute leak leaked').split(' '));

function scoreTitle(title) {
  const words = String(title).toLowerCase().split(/[^a-z]+/);
  let s = 0;
  for (const w of words) { if (POS.has(w)) s += 1; else if (NEG.has(w)) s -= 1; }
  return Math.max(-1, Math.min(1, s / 2)); // cap each headline to [-1,1]
}
const normTitle = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tidy = (t) => String(t).replace(/\s+/g, ' ').replace(/\s([,.:;!?])/g, '$1').trim();
function parseSeen(s) { // "20260621T040000Z" -> ms
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s || '');
  return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : Date.now();
}
const isoSeen = (s) => new Date(parseSeen(s)).toISOString();

export async function fetchArticles(name, { timespan = '48h', max = 75 } = {}) {
  const q = encodeURIComponent(`"${name}"`);
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=${max}&format=json&timespan=${timespan}&sort=datedesc`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (CLOUT/1.0)' } });
  const text = await res.text();
  if (!text.trimStart().startsWith('{')) throw new Error('gdelt_throttled');
  const data = JSON.parse(text);
  return (data.articles || []).filter((a) => a.title && (!a.language || a.language === 'English'));
}

// One figure's pulse: { volume, sentiment, articles[] }. Never throws (returns empty on error).
export async function pulse(name) {
  let arts;
  try { arts = await fetchArticles(name); } catch (e) { return { volume: 0, sentiment: 0, articles: [], error: e.message }; }
  const seen = new Set(); const uniq = [];
  for (const a of arts) {
    const key = normTitle(a.title);
    if (key.length < 20) continue;           // drop junk / very short titles
    if (seen.has(key)) continue;             // dedupe identical/near-identical headlines
    seen.add(key); uniq.push(a);
  }
  const now = Date.now();
  let num = 0, den = 0;
  for (const a of uniq) {
    const rw = Math.exp(-Math.max(0, (now - parseSeen(a.seendate)) / 3_600_000) / 48);
    num += scoreTitle(a.title) * rw; den += rw;
  }
  const sentiment = den ? Math.max(-1, Math.min(1, num / den)) : 0;
  // pick up to 3 to display — most recent, from distinct outlets
  const display = []; const domains = new Set();
  for (const a of uniq) {
    if (domains.has(a.domain)) continue;
    domains.add(a.domain);
    display.push({ title: tidy(a.title), source: a.domain, url: a.url, published_at: isoSeen(a.seendate), sentiment: Math.round(scoreTitle(a.title) * 100) / 100 });
    if (display.length >= 3) break;
  }
  return { volume: uniq.length, sentiment, articles: display };
}

// composite raw signal from a figure's pulse (same weights as the reference engine)
export function rawFromPulse(p) {
  const v = Math.log1p(p.volume);
  return 1.0 * v + 0.8 * Math.log1p(p.volume * 0.85) + 0.6 * p.sentiment * v;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
