# PhonePe integration preparation

Prepared: 17 October 2026.

## Implemented

`supabase/functions/_shared/phonepe.ts` provides server-only OAuth, Standard Checkout v2 payment creation, status lookup, strict checkout redirect validation, and a payment completion predicate requiring the saved provider order ID and exact amount. Sandbox and production endpoints are separate. Credentials are passed by the server, never from browser configuration.

Run the mocked transport checks with Node 24:

    node --test tests/phonepe.test.mjs

## Current status

This is a tested API adapter, not a connected or deployed checkout. Existing checkout remains disabled. No production payment has been attempted, and credentials were unavailable in this session.

## Remaining work before accepting payments

1. Obtain sandbox Client ID, Client Version and Client Secret from PhonePe Business Dashboard → Developer Settings. Store them as backend secrets only.
2. Audit the live order schema and reservation RPC before adding PhonePe order identifiers. The existing reservation implementation records Razorpay as the payment method and cannot be reused unchanged.
3. Wire authenticated payment initiation to server-priced orders; persist the unique merchant order ID before calling PhonePe. Preserve uncertain requests for status reconciliation rather than releasing inventory on a network timeout. Account for shipping on the server.
4. Connect an authenticated return/status endpoint and verified webhook handling to an atomic, idempotent database transition. Require saved provider order ID and exact amount. Never trust browser status parameters. Handle abandoned checkout expiry, failed payments and duplicate callbacks without overselling or double-releasing stock.
5. Exercise sandbox success, pending, failure, cancellation, retries, duplicate callbacks, amount mismatch, ownership and inventory recovery; test order emails and fulfilment.
6. After merchant activation, install production credentials, perform the agreed real payment/refund check, then enable frontend and backend checkout gates together.

## Official references

- https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/authorization
- https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/create-payment
- https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/api-reference/order-status
