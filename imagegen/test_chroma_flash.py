import unittest
from types import SimpleNamespace
from unittest.mock import patch

import torch

from chroma_flash import fuse_flash_adapter


class FlashAdapterTest(unittest.TestCase):
    def test_fused_projections_preserve_the_full_linear_result_and_bias(self):
        # Exercise Q/K/V splitting, the wider single-block MLP, and simple projections.
        cases = [
            ("double_blocks.0.img_attn.qkv", [
                ("transformer_blocks.0.attn.to_q", 2), ("transformer_blocks.0.attn.to_k", 2),
                ("transformer_blocks.0.attn.to_v", 2)]),
            ("double_blocks.0.txt_attn.qkv", [
                ("transformer_blocks.0.attn.add_q_proj", 2), ("transformer_blocks.0.attn.add_k_proj", 2),
                ("transformer_blocks.0.attn.add_v_proj", 2)]),
            ("single_blocks.0.linear1", [
                ("single_transformer_blocks.0.attn.to_q", 2), ("single_transformer_blocks.0.attn.to_k", 2),
                ("single_transformer_blocks.0.attn.to_v", 2), ("single_transformer_blocks.0.proj_mlp", 8)]),
            ("single_blocks.0.linear2", [("single_transformer_blocks.0.proj_out", 3)]),
            ("distilled_guidance_layer.layers.0.in_layer", [("distilled_guidance_layer.layers.0.linear_1", 3)]),
        ]
        for name, destinations in cases:
            with self.subTest(name=name):
                rows = sum(width for _, width in destinations)
                down = torch.arange(6, dtype=torch.float32).reshape(2, 3) / 10
                up = torch.arange(rows * 2, dtype=torch.float32).reshape(rows, 2) / 10
                bias = torch.arange(rows, dtype=torch.float32) / 10
                params = {}
                for dest, width in destinations:
                    params[dest + ".weight"] = torch.ones(width, 3)
                    params[dest + ".bias"] = torch.ones(width)
                prefix = "diffusion_model." + name
                state = {prefix + ".lora_down.weight": down,
                         prefix + ".lora_up.weight": up,
                         prefix + ".diff_b": bias}
                with patch("chroma_flash.hf_hub_download", return_value="adapter"), \
                     patch("chroma_flash.load_file", return_value=state):
                    fuse_flash_adapter(SimpleNamespace(get_parameter=params.__getitem__))
                x = torch.tensor([0.5, -0.25, 1.0])
                actual = torch.cat([params[dest + ".weight"] @ x + params[dest + ".bias"]
                                    for dest, _ in destinations])
                expected = (torch.ones(rows, 3) + up @ down) @ x + 1 + bias
                torch.testing.assert_close(actual, expected)

    def test_unrecognized_adapter_weights_are_rejected(self):
        with patch("chroma_flash.hf_hub_download", return_value="adapter"), \
             patch("chroma_flash.load_file", return_value={"unsupported.diff": torch.ones(1)}):
            with self.assertRaisesRegex(ValueError, "Unrecognized"):
                fuse_flash_adapter(None)


if __name__ == "__main__":
    unittest.main()
