import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {deliveryStage,flushDeliveryEmails} from '../supabase/functions/_shared/delivery.ts';
test('only explicit courier movement advances delivery',()=>{
 assert.equal(deliveryStage('AWB Assigned'),null);
 assert.equal(deliveryStage('Pickup Scheduled'),null);
 assert.equal(deliveryStage('In Transit'),'shipped');
 assert.equal(deliveryStage('Out For Delivery'),'out_for_delivery');
 assert.equal(deliveryStage('Delivered'),'delivered');
 assert.equal(deliveryStage('Undelivered'),null);
});
test('delivery failure stays queued; retry uses same idempotency key and existing invoice link',async()=>{
 const writes=[],sent=[];const row={order_id:'order-fixture',stage:'shipped',attempts:0};
 const order={id:row.order_id,order_number:'NV-fixture',customer_email:'fixture@example.invalid',payment_status:'paid',status:'shipped',tracking_number:'ABC123',courier_name:'Fixture'};
 const db={from(table){const q={select(){return q},is(){return q},lt(){return q},order(){return q},limit(){return Promise.resolve({data:[row]})},eq(){return q},maybeSingle(){return Promise.resolve({data:order})},update(v){writes.push(v);return q},then(resolve){return Promise.resolve({}).then(resolve)}};return q}};
 await flushDeliveryEmails(db,async()=>{throw Error('offline')});assert.equal(writes[0].sent_at,undefined);assert.equal(writes[0].attempts,1);
 await flushDeliveryEmails(db,async(...args)=>{sent.push(args);return {id:'provider-fixture'}});
 assert.equal(sent[0][0],order.customer_email);assert.equal(sent[0][3],'delivery/order-fixture/shipped');assert.match(sent[0][2],/track-order.html\?order=order-fixture/);assert.match(sent[0][2],/existing invoice/);assert.ok(writes[1].sent_at);
});
const html=await readFile(new URL('../track-order.html',import.meta.url),'utf8');
const script=await readFile(new URL('../track-order.js',import.meta.url),'utf8');
async function render(user,data){const dom=new JSDOM(html,{url:'https://nerdverseindia.com/track-order.html',runScripts:'outside-only'});const filters=[];let queried=false;const q={select(){queried=true;return q},eq(k,v){filters.push([k,v]);return q},order(){return Promise.resolve({data})}};dom.window.NV_AUTH={configured:true,user:async()=>user,client:{from:()=>q}};dom.window.eval(script);for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));return {dom,filters,queried:()=>queried};}
test('tracking requires sign-in and never queries customer orders anonymously',async()=>{const r=await render(null,[]);assert.equal(r.queried(),false);assert.match(r.dom.window.document.body.textContent,/Sign in with the email/);r.dom.window.close()});
test('tracking restricts owner, escapes details and shows out-for-delivery without a new invoice',async()=>{const r=await render({id:'owner-fixture'},[{id:'order-fixture',order_number:'<img src=x>',status:'shipped',delivery_status:'out_for_delivery',payment_status:'paid',tracking_number:'ABC123',created_at:'2026-10-23T10:00:00Z'}]);assert.deepEqual(r.filters,[['customer_id','owner-fixture']]);const d=r.dom.window.document;assert.equal(d.querySelectorAll('#trackingOrders img').length,0);assert.equal(d.querySelector('[aria-current]').textContent,'Out for delivery');assert.match(d.querySelector('#trackingOrders a').href,/receipt.html\?order=order-fixture/);r.dom.window.close()});
