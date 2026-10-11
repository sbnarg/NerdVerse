/* PayU migration preparation. Payments stay disabled until PayU production approval,
   server-side payment initiation, hash validation and webhook verification are tested. */
const NV_CHECKOUT_LIVE = false;
const cart = JSON.parse(localStorage.getItem('nv-cart') || '[]');
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const items = document.getElementById('checkoutItems');
const total = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
document.getElementById('checkoutTotal').textContent = money(total);
items.innerHTML = cart.length ? cart.map(item => `<div class="cart-row"><div><b>${escapeHTML(item.name)}</b><small>${Number(item.qty)} × ${money(item.price)}</small></div><strong>${money(Number(item.price) * Number(item.qty))}</strong></div>`).join('') : '<p style="color:#777">Your cart is empty. <a href="shop.html">Return to the vault.</a></p>';
const msg = document.getElementById('checkoutMsg');
const payButton = document.querySelector('#checkoutForm button[type=submit]');
payButton.disabled = true;
payButton.setAttribute('aria-disabled', 'true');
msg.textContent = 'PayU checkout is being configured. Payments are not yet available.';
// Never accept payment details or create orders in the browser before the PayU
// server-side flow has been deployed, reviewed and enabled explicitly.
