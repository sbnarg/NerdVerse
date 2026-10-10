// Regression guard: all storefront listing pages must use the hydrated Supabase catalogue.
// Run with: node --test tests/storefront-consistency.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const pages = ['index.html','shop.html','rare.html','action-figures.html','die-cast.html','vintage.html','pop-culture.html','categories.html','brands.html','product.html'];
for (const file of pages) {
  test(file + ' loads the same shared inventory scripts', () => {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /src="catalog\.js(?:\?[^"]*)?"/);
    assert.match(html, /src="script\.js(?:\?[^"]*)?"/);
    const cat = html.match(/src="catalog\.js([^"]*)"/);
    const app = html.match(/src="script\.js([^"]*)"/);
    assert.equal(cat[1], app[1], 'Catalogue and app must share cache version');
    assert.doesNotMatch(html, /renderGrid\([^;]*CATALOG\.filter\(/, 'Never render legacy stock');
  });
}
for (const file of ['index.html','rare.html','action-figures.html','die-cast.html','vintage.html','pop-culture.html']) {
  test(file + ' waits for live inventory', () => {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /nv:catalog-ready/, 'Render after live inventory hydration');
    assert.doesNotMatch(html, /DOMContentLoaded[^<]*renderGrid/, 'Do not render before hydration');
  });
}
test('stock source is Supabase, not browser-local legacy catalogue', () => {
  const catalog = fs.readFileSync('catalog.js', 'utf8');
  const app = fs.readFileSync('script.js', 'utf8');
  assert.match(catalog, /rest\/v1\//);
  assert.match(catalog, /stock_qty:Number\(p\.stock\)/);
  assert.match(catalog, /status:p\.status==='sold_out'\|\|Number\(p\.stock\)<=0\?'sold':'available'/);
  assert.match(app, /await hydrateCatalog\(\)/);
  assert.match(app, /new Event\('nv:catalog-ready'\)/);
  assert.match(app, /Number\(p\.stock_qty\|\|0\)<=0/);
});
for (const file of ['catalog.js','script.js','config.js']) {
  test(file + ' parses as JavaScript', () => {
    execFileSync(process.execPath, ['--check', file], {stdio:'pipe'});
  });
}
