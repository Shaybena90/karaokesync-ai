# Image for the API and the worker (same image, different command).
#   API:    docker run -p 8000:8000 --env-file ../.env karaokesync-server
#   Worker: docker run --env-file ../.env karaokesync-server python -m karaokesync.worker.runner
# For a GPU worker, build FROM an nvidia/cuda runtime image instead.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-ai.txt ./
ARG INSTALL_AI=true
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_AI" = "true" ]; then pip install --no-cache-dir -r requirements-ai.txt; fi

COPY karaokesync ./karaokesync
RUN useradd --create-home app && mkdir -p /app/tmp && chown app /app/tmp
USER app
ENV APP_ENV=production WORKER_TMP_DIR=/app/tmp PYTHONUNBUFFERED=1

EXPOSE 8000
CMD ["uvicorn", "karaokesync.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
