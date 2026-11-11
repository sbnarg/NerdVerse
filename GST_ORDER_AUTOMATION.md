# GST invoicing and order automation — implementation gate

Seller: NerdVerse India, sole proprietorship of Zineeya Roy Chowdhury. Karnataka (state code 29). Business premises: jointly owned residence; **do not commit the private address**.

## Current status
The migration introduces restricted seller settings, reviewed product tax classifications and immutable-invoice *data structures*. It does **not** issue invoices, calculate taxes, email customers, activate checkout or validate registration. All tax rates/HSNs require professional review. `gst_enabled` and `checkout_enabled` default to false.

## Existing integration discovery
The repository currently documents **Razorpay**, not PayU, in `README.md` and `SETUP_COMMERCE.md`. Resolve gateway choice before wiring payment-triggered invoices; never assume a provider switch has been made.

## Required next implementation
1. Obtain GSTIN, registered address and verified product HSN/GST rates, and confirm interstate/ship-to tax treatment with accountant.
2. Add a secure admin-only configuration endpoint; do not expose seller configuration through a public browser key.
3. Create idempotent invoice issuance after **server-verified captured payment**. Use a DB transaction and row locks, per-financial-year atomic sequence, immutable item/tax snapshots, and one invoice per paid order. No invoice on pending/failed payment.
4. Calculate item-level taxable values and shipping treatment; apply IGST vs CGST/SGST using verified place-of-supply. Include round-off, discounts and invoice mandatory fields. Do not assume flat GST.
5. Render PDF in a protected storage bucket; authorize customer downloads by order ownership. Never expose invoice PII in public buckets.
6. Send confirmation email using existing Resend integration via an outbox with deduplication, retry and delivery state.
7. Implement refunds, cancellation and GST credit notes as separate auditable records, without deleting issued invoices.
8. Add E2E tests: payment replay/webhook duplicates, retries, concurrent purchases, tax by destination, invoice numbering, customer isolation, failed payments, refund/credit note, email retry.
9. Only after review and E2E signoff, explicitly activate checkout. Keep real orders disabled until then.

## Security
No private PAN/Aadhaar, property deed, keys, home address, or service-role tokens in GitHub. Apply migrations through existing Supabase deployment pipeline only after review.
