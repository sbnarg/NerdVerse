# NerdVerse India — verified launch checklist

Updated 22 October 2026. Percentages below are completed checklist items divided by
the stated check count. They are not Lighthouse scores, security guarantees or an
estimate of engineering effort. A completed implementation is distinguished from a
verified physical shipment or device test.

| Front | Complete | Completion | Remaining evidence/configuration |
|---|---:|---:|---|
| Storefront and catalogue | 5/5 | 100% | None within desktop homepage, catalogue, poster filter, search and product-link checks |
| Payments and orders | 5/6 | 83% | Refund workflow has not been exercised; no refund was initiated |
| Inventory | 4/4 | 100% | Reservation, failed-attempt release, paid-order retention and stock consistency verified |
| Shipping integration | 3/5 | 60% | AWB/pickup and delivered-tracking verification remain; live quotes, paid-order export and scheduled sync are configured |
| Packaging | 1/2 | 50% | All 38 active products have estimates; actual packed samples remain unweighed/unmeasured |
| Confirmation email | 2/5 | 40% | Template and durable queue/retry are implemented; provider key, verified sender and live delivery remain |
| Customer receipts / GST invoicing | 2/5 | 40% | Owned paid-order receipt and print/save are implemented; HSN classification, tax treatment and numbered GST invoice issuance remain |
| Mobile | 3/4 | 75% | Navigation/form/long-reference CSS reviewed and repaired; real-phone visual validation remains |
| Database/auth hardening | 4/5 | 80% | RLS isolation, function permissions, private helper and seller-cost protection pass; leaked-password protection remains disabled |
| Performance checks | 4/5 | 80% | FK indexes, cached auth checks, merged policies and lazy catalogue images pass; device/network performance benchmark remains |
| Hosting and policy pages | 4/4 | 100% | HTTPS storefront, deployment, core linked assets and published policy pages checked |
| Admin/back office | 3/4 | 75% | Server admin authorization, inventory/package controls and shipping/email diagnostics are implemented; authenticated visual walkthrough remains |

Total: **40/54 checks = 74%** (rounded). Core purchasing works, but this is not a
claim that the whole business is fully launch verified.

## Work completed

- First production PhonePe payment completed and created a confirmed paid order.
- Purchased poster stock reduced from five to four. Two abandoned payment attempts
  reached provider-confirmed failure and released their reservations.
- Paid order exported to Shiprocket; it has not been treated as physically delivered.
- All active products have seller-authorised package estimates, including cardboard.
- Public API access to `products.cost_price` removed; service-role admin access retained.
- RLS decision equivalence tested for anonymous visitors, two customers and an admin.
  Cross-customer updates and owner reassignment remain denied.
- Admin helper moved out of the exposed schema; trigger functions no longer have
  unnecessary browser-role execution privileges; fixed function search paths.
- Added seven missing FK indexes; wrapped auth checks in SELECT; consolidated
  overlapping permissive policies without broadening visibility.
- Advisor follow-up: no performance warnings; only unused-index informational
  notices remain. Service-only payment/shipping tables intentionally have RLS with
  no browser policies. The remaining security warning is leaked-password protection.
- Confirmation queue records safe delivery/setup error codes and provider receipts.
  Admin Shipping shows missing provider/sender settings and queued/sent counts.
- Added authenticated paid-order payment receipts through My Account. Text is
  escaped, totals use saved order values, and print styling supports save as PDF.
- Narrow-screen CSS fixes cover navigation wrapping, 44px touch controls, readable
  form inputs and long order references. This browser could not perform mobile
  preview, so no real-device approval is claimed.
- Automated suite: 47 tests pass; TypeScript covers checkout, webhook and admin API.

## Account/physical tasks still required

1. In Supabase Edge Function secrets, add `RESEND_API_KEY` and verify the
   `nerdverseindia.com` sending domain in Resend. The configured automatic sender is
   `NerdVerse India <no-reply@nerdverseindia.com>`, with replies routed to
   `nerdverseindia@gmail.com`. Never commit or send the API key
   in chat. Existing queued confirmation will retry automatically after setup.
2. Confirm HSN/GST classification and tax-inclusive pricing with the seller's
   accountant before issuing tax invoices. Existing orders lack a tax-rate snapshot;
   do not relabel the payment receipt as a GST tax invoice or invent a tax breakdown.
3. Enable leaked-password protection in eligible Supabase Auth settings (Pro+).
   Do not purchase an upgrade without seller authorization.
4. Check homepage, product gallery, cart, account and PhonePe return on a real phone;
   run a device/network speed benchmark.
5. Weigh/measure a packed sample, then verify AWB, pickup and tracking on the first
   genuine shipment. No courier booking, wallet recharge or refund was initiated.

References: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security),
[password protection](https://supabase.com/docs/guides/auth/password-security),
[GST invoice particulars](https://cbic-gst.gov.in/gst-invoice-rules).
