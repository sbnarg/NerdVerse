import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhonePeService,sha256,verifyPhonePeWebhook,validateItems} from '../supabase/functions/_shared/phonepe-service.ts';
const uid='11111111-1111-4111-8111-111111111111', sid='33333333-3333-4333-8333-333333333333', pid='22222222-2222-4222-8222-222222222222';
const user={id:uid,email:'test@example.invalid',email_confirmed_at:'2026-10-17'};
const config={enabled:true,credentials:{clientId:'test',clientVersion:'1',clientSecret:'never-return-this'},webhook:{username:'hook',password:'secret'},worker:'private-worker-secret'};
const session={id:sid,user_id:uid,environment:'sandbox',merchant_order_id:'NV-'+'a'.repeat(32),provider_order_id:'OMO-TEST',state:'PENDING',total:4999,subtotal:4999,shipping:0,customer:{email:user.email}};
function harness(options={}) {
 const calls=[],background=[];
 const db={
  async rpc(name,args){calls.push({name,args});if(name==='nv_phonepe_runtime')return {data:config};if(name==='nv_phonepe_attach')return {data:session};if(name==='nv_phonepe_reserve')return {data:{...session,...options.session}};if(name==='nv_phonepe_apply_status')return {data:{...session,state:args.p_state}};if(name==='nv_phonepe_quote')return {data:{subtotal:4999,shipping:0,total:4999}};throw Error('Unexpected RPC '+name);},
  from(table){let mutation;
   const query={select(){return query},eq(){return query},is(){return query},lt(){return query},not(){return query},order(){return query},limit(){return Promise.resolve({data:[]})},
    update(data){mutation=data;calls.push({table,update:data});return query},
    async maybeSingle(){if(table==='admin_users')return {data:options.admin===false?null:{role:'admin'}};if(mutation?.initiation_claimed_at)return {data:options.race?null:{id:sid}};return {data:options.noSession?null:{...session,...options.session}};},
    then(resolve,reject){return Promise.resolve({data:null,error:options.dbWriteFails?{message:'failed'}:null}).then(resolve,reject)}
   };return query;
  }
 };
 const provider=()=>({async createPayment(){calls.push({provider:'create'});if(options.createFails)throw Error('timeout');return {providerOrderId:'OMO-TEST',redirectUrl:'https://mercury-uat.phonepe.com/transact/test'}},async orderStatus(){calls.push({provider:'status'});return options.status||{orderId:'OMO-TEST',state:'PENDING',amount:499900}}});
 const service=createPhonePeService({db,authenticate:async()=>options.anonymous?null:user,sendEmail:async()=>({skipped:true}),background:p=>background.push(p),provider});
 const post=(body,headers={})=>new Request('https://example.invalid/functions/v1/phonepe-checkout',{method:'POST',headers,body:JSON.stringify(body)});
 return {service,calls,post,background};
}
test('public config contains no provider secrets and sandbox access is restricted',async()=>{
 const h=harness({anonymous:true,admin:false});
 const r=await h.service.checkout(h.post({action:'config'}));const body=await r.text();
 assert.equal(r.status,200);assert.equal(body.includes('never-return-this'),false);assert.equal(body.includes('private-worker'),false);
 assert.equal((await h.service.checkout(h.post({action:'config',environment:'sandbox'}))).status,403);
});
test('anonymous clients cannot create payments or query payment sessions',async()=>{
 const h=harness({anonymous:true,admin:false});
 assert.equal((await h.service.checkout(h.post({action:'create'}))).status,401);
 assert.equal((await h.service.checkout(h.post({action:'status',session_id:sid}))).status,401);
 assert.equal(h.calls.some(x=>x.name==='nv_phonepe_reserve'),false);
});
test('session ownership and environment are checked before provider lookup',async()=>{
 for(const data of [{user_id:'another-user'},{environment:'production'}]){
  const h=harness({session:data});const r=await h.service.checkout(h.post({action:'status',environment:'sandbox',session_id:sid}));
  assert.equal(r.status,404);assert.equal(h.calls.some(x=>x.provider==='status'),false);
 }
});
test('create prices on the server, replaces supplied email and returns only the persisted session',async()=>{
 const h=harness();const r=await h.service.checkout(h.post({action:'create',environment:'sandbox',request_key:crypto.randomUUID(),items:[{product_id:pid,quantity:1,price:1}],customer:{name:'Test',email:'attacker@example.invalid'}}));
 assert.equal(r.status,200);const body=await r.json();assert.match(body.redirect_url,/mercury-uat/);
 const rpc=h.calls.find(x=>x.name==='nv_phonepe_reserve');assert.equal(rpc.args.p_customer.email,user.email);assert.equal('price' in rpc.args.p_items[0],false);
 assert.equal(body.total,4999);assert.equal('customer' in body,false);assert.equal('credentials' in body,false);
});
test('ambiguous provider timeout returns a pending session without releasing inventory',async()=>{
 const h=harness({createFails:true});const r=await h.service.checkout(h.post({action:'create',environment:'sandbox',request_key:crypto.randomUUID(),items:[{product_id:pid,quantity:1}]}));
 assert.equal(r.status,202);assert.equal((await r.json()).session_id,sid);
 assert.equal(h.calls.some(x=>/release|cancel/.test(x.name||'')),false);
});
test('retries and racing requests do not initiate a second payment',async()=>{
 for(const opts of [{session:{initiation_claimed_at:'2026-10-17'}},{race:true}]){
  const h=harness(opts);await h.service.checkout(h.post({action:'create',environment:'sandbox',request_key:crypto.randomUUID(),items:[{product_id:pid,quantity:1}]}));
  assert.equal(h.calls.some(x=>x.provider==='create'),false);
 }
});
test('webhooks reject invalid authorization and never trust callback completion as proof',async()=>{
 const h=harness();const body={event:'checkout.order.completed',payload:{merchantOrderId:session.merchant_order_id,state:'COMPLETED',amount:1}};
 assert.equal((await h.service.webhook(new Request('https://example.invalid/?environment=sandbox',{method:'POST',body:JSON.stringify(body)}))).status,401);
 const header=await sha256('hook:secret');
 const r=await h.service.webhook(new Request('https://example.invalid/?environment=sandbox',{method:'POST',headers:{Authorization:header},body:JSON.stringify(body)}));
 assert.equal(r.status,200);await Promise.all(h.background);
 const applied=h.calls.find(x=>x.name==='nv_phonepe_apply_status');assert.equal(applied.args.p_state,'PENDING');assert.equal(applied.args.p_amount,499900);
});
test('SHA verification and cart validation reject malformed or duplicate inputs',async()=>{
 assert.equal(await verifyPhonePeWebhook(await sha256('hook:secret'),config.webhook),true);
 assert.equal(await verifyPhonePeWebhook('incorrect',config.webhook),false);
 assert.equal(await verifyPhonePeWebhook(null,config.webhook),false);
 for(const items of [[],[{product_id:pid,quantity:0}],[{product_id:pid,quantity:1},{product_id:pid.toUpperCase(),quantity:1}]])assert.throws(()=>validateItems(items));
});
test('forged browser completion status is ignored; server queries PhonePe',async()=>{
 const h=harness();const r=await h.service.checkout(h.post({action:'status',environment:'sandbox',session_id:sid,state:'COMPLETED',amount:1}));
 assert.equal((await r.json()).state,'PENDING');assert.equal(h.calls.some(x=>x.provider==='status'),true);
});
