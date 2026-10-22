import test from 'node:test';
import assert from 'node:assert/strict';
import {sendEmail,emailConfiguration} from '../supabase/functions/_shared/email.ts';
test('email setup failures are explicit and never send through the development sender',async()=>{
 const original=globalThis.fetch;let calls=0;const values={};globalThis.Deno={env:{get:k=>values[k]}};globalThis.fetch=async()=>{calls++;throw Error('unexpected fetch')};
 try {
 assert.equal((await sendEmail('fixture@example.invalid','test','<p>test</p>')).reason,'email_provider_not_configured');
 values.RESEND_API_KEY='fixture-secret';values.EMAIL_FROM='NerdVerse <onboarding@resend.dev>';
 assert.equal((await sendEmail('fixture@example.invalid','test','<p>test</p>')).reason,'email_sender_not_configured');
 assert.equal(emailConfiguration().configured,false);assert.equal(calls,0);
 }finally{globalThis.fetch=original;delete globalThis.Deno;}
});
test('email sends retain provider idempotency and require a provider receipt',async()=>{
 const original=globalThis.fetch;globalThis.Deno={env:{get:k=>({RESEND_API_KEY:'fixture-secret',EMAIL_FROM:'NerdVerse <orders@example.invalid>'})[k]}};
 try {
 let request;globalThis.fetch=async(url,options)=>{request={url,options};return Response.json({id:'fixture-receipt'})};
 assert.deepEqual(await sendEmail('fixture@example.invalid','confirmed','<p>paid</p>','paid/fixture'),{id:'fixture-receipt'});
 assert.equal(request.options.headers['Idempotency-Key'],'paid/fixture');assert.equal(request.options.redirect,'error');
 globalThis.fetch=async()=>Response.json({message:'private provider detail'},{status:403});
 await assert.rejects(sendEmail('fixture@example.invalid','test','test'),/^Error: email_provider_auth_or_sender_error$/);
 globalThis.fetch=async()=>Response.json({});await assert.rejects(sendEmail('fixture@example.invalid','test','test'),/email_provider_invalid_response/);
 }finally{globalThis.fetch=original;delete globalThis.Deno;}
});
