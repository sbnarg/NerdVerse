-- NerdVerse India: checkout inventory RPCs for the audited LIVE schema.
-- REVIEW BEFORE RUNNING. Does not modify existing rows when installed.
-- Keep NERDVERSE_CHECKOUT_ENABLED unset/false until end-to-end testing.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_pending_order(
  p_items jsonb, p_name text, p_phone text, p_email text,
  p_address text, p_city text, p_pin text
) RETURNS TABLE(order_id uuid, order_no text, total_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_order uuid;
  v_number text;
  v_total numeric := 0;
  v_item record;
  v_product record;
  v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF lower(trim(coalesce(p_email,''))) IS DISTINCT FROM lower(coalesce(auth.jwt()->>'email',''))
  THEN RAISE EXCEPTION 'Checkout email must match signed-in account'; END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 30
  THEN RAISE EXCEPTION 'Cart must contain 1 to 30 products'; END IF;
  IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 150
     OR length(trim(coalesce(p_email,''))) NOT BETWEEN 3 AND 254
     OR length(trim(coalesce(p_address,''))) NOT BETWEEN 5 AND 1000
     OR length(trim(coalesce(p_city,''))) NOT BETWEEN 1 AND 150
     OR p_pin !~ '^[0-9]{6}$'
  THEN RAISE EXCEPTION 'Valid delivery details required'; END IF;

  -- Reject duplicate products, invalid UUIDs and non-positive quantities.
  SELECT count(*) INTO v_count FROM (
    SELECT (x->>'product_id')::uuid AS id,
           (x->>'quantity')::integer AS qty
    FROM jsonb_array_elements(p_items) x
  ) cart;
  IF v_count <> (
    SELECT count(DISTINCT (x->>'product_id')::uuid)
    FROM jsonb_array_elements(p_items) x
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) x
    WHERE (x->>'quantity')::integer NOT BETWEEN 1 AND 20
  ) THEN RAISE EXCEPTION 'Invalid or duplicate cart items'; END IF;

  -- Lock product rows in stable order to prevent overselling/deadlocks.
  FOR v_item IN
    SELECT (x->>'product_id')::uuid AS id,
           (x->>'quantity')::integer AS qty
    FROM jsonb_array_elements(p_items) x
    ORDER BY 1
  LOOP
    SELECT id,name,sku,price,stock,status INTO v_product
    FROM public.products WHERE id=v_item.id FOR UPDATE;
    IF NOT FOUND OR v_product.status <> 'active'
       OR v_product.price <= 0 OR v_product.stock < v_item.qty
    THEN RAISE EXCEPTION 'Product unavailable or insufficient stock'; END IF;
    v_total := v_total + v_product.price*v_item.qty;
  END LOOP;

  INSERT INTO public.customers(id,email,name,phone)
  VALUES (v_user,p_email,p_name,p_phone)
  ON CONFLICT (id) DO NOTHING;

  v_number := 'NV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  INSERT INTO public.orders (
    customer_id,customer_name,customer_email,customer_phone,
    order_number,shipping_address,subtotal,total,status,payment_status,payment_method
  ) VALUES (
    v_user,p_name,p_email,p_phone,v_number,
    jsonb_build_object('address',p_address,'city',p_city,'pin',p_pin),
    v_total,v_total,'pending','pending','razorpay'
  ) RETURNING id INTO v_order;

  FOR v_item IN
    SELECT (x->>'product_id')::uuid AS id,
           (x->>'quantity')::integer AS qty
    FROM jsonb_array_elements(p_items) x ORDER BY 1
  LOOP
    SELECT id,name,sku,price,stock INTO v_product
    FROM public.products WHERE id=v_item.id FOR UPDATE;
    INSERT INTO public.order_items(
      order_id,product_id,product_name,product_sku,quantity,unit_price,total_price
    ) VALUES (
      v_order,v_product.id,v_product.name,v_product.sku,
      v_item.qty,v_product.price,v_product.price*v_item.qty
    );
    UPDATE public.products
    SET stock=stock-v_item.qty,
        status=CASE WHEN stock=v_item.qty THEN 'sold_out' ELSE status END,
        updated_at=now()
    WHERE id=v_item.id;
  END LOOP;
  RETURN QUERY SELECT v_order,v_number,v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_inventory(p_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_order record; v_item record;
BEGIN
  -- This function is service-role only; lock order to make retries idempotent.
  SELECT id,status,payment_status INTO v_order
  FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status='cancelled' THEN RETURN false; END IF;
  IF v_order.status<>'pending' OR v_order.payment_status<>'pending'
  THEN RAISE EXCEPTION 'Only unpaid pending orders can release inventory'; END IF;
  FOR v_item IN
    SELECT product_id,sum(quantity)::integer qty
    FROM public.order_items WHERE order_id=p_order_id AND product_id IS NOT NULL
    GROUP BY product_id ORDER BY product_id
  LOOP
    UPDATE public.products SET
      stock=stock+v_item.qty,
      status=CASE WHEN status='sold_out' THEN 'active' ELSE status END,
      updated_at=now()
    WHERE id=v_item.product_id;
  END LOOP;
  UPDATE public.orders SET status='cancelled',updated_at=now()
  WHERE id=p_order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_order(jsonb,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pending_order(jsonb,text,text,text,text,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.release_order_inventory(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_inventory(uuid) TO service_role;
COMMIT;
