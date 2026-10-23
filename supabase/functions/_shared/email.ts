import {invoiceEmailHtml} from './invoice.ts';
const API='https://api.resend.com/emails';const SITE='https://nerdverseindia.com/';
const FROM='NerdVerse India <no-reply@nerdverseindia.com>';
export function emailConfiguration(){
 const key=Boolean(Deno.env.get('RESEND_API_KEY'));
 return {configured:key,provider_configured:key,sender_configured:true,sender:'no-reply@nerdverseindia.com'};
}
export async function sendEmail(to:string,subject:string,html:string,idempotencyKey?:string){
 const config=emailConfiguration();
 if(!config.configured)return {skipped:true,reason:!config.provider_configured?'email_provider_not_configured':'email_sender_not_configured'};
 const r=await fetch(API,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error',headers:{Authorization:`Bearer ${Deno.env.get('RESEND_API_KEY')}`,'Content-Type':'application/json',...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:JSON.stringify({from:FROM,reply_to:'nerdverseindia@gmail.com',to:[to],subject,html})});
 let data;try{data=await r.json()}catch{throw Error('email_provider_invalid_response')}
 if(!r.ok)throw Error(r.status===401||r.status===403?'email_provider_auth_or_sender_error':'email_provider_request_failed');
 if(typeof data.id!=='string'||!data.id)throw Error('email_provider_invalid_response');
 return {id:data.id};
}
export function orderConfirmationEmail(s:any,invoice:any=null){
 const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const money=(v:unknown)=>'₹'+Number(v||0).toFixed(2);
 const lines=(Array.isArray(s.items)?s.items:[]).map((i:any)=>`<tr><td style="padding:10px 0">${escape(i.name)} × ${Number(i.quantity)}</td><td style="text-align:right">${money(Number(i.price)*Number(i.quantity))}</td></tr>`).join('');
 return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#202020"><h1>NerdVerse India</h1><h2>Your order is confirmed</h2><p>Hello ${escape(s.customer?.name||'collector')},</p><p>Your payment has been confirmed.</p><p><strong>Order reference:</strong> ${escape(s.merchant_order_id)}</p><table style="border-collapse:collapse;width:100%">${lines}<tr><td style="padding:10px 0">Shipping</td><td style="text-align:right">${money(s.shipping)}</td></tr><tr><td style="padding:10px 0"><strong>Total paid</strong></td><td style="text-align:right"><strong>${money(s.total)}</strong></td></tr></table>${invoice?invoiceEmailHtml(invoice):"<p>Your tax invoice is awaiting tax-detail verification and will appear under My orders once issued.</p>"}<p><a href="${SITE}receipt.html?order=${encodeURIComponent(s.order_id)}">View order documents / save invoice as PDF</a></p><p>Sign in with the account used for this order to view your documents.</p><p><a href="${SITE}track-order.html?order=${encodeURIComponent(s.order_id)}">Track your order</a></p><p>Questions? Reply to this message or contact nerdverseindia@gmail.com.</p><p>Thank you,<br>NerdVerse India</p></div>`;
}
export function statusEmail(o:any){
 const esc=(v:any)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 const messages:any={processing:['Order processing','Your order is being prepared.'],packed:['Order packed','Your order is packed and waiting for dispatch.'],shipped:['Order dispatched','Your parcel has been handed to the courier.'],out_for_delivery:['Out for delivery','Your parcel is out for delivery.'],delivered:['Order delivered','The courier has marked your parcel delivered.'],cancelled:['Order cancelled','Your order has been cancelled.'],refunded:['Payment refunded','Your payment has been marked refunded.']};
 const [title,message]=messages[o.status]||['Order update','Your order status has changed.'];
 return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#202020"><h1>NerdVerse India</h1><h2>${title}</h2><p>Order ${esc(o.order_number)}</p><p>${message}</p>${o.tracking_number?`<p>Courier: ${esc(o.courier_name||'Shiprocket')}<br>AWB: <strong>${esc(o.tracking_number)}</strong></p>`:''}<p><a href="${SITE}track-order.html?order=${encodeURIComponent(o.id)}">Track your order</a> · Sign in with your order account.</p><p><a href="${SITE}receipt.html?order=${encodeURIComponent(o.id)}">View your existing invoice</a></p><p>This delivery update does not create a new invoice.</p><p>Questions? Reply to this email.</p></div>`;
}
