"""Image API: prompt in, PNG out.

Only the game server (../server) is meant to call this, never players' browsers. To keep people
outside the game from using it for free images:
  - it listens on localhost only, so it isn't reachable from the internet, and
  - every request must carry the shared secret IMAGE_API_SECRET, which only the game server knows.
The game server only requests an image when a real game turn ends, so playing is the only way in.

Run:  .venv/bin/python app.py
"""

import os
import secrets
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel, Field

from model import generate

# Minimal .env loader so the secret can live in imagegen/.env (gitignored).
env_file = Path(__file__).with_name(".env")
if env_file.exists():
    for line in env_file.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            os.environ.setdefault(key.strip(), value.strip())

SECRET = os.environ.get("IMAGE_API_SECRET", "")
if len(SECRET) < 16:
    raise SystemExit("Set IMAGE_API_SECRET (16+ chars) in imagegen/.env; server/.env must use the same value.")

ART_STYLES = {"Any", "Photo", "Cartoon", "Pixel art", "Oil painting", "Claymation"}

# No public docs pages: there's nothing here for outsiders to discover.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
gpu_lock = threading.Lock()  # one image at a time so the model doesn't run out of memory


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=200)
    style: str = "Any"


def require_game_server(authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization.encode(), f"Bearer {SECRET}".encode()):
        raise HTTPException(status_code=401)


@app.post("/generate", dependencies=[Depends(require_game_server)])
def generate_image(req: GenerateRequest):
    if req.style not in ART_STYLES:
        raise HTTPException(status_code=422, detail="unknown style")
    with gpu_lock:
        png = generate(req.prompt, req.style)
    return Response(png, media_type="image/png")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
