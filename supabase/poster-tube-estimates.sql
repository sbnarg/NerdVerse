-- Owner-authorised ESTIMATES for rolled A3 posters in cardboard tubes, 22 October 2026.
-- Not measured values: verify a packed unit before dispatch. Do not overwrite later measurements.
UPDATE public.products p SET weight_grams=500,length_cm=45,width_cm=8,height_cm=8,updated_at=now()
FROM public.categories c WHERE p.category_id=c.id AND c.name='Posters & Art Prints'
AND p.weight_grams IS NULL AND p.length_cm IS NULL AND p.width_cm IS NULL AND p.height_cm IS NULL;
