import type { NextRequest } from 'next/server';
import { supabaseAdmin, rpc } from '@/lib/supabase';
import { normalizeRelative, ema, WEIGHTS } from '@/lib/engine.mjs';
import { pulse, rawFromPulse, mapPool } from '@/lib/gdelt.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily index refresh from REAL news (Google News RSS). Pulls a fresh pulse for the whole
// roster (concurrency-limited), re-normalizes momentum, recomputes value guides, and rolls
// the next Debut. Vercel Cron sends Authorization: Bearer $CRON_SECRET.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (secret && auth !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });

  const { data: figs } = await supabaseAdmin.from('clout_figures').select('figure_id, display_name').eq('status', 'active');
  const { data: snaps } = await supabaseAdmin.from('clout_cms_snapshots')
    .select('figure_id, cms, raw_signal, sentiment_avg, volume, driving, as_of').order('as_of', { ascending: false });
  const latest: Record<string, { cms: number; raw_signal: number; sentiment_avg: number; volume: number; driving: unknown }> = {};
  for (const s of snaps || []) if (!(s.figure_id in latest)) latest[s.figure_id] = s;

  // fetch every figure's news pulse, 5 at a time
  const list = figs || [];
  const pulses = await mapPool(list, 5, (f: { display_name: string }) => pulse(f.display_name)) as { volume: number; sentiment: number; articles: unknown[]; error?: string }[];
  const fresh: Record<string, { volume: number; sentiment: number; articles: unknown[] }> = {};
  list.forEach((f, i) => { const p = pulses[i]; if (p && !p.error && p.volume > 0) fresh[f.figure_id] = p; });

  const rawByFigure: Record<string, number> = {};
  const prev: Record<string, number> = {};
  for (const f of list) {
    prev[f.figure_id] = (latest[f.figure_id]?.cms ?? null) as number;
    const p = fresh[f.figure_id];
    rawByFigure[f.figure_id] = p ? rawFromPulse(p) : (latest[f.figure_id]?.raw_signal ?? 0);
  }
  const cmsToday = normalizeRelative(rawByFigure, WEIGHTS) as Record<string, number>;
  const display: Record<string, number> = {};
  for (const fid of Object.keys(cmsToday)) display[fid] = ema(cmsToday[fid], prev[fid] ?? null, WEIGHTS.ema_alpha);
  const rank: Record<string, number> = {};
  Object.entries(display).sort((a, b) => b[1] - a[1]).forEach(([fid], i) => (rank[fid] = i + 1));

  const today = new Date().toISOString().slice(0, 10);
  const rows = list.map((f) => {
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
  return Response.json({ ok: true, as_of: today, refreshed: Object.keys(fresh).length, total: rows.length, recomputed, debut });
}
