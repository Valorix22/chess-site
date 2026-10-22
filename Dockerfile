FROM python:3.12-slim-bookworm
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir pip==26.2.2 && pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home chess
COPY --chown=chess:chess backend/ /app/
COPY --chown=chess:chess index.html play.html puzzles.html learn.html community.html profile.html tournaments.html watch.html admin.html /app/static/gambit/
COPY --chown=chess:chess assets/ /app/static/gambit/assets/
RUN chmod +x /app/vendor/stockfish && mkdir -p /data && chown chess:chess /data
USER chess
ENV DATA_DIR=/data STOCKFISH_PATH=/app/vendor/stockfish PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')"
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers", "--limit-concurrency", "256", "--backlog", "256", "--timeout-keep-alive", "5"]
