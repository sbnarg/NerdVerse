import test from 'node:test';
import assert from 'node:assert/strict';
import {sendEmail,emailConfiguration,orderConfirmationEmail} from '../supabase/functions/_shared/email.ts';
test('email setup failure is explicit and no-reply sender is configured without exposing credentials',async()=>{
 const original=globalThis.fetch;let calls=0;const values={};globalThis.Deno={env:{get:k=>values[k]}};globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch')};
 try {
 assert.equal((await sendEmail('fixture@example.invalid','test','<p>test</p>')).reason,'email_provider_not_configured');
 assert.equal(emailConfiguration().configured,false);assert.equal(calls,0);
 assert.equal(emailConfiguration().sender,'no-reply@nerdverseindia.com');
 }finally{globalThis.fetch=original;delete globalThis.Deno;}
});
test('email sends retain provider idempotency and require a provider receipt',async()=>{
 const original=globalThis.fetch;globalThis.Deno={env:{get:k=>({RESEND_API_KEY:'fixture-secret',EMAIL_FROM:'NerdVerse <orders@example.invalid>'})[k]}};
 try {
 let request;globalThis.fetch=async(url,options)=>{request={url,options};return Response.json({id:'fixture-receipt'})};
 assert.deepEqual(await sendEmail('fixture@example.invalid','confirmed','<p>paid</p>','paid/fixture'),{id:'fixture-receipt'});
 assert.equal(request.options.headers['Idempotency-Key'],'paid/fixture');assert.equal(request.options.redirect,'error');
 assert.equal(JSON.parse(request.options.body).from,'NerdVerse India <no-reply@nerdverseindia.com>');
 assert.equal(JSON.parse(request.options.body).reply_to,'nerdverseindia@gmail.com');
 globalThis.fetch=async()=>Response.json({message:'private provider detail'},{status:403});
 await assert.rejects(sendEmail('fixture@example.invalid','test','test'),/^Error: email_provider_auth_or_sender_error$/);
 globalThis.fetch=async()=>Response.json({});await assert.rejects(sendEmail('fixture@example.invalid','test','test'),/email_provider_invalid_response/);
 }finally{globalThis.fetch=original;delete globalThis.Deno;}
});
test('automatic confirmation includes saved items, secure receipt link and correctly escapes names',()=>{
 const body=orderConfirmationEmail({order_id:'fixture-order',merchant_order_id:'NV-TEST',customer:{name:'<img>'},items:[{name:'<script>',quantity:1,price:199}],shipping:127.72,total:326.72});
 assert.match(body,/receipt.html\?order=fixture-order/);assert.match(body,/₹326.72/);assert.match(body,/₹127.72/);
 assert.match(body,/&lt;script&gt;/);assert.doesNotMatch(body,/<script>|<img>/);assert.match(body,/awaiting tax-detail verification/);
});
