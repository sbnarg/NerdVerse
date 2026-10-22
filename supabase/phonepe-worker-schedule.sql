-- Apply only with the reviewed PhonePe migration and runtime Vault configuration.
-- A worker secret is distinct from PhonePe credentials. It must be a random encrypted Vault secret.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SELECT cron.schedule('nv-phonepe-reconcile','* * * * *',$job$
 SELECT net.http_post(
  url:='https://hzzuqylaypoylakgnqxs.supabase.co/functions/v1/phonepe-checkout',
  headers:=jsonb_build_object('Content-Type','application/json','x-nv-worker',v.decrypted_secret),
  body:=jsonb_build_object('action','worker','environment',c.environment),timeout_milliseconds:=60000
 )
 FROM public.nv_phonepe_config c JOIN vault.decrypted_secrets v ON v.id=c.worker_secret_id
 WHERE c.credentials_secret_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.nv_phonepe_sessions s WHERE s.environment=c.environment AND s.state='PENDING')
 UNION ALL
 SELECT net.http_post(
  url:='https://hzzuqylaypoylakgnqxs.supabase.co/functions/v1/phonepe-checkout',
  headers:=jsonb_build_object('Content-Type','application/json','x-nv-worker',v.decrypted_secret),
  body:=jsonb_build_object('action','worker','environment','production'),timeout_milliseconds:=60000
 )
 FROM public.nv_phonepe_config c JOIN vault.decrypted_secrets v ON v.id=c.worker_secret_id
 WHERE c.environment='production' AND NOT EXISTS(SELECT 1 FROM public.nv_phonepe_sessions s WHERE s.environment=c.environment AND s.state='PENDING') AND (EXISTS(SELECT 1 FROM public.nv_phonepe_email_queue q WHERE q.sent_at IS NULL AND q.attempts<10) OR EXISTS(SELECT 1 FROM public.nv_shiprocket_orders q WHERE q.status='queued' OR (q.status='created' AND q.next_check_at<=now()) OR (q.status='processing' AND q.claimed_at<now()-interval '10 minutes')));
$job$);
