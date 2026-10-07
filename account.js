(async function(){
const gate=document.getElementById('authGate'),panel=document.getElementById('accountPanel'),msg=document.getElementById('authMsg');
document.getElementById('googleBtn').onclick=()=>NV_AUTH.google();
document.getElementById('signOut').onclick=()=>NV_AUTH.signOut();
document.getElementById('magicForm').onsubmit=async e=>{e.preventDefault();const {error}=await NV_AUTH.magicLink(document.getElementById('magicEmail').value.trim());msg.textContent=error?'Unable to send sign-in link.':'Check your inbox for the secure sign-in link.';};
if(!NV_AUTH.configured){msg.textContent='Setup required: add Supabase credentials in config.js.';return;}

async function resolveUser(){
  const params=new URLSearchParams(location.search);
  const code=params.get('code');
  if(code){
    const {error:exchangeError}=await NV_AUTH.client.auth.exchangeCodeForSession(code);
    if(exchangeError){msg.textContent='Sign-in error: '+exchangeError.message;return null;}
    history.replaceState({},document.title,location.pathname);
  }
  const {data:{session},error}=await NV_AUTH.client.auth.getSession();
  if(error){msg.textContent='Sign-in error: '+error.message;return null;}
  if(session?.user)return session.user;
  return await new Promise(resolve=>{
    let settled=false;
    const {data:{subscription}}=NV_AUTH.client.auth.onAuthStateChange((event,nextSession)=>{
      if(settled)return;
      if(event==='SIGNED_IN'||event==='INITIAL_SESSION'){
        settled=true;subscription.unsubscribe();resolve(nextSession?.user||null);
      }
    });
    setTimeout(()=>{if(!settled){settled=true;subscription.unsubscribe();resolve(null);}},1500);
  });
}

const user=await resolveUser();
if(!user){gate.hidden=false;panel.hidden=true;return;}
gate.hidden=true;panel.hidden=false;
document.getElementById('accountName').textContent=user.user_metadata?.full_name||user.email;
document.getElementById('accountEmail').textContent=user.email||'';
const {data,error}=await NV_AUTH.client.from('orders').select('id,order_no,status,payment_status,total_amount,tracking_number,tracking_url,created_at,order_items(product_name,quantity,line_total)').eq('user_id',user.id).order('created_at',{ascending:false});
const el=document.getElementById('orders');
if(error){el.textContent=error.message;return;}
if(!data?.length){el.innerHTML='<p class="micro-note">No orders yet.</p>';return;}
el.innerHTML=data.map(o=>`<article class="order-card"><div class="order-top"><div><strong>${o.order_no}</strong><small>${new Date(o.created_at).toLocaleString('en-IN')}</small></div><span class="status-chip">${o.status}</span></div><div>${o.order_items.map(i=>`<div class="cart-row"><span>${i.product_name} × ${i.quantity}</span><strong>₹${Number(i.line_total).toLocaleString('en-IN')}</strong></div>`).join('')}</div><div class="order-bottom"><b>Payment: ${o.payment_status}</b><b>Total: ₹${Number(o.total_amount).toLocaleString('en-IN')}</b>${o.tracking_url?`<a class="btn ghost" target="_blank" href="${o.tracking_url}">Track delivery ↗</a>`:''}</div></article>`).join('');
})();