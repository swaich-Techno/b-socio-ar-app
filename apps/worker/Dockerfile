FROM python:3.11-slim AS runtime

ARG TRIPOSR_REVISION
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TRIPOSR_REPOSITORY_PATH=/opt/TripoSR \
    BLENDER_EXECUTABLE=/usr/bin/blender \
    WORKER_TEMP_ROOT=/var/tmp/bsocio-worker \
    WORKER_RUN_LOOP_IN_API=true

RUN apt-get update && apt-get install -y --no-install-recommends \
    blender git build-essential libgl1 libglib2.0-0 libgomp1 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /srv/worker
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip setuptools wheel && pip install -r requirements.txt
RUN test -n "$TRIPOSR_REVISION" && echo "$TRIPOSR_REVISION" | grep -Eq '^[0-9a-fA-F]{40}$' && \
    git clone --filter=blob:none https://github.com/VAST-AI-Research/TripoSR.git /opt/TripoSR && \
    git -C /opt/TripoSR checkout "$TRIPOSR_REVISION" && \
    pip install -r /opt/TripoSR/requirements.txt

COPY app ./app
RUN useradd --create-home --uid 10001 worker && mkdir -p /var/tmp/bsocio-worker && chown -R worker:worker /srv/worker /var/tmp/bsocio-worker /opt/TripoSR
USER worker

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import os,urllib.request; request=urllib.request.Request('http://127.0.0.1:8000/ready',headers={'Authorization':'Bearer '+os.environ['THREE_D_WORKER_SECRET']}); urllib.request.urlopen(request,timeout=3)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
