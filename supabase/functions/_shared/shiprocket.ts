const BASE = 'https://apiv2.shiprocket.in/v1/external';
export class ShippingError extends Error {}
export function packedCart(products: any[], items: any[]) {
  let grams = 0, length = 0, width = 0, height = 0;
  for (const item of items) {
    const p = products.find(p => p.id === item.product_id);
    if (!p || p.status !== 'active' || Number(p.stock) < item.quantity) throw new ShippingError('A product is unavailable or has insufficient stock.');
    const dims = [p.length_cm, p.width_cm, p.height_cm].map(Number).sort((a,b) => b-a);
    if (!Number.isFinite(Number(p.weight_grams)) || Number(p.weight_grams) <= 0 || dims.some(n => !Number.isFinite(n) || n <= 0)) {
      throw new ShippingError('Delivery pricing for this item is being configured. Please contact nerdverseindia@gmail.com.');
    }
    grams += Number(p.weight_grams) * item.quantity;
    length = Math.max(length, dims[0]); width = Math.max(width, dims[1]); height += dims[2] * item.quantity;
  }
  // Dimensions are measured PACKED units; stack those units, never infer from the bare product.
  const box = {weight: Math.ceil(grams) / 1000, length, breadth: width, height};
  if (box.weight > 50 || Math.max(length,width,height) > 200) throw new ShippingError('This parcel needs a delivery quote from the store. Please contact nerdverseindia@gmail.com.');
  return box;
}
export function chooseRate(data: any) {
  const rows = data?.data?.available_courier_companies;
  if (!Array.isArray(rows)) throw new ShippingError('Delivery quotes are temporarily unavailable. Please try again.');
  const rates = rows.filter(r => !Number(r.blocked) && !r.odablock && Number(r.is_international||0)!==1 && !/fedex.*surface|aramex|gati.*surface/i.test(String(r.courier_name)) && Number.isFinite(Number(r.rate)) && Number(r.rate)>0 && Number(r.courier_company_id)>0 && typeof r.state === 'string')
    .sort((a,b) => Number(a.rate)-Number(b.rate));
  if (!rates.length) throw new ShippingError('Delivery is not available for this PIN code with the current parcel.');
  const r = rates[0];
  return {amount: Math.ceil(Number(r.rate)*100)/100, courier_id:Number(r.courier_company_id),courier_name:String(r.courier_name).slice(0,120),state:r.state,estimated_days:String(r.estimated_delivery_days||'').slice(0,60)};
}
export function createShiprocketClient(env: (key:string)=>string|undefined, transport:typeof fetch=fetch) {
  let token='', until=0;
  async function auth() {
    if(token && Date.now()<until)return token;
    const email=env('SHIPROCKET_EMAIL'),password=env('SHIPROCKET_PASSWORD');
    if(!email || !password)throw new ShippingError('Delivery setup is incomplete. Please contact the store.');
    const r=await transport(BASE+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password}),signal:AbortSignal.timeout(12000),redirect:'error'});
    const b=await r.json().catch(()=>({}));
    if(!r.ok || typeof b.token!=='string' || !b.token)throw new ShippingError('Delivery service could not connect. Please try again later.');
    token=b.token;until=Date.now()+8*24*60*60*1000;return token;
  }
  async function request(path:string, body?:any) {
    const key=await auth();
    const r=await transport(BASE+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000),redirect:'error'});
    if(r.status===401){token='';until=0;}
    const b=await r.json().catch(()=>({}));
    if(!r.ok)throw new ShippingError('Delivery service is temporarily unavailable.');
    return b;
  }
  return {request, async rates(pin:string,box:any,value:number){
    const chargeWeight=Math.ceil(Math.max(box.weight,box.length*box.breadth*box.height/5000)*1000)/1000;
    if(!Number.isFinite(chargeWeight)||chargeWeight<=0||chargeWeight>50)throw new ShippingError('This parcel needs a delivery quote from the store.');
    const query=new URLSearchParams({pickup_postcode:'560068',delivery_postcode:pin,cod:'0',weight:String(chargeWeight),length:String(box.length),breadth:String(box.breadth),height:String(box.height),declared_value:String(value)});
    return chooseRate(await request('/courier/serviceability/?'+query));
  }, async pickup(){
    const explicit=env('SHIPROCKET_PICKUP_LOCATION');if(explicit)return explicit;
    const b=await request('/settings/company/pickup');
    const rows=(b.data?.shipping_address||[]).filter((r:any)=>String(r.pin_code||r.pincode)==='560068' && r.pickup_location && (r.status==null||Number(r.status)!==0));
    const primary=rows.filter((r:any)=>Number(r.is_primary)===1);
    if(primary.length===1)return primary[0].pickup_location;
    if(rows.length===1)return rows[0].pickup_location;
    throw new ShippingError('Set SHIPROCKET_PICKUP_LOCATION to the saved pickup address nickname.');
  }};
}
export function createShippingService(db:any, client:ReturnType<typeof createShiprocketClient>) {
  const check=(r:any)=>{if(r.error)throw new ShippingError(r.error.message||'Delivery data unavailable.');return r.data;};
  async function quote(items:any[],pin:string) {
    const cart=check(await db.rpc('nv_shiprocket_cart',{p_items:items,p_pin:pin}));
    // Preserve the existing free-delivery policy while awaiting product measurements.
    if(Number(cart.subtotal)>2999 && cart.products.some((p:any)=>!p.weight_grams||!p.length_cm||!p.width_cm||!p.height_cm))return {subtotal:Number(cart.subtotal),shipping:0,total:Number(cart.subtotal)};
    const existing=check(await db.from('nv_shiprocket_quotes').select('*').eq('quote_key',cart.quote_key).gt('expires_at',new Date().toISOString()).maybeSingle());
    if(existing)return {subtotal:Number(cart.subtotal),shipping:Number(cart.subtotal)>2999?0:Number(existing.amount),total:Number(cart.subtotal)+(Number(cart.subtotal)>2999?0:Number(existing.amount)),courier:existing.details.courier_name};
    const box=packedCart(cart.products,items),rate=await client.rates(pin,box,Number(cart.subtotal));
    const details={...rate,box};
    check(await db.from('nv_shiprocket_quotes').upsert({quote_key:cart.quote_key,amount:rate.amount,details,expires_at:new Date(Date.now()+30*60*1000).toISOString()},{onConflict:'quote_key'}));
    return {subtotal:Number(cart.subtotal),shipping:Number(cart.subtotal)>2999?0:rate.amount,total:Number(cart.subtotal)+(Number(cart.subtotal)>2999?0:rate.amount),courier:rate.courier_name};
  }
  async function sync() {
    const pending=check(await db.rpc('nv_shiprocket_claim'))||[];
    for(const row of pending){
      let attempted=false;
      try{
        const s=check(await db.from('nv_phonepe_sessions').select('*').eq('order_id',row.order_id).eq('environment','production').eq('state','COMPLETED').maybeSingle());
        if(!s)throw new ShippingError('Verified paid session required.');
        const o=check(await db.from('orders').select('payment_status,status').eq('id',row.order_id).maybeSingle());
        if(o?.payment_status!=='paid'||['cancelled','refunded'].includes(o.status))throw new ShippingError('Order is not ready for shipping.');
        let d=s.shipping_details;
        if(!d?.box||!d.state){
          const products=check(await db.from('products').select('id,weight_grams,length_cm,width_cm,height_cm').in('id',s.items.map((i:any)=>i.product_id)));
          const owned=products.map((p:any)=>({...p,status:'active',stock:s.items.find((i:any)=>i.product_id===p.id).quantity}));
          const box=packedCart(owned,s.items),rate=await client.rates(s.customer.pin,box,Number(s.subtotal));
          d={...rate,box};
          check(await db.from('nv_phonepe_sessions').update({shipping_details:d}).eq('id',s.id));
        }
        const pickup=await client.pickup();
        const payload={order_id:s.merchant_order_id,order_date:new Date(s.created_at).toLocaleString('sv-SE',{timeZone:'Asia/Kolkata'}).slice(0,19),pickup_location:pickup,billing_customer_name:s.customer.name,billing_last_name:'',billing_address:s.customer.address,billing_city:s.customer.city,billing_pincode:s.customer.pin,billing_state:d.state,billing_country:'India',billing_email:s.customer.email,billing_phone:s.customer.phone,shipping_is_billing:true,order_items:s.items.map((i:any)=>({name:i.name,sku:i.sku||i.product_id,units:i.quantity,selling_price:Number(i.price)})),payment_method:'Prepaid',shipping_charges:Number(s.shipping),sub_total:Number(s.subtotal),...d.box};
        attempted=true; // Any ambiguous create response requires review; never blindly repeat a shipment.
        const response=await client.request('/orders/create/adhoc',payload);
        if(!Number(response.order_id)||!Number(response.shipment_id))throw new ShippingError('Provider order response requires review.');
        check(await db.from('nv_shiprocket_orders').update({status:'created',shiprocket_order_id:Number(response.order_id),shipment_id:Number(response.shipment_id),last_error:null,next_check_at:new Date().toISOString()}).eq('order_id',row.order_id));
      }catch(e){await db.from('nv_shiprocket_orders').update({status:attempted?'needs_review':'needs_setup',last_error:e instanceof ShippingError?e.message:'Delivery connection interrupted; review required.'}).eq('order_id',row.order_id);}
    }
    const tracking=check(await db.from('nv_shiprocket_orders').select('*').eq('status','created').lte('next_check_at',new Date().toISOString()).limit(3))||[];
    for(const row of tracking){try{
      await db.from('nv_shiprocket_orders').update({next_check_at:new Date(Date.now()+30*60*1000).toISOString()}).eq('order_id',row.order_id);
      const b=await client.request('/courier/track/shipment/'+row.shipment_id);
      const t=b.tracking_data?.shipment_track?.[0];if(!t)continue;
      const awb=String(t.awb_code||'');if(!/^[A-Za-z0-9\/-]{1,80}$/.test(awb))continue;
      const status=String(t.current_status||'').toLowerCase();
      const update:any={tracking_number:awb,courier_name:String(t.courier_name||'Shiprocket').slice(0,100),updated_at:new Date().toISOString()};
      if(status==='delivered')update.status='delivered';else if(['in transit','out for delivery','picked up'].includes(status))update.status='shipped';
      await db.from('orders').update(update).eq('id',row.order_id).eq('payment_status','paid').not('status','in','(cancelled,refunded,delivered)');
      if(status==='delivered')await db.from('nv_shiprocket_orders').update({status:'delivered'}).eq('order_id',row.order_id);
    }catch{/* Retried later. Tracking failures never change payment or inventory. */}}
  }
  return {quote,sync};
}
