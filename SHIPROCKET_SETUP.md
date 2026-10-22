# Shiprocket integration

Credentials belong only in Supabase Edge Function secrets: SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD. They must never be committed or returned to clients. Optional SHIPROCKET_PICKUP_LOCATION is the exact saved pickup nickname if API pickup-address read access is unavailable. Origin PIN is 560068.

## Enable accurate checkout quotes

Open Admin → Inventory → Edit product. Enter measured PACKED unit weight in grams and outer length, width and height in centimetres. Include protective packaging. Do not use bare A3 paper dimensions for a rolled poster. Reuse measurements only for identical packaging.

Quote requests use the higher of actual and volumetric weight (L × B × H / 5000). Couriers documented with a different divisor are excluded until supported. Quotes stack packed units conservatively (maximum long and middle dimensions; summed short dimensions and weight). Check the actual final parcel before booking. Oversized stacks require a manual quote. Shipping is the returned prepaid courier rate, rounded upward to paise, without an added store markup. Merchant bears any subsequent carrier adjustments or taxes not included in the returned rate. Free shipping remains above ₹2,999. Orders at or below the threshold fail closed when measurements or courier quotes are missing. High-value free-shipping orders preserve previous checkout behavior and are held for shipping setup if package data is missing.

Rates are cached server-side for 30 minutes and bound to the authoritative cart prices, destination and package measurements. Payment reservation reads the same verified cache; browser-supplied charges are ignored. The customer reviews the quoted total before a second click opens PhonePe.

## Paid orders and tracking

Only a server-verified COMPLETED production PhonePe session queues a Shiprocket order. Sandbox, failed and unpaid sessions do not export. The worker runs every minute when work exists. Shiprocket order creation uses the same merchant order number and persists provider identifiers. An interrupted or ambiguous creation moves to needs_review and is never blindly retried. Review the provider dashboard before resolving it.

Order export does not assign AWB, book a courier or schedule pickup. Review the parcel and charges, fund the Shiprocket wallet, then book in Shiprocket. Once booked, tracking is polled every 30 minutes and updates the store order's AWB, courier and shipment status. It never changes payment status or stock. Admin → Shipping shows setup failures and provider IDs. After fixing measurements or pickup configuration, use Retry after fixing setup. Only needs_setup rows are retried; needs_review rows require manual reconciliation.

The saved API user has Orders, Shipments and Courier access. If pickup-address discovery is denied, use the optional pickup nickname secret instead of granting broad Settings access. PII IP allowlisting remains subject to Shiprocket account rules; do not enter invented egress IPs.

## Validation and launch

Automated tests cover secure credential handling, package/rate validation, cache binding and expiry, payment reservation, paid-only durable enqueue, export claims, stock idempotency and checkout total review. A read-only production credential and sample route check succeeded before installation. At installation all 38 active products lacked packed shipping measurements. The owner subsequently authorised estimates for round cardboard poster packaging: all 20 A3 poster listings now use 500 g and outer dimensions 45 × 8 × 8 cm per packed unit. These are estimates, not measured values, and must be checked before dispatch. The backend successfully quoted one ₹199 poster to 560068 (₹127.72 shipping), 700001 (₹245.40), and 110001 (₹144.72) using live Shiprocket responses; those rates can change. Other product types still need packed measurements. No real payment, paid shipment, pickup or refund was created as an integration test. A completed live checkout and real shipment test are still required before claiming end-to-end launch readiness.
