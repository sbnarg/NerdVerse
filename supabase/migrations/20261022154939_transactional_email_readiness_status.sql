ALTER TABLE public.nv_phonepe_email_queue ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.nv_phonepe_email_queue ADD COLUMN IF NOT EXISTS provider_id text;
NOTIFY pgrst,'reload schema';
