-- カメレオる v1：開始受付・プレイ回数・終了結果の受付・検証待ち・正式順位・再審査・訂正。
-- 対象ゲームの必要分だけを private スキーマに追加する。既存のゲーム・表・関数には触れない。
-- 公開クライアント（anon / authenticated）からは表にも関数にも直接触れない。Edge Function が DB 接続で呼ぶ。
-- 適用は検証環境で試し、本番への適用は利用者の承認を得て別の作業として行う（docs/release/release-and-rollback.md）。

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 設定（1行）
-- ---------------------------------------------------------------------------
create table if not exists private.kamereoru_config (
  id boolean primary key default true check (id),
  accepting_ranked_starts boolean not null default true,
  accepted_rules_versions text[] not null default array['kamereoru-rules-v1'],
  detail_retention interval not null default interval '30 days',
  updated_at timestamptz not null default now()
);
insert into private.kamereoru_config default values on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 名前ありの開始受付（予約）。同じ要求番号には同じ内容を返す。
-- ---------------------------------------------------------------------------
create table if not exists private.kamereoru_starts (
  request_id uuid primary key,
  secret_hash bytea not null check (octet_length(secret_hash) = 32),
  launch_id uuid not null,
  play_id uuid not null unique default gen_random_uuid(),
  display_name text not null check (octet_length(display_name) between 1 and 1000),
  name_key text collate "C" not null check (octet_length(name_key) between 1 and 1000),
  seed bigint not null check (seed between 0 and 4294967295),
  rules_version text not null,
  generator_version text not null,
  game_version text not null check (octet_length(game_version) between 1 and 64),
  accepted_at timestamptz not null default now(),
  status text not null default 'reserved' check (status in ('reserved', 'launched', 'abandoned')),
  launched_at timestamptz,
  abandoned_at timestamptz
);
create index if not exists kamereoru_starts_name on private.kamereoru_starts (name_key);

-- ---------------------------------------------------------------------------
-- プレイ回数（実際に本編を始めた時の開始通知）。launch_id ごとに1回。
-- ---------------------------------------------------------------------------
create table if not exists private.kamereoru_launches (
  launch_id uuid primary key,
  ranked boolean not null,
  play_id uuid references private.kamereoru_starts (play_id),
  game_version text not null check (octet_length(game_version) between 1 and 64),
  received_at timestamptz not null default now(),
  check ((ranked and play_id is not null) or (not ranked and play_id is null))
);
create unique index if not exists kamereoru_launches_play on private.kamereoru_launches (play_id) where play_id is not null;

-- ---------------------------------------------------------------------------
-- 終了結果の分割受信。1つの開始（play_id）に結果番号は1つだけ（最初の片で固定）。
-- ---------------------------------------------------------------------------
create table if not exists private.kamereoru_result_claims (
  play_id uuid primary key references private.kamereoru_starts (play_id),
  result_id uuid not null unique,
  chunk_total int not null check (chunk_total between 1 and 64),
  total_length int not null check (total_length between 1 and 8388608),
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table if not exists private.kamereoru_uploads (
  play_id uuid not null references private.kamereoru_result_claims (play_id),
  chunk_index int not null check (chunk_index between 0 and 63),
  chunk text not null,
  received_at timestamptz not null default now(),
  primary key (play_id, chunk_index)
);

-- ---------------------------------------------------------------------------
-- 終了結果（1開始につき1件）。詳細（body）は期限で整理できるが、集計の列は残す。
-- ---------------------------------------------------------------------------
create table if not exists private.kamereoru_results (
  play_id uuid primary key references private.kamereoru_starts (play_id),
  result_id uuid not null unique references private.kamereoru_result_claims (result_id),
  name_key text collate "C" not null,
  display_name text not null,
  body jsonb,
  body_sha256 text not null,
  body_length int not null,
  received_at timestamptz not null default now(),
  status text not null check (status in ('verifying', 'official', 'no_rank', 'pending_review', 'rejected', 'under_review')),
  buildings int check (buildings between 0 and 50),
  rank_avg int check (rank_avg between 0 and 10000),
  mean_num numeric,
  mean_den numeric,
  score int,
  max_combo int,
  end_reason text,
  end_t int,
  verdict jsonb,
  verified_at timestamptz,
  official_at timestamptz,
  review_requests int not null default 0 check (review_requests between 0 and 1),
  details_purged_at timestamptz,
  check (status <> 'official' or (buildings >= 1 and rank_avg is not null and official_at is not null))
);
create index if not exists kamereoru_results_official on private.kamereoru_results (name_key) where status = 'official';
create index if not exists kamereoru_results_status on private.kamereoru_results (status);

-- 検証待ちの作業（受付と同じ取引で作る。処理が止まっても再取得できる）
create table if not exists private.kamereoru_jobs (
  play_id uuid primary key references private.kamereoru_results (play_id),
  state text not null default 'queued' check (state in ('queued', 'running')),
  attempts int not null default 0,
  lease_until timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 名前ごとの正式ベスト（実在する1プレイへの参照）と、順位表の版
-- ---------------------------------------------------------------------------
create table if not exists private.kamereoru_bests (
  name_key text collate "C" primary key,
  display_name text not null,
  play_id uuid not null references private.kamereoru_results (play_id),
  buildings int not null check (buildings between 1 and 50),
  rank_avg int not null check (rank_avg between 0 and 10000),
  updated_at timestamptz not null default now()
);

create table if not exists private.kamereoru_ranking_versions (
  version bigserial primary key,
  created_at timestamptz not null default now(),
  name_count int not null
);

create table if not exists private.kamereoru_ranking_rows (
  version bigint not null references private.kamereoru_ranking_versions (version) on delete cascade,
  position int not null,
  rank int not null,
  name_key text collate "C" not null,
  display_name text not null,
  buildings int not null,
  rank_avg int not null,
  primary key (version, position)
);

-- 審査・訂正・整理の記録
create table if not exists private.kamereoru_audit (
  id bigserial primary key,
  play_id uuid,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  actor text not null default 'system',
  visible_to_owner boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists kamereoru_audit_play on private.kamereoru_audit (play_id);

-- 頻度制限（IPなどのハッシュ単位。名前では制限しない）
create table if not exists private.kamereoru_rate (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);

-- ---------------------------------------------------------------------------
-- 権限：行ごとのアクセス制限を有効にし、公開クライアントへ表の権限を渡さない
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'kamereoru_config', 'kamereoru_starts', 'kamereoru_launches', 'kamereoru_result_claims', 'kamereoru_uploads',
    'kamereoru_results', 'kamereoru_jobs', 'kamereoru_bests', 'kamereoru_ranking_versions', 'kamereoru_ranking_rows',
    'kamereoru_audit', 'kamereoru_rate'
  ] loop
    execute format('alter table private.%I enable row level security', t);
    execute format('revoke all on table private.%I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on table private.%I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on table private.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 関数。エラーは SQLSTATE KM403（照合失敗）/KM404/KM409（競合）/KM422（形式）/KM425（未完）/KM429/KM503
-- ---------------------------------------------------------------------------

-- 名前ありの開始受付。同じ要求番号・同じ送信元には同じ受付番号・出題番号・版・名義を返す。
create or replace function private.kamereoru_start(
  p_request_id uuid,
  p_secret_hash bytea,
  p_launch_id uuid,
  p_display_name text,
  p_name_key text,
  p_rules_version text,
  p_generator_version text,
  p_game_version text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v private.kamereoru_starts;
  v_created boolean := false;
  cfg private.kamereoru_config;
begin
  select * into v from private.kamereoru_starts where request_id = p_request_id;
  if not found then
    select * into cfg from private.kamereoru_config;
    if not cfg.accepting_ranked_starts then
      raise exception using errcode = 'KM503', message = 'ranked_starts_paused';
    end if;
    if not (p_rules_version = any (cfg.accepted_rules_versions)) then
      raise exception using errcode = 'KM422', message = 'unsupported_rules_version';
    end if;
    insert into private.kamereoru_starts (request_id, secret_hash, launch_id, display_name, name_key, seed, rules_version, generator_version, game_version)
    values (p_request_id, p_secret_hash, p_launch_id, p_display_name, p_name_key, floor(random() * 4294967296)::bigint, p_rules_version, p_generator_version, p_game_version)
    on conflict (request_id) do nothing
    returning * into v;
    v_created := found;
    if not found then
      select * into v from private.kamereoru_starts where request_id = p_request_id;
    end if;
  end if;
  if v.secret_hash <> p_secret_hash then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;
  if v.launch_id <> p_launch_id or v.name_key <> p_name_key or v.game_version <> p_game_version or v.rules_version <> p_rules_version then
    raise exception using errcode = 'KM409', message = 'request_conflict';
  end if;
  return jsonb_build_object(
    'requestId', v.request_id, 'playId', v.play_id, 'seed', v.seed, 'rulesVersion', v.rules_version,
    'generatorVersion', v.generator_version, 'gameVersion', v.game_version, 'name', v.display_name,
    'acceptedAt', v.accepted_at, 'created', v_created
  );
end $$;

-- 中止（予約だけで本編を始めなかった）。プレイ回数には入らない。
create or replace function private.kamereoru_abandon(p_request_id uuid, p_secret_hash bytea) returns text
language plpgsql
set search_path = ''
as $$
declare v private.kamereoru_starts;
begin
  select * into v from private.kamereoru_starts where request_id = p_request_id for update;
  if not found or v.secret_hash <> p_secret_hash then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;
  if v.status = 'reserved' then
    update private.kamereoru_starts set status = 'abandoned', abandoned_at = now() where request_id = p_request_id;
    return 'abandoned';
  end if;
  return v.status;
end $$;

-- プレイ回数の開始通知。launch_id ごとに1回だけ数える。名前ありは開始受付と送信元の秘密を照合する。
create or replace function private.kamereoru_launch(
  p_launch_id uuid,
  p_ranked boolean,
  p_play_id uuid,
  p_secret_hash bytea,
  p_game_version text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s private.kamereoru_starts;
  existing private.kamereoru_launches;
begin
  if p_ranked then
    select * into s from private.kamereoru_starts where play_id = p_play_id for update;
    if not found or p_secret_hash is null or s.secret_hash <> p_secret_hash then
      raise exception using errcode = 'KM403', message = 'forbidden';
    end if;
    if s.launch_id <> p_launch_id then
      raise exception using errcode = 'KM409', message = 'launch_conflict';
    end if;
  elsif p_play_id is not null then
    raise exception using errcode = 'KM422', message = 'unranked_with_play';
  end if;
  insert into private.kamereoru_launches (launch_id, ranked, play_id, game_version)
  values (p_launch_id, p_ranked, case when p_ranked then p_play_id end, p_game_version)
  on conflict (launch_id) do nothing;
  if found then
    if p_ranked then
      update private.kamereoru_starts set status = 'launched', launched_at = now() where play_id = p_play_id and status <> 'launched';
    end if;
    return jsonb_build_object('counted', true);
  end if;
  select * into existing from private.kamereoru_launches where launch_id = p_launch_id;
  if existing.ranked <> p_ranked or existing.play_id is distinct from (case when p_ranked then p_play_id end) then
    raise exception using errcode = 'KM409', message = 'launch_conflict';
  end if;
  return jsonb_build_object('counted', false);
end $$;

-- 終了結果の1片を受け取る。同じ位置に同じ内容なら受理済み、違う内容なら拒否（正常な片を上書きしない）。
create or replace function private.kamereoru_put_chunk(
  p_play_id uuid,
  p_result_id uuid,
  p_secret_hash bytea,
  p_index int,
  p_total int,
  p_length int,
  p_sha256 text,
  p_chunk text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s private.kamereoru_starts;
  c private.kamereoru_result_claims;
  r private.kamereoru_results;
  old_chunk text;
  received int;
begin
  select * into s from private.kamereoru_starts where play_id = p_play_id;
  if not found or s.secret_hash <> p_secret_hash then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;
  if s.status = 'abandoned' then
    raise exception using errcode = 'KM409', message = 'start_abandoned';
  end if;
  if p_index < 0 or p_index >= p_total or p_total < 1 or p_total > 64 then
    raise exception using errcode = 'KM422', message = 'chunk_range';
  end if;
  select * into r from private.kamereoru_results where play_id = p_play_id;
  if found then
    if r.result_id = p_result_id then
      return jsonb_build_object('received', p_total, 'total', p_total, 'complete', true);
    end if;
    raise exception using errcode = 'KM409', message = 'result_conflict';
  end if;
  insert into private.kamereoru_result_claims (play_id, result_id, chunk_total, total_length, body_sha256)
  values (p_play_id, p_result_id, p_total, p_length, p_sha256)
  on conflict do nothing;
  select * into c from private.kamereoru_result_claims where play_id = p_play_id;
  if c.result_id <> p_result_id then
    raise exception using errcode = 'KM409', message = 'result_conflict';
  end if;
  if c.chunk_total <> p_total or c.total_length <> p_length or c.body_sha256 <> p_sha256 then
    raise exception using errcode = 'KM409', message = 'chunk_meta_conflict';
  end if;
  if length(p_chunk) < 1 or length(p_chunk) > p_length then
    raise exception using errcode = 'KM422', message = 'chunk_size';
  end if;
  insert into private.kamereoru_uploads (play_id, chunk_index, chunk) values (p_play_id, p_index, p_chunk)
  on conflict (play_id, chunk_index) do nothing;
  if not found then
    select chunk into old_chunk from private.kamereoru_uploads where play_id = p_play_id and chunk_index = p_index;
    if old_chunk <> p_chunk then
      raise exception using errcode = 'KM409', message = 'chunk_conflict';
    end if;
  end if;
  select count(*) into received from private.kamereoru_uploads where play_id = p_play_id;
  return jsonb_build_object('received', received, 'total', c.chunk_total, 'complete', false);
end $$;

-- 全片がそろったら、本文・指紋・検証待ちの作業を1つの取引で保存して完全受付にする。
create or replace function private.kamereoru_accept(p_play_id uuid, p_result_id uuid, p_secret_hash bytea) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  s private.kamereoru_starts;
  c private.kamereoru_result_claims;
  r private.kamereoru_results;
  body_text text;
  body_json jsonb;
  n int;
begin
  select * into s from private.kamereoru_starts where play_id = p_play_id;
  if not found or s.secret_hash <> p_secret_hash then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;
  select * into c from private.kamereoru_result_claims where play_id = p_play_id for update;
  if not found then
    raise exception using errcode = 'KM425', message = 'incomplete';
  end if;
  if c.result_id <> p_result_id then
    raise exception using errcode = 'KM409', message = 'result_conflict';
  end if;
  select * into r from private.kamereoru_results where play_id = p_play_id;
  if found then
    return jsonb_build_object('playId', r.play_id, 'resultId', r.result_id, 'status', r.status, 'receivedAt', r.received_at, 'duplicate', true);
  end if;
  select count(*), string_agg(chunk, '' order by chunk_index) into n, body_text from private.kamereoru_uploads where play_id = p_play_id;
  if n <> c.chunk_total then
    raise exception using errcode = 'KM425', message = 'incomplete';
  end if;
  if length(body_text) <> c.total_length or body_text !~ '^[ -~]*$' then
    raise exception using errcode = 'KM422', message = 'body_length';
  end if;
  if encode(sha256(convert_to(body_text, 'UTF8')), 'hex') <> c.body_sha256 then
    raise exception using errcode = 'KM422', message = 'fingerprint_mismatch';
  end if;
  begin
    body_json := body_text::jsonb;
  exception when others then
    raise exception using errcode = 'KM422', message = 'invalid_json';
  end;
  insert into private.kamereoru_results (play_id, result_id, name_key, display_name, body, body_sha256, body_length, status)
  values (p_play_id, p_result_id, s.name_key, s.display_name, body_json, c.body_sha256, c.total_length, 'verifying')
  returning * into r;
  insert into private.kamereoru_jobs (play_id) values (p_play_id);
  delete from private.kamereoru_uploads where play_id = p_play_id;
  return jsonb_build_object('playId', r.play_id, 'resultId', r.result_id, 'status', r.status, 'receivedAt', r.received_at, 'duplicate', false);
end $$;

-- 検証待ちを取り出す。処理が止まった作業は、期限（lease）を過ぎたら再び取り出せる。
create or replace function private.kamereoru_claim_jobs(p_limit int, p_lease interval) returns table (play_id uuid, attempts int)
language sql
set search_path = ''
as $$
  with picked as (
    select j.play_id
    from private.kamereoru_jobs j
    where j.state = 'queued' or (j.state = 'running' and j.lease_until < now())
    order by j.created_at
    limit p_limit
    for update skip locked
  )
  update private.kamereoru_jobs j
  set state = 'running', lease_until = now() + p_lease, attempts = j.attempts + 1
  from picked
  where j.play_id = picked.play_id
  returning j.play_id, j.attempts;
$$;

create or replace function private.kamereoru_job_input(p_play_id uuid) returns jsonb
language sql
set search_path = ''
as $$
  select jsonb_build_object(
    'playId', s.play_id, 'launchId', s.launch_id, 'seed', s.seed, 'rulesVersion', s.rules_version,
    'generatorVersion', s.generator_version, 'acceptedAt', s.accepted_at, 'receivedAt', r.received_at,
    'status', r.status, 'body', r.body
  )
  from private.kamereoru_starts s join private.kamereoru_results r using (play_id)
  where s.play_id = p_play_id;
$$;

-- 名前ごとの正式ベストを、その時点の正式記録から選び直す。同じ名前の承認・訂正は直列化する。
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
begin
  perform pg_advisory_xact_lock(hashtextextended('kamereoru:name:' || p_name_key, 0));
  select r.play_id, r.display_name, r.buildings, r.rank_avg into best_play, best_name, best_buildings, best_avg
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
      set display_name = excluded.display_name, play_id = excluded.play_id, buildings = excluded.buildings, rank_avg = excluded.rank_avg, updated_at = now();
    changed := true;
  end if;
  if changed then
    perform private.kamereoru_rebuild_ranking();
  end if;
  return changed;
end $$;

-- 順位表の新しい版を作る：名前ごとのベスト → 棟数と2桁一致度で順位（1・1・3方式）→ 30位以内をすべて。
create or replace function private.kamereoru_rebuild_ranking() returns bigint
language plpgsql
set search_path = ''
as $$
declare v bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('kamereoru:ranking', 0));
  insert into private.kamereoru_ranking_versions (name_count) select count(*) from private.kamereoru_bests returning version into v;
  insert into private.kamereoru_ranking_rows (version, position, rank, name_key, display_name, buildings, rank_avg)
  select v, row_number() over (order by x.rnk, x.name_key collate "C"), x.rnk, x.name_key, x.display_name, x.buildings, x.rank_avg
  from (
    select b.name_key, b.display_name, b.buildings, b.rank_avg, rank() over (order by b.buildings desc, b.rank_avg desc) as rnk
    from private.kamereoru_bests b
  ) x
  where x.rnk <= 30;
  -- 古い版は、十分に新しい版があり時間もたったものだけ消す（読み途中のページを壊さない）
  delete from private.kamereoru_ranking_versions where version < v - 50 and created_at < now() - interval '15 minutes';
  return v;
end $$;

-- 検証の確定。すでに確定済みなら同じ状態を返す（何度呼んでも1回だけ適用）。
create or replace function private.kamereoru_finalize(p_play_id uuid, p_status text, p_values jsonb, p_verdict jsonb) returns text
language plpgsql
set search_path = ''
as $$
declare
  r private.kamereoru_results;
  b int := (p_values ->> 'buildings')::int;
  a int := (p_values ->> 'rankAverage')::int;
  final_status text := p_status;
begin
  select * into r from private.kamereoru_results where play_id = p_play_id for update;
  if not found then
    raise exception using errcode = 'KM404', message = 'not_found';
  end if;
  if r.status <> 'verifying' then
    delete from private.kamereoru_jobs where play_id = p_play_id;
    return r.status;
  end if;
  if final_status not in ('official', 'pending_review', 'rejected') then
    raise exception using errcode = 'KM422', message = 'bad_status';
  end if;
  if final_status = 'official' and coalesce(b, 0) = 0 then
    final_status := 'no_rank';
  end if;
  update private.kamereoru_results set
    status = final_status,
    buildings = b,
    rank_avg = a,
    mean_num = (p_values ->> 'meanNum')::numeric,
    mean_den = (p_values ->> 'meanDen')::numeric,
    score = (p_values ->> 'score')::int,
    max_combo = (p_values ->> 'maxCombo')::int,
    end_reason = p_values ->> 'endReason',
    end_t = (p_values ->> 'endT')::int,
    verdict = p_verdict,
    verified_at = now(),
    official_at = case when final_status = 'official' then now() end
  where play_id = p_play_id;
  delete from private.kamereoru_jobs where play_id = p_play_id;
  insert into private.kamereoru_audit (play_id, action, after, reason, actor, visible_to_owner)
  values (p_play_id, 'verify:' || final_status, p_values, p_verdict ->> 'reason', 'system', final_status in ('rejected', 'pending_review'));
  if final_status = 'official' then
    perform private.kamereoru_refresh_best(r.name_key);
  end if;
  return final_status;
end $$;

-- 順位表の1ページ。同じ版と続き位置で読み、版がなくなっていたら最新の先頭から読み直す。
create or replace function private.kamereoru_ranking_page(p_version bigint, p_after int, p_limit int) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v bigint;
  restarted boolean := false;
  after_pos int := coalesce(p_after, 0);
  lim int := least(greatest(coalesce(p_limit, 30), 1), 100);
  page_rows jsonb;
  last_pos int;
  has_more boolean;
  names int;
begin
  if p_version is not null and exists (select 1 from private.kamereoru_ranking_versions where version = p_version) then
    v := p_version;
  else
    select max(version) into v from private.kamereoru_ranking_versions;
    restarted := p_version is not null;
    after_pos := 0;
  end if;
  if v is null then
    return jsonb_build_object('version', 0, 'rows', '[]'::jsonb, 'nextAfter', null, 'nameCount', 0, 'restarted', restarted);
  end if;
  select name_count into names from private.kamereoru_ranking_versions where version = v;
  select coalesce(jsonb_agg(jsonb_build_object('position', x.position, 'rank', x.rank, 'name', x.display_name, 'buildings', x.buildings, 'average', x.rank_avg) order by x.position), '[]'::jsonb), max(x.position)
  into page_rows, last_pos
  from (
    select * from private.kamereoru_ranking_rows where version = v and position > after_pos order by position limit lim
  ) x;
  has_more := last_pos is not null and exists (select 1 from private.kamereoru_ranking_rows where version = v and position > last_pos);
  return jsonb_build_object('version', v, 'rows', page_rows, 'nextAfter', case when has_more then last_pos end, 'nameCount', names, 'restarted', restarted);
end $$;

-- 登録名の正式順位（上位30位の外でも、一覧を切り出す前の順位を返す）。
create or replace function private.kamereoru_rank_of(p_name_key text) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  b private.kamereoru_bests;
  n int;
begin
  select * into b from private.kamereoru_bests where name_key = p_name_key;
  if not found then
    return jsonb_build_object('rank', null);
  end if;
  select count(*) into n from private.kamereoru_bests x where (x.buildings, x.rank_avg) > (b.buildings, b.rank_avg);
  return jsonb_build_object('rank', n + 1, 'buildings', b.buildings, 'average', b.rank_avg, 'name', b.display_name);
end $$;

-- 送信元だけが見られる記録の状況。秘密が合わない番号は、存在するかどうかも答えない。
create or replace function private.kamereoru_status(p_play_ids uuid[], p_secret_hashes bytea[]) returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result_items jsonb := '[]'::jsonb;
  i int;
  s private.kamereoru_starts;
  r private.kamereoru_results;
  corrections jsonb;
begin
  if coalesce(array_length(p_play_ids, 1), 0) > 50 or coalesce(array_length(p_play_ids, 1), 0) <> coalesce(array_length(p_secret_hashes, 1), 0) then
    raise exception using errcode = 'KM422', message = 'bad_items';
  end if;
  for i in 1 .. coalesce(array_length(p_play_ids, 1), 0) loop
    select * into s from private.kamereoru_starts where play_id = p_play_ids[i];
    if not found or s.secret_hash <> p_secret_hashes[i] then
      result_items := result_items || jsonb_build_array(jsonb_build_object('playId', p_play_ids[i], 'error', 'forbidden'));
      continue;
    end if;
    select * into r from private.kamereoru_results where play_id = p_play_ids[i];
    if not found then
      result_items := result_items || jsonb_build_array(jsonb_build_object('playId', p_play_ids[i], 'status', 'not_received'));
      continue;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'before', a.before, 'after', a.after, 'reason', a.reason, 'at', a.created_at) order by a.id), '[]'::jsonb)
    into corrections
    from private.kamereoru_audit a
    where a.play_id = r.play_id and a.visible_to_owner and (a.action like 'correct%' or a.action like 'decide:%');
    result_items := result_items || jsonb_build_array(jsonb_build_object(
      'playId', r.play_id,
      'status', r.status,
      'official', case when r.status = 'official' then jsonb_build_object('buildings', r.buildings, 'rankAverage', r.rank_avg) end,
      'reviewRequests', r.review_requests,
      'reason', case when r.status in ('rejected', 'pending_review') then r.verdict ->> 'reason' end,
      'corrections', corrections
    ));
  end loop;
  return result_items;
end $$;

-- 拒否された記録への再審査の申請（1記録に1回、送信元の秘密を持つ端末から）。
create or replace function private.kamereoru_request_review(p_play_id uuid, p_secret_hash bytea) returns text
language plpgsql
set search_path = ''
as $$
declare
  s private.kamereoru_starts;
  r private.kamereoru_results;
begin
  select * into s from private.kamereoru_starts where play_id = p_play_id;
  if not found or s.secret_hash <> p_secret_hash then
    raise exception using errcode = 'KM403', message = 'forbidden';
  end if;
  select * into r from private.kamereoru_results where play_id = p_play_id for update;
  if not found then
    raise exception using errcode = 'KM404', message = 'not_found';
  end if;
  if r.status <> 'rejected' then
    raise exception using errcode = 'KM409', message = 'not_rejected';
  end if;
  if r.review_requests >= 1 then
    raise exception using errcode = 'KM409', message = 'review_already_requested';
  end if;
  if r.details_purged_at is not null then
    raise exception using errcode = 'KM409', message = 'details_purged';
  end if;
  update private.kamereoru_results set status = 'under_review', review_requests = 1 where play_id = p_play_id;
  insert into private.kamereoru_audit (play_id, action, before, after, actor, visible_to_owner)
  values (p_play_id, 'review_request', jsonb_build_object('status', r.status), jsonb_build_object('status', 'under_review'), 'owner', true);
  return 'under_review';
end $$;

-- 管理者の判断（Supabase Dashboard の SQL Editor から呼ぶ）。変更前後・理由・日時を残し、自己ベストを選び直す。
create or replace function private.kamereoru_admin_decide(p_play_id uuid, p_decision text, p_reason text, p_actor text) returns text
language plpgsql
set search_path = ''
as $$
declare
  r private.kamereoru_results;
  next_status text;
begin
  if coalesce(trim(p_reason), '') = '' or coalesce(trim(p_actor), '') = '' then
    raise exception using errcode = 'KM422', message = 'reason_and_actor_required';
  end if;
  select * into r from private.kamereoru_results where play_id = p_play_id for update;
  if not found then
    raise exception using errcode = 'KM404', message = 'not_found';
  end if;
  if p_decision = 'official' then
    if r.status not in ('pending_review', 'under_review', 'rejected') then
      raise exception using errcode = 'KM409', message = 'not_decidable';
    end if;
    if coalesce(r.buildings, 0) < 1 or r.rank_avg is null then
      raise exception using errcode = 'KM409', message = 'no_values';
    end if;
    next_status := 'official';
  elsif p_decision = 'rejected' then
    if r.status not in ('pending_review', 'under_review', 'official') then
      raise exception using errcode = 'KM409', message = 'not_decidable';
    end if;
    next_status := 'rejected';
  else
    raise exception using errcode = 'KM422', message = 'bad_decision';
  end if;
  update private.kamereoru_results
  set status = next_status, official_at = case when next_status = 'official' then now() end
  where play_id = p_play_id;
  insert into private.kamereoru_audit (play_id, action, before, after, reason, actor, visible_to_owner)
  values (p_play_id, 'decide:' || next_status,
    jsonb_build_object('status', r.status, 'buildings', r.buildings, 'rankAverage', r.rank_avg),
    jsonb_build_object('status', next_status, 'buildings', r.buildings, 'rankAverage', r.rank_avg),
    p_reason, p_actor, true);
  perform private.kamereoru_refresh_best(r.name_key);
  return next_status;
end $$;

-- 正式記録の訂正（計算ミスで正しい値を確定できた時など）。過去のより良い正常記録へ戻れるよう、ベストは毎回選び直す。
create or replace function private.kamereoru_admin_correct(p_play_id uuid, p_buildings int, p_rank_avg int, p_reason text, p_actor text) returns text
language plpgsql
set search_path = ''
as $$
declare
  r private.kamereoru_results;
  next_status text;
begin
  if coalesce(trim(p_reason), '') = '' or coalesce(trim(p_actor), '') = '' then
    raise exception using errcode = 'KM422', message = 'reason_and_actor_required';
  end if;
  if p_buildings not between 0 and 50 or (p_buildings > 0 and (p_rank_avg is null or p_rank_avg not between 0 and 10000)) then
    raise exception using errcode = 'KM422', message = 'bad_values';
  end if;
  select * into r from private.kamereoru_results where play_id = p_play_id for update;
  if not found then
    raise exception using errcode = 'KM404', message = 'not_found';
  end if;
  if r.status <> 'official' then
    raise exception using errcode = 'KM409', message = 'not_official';
  end if;
  next_status := case when p_buildings = 0 then 'no_rank' else 'official' end;
  update private.kamereoru_results
  set buildings = p_buildings, rank_avg = case when p_buildings = 0 then null else p_rank_avg end, status = next_status,
      official_at = case when next_status = 'official' then r.official_at end
  where play_id = p_play_id;
  insert into private.kamereoru_audit (play_id, action, before, after, reason, actor, visible_to_owner)
  values (p_play_id, 'correct',
    jsonb_build_object('status', r.status, 'buildings', r.buildings, 'rankAverage', r.rank_avg),
    jsonb_build_object('status', next_status, 'buildings', p_buildings, 'rankAverage', case when p_buildings = 0 then null else p_rank_avg end),
    p_reason, p_actor, true);
  perform private.kamereoru_refresh_best(r.name_key);
  return next_status;
end $$;

-- 詳細履歴の期限整理。確認待ち・初回再審査が可能な拒否・再審査中は除外する（申請と同じ行の排他で判断）。
-- 集計・自己ベスト・訂正履歴・重複防止の情報は消さない。
create or replace function private.kamereoru_purge_details(p_now timestamptz default now()) returns int
language plpgsql
set search_path = ''
as $$
declare
  n int;
  retention interval := (select detail_retention from private.kamereoru_config);
begin
  with cand as (
    select r.play_id
    from private.kamereoru_results r
    where r.body is not null
      and r.received_at < p_now - retention
      and (r.status in ('official', 'no_rank') or (r.status = 'rejected' and r.review_requests >= 1))
    for update
  ), done as (
    update private.kamereoru_results r
    set body = null, details_purged_at = p_now
    from cand
    where r.play_id = cand.play_id
    returning r.play_id
  )
  insert into private.kamereoru_audit (play_id, action, actor)
  select play_id, 'purge_details', 'system' from done;
  get diagnostics n = row_count;
  return n;
end $$;

-- 保留の増え方（期限だけで処分しないため、量を記録して判断する）
create or replace function private.kamereoru_pending_stats() returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'pendingReview', count(*) filter (where status = 'pending_review'),
    'underReview', count(*) filter (where status = 'under_review'),
    'rejectedReviewable', count(*) filter (where status = 'rejected' and review_requests = 0),
    'verifying', count(*) filter (where status = 'verifying'),
    'detailBytes', coalesce(sum(pg_column_size(body)), 0)
  )
  from private.kamereoru_results;
$$;

-- 頻度制限。true なら許可。
create or replace function private.kamereoru_rate_hit(p_bucket text, p_window interval, p_limit int) returns boolean
language plpgsql
set search_path = ''
as $$
declare
  w timestamptz := date_bin(p_window, now(), timestamptz '2000-01-01 00:00:00+00');
  n int;
begin
  insert into private.kamereoru_rate (bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = private.kamereoru_rate.hits + 1
  returning hits into n;
  if random() < 0.01 then
    delete from private.kamereoru_rate where window_start < now() - interval '1 day';
  end if;
  return n <= p_limit;
end $$;

-- 切り戻し用：新しいランキング対象の開始だけを止める（既存の結果・照会・再送は止めない）
create or replace function private.kamereoru_set_accepting(p_accepting boolean) returns boolean
language sql
set search_path = ''
as $$
  update private.kamereoru_config set accepting_ranked_starts = p_accepting, updated_at = now() returning accepting_ranked_starts;
$$;

-- 関数の実行権限：公開クライアントには渡さない
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname like 'kamereoru\_%'
  loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
end $$;
