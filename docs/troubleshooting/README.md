# Troubleshooting

## The public site loads but sign-in fails

Check `MONGODB_URI`, `AUTH_SECRET` and Atlas network access. Configuration errors are intentional until real values are provided. Ensure server time is correct because sessions are time-bound.

## R2 upload fails

Confirm endpoint/account IDs, token permissions, bucket names, exact-origin CORS, browser clock, MIME and size. A signed URL expires after roughly ten minutes; request a new one instead of retrying an expired URL.

## Jobs stay queued

This is expected while the worker is offline. Check worker `/health`, the `workerHeartbeats` record, `THREE_D_WORKER_SECRET`, Mongo access and queue filter. Do not manually mark the job failed. Restart the worker and let stale-lock recovery handle abandoned claims.

## Worker says CUDA is unavailable

With `THREE_D_DEVICE=auto` it falls back to CPU. If `cuda` is forced, verify NVIDIA drivers, the matching PyTorch build and container GPU access. CPU generation can be slow and should continue reporting accurate progress rather than a fabricated ETA.

## TripoSR/model load fails

Verify the pinned open-source TripoSR installation, model weight/cache path, license acceptance and available RAM/VRAM. The worker deliberately reports a configuration/internal error rather than producing a fake GLB.

## GLB validation or optimisation fails

Check Blender/Trimesh availability, executable path, temporary disk, mesh/material validity and texture memory. The original private upload is retained so an administrator can request better images or regeneration.

## Build attempts to connect to providers

Provider clients must initialize lazily. Ensure no page/module invokes MongoDB or R2 at module import time. Build-time configuration validation should validate format without opening a network connection.

## Mobile horizontal scrolling

Run the Playwright mobile projects and inspect the offending element. Pages must fit the viewport; only explicitly marked table containers may scroll horizontally. Long object keys/URLs should wrap or be omitted from customer views.
