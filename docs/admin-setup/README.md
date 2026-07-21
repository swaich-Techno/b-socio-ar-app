# Administrator setup

There is no administrator registration endpoint or page.

1. Generate a strong one-time super-admin password outside the repository.
2. Generate its bcrypt/Argon-compatible hash using the documented local command.
3. Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD_HASH` in the server environment.
4. Sign in at `/admin/login` and create least-privilege team accounts. Rotate the bootstrap credential by generating a new hash, updating the secret manager and restarting the web service.

Roles are `SUPER_ADMIN`, `ADMIN`, `DEMO_REVIEWER`, `THREE_D_REVIEWER`, `AR_PUBLISHER`, `SALES_MANAGER`, `FINANCE_MANAGER`, `SUPPORT_MANAGER`, and `CUSTOMER`. Assign the narrowest role needed. Role changes, suspension, approvals, model replacements, package edits, payment decisions and publication must produce audit events.

Never send the hash to browser code, expose it through a debug endpoint, store a raw password in environment variables, or use the same secret for sessions and worker authentication.
