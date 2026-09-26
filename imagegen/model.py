"""SDXL-Turbo on Apple Silicon via MLX. The API calls generate() once per image.

The SDXL implementation is Apple's mlx-examples `stable_diffusion` package, vendored at
imagegen/stable_diffusion (MIT). Weights (~7GB) download from Hugging Face on first run.
"""

import io

import mlx.core as mx
import mlx.nn as nn
import numpy as np
from PIL import Image

from stable_diffusion import StableDiffusionXL

STEPS = 2  # SDXL-Turbo is distilled for 1-4 steps with no CFG
STYLE_SUFFIX = {
    "Any": "",
    "Photo": ", photograph, realistic, detailed",
    "Cartoon": ", cartoon illustration, bold outlines, flat colors",
    "Pixel art": ", pixel art, 16-bit, retro game sprite",
    "Oil painting": ", oil painting, visible brush strokes, canvas texture",
    "Claymation": ", claymation, stop-motion clay figures, plasticine",
}

# Load once at import so the first turn doesn't pay for it. Quantizing (as mlx-examples does
# with -q) keeps SDXL within an 8GB machine's memory.
_sd = StableDiffusionXL("stabilityai/sdxl-turbo", float16=True)
nn.quantize(_sd.text_encoder_1, class_predicate=lambda _, m: isinstance(m, nn.Linear))
nn.quantize(_sd.text_encoder_2, class_predicate=lambda _, m: isinstance(m, nn.Linear))
nn.quantize(_sd.unet, group_size=32, bits=8)
_sd.ensure_models_are_loaded()


def generate(prompt: str, style: str) -> bytes:
    """Return 512x512 PNG bytes for `prompt` in the lobby's art style."""
    latents = _sd.generate_latents(
        prompt + STYLE_SUFFIX.get(style, ""), n_images=1, cfg_weight=0.0, num_steps=STEPS
    )
    for x_t in latents:
        mx.eval(x_t)
    image = _sd.decode(x_t)
    image = (image[0] * 255).astype(mx.uint8)

    buf = io.BytesIO()
    Image.fromarray(np.array(image)).save(buf, format="PNG")
    return buf.getvalue()
