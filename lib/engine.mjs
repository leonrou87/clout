// CLOUT — Index Engine (Cultural Momentum Score).
//
// JS port of the verified reference implementation (see cms_engine.py) covering
// Stages D & E: composite raw signal + relative normalization + EMA smoothing.
//
// HARD CONSTRAINT D & integrity: scores derive ONLY from external media, never from
// user activity, so a card's CMS cannot be manipulated by buying/holding. The CMS is a
// displayed informational signal; in-app card value is a SEPARATE system (supply/demand).
//
// In a production build, Stages A–C (ingestion via GDELT/news API, entity resolution,
// per-article LLM scoring through a swappable local/hosted provider) feed this. For the
// local MVP we use deterministic mock pre-scored articles so the index visibly "breathes".

/** Tunable weights — lock these in beta. Mirrors Weights in cms_engine.py. */
export const WEIGHTS = {
  w_volume: 1.0,
  w_reach: 0.8,
  w_sentiment: 0.6,
  tau_hours: 36.0, // recency decay constant
  ema_alpha: 0.4, // display smoothing
  scale_center: 500.0,
  scale_spread: 150.0,
};

export function recencyWeight(publishedAt, now, tauHours) {
  const dtHours = Math.max(0, (now - publishedAt) / 3_600_000);
  return Math.exp(-dtHours / tauHours);
}

/** Stage D: composite raw signal for one figure over the trailing window. */
export function rawSignalForFigure(articles, now, w = WEIGHTS) {
  if (!articles.length) return { raw_signal: 0, sentiment_avg: 0, volume: 0 };
  let salSum = 0, reachSum = 0, sentNum = 0, sentDen = 0;
  for (const a of articles) {
    const rw = recencyWeight(a.published_at, now, w.tau_hours);
    const effSal = a.salience * rw;
    salSum += effSal;
    reachSum += a.source_authority * effSal;
    const weight = a.salience * a.magnitude * rw;
    sentNum += a.sentiment * weight;
    sentDen += weight;
  }
  const volumeTerm = Math.log1p(salSum);
  const reachTerm = Math.log1p(reachSum);
  const sentimentAvg = sentDen > 0 ? sentNum / sentDen : 0;
  const raw =
    w.w_volume * volumeTerm +
    w.w_reach * reachTerm +
    w.w_sentiment * sentimentAvg * volumeTerm;
  return { raw_signal: raw, sentiment_avg: sentimentAvg, volume: articles.length };
}

/** Stage E: z-score raw signals across the WHOLE roster → 0..1000 (relative). */
export function normalizeRelative(rawByFigure, w = WEIGHTS) {
  const vals = Object.values(rawByFigure);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance) || 1.0;
  const out = {};
  for (const [fid, raw] of Object.entries(rawByFigure)) {
    const z = (raw - mean) / std;
    const cms = w.scale_center + w.scale_spread * z;
    out[fid] = Math.max(0, Math.min(1000, Math.round(cms)));
  }
  return out;
}

export function ema(today, yesterday, alpha) {
  if (yesterday == null) return today;
  return Math.round(alpha * today + (1 - alpha) * yesterday);
}

/** One full index cycle across the roster. Returns per-figure {cms, rank, ...}. */
export function runCycle(articlesByFigure, prevDisplay, now, w = WEIGHTS) {
  const rawByFigure = {};
  const meta = {};
  for (const [fid, arts] of Object.entries(articlesByFigure)) {
    const r = rawSignalForFigure(arts, now, w);
    rawByFigure[fid] = r.raw_signal;
    meta[fid] = r;
  }
  const cmsToday = normalizeRelative(rawByFigure, w);

  // Smooth to the displayed CMS first, then rank on what users actually see — so the
  // public ranking never contradicts the score printed on the card.
  const display = {};
  for (const [fid, cms] of Object.entries(cmsToday)) {
    display[fid] = ema(cms, prevDisplay[fid] ?? null, w.ema_alpha);
  }
  const ranked = Object.entries(display).sort((a, b) => b[1] - a[1]);
  const ranks = {};
  ranked.forEach(([fid], i) => (ranks[fid] = i + 1));

  const result = {};
  for (const [fid, cms] of Object.entries(cmsToday)) {
    result[fid] = {
      cms_raw: cms,
      cms: display[fid],
      rank: ranks[fid],
      raw_signal: rawByFigure[fid],
      sentiment_avg: Math.round(meta[fid].sentiment_avg * 1000) / 1000,
      volume: meta[fid].volume,
    };
  }
  return result;
}

// --------------------------- DEMO (mirrors cms_engine.py) ---------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const now = new Date('2026-06-14T12:00:00Z').getTime();
  const art = (sent, sal, mag, auth, hrsAgo) => ({
    published_at: now - hrsAgo * 3_600_000,
    sentiment: sent, salience: sal, magnitude: mag, source_authority: auth,
  });
  const articles = {
    taylor_swift: [2, 5, 9, 20, 40].map((h) => art(0.6, 0.95, 0.8, 0.9, h)),
    jalen_brunson: [3, 6, 30].map((h) => art(0.8, 0.9, 0.9, 0.85, h)),
    generic_politician: [4, 50].map((h) => art(-0.5, 0.7, 0.6, 0.8, h)),
    quiet_figure: [art(0.1, 0.3, 0.2, 0.5, 60)],
  };
  const prev = { taylor_swift: 930, jalen_brunson: 560, generic_politician: 410, quiet_figure: 300 };
  const out = runCycle(articles, prev, now);
  console.log('figure                cms  rank   sent  vol');
  for (const [fid, v] of Object.entries(out).sort((a, b) => b[1].cms - a[1].cms)) {
    console.log(fid.padEnd(20), String(v.cms).padStart(5), String(v.rank).padStart(5),
      String(v.sentiment_avg).padStart(6), String(v.volume).padStart(4));
  }
}
