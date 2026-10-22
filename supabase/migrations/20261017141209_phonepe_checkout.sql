-- PhonePe service-only checkout. Sandbox never creates customer orders or reserves stock.
CREATE TABLE IF NOT EXISTS public.nv_phonepe_config (
 environment text PRIMARY KEY CHECK(environment IN ('sandbox','production')),
 enabled boolean NOT NULL DEFAULT false,
 credentials_secret_id uuid,
 webhook_secret_id uuid,
 worker_secret_id uuid
);
INSERT INTO public.nv_phonepe_config(environment) VALUES ('sandbox'),('production') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.nv_shipping_rates (
 pin_prefix text PRIMARY KEY CHECK(pin_prefix ~ '^[1-9][0-9]{0,5}$'),
 amount numeric(12,2) NOT NULL CHECK(amount>=0), active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.nv_phonepe_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 request_key uuid NOT NULL, fingerprint text NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','production')),
 merchant_order_id text NOT NULL UNIQUE,
 provider_order_id text, redirect_url text,
 order_id uuid REFERENCES public.orders(id),
 customer jsonb NOT NULL, items jsonb NOT NULL,
 subtotal numeric(12,2) NOT NULL CHECK(subtotal>0),
 shipping numeric(12,2) NOT NULL CHECK(shipping>=0),
 total numeric(12,2) NOT NULL CHECK(total>0),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','COMPLETED','FAILED')),
 reserved boolean NOT NULL DEFAULT false,
 initiation_claimed_at timestamptz,
 checked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,environment,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS nv_phonepe_provider_unique ON public.nv_phonepe_sessions(environment,provider_order_id) WHERE provider_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS nv_phonepe_pending ON public.nv_phonepe_sessions(checked_at,created_at) WHERE state='PENDING';
CREATE INDEX IF NOT EXISTS nv_phonepe_user ON public.nv_phonepe_sessions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.nv_phonepe_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES public.nv_phonepe_sessions(id),
 event text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,event)
);
CREATE TABLE IF NOT EXISTS public.nv_phonepe_email_queue (
 session_id uuid PRIMARY KEY REFERENCES public.nv_phonepe_sessions(id),
 sent_at timestamptz, attempts integer NOT NULL DEFAULT 0
);
ALTER TABLE public.nv_phonepe_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nv_shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nv_phonepe_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nv_phonepe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nv_phonepe_email_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nv_phonepe_config,public.nv_shipping_rates,public.nv_phonepe_sessions,public.nv_phonepe_events,public.nv_phonepe_email_queue FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.nv_phonepe_config,public.nv_shipping_rates,public.nv_phonepe_sessions,public.nv_phonepe_events,public.nv_phonepe_email_queue TO service_role;

CREATE OR REPLACE FUNCTION public.nv_phonepe_runtime(p_environment text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',c.enabled,'credentials',v.decrypted_secret::jsonb,
 'webhook',w.decrypted_secret::jsonb,'worker',k.decrypted_secret)
 FROM public.nv_phonepe_config c
 LEFT JOIN vault.decrypted_secrets v ON v.id=c.credentials_secret_id
 LEFT JOIN vault.decrypted_secrets w ON w.id=c.webhook_secret_id
 LEFT JOIN vault.decrypted_secrets k ON k.id=c.worker_secret_id
 WHERE c.environment=p_environment;
$$;

CREATE OR REPLACE FUNCTION public.nv_phonepe_quote(p_items jsonb,p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i record; p record; subtotal numeric:=0; shipping numeric; snapshot jsonb:='[]';
BEGIN
 IF p_pin IS NULL OR p_pin !~ '^[1-9][0-9]{5}$' THEN RAISE EXCEPTION 'A valid six-digit PIN code is required'; END IF;
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Cart must contain 1 to 30 products'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) x WHERE coalesce(x->>'product_id','') !~ '^[0-9a-fA-F-]{36}$' OR coalesce(x->>'quantity','') !~ '^([1-9]|1[0-9]|20)$') THEN RAISE EXCEPTION 'Invalid cart item'; END IF;
 IF (SELECT count(DISTINCT (x->>'product_id')::uuid) FROM jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Duplicate cart product'; END IF;
 FOR i IN SELECT (x->>'product_id')::uuid id,(x->>'quantity')::int qty FROM jsonb_array_elements(p_items) x ORDER BY 1 LOOP
  SELECT id,name,sku,price,stock,status INTO p FROM public.products WHERE id=i.id;
  IF NOT FOUND OR p.status<>'active' OR p.price<=0 OR p.stock<i.qty THEN RAISE EXCEPTION 'A product is unavailable or has insufficient stock'; END IF;
  subtotal:=subtotal+p.price*i.qty;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'sku',p.sku,'quantity',i.qty,'price',p.price));
 END LOOP;
 IF subtotal<>round(subtotal,2) OR subtotal<1 THEN RAISE EXCEPTION 'Invalid product pricing'; END IF;
 IF subtotal>2999 THEN shipping:=0;
 ELSE SELECT r.amount INTO shipping FROM public.nv_shipping_rates r WHERE r.active AND p_pin LIKE r.pin_prefix||'%' ORDER BY length(r.pin_prefix) DESC LIMIT 1;
 END IF;
 IF shipping IS NULL THEN RAISE EXCEPTION 'Shipping quote is not available for this PIN code yet'; END IF;
 RETURN jsonb_build_object('subtotal',subtotal,'shipping',shipping,'total',subtotal+shipping,'items',snapshot);
END; $$;

CREATE OR REPLACE FUNCTION public.nv_phonepe_reserve(p_user uuid,p_environment text,p_request_key uuid,p_items jsonb,p_customer jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.nv_phonepe_sessions; q jsonb; fp text; oid uuid; mid text; i record; email text;
BEGIN
 IF p_user IS NULL OR p_request_key IS NULL OR p_environment NOT IN ('sandbox','production') THEN RAISE EXCEPTION 'Invalid checkout request'; END IF;
 -- Serialize retries and outstanding-checkout limits for each user.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 -- Identity and confirmed email are verified by the Edge Function before this service-only RPC.
 email:=p_customer->>'email';
 IF email IS NULL OR length(email) NOT BETWEEN 3 AND 254 OR position('@' in email)<2 THEN RAISE EXCEPTION 'A verified account email is required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nv_phonepe_config c WHERE c.environment=p_environment AND c.enabled AND c.credentials_secret_id IS NOT NULL) THEN RAISE EXCEPTION 'Checkout is not activated'; END IF;
 IF p_environment='sandbox' AND NOT EXISTS(SELECT 1 FROM public.admin_users a WHERE a.id=p_user AND a.role='admin') THEN RAISE EXCEPTION 'Sandbox is restricted to store administrators'; END IF;
 IF coalesce(length(trim(p_customer->>'name')),0) NOT BETWEEN 1 AND 150 OR coalesce(p_customer->>'phone','') !~ '^[6-9][0-9]{9}$' OR coalesce(length(trim(p_customer->>'address')),0) NOT BETWEEN 5 AND 1000 OR coalesce(length(trim(p_customer->>'city')),0) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Valid name, Indian mobile number and delivery address are required'; END IF;
 p_customer:=p_customer||jsonb_build_object('email',email);
 fp:=md5(p_items::text||p_customer::text);
 SELECT * INTO s FROM public.nv_phonepe_sessions WHERE user_id=p_user AND environment=p_environment AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
  IF s.fingerprint<>fp THEN RAISE EXCEPTION 'Checkout request changed; start a new checkout'; END IF;
  RETURN to_jsonb(s);
 END IF;
 IF (SELECT count(*) FROM public.nv_phonepe_sessions WHERE user_id=p_user AND state='PENDING' AND created_at>now()-interval '1 hour')>=3 THEN RAISE EXCEPTION 'Please resolve an existing payment before starting another'; END IF;
 -- Stable product locks make price validation and reservation atomic.
 FOR i IN SELECT (x->>'product_id')::uuid id FROM jsonb_array_elements(p_items) x ORDER BY 1 LOOP
  PERFORM 1 FROM public.products WHERE id=i.id FOR UPDATE;
 END LOOP;
 q:=public.nv_phonepe_quote(p_items,p_customer->>'pin');
 mid:='NV-'||replace(gen_random_uuid()::text,'-','');
 IF p_environment='production' THEN
  INSERT INTO public.customers(id,name,email,phone) VALUES(p_user,p_customer->>'name',email,p_customer->>'phone') ON CONFLICT(id) DO NOTHING;
  INSERT INTO public.orders(order_number,customer_id,customer_name,customer_email,customer_phone,shipping_address,subtotal,shipping_amount,total,payment_method)
  VALUES(mid,p_user,p_customer->>'name',email,p_customer->>'phone',jsonb_build_object('address',p_customer->>'address','city',p_customer->>'city','pin',p_customer->>'pin'),(q->>'subtotal')::numeric,(q->>'shipping')::numeric,(q->>'total')::numeric,'phonepe') RETURNING id INTO oid;
  FOR i IN SELECT * FROM jsonb_to_recordset(q->'items') AS x(product_id uuid,name text,sku text,quantity int,price numeric) ORDER BY product_id LOOP
   INSERT INTO public.order_items(order_id,product_id,product_name,product_sku,quantity,unit_price,total_price) VALUES(oid,i.product_id,i.name,i.sku,i.quantity,i.price,i.quantity*i.price);
   UPDATE public.products SET stock=stock-i.quantity,status=CASE WHEN stock=i.quantity THEN 'sold_out' ELSE status END,updated_at=now() WHERE id=i.product_id;
  END LOOP;
 END IF;
 INSERT INTO public.nv_phonepe_sessions(user_id,request_key,fingerprint,environment,merchant_order_id,order_id,customer,items,subtotal,shipping,total,reserved)
 VALUES(p_user,p_request_key,fp,p_environment,mid,oid,p_customer,q->'items',(q->>'subtotal')::numeric,(q->>'shipping')::numeric,(q->>'total')::numeric,p_environment='production') RETURNING * INTO s;
 RETURN to_jsonb(s);
END; $$;

CREATE OR REPLACE FUNCTION public.nv_phonepe_apply_status(p_session uuid,p_provider_order text,p_state text,p_amount bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.nv_phonepe_sessions; i record;
BEGIN
 SELECT * INTO s FROM public.nv_phonepe_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payment session not found'; END IF;
 IF coalesce(p_provider_order,'')='' OR (s.provider_order_id IS NOT NULL AND s.provider_order_id<>p_provider_order) OR p_amount IS NULL OR p_amount<>round(s.total*100) OR p_state NOT IN ('PENDING','COMPLETED','FAILED') OR p_state IS NULL THEN RAISE EXCEPTION 'Provider order, amount or status mismatch'; END IF;
 IF s.state IN ('COMPLETED','FAILED') THEN
  IF s.state<>p_state THEN RAISE EXCEPTION 'Conflicting terminal payment status requires manual reconciliation'; END IF;
  RETURN to_jsonb(s);
 END IF;
 IF s.environment='production' THEN
  PERFORM 1 FROM public.orders WHERE id=s.order_id FOR UPDATE;
  IF p_state='COMPLETED' THEN
   IF NOT s.reserved THEN RAISE EXCEPTION 'Inventory reservation missing'; END IF;
   UPDATE public.orders SET payment_status='paid',status='confirmed',updated_at=now() WHERE id=s.order_id AND status='pending' AND payment_status='pending';
   IF NOT FOUND THEN RAISE EXCEPTION 'Order status conflict requires reconciliation'; END IF;
   INSERT INTO public.nv_phonepe_email_queue(session_id) VALUES(s.id) ON CONFLICT DO NOTHING;
  ELSIF p_state='FAILED' THEN
   IF s.reserved THEN
    IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=s.order_id AND status='pending' AND payment_status='pending') THEN RAISE EXCEPTION 'Order status conflict requires reconciliation'; END IF;
    FOR i IN SELECT (x->>'product_id')::uuid product_id,(x->>'quantity')::int quantity FROM jsonb_array_elements(s.items) x ORDER BY 1 LOOP
     UPDATE public.products SET stock=stock+i.quantity,status=CASE WHEN status='sold_out' THEN 'active' ELSE status END,updated_at=now() WHERE id=i.product_id;
    END LOOP;
   END IF;
   UPDATE public.orders SET payment_status='failed',status='cancelled',updated_at=now() WHERE id=s.order_id;
  END IF;
 END IF;
 UPDATE public.nv_phonepe_sessions SET provider_order_id=p_provider_order,state=p_state,reserved=CASE WHEN p_state='FAILED' THEN false ELSE reserved END,checked_at=now(),updated_at=now() WHERE id=s.id RETURNING * INTO s;
 IF p_state<>'PENDING' THEN INSERT INTO public.nv_phonepe_events(session_id,event) VALUES(s.id,p_state) ON CONFLICT DO NOTHING; END IF;
 RETURN to_jsonb(s);
END; $$;

REVOKE ALL ON FUNCTION public.nv_phonepe_runtime(text),public.nv_phonepe_quote(jsonb,text),public.nv_phonepe_reserve(uuid,text,uuid,jsonb,jsonb),public.nv_phonepe_apply_status(uuid,text,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nv_phonepe_runtime(text),public.nv_phonepe_quote(jsonb,text),public.nv_phonepe_reserve(uuid,text,uuid,jsonb,jsonb),public.nv_phonepe_apply_status(uuid,text,text,bigint) TO service_role;
NOTIFY pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.nv_phonepe_attach(p_session uuid,p_provider_order text,p_redirect text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.nv_phonepe_sessions;
BEGIN
 SELECT * INTO s FROM public.nv_phonepe_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.initiation_claimed_at IS NULL OR coalesce(p_provider_order,'')='' OR (s.provider_order_id IS NOT NULL AND s.provider_order_id<>p_provider_order) THEN RAISE EXCEPTION 'Payment initiation conflict'; END IF;
 IF s.state<>'PENDING' THEN RETURN to_jsonb(s); END IF;
 UPDATE public.nv_phonepe_sessions SET provider_order_id=p_provider_order,redirect_url=p_redirect,updated_at=now() WHERE id=p_session RETURNING * INTO s;
 RETURN to_jsonb(s);
END; $$;

CREATE OR REPLACE FUNCTION public.nv_phonepe_cancel_unstarted(p_session uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.nv_phonepe_sessions; i record;
BEGIN
 SELECT * INTO s FROM public.nv_phonepe_sessions WHERE id=p_session FOR UPDATE;
 -- A provider request can only start after claiming this same row. Never expire an uncertain request locally.
 IF NOT FOUND OR s.state<>'PENDING' OR s.initiation_claimed_at IS NOT NULL OR s.created_at>now()-interval '10 minutes' THEN RETURN false; END IF;
 IF s.reserved AND s.environment='production' THEN
  PERFORM 1 FROM public.orders WHERE id=s.order_id AND status='pending' AND payment_status='pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order status conflict requires reconciliation'; END IF;
  FOR i IN SELECT (x->>'product_id')::uuid product_id,(x->>'quantity')::int quantity FROM jsonb_array_elements(s.items) x ORDER BY 1 LOOP
   UPDATE public.products SET stock=stock+i.quantity,status=CASE WHEN status='sold_out' THEN 'active' ELSE status END,updated_at=now() WHERE id=i.product_id;
  END LOOP;
  UPDATE public.orders SET status='cancelled',payment_status='failed',updated_at=now() WHERE id=s.order_id;
 END IF;
 UPDATE public.nv_phonepe_sessions SET state='FAILED',reserved=false,checked_at=now(),updated_at=now() WHERE id=s.id;
 INSERT INTO public.nv_phonepe_events(session_id,event) VALUES(s.id,'CANCELLED_BEFORE_INITIATION') ON CONFLICT DO NOTHING;
 RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.nv_phonepe_attach(uuid,text,text),public.nv_phonepe_cancel_unstarted(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nv_phonepe_attach(uuid,text,text),public.nv_phonepe_cancel_unstarted(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
