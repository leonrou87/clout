-- A collector's cards (for the trade picker — you can see someone's collection to propose a swap).
create or replace function clout_user_cards(p_handle text) returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
    select c.card_id, c.serial_number as serial, c.locked, ct.tier, ct.figure_id, f.display_name,
      case ct.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end as rarity
    from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id
    join clout_figures f on f.figure_id=ct.figure_id
    join clout_users u on u.user_id=c.owner_id
    where u.handle=lower(p_handle) and not u.deleted
    order by ct.tier, c.serial_number limit 60
  ) x;
$$ language sql stable;
