# Deployment checklist

This repository does not deploy automatically. A production operator should:

1. Pin and review Node, pnpm, Python, PyTorch, TripoSR and Blender versions.
2. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, Pytest and browser smoke tests.
3. Provision MongoDB Atlas with backups, network restrictions and alerts, then run `pnpm db:indexes` with production credentials and review every created unique/TTL index before accepting traffic.
4. Provision private/public R2 buckets, narrow CORS and least-privilege tokens.
5. Store web, worker and administrator secrets in the platform secret manager.
6. Deploy web and worker independently; keep the worker API private and require `Authorization: Bearer $THREE_D_WORKER_SECRET` on `/ready`.
7. Configure TLS, the final `NEXT_PUBLIC_APP_URL`, secure cookies, CSP and trusted proxy/IP handling.
8. Verify private-object denial, signed URL expiry, five-product limit, atomic one-job concurrency, stale-lock recovery and draft AR denial.
9. Verify final publication with a test tenant: approved model, QR redirect, analytics, revocation and rollback.
10. Configure logging redaction, uptime/heartbeat alerts, queue-depth alerts, database/R2 backup reconciliation and incident contacts.
11. Configure SMTP delivery, then verify registration-email and password-reset links against the final public origin.

Do not promote a build that relies on `ALLOW_DEMO_MODE`, uses local disk for persistent customer files, or has real credentials in an image/repository.
