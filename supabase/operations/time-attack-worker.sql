-- OPERATIONAL SCRIPT: time-attack background verification.
-- NOT a migration. Do not execute until a game/lab release candidate is tested,
-- the worker secret has been configured and production enablement is approved.
--
-- Requirements:
-- 1. pg_cron and vault exist in chameleonJP-Lab.
-- 2. Create a 32-byte secure random base64url (43 chars) secret outside this file.
-- 3. Store same secret in Supabase Edge Function:
--       KAMEREORU_TA_WORKER_SECRET
--    and in Vault secret name "kamereoru_ta_worker_secret".
-- 4. The Edge Function must accept POST time-attack-process with this secret.
-- 5. The scheduled task must NOT contain the plaintext secret.
--
-- On 2026-11-21, pg_cron and Vault were available, pg_net was not enabled.
-- The following ALTER/CREATE operations require a separate production rollout.

create extension if not exists pg_net with schema extensions;

-- Re-read the cron job when running this. Its name is stable; do not create duplicates.
-- Only run once after verifying no job with this name already exists.
select cron.schedule(
  'kamereoru-ta-process-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://mlpnjgezrnhdxsxolyzj.supabase.co/functions/v1/kamereoru/time-attack-process',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'X-TA-Worker-Secret',(
          select decrypted_secret
          from vault.decrypted_secrets
          where name='kamereoru_ta_worker_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 8000
    );
  $job$
);

-- Check (read-only):
-- select jobid,schedule,active from cron.job where jobname='kamereoru-ta-process-every-minute';
-- select status, count(*), min(created_at)
--   from private.kamereoru_ta_jobs group by status;
-- select start_time,end_time,status,return_message
--   from cron.job_run_details
--   where jobid=(select jobid from cron.job where jobname='kamereoru-ta-process-every-minute')
--   order by start_time desc limit 10;
--
-- Rollback of a faulty new release:
-- - Disable only new TA reservations and the homepage TA button.
-- - Keep the verified TA API/secret/cron intact for existing pending results and retries.
-- - Do not drop private.kamereoru_ta_* tables or remove completed scores.
