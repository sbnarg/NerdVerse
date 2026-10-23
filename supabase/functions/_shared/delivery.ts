import {statusEmail} from './email.ts';
export function deliveryStage(value:unknown){
 const s=String(value||'').toLowerCase().trim();
 if(s==='delivered')return 'delivered';
 if(s==='out for delivery')return 'out_for_delivery';
 if(['in transit','picked up','shipped'].includes(s))return 'shipped';
 return null;
}
export async function flushDeliveryEmails(db:any,sendEmail:any){
 const {data:rows,error}=await db.from('nv_delivery_email_queue').select('order_id,stage,attempts,created_at').is('sent_at',null).lt('attempts',10).order('created_at').limit(10);
 if(error)throw Error('delivery_queue_unavailable');
 for(const row of rows||[]){try{
  const {data:o,error:readError}=await db.from('orders').select('id,order_number,customer_email,payment_status,status,total,tracking_number,courier_name').eq('id',row.order_id).maybeSingle();
  if(readError)throw Error('delivery_order_unavailable');
  if(!o||o.payment_status!=='paid'||['cancelled','refunded'].includes(o.status))continue;
  const label=String(row.stage).replaceAll('_',' ');
  const sent=await sendEmail(o.customer_email,'NerdVerse India — '+label,statusEmail({...o,status:row.stage}),'delivery/'+row.order_id+'/'+row.stage);
  if(sent?.skipped)continue;
  const {error:saveError}=await db.from('nv_delivery_email_queue').update({sent_at:new Date().toISOString(),provider_id:sent.id,last_error:null,attempts:row.attempts+1}).eq('order_id',row.order_id).eq('stage',row.stage);
  if(saveError)throw Error('delivery_receipt_save_failed');
 }catch{
  await db.from('nv_delivery_email_queue').update({attempts:row.attempts+1,last_error:'delivery_email_failed'}).eq('order_id',row.order_id).eq('stage',row.stage);
 }}
}
