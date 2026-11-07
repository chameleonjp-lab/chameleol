-- 順位の検査（受入試験 RANK-TEST-01/03/04 の一部）。架空の正式記録を直接作り、順位表の版を確かめる。
-- npm run test:sql で、使い捨ての試験用データベースに対して実行する（本番では実行しない）。

create function pg_temp.mk(p_name text, p_buildings int, p_avg int) returns uuid language plpgsql as $$
declare
  rid uuid := gen_random_uuid();
  pid uuid;
begin
  insert into private.kamereoru_starts (request_id, secret_hash, launch_id, display_name, name_key, seed, rules_version, generator_version, game_version)
  values (gen_random_uuid(), decode(repeat('ab', 32), 'hex'), gen_random_uuid(), p_name, p_name, 1, 'kamereoru-rules-v1', 'kamereoru-course-v1', 't')
  returning play_id into pid;
  insert into private.kamereoru_result_claims (play_id, result_id, chunk_total, total_length, body_sha256) values (pid, rid, 1, 2, repeat('0', 64));
  insert into private.kamereoru_results (play_id, result_id, name_key, display_name, body, body_sha256, body_length, status)
  values (pid, rid, p_name, p_name, '{}'::jsonb, repeat('0', 64), 2, 'verifying');
  perform private.kamereoru_finalize(pid, 'official', jsonb_build_object('buildings', p_buildings, 'rankAverage', p_avg), '{"reason":"test"}'::jsonb);
  return pid;
end $$;

-- 1〜29位に1名ずつ、30位に3名、さらに31位以下の名前を置く
do $$
declare i int;
begin
  for i in 1 .. 29 loop
    perform pg_temp.mk('n' || lpad(i::text, 2, '0'), 50, 10000 - i);
  end loop;
  perform pg_temp.mk('t30-c', 50, 9970);
  perform pg_temp.mk('t30-a', 50, 9970);
  perform pg_temp.mk('t30-b', 50, 9970);
  perform pg_temp.mk('low1', 49, 9999);
  perform pg_temp.mk('low2', 10, 5000);
end $$;

do $$
declare
  page jsonb := private.kamereoru_ranking_page(null, null, 100);
  rs jsonb := page -> 'rows';
  n int := jsonb_array_length(page -> 'rows');
  last30 text;
begin
  if n <> 32 then
    raise exception 'expected 32 rows (1-29 + three at 30), got %', n;
  end if;
  if (rs -> 28 ->> 'rank')::int <> 29 or (rs -> 29 ->> 'rank')::int <> 30 or (rs -> 31 ->> 'rank')::int <> 30 then
    raise exception 'unexpected ranks %', rs;
  end if;
  -- 同順位の中だけ、名前の順で並べる（順位は名前で分けない）
  select string_agg(r ->> 'name', ',' order by (r ->> 'position')::int) into last30 from jsonb_array_elements(rs) r where (r ->> 'rank')::int = 30;
  if last30 <> 't30-a,t30-b,t30-c' then
    raise exception 'tie order %', last30;
  end if;
  -- 33位（49棟）は一覧の対象外。ただし個人の順位は一覧を切る前に計算する
  if exists (select 1 from jsonb_array_elements(rs) r where r ->> 'name' = 'low1') then
    raise exception 'rank 33 must not be listed';
  end if;
  if (private.kamereoru_rank_of('low1') ->> 'rank')::int <> 33 then
    raise exception 'personal rank of low1 should be 33, got %', private.kamereoru_rank_of('low1');
  end if;
  if (page ->> 'nameCount')::int <> 34 then
    raise exception 'name count should be 34 (registered names), got %', page ->> 'nameCount';
  end if;
end $$;

-- 50棟92.35 ＞ 50棟92.34 ＞ 49棟99.00、同じ2桁は同順位（1・1・3方式）
truncate private.kamereoru_bests, private.kamereoru_ranking_versions cascade;
do $$
declare page jsonb;
begin
  perform pg_temp.mk('A', 50, 9235);
  perform pg_temp.mk('B', 50, 9234);
  perform pg_temp.mk('C', 49, 9900);
  perform pg_temp.mk('D', 50, 9234);
  page := private.kamereoru_ranking_page(null, null, 30);
  if (select string_agg((r ->> 'name') || ':' || (r ->> 'rank'), ',' order by (r ->> 'position')::int) from jsonb_array_elements(page -> 'rows') r) <> 'A:1,B:2,D:2,C:4' then
    raise exception 'unexpected order %', page -> 'rows';
  end if;
end $$;

select 'kamereoru_ranking: ok' as result;
