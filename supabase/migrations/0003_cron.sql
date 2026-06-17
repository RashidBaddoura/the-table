-- ============================================================================
-- The Table v2 — scheduled ingestion via pg_cron + pg_net.
--
-- PREREQUISITE (one-time, do this BEFORE running this migration — see README):
--   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>',        'service_role_key');
-- Secrets live in Supabase Vault (encrypted), never in git.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Remove any previous schedule with this name so the migration is re-runnable.
select cron.unschedule('ingest-openfootball')
where exists (select 1 from cron.job where jobname = 'ingest-openfootball');

-- Every 10 minutes: POST the ingest Edge Function with the service_role bearer.
select cron.schedule(
  'ingest-openfootball',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/ingest',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' ||
        (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
