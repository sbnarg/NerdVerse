import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {JSDOM} from 'jsdom';
const html=await readFile(new URL('../receipt.html',import.meta.url),'utf8'),script=await readFile(new URL('../receipt.js',import.meta.url),'utf8');
const id='11111111-1111-4111-8111-111111111111';
async function page({anonymous=false,owner='user-fixture',state='paid'}={}){
 const d=new JSDOM(html,{url:'https://nerdverseindia.com/receipt.html?order='+id,runScripts:'outside-only'}),w=d.window,calls=[];
 const q={select(s){calls.push(['select',s]);return this},eq(k,v){calls.push([k,v]);return this},async maybeSingle(){return {data:{id,customer_id:owner,currency:'INR',payment_status:state,order_number:'NV-FIXTURE',created_at:'2026-10-22T15:00:00Z',customer_name:'<img src=x onerror=alert(1)>',customer_email:'fixture@example.invalid',shipping_address:{address:'Fixture address',city:'Bengaluru',pin:'560068'},subtotal:199,shipping_amount:127.72,total:326.72,payment_method:'phonepe',order_items:[{product_name:'<script>unsafe</script>',quantity:1,unit_price:199,total_price:199}]}}}};
 w.NV_AUTH={user:async()=>anonymous?null:{id:'user-fixture'},client:{from(t){calls.push(['table',t]);return q}}};
 w.eval(script);for(let n=0;n<8;n++)await new Promise(setImmediate);return {d,w,calls};
}
test('paid customer receipt uses stored totals, escapes text, and is explicitly distinct from a GST invoice',async()=>{
 const {d,w,calls}=await page();try{
 assert.equal(w.document.getElementById('receipt').hidden,false);assert.match(w.document.getElementById('receiptTotals').textContent,/326.72/);
 assert.deepEqual(calls.filter(x=>x[0]==='customer_id'),[['customer_id','user-fixture']]);
 assert.equal(w.document.querySelectorAll('#receiptCustomer img,#receiptItems script').length,0);
 assert.match(w.document.querySelector('.note').textContent,/not a GST tax invoice/);assert.equal(w.document.getElementById('printReceipt').hidden,false);
 }finally{d.window.close()}
});
test('anonymous, different-owner and unpaid receipts remain hidden',async()=>{
 for(const options of [{anonymous:true},{owner:'another-customer'},{state:'pending'}]){const {d,w}=await page(options);assert.equal(w.document.getElementById('receipt').hidden,true);assert.equal(w.document.getElementById('printReceipt').hidden,true);d.window.close()}
});
