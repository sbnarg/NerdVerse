const API='https://api.resend.com/emails';const SITE='https://nerdverseindia.com/';
export function emailConfiguration(){
 const key=Boolean(Deno.env.get('RESEND_API_KEY'));
 const from=Deno.env.get('EMAIL_FROM')||'';
 const sender=Boolean(from)&&!/@resend\.dev\b/i.test(from);
 return {configured:key&&sender,provider_configured:key,sender_configured:sender};
}
export async function sendEmail(to:string,subject:string,html:string,idempotencyKey?:string){
 const config=emailConfiguration();
 if(!config.configured)return {skipped:true,reason:!config.provider_configured?'email_provider_not_configured':'email_sender_not_configured'};
 const r=await fetch(API,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error',headers:{Authorization:`Bearer ${Deno.env.get('RESEND_API_KEY')}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from:Deno.env.get('EMAIL_FROM'),to:[to],subject,html})});
 let data;try{data=await r.json()}catch{throw Error('email_provider_invalid_response')}
 if(!r.ok)throw Error(r.status===401||r.status===403?'email_provider_auth_or_sender_error':'email_provider_request_failed');
 if(typeof data.id!=='string'||!data.id)throw Error('email_provider_invalid_response');
 return {id:data.id};
}
export function statusEmail(o:any){const tracking=o.tracking_url?`<p><a href="${o.tracking_url}">Track your delivery</a>${o.tracking_number?` · ${o.tracking_number}`:''}</p>`:'';const m:any={paid:['Payment confirmed','Your payment is confirmed.'],processing:['Order processing','Your order is being prepared.'],packed:['Order packed','Your collectible has been packed and is ready for dispatch.'],shipped:['Order shipped','Your order has left NerdVerse India.'],out_for_delivery:['Out for delivery','Your order is on its way to you.'],delivered:['Delivered','Your NerdVerse order has been delivered. Happy hunting!'],cancelled:['Order cancelled','Your order has been cancelled.'],refunded:['Payment refunded','Your payment has been marked as refunded.']};const c=m[o.status]||['Order update',`Your order status is now ${o.status}.`];return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:32px;background:#111;color:#eee"><h1 style="color:#f5c400">NERDVERSE INDIA</h1><p>Order <b>${o.order_number??o.order_no??'Pending'}</b></p><h2>${c[0]}</h2><p>${c[1]}</p>${tracking}<p>Total: <b>₹${Number(o.total??o.total_amount??0).toLocaleString('en-IN')}</b></p><p><a href="${SITE}account.html" style="color:#f5c400">View your order</a></p></div>`;}
