-- CLOUT on KytePush/Supabase — schema. All tables namespaced clout_* to share the project
-- safely with other apps (affiliate_clicks, itineraries, stories, votes are untouched).
-- The §4 invariants from the original spec are preserved as constraints; transactional
-- logic lives in clout_* functions (see 02_functions.sql) so the serverless app stays thin.

create extension if not exists pgcrypto;

create table if not exists clout_figures (
  figure_id    text primary key,
  display_name text not null,
  aliases      jsonb not null default '[]',
  category     text not null,
  status       text not null default 'active' check (status in ('active','excluded')),
  policy_flags jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

create table if not exists clout_cms_snapshots (
  snapshot_id   bigserial primary key,
  figure_id     text not null references clout_figures(figure_id),
  as_of         date not null,
  cms           int not null check (cms between 0 and 1000),
  raw_signal    numeric not null,
  sentiment_avg numeric not null,
  volume        int not null,
  rank          int not null,
  driving       jsonb not null default '[]',
  unique (figure_id, as_of)
);

create table if not exists clout_card_types (
  card_type_id  uuid primary key default gen_random_uuid(),
  figure_id     text not null references clout_figures(figure_id),
  tier          text not null check (tier in ('genesis','founders','standard','open')),
  design_seed   text not null,
  serial_start  int not null,
  max_supply    int,
  print_run     int,
  reserve_count int not null default 0,
  minted_count  int not null default 0,
  last_value    bigint not null default 0,   -- last-known Value-Guide point (informational)
  popularity    int not null default 0,
  debut_date    date,
  created_at    timestamptz not null default now(),
  check (max_supply is null or minted_count <= max_supply),
  unique (figure_id, tier)
);

create table if not exists clout_users (
  user_id     uuid primary key default gen_random_uuid(),
  handle      text not null unique,
  email       text,
  pw_hash     text,                          -- bcrypt via pgcrypto crypt(); null for demo-only
  is_demo     boolean not null default false,
  age_verified boolean not null default true,
  welcome_claimed boolean not null default false,
  referred_by text,
  created_at  timestamptz not null default now()
);

create table if not exists clout_cards (
  card_id       uuid primary key default gen_random_uuid(),
  card_type_id  uuid not null references clout_card_types(card_type_id),
  serial_number int not null,
  owner_id      uuid not null references clout_users(user_id),
  minted_to     uuid not null references clout_users(user_id),
  minted_at     timestamptz not null default now(),
  foil_state    text not null default 'base' check (foil_state in ('base','foil','animated')),
  unique (card_type_id, serial_number)
);

-- append-only ledger. NO cash-out reason exists. balance = last balance_after.
create table if not exists clout_coin_ledger (
  entry_id      bigserial primary key,
  user_id       uuid not null references clout_users(user_id),
  delta         bigint not null,
  balance_after bigint not null check (balance_after >= 0),
  reason        text not null check (reason in
                  ('purchase','pack_open','card_buy','hold_yield','reward','gift_send','gift_recv')),
  ref_id        text,
  created_at    timestamptz not null default now()
);

-- transfers move cards only — DELIBERATELY no price/amount/currency/payment columns.
create table if not exists clout_transfers (
  transfer_id  uuid primary key default gen_random_uuid(),
  from_user    uuid not null references clout_users(user_id),
  to_user      uuid not null references clout_users(user_id),
  card_ids_out jsonb not null default '[]',
  card_ids_in  jsonb not null default '[]',
  status       text not null default 'proposed' check (status in ('proposed','accepted','completed','cancelled')),
  created_at   timestamptz not null default now()
);

create table if not exists clout_chat_messages (
  msg_id     bigserial primary key,
  room       text not null,
  user_id    uuid not null references clout_users(user_id),
  handle     text not null,
  body       text not null,
  created_at timestamptz not null default now()
);

create table if not exists clout_value_history (
  id           bigserial primary key,
  card_type_id uuid not null references clout_card_types(card_type_id),
  as_of        timestamptz not null default now(),
  value        bigint not null
);

create table if not exists clout_sessions (
  token      text primary key,
  user_id    uuid not null references clout_users(user_id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists clout_idx_cards_owner on clout_cards(owner_id);
create index if not exists clout_idx_ledger_user on clout_coin_ledger(user_id, entry_id);
create index if not exists clout_idx_snap on clout_cms_snapshots(figure_id, as_of);
create index if not exists clout_idx_chat on clout_chat_messages(room, msg_id);

-- enforce append-only ledger at the DB level
create or replace rule clout_ledger_no_update as on update to clout_coin_ledger do instead nothing;
create or replace rule clout_ledger_no_delete as on delete to clout_coin_ledger do instead nothing;
