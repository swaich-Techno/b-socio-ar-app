# Local setup

## Web

```powershell
Set-Location "C:\path\to\b-socio-ar-app"
corepack enable
corepack prepare pnpm@latest --activate
Copy-Item .env.example apps\web\.env.local
pnpm install
pnpm db:indexes
pnpm dev
```

The first request that needs MongoDB or R2 will return a configuration error until those values are filled. Public marketing pages and production compilation do not connect eagerly to external services.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For browser tests, install Chromium once with `pnpm --filter @bsocio/web exec playwright install chromium`, then run `pnpm test:e2e`.

## Worker

Use the commands in the root README or `docs/worker-setup`. The web application and worker may run independently. Uploads continue and new jobs remain queued when the worker is stopped.
