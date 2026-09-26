"""Fuse the pinned Chroma Flash adapter into Chroma1-HD once at startup.

This adapter approximates the official Flash checkpoint without another 18 GB download:
https://huggingface.co/darian23/Chroma1-Flash-LoRA
It uses original Chroma names, fused projections, and bias deltas. Diffusers' generic
LoRA loader does not handle all of these, so apply every delta explicitly and fail
on unknown keys or incompatible shapes. Fusing adds no per-image adapter overhead.
"""

import torch
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file

ADAPTER_ID = "darian23/Chroma1-Flash-LoRA"
ADAPTER_REVISION = "b2cc63c989274c012db29b34c34710fa2c0302a1"
ADAPTER_FILE = "Chroma1-Flash_LoRA_rank64.safetensors"


def _targets(name, rows):
    """Map the author's original Chroma projections to Diffusers parameters."""
    if name.startswith("double_blocks."):
        _, index, part = name.split(".", 2)
        prefix = f"transformer_blocks.{index}."
        if part in ("img_attn.qkv", "txt_attn.qkv"):
            projections = ("to_q", "to_k", "to_v") if part.startswith("img") else (
                "add_q_proj", "add_k_proj", "add_v_proj"
            )
            width = rows // 3
            return [(prefix + "attn." + part, slice(i * width, (i + 1) * width))
                    for i, part in enumerate(projections)]
        part = {
            "img_attn.proj": "attn.to_out.0", "txt_attn.proj": "attn.to_add_out",
            "img_mlp.0": "ff.net.0.proj", "img_mlp.2": "ff.net.2",
            "txt_mlp.0": "ff_context.net.0.proj", "txt_mlp.2": "ff_context.net.2",
        }[part]
        return [(prefix + part, slice(None))]
    if name.startswith("single_blocks."):
        _, index, part = name.split(".", 2)
        prefix = f"single_transformer_blocks.{index}."
        if part == "linear1":
            width = rows // 7  # Q, K, V, and a four-times-wider feed-forward projection.
            return [(prefix + part, slice(start * width, end * width)) for part, start, end in (
                ("attn.to_q", 0, 1), ("attn.to_k", 1, 2), ("attn.to_v", 2, 3), ("proj_mlp", 3, 7)
            )]
        return [(prefix + {"linear2": "proj_out"}[part], slice(None))]
    name = {"img_in": "x_embedder", "txt_in": "context_embedder", "final_layer.linear": "proj_out"}.get(name, name)
    return [(name.replace(".in_layer", ".linear_1").replace(".out_layer", ".linear_2"), slice(None))]


@torch.inference_mode()
def fuse_flash_adapter(transformer):
    path = hf_hub_download(ADAPTER_ID, ADAPTER_FILE, revision=ADAPTER_REVISION)
    state = load_file(path)
    for key in list(state):
        if not key.endswith(".lora_down.weight"):
            continue
        name = key.removesuffix(".lora_down.weight")
        down = state.pop(key).float()
        up = state.pop(name + ".lora_up.weight").float()
        bias = state.pop(name + ".diff_b").float()
        for target, section in _targets(name.removeprefix("diffusion_model."), up.shape[0]):
            weight = transformer.get_parameter(target + ".weight")
            target_bias = transformer.get_parameter(target + ".bias")
            delta = up[section] @ down
            if delta.shape != weight.shape or bias[section].shape != target_bias.shape:
                raise ValueError(f"Chroma Flash adapter shape mismatch: {target}")
            weight.copy_(weight.float() + delta)
            target_bias.copy_(target_bias.float() + bias[section])
    if state:
        raise ValueError(f"Unrecognized Chroma Flash adapter weights: {list(state)[:5]}")
