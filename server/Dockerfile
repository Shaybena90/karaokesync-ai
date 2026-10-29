# Image for the API and the worker (same image, different command).
#   API:    docker run -p 8000:8000 --env-file ../.env karaokesync-server
#   Worker: docker run --env-file ../.env karaokesync-server python -m karaokesync.worker.runner
# For a GPU worker, build FROM an nvidia/cuda runtime image instead.
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt requirements-ai.txt ./
ARG INSTALL_AI=true
RUN pip install --no-cache-dir -r requirements.txt \
    && if [ "$INSTALL_AI" = "true" ]; then pip install --no-cache-dir -r requirements-ai.txt; fi

COPY karaokesync ./karaokesync
ENV APP_ENV=production WORKER_TMP_DIR=/app/tmp FONTS_DIR=/app/fonts PYTHONUNBUFFERED=1
# Download the subtitle fonts (Google Fonts, SIL OFL) at build time; if that
# fails they are downloaded on first use, with a system font as last resort.
RUN mkdir -p /app/fonts /app/tmp \
    && (python -c "from karaokesync.fonts import ensure_font; from karaokesync.styles import FONTS; [ensure_font(f) for f in FONTS]" || true)
RUN useradd --create-home app && chown -R app /app/tmp /app/fonts
USER app

EXPOSE 8000
CMD ["uvicorn", "karaokesync.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
