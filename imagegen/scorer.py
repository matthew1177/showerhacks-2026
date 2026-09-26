"""DINOv2 ViT-B/14 image embeddings, used to score how close each guess's image stays to the
chain's reference image. The API calls embed() once per generated image; the game server
compares embeddings with a dot product (they are unit length, so that's cosine similarity).

Runs on CPU with PyTorch, so it never competes with the MLX image model for its thread or GPU
memory. Weights (~350MB) download from Hugging Face on first run.
"""

import io

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

MODEL = "facebook/dinov2-base"  # ViT-B/14

torch.set_grad_enabled(False)
_processor = AutoImageProcessor.from_pretrained(MODEL)
_model = AutoModel.from_pretrained(MODEL).eval()


def embed(png: bytes) -> list[float]:
    """Return the image's unit-length 768-d DINOv2 embedding (the CLS token)."""
    image = Image.open(io.BytesIO(png)).convert("RGB")
    inputs = _processor(images=image, return_tensors="pt")
    cls = _model(**inputs).pooler_output[0]
    return torch.nn.functional.normalize(cls, dim=0).tolist()
