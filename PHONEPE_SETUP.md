# PhonePe checkout: implementation and deployment

The pre-KYC implementation is prepared on `feature/phonepe-integration`. **It is not deployed.** Automatic approval review rejected applying the persistent live database migration. Existing public checkout stays disabled.

## Implemented

- PhonePe Standard Checkout v2 OAuth, hosted payment initiation and server-side status lookup.
- Atomic database-priced orders and stock reservations; idempotency keys; no stock restoration on ambiguous timeouts.
- Sandbox sessions restricted to store administrators. They do not create real orders, reserve stock or send customer emails.
- Session ownership checks, verified account email, server-only credentials, amount and provider-order matching, terminal-status protection.
- SHA-authenticated webhook listener. It rechecks PhonePe's API rather than trusting callback state/amount.
- Reconciliation worker and cron script. Only never-started sessions may expire locally; uncertain initiated requests await provider confirmation.
- Durable payment-confirmation email queue using the existing Resend integration.
- Frontend sign-in, quotes, hosted checkout redirect, payment return/status checks and purchased-cart cleanup. Production availability is controlled server-side.
- Shipping is free only above ₹2,999. Lower totals require an actual configured PIN/prefix rate. No rates are invented or zeroed silently.

## Validation

Node 24+:

```
cd tests
npm ci
npm test
npm run typecheck
```

The database tests run the actual migration in isolated PGlite Postgres against fixtures matching the inspected live order/product constraints. They do not run against the real store. Frontend tests use JSDOM; there has been no rendered browser end-to-end test of this new flow.

The original adapter was checked against the merchant's PhonePe sandbox: OAuth succeeded, a ₹1 test session was created and its PENDING status and amount were confirmed. **No sandbox payment was completed.**

## Reviewable deployment package

1. Apply `supabase/migrations/20261017141209_phonepe_checkout.sql` to the connected project only after explicit deployment approval.
2. Store sandbox credentials in Supabase Vault as JSON with `clientId`, `clientVersion`, `clientSecret`. Link the Vault UUID in `nv_phonepe_config.credentials_secret_id` for `sandbox`. Keep production disabled with no credentials until activation.
3. Deploy `phonepe-checkout` and `phonepe-webhook`, including all relative `_shared` files and their `deno.json`. Both functions perform their own authentication; gateway `verify_jwt` must be false. Checkout validates real Supabase user JWTs; webhooks validate PhonePe SHA authorization; workers use a distinct encrypted random secret.
4. Enable sandbox only. Publish the prepared checkout files. An administrator can open `/checkout.html?sandbox=1`.
5. Configure a sandbox webhook in PhonePe Developer Settings → Webhooks with SHA authentication, payment completed/failed events, and URL `https://hzzuqylaypoylakgnqxs.supabase.co/functions/v1/phonepe-webhook?environment=sandbox`. Store its username/password as encrypted Vault JSON and link `webhook_secret_id`. Credential creation/registration has not been performed.
6. Create a random worker secret in Vault and link `worker_secret_id`; apply `supabase/phonepe-worker-schedule.sql`. Confirm cron runs, webhook delivery, abandoned checkout reconciliation and queue retries.
7. Complete a hosted sandbox success/failure/cancel test and duplicate delivery/stock tests. Confirm actual Resend sender configuration; skipped sends remain queued.
8. Add real carrier-backed rates to `nv_shipping_rates` before accepting orders of ₹2,999 or less. Longest matching PIN prefix wins.

## After KYC approval

Install separate production credentials and webhook authentication in Vault. Keep the legacy Razorpay checkout gate disabled. Complete the agreed real payment/refund verification, ensure shipping and emails are ready, then enable the production config row. The frontend cannot activate production by changing a flag or query string.

## Operational limits

Unknown provider outcomes deliberately retain reserved stock instead of risking overselling. They need provider reconciliation; never manually restore stock just because a request timed out. Conflicting terminal statuses require investigation. The pending-session index and checked-at rotation support worker retries, but monitoring pending sessions, cron and email failures is still required at launch. The automatic review rejection did not execute the migration or alter store data.
