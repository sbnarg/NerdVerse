# Customer order tracking

`track-order.html` lists only orders belonging to the signed-in customer. It shows payment, preparation, packing, dispatch, out-for-delivery and delivery, plus courier/AWB when assigned. Links use the existing owner-protected invoice document.

The Shiprocket worker checks shipment tracking at approximately 30-minute intervals. Explicit courier movement advances delivery; unknown states and AWB assignment alone do not imply dispatch. Stale movement cannot regress out-for-delivery to dispatched.

Migration `queue_delivery_notifications` adds `orders.delivery_status`, a server-only RLS-protected `nv_delivery_email_queue`, and an invoker trigger on order status changes. Only paid shipments enqueue dispatch/out-for-delivery/delivery messages. A unique order/stage key and stable provider idempotency key suppress duplicates. The existing payment worker retries unsent delivery notifications; manual admin dispatch/delivery uses that same queue.

Notifications link to the existing invoice; they never issue new invoices or create shipments. Historical Shiprocket invoice reconciliation and pending catalogue tax classifications are outside this change.

Validated with 56 Node tests, TypeScript, a rolled-back production transaction testing all three stages and duplicate suppression, and RLS inspection. No purchase or test email was sent.
