"""Local Chroma1-HD inference. Load and generate on the API's single model worker."""

import io
import logging
import os
import random
import time

# Read before importing torch; explicit environment settings still take precedence.
os.environ.setdefault("PYTORCH_MPS_FAST_MATH", "1")
os.environ.setdefault("PYTORCH_MPS_PREFER_METAL", "1")

import torch
from diffusers import ChromaPipeline

MODEL_ID = "lodestones/Chroma1-HD"
FLASH = os.environ.get("IMAGE_FLASH", "1") == "1"
STEPS = int(os.environ.get("IMAGE_STEPS", "6" if FLASH else "20"))
SIZE = int(os.environ.get("IMAGE_SIZE", "384" if FLASH else "512"))
if STEPS < 1 or SIZE < 256 or SIZE % 16:
    raise ValueError("IMAGE_STEPS must be positive; IMAGE_SIZE must be at least 256 and divisible by 16.")
logger = logging.getLogger("uvicorn.error")
STYLE_SUFFIX = {
    "Any": "",
    "Photo": ", photograph, realistic, detailed",
    "Cartoon": ", cartoon illustration, bold outlines, flat colors",
    "Pixel art": ", pixel art, 16-bit, retro game sprite",
    "Oil painting": ", oil painting, visible brush strokes, canvas texture",
    "Claymation": ", claymation, stop-motion clay figures, plasticine",
}

# Diffusion has no sampling temperature, so "creativity" (0-100) steers how literally the prompt
# is drawn: low values ask for a plain, readable depiction; high values mix in random twists.
LITERAL_SUFFIX = ", literal depiction, single clear subject, simple composition, plain background"
TWISTS = [
    "surreal", "dreamlike", "unexpected setting", "strange scale", "vivid unusual colors",
    "whimsical details", "dramatic lighting", "fantasy elements", "abstract shapes", "odd perspective",
]


def creative_suffix(creativity: int) -> str:
    if creativity < 35:
        return LITERAL_SUFFIX
    twists = round((creativity - 50) / 25)  # 0 up to 62, 1 up to 87, then 2
    return "".join(f", {t}" for t in random.sample(TWISTS, max(twists, 0)))

_pipeline = None


@torch.inference_mode()
def load_model():
    global _pipeline
    if _pipeline is not None:
        return
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    dtype = {"cpu": torch.float32, "mps": torch.float16, "cuda": torch.bfloat16}[device]
    logger.info("Loading %s on %s (first run downloads the model weights)", MODEL_ID, device)
    pipeline = ChromaPipeline.from_pretrained(MODEL_ID, dtype=dtype, use_safetensors=True)
    if FLASH:
        from chroma_flash import fuse_flash_adapter

        logger.info("Fusing Chroma Flash adapter")
        fuse_flash_adapter(pipeline.transformer)
    pipeline.to(device)
    pipeline.vae.enable_tiling()
    # Pay for the first GPU kernels at startup, before /health reports ready.
    logger.info("Warming Chroma up")
    _render(pipeline, "A red apple on a wooden table", seed=0)
    _pipeline = pipeline
    logger.info("Chroma ready: %sx%s, %s steps, Flash %s", SIZE, SIZE, STEPS, FLASH)


def _finish_mps_step(pipeline, step, timestep, callback_kwargs):
    # Keep the GPU queue bounded. Letting Metal operations build up between
    # steps increased latency substantially in the local Chroma benchmarks.
    torch.mps.synchronize()
    return callback_kwargs


def _render(pipeline, text, seed):
    # Short prompts do not need 256 padding tokens. Retain room for long prompts
    # and style/creativity suffixes, including non-English text, without truncating.
    token_count = len(pipeline.tokenizer(text).input_ids)
    sequence_length = max(64, min(512, ((token_count + 63) // 64) * 64))
    return pipeline(
        prompt=text,
        negative_prompt=None if FLASH else "blurry, low quality, distorted",
        height=SIZE,
        width=SIZE,
        num_inference_steps=STEPS,
        guidance_scale=1.0 if FLASH else 3.0,
        max_sequence_length=sequence_length,
        generator=torch.Generator("cpu").manual_seed(seed),
        callback_on_step_end=_finish_mps_step if pipeline.device.type == "mps" else None,
    ).images[0]


@torch.inference_mode()
def generate(prompt: str, style: str, creativity: int = 50) -> bytes:
    """Return PNG bytes for `prompt` in the lobby's art style and creativity."""
    load_model()
    started = time.monotonic()
    text = prompt + creative_suffix(creativity) + STYLE_SUFFIX.get(style, "")
    image = _render(_pipeline, text, random.getrandbits(63))

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    logger.info("Chroma generated an image in %.1fs", time.monotonic() - started)
    return buf.getvalue()
