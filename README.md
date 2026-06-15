# CLOUT (clout.kytepush.com)

A digital collectible card game built on a live cultural-relevance index. Each card is a
*living typographic data object* for a public figure — name + a live Cultural Momentum Score
sourced from public headlines + rank + a 7-day sparkline. **No likeness. Closed-loop coins
(never cashable). Card-for-card trading. A daily Debut drop.**

Shipped on the KytePush platform: **Next.js (App Router) on Vercel + shared Supabase Postgres.**

## Architecture

- **Frontend** — a self-contained mobile-first PWA (`public/app.js`, `app/globals.css`) rendered
  into the shell in `app/page.tsx`. Installable (manifest + service worker).
- **API** — one catch-all route handler (`app/api/[...path]/route.ts`) that calls Supabase
  RPC functions via the `service_role` key (server-side only). Card art is rendered to SVG by
  `lib/renderer.mjs` (zero photo/face assets — likeness is structurally impossible).
- **Database** — Supabase Postgres. All objects namespaced `clout_*` to share the project
  safely. Schema + business logic live in `db/` (`01_schema.sql`, `02_functions.sql`,
  `03_render.sql`) and are applied via the Supabase Management API.
- **Index engine** — `lib/engine.mjs` + `lib/roster.mjs` compute the Cultural Momentum Score
  (scores derive only from external media, never user activity).

## The six hard constraints (baked in)

No likeness · coins/cards never cashable · score is sourced sentiment with linked headlines
(never a factual caption) · the index is informational while card value is supply/demand · only
collectible language · public figures only with a removal path (`clout_admin_remove`).

## Develop / re-seed

```bash
# secrets live in env (Vercel) / .env.local (gitignored) — never committed
node db/apply.mjs db/01_schema.sql
node db/apply.mjs db/02_functions.sql
node db/apply.mjs db/03_render.sql
node db/seed.mjs
npm run dev
```

Env: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(app) and `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (migrations/seed only).

Demo accounts: `you`, `ava_collects`, `maxrarity` (password `demo1234`, or passwordless demo
login). Or sign up for the free 3-card welcome pack.
