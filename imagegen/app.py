"""Image API: prompt in, PNG out; PNG in, DINOv2 embedding out (for scoring guesses).

Only the game server (../server) is meant to call this, never players' browsers:
  - it listens on localhost only, so it isn't reachable from the internet, and
  - every request must carry the shared secret IMAGE_API_SECRET, which only the game server knows.
The server requests images for game turns and its local image testing page.

Run:  .venv/bin/python app.py
"""

import asyncio
import json
import os
import secrets
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

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

from model_config import DEFAULT_MODEL, MODELS, model_config


def load_generator():
    from model import generate_with_metadata, prepare_model

    prepare_model()
    return generate_with_metadata, prepare_model


def load_scorer():
    from scorer import embed

    return embed


@asynccontextmanager
async def lifespan(app):
    # A single worker loads the image model and serializes generation. DINOv2 scoring runs
    # on its own worker (PyTorch on CPU) so embedding one image doesn't wait behind the next.
    loop = asyncio.get_running_loop()
    with (
        ThreadPoolExecutor(max_workers=1, thread_name_prefix="image-model") as worker,
        ThreadPoolExecutor(max_workers=1, thread_name_prefix="scorer") as scorer,
    ):
        app.state.worker = worker
        app.state.scorer = scorer
        app.state.generate, app.state.prepare = await loop.run_in_executor(worker, load_generator)
        app.state.embed = await loop.run_in_executor(scorer, load_scorer)
        yield


# No public docs pages: there's nothing here for outsiders to discover.
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)


class ModelRequest(BaseModel):
    model: str | None = None

    @field_validator("model")
    @classmethod
    def known_model(cls, value):
        model_config(value)
        return value


class GenerateRequest(ModelRequest):
    prompt: str = Field(min_length=1, max_length=200)
    style: str = "Any"
    creativity: int = Field(default=50, ge=0, le=100)


def require_game_server(authorization: str = Header(default="")):
    if not secrets.compare_digest(authorization.encode(), f"Bearer {SECRET}".encode()):
        raise HTTPException(status_code=401)


@app.post("/generate", dependencies=[Depends(require_game_server)])
async def generate_image(req: GenerateRequest):
    if req.style not in ART_STYLES:
        raise HTTPException(status_code=422, detail="unknown style")
    png, modifiers = await asyncio.get_running_loop().run_in_executor(
        app.state.worker, app.state.generate, req.prompt, req.style, req.creativity, req.model
    )
    return Response(png, media_type="image/png", headers={"X-Image-Modifiers": json.dumps(modifiers)})


@app.post("/prepare", dependencies=[Depends(require_game_server)])
async def prepare_image_model(req: ModelRequest):
    await asyncio.get_running_loop().run_in_executor(app.state.worker, app.state.prepare, req.model)
    return {"ready": True, "model": model_config(req.model)["id"]}


MAX_PNG = 8 * 1024 * 1024


@app.post("/embed", dependencies=[Depends(require_game_server)])
async def embed_image(request: Request):
    """PNG body in, unit-length DINOv2 embedding out, for scoring guesses against the reference."""
    png = await request.body()
    if not png or len(png) > MAX_PNG:
        raise HTTPException(status_code=413 if png else 422)
    try:
        embedding = await asyncio.get_running_loop().run_in_executor(app.state.scorer, app.state.embed, png)
    except Exception:
        raise HTTPException(status_code=422, detail="unreadable image")
    return {"embedding": embedding}


@app.get("/health", dependencies=[Depends(require_game_server)])
async def model_status():
    # Startup finishes loading the model before this endpoint becomes reachable.
    from model import active_model

    config = model_config()
    active = active_model()
    return {"ready": True, "model": config["repo"], "size": config["size"], "steps": config["steps"],
            "flash": config["flash"], "defaultModel": DEFAULT_MODEL, "activeModel": active,
            "activeQuantization": model_config(active)["quantization"] if active else None,
            "models": list(MODELS.values())}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", 8000)))
