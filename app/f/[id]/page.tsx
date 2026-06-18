import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { rpc } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Fig = {
  figure_id: string; display_name: string; category: string; cms: number; rank: number;
  disclaimer: string; driving: { title: string; source: string; url: string }[];
};
async function getFig(id: string): Promise<Fig | null> {
  try { return (await rpc('clout_figure', { p_id: id })) as Fig; } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const f = await getFig(id);
  if (!f) return { title: 'CLOUT' };
  const title = `${f.display_name} — CLOUT momentum ${f.cms}`;
  const description = `${f.display_name} sits at #${f.rank} on the CLOUT 500 (momentum ${f.cms}/1000). Collect their living card — a name, a live score, a serial that’s yours forever.`;
  return { title, description, openGraph: { title, description }, twitter: { card: 'summary_large_image', title, description } };
}

export default async function FigurePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await getFig(id);
  if (!f) notFound();
  return (
    <div id="phone">
      <div style={{ padding: '36px 24px 60px' }}>
        <a href="/" className="brand" style={{ fontSize: 22 }}>◈ CLOUT</a>
        <h1 className="h1" style={{ marginTop: 22 }}>{f.display_name}</h1>
        <p className="sub">{f.category} · Rank #{f.rank} on the CLOUT 500</p>
        <div className="panel">
          <div className="kv"><span className="muted">Cultural Momentum</span><span className="cms">{f.cms} <span className="muted">/1000</span></span></div>
        </div>
        <h2 className="h2">Recent public headlines</h2>
        {f.driving?.length ? f.driving.map((h, i) => (
          <a key={i} className="headline" href={h.url} target="_blank" rel="noopener noreferrer">
            {h.title}<span className="src"> — {h.source}</span>
          </a>
        )) : <p className="muted">No recent public coverage.</p>}
        <p className="disclaimer">{f.disclaimer}</p>
        <a href={`/#figure/${f.figure_id}`} className="btn gold" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 18 }}>
          Collect {f.display_name} on CLOUT
        </a>
      </div>
    </div>
  );
}
