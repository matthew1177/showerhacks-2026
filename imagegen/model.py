"""Local Chroma and SDXL-Turbo inference on the API's single model worker."""

import io
import gc
import logging
import os
import random
import time

# Read before importing torch; explicit environment settings still take precedence.
os.environ.setdefault("PYTORCH_MPS_FAST_MATH", "1")
os.environ.setdefault("PYTORCH_MPS_PREFER_METAL", "1")

import torch
from diffusers import ChromaPipeline, StableDiffusionXLPipeline
from model_config import model_config
from prompt_modifiers import compose_prompt, select_modifiers

logger = logging.getLogger("uvicorn.error")
STYLE_SUFFIX = {
    "Any": "",
    "Photo": ", photograph, realistic, detailed",
    "Cartoon": ", cartoon illustration, bold outlines, flat colors",
    "Pixel art": ", pixel art, 16-bit, retro game sprite",
    "Oil painting": ", oil painting, visible brush strokes, canvas texture",
    "Claymation": ", claymation, stop-motion clay figures, plasticine",
}

_pipeline = None
_active_model = None


@torch.inference_mode()
def load_model(model=None):
    """Load one selected model on the single worker; never mix fused and HD weights."""
    global _pipeline, _active_model
    config = model_config(model)
    if _pipeline is not None and _active_model == config["id"]:
        return _pipeline
    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    # A single resident model avoids doubling GPU memory when different rooms
    # choose different models. Reload pristine weights instead of undoing a fused adapter.
    _pipeline = None
    _active_model = None
    gc.collect()
    if device == "mps":
        torch.mps.empty_cache()
    elif device == "cuda":
        torch.cuda.empty_cache()
    dtype = {"cpu": torch.float32, "mps": torch.float16, "cuda": torch.bfloat16}[device]
    logger.info("Loading %s on %s (first run downloads the model weights)", config["label"], device)
    pipeline_class = StableDiffusionXLPipeline if config["id"] == "sdxl-turbo" else ChromaPipeline
    pipeline = pipeline_class.from_pretrained(config["repo"], dtype=dtype, use_safetensors=True)
    if config["flash"]:
        from chroma_flash import fuse_flash_adapter

        logger.info("Fusing Chroma Flash adapter")
        fuse_flash_adapter(pipeline.transformer)
    if config["quantization"] == "int8":
        from chroma_quantization import quantize_chroma

        # Merge the adapter at the original precision before discarding float weights.
        quantize_chroma(pipeline)
    pipeline.to(device)
    pipeline.vae.enable_tiling()
    # Pay for the first GPU kernels at startup, before /health reports ready.
    logger.info("Warming %s up", config["label"])
    _render(pipeline, "A red apple on a wooden table", config, seed=0)
    _pipeline = pipeline
    _active_model = config["id"]
    logger.info("%s ready: %sx%s, %s steps, quantization=%s",
                config["label"], config["size"], config["size"], config["steps"], config["quantization"])
    return pipeline


def prepare_model(model=None):
    load_model(model)


def active_model():
    return _active_model


def _finish_mps_step(pipeline, step, timestep, callback_kwargs):
    # Keep the GPU queue bounded. Letting Metal operations build up between
    # steps increased latency substantially in the local Chroma benchmarks.
    torch.mps.synchronize()
    return callback_kwargs


def _render(pipeline, text, config, seed):
    options = {
        "prompt": text,
        "height": config["size"],
        "width": config["size"],
        "num_inference_steps": config["steps"],
        "generator": torch.Generator("cpu").manual_seed(seed),
        "callback_on_step_end": _finish_mps_step if pipeline.device.type == "mps" else None,
    }
    if config["id"] == "sdxl-turbo":
        # Turbo uses one step without classifier-free guidance or negative prompts.
        return pipeline(**options, guidance_scale=0.0).images[0]
    # Short prompts do not need 256 padding tokens. Retain room for long prompts
    # and style/creativity suffixes, including non-English text, without truncating.
    token_count = len(pipeline.tokenizer(text).input_ids)
    sequence_length = max(64, min(512, ((token_count + 63) // 64) * 64))
    return pipeline(
        **options,
        negative_prompt=None if config["flash"] else "blurry, low quality, distorted",
        guidance_scale=1.0 if config["flash"] else 3.0,
        max_sequence_length=sequence_length,
    ).images[0]


@torch.inference_mode()
def generate_with_metadata(prompt: str, style: str, creativity: int = 50, model=None) -> tuple[bytes, list[str]]:
    """Return the PNG and the exact modifiers used, without drawing a second time."""
    config = model_config(model)
    pipeline = load_model(config["id"])
    started = time.monotonic()
    modifiers = select_modifiers(creativity)
    text = compose_prompt(prompt, creativity, modifiers) + STYLE_SUFFIX.get(style, "")
    image = _render(pipeline, text, config, random.getrandbits(63))

    buf = io.BytesIO()
    image.save(buf, format="PNG")
    logger.info("%s generated an image in %.1fs", config["label"], time.monotonic() - started)
    return buf.getvalue(), modifiers


def generate(prompt: str, style: str, creativity: int = 50, model=None) -> bytes:
    """Keep the PNG-only interface for local scripts."""
    return generate_with_metadata(prompt, style, creativity, model)[0]
