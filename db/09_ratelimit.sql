-- Lightweight rate limiting for abuse-prone endpoints (login brute force, signup/contact spam).
create table if not exists clout_rate_hits (id bigserial primary key, k text not null, at timestamptz not null default now());
create index if not exists clout_idx_rate on clout_rate_hits(k, at);
create or replace function clout_rate(p_key text, p_max int, p_secs int) returns boolean as $$
declare n int;
begin
  delete from clout_rate_hits where k = p_key and at < now() - (p_secs || ' seconds')::interval;
  select count(*) into n from clout_rate_hits where k = p_key and at > now() - (p_secs || ' seconds')::interval;
  if n >= p_max then return false; end if;
  insert into clout_rate_hits(k) values (p_key);
  return true;
end; $$ language plpgsql;
