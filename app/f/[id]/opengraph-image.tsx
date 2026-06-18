import { ImageResponse } from 'next/og';
import { rpc } from '@/lib/supabase';
import { CATEGORIES } from '@/lib/shared.mjs';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'CLOUT card';

export default async function OG({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  type F = { display_name: string; category: string; cms: number; rank: number };
  let f: F | null = null;
  try { f = (await rpc('clout_figure', { p_id: id })) as F; } catch {}
  const name = f?.display_name || 'CLOUT';
  const cms = f?.cms ?? 0;
  const rank = f?.rank ?? 0;
  const cats = CATEGORIES as Record<string, { accent: string }>;
  const accent = (f?.category && cats[f.category]?.accent) || '#ff2e88';

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#08090f', padding: 70, color: '#fff' }}>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, letterSpacing: 6, color: accent }}>◈ CLOUT</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, letterSpacing: 4, color: '#8a8aa0' }}>CULTURAL MOMENTUM · RANK #{rank}</div>
          <div style={{ display: 'flex', fontSize: 86, fontWeight: 800, marginTop: 8 }}>{name}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', marginTop: 10 }}>
            <div style={{ display: 'flex', fontSize: 200, fontWeight: 800, lineHeight: 1, color: accent }}>{cms}</div>
            <div style={{ display: 'flex', fontSize: 40, color: '#6f6f86', marginBottom: 26, marginLeft: 12 }}>/1000</div>
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#8a8aa0' }}>A living trading card · sourced public momentum, never a factual claim</div>
      </div>
    ),
    { ...size }
  );
}
