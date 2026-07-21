# Security model

## Identity and authorization

- Passwords are hashed with an adaptive password hash; sessions are signed, expiring, HTTP-only and secure in production.
- Authentication is followed by server-side role and tenant ownership checks on every protected action.
- Registration always creates a customer. Client-submitted role, owner IDs, approval and payment state are ignored.
- Rate limiting, suspension checks, password-reset token hashing, email-verification token hashing and audit logging reduce account abuse risk.

## Uploads and assets

- The API authorizes a specific product and object purpose before issuing a short-lived signed PUT URL.
- MIME, extension, size, dimensions, corruption, native and independently calculated SHA-256, file magic, checksum duplication and ownership are verified before an asset becomes usable. Signed PUTs are one-write capabilities.
- Generated random object keys prevent filename/path traversal. Originals and drafts never receive permanent public URLs.
- Private GET URLs are generated only after a fresh authorization check and expire quickly.

## Worker and queue

- Renewable lease tokens and compare-and-set recovery prevent duplicate claims even during long CPU generation. Per-business active-job checks enforce the default one-job concurrency.
- Worker credentials never reach the browser. Internal errors are retained for operators while customers receive safe, actionable messages.
- Job directories are random, confined to a configured temporary root and removed in `finally` blocks.

## Administrative changes

Review outcomes, replacement assets, scale/camera changes, demo approval, packages, payments and publication are state transitions, not free-form mass updates. Each validates the previous state and creates an audit record.

## Production controls

Use TLS, a managed secret store, credential rotation, narrow R2 tokens/CORS, restricted MongoDB network access, dependency and container scanning, immutable logs, backups, CSP reporting and alerting. Redact passwords, hashes, tokens, signed URLs, payment proof and private object keys from logs.
