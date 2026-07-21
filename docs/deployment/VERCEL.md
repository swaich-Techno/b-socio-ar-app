# Vercel deployment

Vercel hosts only the Next.js application. Deploy the Python/TripoSR/Blender worker independently on a persistent GPU-capable Docker host.

## Project settings

- Import the complete GitHub repository.
- Set **Framework Preset** to `Next.js`.
- Set **Root Directory** to `apps/web`.
- Keep **Include source files outside the Root Directory** enabled so workspace packages are available.
- Use Node.js `24.x`.
- Keep the framework build command and `.next` output defaults.
- Add `ENABLE_EXPERIMENTAL_COREPACK=1` to Production and Preview so Vercel honors `pnpm@11.9.0` from the root package manifest.

## Production environment

Copy the applicable values from the root `.env.example` into Vercel. At minimum configure:

```dotenv
ENABLE_EXPERIMENTAL_COREPACK=1
NEXT_PUBLIC_APP_URL=https://app.example.com
MONGODB_URI=mongodb+srv://...
MONGODB_DB_NAME=bsocio_ar
AUTH_SECRET=replace-with-at-least-32-random-characters
AUTH_COOKIE_NAME=bsocio_session
SESSION_TTL_SECONDS=604800
SUPER_ADMIN_EMAIL=admin@example.com
SUPER_ADMIN_PASSWORD_HASH=replace-with-a-bcrypt-hash
R2_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=replace-me
R2_SECRET_ACCESS_KEY=replace-me
R2_PRIVATE_BUCKET=bsocio-private
R2_PUBLIC_BUCKET=bsocio-public
R2_PUBLIC_DOMAIN=https://assets.example.com
R2_SIGNED_URL_TTL_SECONDS=600
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=replace-me
SMTP_PASSWORD=replace-me
EMAIL_FROM=B Socio AR <no-reply@example.com>
ALLOW_DEMO_MODE=false
```

Set production credentials only in the Production environment. Use separate staging resources for Preview deployments or leave provider-backed preview features unconfigured. Do not set `NODE_ENV`; Vercel supplies it.

`R2_ACCOUNT_ID` is documentation-only in the current web runtime. `THREE_D_WORKER_SECRET` and `DEMO_MODEL_TARGET_SIZE_MB` belong to the worker deployment rather than Vercel.

## Before accepting traffic

1. Configure the final custom application and R2 asset domains.
2. Configure Atlas network access, backups, and separate least-privilege web/worker users.
3. Run `pnpm db:indexes` once with production MongoDB credentials.
4. Configure exact-origin R2 CORS and deny anonymous access to the private bucket.
5. Verify SMTP SPF, DKIM, DMARC, registration verification, and password reset.
6. Test upload, queue processing, administrator review, payment verification, publication, mobile QR/AR access, revocation, and monitoring.
