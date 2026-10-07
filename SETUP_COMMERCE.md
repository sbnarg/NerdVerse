# NerdVerse India — commerce setup

The storefront stays on free GitHub Pages. Secure authentication, database, Razorpay server calls, webhooks and transactional email run in Supabase Edge Functions.

## 1. Supabase
1. Create a Supabase project.
2. In SQL Editor, run `supabase/schema.sql`.
3. Enable Google under Authentication → Providers → Google. Configure the Google OAuth web client with the Supabase callback and site URL.
4. In Authentication → URL Configuration, add `https://sbnarg.github.io/NerdVerse/account.html` to the redirect allow list and set the site URL to `https://sbnarg.github.io/NerdVerse/`.
5. Copy the project's publishable/anon browser key and URL into `config.js`. Never put a secret/service-role key in the browser.
6. After the first admin Google sign-in, run:
`update public.profiles set role='admin' where id=(select id from auth.users where email='YOUR_ADMIN_EMAIL');`

## 2. Deploy Edge Functions
Deploy: `create-payment-order`, `verify-payment`, `razorpay-webhook`, `admin-api`.

Set these production secrets in Supabase Edge Function Secrets:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Supabase provides its URL/anon/service credentials to Edge Functions. Never commit these secrets.

## 3. Razorpay
Use test keys first. The server creates Razorpay Orders, the browser opens Standard Checkout, the server verifies the payment signature, and the webhook confirms captured/failed payments.

Webhook URL:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/razorpay-webhook`

Use the same webhook secret in Razorpay and `RAZORPAY_WEBHOOK_SECRET`.

## 4. Email
Create a Resend account, verify a sending domain, create an API key, and set `RESEND_API_KEY` and `EMAIL_FROM`. Customer emails are sent for payment confirmation/failure and every admin order-status update, including tracking details.

## 5. Order lifecycle
Customer signs in → cart → server reserves stock → server creates Razorpay order → customer pays → signature/webhook confirms payment → email confirmation → admin processes/updates order → admin enters AWB + tracking URL → customer sees the status in My Account and receives an email → Delivered.

## 6. Admin
Admin login is the same Supabase Google SSO, but the database role must be `admin`. The Admin console shows orders/revenue/low stock, lets you change order status, enter tracking/AWB, and update inventory quantities.