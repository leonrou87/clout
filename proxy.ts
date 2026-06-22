import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// CORS for /api/* so the native iOS/Android shells (origin capacitor://localhost,
// http://localhost, https://localhost) can call the hosted API. Auth is via Bearer tokens
// (no cookies), so reflecting the origin is safe.
export const config = { matcher: '/api/:path*' };

function cors(req: NextRequest): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function proxy(req: NextRequest) {
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: cors(req) });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(cors(req))) res.headers.set(k, v);
  return res;
}
