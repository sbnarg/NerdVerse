// Server-only PhonePe Standard Checkout v2 transport. No browser credentials.
type Config = { environment: 'sandbox' | 'production'; clientId: string; clientVersion: string; clientSecret: string };
type PaymentStatus = { orderId: string; state: string; amount: number | string; currency?: string };
export function createPhonePeClient(config: Config, request: typeof fetch = fetch) {
  if (!['sandbox', 'production'].includes(config.environment) ||
      !config.clientId || !config.clientVersion || !config.clientSecret) {
    throw new Error('PhonePe credentials are not configured');
  }
  const sandbox = config.environment === 'sandbox';
  const base = sandbox ? 'https://api-preprod.phonepe.com/apis/pg-sandbox' : 'https://api.phonepe.com/apis/pg';
  const auth = sandbox ? `${base}/v1/oauth/token` : 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';
  let token = '';
  let expiresAt = 0;
  async function accessToken() {
    if (token && Date.now() < expiresAt - 60000) return token;
    const response = await request(auth, {
      method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_version: config.clientVersion,
        client_secret: config.clientSecret, grant_type: 'client_credentials' }),
    });
    if (!response.ok) throw new Error('PhonePe authentication failed');
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token ||
        !Number.isFinite(Number(data.expires_at)) || Number(data.expires_at) * 1000 <= Date.now()) {
      throw new Error('Invalid PhonePe authentication response');
    }
    token = data.access_token;
    expiresAt = Number(data.expires_at) * 1000;
    return token;
  }
  async function api(path: string, body?: object) {
    const response = await request(`${base}${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `O-Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    // A transport error is ambiguous. Callers must reconcile status before releasing stock.
    if (!response.ok) throw new Error('Unable to confirm PhonePe response; reconcile the order before retrying');
    return await response.json();
  }
  function validateId(id: string) {
    if (!/^[A-Za-z0-9_-]{1,63}$/.test(id)) throw new Error('Invalid merchant order ID');
  }
  return {
    async createPayment(merchantOrderId: string, amount: number, redirectUrl: string) {
      validateId(merchantOrderId);
      if (!Number.isSafeInteger(amount) || amount < 100) throw new Error('Invalid payment amount');
      const target = new URL(redirectUrl);
      if (target.protocol !== 'https:' || target.username || target.password ||
          target.origin !== 'https://nerdverseindia.com') throw new Error('Invalid payment return URL');
      const data = await api('/checkout/v2/pay', {
        merchantOrderId, amount, expireAfter: 1200,
        paymentFlow: { type: 'PG_CHECKOUT', merchantUrls: { redirectUrl: target.href } },
      });
      if (typeof data.orderId !== 'string' || !data.orderId || typeof data.redirectUrl !== 'string') {
        throw new Error('Invalid PhonePe checkout response');
      }
      const paymentUrl = new URL(data.redirectUrl);
      const allowedHosts = sandbox ? ['mercury-uat.phonepe.com'] : ['mercury.phonepe.com', 'mercury-t2.phonepe.com'];
      if (paymentUrl.protocol !== 'https:' || !allowedHosts.includes(paymentUrl.hostname) ||
          paymentUrl.username || paymentUrl.password || paymentUrl.port) throw new Error('Invalid PhonePe checkout URL');
      return { providerOrderId: data.orderId, redirectUrl: paymentUrl.href };
    },
    async orderStatus(merchantOrderId: string): Promise<PaymentStatus> {
      validateId(merchantOrderId);
      return await api(`/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false`);
    },
  };
}

// Only call with the authenticated server-to-server status response and saved order values.
// Browser redirects and webhook bodies alone are never proof of payment.
export function isPhonePePaymentComplete(status: PaymentStatus, providerOrderId: string, amount: number) {
  return !!providerOrderId && Number.isSafeInteger(amount) && amount >= 100 &&
    status.orderId === providerOrderId && status.state === 'COMPLETED' &&
    Number(status.amount) === amount && (!status.currency || status.currency === 'INR');
}

