ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_status text CHECK(delivery_status IN ('shipped','out_for_delivery','delivered'));
CREATE TABLE IF NOT EXISTS public.nv_delivery_email_queue(
 order_id uuid NOT NULL REFERENCES public.orders(id), stage text NOT NULL CHECK(stage IN ('shipped','out_for_delivery','delivered')),
 created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,provider_id text,attempts integer NOT NULL DEFAULT 0,last_error text,
 PRIMARY KEY(order_id,stage)
);
ALTER TABLE public.nv_delivery_email_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nv_delivery_email_queue FROM anon,authenticated;
GRANT ALL ON public.nv_delivery_email_queue TO service_role;
CREATE OR REPLACE FUNCTION public.nv_queue_delivery_email() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE stage text;
BEGIN
 IF NEW.payment_status<>'paid' OR NEW.status IN('cancelled','refunded') THEN RETURN NEW; END IF;
 stage:=CASE WHEN NEW.status='delivered' THEN 'delivered' WHEN NEW.delivery_status='out_for_delivery' AND NEW.status='shipped' THEN 'out_for_delivery' WHEN NEW.status='shipped' THEN 'shipped' END;
 IF stage IS NOT NULL AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.delivery_status IS DISTINCT FROM NEW.delivery_status) THEN
 INSERT INTO public.nv_delivery_email_queue(order_id,stage) VALUES(NEW.id,stage) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.nv_queue_delivery_email() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS nv_order_delivery_email ON public.orders;
CREATE TRIGGER nv_order_delivery_email AFTER UPDATE OF status,delivery_status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.nv_queue_delivery_email();
