// Preserve already-saved catalogue artwork without permitting new external URLs.
export function productImageUrls(value: unknown, existing: unknown, storageBase: string): string[] {
 if (!Array.isArray(value) || value.length > 12) throw Error('Invalid product images');
 const saved = new Set(Array.isArray(existing) ? existing.filter(x => typeof x === 'string') : []);
 const base = new URL(storageBase);
 for (const image of value) {
  if (typeof image !== 'string' || image.length > 1000) throw Error('Invalid product images');
  let parsed: URL;
  try { parsed = new URL(image); } catch { throw Error('Invalid product images'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw Error('Invalid product images');
  const uploaded = parsed.origin === base.origin && parsed.pathname.startsWith(base.pathname);
  if (!saved.has(image) && !uploaded) throw Error('Invalid product images');
 }
 return value;
}
