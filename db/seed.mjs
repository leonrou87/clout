// Seed the shared Supabase project with CLOUT data, computed from the same engine/roster
// modules used locally. Idempotent-ish: clears clout_* data first. Run after schema+functions.
import https from 'node:https';
import { ROSTER, buildIndexHistory } from '../lib/roster.mjs';
import { TIERS, MARKET } from '../lib/shared.mjs';

const ref = process.env.SUPABASE_PROJECT_REF, tok = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !tok) { console.error('missing supabase env'); process.exit(1); }

function runSql(sql) {
  return new Promise((resolve, reject) => {
    const req = https.request(`https://api.supabase.com/v1/projects/${ref}/database/query`,
      { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' } },
      (res) => { let b = ''; res.on('data', d => b += d); res.on('end', () => {
        if (res.statusCode >= 300) return reject(new Error(`${res.statusCode}: ${b.slice(0, 400)}`));
        resolve(b); }); });
    req.on('error', reject); req.end(JSON.stringify({ query: sql }));
  });
}
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;            // quote text literal
const j = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`; // quote jsonb literal

const main = async () => {
  // wipe clout_* data (respect FK order; ledger is append-only -> TRUNCATE bypasses the rule)
  await runSql(`truncate clout_value_history, clout_chat_messages, clout_sessions, clout_transfers, clout_cards, clout_coin_ledger, clout_card_types, clout_cms_snapshots, clout_users, clout_figures restart identity cascade;`);

  // 1) figures
  const figVals = ROSTER.map(f => `(${q(f.id)},${q(f.display_name)},${j(f.aliases)},${q(f.category)},'active',${j({ public_figure: true, removable: true })})`).join(',');
  await runSql(`insert into clout_figures (figure_id,display_name,aliases,category,status,policy_flags) values ${figVals};`);

  // 2) 7-day index history -> snapshots (driving headlines on the latest day)
  const { history, drivingByFigure } = buildIndexHistory(7);
  const snapRows = [];
  history.forEach((day, di) => {
    const asOf = day.as_of.slice(0, 10);
    for (const [fid, v] of Object.entries(day.perFigure)) {
      const driving = di === history.length - 1 ? (drivingByFigure[fid] || []) : [];
      snapRows.push(`(${q(fid)},${q(asOf)},${v.cms},${v.raw_signal},${v.sentiment_avg},${v.volume},${v.rank},${j(driving)})`);
    }
  });
  await runSql(`insert into clout_cms_snapshots (figure_id,as_of,cms,raw_signal,sentiment_avg,volume,rank,driving) values ${snapRows.join(',')};`);

  // 3) card_types — genesis & founders hold NO reserve (chase / Debut-only)
  const ctRows = [];
  for (const f of ROSTER) for (const t of Object.values(TIERS)) {
    const reserve = (t.key === 'genesis' || t.key === 'founders') ? 0 : Math.round(t.printRun * MARKET.reserveFraction);
    ctRows.push(`(${q(f.id)},${q(t.key)},${q(f.id + ':' + t.key)},${t.serialStart},${t.maxSupply},${t.printRun},${reserve})`);
  }
  await runSql(`insert into clout_card_types (figure_id,tier,design_seed,serial_start,max_supply,print_run,reserve_count) values ${ctRows.join(',')};`);

  // 4) debut schedule: top-6 spikers across today..+5 (today = top spiker)
  const latest = history[history.length - 1].perFigure;
  const spikers = ROSTER
    .map(f => ({ f, score: f.profile.buzz * 0.6 + (1 - latest[f.id].rank / ROSTER.length) * 0.4 }))
    .sort((a, b) => b.score - a.score).slice(0, 6).map(x => x.f);
  const sched = spikers.map((f, i) => `when figure_id=${q(f.id)} then (current_date + ${i})`).join(' ');
  const ids = spikers.map(f => q(f.id)).join(',');
  await runSql(`update clout_card_types set debut_date = case ${sched} end where figure_id in (${ids}) and tier in ('genesis','founders','standard');`);

  // 5) seed-mint helper (mints from reserve without charging coins) + demo setup block
  await runSql(`
    create or replace function clout_seed_mint(p_fig text, p_tier text, p_owner uuid) returns void as $$
    declare ct record;
    begin
      select * into ct from clout_card_types where figure_id=p_fig and tier=p_tier;
      if not found then return; end if;
      if p_tier<>'genesis' and ct.reserve_count<=0 then return; end if;
      perform clout_mint(ct.card_type_id, p_owner);
      if p_tier<>'genesis' then update clout_card_types set reserve_count=reserve_count-1 where card_type_id=ct.card_type_id; end if;
    end; $$ language plpgsql;`);

  const debut = spikers[0].id;
  await runSql(`
    do $$
    declare you uuid; ava uuid; mx uuid; uids uuid[]; deb text := ${q(debut)}; fid text; i int; r record;
    begin
      you := clout_create_demo_user('you',12000);
      ava := clout_create_demo_user('ava_collects',9000);
      mx  := clout_create_demo_user('maxrarity',40000);
      uids := array[you,ava,mx];
      -- genesis 1/1 -> maxrarity; founders #1 mx, #2 ava, #3 you, #4-7 mx; one standard -> you
      perform clout_mint((select card_type_id from clout_card_types where figure_id=deb and tier='genesis'), mx);
      perform clout_debut_claim(mx, deb, 'founders');
      perform clout_debut_claim(ava, deb, 'founders');
      perform clout_debut_claim(you, deb, 'founders');
      for i in 1..4 loop perform clout_debut_claim(mx, deb, 'founders'); end loop;
      perform clout_debut_claim(you, deb, 'standard');
      -- circulation depth
      foreach fid in array array['taylor_swift','caitlin_clark','mrbeast','elon_musk','lebron_james','bad_bunny','kai_cenat','zendaya'] loop
        for i in 1..(12+floor(random()*20)::int) loop perform clout_seed_mint(fid,'open', uids[1+floor(random()*3)::int]); end loop;
        for i in 1..(3+floor(random()*6)::int) loop perform clout_seed_mint(fid,'standard', uids[1+floor(random()*3)::int]); end loop;
      end loop;
      for fid in select figure_id from clout_figures loop
        perform clout_seed_mint(fid,'open', uids[1+floor(random()*3)::int]);
      end loop;
      -- recompute every value guide
      for r in select card_type_id from clout_card_types loop perform clout_recompute_value(r.card_type_id); end loop;
      -- seed chatter
      insert into clout_chat_messages(room,user_id,handle,body) values
        ('global',mx,'maxrarity','Just landed the '||(select display_name from clout_figures where figure_id=deb)||' Genesis 1/1. Never trading it'),
        ('global',ava,'ava_collects','Looking to trade a Caitlin Clark Founders for any low-serial creator card'),
        ('global',you,'you','gm collectors. who else is hunting today''s debut?'),
        ('figure:'||deb, you,'you', (select display_name from clout_figures where figure_id=deb)||' founders are moving fast'),
        ('figure:caitlin_clark', ava,'ava_collects','Clark room! drop your serials, lowest wins clout');
    end $$;`);

  console.log('seeded: figures', ROSTER.length, '| snapshots', snapRows.length, '| card_types', ctRows.length, '| debut', debut);
};
main().catch(e => { console.error('SEED FAILED:', e.message); process.exit(1); });
