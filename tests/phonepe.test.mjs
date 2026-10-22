import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhonePeClient, isPhonePePaymentComplete } from '../supabase/functions/_shared/phonepe.ts';
const config = {environment:'sandbox',clientId:'test',clientVersion:'1',clientSecret:'test-secret'};
const json = data => new Response(JSON.stringify(data), {headers:{'Content-Type':'application/json'}});
function mockClient(response = {orderId:'OMO123',redirectUrl:'https://mercury-uat.phonepe.com/transact/test'}) {
  const calls = [];
  const client = createPhonePeClient(config, async (url, options) => {
    calls.push({url, options});
    return json(url.endsWith('/token') ? {access_token:'test-token',expires_at:Math.floor(Date.now()/1000)+3600} : response);
  });
  return {client,calls};
}
test('sandbox auth, checkout payload, token reuse and status endpoint', async () => {
  const {client,calls} = mockClient();
  await client.createPayment('NV-123',499900,'https://nerdverseindia.com/checkout.html');
  await client.orderStatus('NV-123');
  assert.equal(calls.length,3);
  assert.equal(calls[0].url,'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token');
  assert.equal(calls[0].options.body.get('grant_type'),'client_credentials');
  assert.equal(calls[1].options.headers.Authorization,'O-Bearer test-token');
  const body = JSON.parse(calls[1].options.body);
  assert.equal(body.amount,499900);
  assert.equal(body.merchantOrderId,'NV-123');
  assert.equal(body.paymentFlow.type,'PG_CHECKOUT');
  assert.match(calls[2].url,/\/NV-123\/status\?details=false$/);
});
test('reject invalid amounts, identifiers and return origins before network access', async () => {
  const {client,calls} = mockClient();
  for (const amount of [0,-1,99,100.5,NaN,Infinity]) await assert.rejects(client.createPayment('NV-123',amount,'https://nerdverseindia.com/checkout.html'));
  await assert.rejects(client.createPayment('../other',100,'https://nerdverseindia.com/checkout.html'));
  await assert.rejects(client.createPayment('NV-123',100,'https://evil.example/'));
  assert.equal(calls.length,0);
});
test('reject malicious gateway redirects', async () => {
  for (const redirectUrl of ['https://evil.example','https://mercury-uat.phonepe.com.evil.example','http://mercury-uat.phonepe.com','https://user:pass@mercury-uat.phonepe.com']) {
    const {client} = mockClient({orderId:'OMO123',redirectUrl});
    await assert.rejects(client.createPayment('NV-123',100,'https://nerdverseindia.com/checkout.html'));
  }
});
test('payment completion requires provider ID, exact amount, currency and final state', () => {
  const valid = {orderId:'OMO123',state:'COMPLETED',amount:499900};
  assert.equal(isPhonePePaymentComplete(valid,'OMO123',499900),true);
  for (const patch of [{state:'PENDING'},{state:'FAILED'},{orderId:'other'},{amount:1},{currency:'USD'}]) {
    assert.equal(isPhonePePaymentComplete({...valid,...patch},'OMO123',499900),false);
  }
});
test('production uses production endpoints and failures do not leak secrets', async () => {
  const urls=[];
  const client=createPhonePeClient({...config,environment:'production'},async url=>{
    urls.push(url);
    return url.endsWith('/token') ? json({access_token:'test',expires_at:Math.floor(Date.now()/1000)+3600}) : new Response('private details',{status:500});
  });
  await assert.rejects(client.orderStatus('NV-123'), /reconcile/);
  assert.equal(urls[0],'https://api.phonepe.com/apis/identity-manager/v1/oauth/token');
  assert.match(urls[1],/^https:\/\/api.phonepe.com\/apis\/pg\/checkout/);
});


test('production accepts both exact PhonePe checkout hosts and rejects lookalikes', async () => {
 for (const host of ['mercury.phonepe.com','mercury-t2.phonepe.com','mercury-t2.phonepe.com.evil.example','mercury-uat.phonepe.com']) {
  const client=createPhonePeClient({...config,environment:'production'},async url=>json(url.endsWith('/token') ? {access_token:'test',expires_at:Math.floor(Date.now()/1000)+3600} : {orderId:'OMO123',redirectUrl:`https://${host}/transact/pgv2?token=fixture`}));
  const attempt=client.createPayment('NV-123',100,'https://nerdverseindia.com/checkout.html');
  if (['mercury.phonepe.com','mercury-t2.phonepe.com'].includes(host)) assert.match((await attempt).redirectUrl,/phonepe.com/);
  else await assert.rejects(attempt);
 }
});
