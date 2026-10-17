import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
const {JSDOM}=await import(process.env.JSDOM_MODULE_PATH||'jsdom');
const html=await readFile(new URL('../checkout.html',import.meta.url),'utf8');
const script=await readFile(new URL('../checkout.js',import.meta.url),'utf8');
const sid='33333333-3333-4333-8333-333333333333';
const cart=[{id:'22222222-2222-4222-8222-222222222222',name:'<img src=x onerror=alert(1)>',price:1,qty:1}];
async function page({url='https://nerdverseindia.com/checkout.html',saved=JSON.stringify(cart),enabled=false,anonymous=false,fail=false,status='COMPLETED'}={}){
 const dom=new JSDOM(html,{url,runScripts:'outside-only'}),w=dom.window,calls=[];
 w.localStorage.setItem('nv-cart',saved);
 Object.defineProperty(w,'crypto',{value:webcrypto});w.AbortSignal=AbortSignal;
 w.NV_AUTH={user:async()=>anonymous?null:{email:'test@example.invalid',user_metadata:{full_name:'Tester'}},session:async()=>anonymous?null:{access_token:'fixture-user-token'}};
 w.NV_CONFIG={supabaseUrl:'https://fixture.example.invalid',supabasePublishableKey:'fixture-public-key'};
 w.fetch=async(_url,options)=>{
  const body=JSON.parse(options.body);calls.push(body);
  if(fail)throw Error('Network failure');
  const response=body.action==='config'?{enabled,sandbox_available:false}:body.action==='quote'?{subtotal:4999,shipping:0,total:4999}:body.action==='create'?{session_id:sid,state:'COMPLETED'}:{state:status,environment:'production',order_number:'NV-TEST',subtotal:4999,shipping:0,total:4999};
  return new Response(JSON.stringify(response),{status:200});
 };
 w.eval(script);await flush();return {dom,w,calls};
}
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
test('production disabled or unreachable keeps the payment button disabled',async()=>{
 for(const fail of [false,true]){const {dom,w}=await page({fail});assert.equal(w.document.querySelector('button[type=submit]').disabled,true);assert.match(w.document.getElementById('checkoutMsg').textContent,/not yet available/);dom.window.close();}
});
test('damaged cart storage does not break the checkout page',async()=>{
 const {dom,w}=await page({saved:'{broken',enabled:true});assert.equal(w.document.querySelector('button[type=submit]').disabled,true);assert.equal(w.document.getElementById('checkoutItems').textContent,'Your cart is empty.');dom.window.close();
});
test('cart names are rendered as text, and signed-in email is readonly',async()=>{
 const {dom,w}=await page({enabled:true});assert.equal(w.document.getElementById('checkoutItems').querySelectorAll('img').length,0);assert.equal(w.document.querySelector('input[name=email]').readOnly,true);dom.window.close();
});
test('payment return queries the server and does not trust success URL parameters',async()=>{
 const {dom,w,calls}=await page({url:`https://nerdverseindia.com/checkout.html?payment_session=${sid}&status=success`});
 assert.equal(calls[0].action,'status');assert.match(w.document.getElementById('checkoutMsg').textContent,/Payment confirmed/);assert.equal(w.document.querySelector('button[type=submit]').disabled,true);dom.window.close();
});
test('submission sends product quantities, obtains server totals and retains an idempotency key',async()=>{
 const {dom,w,calls}=await page({enabled:true});
 const values={name:'Tester',phone:'9000000000',address:'Fixture address',city:'Bengaluru',pin:'560068'};
 for(const [name,value]of Object.entries(values))w.document.querySelector(`[name=${name}]`).value=value;
 w.document.getElementById('checkoutForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await flush();
 const create=calls.find(x=>x.action==='create');assert.ok(create);assert.ok(create.request_key);assert.deepEqual(create.items,[{product_id:cart[0].id,quantity:1}]);assert.equal('price' in create.items[0],false);assert.equal(w.document.getElementById('checkoutTotal').textContent,'₹4,999');
 assert.match(w.document.getElementById('checkoutMsg').textContent,/Payment confirmed/);dom.window.close();
});
