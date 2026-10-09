# PayU migration — approval pending

PayU video KYC completed; merchant approval estimated by provider at 2–4 business days (not guaranteed). Do not assume merchant credentials, account activation or production acceptance.

## Existing system findings
- Frontend checkout.js opens Razorpay checkout.
- Supabase create-payment-order and verify-payment Edge Functions use Razorpay.
- Existing webhook is Razorpay-specific.
- Existing database fields use razorpay_* naming.
- Current payment verification code references order/customer fields inconsistent with the baseline schema; audit against latest migrations before replacement.
- Checkout is protected by NERDVERSE_CHECKOUT_ENABLED and must remain OFF.

## Implementation sequence
1. Once PayU dashboard shows approved, determine the exact PayU product/API and test credentials (do not commit secrets).
2. Implement provider-neutral payment_attempts table with order id, provider, external transaction id, amount, currency, status, unique idempotency keys; retain historical Razorpay fields for compatibility.
3. Create backend initiation function for PayU with server-derived cart amounts, signed request and verified return URLs.
4. Implement PayU server callback/webhook with provider-specific cryptographic verification and independently query transaction status before marking paid; never trust redirect/browser success.
5. Add database-transactional state machine for captured payment, inventory finalization, outbox confirmation, GST invoice issuance (only after GST settings approved). Prevent duplicate processing.
6. Build provider-specific test sandbox E2E including invalid hash, duplicate callbacks, missing callback, partial/failed/refunded payments and mismatched amounts.
7. Update checkout UI only after test flow passes; then require explicit approval to activate real checkout.
8. Confirm seller KYC, GSTIN, bank settlement name and compliance with PayU and accountant.

## Blockers
PayU account activation, product/API documentation specific to merchant account, sandbox credentials, verified GST registration, correct HSN/rates, live E2E test.
