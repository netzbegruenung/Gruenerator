"""
Self-hosted Voxtral transcription service.
Runs Voxtral-Mini-4B on CPU for privacy-sensitive audio transcription.
Audio never leaves the infrastructure.
"""

import io
import logging
import time

import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse
from mistral_common.tokens.tokenizers.audio import Audio
from transformers import VoxtralRealtimeForConditionalGeneration, AutoProcessor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voxtral")

app = FastAPI(title="Voxtral Self-Hosted Transcription")

model = None
processor = None
MODEL_ID = "mistralai/Voxtral-Mini-4B-Realtime-2602"


@app.on_event("startup")
async def load_model():
    global model, processor
    logger.info(f"Loading model {MODEL_ID}...")
    start = time.time()
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = VoxtralRealtimeForConditionalGeneration.from_pretrained(
        MODEL_ID, torch_dtype=torch.float16, device_map="cpu"
    )
    model.eval()
    elapsed = time.time() - start
    logger.info(f"Model loaded in {elapsed:.1f}s")


@app.get("/health")
async def health():
    if model is None:
        return JSONResponse({"status": "loading"}, status_code=503)
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("de"),
    timestamps: bool = Form(False),
):
    if model is None or processor is None:
        return JSONResponse(
            {"error": "Model not loaded yet"}, status_code=503
        )

    start = time.time()
    logger.info(
        f"Transcribing: {audio.filename} (language={language}, timestamps={timestamps})"
    )

    try:
        audio_bytes = await audio.read()
        audio_obj = Audio.from_bytes(audio_bytes)
        audio_array = audio_obj.to_array()
        sampling_rate = audio_obj.sampling_rate

        conversation = [
            {
                "role": "user",
                "content": [
                    {"type": "audio", "audio": audio_array, "sampling_rate": sampling_rate},
                    {"type": "text", "text": f"Transcribe this audio. Language: {language}"},
                ],
            }
        ]

        inputs = processor.apply_chat_template(
            conversation,
            tokenize=True,
            add_generation_prompt=True,
            return_tensors="pt",
            return_dict=True,
        )
        inputs = {k: v.to(model.device) for k, v in inputs.items()}

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=4096,
                do_sample=False,
            )

        prompt_len = inputs["input_ids"].shape[-1]
        generated_ids = output_ids[0][prompt_len:]
        text = processor.decode(generated_ids, skip_special_tokens=True).strip()

        elapsed = time.time() - start
        logger.info(f"Transcription completed in {elapsed:.1f}s ({len(text)} chars)")

        result = {"text": text, "segments": [], "has_timestamps": False}

        if timestamps:
            result["segments"] = _extract_timestamps(text)
            result["has_timestamps"] = len(result["segments"]) > 0

        return result

    except Exception as e:
        logger.error(f"Transcription failed: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


def _extract_timestamps(text: str) -> list[dict]:
    """Extract timestamp segments if the model produced them."""
    import re

    segments = []
    pattern = r"\[(\d+\.?\d*)\s*->\s*(\d+\.?\d*)\]\s*(.+?)(?=\[|$)"
    for match in re.finditer(pattern, text, re.DOTALL):
        segments.append({
            "start": float(match.group(1)),
            "end": float(match.group(2)),
            "text": match.group(3).strip(),
        })
    return segments
