(async function(){
const gate=document.getElementById('authGate'),panel=document.getElementById('accountPanel'),msg=document.getElementById('authMsg');
document.getElementById('googleBtn').onclick=()=>NV_AUTH.google();
document.getElementById('signOut').onclick=()=>NV_AUTH.signOut();
document.getElementById('magicForm').onsubmit=async e=>{e.preventDefault();const {error}=await NV_AUTH.magicLink(document.getElementById('magicEmail').value.trim());msg.textContent=error?'Unable to send sign-in link.':'Check your inbox for the secure sign-in link.';};
if(!NV_AUTH.configured){msg.textContent='Setup required: add Supabase credentials in config.js.';return;}

async function resolveUser(){
  // Supabase's detectSessionInUrl handles the PKCE code exchange during
  // client initialization. Do not exchange the same code a second time.
  const {data:{session},error}=await NV_AUTH.client.auth.getSession();
  if(error){
    msg.textContent='Sign-in error: '+error.message;
    return null;
  }
  if(session?.user){
    if(new URLSearchParams(location.search).has('code'))
      history.replaceState({},document.title,location.pathname);
    return session.user;
  }
  return null;
}

const user=await resolveUser();
if(!user){gate.hidden=false;panel.hidden=true;return;}
gate.hidden=true;panel.hidden=false;
document.getElementById('accountName').textContent=user.user_metadata?.full_name||user.email;
document.getElementById('accountEmail').textContent=user.email||'';
const {data,error}=await NV_AUTH.client.from('orders').select('id,order_number,status,payment_status,total,tracking_number,tracking_url,created_at,order_items(product_name,quantity,unit_price,total_price)').eq('customer_id',user.id).order('created_at',{ascending:false});
const el=document.getElementById('orders');
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(error){console.error('Order history error',error);el.innerHTML='<div class="account-empty"><strong>Orders temporarily unavailable</strong><p>We could not load your order history right now. Please try again shortly.</p></div>';return;}
if(!data?.length){el.innerHTML='<div class="account-empty"><strong>No orders yet</strong><p>Your NerdVerse India purchases will appear here after checkout.</p><a class="btn primary" href="shop.html">Explore the collection</a></div>';return;}
el.innerHTML=data.map(o=>`<article class="order-card"><div class="order-top"><div><strong>${safe(o.order_number)}</strong><small>${new Date(o.created_at).toLocaleString('en-IN')}</small></div><span class="status-chip">${safe(o.status)}</span></div><div>${o.order_items.map(i=>`<div class="cart-row"><span>${safe(i.product_name)} × ${i.quantity}</span><strong>₹${Number(i.total_price??(Number(i.unit_price)*Number(i.quantity))).toLocaleString('en-IN')}</strong></div>`).join('')}</div>${o.tracking_number?`<p>Tracking / AWB: <strong>${safe(o.tracking_number)}</strong>${o.tracking_url&&/^https:\/\//i.test(o.tracking_url)?` · <a href="${safe(o.tracking_url)}" target="_blank" rel="noopener noreferrer">Track with courier ↗</a>`:""}</p>`:""}<div class="order-bottom"><b>Payment: ${safe(o.payment_status)}</b><b>Total: ₹${Number(o.total).toLocaleString('en-IN')}</b></div></article>`).join('');
})();