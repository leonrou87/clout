-- CLOUT v2 — 30-feature pack. Deterministic, closed-loop, no wagering/paid-randomness.

-- ---------- schema ----------
alter table clout_figures add column if not exists is_anchor boolean not null default false;
alter table clout_figures add column if not exists hype int not null default 0;
alter table clout_cards   add column if not exists locked boolean not null default false;
alter table clout_cards   add column if not exists acquired_at timestamptz not null default now();
alter table clout_cards   add column if not exists cms_at_acquire int not null default 0;
alter table clout_users   add column if not exists login_streak int not null default 0;
alter table clout_users   add column if not exists last_checkin date;
alter table clout_users   add column if not exists clash_day date;
alter table clout_users   add column if not exists clash_wins int not null default 0;

create table if not exists clout_card_events (
  id bigserial primary key, card_id uuid references clout_cards(card_id),
  kind text not null, detail jsonb not null default '{}', at timestamptz not null default now());
create table if not exists clout_hype_log (
  user_id uuid, figure_id text, day date, primary key (user_id, figure_id, day));

-- marquee names you must EARN/BUY (never in the free welcome pack)
update clout_figures set is_anchor = figure_id in
  ('taylor_swift','lionel_messi','lebron_james','caitlin_clark','mrbeast','elon_musk','bad_bunny','zendaya','the_weeknd');
-- backfill score-at-acquire for existing cards
update clout_cards c set cms_at_acquire = coalesce(
  (select cms from clout_cms_snapshots s join clout_card_types ct on ct.card_type_id=c.card_type_id
   where s.figure_id=ct.figure_id order by s.as_of desc limit 1),0) where cms_at_acquire=0;

-- ---------- mint now records provenance + score-at-acquire ----------
create or replace function clout_mint(p_ct uuid, p_owner uuid) returns clout_cards as $$
declare r record; s int; card clout_cards; v_cms int;
begin
  perform pg_advisory_xact_lock(hashtext('clout_mint_'||p_ct::text));
  select * into r from clout_card_types where card_type_id=p_ct;
  if r.max_supply is not null and r.minted_count >= r.max_supply then raise exception 'SOLD_OUT'; end if;
  s := r.serial_start + r.minted_count;
  v_cms := coalesce((select cms from clout_cms_snapshots where figure_id=r.figure_id order by as_of desc limit 1),0);
  insert into clout_cards(card_type_id,serial_number,owner_id,minted_to,acquired_at,cms_at_acquire)
    values (p_ct,s,p_owner,p_owner,now(),v_cms) returning * into card;
  update clout_card_types set minted_count=minted_count+1 where card_type_id=p_ct;
  insert into clout_card_events(card_id,kind,detail) values (card.card_id,'minted',jsonb_build_object('serial',s));
  return card;
end; $$ language plpgsql;

-- ---------- welcome pack: commons of NON-anchor figures only ----------
create or replace function clout_grant_welcome(p_user uuid) returns jsonb as $$
declare claimed boolean; i int; rnd numeric; v_tier text; ct record; card clout_cards; pulled jsonb := '[]'::jsonb;
begin
  select welcome_claimed into claimed from clout_users where user_id=p_user;
  if claimed then raise exception 'ALREADY_CLAIMED'; end if;
  perform clout_post_ledger(p_user,1500,'reward','welcome_coins');
  for i in 1..3 loop
    rnd := random();
    v_tier := case when rnd < 0.18 then 'standard' else 'open' end;   -- no founders/anchors for free
    select c.card_type_id, c.figure_id, c.tier into ct from clout_card_types c join clout_figures f on f.figure_id=c.figure_id
      where c.tier=v_tier and f.status='active' and f.is_anchor=false and c.reserve_count>0 order by random() limit 1;
    if not found then
      select c.card_type_id, c.figure_id, c.tier into ct from clout_card_types c join clout_figures f on f.figure_id=c.figure_id
        where c.tier='open' and f.status='active' and f.is_anchor=false and c.reserve_count>0 order by random() limit 1;
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

-- ---------- transfers respect vault locks; record provenance ----------
create or replace function clout_propose_transfer(p_from uuid, p_to_handle text, p_out jsonb, p_in jsonb) returns jsonb as $$
declare to_u uuid; cid text; tid uuid;
begin
  select user_id into to_u from clout_users where handle=lower(coalesce(p_to_handle,''));
  if to_u is null then raise exception 'RECIPIENT_NOT_FOUND'; end if;
  for cid in select jsonb_array_elements_text(coalesce(p_out,'[]')) loop
    if not exists(select 1 from clout_cards where card_id=cid::uuid and owner_id=p_from) then raise exception 'NOT_OWNER_OF_OUT_CARD'; end if;
    if exists(select 1 from clout_cards where card_id=cid::uuid and locked) then raise exception 'CARD_LOCKED'; end if;
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
    update clout_cards set owner_id=t.to_user, acquired_at=now() where card_id=cid::uuid and owner_id=t.from_user;
    insert into clout_card_events(card_id,kind,detail) values (cid::uuid,'traded',jsonb_build_object('to',t.to_user));
  end loop;
  for cid in select jsonb_array_elements_text(t.card_ids_in) loop
    update clout_cards set owner_id=t.from_user, acquired_at=now() where card_id=cid::uuid and owner_id=t.to_user;
    insert into clout_card_events(card_id,kind,detail) values (cid::uuid,'traded',jsonb_build_object('to',t.from_user));
  end loop;
  update clout_transfers set status='completed' where transfer_id=p_transfer;
  return jsonb_build_object('transferId',p_transfer,'status','completed');
end; $$ language plpgsql;

-- ---------- collection value helper + enriched collection ----------
create or replace function clout_collection_value(p_user uuid) returns numeric as $$
  select coalesce(round(sum(
    (case ct.tier when 'genesis' then 1000 when 'founders' then 300 when 'standard' then 60 else 5 end)
    + greatest(0, case when c.serial_number>0 then 120-c.serial_number else 200 end)
    + coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0)/20.0)),0)
  from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where c.owner_id=p_user;
$$ language sql stable;

create or replace function clout_collection(p_user uuid) returns jsonb as $$
  select jsonb_build_object('handle',(select handle from clout_users where user_id=p_user),
    'value',clout_collection_value(p_user),
    'cards', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.card_id, c.serial_number, c.foil_state, c.locked, ct.card_type_id, ct.tier, ct.figure_id, ct.print_run, ct.minted_count,
        (ct.print_run - ct.minted_count) as left_forever,
        f.display_name, f.category,
        case ct.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end as rarity,
        ct.last_value as value, round(ct.last_value*0.85) as value_lo, round(ct.last_value*1.18) as value_hi, ct.popularity,
        coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0) as cms,
        (coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0) - c.cms_at_acquire) as momentum_since,
        floor(extract(epoch from now()-c.acquired_at)/86400)::int as held_days,
        (c.serial_number = (select min(serial_number) from clout_cards cc where cc.card_type_id=ct.card_type_id)) as crown,
        (ct.tier='founders' and c.minted_to=p_user) as founding
      from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id join clout_figures f on f.figure_id=ct.figure_id
      where c.owner_id=p_user order by ct.tier, c.serial_number) x),'[]'));
$$ language sql stable;

-- ---------- daily check-in streak ----------
create or replace function clout_daily_checkin(p_user uuid) returns jsonb as $$
declare last date; cur int; reward int;
begin
  select last_checkin, login_streak into last, cur from clout_users where user_id=p_user;
  if last = current_date then return jsonb_build_object('already',true,'streak',cur,'credited',0,'balance',clout_balance(p_user)); end if;
  if last = current_date - 1 then cur := cur + 1; else cur := 1; end if;
  reward := least(50, 5 + cur*5);
  update clout_users set login_streak=cur, last_checkin=current_date where user_id=p_user;
  perform clout_post_ledger(p_user, reward, 'reward', 'daily_checkin');
  return jsonb_build_object('already',false,'streak',cur,'credited',reward,'balance',clout_balance(p_user));
end; $$ language plpgsql;

-- ---------- vault lock ----------
create or replace function clout_toggle_lock(p_user uuid, p_card uuid) returns jsonb as $$
declare st boolean;
begin
  update clout_cards set locked = not locked where card_id=p_card and owner_id=p_user returning locked into st;
  if not found then raise exception 'NOT_YOUR_CARD'; end if;
  return jsonb_build_object('locked',st);
end; $$ language plpgsql;

-- ---------- provenance ----------
create or replace function clout_card_provenance(p_card uuid) returns jsonb as $$
  select jsonb_build_object(
    'held_days', (select floor(extract(epoch from now()-acquired_at)/86400)::int from clout_cards where card_id=p_card),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind',kind,'detail',detail,'at',at) order by id) from clout_card_events where card_id=p_card),'[]'));
$$ language sql stable;

-- ---------- portfolio (value, net-worth rank, movers) ----------
create or replace function clout_portfolio(p_user uuid) returns jsonb as $$
declare val numeric; rnk int; movers jsonb;
begin
  val := clout_collection_value(p_user);
  rnk := 1 + (select count(*) from clout_users u where clout_collection_value(u.user_id) > val);
  movers := coalesce((select jsonb_agg(to_jsonb(m)) from (
    select f.display_name, ct.tier, ct.last_value as value,
      (ct.last_value - coalesce((select value from clout_value_history vh where vh.card_type_id=ct.card_type_id order by id desc offset 1 limit 1), ct.last_value)) as delta
    from (select distinct card_type_id from clout_cards where owner_id=p_user) oc
    join clout_card_types ct on ct.card_type_id=oc.card_type_id
    join clout_figures f on f.figure_id=ct.figure_id
    order by abs(ct.last_value - coalesce((select value from clout_value_history vh where vh.card_type_id=ct.card_type_id order by id desc offset 1 limit 1), ct.last_value)) desc limit 5) m),'[]');
  return jsonb_build_object('value',round(val),'networth_rank',rnk,'collectors',(select count(*) from clout_users),'balance',clout_balance(p_user),'movers',movers);
end; $$ language plpgsql;

-- ---------- Clout Clash (no stakes, no card loss — skill arcade vs the house) ----------
create or replace function clout_clash(p_user uuid, p_cards jsonb) returns jsonb as $$
declare yours uuid[]; house uuid[]; rounds jsonb := '[]'::jsonb; ywin int := 0; i int; reward int := 0;
  yc record; hc record; lbl text; yv numeric; hv numeric; winr boolean; cd date; cw int;
begin
  select array(select (jsonb_array_elements_text(p_cards))::uuid) into yours;
  if array_length(yours,1) is null or array_length(yours,1) < 3 then raise exception 'PICK_3_CARDS'; end if;
  yours := yours[1:3];
  if exists(select 1 from unnest(yours) x where not exists(select 1 from clout_cards where card_id=x and owner_id=p_user)) then raise exception 'NOT_YOUR_CARD'; end if;
  select array(select card_type_id from clout_card_types ct join clout_figures f on f.figure_id=ct.figure_id where f.status='active' order by random() limit 3) into house;
  for i in 1..3 loop
    lbl := case i when 1 then 'Momentum (CMS)' when 2 then 'Rarity power' else '7-day movement' end;
    select f.display_name name, ct.tier,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0) cms,
      ct.last_value lv,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0)
        - coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of asc limit 1),0) mov
      into yc from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id join clout_figures f on f.figure_id=ct.figure_id where c.card_id=yours[i];
    select f.display_name name, ct.tier,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0) cms,
      ct.last_value lv,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0)
        - coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of asc limit 1),0) mov
      into hc from clout_card_types ct join clout_figures f on f.figure_id=ct.figure_id where ct.card_type_id=house[i];
    if i=1 then yv:=yc.cms; hv:=hc.cms;
    elsif i=2 then yv:=(case yc.tier when 'genesis' then 4 when 'founders' then 3 when 'standard' then 2 else 1 end)*1000+yc.lv/100.0;
                 hv:=(case hc.tier when 'genesis' then 4 when 'founders' then 3 when 'standard' then 2 else 1 end)*1000+hc.lv/100.0;
    else yv:=yc.mov; hv:=hc.mov; end if;
    winr := yv >= hv;
    if winr then ywin:=ywin+1; end if;
    rounds := rounds || jsonb_build_object('stat',lbl,'you',jsonb_build_object('name',yc.name,'val',round(yv)),'house',jsonb_build_object('name',hc.name,'val',round(hv)),'win',winr);
  end loop;
  select clash_day, clash_wins into cd, cw from clout_users where user_id=p_user;
  if cd is distinct from current_date then update clout_users set clash_day=current_date, clash_wins=0 where user_id=p_user; cw:=0; end if;
  if ywin>=2 and cw<5 then reward:=40; update clout_users set clash_wins=clash_wins+1 where user_id=p_user; perform clout_post_ledger(p_user,reward,'reward','clash_win'); end if;
  return jsonb_build_object('rounds',rounds,'you_won',ywin>=2,'your_rounds',ywin,'reward',reward,'balance',clout_balance(p_user));
end; $$ language plpgsql;

-- ---------- hype + trending (social heat, separate from the news index) ----------
create or replace function clout_hype(p_figure text, p_user uuid) returns jsonb as $$
declare cnt int;
begin
  insert into clout_hype_log(user_id,figure_id,day) values (p_user,p_figure,current_date) on conflict do nothing;
  get diagnostics cnt = row_count;
  if cnt > 0 then update clout_figures set hype=hype+1 where figure_id=p_figure; end if;
  return jsonb_build_object('hype',(select hype from clout_figures where figure_id=p_figure),'counted',cnt>0);
end; $$ language plpgsql;

create or replace function clout_trending() returns jsonb as $$
  select jsonb_build_object('cards', coalesce((select jsonb_agg(to_jsonb(x)) from (
    select f.figure_id, f.display_name, f.category, f.hype,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=f.figure_id order by as_of desc limit 1),0) as cms,
      (select count(*) from clout_coin_ledger l join clout_card_types ct on ct.card_type_id::text=l.ref_id where ct.figure_id=f.figure_id and l.reason='card_buy') as buys
    from clout_figures f where f.status='active'
    order by (f.hype*3 + (select count(*) from clout_coin_ledger l join clout_card_types ct on ct.card_type_id::text=l.ref_id where ct.figure_id=f.figure_id and l.reason='card_buy')) desc
    limit 20) x),'[]'));
$$ language sql stable;

-- ---------- referrals + anchors-to-earn + category sets ----------
create or replace function clout_referrals(p_user uuid) returns jsonb as $$
  select jsonb_build_object(
    'handle',(select handle from clout_users where user_id=p_user),
    'invited',(select count(*) from clout_users where referred_by=(select handle from clout_users where user_id=p_user)),
    'bonus_earned',(select coalesce(sum(delta),0) from clout_coin_ledger where user_id=p_user and ref_id='referral_inviter'));
$$ language sql stable;

create or replace function clout_anchors(p_user uuid) returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.display_name),'[]') from (
    select f.figure_id, f.display_name, f.category,
      exists(select 1 from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where ct.figure_id=f.figure_id and c.owner_id=p_user) as owned,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=f.figure_id order by as_of desc limit 1),0) as cms
    from clout_figures f where f.is_anchor and f.status='active') x;
$$ language sql stable;

create or replace function clout_sets(p_user uuid) returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.category),'[]') from (
    select f.category, count(distinct f.figure_id) as total,
      count(distinct case when exists(select 1 from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id where ct.figure_id=f.figure_id and c.owner_id=p_user) then f.figure_id end) as owned
    from clout_figures f where f.status='active' group by f.category) x;
$$ language sql stable;

-- ---------- debut: add frenzy meter ----------
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
    'recent_claims',(select count(*) from clout_coin_ledger where reason='card_buy' and ref_id=fo.card_type_id::text and created_at > now()-interval '10 minutes'),
    'crowd',(select count(distinct user_id) from clout_coin_ledger where reason='card_buy' and ref_id=fo.card_type_id::text),
    'next_debut_in_seconds',greatest(0,extract(epoch from ((current_date+1)::timestamptz - now()))::int),
    'date',current_date);
end; $$ language plpgsql stable;
