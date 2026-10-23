(async function(){
 const root=document.getElementById('trackingOrders'),message=document.getElementById('trackingMessage');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const stages=['confirmed','processing','packed','shipped','out_for_delivery','delivered'];
 const labels={pending:'Awaiting payment',confirmed:'Payment confirmed',processing:'Preparing your order',packed:'Packed, awaiting courier',shipped:'Dispatched',out_for_delivery:'Out for delivery',delivered:'Delivered',cancelled:'Cancelled',refunded:'Refunded'};
 async function load(){
  root.replaceChildren();message.textContent='Checking your orders…';
  try{
   if(!window.NV_AUTH?.configured)throw Error('unavailable');
   const user=await NV_AUTH.user();
   if(!user){message.innerHTML='Sign in with the email used for your order to view private tracking details. <a href="account.html">Sign in / My Orders</a>';return;}
   const id=new URLSearchParams(location.search).get('order');
   if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)){message.textContent='Invalid order link. Open My Orders to choose your order.';return;}
   let query=NV_AUTH.client.from('orders').select('id,order_number,status,payment_status,delivery_status,tracking_number,courier_name,created_at,updated_at').eq('customer_id',user.id).order('created_at',{ascending:false});
   if(id)query=query.eq('id',id);
   const {data,error}=await query;if(error)throw error;
   if(!data?.length){message.textContent='No matching orders found for this account.';return;}
   message.textContent='Courier updates are checked periodically. Payment confirmation and dispatch are separate steps.';
   root.innerHTML=data.map(o=>{
    const terminal=['cancelled','refunded'].includes(o.status);
    const stage=terminal?o.status:o.payment_status==='paid'?(o.delivery_status||o.status):'pending';
    const index=stages.indexOf(stage);
    const note=terminal?'Contact us if you need help with this order.':stage==='delivered'?'The courier has marked this order delivered.':index>=3?'Your parcel is with the courier. Delivery timing depends on the courier and destination.':'Your order is being prepared. Tracking becomes available after a courier AWB is assigned.';
    return `<article class="checkout-card"><div class="order-top"><div><h2>${esc(o.order_number)}</h2><p>${esc(new Date(o.created_at).toLocaleDateString('en-IN'))}</p></div><strong class="status-chip">${esc(labels[stage]||stage)}</strong></div><p>${note}</p>${!terminal?`<ol class="delivery-steps" aria-label="Delivery progress">${stages.map((s,i)=>`<li class="${i<=index?'complete':''}"${i===index?' aria-current="step"':''}>${labels[s]}</li>`).join('')}</ol>`:''}${o.tracking_number?`<p>Courier: <strong>${esc(o.courier_name||'Shiprocket')}</strong><br>AWB / tracking number: <strong>${esc(o.tracking_number)}</strong></p>`:''}<p class="tracking-actions">${o.payment_status==='paid'?`<a class="btn ghost" href="receipt.html?order=${encodeURIComponent(o.id)}">View existing GST invoice</a>`:''}<a class="btn ghost" href="contact.html">Get help</a></p><small>Last order update: ${esc(new Date(o.updated_at||o.created_at).toLocaleString('en-IN'))}</small></article>`;
   }).join('');
  }catch{message.textContent='Tracking is temporarily unavailable. Refresh or check My Orders. Your payment and order are unchanged.';}
 }
 document.getElementById('refreshTracking').onclick=load;
 await load();
})();
