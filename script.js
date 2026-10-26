async function ensureCommerceClient(){if(window.supabase&&window.NV_CONFIG)return;await new Promise(resolve=>{if(window.NV_CONFIG)return resolve();const x=document.createElement('script');x.src='config.js';x.onload=resolve;x.onerror=resolve;document.head.appendChild(x)});if(window.NV_CONFIG&&window.NV_CONFIG.supabaseUrl&&!window.NV_CONFIG.supabaseUrl.includes('YOUR_PROJECT_REF')&&!window.supabase){await new Promise(resolve=>{const x=document.createElement('script');x.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';x.onload=resolve;x.onerror=resolve;document.head.appendChild(x)})}}
function readCart(){try{const stored=JSON.parse(localStorage.getItem('nv-cart')||'[]');if(!Array.isArray(stored))return [];return stored.filter(x=>x&&typeof x.id==='string'&&x.id.length<150&&Number.isSafeInteger(x.qty)&&x.qty>0&&x.qty<=99).slice(0,100)}catch{return []}}
let cart=readCart();
function escapeCartText(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const cfg={instagram:'https://www.instagram.com/nerdverseindia/'};
function money(n){return n==null?'Price on request':'₹'+Number(n).toLocaleString('en-IN')}
function saveCart(){localStorage.setItem('nv-cart',JSON.stringify(cart));renderCart()}
let nvCartSignedIn=false;
let nvCartAuthReady=null;
let nvCatalogLoading=true;
function syncCartButtons(){document.querySelectorAll('[data-cart-id]').forEach(button=>{button.textContent=nvCartSignedIn?'ADD TO CART':'SIGN IN TO ADD';});const add=document.getElementById('nvAddProduct'),buy=document.getElementById('nvBuyProduct');if(add)add.textContent=nvCartSignedIn?'Add to cart':'Sign in to add';if(buy)buy.textContent=nvCartSignedIn?'Buy it now ↗':'Sign in to buy';}
function cartAuth(){
 if(!nvCartAuthReady)nvCartAuthReady=(async()=>{
  await ensureCommerceClient();
  if(!window.NV_AUTH)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='auth.js';script.onload=resolve;script.onerror=()=>reject(new Error('Sign-in service unavailable'));document.head.append(script)});
  if(!window.NV_AUTH?.client)throw new Error('Sign-in service unavailable');
  const auth=window.NV_AUTH.client.auth;
  auth.onAuthStateChange((_event,session)=>{nvCartSignedIn=!!session?.user;syncCartButtons()});
  const {data,error}=await auth.getUser();
  nvCartSignedIn=!error&&!!data?.user;syncCartButtons();
  return auth;
 })().catch(error=>{nvCartAuthReady=null;throw error});
 return nvCartAuthReady;
}
async function requireCartSignIn(){
 try{
  const auth=await cartAuth();
  const {data,error}=await auth.getUser();
  nvCartSignedIn=!error&&!!data?.user;syncCartButtons();
  if(nvCartSignedIn)return true;
  if(error&&error.name!=='AuthSessionMissingError')throw error;
  location.assign('account.html');return false;
 }catch(error){alert('Sign-in could not be checked. Please try again before adding an item.');return false;}
}
async function addToCart(id){
 if(!await requireCartSignIn())return false;
 const p=ACTIVE_CATALOG.find(x=>x.id===id);if(!p||p.status==='sold'||p.price==null||Number(p.stock_qty||0)<=0){return}const found=cart.find(x=>x.id===id);if(found){if(found.qty>=Math.min(20,Number(p.stock_qty))){alert('Maximum '+Math.min(20,Number(p.stock_qty))+' unit(s) can be added.');return}found.qty++}else cart.push({...p,qty:1});saveCart();openCart();return true
}
function removeFromCart(id){cart=cart.filter(x=>x.id!==id);saveCart()}
function renderCart(){const count=cart.reduce((a,x)=>a+x.qty,0),total=cart.reduce((a,x)=>a+Math.max(0,Number(x.price)||0)*x.qty,0);const c=document.getElementById('cartCount'),t=document.getElementById('cartTotal'),items=document.getElementById('cartItems');if(c)c.textContent=count;if(t)t.textContent=money(total);if(items){items.replaceChildren();if(!cart.length){const empty=document.createElement('p');empty.style.color='#777';empty.textContent='Your cart is empty. The hunt continues.';items.append(empty)}else for(const x of cart){const line=document.createElement('div');line.className='cart-row';const detail=document.createElement('div'),name=document.createElement('b'),small=document.createElement('small'),remove=document.createElement('button');name.textContent=x.name;small.textContent=x.qty+' × '+money(x.price);detail.append(name,small);remove.className='remove';remove.textContent='Remove';remove.addEventListener('click',()=>removeFromCart(x.id));line.append(detail,remove);items.append(line)}}}
function openCart(){document.getElementById('cartDrawer')?.classList.add('open');document.getElementById('overlay')?.classList.add('show')}
function closeCart(){document.getElementById('cartDrawer')?.classList.remove('open');document.getElementById('overlay')?.classList.remove('show')}
function productImageUrl(v){try{if(typeof v!=='string'||!v.trim())return '';const u=new URL(v,location.href);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
function safeProductImage(v){return escapeCartText(productImageUrl(v))}
function productCard(p){const disabled=p.status==='sold'||p.price==null||Number(p.stock_qty||0)<=0;return `<article class="product-card"><a href="product.html?id=${encodeURIComponent(p.id)}" class="product-image-wrap"><img src="${safeProductImage(p.image)}" alt="${escapeCartText(p.name)}" loading="lazy" decoding="async"><span class="badge">${escapeCartText(p.badge)}</span></a><div class="product-info"><div class="product-meta"><span>${escapeCartText(p.brand)}</span><span>${escapeCartText(p.category)}</span></div><h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeCartText(p.name)}</a></h3><p class="condition">${escapeCartText(p.condition)}</p><div class="product-bottom"><strong>${money(p.price)}</strong>${disabled?`<button class="add" disabled>${p.status==='sold'||Number(p.stock_qty||0)<=0?'OUT OF STOCK':'PRICE ON REQUEST'}</button>`:`<button class="add" data-cart-id="${escapeCartText(p.id)}">${nvCartSignedIn?'ADD TO CART':'SIGN IN TO ADD'}</button>`}</div></div></article>`}
function renderGrid(targetId,list){const el=document.getElementById(targetId);if(el){if(nvCatalogLoading){el.setAttribute("aria-busy","true");el.innerHTML='<p class="empty" role="status">Loading collection…</p>';return;}el.setAttribute("aria-busy","false");el.innerHTML=list.map(productCard).join('')||'<p class="empty">No pieces found.</p>';el.querySelectorAll('[data-cart-id]').forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.cartId)))}}
function setupShop(){
 const grid=document.getElementById('productGrid');if(!grid)return;
 const params=new URLSearchParams(location.search);let filter=nvStoreCategory(params.get('category')||'All'),brand=params.get('brand')||'All',q=params.get('q')||'',sort=params.get('sort')||'featured';const segment=params.get('segment')||'';
 const filterGroup=document.querySelector('.filters');if(filterGroup){for(const category of [...new Set(ACTIVE_CATALOG.map(p=>p.category))])if(!Array.from(filterGroup.querySelectorAll('.filter')).some(b=>b.dataset.filter===category)){const b=document.createElement('button');b.type='button';b.className='filter';b.dataset.filter=category;b.textContent=category;filterGroup.append(b)}}
 const filters=document.querySelectorAll('.filter');
 let toolbar=document.getElementById('nvCatalogTools');
 if(!toolbar){toolbar=document.createElement('div');toolbar.id='nvCatalogTools';toolbar.className='nv-catalog-tools';toolbar.innerHTML='<p id="nvResultCount" role="status"></p><label>Brand<select id="nvBrandFilter"><option value="All">All brands</option></select></label><label>Sort by<select id="nvSort"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name: A–Z</option></select></label>';grid.before(toolbar);}
 const brandSelect=document.getElementById('nvBrandFilter'),sortSelect=document.getElementById('nvSort');
 brandSelect.replaceChildren(...['All',...new Set(ACTIVE_CATALOG.map(p=>p.brand).filter(Boolean).sort())].map(v=>{const o=document.createElement('option');o.value=v;o.textContent=v==='All'?'All brands':v;return o}));brandSelect.value=brand;sortSelect.value=sort;
 function draw(){let list=ACTIVE_CATALOG.filter(p=>(filter==='All'||p.category===filter)&&(brand==='All'||nvNormalize(p.brand)===nvNormalize(brand))&&(!segment||nvDetectSegment(p).toLowerCase()===segment.toLowerCase()||nvNormalize(p.brand)===nvNormalize(segment))&&(!q||[p.name,p.brand,p.category,p.series,...(p.tags||[])].join(' ').toLowerCase().includes(q.toLowerCase())));
 if(sort==='price-low')list.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));if(sort==='price-high')list.sort((a,b)=>(b.price??-1)-(a.price??-1));if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
 renderGrid('productGrid',list);document.getElementById('nvResultCount').textContent=nvCatalogLoading?'Loading collection…':list.length+' pieces'+(segment?' · '+segment:'');
 filters.forEach(b=>b.classList.toggle('active',b.dataset.filter===filter));
 if(!ACTIVE_CATALOG.length&&window.NV_CATALOG_ERROR){grid.replaceChildren();const error=document.createElement('p');error.textContent=window.NV_CATALOG_ERROR;grid.append(error);const retry=document.createElement('button');retry.className='btn primary';retry.textContent='Retry inventory';retry.onclick=async()=>{retry.disabled=true;await hydrateCatalog();setupShop()};grid.append(retry);}
 }
 function update(){const u=new URL(location.href);for(const [key,value] of Object.entries({category:filter,brand,q,sort}))if(!value||value==='All'||value==='featured')u.searchParams.delete(key);else u.searchParams.set(key,value);history.replaceState({},'',u);draw();}
 filters.forEach(b=>b.onclick=()=>{filter=b.dataset.filter;update()});brandSelect.onchange=()=>{brand=brandSelect.value;update()};sortSelect.onchange=()=>{sort=sortSelect.value;update()};const search=document.querySelector('.catalog-search');if(search){search.value=q;search.oninput=()=>{q=search.value;update()}}const activeSegment=document.getElementById('activeSegment');if(activeSegment&&segment){activeSegment.textContent='Browsing: '+segment;activeSegment.hidden=false;}draw();
}
function renderProductPage(){const el=document.getElementById('productDetail');if(!el)return;if(nvCatalogLoading){el.textContent="Loading product…";return;}if(!ACTIVE_CATALOG.length){el.textContent=window.NV_CATALOG_ERROR||'No products published yet. Check back soon.';return;}const requestedId=new URLSearchParams(location.search).get('id');const p=ACTIVE_CATALOG.find(x=>String(x.id)===requestedId);if(!p){el.innerHTML='<h1>Product unavailable</h1><p>This product link could not be matched. Please return to the shop.</p><a class="btn primary" href="shop.html">BACK TO SHOP</a>';return;}el.innerHTML=`<div class="product-detail-image"><div class="nv-photo-stage" style="position:relative;width:100%"><img id="nvMainProductPhoto" src="${safeProductImage(p.image)}" alt="${escapeCartText(p.name)}">${(p.images?.length>1)?`<button type="button" data-photo-step="-1" aria-label="Previous product photo" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:1px solid #aaa;border-radius:50%;background:rgba(0,0,0,.75);color:#fff;font-size:28px;cursor:pointer">‹</button><button type="button" data-photo-step="1" aria-label="Next product photo" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:1px solid #aaa;border-radius:50%;background:rgba(0,0,0,.75);color:#fff;font-size:28px;cursor:pointer">›</button>`:""}</div>${(p.images?.length>1)?`<div class="nv-product-thumbnails" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${p.images.map((url,i)=>`<button type="button" class="nv-photo-thumb" data-photo-index="${i}" aria-label="View product photo ${i+1}" style="width:68px;height:68px;padding:3px;background:#222;border:1px solid #888;cursor:pointer"><img src="${safeProductImage(url)}" alt="Photo ${i+1}" style="width:100%;height:100%;object-fit:cover"></button>`).join("")}</div>`:""}</div><div class="product-detail-copy"><p class="eyebrow">${escapeCartText(String(p.brand||'').toUpperCase())} · ${escapeCartText(String(p.category||'').toUpperCase())}</p><h1>${escapeCartText(p.name)}</h1><div class="detail-price">${money(p.price)}</div><p class="detail-condition">${escapeCartText(p.condition)}</p><p class="detail-description">${escapeCartText(p.description)}</p><div class="detail-tags">${(p.tags||[]).map(t=>`<span>${escapeCartText(t)}</span>`).join('')}</div><ul class="detail-list">${(p.details||[]).map(t=>`<li>${escapeCartText(t)}</li>`).join('')}</ul><div class="detail-actions">${(p.status==='sold'||Number(p.stock_qty||0)<=0)?'<button class="btn ghost full" disabled>SOLD OUT</button>':p.price==null?`<a class="btn primary full" href="contact.html">ENQUIRE ABOUT THIS PRODUCT</a>`:`<button class="btn primary full" data-cart-id="${escapeCartText(p.id)}">ADD TO CART · ${money(p.price)}</button>`}</div><p class="micro-note">Shipping is extra unless otherwise stated. Old, vintage and resale action figures are final sale; no voluntary returns, replacements or refunds, and DIT/LIT is not covered for these figures. Apparel and headgear: 7-day replacement requests; refund only if eligible replacement stock is unavailable. Keep an unedited unboxing video for wrong-item, missing-content or visible-damage claims. <a href="policies.html" style="text-decoration:underline">Read the full returns policy and applicable rights</a>.</p></div>`;let photoIndex=0;const photos=p.images?.length?p.images:[p.image];function showPhoto(index){photoIndex=(index+photos.length)%photos.length;const img=el.querySelector('#nvMainProductPhoto');if(img)img.src=productImageUrl(photos[photoIndex]);el.querySelectorAll('[data-photo-index]').forEach(b=>{const selected=Number(b.dataset.photoIndex)===photoIndex;b.setAttribute('aria-pressed',String(selected));b.style.borderColor=selected?'var(--accent)':'#888'});}el.querySelectorAll('[data-photo-index]').forEach(b=>b.addEventListener('click',()=>showPhoto(Number(b.dataset.photoIndex))));el.querySelectorAll('[data-photo-step]').forEach(b=>b.addEventListener('click',()=>showPhoto(photoIndex+Number(b.dataset.photoStep))));showPhoto(0);el.querySelectorAll('[data-cart-id]').forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.cartId)));document.title=p.name+' | NerdVerse India';enhanceProductExperience(el,p)}
function setupCommon(){const drawer=document.getElementById('cartDrawer');if(drawer&&!drawer.querySelector('.nv-profile-link')){const head=drawer.querySelector('.drawer-head');if(head){const profile=document.createElement('a');profile.href='#';profile.className='nv-profile-link';profile.addEventListener('click',e=>{e.preventDefault();closeCart();document.querySelector('.nv-user-btn')?.click()});profile.setAttribute('aria-label','My profile and account details');profile.style.cssText='display:flex;align-items:center;gap:9px;padding:13px 18px;border-bottom:1px solid #333;color:#d8ff3e;font-weight:700;text-decoration:none';profile.textContent='♙  My Profile & Account';head.insertAdjacentElement('afterend',profile)}}document.getElementById('cartBtn')?.addEventListener('click',openCart);document.getElementById('closeCart')?.addEventListener('click',closeCart);document.getElementById('overlay')?.addEventListener('click',closeCart);document.getElementById('searchBtn')?.addEventListener('click',()=>document.getElementById('searchPanel')?.classList.add('open'));document.getElementById('closeSearch')?.addEventListener('click',()=>document.getElementById('searchPanel')?.classList.remove('open'));renderCart();setupShop();renderProductPage()}
document.addEventListener('DOMContentLoaded',async()=>{setupCommon();cartAuth().catch(()=>{});if(!window.NV_CONFIG){await new Promise(resolve=>{const x=document.createElement('script');x.src='config.js';x.onload=resolve;x.onerror=resolve;document.head.appendChild(x)})}await hydrateCatalog();nvCatalogLoading=false;if(ACTIVE_CATALOG.length){cart=cart.filter(x=>{const p=ACTIVE_CATALOG.find(p=>p.id===x.id);if(!p||p.status==='sold'||!Number(p.stock_qty))return false;x.qty=Math.min(Math.max(1,Number(x.qty)||1),Number(p.stock_qty));x.price=p.price;x.name=p.name;return true});saveCart()}setupShop();renderProductPage();document.dispatchEvent(new Event('nv:catalog-ready'));});

// Customer profile button beside the cart, shared across storefront pages.
(function(){if(document.querySelector('script[data-nv-user-profile]'))return;const x=document.createElement('script');x.src='user-profile.js?v=20261013-v3';x.dataset.nvUserProfile='1';document.head.append(x)})();

// Discourage casual saving of storefront product images without blocking navigation.
(function(){
 const productImageSelector='.product-image-wrap img,.product-detail-image img,.nv-product-thumbnails img';
 function isProductImage(target){return target instanceof Element&&!!target.closest(productImageSelector)}
 document.addEventListener('contextmenu',event=>{if(isProductImage(event.target))event.preventDefault()});
 document.addEventListener('dragstart',event=>{if(isProductImage(event.target))event.preventDefault()});
})();

function enhanceProductExperience(el,p){
 const copy=el.querySelector('.product-detail-copy');if(!copy)return;
 const crumb=document.createElement('nav');crumb.className='nv-breadcrumb';crumb.setAttribute('aria-label','Breadcrumb');crumb.innerHTML='<a href="index.html">Home</a><span> / </span><a href="shop.html">Collection</a><span> / </span><a href="shop.html?category='+encodeURIComponent(p.category)+'">'+escapeCartText(p.category)+'</a>';el.prepend(crumb);
 const actions=copy.querySelector('.detail-actions'),available=p.status!=='sold'&&Number(p.stock_qty)>0&&p.price!=null;
 if(available){actions.innerHTML='<label class="nv-quantity">Quantity <input id="nvQuantity" type="number" min="1" max="'+Math.min(20,p.stock_qty)+'" value="1" inputmode="numeric"></label><p class="micro-note">'+Number(p.stock_qty)+' available · '+escapeCartText(p.condition)+'</p><div class="nv-buy-actions"><button type="button" class="btn ghost" id="nvAddProduct">'+(nvCartSignedIn?'Add to cart':'Sign in to add')+'</button><button type="button" class="btn primary" id="nvBuyProduct">'+(nvCartSignedIn?'Buy it now ↗':'Sign in to buy')+'</button></div><p id="nvPurchaseMsg" role="status" class="micro-note"></p>';
 async function purchase(buy){if(!await requireCartSignIn())return;const input=actions.querySelector('#nvQuantity');if(!input.reportValidity())return;const qty=Number(input.value),found=cart.find(x=>x.id===p.id),existing=found?.qty||0;if(!Number.isInteger(qty)||qty<1||qty+existing>Math.min(20,Number(p.stock_qty))){actions.querySelector('#nvPurchaseMsg').textContent='Your cart and this quantity exceed available stock or the 20-piece checkout limit.';return;}if(found)found.qty+=qty;else cart.push({...p,qty});saveCart();if(buy)location.assign('checkout.html');else openCart();}
 actions.querySelector('#nvAddProduct').onclick=()=>purchase(false);actions.querySelector('#nvBuyProduct').onclick=()=>purchase(true);
 }
 const shipping=document.createElement('div');shipping.className='nv-service-strip';shipping.innerHTML='<div><b>Pan-India delivery</b><small>Free shipping over ₹2,999</small></div><div><b>Secure payment</b><small>Continue through PhonePe</small></div><div><b>Collector condition</b><small>Review actual photos & notes</small></div>';actions.after(shipping);
 const policy=copy.querySelector(':scope > .micro-note');if(policy){const details=document.createElement('details');details.className='nv-product-accordion';const summary=document.createElement('summary');summary.textContent='Returns & condition policy';details.append(summary);policy.replaceWith(details);details.append(policy);}
 const delivery=document.createElement('details');delivery.className='nv-product-accordion';delivery.innerHTML='<summary>Shipping & order updates</summary><p>Shipping is calculated for your PIN code during checkout. Free shipping applies to orders over ₹2,999. Sign in to complete payment and follow your order in My Account.</p><a class="text-link" href="shipping.html">Read shipping policy →</a>';copy.append(delivery);
 formatCollectorListing(el,p);
 const related=nvRecommendations(p,ACTIVE_CATALOG);if(related.length){const section=document.createElement('section');section.className='nv-related';section.innerHTML='<p class="eyebrow">KEEP EXPLORING</p><h2>You may also like.</h2><div id="nvRelatedGrid" class="product-grid"></div>';el.append(section);renderGrid('nvRelatedGrid',related);}
}

function nvRecommendations(product,catalog){
 const same=(a,b)=>Boolean(a&&b)&&String(a).toLowerCase()===String(b).toLowerCase();
 const score=x=>(same(x.category,product.category)?4:0)+(same(x.brand,product.brand)&&String(x.brand).toLowerCase()!=='generic'?3:0)+(Array.isArray(x.tags)&&Array.isArray(product.tags)?x.tags.filter(t=>product.tags.includes(t)).length:0);
 const seen=new Set([String(product.id)]);
 return catalog.filter(x=>{const id=String(x.id);if(seen.has(id)||x.status==='sold'||Number(x.stock_qty)<=0||x.price==null)return false;seen.add(id);return true}).sort((a,b)=>score(b)-score(a)||Math.abs(Number(a.price)-Number(product.price))-Math.abs(Number(b.price)-Number(product.price))||String(a.id).localeCompare(String(b.id))).slice(0,4);
}

function formatCollectorListing(el,p){
 if(/poster|keychain/i.test(p.category||''))return;
 el.classList.add('nv-collector-presentation');
 const description=el.querySelector('.detail-description');
 if(description){
  const box=document.createElement('div');box.className='detail-description nv-listing-description';
  const content=String(p.description||'').replace(/\\n/g,'\n');
  for(const block of content.split(/\n+/).map(x=>x.trim()).filter(Boolean)){
   const paragraph=document.createElement('p'),label=block.match(/^([A-Za-z][A-Za-z /&-]{1,35}:)\s*(.*)$/);
   if(label){const strong=document.createElement('strong');strong.textContent=label[1]+' ';paragraph.append(strong,document.createTextNode(label[2]));}else paragraph.textContent=block;
   box.append(paragraph);
  }
  description.replaceWith(box);
 }
 if(!document.getElementById('nvCollectorPresentationStyle')){
  const style=document.createElement('style');style.id='nvCollectorPresentationStyle';
  style.textContent='.nv-collector-presentation .nv-photo-stage{aspect-ratio:1;background:#101010;border:1px solid #383328;border-radius:8px;overflow:hidden}.nv-collector-presentation .nv-photo-stage>img{width:100%;height:100%;object-fit:contain;display:block}.nv-listing-description p{margin:0 0 14px;line-height:1.7;color:#c7c7c7}.nv-listing-description strong{color:#f2d77a}.nv-collector-presentation .detail-price{margin:16px 0}.nv-collector-presentation .nv-product-thumbnails{gap:8px}.nv-collector-presentation .nv-photo-thumb{border-radius:5px;overflow:hidden}@media(max-width:700px){.nv-collector-presentation .nv-listing-description{font-size:14px}.nv-collector-presentation .nv-photo-stage{border-radius:6px}}';
  document.head.append(style);
 }
}


// Keep the brand strip and navigation aligned with the current die-cast makers.
function nvCompleteBrandDiscovery(){
 const brands=[['CCA','brand-cca.svg'],['Welly','brand-welly.svg'],['Bburago','brand-bburago.svg']];
 for(const strip of document.querySelectorAll('.collector-marks')){
  for(const [name,src] of brands){
   let link=Array.from(strip.querySelectorAll('a')).find(a=>new URL(a.href,location.href).searchParams.get('brand')===name);
   if(!link){link=document.createElement('a');link.className='collector-mark collector-mark-2';strip.append(link);}
   link.href='shop.html?brand='+encodeURIComponent(name);link.setAttribute('aria-label','Shop '+name);link.replaceChildren();
   const img=document.createElement('img');img.className='collector-logo';img.src=src;img.alt=name+' logo';img.loading='lazy';
   const fallback=document.createElement('span');fallback.textContent=name;
   img.onload=()=>fallback.hidden=true;img.onerror=()=>img.remove();link.append(img,fallback);
  }
 }
 for(const item of document.querySelectorAll('.nv-nav-item')){
  const heading=item.querySelector(':scope > a');const dropdown=item.querySelector('.nv-dropdown');
  if(!heading||!dropdown||!heading.getAttribute('href')?.startsWith('brands.html'))continue;
  for(const [name] of brands){
   if(Array.from(dropdown.querySelectorAll('a')).some(a=>a.textContent.trim().toLowerCase()===name.toLowerCase()))continue;
   const link=document.createElement('a');link.href='shop.html?brand='+encodeURIComponent(name);link.textContent=name;
   const all=Array.from(dropdown.children).find(a=>a.textContent.trim()==='All Brands');dropdown.insertBefore(link,all||null);
  }
 }
}
nvCompleteBrandDiscovery();
