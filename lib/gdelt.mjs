// CLOUT — real news pulse via Google News RSS (free, no key, lenient, worldwide).
// One RSS query per figure → real deduped recent headlines + volume + recency-weighted
// sentiment. Feeds the Cultural Momentum Score. (We switched off GDELT's API because its
// free endpoint hard-throttles datacenter IPs; Google News RSS is serverless-friendly.)

const POS = new Set(('win wins won winner victory triumph record breaks breaking surge soars soar rally rallies historic hit star stellar success successful praise praised acclaim award awards honored celebrate celebrated champion champions launch launches debut unveils unveil rise rising boost tops top best brilliant landmark milestone deal signs signed return returns comeback charity raises hailed dominant dominates leads leading sweep golden engaged wedding').split(' '));
const NEG = new Set(('loss lost lose loses defeat slump crisis scandal controversy backlash criticism criticized slammed accused accuses probe lawsuit sues sued fraud arrested charged guilty banned fined injury injured out sidelined feud drama fallout outrage fury slams blasts boycott apology apologizes denies denied resign resigns fired axed flop bomb plunge plunges drops falling decline struggles struggle quit dispute leak leaked split breakup canceled').split(' '));

function scoreTitle(title) {
  const words = String(title).toLowerCase().split(/[^a-z]+/);
  let s = 0;
  for (const w of words) { if (POS.has(w)) s += 1; else if (NEG.has(w)) s -= 1; }
  return Math.max(-1, Math.min(1, s / 2));
}
const decode = (s) => String(s).replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
const normTitle = (t) => String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const pick = (block, tag) => { const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block); return m ? decode(m[1]) : ''; };

export async function fetchItems(name, { timeoutMs = 8000 } = {}) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${name}"`)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (CLOUT/1.0)' }, signal: AbortSignal.timeout(timeoutMs) });
  const xml = await res.text();
  if (!xml.includes('<item>')) throw new Error('no_items');
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => {
    const b = m[1];
    let title = pick(b, 'title');
    const source = pick(b, 'source');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(` - ${source}`).length);
    return { title, source, url: pick(b, 'link'), pubDate: pick(b, 'pubDate') };
  }).filter((a) => a.title);
}

// One figure's pulse: { volume, sentiment, articles[] }. Never throws.
export async function pulse(name) {
  let items;
  try { items = await fetchItems(name); } catch (e) { return { volume: 0, sentiment: 0, articles: [], error: e.message }; }
  const seen = new Set(); const uniq = [];
  for (const a of items) {
    const key = normTitle(a.title);
    if (key.length < 18) continue;
    if (seen.has(key)) continue;
    seen.add(key); uniq.push(a);
  }
  const now = Date.now();
  let num = 0, den = 0;
  for (const a of uniq) {
    const t = Date.parse(a.pubDate) || now;
    const rw = Math.exp(-Math.max(0, (now - t) / 3_600_000) / 72); // 72h decay
    num += scoreTitle(a.title) * rw; den += rw;
  }
  const sentiment = den ? Math.max(-1, Math.min(1, num / den)) : 0;
  const display = []; const srcs = new Set();
  for (const a of uniq) {
    const s = a.source || 'news';
    if (srcs.has(s)) continue;
    srcs.add(s);
    display.push({ title: a.title, source: s, url: a.url, published_at: new Date(Date.parse(a.pubDate) || now).toISOString(), sentiment: Math.round(scoreTitle(a.title) * 100) / 100 });
    if (display.length >= 3) break;
  }
  return { volume: uniq.length, sentiment, articles: display };
}

export function rawFromPulse(p) {
  const v = Math.log1p(p.volume);
  return 1.0 * v + 0.8 * Math.log1p(p.volume * 0.85) + 0.6 * p.sentiment * v;
}

// run fn over items with limited concurrency (keeps us polite + fast)
export async function mapPool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  const worker = async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
