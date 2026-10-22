# PhonePe production integration

Production credentials are held in Supabase Vault and are never browser configuration. PhonePe production OAuth authentication was verified on 22 October 2026.

Deployed: phonepe-checkout and phonepe-webhook, the service-only checkout migration, and the nv-phonepe-reconcile cron worker. The production webhook is registered and enabled for checkout.order.completed and checkout.order.failed using SHA authentication. The endpoint accepted an authenticated unknown-order test event and rejected an unsigned request.

The public checkout uses server-priced totals, verified account email, atomic stock reservations, idempotent order creation and server-to-server payment status verification. The email queue retries existing Resend delivery; actual customer email delivery has not been verified in this session.

## Remaining activation gates

- Production enabled=true after the merchant requested integration and reported the disabled payment-availability screen. Production OAuth and webhook authentication are verified; no completed live payment has been verified. Automatic approval review rejected the attempted creation of a standalone INR 1 production test session; that test was not created or paid.
- Shiprocket now supplies server-side live quotes with a 30-minute cache. Packed product measurements are required in Admin → Inventory. Orders above INR 2,999 retain free shipping. See SHIPROCKET_SETUP.md for setup, fulfilment review and tracking.
- Verify a completed customer checkout and order/stock transition, the PhonePe webhook delivery, and a refund through the merchant's normal process.

## Validation

Run cd tests && npm ci --ignore-scripts && npm test && npm run typecheck. These isolated tests do not charge money or modify the live database.
