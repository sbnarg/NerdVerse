# Checkout audit — 8 October 2026

**Status: NOT READY FOR LIVE PAYMENTS.** No live transaction was performed.

## Findings from current repository
1. `supabase/schema.sql` is an outdated alternate schema: `products.id text`, `stock_qty`, `active boolean`, `status available/sold`. Actual live products use UUID IDs, `stock` and status `draft/active/sold_out/archived`. **Do not run schema.sql on production.**
2. `create-payment-order` invokes `create_pending_order` RPC with the authenticated customer's cart; actual RPC presence and compatibility are unknown.
3. `verify-payment` and `razorpay-webhook` update orders and insert `order_events`; actual table/column compatibility is unknown.
4. `create-payment-order` reserves inventory before checking Razorpay configuration. On missing keys it attempts to release via an unverified RPC. This could leave reservations stuck if the RPC is absent.
5. The webhook assumes `payload.payment.entity.order_id` exists for `order.paid`, which may not be true for an order-level event. It also ignores database update errors and replies 200, risking unrecorded payment events.
6. Both verification and webhook may process the same payment; the current read-then-update approach is not an atomic idempotency guarantee.
7. `checkout.js` reads `profiles`, whose existence is unverified, and uses client cart prices for display while the server must independently calculate final totals.
8. Public-facing checkout must remain disabled until payment credentials, inventory reservations, order creation, webhook idempotency, refunds, and expiry release are validated.

## Next action
Run `supabase/checkout-readiness-audit.sql` in Supabase SQL Editor and export its result as CSV. It is read-only and includes **schema definitions only, not customer or payment data**.

Then implement a live-schema-compatible transactional order reservation, release-on-failure/timeout, idempotent paid-state transitions, order-event tracking, verified Razorpay webhook signatures, and an end-to-end test suite. Do not alter production schema blindly.
