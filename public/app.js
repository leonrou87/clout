// CLOUT mobile PWA client. Collectible language only ("own / collect / rare / trade with
// friends"), never "invest / profit / cash in" (HARD CONSTRAINT E). The Value Guide is an
// informational estimate (like Beckett/TCGplayer) — never an in-app sale price. Peer trades
// are card-for-card barter; the app is silent on money.

const LS = window.localStorage;
// In the native iOS/Android shell (Capacitor), call the hosted API/assets absolutely;
// on the web it's same-origin. Shareable links always point at the public site.
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const ORIGIN = NATIVE ? 'https://clout.kytepush.com' : '';
const SITE = 'https://clout.kytepush.com';
const state = {
  token: LS.getItem('clout_token') || null,
  user: LS.getItem('clout_handle') || null,
  categories: {},
  ref: new URLSearchParams(location.search).get('ref'),
};

const $ = (s, r = document) => r.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function setSession(token, handle) {
  state.token = token; state.user = handle; state._checkedIn = false;
  LS.setItem('clout_token', token); LS.setItem('clout_handle', handle);
}
function clearSession() {
  state.token = null; state.user = null; state._checkedIn = false;
  LS.removeItem('clout_token'); LS.removeItem('clout_handle');
}

async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['authorization'] = 'Bearer ' + state.token;
  const r = await fetch(ORIGIN + '/api' + path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { clearSession(); render(); throw new Error('Please sign in'); }
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

function toast(msg, kind = '') {
  const t = el(`<div class="toast ${kind}">${msg}</div>`);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3400);
}
function sheet(html) {
  const bg = el(`<div class="sheet-bg"><div class="sheet">${html}</div></div>`);
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  return bg;
}
const catLabel = (c) => state.categories[c]?.label || c;
const catColor = (c) => state.categories[c]?.accent || '#888';
const fmt = (n) => Number(n).toLocaleString();

function miniSpark(values, w = 84, h = 26, forceColor) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1) * w).toFixed(1)},${(h - (v - min) / span * h).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  return `<svg class="mini-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="${forceColor || (up ? '#00e0a4' : '#ff5470')}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

async function refreshBalance() {
  if (!state.user) return;
  try { const me = await api('/me'); $('#balanceChip').textContent = `◈ ${fmt(me.balance)}`; } catch {}
}

/* ============================== ROUTES ============================== */
const routes = {};

function fmtCountdown(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = Math.floor(secs % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

routes.debut = async () => {
  const d = await api('/debut/today');
  const sched = await api('/debut/schedule');
  if (!d.figure) return el('<div class="empty">No debut scheduled.</div>');
  const f = d.figure;
  const pct = Math.round((d.founders.claimed / d.founders.total) * 100);
  const soldOut = d.founders.claimed >= d.founders.total;
  const v = el(`<div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px"><span class="pill gold">🔥 Debut Day</span><span class="muted" style="font-size:12px">next drop in <b id="cd">${fmtCountdown(d.next_debut_in_seconds)}</b></span></div>
    <h1 class="h1">${f.display_name}</h1>
    <p class="sub">Today's debut — chosen because they're spiking in the index (momentum <b class="cms">${f.cms}</b>, rank #${f.rank}). The 100 Founders mint here first: lowest serials + a permanent Founding Collector badge.</p>
    ${d.recent_claims > 0
      ? `<div class="pill gold" style="margin-bottom:10px">🔥 FRENZY · ${d.recent_claims} claimed in the last 10 min · ${d.crowd} collectors</div>`
      : `<div class="muted" style="font-size:12px;margin-bottom:10px">👥 ${d.crowd} collectors here</div>`}
    <div class="card-wrap" style="max-width:230px;margin:0 auto 14px"><img class="card-svg" src="${ORIGIN}/api/render/preview/${f.figure_id}/founders.svg"/></div>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;font-size:14px"><b>Founders claimed</b><span>${d.founders.claimed} / ${d.founders.total}</span></div>
      <div class="valbar" style="background:linear-gradient(90deg,var(--gold) ${pct}%, #2a2d3a ${pct}%)"></div>
      <div class="muted" style="font-size:12px">${soldOut ? 'Founders sold out — Standard still available.' : `You'd get Founders #${d.founders.next_serial} 🏅`}</div>
      <div class="btnrow">
        <button class="btn ${soldOut ? 'ghost' : 'gold'}" ${soldOut ? 'disabled' : ''} data-claim="founders" data-fig="${f.figure_id}">${soldOut ? 'Founders gone' : `Claim Founders · ◈${fmt(d.prices.founders)}`}</button>
      </div>
      <div class="btnrow"><button class="btn ghost" data-claim="standard" data-fig="${f.figure_id}">Claim Standard · ◈${fmt(d.prices.standard)}</button></div>
      <button class="btn ghost" id="notify" style="margin-top:10px">🔔 Notify me at next debut</button>
    </div>
    <h2 class="h2">🏅 Founding Collectors</h2>
    <div id="wall"></div>
    <h2 class="h2">Upcoming debuts</h2>
    <div id="sched"></div>
    <button class="btn ghost" data-go="figure/${f.figure_id}" style="margin-top:6px">View ${f.display_name}</button>
  </div>`);
  const wall = $('#wall', v);
  d.founding_wall.forEach((w) => wall.appendChild(el(`<div class="row"><span class="rank">#${w.serial}</span><div><b>@${w.handle}</b></div><div class="ri muted" style="font-size:12px">${w.serial <= 3 ? '👑 ' : ''}founding</div></div>`)));
  const sc = $('#sched', v);
  sched.schedule.filter((s) => !s.is_today).forEach((s) => sc.appendChild(el(`<div class="row" ${s.cms ? `data-go="figure/${s.figure_id}"` : ''}><div><b>${s.display_name}</b><div class="muted" style="font-size:12px">${new Date(s.debut_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div></div><div class="ri"><span class="cat-dot" style="background:${catColor(s.category)}"></span></div></div>`)));
  $('#notify', v).onclick = enableNotify;
  // live countdown
  startCountdown(d.next_debut_in_seconds, v);
  return v;
};

let _cdTimer = null;
function startCountdown(secs, root) {
  if (_cdTimer) clearInterval(_cdTimer);
  let s = secs;
  _cdTimer = setInterval(() => {
    s -= 1; const elc = root.querySelector('#cd');
    if (!elc || !document.body.contains(elc)) { clearInterval(_cdTimer); _cdTimer = null; return; }
    elc.textContent = fmtCountdown(Math.max(0, s));
  }, 1000);
}
async function enableNotify() {
  if (!('Notification' in window)) return toast('Notifications not supported on this device');
  const p = await Notification.requestPermission();
  if (p === 'granted') { toast("You'll be notified at the next debut 🔔", 'win'); try { new Notification('CLOUT', { body: "You're set — we'll ping you when the next figure debuts." }); } catch {} }
  else toast('Notifications blocked — enable them in settings.');
}

routes.search = async () => {
  const v = el(`<div>
    <div class="muted" data-back style="margin-bottom:6px">‹ Back</div>
    <h1 class="h1">Search</h1>
    <input class="input" id="q" placeholder="Search figures by name…" autocomplete="off" autocapitalize="none"/>
    <div id="results"><p class="muted" style="font-size:13px">Type a name to find anyone on the CLOUT 500.</p></div>
  </div>`);
  const input = $('#q', v), results = $('#results', v);
  let t;
  const run = async () => {
    const q = input.value.trim();
    if (!q) { results.innerHTML = '<p class="muted" style="font-size:13px">Type a name to find anyone on the CLOUT 500.</p>'; return; }
    try {
      const rows = await api('/search?q=' + encodeURIComponent(q));
      if (!rows.length) { results.innerHTML = '<div class="empty">No figures match “' + escapeHtml(q) + '”.</div>'; return; }
      results.replaceChildren(...rows.map((f) => el(`<div class="row" data-go="figure/${f.figure_id}">
        <div><div style="font-weight:700">${escapeHtml(f.display_name)}</div>
          <div class="muted" style="font-size:12px"><span class="cat-dot" style="background:${catColor(f.category)}"></span> ${catLabel(f.category)}</div></div>
        <div class="ri"><div class="cms">${f.cms}</div><div class="muted" style="font-size:11px">#${f.rank}</div></div></div>`)));
    } catch {}
  };
  input.oninput = () => { clearTimeout(t); t = setTimeout(run, 160); };
  setTimeout(() => input.focus(), 60);
  return v;
};

routes.index = async () => {
  const { figures, as_of } = await api('/index/clout500');
  const top = figures.slice(0, 40); // sparkline is included in the single call now
  let banner = '';
  try {
    const d = await api('/debut/today');
    if (d.figure) banner = `<div class="row" data-go="debut" style="background:linear-gradient(90deg, rgba(255,204,77,.18), rgba(255,46,136,.12));border-color:rgba(255,204,77,.4)">
      <span class="ti" style="font-size:20px">🔥</span>
      <div><b>Today's Debut: ${d.figure.display_name}</b><div class="muted" style="font-size:12px">${d.founders.claimed}/${d.founders.total} Founders claimed · tap to collect</div></div>
      <div class="ri">›</div></div>`;
  } catch {}
  const v = el(`<div>
    <h1 class="h1">The CLOUT 500</h1>
    <p class="sub">Who's rising in the world today — a live cultural-momentum index sourced from public headlines. <span class="pill">${new Date(as_of).toLocaleDateString()}</span></p>
    ${banner}
    <div id="list"></div>
  </div>`);
  const list = $('#list', v);
  top.forEach((f) => list.appendChild(el(`
    <div class="row" data-go="figure/${f.figure_id}">
      <span class="rank">${f.rank}</span>
      <div><div style="font-weight:700">${f.display_name}</div>
        <div class="muted" style="font-size:12px"><span class="cat-dot" style="background:${catColor(f.category)}"></span> ${catLabel(f.category)}</div></div>
      <div class="ri">${miniSpark(f.sparkline)}<div class="cms">${f.cms}</div></div>
    </div>`)));
  return v;
};

routes.discover = async () => {
  const by = state._rankBy || 'popularity';
  const v = el(`<div>
    <h1 class="h1">Cards</h1>
    <p class="sub">The card ranker — by collector demand, not news. Tap a card to view its room, value guide, and buy a copy from the reserve.</p>
    <div class="seg" id="seg">
      <button data-by="popularity">Popular</button>
      <button data-by="trending">🔥 Hyped</button>
      <button data-by="value">Top Value</button>
    </div>
    <div id="list"></div></div>`);
  $('#seg', v).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.by === by);
    b.onclick = () => { state._rankBy = b.dataset.by; render(); };
  });
  const list = $('#list', v);
  if (by === 'trending') {
    const { cards } = await api('/trending');
    cards.forEach((c, i) => list.appendChild(el(`
      <div class="row" data-go="figure/${c.figure_id}">
        <span class="rank">${i + 1}</span>
        <div><div style="font-weight:700">${c.display_name}</div>
          <div class="muted" style="font-size:12px"><span class="cat-dot" style="background:${catColor(c.category)}"></span> ${catLabel(c.category)} · ${c.buys} buys</div></div>
        <div class="ri"><div class="val">🔥 ${c.hype}</div><div class="muted" style="font-size:11px">cms ${c.cms}</div></div>
      </div>`)));
  } else {
    const { cards } = await api('/cards/top?by=' + by);
    cards.forEach((c, i) => list.appendChild(el(`
      <div class="row" data-go="figure/${c.figure_id}">
        <span class="rank">${i + 1}</span>
        <div><div style="font-weight:700">${c.display_name} <span class="muted" style="font-weight:600">${c.rarity} ${c.tier}</span></div>
          <div class="muted" style="font-size:12px">${c.holders} holders · ${c.minted}/${fmt(c.print_run)} minted</div></div>
        <div class="ri"><div class="val">◈ ${fmt(c.value)}</div><div class="muted" style="font-size:11px">${by === 'value' ? 'guide' : 'pop ' + c.popularity}</div></div>
      </div>`)));
  }
  return v;
};

routes.figure = async (id) => {
  const f = await api('/figures/' + id);
  const v = el(`<div>
    <div class="muted" data-back style="margin-bottom:10px">‹ Back</div>
    <h1 class="h1">${f.display_name}</h1>
    <p class="sub"><span class="cat-dot" style="background:${catColor(f.category)}"></span> ${catLabel(f.category)} · Rank #${f.rank}</p>
    <div class="card-wrap" style="max-width:230px;margin:0 auto 14px"><img class="card-svg" src="${ORIGIN}/api/render/preview/${f.figure_id}/founders.svg"/></div>
    <div class="panel">
      <div class="kv"><span class="muted">Cultural Momentum</span><span class="cms">${f.cms} <span class="muted">/1000</span></span></div>
      <div class="kv"><span class="muted">7-day movement</span>${miniSpark(f.sparkline, 130, 28)}</div>
      <div style="margin:12px 0 4px"><span class="pill">Driving headlines</span></div>
      ${f.driving.map((h) => `<a class="headline" href="${h.url}" target="_blank" rel="noopener">${h.title}<span class="src"> — ${h.source} · ${new Date(h.published_at).toLocaleDateString()}</span></a>`).join('') || '<p class="muted">No recent public coverage.</p>'}
      <p class="disclaimer">${f.disclaimer}</p>
    </div>
    <div class="btnrow"><button class="btn ghost" id="hype">🔥 Hype this card</button><button class="btn ghost" data-go="room/${f.figure_id}">💬 Chat room</button></div>
    <div class="btnrow"><button class="btn ghost" id="sharefig">📤 Share ${f.display_name}</button></div>
    <h2 class="h2">Value guide & reserve</h2>
    <p class="sub" style="margin-bottom:10px">Informational estimate (like a price guide), not a sale price. Buy a new copy from the publisher reserve with credits; trade copies with friends.</p>
    <div id="tiers"></div>
    <div style="text-align:center;margin-top:16px"><a class="muted" id="report" style="font-size:12px;text-decoration:underline">⚐ Report this figure</a></div>
  </div>`);
  $('#report', v).onclick = () => contactSheet({ topic: 'removal', figure: f.display_name });
  $('#hype', v).onclick = async () => {
    try { const r = await api(`/figures/${f.figure_id}/hype`, { method: 'POST' }); toast(r.counted ? `🔥 Hyped! ${f.display_name} hype: ${r.hype}` : 'You already hyped today', r.counted ? 'win' : ''); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#sharefig', v).onclick = () => shareFigure(f.figure_id, `${f.display_name} — momentum ${f.cms} on CLOUT`);
  const tiers = $('#tiers', v);
  f.card_types.forEach((ct) => {
    const soldOut = ct.reserve <= 0;
    tiers.appendChild(el(`<div class="panel" style="padding:14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><b>${ct.rarity} ${ct.tier}</b> <span class="muted" style="font-size:12px">${ct.minted}/${fmt(ct.print_run)} minted</span></div>
        <div class="val">◈ ${fmt(ct.value)}</div>
      </div>
      <div class="valbar"></div>
      <div class="muted" style="font-size:12px;display:flex;justify-content:space-between">
        <span>guide ${fmt(ct.value_lo)}–${fmt(ct.value_hi)}</span><span>${ct.holders} holders · pop ${ct.popularity}</span></div>
      ${ct.print_run && (ct.print_run - ct.minted) <= ct.print_run * 0.1 && ct.tier !== 'genesis'
        ? `<div style="color:var(--gold);font-size:12px;margin-top:6px">🔥 only ${fmt(ct.print_run - ct.minted)} left forever</div>` : ''}
      ${ct.tier === 'genesis'
        ? `<div class="muted" style="font-size:12px;margin-top:8px">The 1/1 chase card — not sold from reserve.</div>`
        : `<button class="btn ${soldOut ? 'ghost' : 'gold'} sm" style="margin-top:10px;width:100%" ${soldOut ? 'disabled' : ''} data-buy="${ct.card_type_id}" data-name="${f.display_name} ${ct.tier}">${soldOut ? 'Reserve empty' : 'Buy a copy · ◈ ' + fmt(ct.value)}</button>`}
    </div>`));
  });
  return v;
};

routes.collection = async () => {
  const [c, anchors] = await Promise.all([api('/me/collection'), api('/me/anchors')]);
  const missing = anchors.filter((a) => !a.owned);
  const v = el(`<div>
    <h1 class="h1">Your Collection</h1>
    <p class="sub">Status score <b class="lead">${fmt(c.value)}</b> — rarity + low serials + momentum (in-app status, not cash).</p>
    <div class="btnrow">
      <button class="btn gold sm" data-go="clash">⚔️ Clout Clash</button>
      <button class="btn ghost sm" id="yield">Claim hold-yield</button>
    </div>
    ${missing.length ? `<h2 class="h2">Anchors to collect 🔒</h2>
      <p class="sub" style="margin-bottom:8px">The biggest names are never given away — earn coins and buy them.</p>
      <div class="anchorstrip" id="anchors"></div>` : ''}
    <h2 class="h2">Your cards</h2>
    ${c.cards.length ? '<div class="cardgrid" id="grid"></div>' : '<div class="empty">No cards yet. Buy from the Cards tab, or invite a friend.</div>'}
  </div>`);
  if (missing.length) {
    const a = $('#anchors', v);
    missing.forEach((m) => a.appendChild(el(`<div class="anchor-locked" data-go="figure/${m.figure_id}">
      <div class="lockface">🔒</div><div class="aname">${m.display_name}</div><div class="muted" style="font-size:11px">${m.cms} · buy</div></div>`)));
  }
  if (c.cards.length) {
    const grid = $('#grid', v);
    c.cards.forEach((card) => {
      const badges = [card.crown ? '👑' : '', card.locked ? '🔒' : '', card.founding ? '🏅' : ''].filter(Boolean).join(' ');
      const m = card.momentum_since;
      const mo = m > 0 ? `<span style="color:var(--good)">▲${m}</span>` : (m < 0 ? `<span style="color:var(--bad)">▼${Math.abs(m)}</span>` : '');
      grid.appendChild(el(`<div>
        <div class="card-wrap" data-card='${JSON.stringify({ id: card.card_id, name: card.display_name, serial: card.serial_number, fig: card.figure_id, tier: card.tier, rarity: card.rarity, locked: card.locked }).replace(/'/g, '&#39;')}'>
          <img class="card-svg" src="${ORIGIN}/api/render/card/${card.card_id}.svg" loading="lazy"/>
          ${badges ? `<div class="card-badge">${badges}</div>` : ''}
        </div>
        <div class="card-meta"><span>${card.rarity} #${card.serial_number}</span><span class="val">◈ ${fmt(card.value)} ${mo}</span></div>
        <div class="muted" style="font-size:11px">${fmt(card.left_forever)} left forever · held ${card.held_days}d</div>
      </div>`));
    });
  }
  return v;
};

routes.clash = async () => {
  const c = await api('/me/collection');
  state._clashPick = (state._clashPick || []).filter((id) => c.cards.some((k) => k.card_id === id));
  const v = el(`<div>
    <div class="muted" data-back style="margin-bottom:6px">‹ Back</div>
    <h1 class="h1">⚔️ Clout Clash</h1>
    <p class="sub">Pick 3 of your cards and face the house. Each round flips a stat — momentum, rarity power, 7-day movement. Win 2 of 3 for coins. No stakes, nothing to lose.</p>
    <div id="picks" class="muted" style="margin-bottom:8px">Selected 0/3</div>
    ${c.cards.length >= 3
      ? '<div class="cardgrid" id="grid"></div><button class="btn gold" id="play" style="margin-top:14px" disabled>Pick 3 cards</button>'
      : '<div class="empty">You need at least 3 cards to play. Buy a few from the Cards tab!</div>'}
  </div>`);
  if (c.cards.length >= 3) {
    const grid = $('#grid', v);
    c.cards.forEach((card) => grid.appendChild(el(`<div class="card-wrap clashpick ${state._clashPick.includes(card.card_id) ? 'sel' : ''}" data-pick="${card.card_id}">
      <img class="card-svg" src="${ORIGIN}/api/render/card/${card.card_id}.svg" loading="lazy"/>
      <div class="card-meta"><span>${card.rarity} #${card.serial_number}</span></div></div>`)));
    const sync = () => { const p = $('#play', v); $('#picks', v).textContent = `Selected ${state._clashPick.length}/3`; p.disabled = state._clashPick.length !== 3; p.textContent = state._clashPick.length === 3 ? 'Clash!' : 'Pick 3 cards'; };
    sync();
    grid.querySelectorAll('[data-pick]').forEach((eln) => eln.onclick = () => {
      const id = eln.dataset.pick, i = state._clashPick.indexOf(id);
      if (i >= 0) state._clashPick.splice(i, 1); else if (state._clashPick.length < 3) state._clashPick.push(id); else return;
      eln.classList.toggle('sel'); sync();
    });
    $('#play', v).onclick = async () => {
      if (state._clashPick.length !== 3) return;
      try { const r = await api('/clash', { method: 'POST', body: JSON.stringify({ cards: state._clashPick }) }); state._clashPick = []; showClash(r); }
      catch (e) { toast(e.message === 'PICK_3_CARDS' ? 'Pick exactly 3 cards' : e.message, 'err'); }
    };
  }
  return v;
};
function showClash(r) {
  const rows = r.rounds.map((rd) => `<div class="row"><div style="flex:1;min-width:0"><b>${rd.stat}</b>
    <div class="muted" style="font-size:12px">you ${rd.you.name} (${fmt(rd.you.val)}) vs ${rd.house.name} (${fmt(rd.house.val)})</div></div>
    <div class="ri">${rd.win ? '✅' : '❌'}</div></div>`).join('');
  const bg = sheet(`<h3>${r.you_won ? '🏆 You win!' : '😤 Close one'}</h3>
    <p class="sub">${r.your_rounds}/3 rounds${r.reward ? ` · +◈${r.reward}` : ''}</p>${rows}
    <button class="btn gold" id="again" style="margin-top:12px">Play again</button>
    <button class="btn ghost" id="shareClash" style="margin-top:8px">📤 Share result</button>`);
  $('#again', bg).onclick = () => { bg.remove(); render(); refreshBalance(); };
  $('#shareClash', bg).onclick = async () => {
    const text = `I went ${r.your_rounds}/3 in Clout Clash ${r.you_won ? '🏆' : ''} — collect living cards on CLOUT`;
    if (navigator.share) { try { await navigator.share({ title: 'CLOUT Clash', text, url: SITE }); return; } catch {} }
    try { await navigator.clipboard.writeText(SITE); toast('Copied!', 'win'); } catch {}
  };
}

routes.chat = async () => {
  // rooms = global + figure rooms where you hold a card
  const col = state.user ? await api('/me/collection') : { cards: [] };
  const figs = [...new Map(col.cards.map((c) => [c.figure_id, c.display_name])).entries()];
  const v = el(`<div>
    <h1 class="h1">Community</h1>
    <p class="sub">Talk all things CLOUT. Each figure has its own room — hold a card to join the conversation (Fan League access).</p>
    <div class="chat-list">
      <div class="row" data-go="room/global"><span class="ti" style="font-size:20px">🌐</span><div><b>Global board</b><div class="muted" style="font-size:12px">Everyone</div></div><div class="ri">›</div></div>
      <div class="h2">Your figure rooms</div>
      ${figs.length ? figs.map(([fid, name]) => `<div class="row" data-go="room/${fid}"><span class="cat-dot" style="background:var(--accent)"></span><div><b>${name}</b><div class="muted" style="font-size:12px">Holders' room</div></div><div class="ri">›</div></div>`).join('') : '<div class="muted" style="font-size:13px">Collect a card to unlock its room.</div>'}
    </div></div>`);
  return v;
};

routes.room = async (id) => {
  const room = id === 'global' ? 'global' : 'figure:' + id;
  const data = await api('/chat/' + encodeURIComponent(room));
  const title = id === 'global' ? 'Global board' : (await api('/figures/' + id)).display_name + ' room';
  const v = el(`<div style="display:flex;flex-direction:column;min-height:calc(100dvh - 200px)">
    <div class="muted" data-back style="margin-bottom:6px">‹ Back</div>
    <h1 class="h1" style="margin-bottom:12px">${title}</h1>
    <div class="msgs" id="msgs"></div>
    ${data.can_post
      ? `<form class="composer" id="composer"><input id="msg" placeholder="Message…" maxlength="400" autocomplete="off"/><button>Send</button></form>`
      : `<div class="panel" style="text-align:center" class="muted">🔒 Hold a ${title.replace(' room', '')} card to chat here.</div>`}
  </div>`);
  const msgs = $('#msgs', v);
  data.messages.forEach((m) => msgs.appendChild(el(`<div class="msg ${m.handle === state.user ? 'mine' : ''}"><div class="who">@${m.handle}</div><div class="body">${escapeHtml(m.body)}</div></div>`)));
  setTimeout(() => msgs.scrollIntoView({ block: 'end' }), 0);
  const form = $('#composer', v);
  if (form) form.onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#msg', v); const body = input.value.trim(); if (!body) return;
    input.value = '';
    try { await api('/chat/' + encodeURIComponent(room), { method: 'POST', body: JSON.stringify({ body }) }); render(); }
    catch (err) { toast(err.message, 'err'); }
  };
  return v;
};

routes.profile = async () => {
  const [me, inv, incoming, port, ref, sets] = await Promise.all([
    api('/me'), api('/me/invite'), api('/transfers/incoming'), api('/me/portfolio'), api('/me/referrals'), api('/me/sets')]);
  const v = el(`<div>
    <h1 class="h1">@${me.handle}</h1>
    <p class="sub">Your wallet & collection at a glance.</p>
    <div class="panel">
      <div class="kv"><span class="muted">Coins</span><span class="val">◈ ${fmt(port.balance)}</span></div>
      <div class="kv"><span class="muted">Collection value</span><b class="lead">${fmt(port.value)}</b></div>
      <div class="kv"><span class="muted">Net-worth rank</span><span>#${port.networth_rank} of ${port.collectors}</span></div>
      <div class="kv"><span class="muted">You can afford</span><span>${Math.floor(port.balance / 1500)} Founders · ${Math.floor(port.balance / 400)} Standard</span></div>
    </div>
    ${port.movers && port.movers.length ? '<div class="h2">Your movers</div><div id="movers"></div>' : ''}
    ${incoming.length ? `<div class="panel" style="border-color:var(--gold)"><b>📥 ${incoming.length} incoming trade${incoming.length > 1 ? 's' : ''}</b><div id="incoming" style="margin-top:8px"></div></div>` : ''}
    <button class="btn gold" id="buyCoins">Buy Clout Coins (sandbox)</button>
    <div class="btnrow"><button class="btn ghost" id="invite">📣 Invite friends · get the app</button></div>
    <div class="btnrow"><button class="btn ghost" id="install">⬇︎ Install CLOUT</button></div>
    <h2 class="h2">Invite & sets</h2>
    <div class="panel">
      <div class="kv"><span class="muted">Friends invited</span><span>${ref.invited}</span></div>
      <div class="kv"><span class="muted">Referral bonus earned</span><span class="val">◈ ${fmt(ref.bonus_earned)}</span></div>
    </div>
    <div id="sets"></div>
    <h2 class="h2">Account</h2>
    <div class="panel">
      <div class="kv"><span class="muted">Coins are</span><span>in-app only · never cashable</span></div>
      <div class="kv"><span class="muted">Trades are</span><span>card-for-card · no money</span></div>
      <div class="kv"><span class="muted">Your invite</span><span style="font-size:12px;max-width:55%;overflow:hidden;text-overflow:ellipsis">${inv.invite_url}</span></div>
    </div>
    <button class="btn ghost" data-go="about" style="margin-top:6px">ℹ️ About, terms & figure removal</button>
    <button class="btn ghost" data-go="privacy" style="margin-top:8px">🔒 Privacy policy</button>
    <div class="btnrow"><button class="btn ghost" id="switch">Switch demo account</button><button class="btn ghost" id="logout">Log out</button></div>
    <button id="del" style="margin-top:14px;background:none;border:none;color:var(--bad);font-size:13px;text-decoration:underline;width:100%">Delete my account</button>
    <p class="disclaimer" style="margin-top:18px">CLOUT is a digital collectible card game. The Value Guide is an informational estimate, not a price we pay or that you can cash out. Scores are CLOUT's read on public momentum, sourced from public headlines — not factual claims.</p>
  </div>`);
  // movers
  const moversEl = $('#movers', v);
  if (moversEl) (port.movers || []).forEach((m) => {
    const up = m.delta > 0, flat = m.delta === 0;
    moversEl.appendChild(el(`<div class="row"><div><b>${m.display_name}</b> <span class="muted" style="font-size:12px">${m.tier}</span></div>
      <div class="ri"><span class="val">◈ ${fmt(m.value)}</span> <span style="color:${flat ? 'var(--muted)' : up ? 'var(--good)' : 'var(--bad)'};font-size:12px">${flat ? '—' : (up ? '▲' : '▼') + fmt(Math.abs(m.delta))}</span></div></div>`));
  });
  // set completion bars
  const setsEl = $('#sets', v);
  if (setsEl) sets.forEach((s) => {
    const pct = Math.round((s.owned / s.total) * 100);
    setsEl.appendChild(el(`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:13px"><span>${catLabel(s.category)} set ${s.owned === s.total ? '✅' : ''}</span><span class="muted">${s.owned}/${s.total}</span></div>
      <div class="valbar" style="background:linear-gradient(90deg,var(--accent) ${pct}%, #2a2d3a ${pct}%)"></div></div>`));
  });
  // incoming trades
  const incEl = $('#incoming', v);
  if (incEl) for (const t of incoming) {
    incEl.appendChild(el(`<div class="row" style="background:var(--panel2)"><div style="font-size:13px">Gift/swap: ${t.card_ids_out.length} out · ${t.card_ids_in.length} in</div><button class="btn gold sm" data-accept="${t.transfer_id}">Accept</button></div>`));
  }
  $('#buyCoins', v).onclick = async () => {
    const n = prompt('Buy Clout Coins (sandbox). Non-refundable, never cashable.', '5000'); if (!n) return;
    try { await api('/coins/purchase', { method: 'POST', body: JSON.stringify({ coins: Number(n) }) }); toast(`Purchased ◈${fmt(Number(n))}`, 'win'); render(); } catch (e) { toast(e.message, 'err'); }
  };
  $('#invite', v).onclick = async () => {
    const text = `${inv.message} ${inv.invite_url}`;
    if (navigator.share) { try { await navigator.share({ title: 'CLOUT', text, url: inv.invite_url }); return; } catch {} }
    try { await navigator.clipboard.writeText(inv.invite_url); toast('Invite link copied!', 'win'); } catch { prompt('Share this link:', inv.invite_url); }
  };
  $('#install', v).onclick = () => promptInstall();
  $('#switch', v).onclick = async () => {
    const h = prompt('Switch to demo account (you / ava_collects / maxrarity):', 'you'); if (!h) return;
    try { const r = await api('/auth/demo', { method: 'POST', body: JSON.stringify({ handle: h.trim() }) }); setSession(r.token, r.handle); location.hash = 'debut'; render(); }
    catch (e) { toast('No such demo account', 'err'); }
  };
  $('#logout', v).onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } catch {} clearSession(); location.hash = ''; render(); };
  $('#del', v).onclick = async () => {
    if (!confirm('Delete your account? This permanently removes your cards, collection, and data. This cannot be undone.')) return;
    if (!confirm('Are you absolutely sure? All your cards and coins will be gone forever.')) return;
    try { await api('/me/delete', { method: 'POST' }); clearSession(); toast('Your account was deleted.', 'win'); location.hash = ''; render(); }
    catch (e) { toast(e.message, 'err'); }
  };
  return v;
};

/* ============================== ABOUT / TERMS ============================== */
function aboutHtml() {
  return `
  <h2 class="h2" style="margin-top:0">What CLOUT is</h2>
  <p class="sub">A digital collectible card game. Each card is a public figure rendered as a typographic data object — a name, a live Cultural Momentum Score sourced from public headlines, a rank, and a serial number that's yours forever. No photos, no likeness.</p>
  <h2 class="h2">The rules that protect everyone</h2>
  <div class="panel">
    <div class="kv"><span class="muted">Coins & cards</span><span>in-app only · never cashable</span></div>
    <div class="kv"><span class="muted">Trades</span><span>card-for-card · no money</span></div>
    <div class="kv"><span class="muted">Scores</span><span>sourced public momentum, not facts</span></div>
    <div class="kv"><span class="muted">Card value</span><span>an informational guide, not advice</span></div>
    <div class="kv"><span class="muted">Roster</span><span>public figures only</span></div>
    <div class="kv"><span class="muted">Age</span><span>13+</span></div>
  </div>
  <p class="disclaimer">Cultural Momentum Scores are CLOUT's read on public momentum, sourced from public headlines — informational signals, not factual claims and not financial advice. The Value Guide is an estimate, never a price we pay or that you can cash out.</p>
  <h2 class="h2">Contact & figure removal</h2>
  <p class="sub">Questions, feedback, or a removal request from a public figure? Use the buttons below, or email <a class="lead" href="mailto:kytepush@gmail.com">kytepush@gmail.com</a> — we reply by email.</p>
  <p class="muted" style="font-size:12px">This is a plain-language summary. A full Terms of Service & Privacy Policy govern at public launch.</p>`;
}
routes.privacy = async () => el(`<div><div class="muted" data-back style="margin-bottom:6px">‹ Back</div>
  <h1 class="h1">Privacy Policy</h1><p class="sub">Last updated June 2026</p>
  <div class="panel" style="line-height:1.6;font-size:14px">
    <p><b>What we collect.</b> Your handle, an optional email, a securely hashed password, and gameplay data (cards, coins, trades, chat, check-ins) plus basic technical logs.</p>
    <p><b>How we use it.</b> To run your account and the game, send transactional/support email (if you give an address), prevent abuse, and improve CLOUT. Momentum scores come only from public news — never your activity.</p>
    <p><b>What we don't do.</b> We don't sell your data. Coins & cards are in-app only and never cashable.</p>
    <p><b>Sharing.</b> Service providers that run CLOUT (Supabase, Vercel, Gmail) process data on our behalf.</p>
    <p><b>Public activity.</b> Handle, collection stats, leaderboard standing, and chat are visible to others.</p>
    <p><b>Deletion.</b> Delete your account anytime in Profile → Delete my account. Help: <a class="lead" href="mailto:kytepush@gmail.com">kytepush@gmail.com</a>.</p>
    <p><b>Children.</b> 13+. <b>Contact.</b> kytepush@gmail.com</p>
  </div></div>`);

routes.about = async () => {
  const v = el(`<div><div class="muted" data-back style="margin-bottom:6px">‹ Back</div><h1 class="h1">About CLOUT</h1>${aboutHtml()}
    <div class="btnrow"><button class="btn" id="contact">✉️ Contact us</button><button class="btn ghost" id="report">⚐ Report a figure</button></div></div>`);
  $('#contact', v).onclick = () => contactSheet({ topic: 'support' });
  $('#report', v).onclick = () => contactSheet({ topic: 'removal' });
  return v;
};

function contactSheet(prefill = {}) {
  const removal = prefill.topic === 'removal';
  const bg = sheet(`<h3>${removal ? 'Report / remove a figure' : 'Contact CLOUT'}</h3>
    <p class="sub">${removal ? "Public figures can request removal — tell us who and we'll act promptly." : 'Questions or feedback? We read every message and reply by email.'}</p>
    <input class="input" id="c_email" type="email" placeholder="Your email" value="${prefill.email || ''}"/>
    ${removal ? `<input class="input" id="c_figure" placeholder="Figure name" value="${prefill.figure || ''}"/>` : ''}
    <textarea class="input" id="c_msg" rows="4" placeholder="Message" style="resize:none;font-family:inherit">${removal && prefill.figure ? `Please review/remove ${prefill.figure} from CLOUT.` : ''}</textarea>
    <button class="btn gold" id="c_send">Send message</button>`);
  $('#c_send', bg).onclick = async () => {
    const message = $('#c_msg', bg).value.trim();
    if (!message) return toast('Add a message', 'err');
    try {
      await api('/contact', { method: 'POST', body: JSON.stringify({ email: $('#c_email', bg).value.trim(), topic: removal ? 'removal' : 'support', figure: $('#c_figure', bg)?.value.trim() || prefill.figure, message }) });
      bg.remove(); toast("Sent — we'll reply by email.", 'win');
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ============================== ONBOARDING / AUTH ============================== */
function onboarding(mode = 'signup') {
  const v = el(`<div class="onboard">
    <div class="brand" style="font-size:28px">◈ CLOUT</div>
    <div class="big">Collect the people<br><span class="gradtext">moving culture.</span></div>
    <p class="sub">Living trading cards of public figures — no photos, just a name, a live momentum score, and a serial that's yours forever. ${state.ref && mode === 'signup' ? `<br><b class="lead">@${state.ref} invited you</b> — you'll both get bonus coins.` : ''}</p>
    <div class="fan"><img src="${ORIGIN}/api/render/preview/taylor_swift/open.svg"/><img src="${ORIGIN}/api/render/preview/caitlin_clark/founders.svg"/><img src="${ORIGIN}/api/render/preview/mrbeast/standard.svg"/></div>
    ${mode === 'signup' ? '<div class="pill gold free">🎁 Free pack of 3 cards on signup</div>' : '<div class="pill free">Welcome back</div>'}
    <input class="input" id="handle" placeholder="Handle" maxlength="20" autocomplete="username"/>
    <input class="input" id="password" type="password" placeholder="Password (6+ chars)" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"/>
    ${mode === 'signup' ? '<input class="input" id="email" type="email" placeholder="Email (optional — receipts & support)" autocomplete="email"/>' : ''}
    ${mode === 'signup' ? `<label class="agegate"><input type="checkbox" id="age"/><span>I'm 13 or older and agree to the <a class="lead" id="terms">Terms</a>.</span></label>` : ''}
    <button class="btn gold" id="go">${mode === 'signup' ? 'Claim my free pack' : 'Log in'}</button>
    <p class="muted" style="font-size:13px;margin-top:14px">${mode === 'signup' ? 'Already have an account?' : 'New to CLOUT?'} <a class="lead" id="toggle">${mode === 'signup' ? 'Log in' : 'Sign up'}</a></p>
    <p class="muted" style="font-size:12px;margin-top:6px">Coins & cards are in-app only and never cashable. 13+.</p>
    <button class="btn ghost" id="demo" style="margin-top:18px">Try a demo account</button>
  </div>`);
  const submit = async () => {
    const handle = $('#handle', v).value.trim();
    const password = $('#password', v).value;
    if (handle.length < 2) return toast('Pick a handle (2+ chars)', 'err');
    if (password.length < 6) return toast('Password needs 6+ characters', 'err');
    if (mode === 'signup' && !$('#age', v).checked) return toast('Please confirm you’re 13 or older', 'err');
    try {
      if (mode === 'signup') {
        const r = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ handle, password, email: ($('#email', v)?.value || '').trim() || undefined, ref: state.ref }) });
        setSession(r.token, r.handle);
        revealPack(r.welcome.pulled, r.welcome.coins, r.referral_bonus);
      } else {
        const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ handle, password }) });
        setSession(r.token, r.handle); location.hash = 'debut'; render();
      }
    } catch (e) {
      const m = { HANDLE_TAKEN: 'That handle is taken', BAD_CREDENTIALS: 'Wrong handle or password', WEAK_PASSWORD: 'Password needs 6+ characters' };
      toast(m[e.message] || e.message, 'err');
    }
  };
  $('#go', v).onclick = submit;
  $('#password', v).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  const termsLink = $('#terms', v); if (termsLink) termsLink.onclick = () => sheet(`<h3>About CLOUT</h3>${aboutHtml()}`);
  $('#toggle', v).onclick = () => onboarding(mode === 'signup' ? 'login' : 'signup');
  $('#demo', v).onclick = async () => {
    const h = prompt('Demo account: you / ava_collects / maxrarity', 'you'); if (!h) return;
    try { const r = await api('/auth/demo', { method: 'POST', body: JSON.stringify({ handle: h.trim() }) }); setSession(r.token, r.handle); location.hash = 'debut'; render(); }
    catch (e) { toast('No such demo account', 'err'); }
  };
  $('#view').replaceChildren(v);
}

function revealPack(pulled, coins, refBonus) {
  const imgs = pulled.map((p) => `<img src="${ORIGIN}/api/render/card/${p.card_id}.svg"/>`).join('');
  const bg = sheet(`<h3>🎉 Welcome to CLOUT!</h3>
    <p class="sub">Your free pack — 3 cards + ◈${fmt(coins + (refBonus || 0))} to start.</p>
    <div class="fan reveal" style="height:180px">${imgs}</div>
    <button class="btn gold" id="open">Open my collection</button>`);
  $('#open', bg).onclick = () => { bg.remove(); location.hash = 'collection'; render(); refreshBalance(); };
}

/* ============================== CARD ACTION SHEET ============================== */
function cardActions(card) {
  const bg = sheet(`<h3>${card.name} #${card.serial}</h3>
    <p class="sub">${card.rarity || ''} ${card.tier}. Trade it card-for-card, gift it, or share it. CLOUT never attaches money to a trade.</p>
    <button class="btn" id="trade">🔄 Propose a trade</button>
    <div class="btnrow"><button class="btn ghost" id="gift">🎁 Gift to a friend</button><button class="btn ghost" id="share">📤 Share</button></div>
    <div class="btnrow"><button class="btn ghost" id="lock">${card.locked ? '🔓 Unlock' : '🔒 Vault lock'}</button><button class="btn ghost" id="prov">📜 History</button></div>
    <button class="btn ghost" id="room" style="margin-top:10px">💬 Go to ${card.name} room</button>`);
  $('#lock', bg).onclick = async () => {
    try { const r = await api(`/cards/${card.id}/lock`, { method: 'POST' }); bg.remove(); toast(r.locked ? 'Card vaulted 🔒 — safe from trades' : 'Card unlocked', 'win'); render(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#prov', bg).onclick = () => { bg.remove(); showProvenance(card); };
  $('#gift', bg).onclick = async () => {
    const to = prompt(`Gift ${card.name} #${card.serial} to which collector? (handle)\nA gift is free — CLOUT has no payment concept.`); if (!to) return;
    try { await api('/transfers', { method: 'POST', body: JSON.stringify({ to_handle: to.trim().toLowerCase(), card_ids_out: [card.id] }) }); bg.remove(); toast(`Gift sent to @${to.trim()} — they accept it in their profile.`, 'win'); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#trade', bg).onclick = () => { bg.remove(); proposeTrade(card); };
  $('#share', bg).onclick = () => shareFigure(card.fig, `My ${card.name} #${card.serial}`);
  $('#room', bg).onclick = () => { bg.remove(); location.hash = 'room/' + card.fig; render(); };
}

// card-for-card barter: send my card, request one of theirs (by handle). No money leg exists.
async function proposeTrade(card) {
  const to = prompt(`Card-for-card trade.\nSend YOUR ${card.name} #${card.serial} to which collector? (handle)`); if (!to) return;
  const want = prompt(`Optional: paste a card link/id of THEIRS you want in return (leave blank for a one-way gift).`) || '';
  const inId = want.trim().split('/').pop().replace('.svg', '');
  try {
    await api('/transfers', { method: 'POST', body: JSON.stringify({ to_handle: to.trim().toLowerCase(), card_ids_out: [card.id], card_ids_in: inId ? [inId] : [] }) });
    toast(`Trade proposed to @${to.trim()}. They confirm from their profile.`, 'win');
  } catch (e) { toast(e.message, 'err'); }
}

async function shareFigure(figureId, text) {
  const url = `${SITE}/f/${figureId}`; // rich crawlable page with its own preview image
  if (navigator.share) { try { await navigator.share({ title: 'CLOUT', text, url }); return; } catch {} }
  try { await navigator.clipboard.writeText(url); toast('Link copied — preview unfurls when shared!', 'win'); } catch { prompt('Share this link:', url); }
}

async function showProvenance(card) {
  try {
    const p = await api('/cards/' + card.id + '/provenance');
    const ev = (p.events || []).map((e) => `<div class="row" style="background:var(--panel2)"><div style="font-size:13px"><b>${e.kind === 'minted' ? '✨ Minted' : '🔄 Traded'}</b></div><div class="ri muted" style="font-size:11px">${new Date(e.at).toLocaleDateString()}</div></div>`).join('');
    sheet(`<h3>${card.name} #${card.serial}</h3><p class="sub">Held ${p.held_days} day${p.held_days === 1 ? '' : 's'} · provably unique, yours forever.</p>${ev || '<p class="muted">No history yet.</p>'}`);
  } catch (e) { toast(e.message, 'err'); }
}

async function maybeCheckin() {
  if (!state.token || state._checkedIn) return;
  state._checkedIn = true;
  syncPush();
  try { const r = await api('/me/checkin', { method: 'POST' }); if (r.credited > 0) { toast(`🔥 Day ${r.streak} streak · +◈${r.credited}`, 'win'); refreshBalance(); } } catch {}
}

/* ============================== PWA INSTALL ============================== */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
async function promptInstall() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
  else toast('On iPhone: tap Share → "Add to Home Screen" to install CLOUT.');
}

/* ============================== ROUTER ============================== */
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function render() {
  if (!state.token) return onboarding();
  const hash = (location.hash.slice(1) || 'debut');
  const [route, arg] = hash.split('/');
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.go === route || (route === 'room' && t.dataset.go === 'chat') || (route === 'figure' && t.dataset.go === 'discover')));
  const view = $('#view');
  view.replaceChildren(skeleton(route));
  try {
    const node = await (routes[route] || routes.index)(arg);
    node.classList.add('view-in');
    view.replaceChildren(node);
  } catch (e) {
    const er = el(`<div class="empty">Couldn't load that.<br><span class="muted" style="font-size:12px">${escapeHtml(e.message || 'Check your connection.')}</span><br><button class="btn ghost sm" id="retry" style="margin-top:14px">Retry</button></div>`);
    view.replaceChildren(er);
    const rb = $('#retry', er); if (rb) rb.onclick = render;
  }
  refreshBalance();
  maybeCheckin();
}

// shimmer placeholders shown while a route loads (feels production vs a bare "Loading…")
function skeleton(route) {
  const grid = ['collection', 'clash', 'discover'].includes(route);
  const card = ['figure', 'debut'].includes(route);
  let inner = '<div class="sk sk-line" style="width:55%;height:24px"></div><div class="sk sk-line" style="width:82%"></div>';
  if (card) inner += '<div class="sk sk-card" style="max-width:230px;margin:16px auto"></div><div class="sk" style="height:130px;border-radius:16px"></div>';
  else if (grid) inner += '<div class="sk-grid" style="margin-top:14px">' + Array.from({ length: 6 }, () => '<div class="sk sk-card"></div>').join('') + '</div>';
  else inner += '<div style="margin-top:14px">' + Array.from({ length: 7 }, () => '<div class="sk sk-row"></div>').join('') + '</div>';
  return el(`<div>${inner}</div>`);
}

document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]'); if (go) { location.hash = go.dataset.go; render(); return; }
  if (e.target.closest('[data-back]')) { history.length > 1 ? history.back() : (location.hash = 'index'); render(); return; }
  const card = e.target.closest('[data-card]'); if (card) { cardActions(JSON.parse(card.dataset.card)); return; }
  const buy = e.target.closest('[data-buy]'); if (buy) return doBuy(buy.dataset.buy, buy.dataset.name);
  const claim = e.target.closest('[data-claim]'); if (claim) return doClaim(claim.dataset.fig, claim.dataset.claim);
  const acc = e.target.closest('[data-accept]'); if (acc) return doAccept(acc.dataset.accept);
  if (e.target.id === 'yield') doYield();
});

async function doClaim(figureId, tier) {
  try {
    const r = await api(`/debut/${figureId}/claim`, { method: 'POST', body: JSON.stringify({ tier }) });
    toast(`Claimed ${tier} #${r.serial}${r.founding ? ' — 🏅 Founding Collector!' : ''}`, 'win');
    render();
  } catch (e) {
    const m = { INSUFFICIENT_COINS: 'Not enough coins — top up in your profile.', SOLD_OUT: 'Sold out!' };
    toast(m[e.message] || e.message, 'err');
  }
}

async function doBuy(cardTypeId, name) {
  try { const r = await api(`/reserve/${cardTypeId}/buy`, { method: 'POST' }); toast(`Collected ${name} #${r.serial} for ◈${fmt(r.price)}!`, 'win'); render(); }
  catch (e) { toast(e.code === 'INSUFFICIENT_COINS' || e.message === 'INSUFFICIENT_COINS' ? 'Not enough coins — buy more in your profile.' : e.message, 'err'); }
}
async function doAccept(id) {
  try { await api(`/transfers/${id}/accept`, { method: 'POST' }); toast('Trade accepted! 🤝', 'win'); render(); } catch (e) { toast(e.message, 'err'); }
}
async function doYield() {
  try { const r = await api('/me/claim-yield', { method: 'POST' }); toast(`Hold-yield: ◈${fmt(r.credited)}`, 'win'); refreshBalance(); } catch (e) { toast(e.message, 'err'); }
}

window.addEventListener('hashchange', render);

// Native shell (Capacitor): status bar, hide splash, hardware back, open links externally.
function initNative() {
  if (!NATIVE) return;
  const P = window.Capacitor.Plugins || {};
  try { P.StatusBar?.setStyle?.({ style: 'DARK' }); P.StatusBar?.setBackgroundColor?.({ color: '#08090f' }); } catch {}
  try { P.SplashScreen?.hide?.(); } catch {}
  // Android hardware back: navigate back, or exit at the root
  try {
    P.App?.addListener?.('backButton', () => {
      const h = location.hash.slice(1) || 'debut';
      if (['debut', 'index', 'discover', 'collection', 'chat', 'profile'].includes(h)) P.App?.exitApp?.();
      else { history.back(); render(); }
    });
  } catch {}
  // open external links (news headlines) in the system browser, not the app webview
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="http"]');
    if (a) { e.preventDefault(); try { P.Browser?.open?.({ url: a.href }); } catch {} }
  }, true);
  // push notifications — only if the plugin is installed + configured (FCM/APNs); else no-op
  try {
    const Push = P.PushNotifications;
    if (Push) {
      Push.addListener('registration', (t) => { state._pushToken = t.value; syncPush(); });
      Push.requestPermissions().then((perm) => { if (perm && perm.receive === 'granted') Push.register(); }).catch(() => {});
    }
  } catch {}
}
function syncPush() {
  if (!state.token || !state._pushToken) return;
  const platform = (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'unknown';
  api('/push/register', { method: 'POST', body: JSON.stringify({ token: state._pushToken, platform }) }).catch(() => {});
}

(async function boot() {
  initNative();
  if (!NATIVE && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { state.categories = await api('/meta/categories'); } catch {}
  // deep link: /?u=handle opens straight into a demo account (demo convenience)
  const u = new URLSearchParams(location.search).get('u');
  if (u && !state.token) {
    try { const r = await api('/auth/demo', { method: 'POST', body: JSON.stringify({ handle: u }) }); setSession(r.token, r.handle); } catch {}
  }
  render();
})();
