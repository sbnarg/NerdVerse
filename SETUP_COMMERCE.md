# NerdVerse India — production setup

Most application code is version-controlled and deployable from GitHub. The items below are
account-level settings/secrets and therefore must be configured in the provider dashboards.

## Supabase

1. GitHub integration: repository `sbnarg/NerdVerse`, working directory `.`, production branch `main`, Deploy to production ON.
2. Authentication URL Configuration:
   - Site URL: `https://sbnarg.github.io/NerdVerse/`
   - Redirect URL: `https://sbnarg.github.io/NerdVerse/account.html`
3. Put the project's **public project URL** and **publishable key** in `config.js`. Never put a secret/service-role key in browser code.
4. After the intended administrator has signed in once, promote that account in the database. Do not commit the administrator email to the repository.

## Edge Functions

Functions are versioned under `supabase/functions/`:
- `create-payment-order`
- `verify-payment`
- `razorpay-webhook`
- `admin-api`

Configure these Edge Function secrets in Supabase:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

## Razorpay

Use test credentials until checkout has been end-to-end tested.

### Credential safety

- If a Razorpay Key Secret is ever shown in a screenshot, chat, issue, commit, or other shared location, treat that key pair as compromised and regenerate it before use.
- Never put `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in `config.js`, GitHub Pages, or other browser code.
- Store the clean test credentials only as Supabase Edge Function secrets: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
- Do not reuse test credentials for live payments. Generate live credentials only after Razorpay activates the account and the test checkout passes end to end.

### Webhook

Configure the Razorpay webhook to:
`https://hzzuqylaypoylakgnqxs.supabase.co/functions/v1/razorpay-webhook`

Generate a separate random webhook secret in Razorpay and store the identical value in Supabase as `RAZORPAY_WEBHOOK_SECRET`. Subscribe at minimum to payment/order success and payment failure events used by `razorpay-webhook`.

### Current integration

The storefront is already wired for the server-side flow:

`checkout.js → create-payment-order → Razorpay Checkout → verify-payment`

The webhook independently reconciles successful/failed payments. The browser receives the publishable Razorpay Key ID from `create-payment-order`; the Key Secret remains server-side.

## Release gate

Before accepting real orders:
- Browser `config.js` points at the production Supabase project.
- Customer sign-in succeeds from GitHub Pages.
- Catalogue loads from Supabase.
- Test checkout creates and verifies a Razorpay payment.
- Webhook changes payment/order state.
- Inventory decrements once and is restored on failed/expired orders.
- Admin console is restricted to the admin role.
- Confirmation/status email is delivered.
- Only then switch Razorpay from test to live credentials.
