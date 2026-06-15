// CLOUT mobile PWA client. Collectible language only ("own / collect / rare / trade with
// friends"), never "invest / profit / cash in" (HARD CONSTRAINT E). The Value Guide is an
// informational estimate (like Beckett/TCGplayer) — never an in-app sale price. Peer trades
// are card-for-card barter; the app is silent on money.

const LS = window.localStorage;
const state = {
  token: LS.getItem('clout_token') || null,
  user: LS.getItem('clout_handle') || null,
  categories: {},
  ref: new URLSearchParams(location.search).get('ref'),
};

const $ = (s, r = document) => r.querySelector(s);
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

function setSession(token, handle) {
  state.token = token; state.user = handle;
  LS.setItem('clout_token', token); LS.setItem('clout_handle', handle);
}
function clearSession() {
  state.token = null; state.user = null;
  LS.removeItem('clout_token'); LS.removeItem('clout_handle');
}

async function api(path, opts = {}) {
  const headers = { 'content-type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers['authorization'] = 'Bearer ' + state.token;
  const r = await fetch('/api' + path, { ...opts, headers });
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
    <div class="card-wrap" style="max-width:230px;margin:0 auto 14px"><img class="card-svg" src="/api/render/preview/${f.figure_id}/founders.svg"/></div>
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

routes.index = async () => {
  const { figures, as_of } = await api('/index/clout500');
  const top = await Promise.all(figures.slice(0, 40).map(async (f) => {
    const d = await api('/figures/' + f.figure_id); return { ...f, sparkline: d.sparkline };
  }));
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
  const { cards } = await api('/cards/top?by=' + by);
  const v = el(`<div>
    <h1 class="h1">Cards</h1>
    <p class="sub">The card ranker — by collector demand, not news. Tap a card to view its room, value guide, and buy a copy from the reserve.</p>
    <div class="seg" id="seg">
      <button data-by="popularity">Popular</button>
      <button data-by="trending">Trending</button>
      <button data-by="value">Top Value</button>
    </div>
    <div id="list"></div></div>`);
  $('#seg', v).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.by === by);
    b.onclick = () => { state._rankBy = b.dataset.by; render(); };
  });
  const list = $('#list', v);
  cards.forEach((c, i) => list.appendChild(el(`
    <div class="row" data-go="figure/${c.figure_id}">
      <span class="rank">${i + 1}</span>
      <div><div style="font-weight:700">${c.display_name} <span class="muted" style="font-weight:600">${c.rarity} ${c.tier}</span></div>
        <div class="muted" style="font-size:12px">${c.holders} holders · ${c.minted}/${fmt(c.print_run)} minted</div></div>
      <div class="ri"><div class="val">◈ ${fmt(c.value)}</div><div class="muted" style="font-size:11px">${by === 'value' ? 'guide' : 'pop ' + c.popularity}</div></div>
    </div>`)));
  return v;
};

routes.figure = async (id) => {
  const f = await api('/figures/' + id);
  const v = el(`<div>
    <div class="muted" data-back style="margin-bottom:10px">‹ Back</div>
    <h1 class="h1">${f.display_name}</h1>
    <p class="sub"><span class="cat-dot" style="background:${catColor(f.category)}"></span> ${catLabel(f.category)} · Rank #${f.rank}</p>
    <div class="card-wrap" style="max-width:230px;margin:0 auto 14px"><img class="card-svg" src="/api/render/preview/${f.figure_id}/founders.svg"/></div>
    <div class="panel">
      <div class="kv"><span class="muted">Cultural Momentum</span><span class="cms">${f.cms} <span class="muted">/1000</span></span></div>
      <div class="kv"><span class="muted">7-day movement</span>${miniSpark(f.sparkline, 130, 28)}</div>
      <div style="margin:12px 0 4px"><span class="pill">Driving headlines</span></div>
      ${f.driving.map((h) => `<a class="headline" href="${h.url}" target="_blank" rel="noopener">${h.title}<span class="src"> — ${h.source} · ${new Date(h.published_at).toLocaleDateString()}</span></a>`).join('') || '<p class="muted">No recent public coverage.</p>'}
      <p class="disclaimer">${f.disclaimer}</p>
    </div>
    <h2 class="h2">Value guide & reserve</h2>
    <p class="sub" style="margin-bottom:10px">Informational estimate (like a price guide), not a sale price. Buy a new copy from the publisher reserve with credits; trade copies with friends.</p>
    <div id="tiers"></div>
    <button class="btn ghost" data-go="room/${f.figure_id}" style="margin-top:6px">💬 Open ${f.display_name} chat room</button>
  </div>`);
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
      ${ct.tier === 'genesis'
        ? `<div class="muted" style="font-size:12px;margin-top:8px">The 1/1 chase card — not sold from reserve.</div>`
        : `<button class="btn ${soldOut ? 'ghost' : 'gold'} sm" style="margin-top:10px;width:100%" ${soldOut ? 'disabled' : ''} data-buy="${ct.card_type_id}" data-name="${f.display_name} ${ct.tier}">${soldOut ? 'Reserve empty' : 'Buy a copy · ◈ ' + fmt(ct.value)}</button>`}
    </div>`));
  });
  return v;
};

routes.collection = async () => {
  const c = await api('/me/collection');
  const v = el(`<div>
    <h1 class="h1">Your Collection</h1>
    <p class="sub">Status score <b class="lead">${fmt(c.value)}</b> — rarity + low serials + momentum (in-app status, not cash).
      <button class="btn ghost sm" id="yield" style="margin-top:8px">Claim hold-yield</button></p>
    ${c.cards.length ? '<div class="cardgrid" id="grid"></div>' : '<div class="empty">No cards yet.<br>Open the Cards tab to buy from the reserve, or invite a friend.</div>'}
  </div>`);
  if (c.cards.length) {
    const grid = $('#grid', v);
    c.cards.forEach((card) => {
      const w = el(`<div>
        <div class="card-wrap" data-card='${JSON.stringify({ id: card.card_id, name: card.display_name, serial: card.serial_number, fig: card.figure_id, tier: card.tier }).replace(/'/g, '&#39;')}'>
          <img class="card-svg" src="/api/render/card/${card.card_id}.svg" loading="lazy"/>
          ${card.founding ? '<div class="card-badge">🏅 Founding</div>' : ''}
        </div>
        <div class="card-meta"><span>${card.rarity} ${card.tier}</span><span class="val">◈ ${fmt(card.value)}</span></div>
      </div>`);
      grid.appendChild(w);
    });
  }
  return v;
};

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
  const me = await api('/me');
  const inv = await api('/me/invite');
  const incoming = await api('/transfers/incoming');
  const v = el(`<div>
    <h1 class="h1">@${me.handle}</h1>
    <p class="sub">Balance <b class="val">◈ ${fmt(me.balance)}</b></p>
    ${incoming.length ? `<div class="panel" style="border-color:var(--gold)"><b>📥 ${incoming.length} incoming trade${incoming.length > 1 ? 's' : ''}</b><div id="incoming" style="margin-top:8px"></div></div>` : ''}
    <button class="btn gold" id="buyCoins">Buy Clout Coins (sandbox)</button>
    <div class="btnrow"><button class="btn ghost" id="invite">📣 Invite friends · get the app</button></div>
    <div class="btnrow"><button class="btn ghost" id="install">⬇︎ Install CLOUT</button></div>
    <h2 class="h2">Account</h2>
    <div class="panel">
      <div class="kv"><span class="muted">Coins are</span><span>in-app only · never cashable</span></div>
      <div class="kv"><span class="muted">Trades are</span><span>card-for-card · no money</span></div>
      <div class="kv"><span class="muted">Your invite</span><span style="font-size:12px;max-width:55%;overflow:hidden;text-overflow:ellipsis">${inv.invite_url}</span></div>
    </div>
    <div class="btnrow"><button class="btn ghost" id="switch">Switch demo account</button><button class="btn ghost" id="logout">Log out</button></div>
    <p class="disclaimer" style="margin-top:18px">CLOUT is a digital collectible card game. The Value Guide is an informational estimate, not a price we pay or that you can cash out. Scores are CLOUT's read on public momentum, sourced from public headlines — not factual claims.</p>
  </div>`);
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
  return v;
};

/* ============================== ONBOARDING / AUTH ============================== */
function onboarding(mode = 'signup') {
  const v = el(`<div class="onboard">
    <div class="brand" style="font-size:28px">◈ CLOUT</div>
    <div class="big">Collect the people<br>moving culture.</div>
    <p class="sub">Living trading cards of public figures — no photos, just a name, a live momentum score, and a serial that's yours forever. ${state.ref && mode === 'signup' ? `<br><b class="lead">@${state.ref} invited you</b> — you'll both get bonus coins.` : ''}</p>
    <div class="fan"><img src="/api/render/preview/taylor_swift/open.svg"/><img src="/api/render/preview/caitlin_clark/founders.svg"/><img src="/api/render/preview/mrbeast/standard.svg"/></div>
    ${mode === 'signup' ? '<div class="pill gold free">🎁 Free pack of 3 cards on signup</div>' : '<div class="pill free">Welcome back</div>'}
    <input class="input" id="handle" placeholder="Handle" maxlength="20" autocomplete="username"/>
    <input class="input" id="password" type="password" placeholder="Password (6+ chars)" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"/>
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
    try {
      if (mode === 'signup') {
        const r = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ handle, password, ref: state.ref }) });
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
  $('#toggle', v).onclick = () => onboarding(mode === 'signup' ? 'login' : 'signup');
  $('#demo', v).onclick = async () => {
    const h = prompt('Demo account: you / ava_collects / maxrarity', 'you'); if (!h) return;
    try { const r = await api('/auth/demo', { method: 'POST', body: JSON.stringify({ handle: h.trim() }) }); setSession(r.token, r.handle); location.hash = 'debut'; render(); }
    catch (e) { toast('No such demo account', 'err'); }
  };
  $('#view').replaceChildren(v);
}

function revealPack(pulled, coins, refBonus) {
  const imgs = pulled.map((p) => `<img src="/api/render/card/${p.card_id}.svg"/>`).join('');
  const bg = sheet(`<h3>🎉 Welcome to CLOUT!</h3>
    <p class="sub">Your free pack — 3 cards + ◈${fmt(coins + (refBonus || 0))} to start.</p>
    <div class="fan" style="height:180px">${imgs}</div>
    <button class="btn gold" id="open">Open my collection</button>`);
  $('#open', bg).onclick = () => { bg.remove(); location.hash = 'collection'; render(); refreshBalance(); };
}

/* ============================== CARD ACTION SHEET ============================== */
function cardActions(card) {
  const bg = sheet(`<h3>${card.name} #${card.serial}</h3>
    <p class="sub">${card.rarity || ''} ${card.tier}. Trade it card-for-card, gift it, or share it. CLOUT never attaches money to a trade.</p>
    <button class="btn" id="trade">🔄 Propose a trade</button>
    <div class="btnrow"><button class="btn ghost" id="gift">🎁 Gift to a friend</button><button class="btn ghost" id="share">📤 Share</button></div>
    <button class="btn ghost" id="room" style="margin-top:10px">💬 Go to ${card.name} room</button>`);
  $('#gift', bg).onclick = async () => {
    const to = prompt(`Gift ${card.name} #${card.serial} to which collector? (handle)\nA gift is free — CLOUT has no payment concept.`); if (!to) return;
    try { await api('/transfers', { method: 'POST', body: JSON.stringify({ to_handle: to.trim().toLowerCase(), card_ids_out: [card.id] }) }); bg.remove(); toast(`Gift sent to @${to.trim()} — they accept it in their profile.`, 'win'); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#trade', bg).onclick = () => { bg.remove(); proposeTrade(card); };
  $('#share', bg).onclick = async () => {
    const url = location.origin + '/api/render/card/' + card.id + '.svg';
    if (navigator.share) { try { await navigator.share({ title: `My ${card.name} card`, text: `Check out my ${card.name} #${card.serial} on CLOUT`, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); toast('Card link copied!', 'win'); } catch {}
  };
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
  view.replaceChildren(el('<p class="muted" style="padding:30px;text-align:center">Loading…</p>'));
  try { view.replaceChildren(await (routes[route] || routes.index)(arg)); }
  catch (e) { view.replaceChildren(el(`<p class="empty">Couldn't load: ${e.message}</p>`)); }
  refreshBalance();
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

(async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { state.categories = await api('/meta/categories'); } catch {}
  // deep link: /?u=handle opens straight into a demo account (demo convenience)
  const u = new URLSearchParams(location.search).get('u');
  if (u && !state.token) {
    try { const r = await api('/auth/demo', { method: 'POST', body: JSON.stringify({ handle: u }) }); setSession(r.token, r.handle); } catch {}
  }
  render();
})();
