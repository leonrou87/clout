-- Exclude deleted/anonymized accounts from the collectors count + net-worth rank.
-- (Runs after 07_account_push.sql which adds clout_users.deleted.)
create or replace function clout_portfolio(p_user uuid) returns jsonb as $$
declare val numeric; rnk int; movers jsonb;
begin
  val := clout_collection_value(p_user);
  rnk := 1 + (select count(*) from clout_users u where not u.deleted and clout_collection_value(u.user_id) > val);
  movers := coalesce((select jsonb_agg(to_jsonb(m)) from (
    select f.display_name, ct.tier, ct.last_value as value,
      (ct.last_value - coalesce((select value from clout_value_history vh where vh.card_type_id=ct.card_type_id order by id desc offset 1 limit 1), ct.last_value)) as delta
    from (select distinct card_type_id from clout_cards where owner_id=p_user) oc
    join clout_card_types ct on ct.card_type_id=oc.card_type_id
    join clout_figures f on f.figure_id=ct.figure_id
    order by abs(ct.last_value - coalesce((select value from clout_value_history vh where vh.card_type_id=ct.card_type_id order by id desc offset 1 limit 1), ct.last_value)) desc limit 5) m),'[]');
  return jsonb_build_object('value',round(val),'networth_rank',rnk,'collectors',(select count(*) from clout_users where not deleted),'balance',clout_balance(p_user),'movers',movers);
end; $$ language plpgsql;
