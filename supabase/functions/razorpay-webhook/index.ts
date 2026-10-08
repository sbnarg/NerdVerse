import {createClient} from 'npm:@supabase/supabase-js@2';
import {sendEmail,statusEmail} from '../_shared/email.ts';
const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
async function sig(s:string,k:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(k),{name:'HMAC',hash:'SHA-256'},false,['sign']);const b=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(s));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
Deno.serve(async req=>{
  if(req.method!=='POST')return new Response('method not allowed',{status:405});
  try{
    const raw=await req.text(),secret=Deno.env.get('RAZORPAY_WEBHOOK_SECRET')||'',received=req.headers.get('X-Razorpay-Signature')||'';
    if(!secret||!received||received!==await sig(raw,secret))return new Response('invalid signature',{status:401});
    const e=JSON.parse(raw);
    // A failed attempt does not mean the order has failed: customers can retry.
    // Do not cancel or release inventory here until an atomic release RPC exists.
    if(e.event==='payment.failed')return new Response('ok');
    if(e.event!=='payment.captured'&&e.event!=='order.paid')return new Response('ok');
    const payment=e?.payload?.payment?.entity;
    const orderEntity=e?.payload?.order?.entity;
    const razorpayOrderId=payment?.order_id??orderEntity?.id;
    if(!razorpayOrderId)return new Response('missing Razorpay order id',{status:422});
    // order.paid can arrive without a payment entity. Do not mark paid until a
    // captured payment ID is present; Razorpay can retry or payment.captured arrives.
    if(!payment?.id||payment.status!=='captured')return new Response('captured payment details required',{status:422});
    const {data:o,error:lookupError}=await admin.from('orders').select('*').eq('razorpay_order_id',razorpayOrderId).maybeSingle();
    if(lookupError)return new Response('order lookup failed',{status:503});
    if(!o)return new Response('order not found',{status:503});
    if(payment.currency!=='INR'||payment.amount!==Math.round(Number(o.total)*100))return new Response('payment amount or currency mismatch',{status:409});
    if(o.payment_status==='paid')return new Response(o.razorpay_payment_id===payment.id?'ok':'payment mismatch',{status:o.razorpay_payment_id===payment.id?200:409});
    if(o.payment_status!=='pending')return new Response('order state conflict',{status:409});
    const next={status:'confirmed',payment_status:'paid',razorpay_payment_id:payment.id,updated_at:new Date().toISOString()};
    const {data:updated,error:updateError}=await admin.from('orders').update(next).eq('id',o.id).eq('payment_status','pending').select('id').maybeSingle();
    if(updateError)return new Response('payment update failed',{status:503});
    if(!updated){
      const {data:current,error:readError}=await admin.from('orders').select('payment_status,razorpay_payment_id').eq('id',o.id).single();
      if(readError||current?.payment_status!=='paid'||current?.razorpay_payment_id!==payment.id)return new Response('payment state conflict',{status:409});
      return new Response('ok');
    }
    try{await sendEmail(o.customer_email,'NerdVerse India — Payment confirmed',statusEmail({...o,...next}),`paid/${o.id}`)}catch(_){}
    return new Response('ok');
  }catch(_){return new Response('error',{status:500})}
});