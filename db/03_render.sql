-- Render input helpers: return everything the SVG card renderer needs for a card / preview.
create or replace function clout_render_card(p_card uuid) returns jsonb as $$
  select jsonb_build_object(
   'display_name',f.display_name,'category',f.category,
   'cms',coalesce((select cms from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0),
   'rank',coalesce((select rank from clout_cms_snapshots s where s.figure_id=ct.figure_id order by as_of desc limit 1),0),
   'sparkline',coalesce((select jsonb_agg(cms order by as_of) from clout_cms_snapshots where figure_id=ct.figure_id),'[]'),
   'tier',ct.tier,'foil_state',c.foil_state,'serial_number',c.serial_number,'max_supply',ct.print_run,'design_seed',ct.design_seed,
   'founding',(ct.tier='founders' and c.minted_to=c.owner_id),
   'rarity',case ct.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end,
   'value',ct.last_value,'value_lo',round(ct.last_value*0.85),'value_hi',round(ct.last_value*1.18))
  from clout_cards c join clout_card_types ct on ct.card_type_id=c.card_type_id join clout_figures f on f.figure_id=ct.figure_id
  where c.card_id=p_card;
$$ language sql stable;

create or replace function clout_render_preview(p_fig text, p_tier text) returns jsonb as $$
  select jsonb_build_object(
   'display_name',f.display_name,'category',f.category,
   'cms',coalesce((select cms from clout_cms_snapshots s where s.figure_id=p_fig order by as_of desc limit 1),0),
   'rank',coalesce((select rank from clout_cms_snapshots s where s.figure_id=p_fig order by as_of desc limit 1),0),
   'sparkline',coalesce((select jsonb_agg(cms order by as_of) from clout_cms_snapshots where figure_id=p_fig),'[]'),
   'tier',ct.tier,'foil_state',case when ct.tier='genesis' then 'animated' else 'base' end,'serial_number',ct.serial_start,
   'max_supply',ct.print_run,'design_seed',ct.design_seed,'founding',(ct.tier='founders'),
   'rarity',case ct.tier when 'genesis' then '✦' when 'founders' then '★' when 'standard' then '◆' else '●' end,
   'value',ct.last_value,'value_lo',round(ct.last_value*0.85),'value_hi',round(ct.last_value*1.18))
  from clout_card_types ct join clout_figures f on f.figure_id=ct.figure_id where ct.figure_id=p_fig and ct.tier=p_tier;
$$ language sql stable;

-- incoming proposed transfers for a user
create or replace function clout_transfers_incoming(p_user uuid) returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object('transfer_id',transfer_id,'from_user',from_user,'card_ids_out',card_ids_out,'card_ids_in',card_ids_in)),'[]')
  from clout_transfers where to_user=p_user and status='proposed';
$$ language sql stable;
