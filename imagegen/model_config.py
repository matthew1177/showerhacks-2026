"""Model choices shared with the lobby; importing this does not load GPU libraries."""

import json
import os
from pathlib import Path

_catalog = Path(__file__).resolve().parents[1] / "shared" / "image-models.json"
MODELS = {model["id"]: model for model in json.loads(_catalog.read_text())}
# Retain the original HD service configuration for scripts using IMAGE_FLASH=0.
# Game hosts choose only the two fast models in the shared catalog.
MODELS["chroma-hd"] = {**MODELS["chroma-flash"], "id": "chroma-hd", "label": "Chroma HD",
                       "description": "Original Chroma HD", "flash": False, "size": 512, "steps": 20}
DEFAULT_MODEL = os.environ.get(
    "IMAGE_MODEL", "chroma-flash" if os.environ.get("IMAGE_FLASH", "1") == "1" else "chroma-hd"
)
if DEFAULT_MODEL not in MODELS:
    raise ValueError(f"Unknown IMAGE_MODEL: {DEFAULT_MODEL}")

# Legacy size/step overrides apply only to the service's default model. Other
# choices retain their own settings, so selecting HD never inherits Flash's six steps.
for _name, _model in MODELS.items():
    _prefix = "IMAGE_" + _name.upper().replace("CHROMA-", "").replace("SDXL-", "").replace("-", "_")
    for _field in ("size", "steps"):
        _fallback = os.environ.get("IMAGE_" + _field.upper()) if _name == DEFAULT_MODEL else None
        _model[_field] = int(os.environ.get(_prefix + "_" + _field.upper(), _fallback or _model[_field]))
    if _model["steps"] < 1 or _model["size"] < 256 or _model["size"] % 16:
        raise ValueError(f"{_name}: steps must be positive; size must be at least 256 and divisible by 16.")


def model_config(model=None):
    name = DEFAULT_MODEL if model is None else model
    if name not in MODELS:
        raise ValueError(f"Unknown image model: {name}")
    return MODELS[name]
