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

# Everything is installed into a venv at a FIXED path, so the runtime stage can
# copy it without naming the interpreter's minor version anywhere.
#
# This used to be `COPY /usr/local/lib/python3.12/site-packages`, which named
# 3.12 in a third place while Dependabot only rewrites the two FROM lines. A
# base-image bump therefore left the copy pointing at a directory the builder
# no longer had — and nothing caught it: the CI test job runs pytest on its own
# setup-python interpreter and never reads this file, and the image is only
# built after the merge (#3304, and #3195 which went green on all 14 checks).
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# requirements.txt is the pinned runtime closure of pyproject.toml (regenerate
# with `uv pip compile pyproject.toml -o requirements.txt`; the CI test job
# uses requirements-dev.txt, compiled with `--extra dev`). pyproject alone only
# carries floors and gave every build a different set.
COPY pyproject.toml requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt .

# Pre-download spaCy model (~610 MB, baked into image for fast startup)
RUN python -m spacy download de_core_news_lg

# ----- Runtime stage -----
FROM python:3.12-slim

WORKDIR /app

# One version-agnostic copy: the venv carries the installed closure, the spaCy
# model and the console scripts (uvicorn), so the two FROM lines above are now
# the only place the Python version is named.
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY src/ /app/src/

ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health').raise_for_status()" || exit 1

CMD ["uvicorn", "topic_classifier.api:app", "--host", "0.0.0.0", "--port", "8000"]
