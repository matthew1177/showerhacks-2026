import os
from pathlib import Path
import runpy
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import torch
from optimum.quanto import qint8

from chroma_quantization import ChromaInt8Linear, quantize_chroma


class ChromaQuantizationTest(unittest.TestCase):
    def test_int8_storage_preserves_outputs_on_cpu_and_mps(self):
        devices = ["cpu"] + (["mps"] if torch.backends.mps.is_available() else [])
        for device in devices:
            with self.subTest(device=device), torch.inference_mode():
                torch.manual_seed(42)
                pipeline = SimpleNamespace(**{
                    name: torch.nn.Sequential(torch.nn.Linear(128, 128)).half().eval()
                    for name in ("transformer", "text_encoder", "vae")
                })
                inputs = torch.randn(4, 128, dtype=torch.float16)
                references = {name: getattr(pipeline, name)(inputs) for name in ("transformer", "text_encoder")}
                vae_weight = pipeline.vae[0].weight.clone()
                quantize_chroma(pipeline)
                for name, reference in references.items():
                    component = getattr(pipeline, name).to(device)
                    self.assertTrue(component[0].frozen)
                    state = component.state_dict()
                    self.assertEqual(state["0.weight._data"].dtype, torch.int8)
                    self.assertLess(sum(t.numel() * t.element_size() for t in state.values()), 128 * 128 * 2 * 0.6)
                    actual = component(inputs.to(device)).cpu()
                    self.assertEqual(actual.dtype, torch.float16)
                    self.assertTrue(torch.isfinite(actual).all())
                    relative_error = (actual - reference).float().norm() / reference.float().norm()
                    self.assertLess(relative_error.item(), 0.01)
                torch.testing.assert_close(pipeline.vae[0].weight, vae_weight, rtol=0, atol=0)

    @unittest.skipUnless(torch.backends.mps.is_available(), "requires Apple GPU")
    def test_native_matrix_kernel_handles_batched_noncontiguous_inputs_without_bias(self):
        with torch.inference_mode():
            torch.manual_seed(17)
            linear = torch.nn.Linear(128, 128, bias=False).half()
            inputs = torch.randn(16, 2, 128, dtype=torch.float16).transpose(0, 1)
            reference = linear(inputs)
            quantized = ChromaInt8Linear.from_module(linear, weights=qint8)
            quantized.freeze()
            quantized.to("mps")
            with patch.object(torch, "_weight_int8pack_mm", wraps=torch._weight_int8pack_mm) as kernel:
                actual = quantized(inputs.to("mps")).cpu()
                kernel.assert_called_once()
            self.assertEqual(actual.shape, reference.shape)
            self.assertLess(((actual - reference).float().norm() / reference.float().norm()).item(), 0.01)

    @unittest.skipUnless(torch.backends.mps.is_available(), "requires Apple GPU")
    def test_unaligned_layers_use_quantized_fallback(self):
        with torch.inference_mode():
            linear = torch.nn.Linear(63, 17).half()
            inputs = torch.randn(2, 63, dtype=torch.float16)
            reference = linear(inputs)
            quantized = ChromaInt8Linear.from_module(linear, weights=qint8)
            quantized.freeze()
            quantized.to("mps")
            with patch.object(torch, "_weight_int8pack_mm", side_effect=AssertionError("unaligned kernel")):
                actual = quantized(inputs.to("mps")).cpu()
            self.assertEqual(quantized.state_dict()["weight._data"].dtype, torch.int8)
            self.assertLess(((actual - reference).float().norm() / reference.float().norm()).item(), 0.01)

    def test_quantization_config_applies_only_to_chroma(self):
        for mode in ("int8", "none"):
            with self.subTest(mode=mode), patch.dict(os.environ, {"IMAGE_CHROMA_QUANTIZATION": mode}):
                config = runpy.run_path(str(Path(__file__).with_name("model_config.py")))
                self.assertEqual(config["MODELS"]["chroma-flash"]["quantization"], mode)
                self.assertEqual(config["MODELS"]["chroma-hd"]["quantization"], mode)
                self.assertEqual(config["MODELS"]["sdxl-turbo"]["quantization"], "none")

    def test_invalid_quantization_fails_instead_of_silently_using_float_weights(self):
        with patch.dict(os.environ, {"IMAGE_CHROMA_QUANTIZATION": "int4"}):
            with self.assertRaisesRegex(ValueError, "IMAGE_CHROMA_QUANTIZATION"):
                runpy.run_path(str(Path(__file__).with_name("model_config.py")))


if __name__ == "__main__":
    unittest.main()
