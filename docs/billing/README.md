# Locate Now subscription billing setup

The billing subsystem keeps plan, price, entitlement, usage, invoice, payment, coupon, add-on, change, refund, and webhook records in MongoDB. Company-facing controls are under `/dashboard/billing`; authorized B Socio finance and super-admin controls are under `/admin/billing`.

## Development and test payments

`BILLING_TEST_MODE=true` is the safe default. A checkout created in this mode is labelled as a test transaction and must be completed from the company billing page. Test payments and invoices retain `isTest: true`; they must not be treated as settled production revenue.

Seed the editable default catalog:

```powershell
pnpm billing:seed
```

In a non-production environment, `pnpm --filter @bsocio/web billing:seed -- --samples` can also attach sample trial, active, and failed-payment records to up to three existing customer companies that do not already have subscriptions.

## Stripe

1. Set `BILLING_TEST_MODE=false`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` using server-only environment variables.
2. Create monthly and annual Stripe Prices, then store their IDs on the corresponding `PlanPrice.stripePriceIds` records.
3. Register `POST https://<host>/api/webhooks/stripe`.
4. Subscribe to at least `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.deleted`.
5. Start with Stripe test keys and signed test webhook events before enabling live keys.

The server creates Checkout Sessions directly and verifies the timestamped `Stripe-Signature` HMAC with a five-minute tolerance.

## Razorpay

1. Set `BILLING_TEST_MODE=false`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` as server-only variables.
2. Create recurring Razorpay Plans and store their IDs on `PlanPrice.razorpayPlanIds`.
3. Register `POST https://<host>/api/webhooks/razorpay`.
4. Enable subscription activation/charge/cancellation, payment captured/failed, and payment-link paid events.
5. Validate the complete flow using `rzp_test_` credentials before live mode.

Recurring subscriptions use Razorpay Subscriptions. One-time request packs use Razorpay Payment Links. The server validates `X-Razorpay-Signature` before processing.

## Webhook idempotency

Every provider event is stored by the unique `(provider, externalEventId)` pair before business logic runs. Duplicate deliveries return success without applying payment or subscription changes a second time. Raw webhook payloads are not retained; only the SHA-256 payload hash and processing result are stored.

## Scheduled maintenance

Configure an hourly scheduler to call:

```text
POST /api/billing/maintenance
Authorization: Bearer <BILLING_CRON_SECRET>
```

Maintenance applies scheduled downgrades, sends trial-ending and grace-ending notifications once, transitions expired trials and grace periods, and expires add-on packs. Usage windows are also created lazily and atomically on the first action in each billing month, so quota reset does not depend solely on the scheduler.

## Regional pricing and tax

The final billing region is stored on the company record and is derived server-side from the company country until a super admin overrides it. Frontend country or currency values never decide the charged price.

Amounts are stored in major currency units. Invoice records include billing identity, line items, discount, overage, add-on, tax, total, currency, and payment references. Keep `taxConfigurationReviewed=false` until a qualified reviewer has configured the applicable GST/VAT/sales-tax rules. The printable invoice intentionally does not claim tax compliance before that review.

## Production checklist

- Store all provider and cron secrets in the deployment secret manager.
- Add Stripe/Razorpay plan IDs to every active regional price that will be sold.
- Confirm webhook URLs use HTTPS and receive signed events.
- Run `pnpm db:indexes`.
- Run `pnpm check`.
- Configure SMTP so billing events reach company administrators by email.
- Configure the maintenance scheduler and monitor failed runs.
- Review tax rules, invoice numbering, refund procedures, retention, and finance access before live collection.
