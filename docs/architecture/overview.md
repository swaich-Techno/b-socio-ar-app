# Architecture overview

## Components

1. The Next.js web application serves customer, administrator, QR redirect and AR routes. Route handlers perform server-side authentication, role, ownership, state-transition and quota checks.
2. MongoDB Atlas stores users, tenants, product metadata, asset object keys, queue state, reviews, packages, payments, analytics and audit events. Binary content is never stored in MongoDB.
3. Cloudflare R2 stores private originals, processed inputs, draft outputs, payment proof and published assets. The browser uploads through short-lived signed PUT URLs after server authorization.
4. The `bsocio-3d-worker` atomically claims one queued job, downloads its authorized main image, runs validation and TripoSR, optimises and validates a GLB, uploads outputs, updates progress, sends heartbeats and removes temporary files.
5. Dynamic QR images point to an internal `/q/{uniqueCode}` route. That route records a scan, resolves the current destination, and redirects only when the linked experience is allowed.

## Trust boundaries

- Browser input is untrusted. The API ignores client-supplied role, owner, approval and payment-success fields.
- Session cookies are HTTP-only, secure in production, same-site Lax, signed and time-limited.
- R2 credentials and worker secrets exist only in server/worker environments.
- The worker authenticates its protected readiness boundary with `THREE_D_WORKER_SECRET` and independently validates Mongo records/object keys. It writes queue results directly through least-privilege MongoDB/R2 credentials; it does not expose an unauthenticated mutation callback.
- Signed URLs are capabilities with narrow object scope and short expiry. Database records store stable keys, never the signed URL.

## Queue invariants

- Jobs begin as `QUEUED` and remain there while the worker is offline.
- Claiming is an atomic `findOneAndUpdate` from `QUEUED` to `LOCKED` with a worker ID and timestamp.
- A business cannot have more than one non-terminal active job. Remaining work stays queued.
- A stale lock can be recovered after a configured timeout; attempts and an audit trail are retained.
- Customer-safe errors are separate from internal technical errors.

## Publication invariant

Creating a model, AR record, QR record, package or payment does not imply publication. Public AR access requires the explicit production/published state following product review, demo approval, accepted package, verified payment and final administrative approval.
