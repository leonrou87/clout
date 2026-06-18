-- CLOUT — business logic as Postgres functions. The Next API routes are thin wrappers that
-- call these via supabase-js .rpc() with the service_role key (server-side only). Keeping the
-- logic in SQL gives real transactional atomicity (functions run in one tx) on serverless.

-- ============================ value / popularity ============================
create or replace function clout_value_point(p_ct uuid) returns bigint as $$
declare r record; v_cms numeric; base numeric; holders int; buys int; scarcity numeric; cmsmult numeric; demand numeric;
begin
  select * into r from clout_card_types where card_type_id=p_ct;
  if not found then return 0; end if;
  v_cms := coalesce((select cms from clout_cms_snapshots where figure_id=r.figure_id order by as_of desc limit 1),0);
  base := case r.tier when 'genesis' then 50000 when 'founders' then 6000 when 'standard' then 450 else 35 end;
  holders := (select count(distinct owner_id) from clout_cards where card_type_id=p_ct);
  buys := (select count(*) from clout_coin_ledger where reason='card_buy' and ref_id=p_ct::text);
  scarcity := 0.6 + greatest(0, 1 - coalesce(r.minted_count::numeric/nullif(r.print_run,0),0))*0.9;
  cmsmult := 0.5 + v_cms/500.0;
  demand := 1 + 0.16*ln(1+holders) + 0.12*ln(1+buys) + 0.10*ln(1+r.minted_count);
  return greatest(1, round(base*cmsmult*scarcity*demand));
end; $$ language plpgsql;

create or replace function clout_popularity_score(p_ct uuid) returns int as $$
declare r record; v_cms numeric; holders int; buys int;
begin
  select * into r from clout_card_types where card_type_id=p_ct;
  if not found then return 0; end if;
  v_cms := coalesce((select cms from clout_cms_snapshots where figure_id=r.figure_id order by as_of desc limit 1),0);
  holders := (select count(distinct owner_id) from clout_cards where card_type_id=p_ct);
  buys := (select count(*) from clout_coin_ledger where reason='card_buy' and ref_id=p_ct::text);
  return round(3*holders + 4*buys + 0.2*r.minted_count + 0.05*v_cms);
end; $$ language plpgsql;

create or replace function clout_recompute_value(p_ct uuid) returns void as $$
declare pt bigint;
begin
  pt := clout_value_point(p_ct);
  update clout_card_types set last_value=pt, popularity=clout_popularity_score(p_ct) where card_type_id=p_ct;
  insert into clout_value_history(card_type_id,value) values (p_ct,pt);
end; $$ language plpgsql;

-- ============================ coins / mint ============================
create or replace function clout_balance(p_user uuid) returns bigint as $$
  select coalesce((select balance_after from clout_coin_ledger where user_id=p_user order by entry_id desc limit 1),0);
$$ language sql stable;

create or replace function clout_post_ledger(p_user uuid, p_delta bigint, p_reason text, p_ref text) returns bigint as $$
declare prev bigint; nxt bigint;
begin
  perform pg_advisory_xact_lock(hashtext('clout_ledger_'||p_user::text));
  prev := clout_balance(p_user);
  nxt := prev + p_delta;
  if nxt < 0 then raise exception 'INSUFFICIENT_COINS'; end if;
  insert into clout_coin_ledger(user_id,delta,balance_after,reason,ref_id) values (p_user,p_delta,nxt,p_reason,p_ref);
  return nxt;
end; $$ language plpgsql;

create or replace function clout_mint(p_ct uuid, p_owner uuid) returns clout_cards as $$
declare r record; s int; card clout_cards;
begin
  perform pg_advisory_xact_lock(hashtext('clout_mint_'||p_ct::text));
  select * into r from clout_card_types where card_type_id=p_ct;
  if r.max_supply is not null and r.minted_count >= r.max_supply then raise exception 'SOLD_OUT'; end if;
  s := r.serial_start + r.minted_count;
  insert into clout_cards(card_type_id,serial_number,owner_id,minted_to) values (p_ct,s,p_owner,p_owner) returning * into card;
  update clout_card_types set minted_count=minted_count+1 where card_type_id=p_ct;
  return card;
end; $$ language plpgsql;

-- ============================ sessions / auth ============================
create or replace function clout_create_session(p_user uuid) returns text as $$
declare t text;
begin
  t := encode(gen_random_bytes(32),'hex');
  insert into clout_sessions(token,user_id,expires_at) values (t,p_user,now()+interval '30 days');
  return t;
end; $$ language plpgsql;

create or replace function clout_resolve_session(p_token text) returns uuid as $$
  select user_id from clout_sessions where token=p_token and expires_at>now();
$$ language sql stable;

create or replace function clout_grant_welcome(p_user uuid) returns jsonb as $$
declare claimed boolean; i int; rnd numeric; v_tier text; ct record; card clout_cards; pulled jsonb := '[]'::jsonb;
begin
  select welcome_claimed into claimed from clout_users where user_id=p_user;
  if claimed then raise exception 'ALREADY_CLAIMED'; end if;
  perform clout_post_ledger(p_user,1500,'reward','welcome_coins');
  for i in 1..3 loop
    rnd := random();
    v_tier := case when rnd < 0.03 then 'founders' when rnd < 0.30 then 'standard' else 'open' end;
    select c.card_type_id, c.figure_id, c.tier into ct from clout_card_types c join clout_figures f on f.figure_id=c.figure_id
      where c.tier=v_tier and f.status='active' and c.reserve_count>0 order by random() limit 1;
    if not found then
      select c.card_type_id, c.figure_id, c.tier into ct from clout_card_types c join clout_figures f on f.figure_id=c.figure_id
        where c.tier='open' and f.status='active' and c.reserve_count>0 order by random() limit 1;
    end if;
    if found then
      card := clout_mint(ct.card_type_id, p_user);
      update clout_card_types set reserve_count=reserve_count-1 where card_type_id=ct.card_type_id;
      perform clout_recompute_value(ct.card_type_id);
      pulled := pulled || jsonb_build_object('card_id',card.card_id,'figure_id',ct.figure_id,'tier',ct.tier,'serial',card.serial_number);
    end if;
  end loop;
  update clout_users set welcome_claimed=true where user_id=p_user;
  return jsonb_build_object('pulled',pulled,'coins',1500);
end; $$ language plpgsql;

create or replace function clout_signup(p_handle text, p_password text, p_ref text) returns jsonb as $$
declare h text; uid uuid; inv record; tok text; welcome jsonb; refbonus int := 0;
begin
  h := left(lower(regexp_replace(coalesce(p_handle,''),'[^a-z0-9_]','','g')),20);
  if length(h) < 2 then raise exception 'BAD_HANDLE'; end if;
  if exists(select 1 from clout_users where handle=h) then raise exception 'HANDLE_TAKEN'; end if;
  select user_id, handle into inv from clout_users where handle=lower(coalesce(p_ref,'')) limit 1;
  insert into clout_users(handle,pw_hash,referred_by) values (h, crypt(p_password,gen_salt('bf')), inv.handle) returning user_id into uid;
  welcome := clout_grant_welcome(uid);
  if inv.user_id is not null then
    perform clout_post_ledger(uid,500,'reward','referral_invitee');
    perform clout_post_ledger(inv.user_id,500,'reward','referral_inviter');
    refbonus := 500;
  end if;
  tok := clout_create_session(uid);
  return jsonb_build_object('token',tok,'handle',h,'welcome',welcome,'referral_bonus',refbonus);
end; $$ language plpgsql;

create or replace function clout_login(p_handle text, p_password text) returns jsonb as $$
declare u record; tok text;
begin
  select * into u from clout_users where handle=lower(coalesce(p_handle,''));
  if not found or u.pw_hash is null or u.pw_hash <> crypt(p_password,u.pw_hash) then raise exception 'BAD_CREDENTIALS'; end if;
  tok := clout_create_session(u.user_id);
  return jsonb_build_object('token',tok,'handle',u.handle);
end; $$ language plpgsql;

create or replace function clout_demo_login(p_handle text) returns jsonb as $$
declare u record; tok text;
begin
  select * into u from clout_users where handle=lower(coalesce(p_handle,'')) and is_demo=true;
  if not found then raise exception 'DEMO_NOT_FOUND'; end if;
  tok := clout_create_session(u.user_id);
  return jsonb_build_object('token',tok,'handle',u.handle);
end; $$ language plpgsql;

create or replace function clout_logout(p_token text) returns void as $$ delete from clout_sessions where token=p_token; $$ language sql;

create or replace function clout_create_demo_user(p_handle text, p_coins bigint) returns uuid as $$
declare uid uuid;
begin
  insert into clout_users(handle,pw_hash,is_demo,welcome_claimed) values (lower(p_handle),crypt('demo1234',gen_salt('bf')),true,true) returning user_id into uid;
  perform clout_post_ledger(uid,p_coins,'reward','welcome_grant');
  return uid;
end; $$ language plpgsql;

-- ============================ economy actions ============================
create or replace function clout_coins_purchase(p_user uuid, p_amount bigint) returns bigint as $$
  select clout_post_ledger(p_user, greatest(0,least(100000,p_amount)),'purchase','sandbox');
$$ language sql;

create or replace function clout_buy_reserve(p_user uuid, p_ct uuid) returns jsonb as $$
declare r record; price bigint; card clout_cards;
begin
  select * into r from clout_card_types where card_type_id=p_ct;
  if not found then raise exception 'CARD_TYPE_NOT_FOUND'; end if;
  if r.reserve_count <= 0 then raise exception 'RESERVE_EMPTY'; end if;
  price := clout_value_point(p_ct);
  perform clout_post_ledger(p_user,-price,'card_buy',p_ct::text);
  card := clout_mint(p_ct,p_user);
  update clout_card_types set reserve_count=reserve_count-1 where card_type_id=p_ct;
  perform clout_recompute_value(p_ct);
  return jsonb_build_object('serial',card.serial_number,'price',price,'value',(select last_value from clout_card_types where card_type_id=p_ct),'balance',clout_balance(p_user));
end; $$ language plpgsql;

create or replace function clout_debut_claim(p_user uuid, p_figure text, p_tier text) returns jsonb as $$
declare r record; price bigint; card clout_cards;
begin
  if p_tier not in ('founders','standard') then raise exception 'TIER_NOT_FOR_SALE'; end if;
  select * into r from clout_card_types where figure_id=p_figure and tier=p_tier;
  if not found then raise exception 'CARD_TYPE_NOT_FOUND'; end if;
  if r.debut_date is null or r.debut_date > current_date then raise exception 'DEBUT_NOT_LIVE_YET'; end if;
  price := case p_tier when 'founders' then 1500 else 400 end;
  perform clout_post_ledger(p_user,-price,'card_buy',r.card_type_id::text);
  card := clout_mint(r.card_type_id,p_user);
  perform clout_recompute_value(r.card_type_id);
  return jsonb_build_object('serial',card.serial_number,'price',price,'founding',(p_tier='founders'),'balance',clout_balance(p_user));
end; $$ language plpgsql;

create or replace function clout_claim_yield(p_user uuid) returns jsonb as $$
declare total bigint := 0; rec record;
begin
  for rec in select ct.figure_id from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=p_user loop
    total := total + greatest(1, round(coalesce((select cms from clout_cms_snapshots where figure_id=rec.figure_id order by as_of desc limit 1),0)/100.0));
  end loop;
  if total<=0 then return jsonb_build_object('credited',0,'balance',clout_balance(p_user)); end if;
  perform clout_post_ledger(p_user,total,'hold_yield',null);
  return jsonb_build_object('credited',total,'balance',clout_balance(p_user));
end; $$ language plpgsql;

create or replace function clout_propose_transfer(p_from uuid, p_to_handle text, p_out jsonb, p_in jsonb) returns jsonb as $$
declare to_u uuid; cid text; tid uuid;
begin
  select user_id into to_u from clout_users where handle=lower(coalesce(p_to_handle,''));
  if to_u is null then raise exception 'RECIPIENT_NOT_FOUND'; end if;
  for cid in select jsonb_array_elements_text(coalesce(p_out,'[]')) loop
    if not exists(select 1 from clout_cards where card_id=cid::uuid and owner_id=p_from) then raise exception 'NOT_OWNER_OF_OUT_CARD'; end if;
  end loop;
  for cid in select jsonb_array_elements_text(coalesce(p_in,'[]')) loop
    if not exists(select 1 from clout_cards where card_id=cid::uuid and owner_id=to_u) then raise exception 'NOT_OWNER_OF_IN_CARD'; end if;
  end loop;
  insert into clout_transfers(from_user,to_user,card_ids_out,card_ids_in) values (p_from,to_u,coalesce(p_out,'[]'),coalesce(p_in,'[]')) returning transfer_id into tid;
  return jsonb_build_object('transferId',tid,'status','proposed');
end; $$ language plpgsql;

create or replace function clout_accept_transfer(p_transfer uuid, p_accepter uuid) returns jsonb as $$
declare t record; cid text;
begin
  select * into t from clout_transfers where transfer_id=p_transfer;
  if not found then raise exception 'TRANSFER_NOT_FOUND'; end if;
  if t.status<>'proposed' then raise exception 'TRANSFER_NOT_OPEN'; end if;
  if t.to_user<>p_accepter then raise exception 'NOT_RECIPIENT'; end if;
  for cid in select jsonb_array_elements_text(t.card_ids_out) loop
    update clout_cards set owner_id=t.to_user where card_id=cid::uuid and owner_id=t.from_user;
  end loop;
  for cid in select jsonb_array_elements_text(t.card_ids_in) loop
    update clout_cards set owner_id=t.from_user where card_id=cid::uuid and owner_id=t.to_user;
  end loop;
  update clout_transfers set status='completed' where transfer_id=p_transfer;
  return jsonb_build_object('transferId',p_transfer,'status','completed');
end; $$ language plpgsql;

create or replace function clout_chat_post(p_user uuid, p_room text, p_body text) returns void as $$
declare h text; fig text;
begin
  select handle into h from clout_users where user_id=p_user;
  if p_room like 'figure:%' then
    fig := substr(p_room,8);
    if not exists(select 1 from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=p_user and ct.figure_id=fig) then raise exception 'HOLD_A_CARD_TO_CHAT'; end if;
  end if;
  insert into clout_chat_messages(room,user_id,handle,body) values (p_room,p_user,h,left(p_body,400));
end; $$ language plpgsql;

create or replace function clout_admin_remove(p_figure text) returns void as $$ update clout_figures set status='excluded' where figure_id=p_figure; $$ language sql;

-- ============================ JSON reads ============================
create or replace function clout_me(p_user uuid) returns jsonb as $$
  select jsonb_build_object('handle',(select handle from clout_users where user_id=p_user),'balance',clout_balance(p_user),'coin','◈');
$$ language sql stable;

create or replace function clout_index_500() returns jsonb as $$
  select jsonb_build_object(
    'as_of',(select max(as_of) from clout_cms_snapshots),
    'count',(select count(*) from clout_figures where status='active'),
    'figures', coalesce((select jsonb_agg(to_jsonb(x) order by x.rank) from (
       select f.figure_id, f.display_name, f.category, s.cms, s.rank, s.sentiment_avg, s.volume,
         coalesce((select jsonb_agg(cms order by as_of) from clout_cms_snapshots sp where sp.figure_id=f.figure_id),'[]') as sparkline
       from clout_figures f
       join lateral (select cms,rank,sentiment_avg,volume from clout_cms_snapshots s where s.figure_id=f.figure_id order by as_of desc limit 1) s on true
       where f.status='active'
    ) x),'[]'::jsonb));
$$ language sql stable;

create or replace function clout_figure(p_id text) returns jsonb as $$
declare f record; s record; spark jsonb; cts jsonb;
begin
  select * into f from clout_figures where figure_id=p_id and status='active';
  if not found then return null; end if;
  select * into s from clout_cms_snapshots where figure_id=p_id order by as_of desc limit 1;
  spark := coalesce((select jsonb_agg(cms order by as_of) from clout_cms_snapshots where figure_id=p_id),'[]');
  cts := coalesce((select jsonb_agg(to_jsonb(t) order by t.serial_start) from (
     select c.card_type_id, c.tier, c.serial_start,
       case c.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end as rarity,
       c.print_run, c.minted_count as minted, c.reserve_count as reserve,
       c.last_value as value, round(c.last_value*0.85) as value_lo, round(c.last_value*1.18) as value_hi, c.popularity,
       (select count(distinct owner_id) from clout_cards cc where cc.card_type_id=c.card_type_id) as holders
     from clout_card_types c where c.figure_id=p_id) t),'[]');
  return jsonb_build_object('figure_id',f.figure_id,'display_name',f.display_name,'aliases',f.aliases,'category',f.category,
    'cms',s.cms,'rank',s.rank,'sentiment_avg',s.sentiment_avg,'volume',s.volume,'sparkline',spark,'driving',coalesce(s.driving,'[]'),
    'disclaimer','CLOUT''s read on public momentum, sourced from public headlines. Informational signal — not a factual claim about this person.',
    'card_types',cts);
end; $$ language plpgsql stable;

create or replace function clout_cards_top(p_by text) returns jsonb as $$
  select jsonb_build_object('by',p_by,'cards', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select c.figure_id, f.display_name, f.category, c.tier,
      case c.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end as rarity,
      c.last_value as value, c.popularity, c.minted_count as minted, c.print_run,
      (select count(distinct owner_id) from clout_cards cc where cc.card_type_id=c.card_type_id) as holders,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=c.figure_id order by as_of desc limit 1),0) as cms
    from clout_card_types c join clout_figures f on f.figure_id=c.figure_id
    where f.status='active' and c.tier<>'open'
    order by (case when p_by='value' then c.last_value else c.popularity end) desc limit 40) x),'[]'));
$$ language sql stable;

create or replace function clout_collection(p_user uuid) returns jsonb as $$
declare cards jsonb; val numeric := 0; rec record;
begin
  cards := coalesce((select jsonb_agg(to_jsonb(x)) from (
    select c.card_id, c.serial_number, c.foil_state, ct.card_type_id, ct.tier, ct.figure_id, ct.print_run, ct.minted_count, ct.reserve_count,
      f.display_name, f.category,
      case ct.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end as rarity,
      ct.last_value as value, round(ct.last_value*0.85) as value_lo, round(ct.last_value*1.18) as value_hi, ct.popularity,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0) as cms,
      (ct.tier='founders' and c.minted_to=p_user) as founding
    from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id join clout_figures f on f.figure_id=ct.figure_id
    where c.owner_id=p_user order by ct.tier, c.serial_number) x),'[]');
  for rec in select c.serial_number, ct.tier, ct.figure_id from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=p_user loop
    val := val + (case rec.tier when 'genesis' then 1000 when 'founders' then 300 when 'standard' then 60 else 5 end)
      + greatest(0, case when rec.serial_number>0 then 120-rec.serial_number else 200 end)
      + coalesce((select cms from clout_cms_snapshots s where s.figure_id=rec.figure_id order by as_of desc limit 1),0)/20.0;
  end loop;
  return jsonb_build_object('handle',(select handle from clout_users where user_id=p_user),'value',round(val),'cards',cards);
end; $$ language plpgsql stable;

create or replace function clout_debut_today() returns jsonb as $$
declare fig text; f record; s record; fo record; st record; wall jsonb; spark jsonb;
begin
  select figure_id into fig from clout_card_types where debut_date=current_date and tier='founders' limit 1;
  if fig is null then select figure_id into fig from clout_card_types where debut_date is not null and tier='founders' order by debut_date desc limit 1; end if;
  if fig is null then return jsonb_build_object('figure',null); end if;
  select * into f from clout_figures where figure_id=fig;
  select * into s from clout_cms_snapshots where figure_id=fig order by as_of desc limit 1;
  select * into fo from clout_card_types where figure_id=fig and tier='founders';
  select * into st from clout_card_types where figure_id=fig and tier='standard';
  spark := coalesce((select jsonb_agg(cms order by as_of) from clout_cms_snapshots where figure_id=fig),'[]');
  wall := coalesce((select jsonb_agg(to_jsonb(w) order by w.serial) from (
     select c.serial_number as serial, u.handle from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id join clout_users u on u.user_id=c.owner_id
     where ct.figure_id=fig and ct.tier='founders' order by c.serial_number asc limit 10) w),'[]');
  return jsonb_build_object(
    'figure',jsonb_build_object('figure_id',f.figure_id,'display_name',f.display_name,'category',f.category,'cms',s.cms,'rank',s.rank,'sparkline',spark),
    'founders',jsonb_build_object('claimed',fo.minted_count,'total',fo.max_supply,'next_serial',fo.minted_count+1),
    'standard',jsonb_build_object('claimed',st.minted_count,'total',st.max_supply),
    'prices',jsonb_build_object('founders',1500,'standard',400),
    'founding_wall',wall,
    'next_debut_in_seconds',greatest(0,extract(epoch from ((current_date+1)::timestamptz - now()))::int),
    'date',current_date);
end; $$ language plpgsql stable;

create or replace function clout_debut_schedule() returns jsonb as $$
  select jsonb_build_object('today',current_date,'schedule', coalesce((select jsonb_agg(to_jsonb(x) order by x.debut_date) from (
     select c.figure_id, c.debut_date, f.display_name, f.category, c.minted_count as claimed, c.max_supply as total,
       (c.debut_date=current_date) as is_today,
       coalesce((select cms from clout_cms_snapshots s where s.figure_id=c.figure_id order by as_of desc limit 1),0) as cms
     from clout_card_types c join clout_figures f on f.figure_id=c.figure_id
     where c.debut_date is not null and c.tier='founders') x),'[]'));
$$ language sql stable;

create or replace function clout_leaderboard(p_kind text) returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.value desc),'[]') from (
    select u.handle,
      (select count(*) from clout_cards c where c.owner_id=u.user_id) as cards,
      coalesce((select round(sum(
         (case ct.tier when 'genesis' then 1000 when 'founders' then 300 when 'standard' then 60 else 5 end)
         + greatest(0, case when c.serial_number>0 then 120-c.serial_number else 200 end)))
       from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=u.user_id),0) as value
    from clout_users u) x;
$$ language sql stable;

create or replace function clout_chat(p_room text, p_user uuid) returns jsonb as $$
declare msgs jsonb; canpost boolean := true; holds boolean := true; fig text;
begin
  msgs := coalesce((select jsonb_agg(to_jsonb(m) order by m.msg_id) from (
     select msg_id, handle, body, created_at from clout_chat_messages where room=p_room order by msg_id desc limit 100) m),'[]');
  if p_room like 'figure:%' then
    fig := substr(p_room,8);
    holds := (p_user is not null and exists(select 1 from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=p_user and ct.figure_id=fig));
    canpost := holds;
  else
    canpost := (p_user is not null);
  end if;
  return jsonb_build_object('room',p_room,'messages',msgs,'can_post',canpost,'holds',holds);
end; $$ language plpgsql stable;
