"""Lightweight local stand-in for the rembg HTTP server (dev only).

Serves the one endpoint the API uses (POST /api/remove, multipart field `file`,
PNG response) with a small model so nothing heavy is downloaded.
Env: REMBG_LITE_PORT (default 7070), REMBG_LITE_MODEL (default u2netp).
"""
import os

import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import Response
from rembg import new_session, remove

session = new_session(os.environ.get("REMBG_LITE_MODEL", "u2netp"))
app = FastAPI()


@app.get("/")
@app.get("/api")
def health():
    return "ok"


@app.post("/api/remove")
async def api_remove(file: UploadFile = File(...)):
    return Response(remove(await file.read(), session=session), media_type="image/png")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("REMBG_LITE_PORT", "7070")), log_level="warning")
