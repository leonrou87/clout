import type { NextRequest } from 'next/server';
import { supabaseAdmin, rpc } from '@/lib/supabase';
import { normalizeRelative, ema, WEIGHTS } from '@/lib/engine.mjs';
import { pulse, rawFromPulse, sleep } from '@/lib/gdelt.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BATCH = 8; // GDELT allows ~1 req / 5s; 8 x ~5.2s stays under maxDuration

// Daily index refresh from REAL news (GDELT). Refreshes the stalest BATCH of figures with a
// live news pulse, re-normalizes the whole roster (carrying forward the rest), recomputes
// value guides, and rolls the next Debut. Vercel Cron sends Authorization: Bearer $CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (secret && auth !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });

  const { data: figs } = await supabaseAdmin.from('clout_figures').select('figure_id, display_name').eq('status', 'active');
  const { data: snaps } = await supabaseAdmin.from('clout_cms_snapshots')
    .select('figure_id, cms, raw_signal, sentiment_avg, volume, driving, as_of').order('as_of', { ascending: false });
  const latest: Record<string, { cms: number; raw_signal: number; sentiment_avg: number; volume: number; driving: unknown; as_of: string }> = {};
  for (const s of snaps || []) if (!(s.figure_id in latest)) latest[s.figure_id] = s;

  const today = new Date().toISOString().slice(0, 10);
  // pick the BATCH figures whose latest snapshot is oldest (stalest first)
  const order = [...(figs || [])].sort((a, b) => (latest[a.figure_id]?.as_of || '').localeCompare(latest[b.figure_id]?.as_of || ''));
  const toFetch = order.filter((f) => latest[f.figure_id]?.as_of !== today).slice(0, BATCH);
  const fetchIds = new Set(toFetch.map((f) => f.figure_id));

  const fresh: Record<string, { volume: number; sentiment: number; articles: unknown[] }> = {};
  for (let i = 0; i < toFetch.length; i++) {
    let p = await pulse(toFetch[i].display_name);
    if (p.error) { await sleep(6000); p = await pulse(toFetch[i].display_name); }
    fresh[toFetch[i].figure_id] = p;
    if (i < toFetch.length - 1) await sleep(5200);
  }

  // raw for every figure: fresh pulse for fetched, carried-forward raw for the rest
  const rawByFigure: Record<string, number> = {};
  const prev: Record<string, number> = {};
  for (const f of figs || []) {
    prev[f.figure_id] = latest[f.figure_id]?.cms ?? null as unknown as number;
    rawByFigure[f.figure_id] = fetchIds.has(f.figure_id) ? rawFromPulse(fresh[f.figure_id]) : (latest[f.figure_id]?.raw_signal ?? 0);
  }
  const cmsToday = normalizeRelative(rawByFigure, WEIGHTS) as Record<string, number>;
  const display: Record<string, number> = {};
  for (const fid of Object.keys(cmsToday)) display[fid] = ema(cmsToday[fid], prev[fid] ?? null, WEIGHTS.ema_alpha);
  const rank: Record<string, number> = {};
  Object.entries(display).sort((a, b) => b[1] - a[1]).forEach(([fid], i) => (rank[fid] = i + 1));

  const rows = (figs || []).map((f) => {
    const p = fresh[f.figure_id];
    return {
      figure_id: f.figure_id, as_of: today, cms: display[f.figure_id], raw_signal: rawByFigure[f.figure_id],
      sentiment_avg: p ? Math.round(p.sentiment * 1000) / 1000 : (latest[f.figure_id]?.sentiment_avg ?? 0),
      volume: p ? p.volume : (latest[f.figure_id]?.volume ?? 0),
      rank: rank[f.figure_id],
      driving: p ? p.articles : (latest[f.figure_id]?.driving ?? []),
    };
  });
  const { error } = await supabaseAdmin.from('clout_cms_snapshots').upsert(rows, { onConflict: 'figure_id,as_of' });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const recomputed = await rpc('clout_recompute_all');
  const debut = await rpc('clout_roll_debut');
  return Response.json({ ok: true, as_of: today, refreshed: toFetch.map((f) => f.display_name), figures: rows.length, recomputed, debut });
}
