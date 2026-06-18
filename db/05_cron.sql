-- Helpers for the daily index refresh (called by the Vercel cron route).

-- recompute every card type's Value Guide (after new CMS snapshots land)
create or replace function clout_recompute_all() returns int as $$
declare r record; n int := 0;
begin
  for r in select card_type_id from clout_card_types loop
    perform clout_recompute_value(r.card_type_id); n := n + 1;
  end loop;
  return n;
end; $$ language plpgsql;

-- ensure there's a debut for today; if not, debut the highest-momentum figure that hasn't
-- debuted yet (Founders mint that day). Returns the figure id (or null if all have debuted).
create or replace function clout_roll_debut() returns text as $$
declare fig text;
begin
  if exists(select 1 from clout_card_types where tier='founders' and debut_date=current_date) then
    return (select figure_id from clout_card_types where tier='founders' and debut_date=current_date limit 1);
  end if;
  select f.figure_id into fig from clout_figures f
    join clout_card_types ct on ct.figure_id=f.figure_id and ct.tier='founders'
    where f.status='active' and ct.debut_date is null
    order by coalesce((select cms from clout_cms_snapshots s where s.figure_id=f.figure_id order by as_of desc limit 1),0) desc
    limit 1;
  if fig is null then return null; end if;
  update clout_card_types set debut_date=current_date where figure_id=fig and tier in ('genesis','founders','standard');
  return fig;
end; $$ language plpgsql;
