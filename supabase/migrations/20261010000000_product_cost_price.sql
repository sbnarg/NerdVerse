-- Private acquisition cost per unit; NULL means not yet recorded.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cost_price_nonnegative;
ALTER TABLE public.products ADD CONSTRAINT products_cost_price_nonnegative CHECK (cost_price IS NULL OR cost_price >= 0);
COMMENT ON COLUMN public.products.cost_price IS 'Private acquisition cost per unit in INR, not displayed to shoppers';
