-- Account deletion (store requirement) + push-notification token storage.

alter table clout_users add column if not exists deleted boolean not null default false;

-- Delete account: purge cards/sessions/transfers/chat/hype + PII; anonymize the user row
-- (the append-only coin_ledger keeps rows but holds no PII beyond an opaque user_id).
create or replace function clout_delete_account(p_user uuid) returns jsonb as $$
begin
  delete from clout_sessions where user_id=p_user;
  delete from clout_card_events where card_id in (select card_id from clout_cards where owner_id=p_user);
  delete from clout_cards where owner_id=p_user;
  delete from clout_transfers where from_user=p_user or to_user=p_user;
  delete from clout_chat_messages where user_id=p_user;
  delete from clout_hype_log where user_id=p_user;
  update clout_users set deleted=true, handle='deleted_'||left(replace(p_user::text,'-',''),12),
    email=null, pw_hash=null, is_demo=false, referred_by=null, welcome_claimed=true where user_id=p_user;
  return jsonb_build_object('ok', true);
end; $$ language plpgsql;

create table if not exists clout_push_tokens (
  token      text primary key,
  user_id    uuid not null references clout_users(user_id),
  platform   text not null default 'unknown',
  created_at timestamptz not null default now()
);

create or replace function clout_register_push(p_user uuid, p_token text, p_platform text) returns void as $$
  insert into clout_push_tokens(token, user_id, platform) values (p_token, p_user, coalesce(p_platform,'unknown'))
  on conflict (token) do update set user_id=excluded.user_id, platform=excluded.platform;
$$ language sql;

-- hide deleted accounts from leaderboards
create or replace function clout_leaderboard(p_kind text) returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc),'[]') from (
    select u.handle,
      (select count(*) from clout_cards c where c.owner_id=u.user_id) as cards,
      coalesce((select round(sum(
         (case ct.tier when 'genesis' then 1000 when 'founders' then 300 when 'standard' then 60 else 5 end)
         + greatest(0, case when c.serial_number>0 then 120-c.serial_number else 200 end)))
       from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=u.user_id),0) as value
    from clout_users u where not u.deleted) x;
$$ language sql stable;
