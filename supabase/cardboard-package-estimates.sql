-- Seller authorised estimated packed-unit values, 22 Oct 2026.
-- Includes retail packaging, protective wrap and an outer cardboard box.
-- Estimates only: verify a packed sample before dispatch.
WITH estimates AS (
 SELECT id,
 CASE WHEN name ILIKE '%Keychain%' THEN 120
 WHEN name ILIKE 'Hot Wheels%' THEN 250
 WHEN name ILIKE '%Social Clash%' THEN 650
 WHEN name ILIKE '%Ram Man%' THEN 900
 WHEN name ILIKE 'Masters of the Universe%' THEN 700
 WHEN name ILIKE '%Storm Shadow%' THEN 450
 WHEN name ILIKE '%G.I. Joe%' THEN 400 END AS grams,
 CASE WHEN name ILIKE '%Keychain%' THEN 15 WHEN name ILIKE 'Hot Wheels%' THEN 22
 WHEN name ILIKE '%Social Clash%' THEN 35 WHEN name ILIKE '%Ram Man%' THEN 38
 WHEN name ILIKE 'Masters of the Universe%' THEN 35 WHEN name ILIKE '%Storm Shadow%' THEN 32
 WHEN name ILIKE '%G.I. Joe%' THEN 30 END AS l,
 CASE WHEN name ILIKE '%Keychain%' THEN 12 WHEN name ILIKE 'Hot Wheels%' THEN 18
 WHEN name ILIKE '%Social Clash%' THEN 25 WHEN name ILIKE '%Ram Man%' THEN 28
 WHEN name ILIKE 'Masters of the Universe%' THEN 25 WHEN name ILIKE '%Storm Shadow%' THEN 24
 WHEN name ILIKE '%G.I. Joe%' THEN 22 END AS w,
 CASE WHEN name ILIKE '%Keychain%' THEN 5 WHEN name ILIKE 'Hot Wheels%' THEN 8
 WHEN name ILIKE '%Social Clash%' THEN 12 WHEN name ILIKE '%Ram Man%' THEN 16
 WHEN name ILIKE 'Masters of the Universe%' THEN 14 WHEN name ILIKE '%Storm Shadow%' THEN 12
 WHEN name ILIKE '%G.I. Joe%' THEN 10 END AS h
 FROM public.products WHERE status='active' AND weight_grams IS NULL
)
UPDATE public.products p SET weight_grams=e.grams,length_cm=coalesce(p.length_cm,e.l),
 width_cm=coalesce(p.width_cm,e.w),height_cm=coalesce(p.height_cm,e.h),updated_at=now()
FROM estimates e WHERE e.id=p.id AND e.grams IS NOT NULL AND p.weight_grams IS NULL
RETURNING p.name,p.weight_grams,p.length_cm,p.width_cm,p.height_cm;