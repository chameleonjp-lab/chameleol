-- Keep previously enabled guest launches and existing ranked receipts usable
-- when new ranked reservations are closed.
alter table private.kamereoru_ta_config
  add column guest_launches_opened boolean not null default false;
update private.kamereoru_ta_config
  set guest_launches_opened = true where accepting;

create function private.kamereoru_ta_remember_guest_intake()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.guest_launches_opened := new.accepting or old.guest_launches_opened;
  return new;
end $$;

revoke execute on function private.kamereoru_ta_remember_guest_intake() from public, anon, authenticated;
create trigger kamereoru_ta_remember_guest_intake
  before update of accepting on private.kamereoru_ta_config
  for each row execute function private.kamereoru_ta_remember_guest_intake();

create or replace function private.kamereoru_ta_launch(
 p_launch uuid,p_play uuid,p_ranked boolean,p_hash bytea,
 p_family text,p_game_version text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.kamereoru_ta_launches%rowtype; st private.kamereoru_ta_starts%rowtype;
begin
 if p_family not in ('red','green','blue') or p_game_version is null then
  raise exception using errcode='KM422',message='bad_launch'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_launch::text,0));
 if p_ranked then
  select * into st from private.kamereoru_ta_starts where play_id=p_play for update;
  if not found or st.status='abandoned' or st.launch_id is distinct from p_launch
    or st.secret_hash is distinct from p_hash or st.family is distinct from p_family
    or st.game_version is distinct from p_game_version then
   raise exception using errcode='KM403',message='unregistered_start';
  end if;
 elsif p_play is not null or p_hash is not null then
  raise exception using errcode='KM422',message='anonymous_with_play_id';
 end if;
 select * into r from private.kamereoru_ta_launches where launch_id=p_launch;
 if found then
  if r.play_id is distinct from p_play or r.ranked<>p_ranked or r.family<>p_family or
   r.game_version<>p_game_version then raise exception using errcode='KM409',message='launch_conflict';end if;
  return pg_catalog.jsonb_build_object('launchId',p_launch,'counted',true);
 end if;
 -- Before the first release, guests cannot create a count. Once opened,
 -- disabling new ranked reservations must not drop queued anonymous launches.
 if not p_ranked and not (select guest_launches_opened from private.kamereoru_ta_config where id=1) then
  raise exception using errcode='KM503',message='time_attack_not_enabled';
 end if;
 if p_ranked then
  update private.kamereoru_ta_starts set status='launched' where play_id=p_play;
 end if;
 insert into private.kamereoru_ta_launches(launch_id,play_id,ranked,family,game_version)
 values(p_launch,p_play,p_ranked,p_family,p_game_version);
 return pg_catalog.jsonb_build_object('launchId',p_launch,'counted',true);
end $$;

-- A worker can disappear on attempt three. An expired last lease leaves the
-- evidence in the manual queue, even when nobody keeps the game page open.
create or replace function private.kamereoru_ta_claim_jobs(p_limit int)
returns table(play_id uuid,claim_token uuid,attempts integer)
language plpgsql security definer set search_path = '' as $$
declare expired record;
begin
  for expired in
    select j.play_id
    from private.kamereoru_ta_jobs j
    where j.status = 'claimed' and j.attempts >= 3 and j.lease_until <= clock_timestamp()
    order by j.created_at, j.play_id
    limit least(greatest(p_limit,0),5)
    for update skip locked
  loop
    update private.kamereoru_ta_results r
      set status = 'pending_review', verdict = '{"reason":"verifier_timeout"}'::jsonb
      where r.play_id = expired.play_id and r.status = 'verifying';
    if found then
      insert into private.kamereoru_ta_audit(play_id,event,detail)
      values(expired.play_id,'pending_review','{"reason":"verifier_timeout"}'::jsonb);
    end if;
    update private.kamereoru_ta_jobs j
      set status = 'finished', lease_until = null, claim_token = null
      where j.play_id = expired.play_id;
  end loop;
  return query
  with candidates as (
    select j.play_id from private.kamereoru_ta_jobs j
    where j.status <> 'finished' and j.attempts < 3
      and (j.lease_until is null or j.lease_until <= clock_timestamp())
    order by j.created_at, j.play_id
    limit least(greatest(p_limit,0),5)
    for update skip locked
  )
  update private.kamereoru_ta_jobs j
    set status = 'claimed', attempts = j.attempts + 1,
      claim_token = gen_random_uuid(), lease_until = clock_timestamp() + interval '60 seconds'
    from candidates c where j.play_id = c.play_id
    returning j.play_id, j.claim_token, j.attempts;
end $$;
