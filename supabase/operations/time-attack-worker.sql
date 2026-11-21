-- Hosted setup for the time-attack worker. Apply after the TA migrations and
-- endpoint have been verified. Supabase Vault holds the signing key. pg_net
-- only queues a time-limited token for this one worker route.
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'kamereoru_ta_worker_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'kamereoru_ta_worker_secret',
      'Signing key for short-lived tokens for the Chameleol time attack worker'
    );
  end if;
end $$;

create or replace function private.kamereoru_ta_worker_token(p_slot bigint)
returns text language sql stable set search_path = '' as $$
  select encode(extensions.hmac(
    convert_to('chameleol:time-attack:process:' || p_slot::text, 'UTF8'),
    convert_to(s.decrypted_secret, 'UTF8'),
    'sha256'
  ), 'hex')
  from vault.decrypted_secrets s
  where s.name = 'kamereoru_ta_worker_secret';
$$;

create or replace function private.kamereoru_ta_worker_authorized(p_token text)
returns boolean language sql stable set search_path = '' as $$
  with current_slot as (
    select floor(extract(epoch from statement_timestamp()) / 60)::bigint as slot
  )
  select coalesce(p_token ~ '^[a-f0-9]{64}$' and (
    p_token = private.kamereoru_ta_worker_token(slot)
    or p_token = private.kamereoru_ta_worker_token(slot - 1)
  ), false)
  from current_slot;
$$;

revoke execute on function private.kamereoru_ta_worker_token(bigint) from public, anon, authenticated, service_role;
revoke execute on function private.kamereoru_ta_worker_authorized(text) from public, anon, authenticated, service_role;

-- The database checks the queue every minute, but only calls the Edge Function
-- when there is verification work eligible for pickup.
select cron.schedule(
  'kamereoru-ta-process-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://mlpnjgezrnhdxsxolyzj.supabase.co/functions/v1/kamereoru/time-attack-process',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-TA-Worker-Token', private.kamereoru_ta_worker_token(floor(extract(epoch from statement_timestamp()) / 60)::bigint)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 8000
    )
    where exists (
      select 1 from private.kamereoru_ta_jobs
      where status <> 'finished' and (lease_until is null or lease_until <= statement_timestamp())
    );
  $job$
);

select cron.schedule(
  'kamereoru-ta-retention-daily',
  '0 3 * * *',
  $job$
    select private.kamereoru_ta_purge_details(now()),
           private.kamereoru_ta_prune_rank_versions(now());
  $job$
);
