// CLOUT — shared types, constants and small helpers used across packages.
// Plain ESM + JSDoc so the whole repo runs with no build step.

/**
 * Rarity tiers — Pokémon-TCG-style ENGINEERED scarcity (low print run = high value).
 * Lower serial = higher status. Scarcity is real; value is STATUS + a published value
 * GUIDE, never a promised cash return (HARD CONSTRAINT E).
 *
 * `print_run` is the total copies that will ever exist of that tier per figure — finite,
 * so there are genuinely "more than one" of most cards (real trading depth) while the chase
 * tiers stay vanishingly rare. `rarity` is the Pokémon-style symbol; `valueBase` anchors the
 * Value Guide and is spread WIDE across tiers (◈40 commons → ◈50k+ 1/1 chase).
 *
 * Serial ranges are contiguous and permanent per figure.
 */
export const TIERS = {
  genesis:  { key: 'genesis',  label: 'Genesis',  serialStart: 0,     maxSupply: 1,     printRun: 1,     rarity: '✦', valueBase: 50000 }, // 1/1 chase
  founders: { key: 'founders', label: 'Founders', serialStart: 1,     maxSupply: 100,   printRun: 100,   rarity: '★', valueBase: 6000  }, // Debut only
  standard: { key: 'standard', label: 'Standard', serialStart: 101,   maxSupply: 2400,  printRun: 2400,  rarity: '◆', valueBase: 450   }, // broad base
  open:     { key: 'open',     label: 'Open',     serialStart: 2501,  maxSupply: 25000, printRun: 25000, rarity: '●', valueBase: 35    }, // common on-ramp
};

export const TIER_ORDER = ['genesis', 'founders', 'standard', 'open'];

/**
 * Append-only ledger reasons. There is DELIBERATELY no cash-out reason.
 * No code path may ever pay a user real money (HARD CONSTRAINT A).
 */
export const LEDGER_REASONS = [
  'purchase', // coins bought with real money (IAP/Stripe). One-way: money -> coins.
  'pack_open',
  'card_buy',
  'hold_yield', // passive drip ∝ momentum, stays INSIDE the coin economy
  'reward', // login / leaderboard / set completion / welcome grant
  'gift_send',
  'gift_recv',
];

export const TRANSFER_STATUS = ['proposed', 'accepted', 'completed', 'cancelled'];

export const FOIL_STATES = ['base', 'foil', 'animated'];

/**
 * Category color system. Drives the no-face visual identity: instant recognition
 * by colour + glyph, never by likeness (HARD CONSTRAINT B).
 * glyph keys map to vector icons in the card renderer (NOT a likeness).
 */
export const CATEGORIES = {
  music: { label: 'Music', accent: '#FF2E88', accent2: '#7A1FFF', glyph: 'mic' },
  athlete: { label: 'Athlete', accent: '#00E0A4', accent2: '#0066FF', glyph: 'ball' },
  creator: { label: 'Creator', accent: '#FF5C00', accent2: '#FFC400', glyph: 'play' },
  tech: { label: 'Tech', accent: '#22D3EE', accent2: '#3B82F6', glyph: 'rocket' },
  actor: { label: 'Actor', accent: '#F43F5E', accent2: '#A21CAF', glyph: 'star' },
  politics: { label: 'World', accent: '#94A3B8', accent2: '#475569', glyph: 'globe' },
  science: { label: 'Science', accent: '#34D399', accent2: '#10B981', glyph: 'atom' },
};

export const COIN = '◈'; // Clout Coin symbol (purely cosmetic in-app currency)

/** Pack odds are disclosed in the UI (Apple 3.1.1) and returned by the API. */
export const PACKS = {
  starter: {
    pack_id: 'starter',
    name: 'Starter Pack',
    coin_price: 250,
    cards: 3,
    // disclosed odds per drawn card; must sum to 1
    odds: { open: 0.78, standard: 0.2, founders: 0.02 },
    pity: { everyN: 10, guarantees: 'standard' }, // pity timer to avoid simulated-gambling feel
  },
  premium: {
    pack_id: 'premium',
    name: 'Premium Pack',
    coin_price: 1200,
    cards: 5,
    odds: { open: 0.5, standard: 0.45, founders: 0.05 },
    pity: { everyN: 6, guarantees: 'founders' },
  },
};

/**
 * Market / Value-Guide model config.
 *
 * The Value Guide is an INFORMATIONAL estimate (modeled on Beckett's HI–LO range and
 * TCGplayer's "market price reflects recent sales"). It is NOT an in-app transaction price:
 * users never buy cards from each other for coins. They trade card-for-card (barter) and may
 * buy NEW copies from the publisher RESERVE with coins. The guide is shareable/flex — its
 * "last known" point moves with demand so it resembles a last-sale price (HARD CONSTRAINT D:
 * informational signal; value is supply/demand, never authored by us as a person's "stock").
 */
export const MARKET = {
  // value = valueBase(tier) * cmsMult * demandMult * scarcityMult * lowSerialMult
  cms: { floor: 0.5, span: 500 },        // cmsMult = floor + cms/span  → 0.5..2.5
  demand: { holders: 0.16, trades: 0.22, recentBuys: 0.12 }, // log-weighted demand inputs
  scarcity: { floor: 0.6, span: 0.9 },   // scarcityMult = floor + (unminted fraction)*span
  range: { lo: 0.85, hi: 1.18 },          // Beckett-style guide range around the point value
  reserveFraction: 0.6,                   // fraction of each print run held as buyable reserve
};

/** Popularity score weights — the CARD RANKER (by demand, separate from CMS news integrity). */
export const POPULARITY = { holders: 3, trades: 6, recentBuys: 4, cms: 0.05 };

/** Free welcome pack granted on first open ("download the app → free 3 cards"). */
export const WELCOME = { cards: 3, coins: 1500, tierOdds: { open: 0.7, standard: 0.27, founders: 0.03 } };

/** Referral bonus (both inviter and invitee) — coins only, closed-loop. */
export const REFERRAL_BONUS = 500;

export function nowIso() {
  return new Date().toISOString();
}

/** Deterministic 32-bit hash for design seeds (so art is reproducible). */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
