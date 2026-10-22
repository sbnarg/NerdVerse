-- Preserve RLS decisions while caching request-wide auth checks and consolidating policies.
SET lock_timeout = '5s';
CREATE SCHEMA IF NOT EXISTS nv_private;
REVOKE ALL ON SCHEMA nv_private FROM PUBLIC;
GRANT USAGE ON SCHEMA nv_private TO anon, authenticated, service_role;
DO $$ BEGIN
 IF to_regprocedure('public.is_admin()') IS NOT NULL THEN
  ALTER FUNCTION public.is_admin() SET SCHEMA nv_private;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION nv_private.is_admin() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE id=(SELECT auth.uid()) AND role='admin');
$$;
REVOKE ALL ON FUNCTION nv_private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nv_private.is_admin() TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.handle_new_user() SET search_path='';
ALTER FUNCTION public.set_updated_at() SET search_path='';

-- A duplicate active-only policy is already covered by the active-or-admin policy.
DROP POLICY IF EXISTS "NerdVerse public published products" ON public.products;
DO $$
DECLARE t text; action text; p jsonb; saved jsonb; q text; c text; u text; w text;
BEGIN
 FOR t IN SELECT DISTINCT tablename FROM pg_policies WHERE schemaname='public' LOOP
  SELECT jsonb_agg(to_jsonb(x)) INTO saved FROM pg_policies x WHERE schemaname='public' AND tablename=t;
  -- The inspected policies use PUBLIC. Abort rather than silently broaden a future role-specific rule.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(saved) x WHERE x->'roles' <> '["public"]'::jsonb OR x->>'permissive'<>'PERMISSIVE') THEN
   RAISE EXCEPTION 'Unexpected policy scope on %',t;
  END IF;
  FOR p IN SELECT * FROM jsonb_array_elements(saved) LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p->>'policyname',t);
  END LOOP;
  FOREACH action IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
   q:=NULL; c:=NULL;
   FOR p IN SELECT * FROM jsonb_array_elements(saved) x WHERE x->>'cmd' IN ('ALL',action) LOOP
    u:=p->>'qual'; w:=coalesce(p->>'with_check',u);
    u:=replace(replace(u,'auth.uid()','(SELECT auth.uid())'),'nv_private.is_admin()','(SELECT nv_private.is_admin())');
    w:=replace(replace(w,'auth.uid()','(SELECT auth.uid())'),'nv_private.is_admin()','(SELECT nv_private.is_admin())');
    IF action<>'INSERT' THEN q:=concat_ws(' OR ',q,'('||coalesce(u,'true')||')'); END IF;
    IF action IN ('INSERT','UPDATE') THEN c:=concat_ws(' OR ',c,'('||coalesce(w,'true')||')'); END IF;
   END LOOP;
   IF q IS NOT NULL OR c IS NOT NULL THEN
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO PUBLIC%s%s',
     'nv_'||t||'_'||lower(action),t,action,
     CASE WHEN q IS NOT NULL THEN ' USING ('||q||')' ELSE '' END,
     CASE WHEN c IS NOT NULL THEN ' WITH CHECK ('||c||')' ELSE '' END);
   END IF;
  END LOOP;
 END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_cart_items_product_fk ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_carts_customer_fk ON public.carts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer_fk ON public.customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_phonepe_sessions_order_fk ON public.nv_phonepe_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_fk ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_fk ON public.product_reviews(customer_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_fk ON public.wishlists(product_id);

-- Cost is a seller-only field. Admin APIs use service_role, never these browser grants.
REVOKE SELECT ON public.products FROM PUBLIC,anon,authenticated;
DO $$ DECLARE cols text; BEGIN
 SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) INTO cols
 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name<>'cost_price';
 EXECUTE 'GRANT SELECT ('||cols||') ON public.products TO anon,authenticated';
END $$;
REVOKE SELECT(cost_price) ON public.products FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
