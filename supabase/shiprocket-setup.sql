-- Shiprocket: backend-only quotes and durable paid-order export. No booking or wallet debit.
CREATE TABLE public.nv_shiprocket_quotes (
 quote_key text PRIMARY KEY CHECK(length(quote_key)=32), amount numeric(12,2) NOT NULL CHECK(amount>0),
 details jsonb NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE public.nv_shiprocket_orders (
 order_id uuid PRIMARY KEY REFERENCES public.orders(id), status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','created','needs_setup','needs_review','delivered')),
 shiprocket_order_id bigint UNIQUE, shipment_id bigint UNIQUE, last_error text, claimed_at timestamptz,
 next_check_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nv_shiprocket_work ON public.nv_shiprocket_orders(status,next_check_at);
ALTER TABLE public.nv_shiprocket_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nv_shiprocket_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nv_shiprocket_quotes,public.nv_shiprocket_orders FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.nv_shiprocket_quotes,public.nv_shiprocket_orders TO service_role;
ALTER TABLE public.nv_phonepe_sessions ADD COLUMN shipping_details jsonb;
CREATE OR REPLACE FUNCTION public.nv_shiprocket_cart(p_items jsonb,p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE i record; p record; subtotal numeric:=0; shipping numeric; snapshot jsonb:='[]'; packages jsonb; qkey text;
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
 SELECT jsonb_agg(jsonb_build_object('id',pr.id,'weight_grams',pr.weight_grams,'length_cm',pr.length_cm,'width_cm',pr.width_cm,'height_cm',pr.height_cm,'status',pr.status,'stock',pr.stock) ORDER BY pr.id) INTO packages FROM public.products pr WHERE pr.id IN (SELECT (x->>'product_id')::uuid FROM jsonb_array_elements(p_items) x);
 qkey:=md5(snapshot::text||p_pin||(SELECT jsonb_agg(x-'stock'-'status')::text FROM jsonb_array_elements(packages) x));
 RETURN jsonb_build_object('subtotal',subtotal,'items',snapshot,'products',packages,'quote_key',qkey);
END; $$;

CREATE OR REPLACE FUNCTION public.nv_phonepe_quote(p_items jsonb,p_pin text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c jsonb; q public.nv_shiprocket_quotes; shipping numeric;
BEGIN
 c:=public.nv_shiprocket_cart(p_items,p_pin);
 SELECT * INTO q FROM public.nv_shiprocket_quotes WHERE quote_key=c->>'quote_key' AND expires_at>now();
 IF (c->>'subtotal')::numeric>2999 THEN shipping:=0;
 ELSE
  shipping:=q.amount;
  IF shipping IS NULL THEN RAISE EXCEPTION 'Please refresh the delivery quote before paying'; END IF;
 END IF;
 RETURN jsonb_build_object('subtotal',c->'subtotal','items',c->'items','shipping',shipping,'total',(c->>'subtotal')::numeric+shipping,'shipping_details',q.details);
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
 INSERT INTO public.nv_phonepe_sessions(user_id,request_key,fingerprint,environment,merchant_order_id,order_id,customer,items,subtotal,shipping,total,reserved,shipping_details)
 VALUES(p_user,p_request_key,fp,p_environment,mid,oid,p_customer,q->'items',(q->>'subtotal')::numeric,(q->>'shipping')::numeric,(q->>'total')::numeric,p_environment='production',q->'shipping_details') RETURNING * INTO s;
 RETURN to_jsonb(s);
END; $$;

CREATE OR REPLACE FUNCTION public.nv_shiprocket_enqueue() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.environment='production' AND NEW.state='COMPLETED' THEN
  INSERT INTO public.nv_shiprocket_orders(order_id) VALUES(NEW.order_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER nv_shiprocket_paid AFTER UPDATE OF state ON public.nv_phonepe_sessions FOR EACH ROW WHEN(NEW.state='COMPLETED' AND OLD.state IS DISTINCT FROM NEW.state) EXECUTE FUNCTION public.nv_shiprocket_enqueue();
CREATE OR REPLACE FUNCTION public.nv_shiprocket_claim() RETURNS SETOF public.nv_shiprocket_orders
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 UPDATE public.nv_shiprocket_orders SET status='needs_review',last_error='Previous export interrupted; check Shiprocket before retrying.' WHERE status='processing' AND claimed_at<now()-interval '10 minutes';
 RETURN QUERY UPDATE public.nv_shiprocket_orders SET status='processing',claimed_at=now() WHERE order_id IN(SELECT order_id FROM public.nv_shiprocket_orders WHERE status='queued' ORDER BY created_at LIMIT 3 FOR UPDATE SKIP LOCKED) RETURNING *;
END; $$;
REVOKE ALL ON FUNCTION public.nv_shiprocket_cart(jsonb,text),public.nv_shiprocket_claim(),public.nv_shiprocket_enqueue() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nv_shiprocket_cart(jsonb,text),public.nv_shiprocket_claim(),public.nv_shiprocket_enqueue() TO service_role;
