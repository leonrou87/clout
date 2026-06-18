import type { NextRequest } from 'next/server';
import { supabaseAdmin, rpc } from '@/lib/supabase';
import { runCycle } from '@/lib/engine.mjs';
import { ROSTER_BY_ID, mockArticles } from '@/lib/roster.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Daily index refresh — makes the "living index" actually breathe. Vercel Cron calls this
// (it sends Authorization: Bearer $CRON_SECRET). Computes a fresh CMS snapshot for today,
// recomputes value guides, and rolls the next Debut. Manual run: GET with the same bearer.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') || '';
  if (secret && auth !== `Bearer ${secret}`) return new Response('unauthorized', { status: 401 });

  // current scores become the EMA base
  const idx = (await rpc('clout_index_500')) as { figures: { figure_id: string; cms: number }[] };
  const prev: Record<string, number> = {};
  idx.figures.forEach((f) => (prev[f.figure_id] = f.cms));

  const now = Date.now();
  const salt = Math.floor(now / 86_400_000); // varies by day
  const articlesByFigure: Record<string, unknown[]> = {};
  const drivingByFigure: Record<string, unknown[]> = {};
  for (const f of idx.figures) {
    const fig = ROSTER_BY_ID[f.figure_id];
    if (!fig) continue;
    const { articles, driving } = mockArticles(fig, now, 0, salt);
    articlesByFigure[f.figure_id] = articles;
    drivingByFigure[f.figure_id] = driving;
  }

  const cycle = runCycle(articlesByFigure, prev, now) as Record<string, { cms: number; rank: number; raw_signal: number; sentiment_avg: number; volume: number }>;
  const asOf = new Date(now).toISOString().slice(0, 10);
  const rows = Object.entries(cycle).map(([figure_id, v]) => ({
    figure_id, as_of: asOf, cms: v.cms, raw_signal: v.raw_signal, sentiment_avg: v.sentiment_avg,
    volume: v.volume, rank: v.rank, driving: drivingByFigure[figure_id] || [],
  }));
  const { error } = await supabaseAdmin.from('clout_cms_snapshots').upsert(rows, { onConflict: 'figure_id,as_of' });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const recomputed = await rpc('clout_recompute_all');
  const debut = await rpc('clout_roll_debut');
  return Response.json({ ok: true, as_of: asOf, figures: rows.length, recomputed, debut });
}
