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
    assert.doesNotMatch(html, /renderGrid\([^;]*\bCATALOG\.filter\(/, 'Never render legacy stock');
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

test('cart handles invalid stored data and renders untrusted names as text',()=>{const app=fs.readFileSync('script.js','utf8');assert.match(app,/function readCart\(\)/);assert.match(app,/catch\{return \[\]\}/);assert.match(app,/name\.textContent=x\.name/);assert.doesNotMatch(app,/onclick="removeFromCart/)});
test('product cards escape untrusted fields and avoid inline add-to-cart handlers',()=>{const app=fs.readFileSync('script.js','utf8');assert.match(app,/escapeCartText\(p\.name\)/);assert.match(app,/data-cart-id=/);assert.doesNotMatch(app,/onclick="addToCart/)});

test('legacy-stock guard distinguishes the live catalogue from the seed catalogue',()=>{
 const pattern=/renderGrid\([^;]*\bCATALOG\.filter\(/;
 assert.match("renderGrid('grid',CATALOG.filter(p=>p.stock))",pattern);
 assert.doesNotMatch("renderGrid('grid',ACTIVE_CATALOG.filter(p=>p.stock))",pattern);
});
test('product detail escapes hostile content and wires a working cart button',()=>{
 const vm=require('node:vm');let click,added;const id="toy'\"<id>";
 const button={dataset:{cartId:id},addEventListener:(event,fn)=>{assert.equal(event,'click');click=fn}};
 const mainPhoto={src:''};
 const thumbs=[0,1].map(index=>({dataset:{photoIndex:String(index)},style:{},attributes:{},addEventListener(event,fn){this.click=fn},setAttribute(name,value){this.attributes[name]=value}}));
 const arrows=[-1,1].map(step=>({dataset:{photoStep:String(step)},addEventListener(event,fn){this.click=fn}}));
 const el={innerHTML:'',querySelector:selector=>selector==='#nvMainProductPhoto'?mainPhoto:null,querySelectorAll:selector=>selector==='[data-cart-id]'?[button]:selector==='[data-photo-index]'?thumbs:selector==='[data-photo-step]'?arrows:[]};
 const appendedScripts=[];
 const document={addEventListener:()=>{},getElementById:()=>el,querySelector:()=>null,createElement:()=>({dataset:{}}),head:{append:node=>appendedScripts.push(node)}};
 const context={URL,URLSearchParams,location:{href:'https://nerdverseindia.com/product.html',search:'?id='+encodeURIComponent(id)},localStorage:{getItem:()=>null},document,window:{},ACTIVE_CATALOG:[{id,name:'<img src=x onerror=alert(1)>',brand:null,category:'<category>',price:199,stock_qty:1,status:'available',image:'javascript:alert(1)',images:['javascript:alert(1)','https://example.com/a.png?x=1&y=2'],condition:'<condition>',description:'<script>bad()</script>',tags:['<tag>'],details:['<detail>']} ]};
 vm.createContext(context);vm.runInContext(fs.readFileSync('script.js','utf8'),context);vm.runInContext('nvCatalogLoading=false',context);context.addToCart=value=>{added=value};context.renderProductPage();
 assert.equal(appendedScripts.length,1,'Profile script is still loaded');
 assert.match(appendedScripts[0].src,/^user-profile\.js/);
 assert.equal(mainPhoto.src,'','Unsafe initial photo URL is rejected');
 assert.equal(thumbs[0].attributes['aria-pressed'],'true');
 arrows[1].click();assert.equal(mainPhoto.src,'https://example.com/a.png?x=1&y=2');
 assert.equal(thumbs[1].attributes['aria-pressed'],'true');
 thumbs[0].click();assert.equal(mainPhoto.src,'');
 assert.match(el.innerHTML,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
 assert.match(el.innerHTML,/&lt;tag&gt;/);assert.match(el.innerHTML,/&lt;detail&gt;/);
 assert.doesNotMatch(el.innerHTML,/<script>|javascript:|onclick=|onerror="/);
 assert.match(el.innerHTML,/data-cart-id="toy&#39;&quot;&lt;id&gt;"/);
 assert.match(el.innerHTML,/x=1&amp;y=2/);click();assert.equal(added,id);
 assert.equal(context.productImageUrl('javascript:bad()'),'');
 assert.equal(context.productImageUrl('https://example.com/a?x=1&y=2'),'https://example.com/a?x=1&y=2');
});
