import Script from 'next/script';

// CLOUT is a self-contained vanilla SPA (public/app.js) that renders into #view and talks to
// the /api route handlers. This page renders the static app shell; app.js drives everything.
export default function Home() {
  return (
    <div id="phone">
      <header className="topbar" id="topbar">
        <div className="brand" data-go="index">◈ CLOUT</div>
        <div className="top-actions">
          <button className="chip" data-go="search" aria-label="Search">🔍</button>
          <button className="chip" id="balanceChip" data-go="profile">◈ —</button>
        </div>
      </header>

      <main id="view" />

      <nav className="tabbar" id="tabbar">
        <button className="tab" data-go="debut"><span className="ti">🔥</span><span>Debut</span></button>
        <button className="tab" data-go="index"><span className="ti">📈</span><span>Index</span></button>
        <button className="tab" data-go="discover"><span className="ti">🃏</span><span>Cards</span></button>
        <button className="tab" data-go="collection"><span className="ti">📚</span><span>Vault</span></button>
        <button className="tab" data-go="chat"><span className="ti">💬</span><span>Chat</span></button>
        <button className="tab" data-go="profile"><span className="ti">👤</span><span>You</span></button>
      </nav>

      <Script src="/app.js" strategy="afterInteractive" />
    </div>
  );
}
