-- Live activity feed: recent card acquisitions across all collectors.
create or replace function clout_activity() returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select u.handle, f.display_name, f.category, ct.tier, ct.figure_id,
      case ct.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end as rarity,
      c.serial_number as serial, c.minted_at as at,
      (ct.tier='founders' and c.minted_to=c.owner_id) as founding
    from clout_cards c
    join clout_card_types ct on ct.card_type_id=c.card_type_id
    join clout_figures f on f.figure_id=ct.figure_id
    join clout_users u on u.user_id=c.owner_id
    where not u.deleted
    order by c.minted_at desc limit 40
  ) x;
$$ language sql stable;
