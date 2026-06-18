import type { MetadataRoute } from 'next';
import { rpc } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = 'https://clout.kytepush.com';
  let figs: { figure_id: string }[] = [];
  try { figs = ((await rpc('clout_index_500')) as { figures: { figure_id: string }[] }).figures || []; } catch {}
  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    ...figs.map((f) => ({ url: `${base}/f/${f.figure_id}`, changeFrequency: 'daily' as const, priority: 0.7 })),
  ];
}
