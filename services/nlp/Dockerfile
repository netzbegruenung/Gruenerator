# Grünerator NLP Service - Topic Classification via spaCy
#
# Build:
#   docker build -t gruenerator-nlp .
#
# Run:
#   docker run -p 8000:8000 gruenerator-nlp

FROM python:3.12-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir .

# Pre-download spaCy model (~610 MB, baked into image for fast startup)
RUN python -m spacy download de_core_news_lg

# ----- Runtime stage -----
FROM python:3.12-slim

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /root/.cache /root/.cache

COPY src/ /app/src/

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()" || exit 1

CMD ["uvicorn", "topic_classifier.api:app", "--host", "0.0.0.0", "--port", "8000"]
