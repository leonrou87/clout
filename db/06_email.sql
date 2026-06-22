-- Email support: store support / figure-removal requests, and let signup capture an email.

create table if not exists clout_support (
  id         bigserial primary key,
  email      text,
  topic      text not null default 'support',   -- 'support' | 'removal'
  figure     text,
  message    text not null,
  created_at timestamptz not null default now()
);

-- add optional email to signup (DROP first: signature changes)
drop function if exists clout_signup(text, text, text);
create or replace function clout_signup(p_handle text, p_password text, p_ref text, p_email text default null) returns jsonb as $$
declare h text; uid uuid; inv record; tok text; welcome jsonb; refbonus int := 0; em text;
begin
  h := left(lower(regexp_replace(coalesce(p_handle,''),'[^a-z0-9_]','','g')),20);
  if length(h) < 2 then raise exception 'BAD_HANDLE'; end if;
  if exists(select 1 from clout_users where handle=h) then raise exception 'HANDLE_TAKEN'; end if;
  em := nullif(lower(trim(coalesce(p_email,''))),'');
  select user_id, handle into inv from clout_users where handle=lower(coalesce(p_ref,'')) limit 1;
  insert into clout_users(handle,pw_hash,email,referred_by) values (h, crypt(p_password,gen_salt('bf')), em, inv.handle) returning user_id into uid;
  welcome := clout_grant_welcome(uid);
  if inv.user_id is not null then
    perform clout_post_ledger(uid,500,'reward','referral_invitee');
    perform clout_post_ledger(inv.user_id,500,'reward','referral_inviter');
    refbonus := 500;
  end if;
  tok := clout_create_session(uid);
  return jsonb_build_object('token',tok,'handle',h,'email',em,'welcome',welcome,'referral_bonus',refbonus);
end; $$ language plpgsql;
