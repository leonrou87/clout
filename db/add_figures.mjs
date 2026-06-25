// One-off: expand the roster with more real public figures + their card types.
// After running, trigger /api/cron/refresh to populate real news/CMS for them.
import https from 'node:https';
import { TIERS, MARKET } from '../lib/shared.mjs';

const ref = process.env.SUPABASE_PROJECT_REF, tok = process.env.SUPABASE_ACCESS_TOKEN;
const runSql = (sql) => new Promise((res, rej) => {
  const r = https.request(`https://api.supabase.com/v1/projects/${ref}/database/query`,
    { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' } },
    (x) => { let b = ''; x.on('data', d => b += d); x.on('end', () => x.statusCode < 300 ? res(b) : rej(new Error(b.slice(0, 300)))); });
  r.on('error', rej); r.end(JSON.stringify({ query: sql }));
});
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// [id, display_name, category, is_anchor, aliases[]]
const NEW = [
  ['drake', 'Drake', 'music', true, ['Drizzy']],
  ['beyonce', 'Beyoncé', 'music', true, ['Beyonce']],
  ['olivia_rodrigo', 'Olivia Rodrigo', 'music', false, []],
  ['sza', 'SZA', 'music', false, []],
  ['stephen_curry', 'Stephen Curry', 'athlete', true, ['Steph Curry']],
  ['patrick_mahomes', 'Patrick Mahomes', 'athlete', true, ['Mahomes']],
  ['shohei_ohtani', 'Shohei Ohtani', 'athlete', true, ['Ohtani']],
  ['simone_biles', 'Simone Biles', 'athlete', false, []],
  ['pewdiepie', 'PewDiePie', 'creator', false, []],
  ['ishowspeed', 'IShowSpeed', 'creator', false, ['Speed']],
  ['logan_paul', 'Logan Paul', 'creator', false, []],
  ['mark_zuckerberg', 'Mark Zuckerberg', 'tech', true, ['Zuckerberg']],
  ['tim_cook', 'Tim Cook', 'tech', false, []],
  ['sundar_pichai', 'Sundar Pichai', 'tech', false, []],
  ['margot_robbie', 'Margot Robbie', 'actor', false, []],
  ['ryan_gosling', 'Ryan Gosling', 'actor', false, []],
];

const main = async () => {
  // skip any that already exist
  const existing = JSON.parse(await runSql(`select figure_id from clout_figures where figure_id in (${NEW.map(f => q(f[0])).join(',')})`)).map(r => r.figure_id);
  const add = NEW.filter(f => !existing.includes(f[0]));
  if (!add.length) { console.log('all present, nothing to add'); return; }

  const figVals = add.map(f => `(${q(f[0])},${q(f[1])},'${JSON.stringify(f[4]).replace(/'/g, "''")}',${q(f[2])},'active',${f[3]},'{"public_figure":true,"removable":true}')`).join(',');
  await runSql(`insert into clout_figures (figure_id,display_name,aliases,category,status,is_anchor,policy_flags) values ${figVals};`);

  const ctVals = [];
  for (const f of add) for (const t of Object.values(TIERS)) {
    const reserve = (t.key === 'genesis' || t.key === 'founders') ? 0 : Math.round(t.printRun * MARKET.reserveFraction);
    ctVals.push(`(${q(f[0])},${q(t.key)},${q(f[0] + ':' + t.key)},${t.serialStart},${t.maxSupply},${t.printRun},${reserve})`);
  }
  await runSql(`insert into clout_card_types (figure_id,tier,design_seed,serial_start,max_supply,print_run,reserve_count) values ${ctVals.join(',')};`);

  console.log(`added ${add.length} figures (${add.map(f => f[1]).join(', ')}) + ${ctVals.length} card types`);
};
main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
