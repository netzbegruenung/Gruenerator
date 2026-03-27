FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    --extra-index-url https://pypi.org/simple/ \
    -r requirements.txt

# Download model weights at build time
RUN python -c "from transformers import VoxtralRealtimeForConditionalGeneration, AutoProcessor; \
    AutoProcessor.from_pretrained('mistralai/Voxtral-Mini-4B-Realtime-2602'); \
    VoxtralRealtimeForConditionalGeneration.from_pretrained('mistralai/Voxtral-Mini-4B-Realtime-2602')"

COPY app.py .

ENV OMP_NUM_THREADS=4
ENV MKL_NUM_THREADS=4

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=300s \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-keep-alive", "900"]
