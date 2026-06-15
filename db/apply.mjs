// Apply a .sql file to the shared Supabase project via the Management API query endpoint.
// Usage: node db/apply.mjs db/01_schema.sql   (also accepts inline SQL via --sql "...")
// Reads SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF from env (source the platform env first).
import fs from 'node:fs';
import https from 'node:https';

const ref = process.env.SUPABASE_PROJECT_REF;
const tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !tok) { console.error('Missing SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN'); process.exit(1); }

const arg = process.argv[2];
const sql = arg === '--sql' ? process.argv[3] : fs.readFileSync(arg, 'utf8');

const body = JSON.stringify({ query: sql });
const req = https.request(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' } },
  (res) => {
    let b = ''; res.on('data', (d) => (b += d));
    res.on('end', () => {
      if (res.statusCode >= 300) { console.error('ERROR', res.statusCode, b.slice(0, 500)); process.exit(1); }
      let parsed; try { parsed = JSON.parse(b); } catch { parsed = b; }
      console.log(typeof parsed === 'string' ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 600));
    });
  }
);
req.on('error', (e) => { console.error(e.message); process.exit(1); });
req.end(body);
