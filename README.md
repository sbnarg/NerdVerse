# NerdVerse India

Collectibles storefront at https://nerdverseindia.com, backed by Supabase.

- Frontend: GitHub Pages from `main`, with the custom domain through Cloudflare.
- Database/Auth/Edge Functions: Supabase; browser roles are protected by RLS.
- Payments: PhonePe Standard Checkout v2. Earlier payment-provider code is legacy.
- Shipping: Shiprocket quotes, paid-order export and scheduled tracking sync.
  Courier booking/pickup still requires the seller's action in Shiprocket.
- Transactional email: Resend, requiring `RESEND_API_KEY` and a verified `nerdverseindia.com` domain.
  The automatic sender is `no-reply@nerdverseindia.com`, with replies to
  `nerdverseindia@gmail.com`. Setup failures and queue counts appear in Admin → Shipping.
- Customer payment receipts: My Account → View / save payment receipt.
  A receipt is distinct from a GST tax invoice; invoice tax configuration remains.

See [LAUNCH_READINESS.md](LAUNCH_READINESS.md) for the dated verification checklist,
completion percentages and external blockers. See [SHIPROCKET_SETUP.md](SHIPROCKET_SETUP.md)
for package estimates and fulfilment behavior.

Database changes belong in `supabase/migrations/`; `supabase/schema.sql` is a legacy
baseline, not a production reset script. Do not run it against the live store.
Never commit provider credentials or Supabase service-role keys. Browser config
may contain only the project URL and publishable key.
