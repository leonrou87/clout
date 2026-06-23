import type { NextRequest } from 'next/server';
import { rpc, supabaseAdmin } from '@/lib/supabase';
import { sendMail, shell, isEmail, SUPPORT_INBOX } from '@/lib/mail';
// pure JS modules reused from the original build (typed via lib/mjs.d.ts)
import { renderCardSVG } from '@/lib/renderer.mjs';
import { CATEGORIES } from '@/lib/shared.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ path: string[] }> };

const ok = (d: unknown, status = 200) => Response.json(d as object, { status });
const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string)).replace(/\n/g, '<br>');
const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
const limited = () => Response.json({ error: 'RATE_LIMITED' }, { status: 429 });
async function rateOk(action: string, ip: string, max: number, secs: number) {
  try { return (await rpc('clout_rate', { p_key: `${action}:${ip}`, p_max: max, p_secs: secs })) as boolean; } catch { return true; }
}
const fail = (e: unknown, status = 400) => Response.json({ error: String((e as Error)?.message || e) }, { status });
const svg = (s: string) => new Response(s, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=30' } });

async function userId(req: NextRequest): Promise<string | null> {
  const a = req.headers.get('authorization') || '';
  const t = a.startsWith('Bearer ') ? a.slice(7) : null;
  if (!t) return null;
  try { return (await rpc('clout_resolve_session', { p_token: t })) as string | null; } catch { return null; }
}
const need401 = () => Response.json({ error: 'NOT_AUTHENTICATED' }, { status: 401 });

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const [a, b, c] = path;
  const sp = req.nextUrl.searchParams;
  try {
    if (a === 'meta' && b === 'categories') return ok(CATEGORIES);
    if (a === 'index' && b === 'clout500') return ok(await rpc('clout_index_500'));
    if (a === 'figures' && b) return ok((await rpc('clout_figure', { p_id: b })) ?? { error: 'NOT_FOUND' });
    if (a === 'cards' && b === 'top') return ok(await rpc('clout_cards_top', { p_by: sp.get('by') || 'popularity' }));
    if (a === 'debut' && b === 'today') return ok(await rpc('clout_debut_today'));
    if (a === 'debut' && b === 'schedule') return ok(await rpc('clout_debut_schedule'));
    if (a === 'leaderboards' && b) return ok(await rpc('clout_leaderboard', { p_kind: b }));
    if (a === 'trending' && !b) return ok(await rpc('clout_trending'));
    if (a === 'search' && !b) { const q = (sp.get('q') || '').trim(); return ok(q ? await rpc('clout_search', { p_q: q }) : []); }
    if (a === 'activity' && !b) return ok(await rpc('clout_activity'));
    if (a === 'cards' && b && c === 'provenance') return ok(await rpc('clout_card_provenance', { p_card: b }));
    if (a === 'chat' && b) return ok(await rpc('clout_chat', { p_room: decodeURIComponent(b), p_user: await userId(req) }));

    if (a === 'render' && b === 'card' && c) {
      const card = await rpc('clout_render_card', { p_card: c.replace(/\.svg$/, '') });
      if (!card) return new Response('not found', { status: 404 });
      return svg(renderCardSVG(card));
    }
    if (a === 'render' && b === 'preview' && c) {
      const data = await rpc('clout_render_preview', { p_fig: c, p_tier: path[3]?.replace(/\.svg$/, '') });
      if (!data) return new Response('not found', { status: 404 });
      return svg(renderCardSVG(data));
    }

    // authed reads
    const uid = await userId(req);
    if (a === 'me' && !b) { if (!uid) return need401(); return ok(await rpc('clout_me', { p_user: uid })); }
    if (a === 'me' && b === 'collection') { if (!uid) return need401(); return ok(await rpc('clout_collection', { p_user: uid })); }
    if (a === 'me' && b === 'invite') {
      if (!uid) return need401();
      const me = (await rpc('clout_me', { p_user: uid })) as { handle: string };
      const base = `${req.nextUrl.protocol}//${req.headers.get('host')}`;
      return ok({ handle: me.handle, invite_url: `${base}/?ref=${encodeURIComponent(me.handle)}`,
        message: `Collect living cards of the people moving culture. Join CLOUT with my link and we both get bonus coins:` });
    }
    if (a === 'transfers' && b === 'incoming') { if (!uid) return need401(); return ok(await rpc('clout_transfers_incoming', { p_user: uid })); }
    if (a === 'me' && b === 'portfolio') { if (!uid) return need401(); return ok(await rpc('clout_portfolio', { p_user: uid })); }
    if (a === 'me' && b === 'referrals') { if (!uid) return need401(); return ok(await rpc('clout_referrals', { p_user: uid })); }
    if (a === 'me' && b === 'anchors') { if (!uid) return need401(); return ok(await rpc('clout_anchors', { p_user: uid })); }
    if (a === 'me' && b === 'sets') { if (!uid) return need401(); return ok(await rpc('clout_sets', { p_user: uid })); }
    return new Response('not found', { status: 404 });
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const [a, b, c] = path;
  const body = await req.json().catch(() => ({}));
  try {
    if (a === 'auth' && b === 'signup') {
      if (!(await rateOk('signup', clientIp(req), 6, 3600))) return limited();
      const r = await rpc('clout_signup', { p_handle: body.handle, p_password: body.password, p_ref: body.ref ?? null, p_email: body.email ?? null }) as { handle: string; email?: string; referral_bonus?: number };
      if (r.email && isEmail(r.email)) {
        try {
          await sendMail({ to: r.email, subject: 'Welcome to CLOUT 🎉', html: shell(`Welcome, <b>@${esc(r.handle)}</b>! Your free 3-card welcome pack is in your collection, plus ◈${(1500 + (r.referral_bonus || 0)).toLocaleString()} to start.<br><br>Collect living cards of the people moving culture, claim today's Debut, play Clout Clash, and trade with friends.<br><br><a href="https://clout.kytepush.com" style="color:#ff2e88;font-weight:700">Open CLOUT →</a>`) });
        } catch {}
      }
      return ok({ ok: true, ...r });
    }

    // public contact / figure-removal — emails the support inbox + acks the sender
    if (a === 'contact' && !b) {
      if (!(await rateOk('contact', clientIp(req), 6, 3600))) return limited();
      const email = String(body.email || '').trim();
      const topic = body.topic === 'removal' ? 'removal' : 'support';
      const figure = body.figure ? String(body.figure).slice(0, 80) : null;
      const message = String(body.message || '').trim().slice(0, 4000);
      if (!message) return fail('EMPTY_MESSAGE');
      await supabaseAdmin.from('clout_support').insert({ email: email || null, topic, figure, message });
      const label = topic === 'removal' ? 'Figure removal' : 'Support';
      try {
        await sendMail({ to: SUPPORT_INBOX, replyTo: isEmail(email) ? email : undefined,
          subject: `CLOUT ${label} request${figure ? ': ' + figure : ''}`,
          html: shell(`<b>${label} request</b><br>From: ${esc(email || '(no email given)')}<br>${figure ? `Figure: ${esc(figure)}<br>` : ''}<br>${esc(message)}`) });
        if (isEmail(email)) await sendMail({ to: email, subject: 'We got your message — CLOUT',
          html: shell(`Thanks for reaching out — we've received your ${topic === 'removal' ? 'removal request' : 'message'} and will reply soon.<br><br><i>Your message:</i><br>${esc(message)}`) });
      } catch {}
      return ok({ ok: true });
    }
    if (a === 'auth' && b === 'login') { if (!(await rateOk('login', clientIp(req), 12, 300))) return limited(); return ok({ ok: true, ...(await rpc('clout_login', { p_handle: body.handle, p_password: body.password }) as object) }); }
    if (a === 'auth' && b === 'demo') return ok({ ok: true, ...(await rpc('clout_demo_login', { p_handle: body.handle }) as object) });
    if (a === 'auth' && b === 'logout') {
      const t = (req.headers.get('authorization') || '').replace('Bearer ', '');
      await rpc('clout_logout', { p_token: t }); return ok({ ok: true });
    }

    const uid = await userId(req);
    if (!uid) return need401();
    if (a === 'coins' && b === 'purchase') { const bal = await rpc('clout_coins_purchase', { p_user: uid, p_amount: Number(body.coins) || 0 }); return ok({ ok: true, balance: bal }); }
    if (a === 'me' && b === 'claim-welcome') return ok({ ok: true, ...(await rpc('clout_grant_welcome', { p_user: uid }) as object) });
    if (a === 'me' && b === 'claim-yield') return ok({ ok: true, ...(await rpc('clout_claim_yield', { p_user: uid }) as object) });
    if (a === 'reserve' && b && c === 'buy') return ok({ ok: true, ...(await rpc('clout_buy_reserve', { p_user: uid, p_ct: b }) as object) });
    if (a === 'debut' && b && c === 'claim') return ok({ ok: true, ...(await rpc('clout_debut_claim', { p_user: uid, p_figure: b, p_tier: body.tier }) as object) });
    if (a === 'transfers' && b && c === 'accept') return ok({ ok: true, ...(await rpc('clout_accept_transfer', { p_transfer: b, p_accepter: uid }) as object) });
    if (a === 'transfers' && !b) return ok({ ok: true, ...(await rpc('clout_propose_transfer', { p_from: uid, p_to_handle: body.to_handle, p_out: body.card_ids_out ?? [], p_in: body.card_ids_in ?? [] }) as object) });
    if (a === 'chat' && b) { await rpc('clout_chat_post', { p_user: uid, p_room: decodeURIComponent(b), p_body: body.body }); return ok({ ok: true }); }
    if (a === 'me' && b === 'checkin') return ok({ ok: true, ...(await rpc('clout_daily_checkin', { p_user: uid }) as object) });
    if (a === 'cards' && b && c === 'lock') return ok({ ok: true, ...(await rpc('clout_toggle_lock', { p_user: uid, p_card: b }) as object) });
    if (a === 'clash' && !b) return ok({ ok: true, ...(await rpc('clout_clash', { p_user: uid, p_cards: body.cards ?? [] }) as object) });
    if (a === 'figures' && b && c === 'hype') return ok({ ok: true, ...(await rpc('clout_hype', { p_figure: b, p_user: uid }) as object) });
    if (a === 'me' && b === 'delete') { await rpc('clout_delete_account', { p_user: uid }); return ok({ ok: true }); }
    if (a === 'push' && b === 'register') { await rpc('clout_register_push', { p_user: uid, p_token: body.token, p_platform: body.platform || 'unknown' }); return ok({ ok: true }); }
    if (a === 'admin' && b === 'figures' && c) { await rpc('clout_admin_remove', { p_figure: c }); return ok({ ok: true }); }
    return new Response('not found', { status: 404 });
  } catch (e) { return fail(e); }
}
