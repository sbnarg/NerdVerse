import test from 'node:test';
import assert from 'node:assert/strict';
import {packedCart,chooseRate,createShiprocketClient,createShippingService} from '../supabase/functions/_shared/shiprocket.ts';
const p={id:'x',status:'active',stock:5,weight_grams:250,length_cm:40,width_cm:10,height_cm:10};
test('packed units include packaging and multi-unit parcels use a conservative stack',()=>{
 assert.deepEqual(packedCart([p],[{product_id:'x',quantity:2}]),{weight:0.5,length:40,breadth:10,height:20});
 assert.throws(()=>packedCart([{...p,weight_grams:null}],[{product_id:'x',quantity:1}]),/being configured/);
 assert.throws(()=>packedCart([{...p,height_cm:0}],[{product_id:'x',quantity:1}]),/being configured/);
 assert.throws(()=>packedCart([{...p,stock:0}],[{product_id:'x',quantity:1}]),/insufficient/);
});
test('invalid, blocked and nonserviceable quotes cannot become a delivery charge',()=>{
 const r={courier_company_id:1,courier_name:'Fixture courier',state:'West Bengal',rate:80.123};
 assert.equal(chooseRate({data:{available_courier_companies:[{...r,blocked:1,rate:1},r,{...r,rate:-1}]}}).amount,80.13);
 assert.throws(()=>chooseRate({data:{available_courier_companies:[]}}),/not available/);
 assert.throws(()=>chooseRate({status:500}),/temporarily/);
});
test('credentials remain server-side, token is cached, requests include dimensions and prepaid mode',async()=>{
 const calls=[];
 const c=createShiprocketClient(k=>k==='SHIPROCKET_EMAIL'?'fixture@example.invalid':'fixture-secret',async(url,init)=>{
 calls.push({url:String(url),init});
 return Response.json(String(url).endsWith('/auth/login')?{token:'fixture-token'}:{data:{available_courier_companies:[{rate:80,state:'West Bengal',courier_company_id:1,courier_name:'Fixture'}]}});
 });
 const box={weight:0.5,length:40,breadth:10,height:10};await c.rates('700001',box,199);await c.rates('560068',box,199);
 assert.equal(calls.filter(c=>c.url.endsWith('/auth/login')).length,1);
 const url=new URL(calls[1].url);assert.equal(url.searchParams.get('cod'),'0');assert.equal(url.searchParams.get('length'),'40');assert.equal(url.searchParams.get('weight'),'0.8');assert.equal(url.searchParams.get('pickup_postcode'),'560068');
 assert.equal(calls[1].init.headers.Authorization,'Bearer fixture-token');assert.equal(calls[1].url.includes('fixture-secret'),false);
});
test('provider authentication errors do not disclose the response body',async()=>{
 const c=createShiprocketClient(()=> 'fixture',async()=>Response.json({password:'secret-data'},{status:401}));
 await assert.rejects(c.rates('700001',{weight:0.5,length:10,breadth:10,height:10},199),e=>!e.message.includes('secret-data'));
});
function exportHarness(paid=true,ambiguous=false){
 let claimed=false,creates=0;const updates=[];
 const session={id:'s',order_id:'o',merchant_order_id:'NV-fixture',state:'COMPLETED',environment:'production',created_at:'2026-10-22T10:00:00Z',subtotal:199,shipping:80,total:279,customer:{name:'Fixture',address:'Fixture address',city:'Bengaluru',pin:'560068',email:'fixture@example.invalid',phone:'9000000000'},items:[{product_id:'p',name:'Fixture',quantity:1,price:199}],shipping_details:{state:'Karnataka',box:{weight:0.25,length:40,breadth:10,height:10}}};
 const db={async rpc(){if(claimed)return {data:[]};claimed=true;return {data:[{order_id:'o'}]}},from(table){const q={select(){return q},eq(){return q},lte(){return q},not(){return q},limit(){return Promise.resolve({data:[]})},async maybeSingle(){return {data:table==='nv_tax_invoices'?{invoice_number:'NV2627/000099',data:{total_paise:27900,lines:[{kind:'product',description:'Fixture',quantity:1,unit_gross_paise:19900,gst_rate:18,hsn:'4911'}]}}:table==='orders'?{payment_status:paid?'paid':'pending',status:'confirmed'}:session}},update(value){updates.push({table,value});return q},then(resolve,reject){return Promise.resolve({data:null}).then(resolve,reject)}};return q}};
 const client={async pickup(){return 'Fixture pickup'},async rates(){throw Error('Not expected')},async request(path){assert.equal(path,'/orders/create/adhoc');creates++;if(ambiguous)throw Error('timeout');return {order_id:100,shipment_id:200}}};
 return {service:createShippingService(db,client),updates,get creates(){return creates}};
}
test('only paid orders export and ambiguous exports require review without another create',async()=>{
 const unpaid=exportHarness(false);await unpaid.service.sync();assert.equal(unpaid.creates,0);
 const uncertain=exportHarness(true,true);await uncertain.service.sync();await uncertain.service.sync();assert.equal(uncertain.creates,1);assert.ok(uncertain.updates.some(x=>x.value.status==='needs_review'));
 const paid=exportHarness();await paid.service.sync();assert.equal(paid.creates,1);assert.ok(paid.updates.some(x=>x.value.shipment_id===200&&x.value.status==='created'));
});
