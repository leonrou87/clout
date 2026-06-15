// CLOUT — launch roster + mock ingestion.
//
// The launch roster is ~1,000 curated PUBLIC figures (see 05_launch_roster.md). For the
// local MVP we ship a representative slice across the category mix. Each figure carries a
// deterministic "news profile" used to synthesize pre-scored articles, standing in for the
// real Stage A–C pipeline (GDELT/news API → entity resolution → LLM per-article scoring).
//
// HARD CONSTRAINT C & F:
//  - Driving headlines are presented as neutral PUBLIC sources with links. The app NEVER
//    editorializes WHY a score moved in factual/accusatory terms. We show sources, assert
//    nothing. Headlines below are deliberately neutral, descriptive, non-accusatory.
//  - Public figures only. `policy_flags` carries the roster safety policy; `status` can be
//    flipped to 'excluded' via the admin removal/opt-out endpoint.

import { runCycle } from './engine.mjs';

const SOURCES = [
  { name: 'Reuters', authority: 0.95 },
  { name: 'Associated Press', authority: 0.95 },
  { name: 'The Guardian', authority: 0.85 },
  { name: 'Billboard', authority: 0.8 },
  { name: 'ESPN', authority: 0.85 },
  { name: 'The Verge', authority: 0.8 },
  { name: 'Variety', authority: 0.8 },
  { name: 'Bloomberg', authority: 0.9 },
];

// figure: { id, display_name, aliases, category, profile }
// profile: { intensity 0..1 (news volume), tone -1..1 (avg valence), buzz 0..1 (recent spike) }
export const ROSTER = [
  // Music (~22%)
  { id: 'taylor_swift', display_name: 'Taylor Swift', aliases: ['Swift'], category: 'music', profile: { intensity: 0.98, tone: 0.55, buzz: 0.9 } },
  { id: 'bad_bunny', display_name: 'Bad Bunny', aliases: ['Benito'], category: 'music', profile: { intensity: 0.8, tone: 0.5, buzz: 0.6 } },
  { id: 'sabrina_carpenter', display_name: 'Sabrina Carpenter', aliases: [], category: 'music', profile: { intensity: 0.7, tone: 0.45, buzz: 0.75 } },
  { id: 'the_weeknd', display_name: 'The Weeknd', aliases: ['Abel Tesfaye'], category: 'music', profile: { intensity: 0.6, tone: 0.3, buzz: 0.4 } },
  // Athletes (~22%)
  { id: 'jalen_brunson', display_name: 'Jalen Brunson', aliases: ['Brunson'], category: 'athlete', profile: { intensity: 0.7, tone: 0.7, buzz: 0.85 } },
  { id: 'caitlin_clark', display_name: 'Caitlin Clark', aliases: [], category: 'athlete', profile: { intensity: 0.85, tone: 0.6, buzz: 0.9 } },
  { id: 'lebron_james', display_name: 'LeBron James', aliases: ['LeBron'], category: 'athlete', profile: { intensity: 0.9, tone: 0.4, buzz: 0.5 } },
  { id: 'lionel_messi', display_name: 'Lionel Messi', aliases: ['Messi'], category: 'athlete', profile: { intensity: 0.85, tone: 0.6, buzz: 0.55 } },
  // Creators (~18%)
  { id: 'mrbeast', display_name: 'MrBeast', aliases: ['Jimmy Donaldson'], category: 'creator', profile: { intensity: 0.8, tone: 0.35, buzz: 0.7 } },
  { id: 'kai_cenat', display_name: 'Kai Cenat', aliases: [], category: 'creator', profile: { intensity: 0.7, tone: 0.4, buzz: 0.8 } },
  { id: 'emma_chamberlain', display_name: 'Emma Chamberlain', aliases: [], category: 'creator', profile: { intensity: 0.45, tone: 0.4, buzz: 0.4 } },
  // Tech / business (~12%)
  { id: 'elon_musk', display_name: 'Elon Musk', aliases: ['Musk'], category: 'tech', profile: { intensity: 0.97, tone: -0.1, buzz: 0.8 } },
  { id: 'sam_altman', display_name: 'Sam Altman', aliases: [], category: 'tech', profile: { intensity: 0.75, tone: 0.2, buzz: 0.7 } },
  { id: 'jensen_huang', display_name: 'Jensen Huang', aliases: [], category: 'tech', profile: { intensity: 0.6, tone: 0.45, buzz: 0.6 } },
  // Actors / entertainment (~12%)
  { id: 'zendaya', display_name: 'Zendaya', aliases: [], category: 'actor', profile: { intensity: 0.6, tone: 0.5, buzz: 0.55 } },
  { id: 'timothee_chalamet', display_name: 'Timothée Chalamet', aliases: ['Chalamet'], category: 'actor', profile: { intensity: 0.55, tone: 0.45, buzz: 0.5 } },
  { id: 'pedro_pascal', display_name: 'Pedro Pascal', aliases: [], category: 'actor', profile: { intensity: 0.6, tone: 0.5, buzz: 0.6 } },
  // Politics / world (~8%) — handle sentiment carefully, keep neutral
  { id: 'world_leader_a', display_name: 'Ana Beltrán', aliases: [], category: 'politics', profile: { intensity: 0.7, tone: -0.05, buzz: 0.4 } },
  { id: 'world_leader_b', display_name: 'David Okonkwo', aliases: [], category: 'politics', profile: { intensity: 0.5, tone: 0.1, buzz: 0.3 } },
  // Science / culture (~6%)
  { id: 'dr_kim', display_name: 'Dr. Lena Kim', aliases: [], category: 'science', profile: { intensity: 0.35, tone: 0.6, buzz: 0.5 } },
  { id: 'neil_degrasse', display_name: 'Neil deGrasse Tyson', aliases: [], category: 'science', profile: { intensity: 0.4, tone: 0.35, buzz: 0.3 } },
  { id: 'quiet_figure', display_name: 'Marcus Webb', aliases: [], category: 'science', profile: { intensity: 0.2, tone: 0.1, buzz: 0.1 } },
];

// Neutral, non-accusatory headline templates by category. We describe public activity,
// we do NOT assert wrongdoing or causes (defamation shield).
const HEADLINE_TEMPLATES = {
  music: ['{name} announces new release', '{name} tops streaming charts this week', '{name} adds tour dates'],
  athlete: ['{name} leads team in latest matchup', '{name} named in weekly highlights', '{name} discusses season ahead'],
  creator: ['{name} posts most-watched upload of the month', '{name} launches new series', '{name} crosses subscriber milestone'],
  tech: ['{name} outlines company roadmap', '{name} speaks at industry event', '{name} comments on product launch'],
  actor: ['{name} cast in upcoming film', '{name} appears at premiere', '{name} featured in new trailer'],
  politics: ['{name} makes public statement', '{name} attends policy summit', '{name} addresses constituents'],
  science: ['{name} publishes new findings', '{name} featured in science feature', '{name} gives public lecture'],
};

// Tiny seeded PRNG so the same roster produces the same articles each run (stable scores).
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Synthesize pre-scored articles for one figure for a given day-offset.
 * dayOffset 0 = today, 1 = yesterday, ... lets us build a sparkline history.
 */
export function mockArticles(fig, now, dayOffset = 0, seedSalt = 0) {
  const rnd = mulberry32(
    (Number.parseInt(fig.id.replace(/\W/g, '').slice(0, 6), 36) || 7) + dayOffset * 101 + seedSalt
  );
  const p = fig.profile;
  // article count scales with intensity + buzz; buzz fades on older days
  const buzzDay = p.buzz * Math.max(0, 1 - dayOffset * 0.18);
  const count = Math.max(1, Math.round(1 + (p.intensity * 5 + buzzDay * 4) * (0.7 + rnd() * 0.6)));
  const templates = HEADLINE_TEMPLATES[fig.category] || HEADLINE_TEMPLATES.science;
  const articles = [];
  const driving = [];
  for (let i = 0; i < count; i++) {
    const src = SOURCES[Math.floor(rnd() * SOURCES.length)];
    const hrsAgo = dayOffset * 24 + rnd() * 24;
    const sentiment = Math.max(-1, Math.min(1, p.tone + (rnd() - 0.5) * 0.5));
    const salience = 0.5 + rnd() * 0.5;
    const magnitude = 0.3 + (buzzDay * 0.5) + rnd() * 0.3;
    const title = templates[Math.floor(rnd() * templates.length)].replace('{name}', fig.display_name);
    const publishedMs = now - hrsAgo * 3_600_000;
    articles.push({
      published_at: publishedMs,
      sentiment, salience, magnitude: Math.min(1, magnitude),
      source_authority: src.authority,
    });
    if (dayOffset === 0 && driving.length < 3) {
      driving.push({
        title,
        source: src.name,
        url: `https://news.example.com/${slug(src.name)}/${slug(fig.display_name)}-${i}`,
        published_at: new Date(publishedMs).toISOString(),
        sentiment: Math.round(sentiment * 100) / 100,
      });
    }
  }
  // sort driving by recency for display
  driving.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return { articles, driving };
}

/**
 * Build N days of CMS history for the whole roster (most recent last).
 * Returns { history: [{as_of, perFigure}], driving: {figure_id -> [headlines]} }.
 */
export function buildIndexHistory(days = 7, nowMs = Date.now()) {
  const history = [];
  const drivingByFigure = {};
  let prevDisplay = {};
  // iterate oldest -> newest so EMA smoothing carries forward like production
  for (let d = days - 1; d >= 0; d--) {
    const asOfMs = nowMs - d * 86_400_000;
    const articlesByFigure = {};
    for (const fig of ROSTER) {
      const { articles, driving } = mockArticles(fig, asOfMs, 0, d);
      articlesByFigure[fig.id] = articles;
      if (d === 0) drivingByFigure[fig.id] = driving;
    }
    const cycle = runCycle(articlesByFigure, prevDisplay, asOfMs);
    prevDisplay = Object.fromEntries(Object.entries(cycle).map(([fid, v]) => [fid, v.cms]));
    history.push({ as_of: new Date(asOfMs).toISOString(), perFigure: cycle });
  }
  return { history, drivingByFigure };
}

export const ROSTER_BY_ID = Object.fromEntries(ROSTER.map((f) => [f.id, f]));
