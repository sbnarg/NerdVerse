(async function(){
function signInDestination(){const next=sessionStorage.getItem('nv-after-signin');sessionStorage.removeItem('nv-after-signin');return next==='checkout.html'?'checkout.html':'index.html';}
const gate=document.getElementById('authGate'),panel=document.getElementById('accountPanel'),msg=document.getElementById('authMsg');
document.getElementById('googleBtn').onclick=()=>NV_AUTH.google();
document.getElementById('signOut').onclick=()=>NV_AUTH.signOut();
const emailForm=document.getElementById('otpEmailForm'),verifyForm=document.getElementById('otpVerifyForm'),emailInput=document.getElementById('otpEmail'),codeInput=document.getElementById('otpCode'),sendBtn=document.getElementById('sendOtpBtn'),resendBtn=document.getElementById('resendOtpBtn');
let otpEmail='',cooldownUntil=0,busy=false;
function refreshCooldown(){const seconds=Math.max(0,Math.ceil((cooldownUntil-Date.now())/1000));resendBtn.disabled=busy||seconds>0;resendBtn.textContent=seconds?'Resend in '+seconds+'s':'Resend code';sendBtn.disabled=busy||seconds>0;sendBtn.textContent=seconds?'Send again in '+seconds+'s':'Send email OTP';}
const cooldownTimer=setInterval(refreshCooldown,1000);window.addEventListener('pagehide',()=>clearInterval(cooldownTimer),{once:true});
async function sendCode(){
 if(busy||Date.now()<cooldownUntil||!emailForm.reportValidity())return;
 if(!NV_AUTH.configured){msg.textContent='Sign-in unavailable. Please try again shortly.';return;}
 busy=true;refreshCooldown();msg.textContent='Sending your sign-in code…';
 try{const email=emailInput.value.trim();const {error}=await NV_AUTH.sendEmailOtp(email);if(error){if(error.status===429){cooldownUntil=Date.now()+60000;msg.textContent='Please wait a minute before requesting another code.';}else msg.textContent='Unable to send the code. Please try again or continue with Google.';return;}otpEmail=email;cooldownUntil=Date.now()+60000;verifyForm.hidden=false;emailForm.hidden=true;codeInput.value='';document.getElementById('otpSentTo').textContent='Enter the code sent to '+email;msg.textContent='Check your inbox and spam folder for your sign-in code.';codeInput.focus();}catch{msg.textContent='Unable to connect. Please try again or continue with Google.';}finally{busy=false;refreshCooldown();}
}
emailForm.onsubmit=e=>{e.preventDefault();sendCode()};resendBtn.onclick=()=>sendCode();
document.getElementById('changeOtpEmail').onclick=()=>{if(busy)return;otpEmail='';codeInput.value='';verifyForm.hidden=true;emailForm.hidden=false;msg.textContent='';emailInput.focus();};
verifyForm.onsubmit=async e=>{e.preventDefault();if(busy||!otpEmail||!verifyForm.reportValidity())return;busy=true;const button=verifyForm.querySelector('[type=submit]');button.disabled=true;refreshCooldown();msg.textContent='Verifying your code…';try{const {data,error}=await NV_AUTH.verifyEmailOtp(otpEmail,codeInput.value.trim());if(error||!data?.session){msg.textContent='That code is invalid or expired. Try again or request a new code.';codeInput.focus();return;}codeInput.value='';location.replace(signInDestination());}catch{msg.textContent='Unable to verify your code. Please try again.';}finally{busy=false;button.disabled=false;refreshCooldown();}};

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
    const params=new URLSearchParams(location.search);
    const authCallback=params.has('code')||params.has('token_hash')||location.hash.includes('access_token=');
    if(authCallback){
      history.replaceState({},document.title,location.pathname);
      location.replace(signInDestination());
      return null;
    }
    return session.user;
  }
  return null;
}

const user=await resolveUser();
if((new URLSearchParams(location.search).has('code')||new URLSearchParams(location.search).has('token_hash')||location.hash.includes('access_token='))&&!user){return;}
if(!user){gate.hidden=false;panel.hidden=true;return;}
gate.hidden=true;panel.hidden=false;
document.getElementById('accountName').textContent=user.user_metadata?.full_name||user.email;
document.getElementById('accountEmail').textContent=user.email||'';

// Show admin entry only after checking the same admin_users role source used by admin-api.
try{const {data:{session:currentSession}}=await NV_AUTH.client.auth.getSession();if(currentSession){const response=await fetch(NV_CONFIG.supabaseUrl+'/functions/v1/admin-api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+currentSession.access_token},body:JSON.stringify({action:'whoami'})});if(response.ok){const role=await response.json();if(role.is_admin)document.getElementById('adminEntry').hidden=false;}}}catch(e){console.warn('Admin entry check unavailable',e)}
const {data,error}=await NV_AUTH.client.from('orders').select('id,order_number,status,payment_status,total,tracking_number,courier_name,delivery_status,created_at,order_items(product_name,quantity,unit_price,total_price)').eq('customer_id',user.id).order('created_at',{ascending:false});
const el=document.getElementById('orders');
const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(error){console.error('Order history error',error);el.innerHTML='<div class="account-empty"><strong>Orders temporarily unavailable</strong><p>We could not load your order history right now. Please try again shortly.</p><p class="micro-note">Error: '+safe(error.code||'unknown')+' — '+safe(error.message||'Please contact support')+'</p></div>';return;}
if(!data?.length){el.innerHTML='<div class="account-empty"><strong>No orders yet</strong><p>Your NerdVerse India purchases will appear here after checkout.</p><a class="btn primary" href="shop.html">Explore the collection</a></div>';return;}
el.innerHTML=data.map(o=>`<article class="order-card"><div class="order-top"><div><strong>${safe(o.order_number)}</strong><small>${new Date(o.created_at).toLocaleString('en-IN')}</small></div><span class="status-chip">${safe(['cancelled','refunded'].includes(o.status)?o.status:(o.delivery_status||o.status))}</span></div><div>${o.order_items.map(i=>`<div class="cart-row"><span>${safe(i.product_name)} × ${i.quantity}</span><strong>₹${Number(i.total_price??(Number(i.unit_price)*Number(i.quantity))).toLocaleString('en-IN')}</strong></div>`).join('')}</div>${o.tracking_number?`<p>Tracking / AWB: <strong>${safe(o.tracking_number)}</strong>${o.tracking_url&&/^https:\/\//i.test(o.tracking_url)?` · <a href="${safe(o.tracking_url)}" target="_blank" rel="noopener noreferrer">Track with courier ↗</a>`:""}</p>`:""}<p><a class="btn primary" href="track-order.html?order=${encodeURIComponent(o.id)}">Track order</a></p><div class="order-bottom"><b>Payment: ${safe(o.payment_status)}</b><b>Total: ₹${Number(o.total).toLocaleString('en-IN')}</b></div>${['paid','refunded','partially_refunded'].includes(o.payment_status)?`<p><a class="btn ghost" href="receipt.html?order=${encodeURIComponent(o.id)}">View invoice / order documents</a></p>`:''}</article>`).join('');
})();
