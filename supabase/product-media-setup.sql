-- Run once in Supabase SQL Editor before deploying the new admin API.
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_urls jsonb NOT NULL DEFAULT '[]'::jsonb;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('product-media','product-media',true,5242880,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true,file_size_limit=5242880,allowed_mime_types=ARRAY['image/jpeg','image/png','image/webp'];
-- Uploads are signed server-side after admin verification. Public read is provided by bucket visibility.

-- Public storefront can read published products, never drafts.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "NerdVerse public published products" ON public.products;
CREATE POLICY "NerdVerse public published products" ON public.products FOR SELECT TO anon, authenticated USING (status = 'published');
