-- NerdVerse schema repair: preserve private purchase cost and seed missing collectible categories.
-- Apply once in Supabase SQL Editor or through the project's migration pipeline.
BEGIN;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2);
COMMENT ON COLUMN public.products.cost_price IS 'Private purchase cost per unit in INR. Never expose in public storefront APIs.';
REVOKE SELECT (cost_price) ON public.products FROM anon;
-- Categories: additive, never remove or rename existing entries.
WITH category_names(name) AS (
 VALUES ('Masters of the Universe'),('Transformers'),('Star Wars'),('Marvel'),('DC Comics'),
 ('G.I. Joe'),('Hot Wheels'),('Matchbox'),('Tomica'),('MINI GT'),('Majorette'),
 ('LEGO'),('Funko Pop!'),('McFarlane Toys'),('NECA'),('Hasbro'),('Mattel'),
 ('Bandai'),('Banpresto'),('S.H. Figuarts'),('Nendoroid'),('Anime & Manga'),
 ('Video Game Collectibles'),('WWE & Wrestling'),('TMNT'),('Power Rangers'),
 ('Jurassic Park & Dinosaurs'),('Pokémon'),('Disney & Pixar'),('Harry Potter'),
 ('Lord of the Rings'),('Military & Vehicles'),('1:6 Scale Figures'),
 ('Statues & Busts'),('Model Kits'),('Scale Models'),('Die-Cast Cars'),
 ('Die-Cast Bikes'),('Premium Die-Cast'),('Vintage Toys'),('Retro Gaming'),
 ('Trading Cards'),('Comic Books'),('Posters & Art Prints'),('Board Games & Puzzles'),
 ('Plush Toys'),('Apparels'),('Keychains'),('Caps & Headgear'),('Accessories'),
 ('Display Cases & Protectors'),('Other Collectibles')
)
INSERT INTO public.categories(name,slug)
SELECT n.name,lower(regexp_replace(n.name,'[^a-zA-Z0-9]+','-','g'))
FROM category_names n
WHERE NOT EXISTS (SELECT 1 FROM public.categories c WHERE lower(c.name)=lower(n.name))
AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.slug=lower(regexp_replace(n.name,'[^a-zA-Z0-9]+','-','g')))
ON CONFLICT DO NOTHING;
COMMIT;
