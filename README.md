# B Socio AR

B Socio AR is a mobile-first SaaS platform that takes a business from a five-product demo through private image upload, queued open-source 3D generation, secure model review, draft AR and dynamic QR creation, administrator approval, a custom commercial package, manual payment verification, and controlled public publishing.

The internal project name is **B SOCIO AR APP**. This repository is a pnpm monorepo. The Next.js web application and Python 3D worker are deployed independently; no production credentials or generated customer assets belong in source control.

## Repository layout

```text
apps/
  web/       Next.js App Router application and API
  worker/    FastAPI + TripoSR queue worker
packages/
  shared-types/ validation/ database/ storage/
  qr-engine/ constants/ ui/
docs/        Architecture and operational runbooks
```

## Prerequisites

- Windows 10/11 with PowerShell 7 or Windows PowerShell 5.1
- Node.js 24
- pnpm 11.9.0
- Python 3.11 or 3.12 for the worker
- MongoDB Atlas database
- Cloudflare R2 account with private and public buckets
- For actual 3D generation: Git, supported PyTorch runtime, TripoSR weights, and Blender 4.x CLI
- NVIDIA CUDA is optional; CPU processing remains supported and can be slow

## Web application setup on Windows

```powershell
Set-Location "C:\path\to\b-socio-ar-app"
Copy-Item .env.example apps\web\.env.local
pnpm install
pnpm db:indexes
pnpm dev
```

Open `http://localhost:3000`. Fill `apps\web\.env.local` before using database, authentication, email, upload, or worker-backed features. The application never substitutes production credentials and does not report a successful external operation when its provider is unconfigured.

## Production verification

```powershell
Set-Location "C:\path\to\b-socio-ar-app"
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

End-to-end browser tests install their browser once and then run separately:

```powershell
Set-Location "C:\path\to\b-socio-ar-app"
pnpm --filter @bsocio/web exec playwright install chromium
pnpm test:e2e
```

## Worker setup on Windows

```powershell
Set-Location "C:\path\to\b-socio-ar-app\apps\worker"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```

Run the queue processor in a second terminal when it is provided as a separate command:

```powershell
Set-Location "C:\path\to\b-socio-ar-app\apps\worker"
.\.venv\Scripts\Activate.ps1
python -m app.worker
```

## Docker worker

```powershell
Set-Location "C:\path\to\b-socio-ar-app\apps\worker"
$env:TRIPOSR_REVISION = "<reviewed-40-character-commit-sha>"
docker build --build-arg TRIPOSR_REVISION=$env:TRIPOSR_REVISION -t bsocio-3d-worker .
docker run --env-file .env --name bsocio-3d-worker bsocio-3d-worker
```

For GPU execution, install NVIDIA Container Toolkit and add `--gpus all`. Set `THREE_D_DEVICE=auto`; the worker selects CUDA when available and otherwise uses CPU.

## Required configuration

Copy `.env.example` to `apps\web\.env.local` and provide at minimum:

- `MONGODB_URI`, `AUTH_SECRET`
- `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD_HASH`
- R2 account, S3-compatible endpoint, access keys, private/public bucket names
- `NEXT_PUBLIC_APP_URL`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`

Generate secrets locally, for example:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
pnpm --filter @bsocio/web exec node -e "const bcrypt=require('bcryptjs'); bcrypt.hash(process.argv[1], 12).then(console.log)" "replace-with-a-temporary-password"
```

Do not commit `.env.local`, the worker `.env`, passwords, hashes tied to a known password, R2 keys, signed URLs, customer images, models, or payment proof.

## Core lifecycle

```text
Register → onboard business → create demo → add up to five products
→ signed private R2 upload → atomic MongoDB job queue
→ TripoSR worker → private GLB preview → per-product admin review
→ draft AR + dynamic QR → demo approval → custom package
→ manual payment verification → production approval → publish
```

The application enforces the one-demo/five-product/five-job/five-AR/five-QR limits on the server. A sixth product is rejected even if a caller bypasses the UI. Draft AR and GLB assets remain private; `/q/<code>` resolves only to an allowed AR destination and records scan analytics without making source images public.

## Documentation

- [Architecture](docs/architecture/overview.md)
- [Local setup](docs/local-setup/README.md)
- [MongoDB Atlas](docs/mongodb/README.md)
- [Cloudflare R2](docs/cloudflare-r2/README.md)
- [Worker setup](docs/worker-setup/README.md)
- [Administrator setup](docs/admin-setup/README.md)
- [Deployment checklist](docs/deployment/README.md)
- [Vercel deployment](docs/deployment/VERCEL.md)
- [Restaurant and jewellery commerce](docs/commerce/README.md)
- [Security model](docs/security/README.md)
- [Troubleshooting](docs/troubleshooting/README.md)

## Important operational boundaries

- There is no public administrator registration route.
- Customer roles, ownership IDs, approvals, and payment success are derived server-side.
- Originals and drafts remain in the private R2 bucket. Only approved production AR assets may be copied to the public bucket.
- Signed URLs are short lived (default 10 minutes) and are not stored as permanent database values.
- Worker outage leaves jobs queued. It does not fail or discard uploads.
- Only one active 3D job per business is permitted by the queue and lock rules.
- The worker uses temporary local files only and removes them after every attempt.
- TripoSR model weights and live provider credentials are operational prerequisites, not committed assets.

See each runbook before connecting production services.
