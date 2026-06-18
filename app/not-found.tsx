import Link from 'next/link';

export default function NotFound() {
  return (
    <div id="phone">
      <div style={{ padding: '80px 28px', textAlign: 'center' }}>
        <div className="brand" style={{ fontSize: 28 }}>◈ CLOUT</div>
        <h1 className="h1" style={{ marginTop: 24 }}>Lost in the index</h1>
        <p className="sub">That card isn’t in circulation. Head back to the floor.</p>
        <Link href="/" className="btn gold" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 8 }}>Back to CLOUT</Link>
      </div>
    </div>
  );
}
