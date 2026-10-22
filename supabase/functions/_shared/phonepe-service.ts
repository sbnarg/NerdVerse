import { createPhonePeClient } from './phonepe.ts';
const SITE = 'https://nerdverseindia.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cors = { 'Access-Control-Allow-Origin': SITE, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class RequestError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function constantTimeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function verifyPhonePeWebhook(header: string | null, credentials: any) {
  if (!credentials?.username || !credentials?.password || !header) return false;
  return constantTimeEqual(header, await sha256(`${credentials.username}:${credentials.password}`));
}
export function validateItems(items: any) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 30) throw new RequestError('Cart must contain 1 to 30 products');
  const seen = new Set();
  return items.map(x => {
    if (!x || typeof x.product_id !== 'string' || !UUID.test(x.product_id) || seen.has(x.product_id.toLowerCase()) || !Number.isInteger(x.quantity) || x.quantity < 1 || x.quantity > 20) throw new RequestError('Invalid or duplicate cart item');
    seen.add(x.product_id.toLowerCase());
    return { product_id: x.product_id.toLowerCase(), quantity: x.quantity };
  }).sort((a, b) => a.product_id.localeCompare(b.product_id));
}
type Dependencies = { db: any; authenticate: (req: Request) => Promise<any>; sendEmail: (...args: any[]) => Promise<any>; background: (task: Promise<unknown>) => void; provider?: typeof createPhonePeClient; shipping?: {quote:(items:any[],pin:string)=>Promise<any>;sync:()=>Promise<void>} };
export function createPhonePeService(deps: Dependencies) {
  const db = deps.db;
  const check = (r: any) => { if (r.error) throw new Error('Payment database operation failed'); return r.data; };
  async function runtime(environment: string) {
    return check(await db.rpc('nv_phonepe_runtime', { p_environment: environment }));
  }
  function provider(environment: string, config: any) {
    if (!config?.credentials) throw new RequestError('Payment setup is incomplete', 503);
    return (deps.provider || createPhonePeClient)({ ...config.credentials, environment: environment as 'sandbox' | 'production' });
  }
  async function isAdmin(id: string) {
    const { data, error } = await db.from('admin_users').select('role').eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to verify store access');
    return data?.role === 'admin';
  }
  async function loadSession(id: string) {
    if (!UUID.test(id || '')) throw new RequestError('Invalid payment session');
    return check(await db.from('nv_phonepe_sessions').select('*').eq('id', id).maybeSingle());
  }
  function publicSession(s: any) {
    return { session_id: s.id, order_number: s.merchant_order_id, state: s.state, environment: s.environment, subtotal: Number(s.subtotal), shipping: Number(s.shipping), total: Number(s.total) };
  }
  async function notify() {
    if (deps.shipping) await deps.shipping.sync().catch(() => undefined);
    const pending = check(await db.from('nv_phonepe_email_queue').select('session_id,attempts').is('sent_at', null).lt('attempts', 10).limit(10)) || [];
    for (const row of pending) {
      try {
        const s = await loadSession(row.session_id);
        if (!s || s.environment !== 'production' || s.state !== 'COMPLETED') continue;
        const mail = await deps.sendEmail(s.customer.email, 'NerdVerse India — Payment confirmed',
          `<div style="font-family:Arial,sans-serif"><h1>NerdVerse India</h1><h2>Payment confirmed</h2><p>Order ${s.merchant_order_id}</p><p>Total: ₹${Number(s.total).toFixed(2)}</p><p><a href="${SITE}/account.html">View your order</a></p></div>`, `phonepe-paid/${s.id}`);
        if (!mail?.skipped) check(await db.from('nv_phonepe_email_queue').update({ sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq('session_id', s.id));
      } catch {
        await db.from('nv_phonepe_email_queue').update({ attempts: row.attempts + 1 }).eq('session_id', row.session_id);
        // Durable queue is retried by the worker. Never roll back a paid order for email failure.
      }
    }
  }
  async function reconcile(s: any, config?: any) {
    if (s.state !== 'PENDING') return s;
    const cfg = config || await runtime(s.environment);
    const status = await provider(s.environment, cfg).orderStatus(s.merchant_order_id);
    if (!status || (status.currency && status.currency !== 'INR') || !Number.isSafeInteger(Number(status.amount)) || !['PENDING', 'COMPLETED', 'FAILED'].includes(status.state)) throw new Error('Invalid provider status');
    const current = check(await db.rpc('nv_phonepe_apply_status', { p_session: s.id, p_provider_order: status.orderId, p_state: status.state, p_amount: Number(status.amount) }));
    return current;
  }
  async function runWorker(environment: string, config: any) {
    const rows = check(await db.from('nv_phonepe_sessions').select('*').eq('environment', environment).eq('state', 'PENDING').order('checked_at', { ascending: true, nullsFirst: true }).limit(10)) || [];
    for (const s of rows) {
      try {
        if (!s.initiation_claimed_at) {
          check(await db.rpc('nv_phonepe_cancel_unstarted', { p_session: s.id }));
          check(await db.from('nv_phonepe_sessions').update({ checked_at: new Date().toISOString() }).eq('id', s.id));
          continue;
        }
        await reconcile(s, config);
      }
      catch { // Do not cancel or release stock for timeouts, unknown responses or provider outages.
        await db.from('nv_phonepe_sessions').update({ checked_at: new Date().toISOString() }).eq('id', s.id);
      }
    }
    await notify();
  }
  async function readBody(req: Request) {
    if (Number(req.headers.get('content-length') || 0) > 30000) throw new RequestError('Request too large', 413);
    const text = await req.text();
    if (text.length > 30000) throw new RequestError('Request too large', 413);
    try { return JSON.parse(text); } catch { throw new RequestError('Invalid request'); }
  }
  async function checkout(req: Request): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
    try {
      const b = await readBody(req);
      const environment = b.environment || 'production';
      if (!['sandbox', 'production'].includes(environment)) throw new RequestError('Invalid payment environment');
      const config = await runtime(environment);
      if (b.action === 'worker') {
        if (!config?.worker || !constantTimeEqual(req.headers.get('x-nv-worker') || '', config.worker)) throw new RequestError('Unauthorized', 401);
        await runWorker(environment, config);
        return reply({ ok: true });
      }
      const u = await deps.authenticate(req);
      const admin = u ? await isAdmin(u.id) : false;
      if (environment === 'sandbox' && !admin) throw new RequestError('Sandbox access requires a store administrator', 403);
      if (b.action === 'config') return reply({ enabled: config?.enabled === true && !!config.credentials, environment, sandbox_available: admin });
      if (!u || !u.email || !u.email_confirmed_at) throw new RequestError('Sign in with a verified email to continue', 401);
      if (b.action === 'status') {
        const s = await loadSession(b.session_id);
        if (!s || s.user_id !== u.id || s.environment !== environment) throw new RequestError('Payment session not found', 404);
        const updated = await reconcile(s, config);
        deps.background(notify());
        return reply(publicSession(updated));
      }
      if (b.action === 'reconcile' && admin) { await runWorker(environment, config); return reply({ ok: true }); }
      if (!config?.enabled || !config.credentials) throw new RequestError('PhonePe merchant verification and payment setup are in progress', 503);
      const items = validateItems(b.items);
      if (b.action === 'quote') {
        if (deps.shipping) {
          try { return reply(await deps.shipping.quote(items, String(b.pin || ''))); }
          catch (e) { throw new RequestError(e instanceof Error ? e.message : 'Delivery quotes are unavailable.'); }
        }
        const result = await db.rpc('nv_phonepe_quote', { p_items: items, p_pin: String(b.pin || '') });
        if (result.error) throw new RequestError(result.error.message || 'Shipping quote unavailable');
        return reply({ subtotal: Number(result.data.subtotal), shipping: Number(result.data.shipping), total: Number(result.data.total) });
      }
      if (b.action !== 'create') throw new RequestError('Unknown checkout action');
      if (!UUID.test(b.request_key || '')) throw new RequestError('Invalid checkout request key');
      const customer = Object.fromEntries(['name', 'phone', 'address', 'city', 'pin'].map(key => [key, String(b.customer?.[key] || '').trim()]));
      const result = await db.rpc('nv_phonepe_reserve', { p_user: u.id, p_environment: environment, p_request_key: b.request_key, p_items: items, p_customer: { ...customer, email: u.email } });
      if (result.error) throw new RequestError(result.error.message || 'Unable to create checkout');
      const s = result.data;
      if (s.state !== 'PENDING') return reply(publicSession(s));
      if (s.redirect_url) return reply({ ...publicSession(s), redirect_url: s.redirect_url });
      if (s.initiation_claimed_at) {
        // An interrupted create request must be reconciled with the same merchant ID, never charged again.
        try { return reply(publicSession(await reconcile(s, config))); }
        catch { return reply({ ...publicSession(s), pending: true, message: 'Payment initiation is being reconciled. Do not start another payment.' }, 202); }
      }
      const claimed = check(await db.from('nv_phonepe_sessions').update({ initiation_claimed_at: new Date().toISOString() }).eq('id', s.id).eq('state', 'PENDING').is('initiation_claimed_at', null).select('id').maybeSingle());
      if (!claimed) return reply({ ...publicSession(s), pending: true }, 202);
      try {
        const back = `${SITE}/checkout.html?payment_session=${encodeURIComponent(s.id)}${environment === 'sandbox' ? '&sandbox=1' : ''}`;
        const payment = await provider(environment, config).createPayment(s.merchant_order_id, Math.round(Number(s.total) * 100), back);
        // Saving provider identifiers is mandatory before returning a payable URL to the browser.
        const attached = check(await db.rpc('nv_phonepe_attach', { p_session: s.id, p_provider_order: payment.providerOrderId, p_redirect: payment.redirectUrl }));
        return reply({ ...publicSession(attached), ...(attached.state === 'PENDING' ? { redirect_url: payment.redirectUrl } : {}) });
      } catch {
        return reply({ ...publicSession(s), pending: true, message: 'Payment initiation is being reconciled. Do not pay again.' }, 202);
      }
    } catch (e) { return reply({ error: e instanceof RequestError ? e.message : 'Payment service is temporarily unavailable. If you paid, do not pay again.' }, e instanceof RequestError ? e.status : 503); }
  }
  async function webhook(req: Request): Promise<Response> {
    if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
    try {
      const environment = new URL(req.url).searchParams.get('environment');
      if (!['sandbox', 'production'].includes(environment || '')) throw new RequestError('Invalid payment environment');
      const config = await runtime(environment!);
      if (!await verifyPhonePeWebhook(req.headers.get('authorization'), config?.webhook)) throw new RequestError('Invalid webhook authorization', 401);
      const b = await readBody(req);
      if (!['checkout.order.completed', 'checkout.order.failed'].includes(b.event)) return reply({ ok: true, ignored: true });
      const mid = b.payload?.merchantOrderId;
      if (typeof mid !== 'string' || !/^NV-[a-f0-9]{32}$/.test(mid)) throw new RequestError('Invalid merchant order');
      const s = check(await db.from('nv_phonepe_sessions').select('*').eq('environment', environment).eq('merchant_order_id', mid).maybeSingle());
      if (!s) return reply({ ok: true, ignored: true });
      // A webhook is a trigger, not proof of payment. The durable session is also polled by cron.
      deps.background(reconcile(s, config).then(() => notify()).catch(() => undefined));
      return reply({ ok: true });
    } catch (e) { return reply({ error: e instanceof RequestError ? e.message : 'Webhook temporarily unavailable' }, e instanceof RequestError ? e.status : 503); }
  }
  return { checkout, webhook };
}
