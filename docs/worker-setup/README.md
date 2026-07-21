# 3D worker setup

The worker is intentionally separate from the web process because PyTorch, TripoSR and Blender require substantially different compute and deployment characteristics.

## Windows

```powershell
Set-Location "C:\path\to\b-socio-ar-app\apps\worker"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
& .\scripts\install-triposr.ps1 -Revision "<reviewed-40-character-commit-sha>"
uvicorn app.main:app --reload
```

Install the correct PyTorch build for the host before production use. CUDA builds must match the NVIDIA driver/CUDA runtime. Keep `THREE_D_DEVICE=auto` unless operations deliberately require `cpu` or `cuda`.

## TripoSR and Blender

- TripoSR is open source but its code and weights are external operational dependencies. Use only a version/license approved by your organization. The installer and image reject branch names and require a reviewed full 40-character commit SHA.
- Set the model/repository/cache values documented by the worker environment example.
- Install Blender and set `BLENDER_EXECUTABLE` to the full `blender.exe` path when it is not on PATH.
- Pre-warm model weights into a durable machine/container cache. Customer files must stay in per-job temporary folders, never that cache.

## Operations

Run a single queue loop per worker process unless capacity planning explicitly increases it. The renewable lease token and compare-and-set recovery protect against duplicate processing. Monitor public liveness at `/health`; monitor authenticated readiness at `/ready` with `Authorization: Bearer <THREE_D_WORKER_SECRET>`, plus heartbeat age, current job, queue length, attempts, temporary disk space, CUDA memory and output validation failures.

Stopping the worker is safe: unclaimed jobs remain `QUEUED`; active jobs renew both job and business leases; stale claimed jobs are recovered only through an exact lease compare-and-set. Retryable failures use bounded backoff, while exhausted or invalid inputs return the product to an actionable changes-requested state.
