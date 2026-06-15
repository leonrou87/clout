// CLOUT — Card Renderer (THE NO-IMAGE PREMIUM LAYER).
//
// HARD CONSTRAINT B: cards use NAME + live data + symbolic/typographic design ONLY.
// This renderer's asset library is typography + vector shapes + data-viz. There is NO
// photographic or face asset and no code path that could draw a human face — likeness
// depiction is structurally impossible. Glyphs are domain icons (mic, ball, rocket), not
// caricatures.
//
// Output: a high-resolution SVG string styled like a premium financial instrument /
// collectible. Deterministic from design_seed so a card always renders identically.
// (PNG rasterization can be added with resvg/sharp at the edge; SVG renders natively in
// browsers, so the MVP serves SVG directly.)

import { CATEGORIES, COIN, hashSeed } from './shared.mjs';

const W = 600, H = 840;

// Domain glyphs — symbolic vector icons, NEVER a likeness. Drawn centered in a 100x100 box.
const GLYPHS = {
  mic: '<rect x="42" y="18" width="16" height="40" rx="8"/><path d="M30 50a20 20 0 0 0 40 0" fill="none" stroke-width="6"/><line x1="50" y1="70" x2="50" y2="86" stroke-width="6"/><line x1="36" y1="86" x2="64" y2="86" stroke-width="6"/>',
  ball: '<circle cx="50" cy="50" r="30" fill="none" stroke-width="6"/><path d="M50 20v60M20 50h60M28 28l44 44M72 28L28 72" fill="none" stroke-width="4"/>',
  play: '<circle cx="50" cy="50" r="32" fill="none" stroke-width="6"/><path d="M42 36l24 14-24 14z"/>',
  rocket: '<path d="M50 16c14 10 18 26 14 44l-8 10h-12l-8-10c-4-18 0-34 14-44z" fill="none" stroke-width="6"/><circle cx="50" cy="44" r="6"/><path d="M40 70l-8 14M60 70l8 14" stroke-width="6"/>',
  star: '<path d="M50 18l9 26h28l-22 16 8 26-23-16-23 16 8-26-22-16h28z" fill="none" stroke-width="5" stroke-linejoin="round"/>',
  globe: '<circle cx="50" cy="50" r="30" fill="none" stroke-width="6"/><ellipse cx="50" cy="50" rx="14" ry="30" fill="none" stroke-width="4"/><line x1="20" y1="50" x2="80" y2="50" stroke-width="4"/>',
  atom: '<circle cx="50" cy="50" r="6"/><g fill="none" stroke-width="4"><ellipse cx="50" cy="50" rx="34" ry="14"/><ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="34" ry="14" transform="rotate(120 50 50)"/></g>',
};

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Build a sparkline path from 0..1000 values across the card's data window.
function sparkline(values, x, y, w, h) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const px = x + (i / (values.length - 1)) * w;
    const py = y + h - ((v - min) / span) * h;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  return `<polyline points="${pts.join(' ')}" fill="none" stroke="url(#accentGrad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// Fit a long name into the hero area by scaling font size to length.
function heroFontSize(name) {
  const n = name.length;
  if (n <= 8) return 88;
  if (n <= 12) return 68;
  if (n <= 18) return 52;
  return 42;
}

/**
 * @param {object} c
 * @param {string} c.display_name
 * @param {string} c.category        category key (music/athlete/...)
 * @param {number} c.cms             live Cultural Momentum Score 0..1000
 * @param {number} c.rank            global rank
 * @param {number[]} c.sparkline     recent CMS values (7-day)
 * @param {'genesis'|'founders'|'standard'|'open'} c.tier
 * @param {'base'|'foil'|'animated'} c.foil_state
 * @param {number} c.serial_number
 * @param {number|null} c.max_supply
 * @param {string} c.design_seed
 * @param {boolean} [c.founding]     founding-collector badge
 * @param {string} [c.rarity]        Pokémon-style rarity symbol (● ◆ ★ ✦)
 * @param {number} [c.value]         informational Value-Guide point (coins)
 * @param {number} [c.value_lo]      guide range low
 * @param {number} [c.value_hi]      guide range high
 */
export function renderCardSVG(c) {
  const cat = CATEGORIES[c.category] || CATEGORIES.science;
  const seed = hashSeed(c.design_seed || c.display_name);
  const rot = seed % 360; // procedural backdrop rotation
  const glyph = GLYPHS[cat.glyph] || GLYPHS.atom;
  const foilTop = c.tier === 'genesis' || c.foil_state === 'animated';
  const tierLabel = { genesis: 'GENESIS', founders: 'FOUNDERS', standard: 'STANDARD', open: 'OPEN' }[c.tier] || 'OPEN';
  const serialText = c.tier === 'genesis'
    ? '1 / 1'
    : `#${c.serial_number}${c.max_supply ? ` / ${c.max_supply}` : ''}`;
  const fs = heroFontSize(c.display_name);
  const spark = sparkline(c.sparkline, 48, 470, 504, 90);

  // animated foil sweep for top tier
  const foilAnim = foilTop
    ? `<animateTransform attributeName="gradientTransform" type="translate" from="-1 0" to="1 0" dur="3.5s" repeatCount="indefinite"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="CLOUT card: ${esc(c.display_name)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0b0d14"/><stop offset="1" stop-color="#15131f"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${cat.accent}"/><stop offset="1" stop-color="${cat.accent2}"/>
    </linearGradient>
    <linearGradient id="foil" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="${cat.accent}" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="${foilTop ? 0.45 : 0.12}"/>
      <stop offset="1" stop-color="${cat.accent2}" stop-opacity="0"/>
      ${foilAnim}
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.32" r="0.6">
      <stop offset="0" stop-color="${cat.accent}" stop-opacity="${Math.min(0.5, 0.12 + c.cms / 2200)}"/>
      <stop offset="1" stop-color="${cat.accent}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="card"><rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="34"/></clipPath>
  </defs>

  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="34" fill="url(#bg)"/>
  <g clip-path="url(#card)">
    <!-- procedural geometric backdrop (abstract, no figures) -->
    <g transform="rotate(${rot} 300 300)" opacity="0.10" stroke="url(#accentGrad)" fill="none" stroke-width="2">
      ${Array.from({ length: 7 }, (_, i) => `<circle cx="300" cy="${120 + i * 30}" r="${60 + i * 55}"/>`).join('')}
    </g>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="url(#glow)"/>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="url(#foil)"/>

    <!-- header: tier + rarity symbol + category glyph -->
    <text x="48" y="74" font-family="'Helvetica Neue',Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="6" fill="${cat.accent}">${tierLabel} ${c.rarity || ''}</text>
    <text x="48" y="100" font-family="'Helvetica Neue',Arial,sans-serif" font-size="15" letter-spacing="3" fill="#8a8aa0">${cat.label.toUpperCase()} · CLOUT</text>
    <g transform="translate(456,36)" stroke="${cat.accent}" fill="${cat.accent}">${glyph}</g>

    <!-- hero name -->
    <text x="48" y="${230 + (fs > 70 ? 0 : 12)}" font-family="'Helvetica Neue',Arial,sans-serif" font-size="${fs}" font-weight="800" fill="#ffffff">${esc(c.display_name)}</text>

    <!-- live CMS -->
    <text x="48" y="320" font-family="'Helvetica Neue',Arial,sans-serif" font-size="16" letter-spacing="3" fill="#8a8aa0">CULTURAL MOMENTUM</text>
    <text x="44" y="430" font-family="'Helvetica Neue',Arial,sans-serif" font-size="140" font-weight="800" fill="url(#accentGrad)">${c.cms}
      <animate attributeName="opacity" values="1;0.78;1" dur="2.4s" repeatCount="indefinite"/>
    </text>
    <text x="${44 + String(c.cms).length * 84 + 8}" y="430" font-family="'Helvetica Neue',Arial,sans-serif" font-size="28" fill="#6f6f86">/1000</text>

    <!-- rank chip -->
    <g transform="translate(420,348)">
      <rect width="132" height="56" rx="14" fill="#ffffff" opacity="0.06"/>
      <text x="16" y="24" font-family="Arial" font-size="13" letter-spacing="2" fill="#8a8aa0">RANK</text>
      <text x="16" y="46" font-family="'Helvetica Neue',Arial" font-size="26" font-weight="800" fill="#fff">#${c.rank}</text>
    </g>

    <!-- 7-day sparkline -->
    <text x="48" y="462" font-family="Arial" font-size="13" letter-spacing="2" fill="#8a8aa0">7-DAY MOVEMENT</text>
    ${spark}

    <!-- value guide (informational, like a Beckett/TCGplayer guide — NOT a sale price) -->
    ${c.value ? `<g>
      <text x="48" y="596" font-family="Arial" font-size="13" letter-spacing="2" fill="#8a8aa0">VALUE GUIDE</text>
      <text x="48" y="624" font-family="'Helvetica Neue',Arial" font-size="26" font-weight="800" fill="${cat.accent}">◈ ${c.value.toLocaleString()}</text>
      <text x="${56 + String('◈ ' + c.value.toLocaleString()).length * 13}" y="624" font-family="Arial" font-size="13" fill="#6f6f86">${c.value_lo ? `range ${c.value_lo.toLocaleString()}–${c.value_hi.toLocaleString()}` : ''}</text>
    </g>` : ''}

    <!-- footer: serial + provenance + sourced-signal disclaimer -->
    <line x1="48" y1="648" x2="552" y2="648" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1"/>
    <text x="48" y="690" font-family="'Helvetica Neue',Arial" font-size="36" font-weight="800" fill="#fff">${serialText}</text>
    <text x="48" y="716" font-family="Arial" font-size="13" letter-spacing="2" fill="#8a8aa0">SERIAL · PROVABLY UNIQUE</text>
    ${c.founding ? `<g transform="translate(372,668)"><rect width="180" height="40" rx="20" fill="none" stroke="${cat.accent}" stroke-width="2"/><text x="90" y="26" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" letter-spacing="2" fill="${cat.accent}">FOUNDING COLLECTOR</text></g>` : ''}

    <text x="48" y="794" font-family="Arial" font-size="11.5" fill="#5a5a70">CLOUT's read on public momentum, sourced from public headlines. Informational signal — not a factual claim.</text>
  </g>
  <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="34" fill="none" stroke="url(#accentGrad)" stroke-width="${foilTop ? 4 : 2}"/>
</svg>`;
}
