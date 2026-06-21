// One-time: pull a REAL news pulse for every active figure from GDELT and write today's
// CMS snapshot (real deduped headlines + tone + volume → momentum). Run locally:
//   set -a; source .env.local; set +a; node db/backfill_news.mjs
import { createClient } from '@supabase/supabase-js';
import { pulse, rawFromPulse, sleep } from '../lib/gdelt.mjs';
import { normalizeRelative, ema, WEIGHTS } from '../lib/engine.mjs';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const main = async () => {
  const { data: figs } = await sb.from('clout_figures').select('figure_id, display_name').eq('status', 'active');
  const { data: snaps } = await sb.from('clout_cms_snapshots').select('figure_id, cms, as_of').order('as_of', { ascending: false });
  const prev = {};
  for (const s of snaps || []) if (!(s.figure_id in prev)) prev[s.figure_id] = s.cms; // latest cms per figure

  const rawByFigure = {}; const meta = {};
  for (let i = 0; i < figs.length; i++) {
    const f = figs[i];
    let p = await pulse(f.display_name);
    if (p.error) { await sleep(7000); p = await pulse(f.display_name); } // one retry on throttle
    rawByFigure[f.figure_id] = rawFromPulse(p);
    meta[f.figure_id] = p;
    console.log(`${String(i + 1).padStart(2)}/${figs.length} ${f.display_name.padEnd(20)} vol ${String(p.volume).padStart(3)}  tone ${p.sentiment.toFixed(2)}  ${p.articles[0]?.title?.slice(0, 50) || (p.error || 'no news')}`);
    await sleep(5500); // GDELT: ~1 req / 5s
  }

  const cmsToday = normalizeRelative(rawByFigure, WEIGHTS);
  const display = {};
  for (const fid of Object.keys(cmsToday)) display[fid] = ema(cmsToday[fid], prev[fid] ?? null, WEIGHTS.ema_alpha);
  const ranked = Object.entries(display).sort((a, b) => b[1] - a[1]);
  const rank = {}; ranked.forEach(([fid], i) => (rank[fid] = i + 1));

  const asOf = new Date().toISOString().slice(0, 10);
  const rows = figs.map((f) => ({
    figure_id: f.figure_id, as_of: asOf, cms: display[f.figure_id], raw_signal: rawByFigure[f.figure_id],
    sentiment_avg: Math.round(meta[f.figure_id].sentiment * 1000) / 1000, volume: meta[f.figure_id].volume,
    rank: rank[f.figure_id], driving: meta[f.figure_id].articles,
  }));
  const { error } = await sb.from('clout_cms_snapshots').upsert(rows, { onConflict: 'figure_id,as_of' });
  if (error) { console.error('UPSERT FAILED', error.message); process.exit(1); }
  await sb.rpc('clout_recompute_all');
  await sb.rpc('clout_roll_debut');
  console.log(`\n✓ wrote real news snapshots for ${rows.length} figures (${asOf})`);
};
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
