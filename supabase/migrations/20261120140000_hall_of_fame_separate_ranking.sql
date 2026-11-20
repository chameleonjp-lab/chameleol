-- Hall of Fame and personal-best ranking are disjoint public lists.
-- No saved results, best records, admission orders or score values are deleted.
-- The full non-hall table supports the experiment lab's all-position pager.

create or replace function private.kamereoru_rebuild_ranking() returns bigint
language plpgsql
set search_path = ''
as $$
declare v bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('kamereoru:ranking', 0));
  insert into private.kamereoru_ranking_versions (name_count)
  select count(*)
  from private.kamereoru_bests b
  where not exists (
    select 1 from private.kamereoru_clear_ordinals o where o.name_key = b.name_key
  )
  returning version into v;

  insert into private.kamereoru_ranking_rows
    (version, position, rank, name_key, display_name, buildings, rank_avg)
  select v, row_number() over (order by x.rnk, x.name_key collate "C"),
    x.rnk, x.name_key, x.display_name, x.buildings, x.rank_avg
  from (
    select b.name_key, b.display_name, b.buildings, b.rank_avg,
      rank() over (order by b.buildings desc, b.rank_avg desc) as rnk
    from private.kamereoru_bests b
    where not exists (
      select 1 from private.kamereoru_clear_ordinals o where o.name_key = b.name_key
    )
  ) x;

  -- Keep the original pinning/retention policy for in-progress readers.
  delete from private.kamereoru_ranking_versions
  where version < v - 50 and created_at < now() - interval '15 minutes';
  return v;
end $$;

-- A first confirmed clear can remove a name from ranking without changing
-- their historical best (for example, when a weaker clear is verified later).
-- Rebuild in that case, too. An invalidated last clear may also restore the
-- name to the ranking without changing that historical best.
create or replace function private.kamereoru_refresh_best(p_name_key text) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  best_play uuid;
  best_name text;
  best_buildings int;
  best_avg int;
  has_best boolean;
  cur private.kamereoru_bests;
  has_cur boolean;
  changed boolean := false;
  should_show boolean;
  listed_before boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('kamereoru:name:' || p_name_key, 0));
  select r.play_id, r.display_name, r.buildings, r.rank_avg
  into best_play, best_name, best_buildings, best_avg
  from private.kamereoru_results r
  where r.name_key = p_name_key and r.status = 'official' and r.buildings >= 1
  order by r.buildings desc, r.rank_avg desc, r.official_at asc, r.play_id asc
  limit 1;
  has_best := found;
  select * into cur from private.kamereoru_bests where name_key = p_name_key;
  has_cur := found;

  if not has_best then
    if has_cur then
      delete from private.kamereoru_bests where name_key = p_name_key;
      changed := true;
    end if;
  elsif not has_cur or cur.play_id <> best_play or cur.buildings <> best_buildings or cur.rank_avg <> best_avg then
    insert into private.kamereoru_bests (name_key, display_name, play_id, buildings, rank_avg, updated_at)
    values (p_name_key, best_name, best_play, best_buildings, best_avg, now())
    on conflict (name_key) do update
      set display_name = excluded.display_name, play_id = excluded.play_id,
          buildings = excluded.buildings, rank_avg = excluded.rank_avg, updated_at = now();
    changed := true;
  end if;

  select exists (
    select 1 from private.kamereoru_bests b
    where b.name_key = p_name_key and not exists (
      select 1 from private.kamereoru_clear_ordinals o where o.name_key = b.name_key
    )
  ) into should_show;
  select exists (
    select 1 from private.kamereoru_ranking_rows rr
    where rr.version = (select max(version) from private.kamereoru_ranking_versions)
      and rr.name_key = p_name_key
  ) into listed_before;
  if changed or should_show <> listed_before then
    perform private.kamereoru_rebuild_ranking();
  end if;
  return changed or should_show <> listed_before;
end $$;

-- Once a name has a valid Hall of Fame admission, personal rank is absent.
-- The stored best is intentionally kept for auditing and future corrections.
create or replace function private.kamereoru_rank_of(p_name_key text) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  b private.kamereoru_bests;
  n int;
begin
  if exists (
    select 1 from private.kamereoru_clear_ordinals o where o.name_key = p_name_key
  ) then
    return jsonb_build_object('rank', null);
  end if;
  select * into b from private.kamereoru_bests where name_key = p_name_key;
  if not found then
    return jsonb_build_object('rank', null);
  end if;
  select count(*) into n from private.kamereoru_bests x
  where (x.buildings, x.rank_avg) > (b.buildings, b.rank_avg)
    and not exists (
      select 1 from private.kamereoru_clear_ordinals o where o.name_key = x.name_key
    );
  return jsonb_build_object('rank', n + 1, 'buildings', b.buildings,
    'average', b.rank_avg, 'name', b.display_name);
end $$;

-- Refresh only the derived ranking snapshot. Preserve historical plays,
-- best records, Hall of Fame admissions and all previous positions.
select private.kamereoru_rebuild_ranking();
