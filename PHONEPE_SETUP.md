# PhonePe production integration

Production credentials are held in Supabase Vault and are never browser configuration. PhonePe production OAuth authentication was verified on 22 October 2026.

Deployed: phonepe-checkout and phonepe-webhook, the service-only checkout migration, and the nv-phonepe-reconcile cron worker. The production webhook is registered and enabled for checkout.order.completed and checkout.order.failed using SHA authentication. The endpoint accepted an authenticated unknown-order test event and rejected an unsigned request.

The public checkout uses server-priced totals, verified account email, atomic stock reservations, idempotent order creation and server-to-server payment status verification. The email queue retries existing Resend delivery; actual customer email delivery has not been verified in this session.

## Remaining activation gates

- Production enabled=false until an explicitly authorized real payment test is completed. Automatic approval review rejected the attempted creation of a standalone INR 1 production test session; that test was not created or paid.
- No active lower-value shipping rates exist in nv_shipping_rates. Orders above INR 2,999 qualify for free shipping; smaller orders fail closed until real approved shipping rates are supplied.
- Verify a completed customer checkout and order/stock transition, the PhonePe webhook delivery, and a refund through the merchant's normal process.

## Validation

Run cd tests && npm ci --ignore-scripts && npm test && npm run typecheck. These isolated tests do not charge money or modify the live database.
