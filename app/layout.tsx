import type { Metadata, Viewport } from 'next';
import './globals.css';

const DESC = 'Collect living trading cards of the people moving culture — a name, a live momentum score, a serial that’s yours forever. Trade with friends. No photos. Coins are never cashable.';

export const metadata: Metadata = {
  metadataBase: new URL('https://clout.kytepush.com'),
  title: 'CLOUT — the living card index',
  description: DESC,
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'CLOUT' },
  icons: { icon: '/icon.svg', apple: '/icon-192.png' },
  openGraph: {
    title: 'CLOUT — the living card index',
    description: DESC,
    url: 'https://clout.kytepush.com',
    siteName: 'CLOUT',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'CLOUT' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CLOUT — the living card index',
    description: DESC,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#08090f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
