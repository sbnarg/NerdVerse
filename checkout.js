/* PhonePe checkout. Server configuration controls activation; browser flags cannot enable payments. */
(async () => {
  const form = document.getElementById('checkoutForm');
  const button = form.querySelector('button[type=submit]');
  const msg = document.getElementById('checkoutMsg');
  const signedIn = document.getElementById('signedInBox');
  const params = new URLSearchParams(location.search);
  const environment = params.get('sandbox') === '1' ? 'sandbox' : 'production';
  const sessionId = params.get('payment_session');
  const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  let cart = [];
  try {
    const saved = JSON.parse(localStorage.getItem('nv-cart') || '[]');
    if (Array.isArray(saved)) cart = saved.filter(x => x && typeof x.id === 'string' && Number.isInteger(x.qty) && x.qty > 0 && x.qty <= 20);
  } catch { /* A damaged cart is shown as empty. */ }
  const pendingMessage = 'PhonePe payment setup and merchant verification are in progress. Payments are not yet available.';
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  const setEnabled = enabled => { button.disabled = !enabled; button.setAttribute('aria-disabled', String(!enabled)); };
  const container = document.getElementById('checkoutItems');
  container.replaceChildren();
  for (const item of cart) {
    const row = document.createElement('div'), detail = document.createElement('div');
    const name = document.createElement('b'), small = document.createElement('small'), price = document.createElement('strong');
    row.className = 'cart-row'; name.textContent = item.name || 'Collectible';
    small.textContent = `${item.qty} × ${money(item.price)}`; price.textContent = money(Number(item.price) * item.qty);
    detail.append(name, small); row.append(detail, price); container.append(row);
  }
  if (!cart.length) { const p = document.createElement('p'); p.textContent = 'Your cart is empty.'; container.append(p); }
  document.getElementById('checkoutTotal').textContent = money(cart.reduce((sum, x) => sum + Number(x.price || 0) * x.qty, 0));
  const items = () => cart.map(x => ({ product_id: x.id, quantity: x.qty }));
  let user;
  async function api(action, body = {}) {
    const session = await window.NV_AUTH?.session();
    const response = await fetch(window.NV_CONFIG.supabaseUrl + '/functions/v1/phonepe-checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.NV_CONFIG.supabasePublishableKey,
        ...(session ? { Authorization: 'Bearer ' + session.access_token } : {}) },
      body: JSON.stringify({ action, environment, ...body }), signal: AbortSignal.timeout(30000),
    });
    let result; try { result = await response.json(); } catch { throw Error('Payment service is temporarily unavailable.'); }
    if (!response.ok) throw Error(result.error || 'Payment service is temporarily unavailable.');
    return result;
  }
  function totals(q) {
    document.getElementById('checkoutTotal').textContent = money(q.total);
    const shipping = document.getElementById('checkoutShipping');
    if (shipping) shipping.textContent = Number(q.shipping) === 0 ? 'Free' : money(q.shipping);
  }
  function clearPurchasedCart(id) {
    const key = `nv-phonepe-cart/${id}`;
    try {
      const bought = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (!bought || environment === 'sandbox') return;
      const current = JSON.parse(localStorage.getItem('nv-cart') || '[]');
      if (!Array.isArray(current)) return;
      for (const item of current) { const sold = bought.find(x => x.id === item.id); if (sold) item.qty = Math.max(0, item.qty - sold.qty); }
      localStorage.setItem('nv-cart', JSON.stringify(current.filter(x => x.qty > 0)));
      sessionStorage.removeItem(key);
      sessionStorage.removeItem('nv-phonepe-attempt');
    } catch { /* Payment status remains visible even if local storage is unavailable. */ }
  }
  async function checkStatus(id) {
    setEnabled(false);
    msg.textContent = 'Checking payment securely with PhonePe…';
    for (let attempt = 0; attempt < 10; attempt++) {
      let result;
      try { result = await api('status', { session_id: id }); }
      catch { msg.textContent = 'We could not confirm payment yet. If you paid, do not pay again. Refresh this page to check again.'; return; }
      totals(result);
      if (result.state === 'COMPLETED') {
        msg.textContent = (environment === 'sandbox' ? 'Sandbox test successful. No real order was placed. ' : 'Payment confirmed. ') + 'Order: ' + result.order_number;
        button.textContent = environment === 'sandbox' ? 'Sandbox payment verified' : 'Payment confirmed';
        clearPurchasedCart(id); return;
      }
      if (result.state === 'FAILED') {
        msg.textContent = 'PhonePe confirmed that this payment failed. Your payment was not accepted. Return to your cart to try again.';
        button.textContent = 'Payment failed';
        sessionStorage.removeItem('nv-phonepe-attempt'); return;
      }
      msg.textContent = 'Payment is pending with PhonePe. Please do not pay again.';
      if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 3000));
    }
    msg.textContent = 'Payment is still pending. Please do not pay again. Refresh this page later to check its status.';
  }
  try {
    user = await window.NV_AUTH?.user();
    if (user) {
      signedIn.textContent = 'Signed in as ' + user.email;
      form.elements.email.value = user.email || ''; form.elements.email.readOnly = true;
      form.elements.name.value = user.user_metadata?.full_name || '';
    } else {
      signedIn.textContent = 'Sign in to continue. ';
      const signIn = document.createElement('button'); signIn.type = 'button'; signIn.className = 'btn ghost'; signIn.textContent = 'Sign in with Google';
      signIn.onclick = () => window.NV_AUTH.google('checkout.html' + location.search); signedIn.append(signIn);
    }
    if (sessionId) { if (!user) { msg.textContent = 'Sign in with the account used for payment to check your order.'; return; } await checkStatus(sessionId); return; }
    const config = await api('config');
    if (config.sandbox_available && environment !== 'sandbox') {
      const test = document.createElement('a'); test.href = 'checkout.html?sandbox=1'; test.className = 'btn ghost'; test.textContent = 'Test PhonePe (sandbox)'; signedIn.append(document.createElement('br'), test);
    }
    if (!config.enabled) { msg.textContent = pendingMessage; return; }
    if (environment === 'sandbox') {
      msg.textContent = 'SANDBOX TEST — no real payment, order or stock reservation.';
      button.textContent = 'Test payment with PhonePe';
    } else { msg.textContent = 'Enter your delivery details to pay securely with PhonePe.'; button.textContent = 'Pay with PhonePe'; }
    setEnabled(!!user && cart.length > 0);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!form.reportValidity()) return;
      setEnabled(false); msg.textContent = 'Checking prices, stock and delivery…';
      try {
        const customer = Object.fromEntries(['name', 'phone', 'address', 'city', 'pin'].map(k => [k, form.elements[k].value.trim()]));
        const q = await api('quote', { items: items(), pin: customer.pin }); totals(q);
        // Keep a single idempotency key for retries of exactly the same checkout.
        const fingerprint = JSON.stringify({ items: items(), customer, environment });
        let saved; try { saved = JSON.parse(sessionStorage.getItem('nv-phonepe-attempt') || 'null'); } catch {}
        if (!saved || saved.fingerprint !== fingerprint) { saved = { fingerprint, request_key: crypto.randomUUID() }; sessionStorage.setItem('nv-phonepe-attempt', JSON.stringify(saved)); }
        const payment = await api('create', { request_key: saved.request_key, items: items(), customer });
        sessionStorage.setItem(`nv-phonepe-cart/${payment.session_id}`, JSON.stringify(cart.map(x => ({ id: x.id, qty: x.qty }))));
        if (payment.redirect_url) {
          const target = new URL(payment.redirect_url);
          if (target.protocol !== 'https:' || target.hostname !== (environment === 'sandbox' ? 'mercury-uat.phonepe.com' : 'mercury.phonepe.com') || target.username || target.password || target.port) throw Error('Unable to open secure PhonePe checkout.');
          location.assign(target.href);
        } else {
          history.replaceState({}, '', `checkout.html?payment_session=${encodeURIComponent(payment.session_id)}${environment === 'sandbox' ? '&sandbox=1' : ''}`);
          await checkStatus(payment.session_id);
        }
      } catch (e) { msg.textContent = e.message || 'Unable to start payment. Please try again.'; setEnabled(true); }
    });
  } catch { msg.textContent = pendingMessage; }
})();
