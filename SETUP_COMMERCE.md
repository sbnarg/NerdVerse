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

Use test credentials until checkout has been end-to-end tested. Configure the webhook to:
`https://<PROJECT_REF>.supabase.co/functions/v1/razorpay-webhook`

The Razorpay webhook secret must exactly match `RAZORPAY_WEBHOOK_SECRET` in Supabase.

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
