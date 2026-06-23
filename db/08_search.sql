-- Figure search (name + aliases), ordered by rank.
create or replace function clout_search(p_q text) returns jsonb as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.rank), '[]'::jsonb) from (
    select f.figure_id, f.display_name, f.category,
      coalesce((select cms from clout_cms_snapshots s where s.figure_id=f.figure_id order by as_of desc limit 1),0) as cms,
      coalesce((select rank from clout_cms_snapshots s where s.figure_id=f.figure_id order by as_of desc limit 1),9999) as rank
    from clout_figures f
    where f.status='active' and (
      f.display_name ilike '%'||p_q||'%'
      or exists(select 1 from jsonb_array_elements_text(f.aliases) a where a ilike '%'||p_q||'%')
    ) order by rank limit 20
  ) x;
$$ language sql stable;
