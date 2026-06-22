import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — CLOUT', description: 'How CLOUT handles your data.' };

const UPDATED = 'June 2026';

export default function Privacy() {
  return (
    <div id="phone">
      <div style={{ padding: '36px 24px 60px' }}>
        <a href="/" className="brand" style={{ fontSize: 22 }}>◈ CLOUT</a>
        <h1 className="h1" style={{ marginTop: 20 }}>Privacy Policy</h1>
        <p className="sub">Last updated {UPDATED}</p>
        <div className="panel" style={{ lineHeight: 1.6, fontSize: 14 }}>
          <p><b>What we collect.</b> Your handle, an optional email, a securely hashed password, and gameplay data (cards, coins, trades, chat messages, check-ins). Basic technical logs (e.g., request metadata) for security and reliability.</p>
          <p><b>How we use it.</b> To run your account and the game, send transactional and support email (if you provide an address), prevent abuse, and improve CLOUT. The Cultural Momentum Score is derived only from public news — never from your activity.</p>
          <p><b>What we don’t do.</b> We don’t sell your personal data. Coins and cards are in-app only and never cashable; there is no real-money payout. We don’t show real-money resale.</p>
          <p><b>Sharing.</b> We use service providers to operate CLOUT — hosting/database (Supabase), app hosting (Vercel), and email (Google/Gmail) — who process data on our behalf. Public news headlines shown on figures come from public sources.</p>
          <p><b>Your handle &amp; public activity.</b> Your handle, collection stats, leaderboard standing, and chat messages are visible to other users.</p>
          <p><b>Retention &amp; deletion.</b> We keep data while your account is active. You can delete your account anytime in <i>Profile → Delete my account</i>, which removes your cards, collection, chat, and personal info. Email <a className="lead" href="mailto:kytepush@gmail.com">kytepush@gmail.com</a> for help.</p>
          <p><b>Children.</b> CLOUT is for users 13 and older.</p>
          <p><b>Changes.</b> We’ll update this policy as the product evolves and revise the date above.</p>
          <p><b>Contact.</b> <a className="lead" href="mailto:kytepush@gmail.com">kytepush@gmail.com</a></p>
        </div>
        <a href="/" className="btn gold" style={{ display: 'inline-block', textDecoration: 'none', marginTop: 16 }}>Back to CLOUT</a>
      </div>
    </div>
  );
}
