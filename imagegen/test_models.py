import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import model
from model_config import model_config


class ModelSelectionTest(unittest.TestCase):
    def tearDown(self):
        model._pipeline = None
        model._active_model = None

    def test_switching_reuses_current_pipeline_and_fuses_only_chroma(self):
        flash, turbo, reloaded_flash = MagicMock(), MagicMock(), MagicMock()
        events = []
        with (
            patch.dict(model_config("chroma-flash"), {"quantization": "int8"}),
            patch.object(model.torch.backends.mps, "is_available", return_value=False),
            patch.object(model.torch.cuda, "is_available", return_value=False),
            patch.object(model.ChromaPipeline, "from_pretrained", side_effect=[flash, reloaded_flash]) as chroma_load,
            patch.object(model.StableDiffusionXLPipeline, "from_pretrained", return_value=turbo) as turbo_load,
            patch("chroma_flash.fuse_flash_adapter", side_effect=lambda _: events.append("fuse")) as fuse,
            patch("chroma_quantization.quantize_chroma", side_effect=lambda _: events.append("quantize")) as quantize,
            patch.object(model, "_render") as render,
        ):
            self.assertIs(model.load_model("chroma-flash"), flash)
            self.assertIs(model.load_model("chroma-flash"), flash)
            self.assertIs(model.load_model("sdxl-turbo"), turbo)
            self.assertIs(model.load_model("sdxl-turbo"), turbo)
            self.assertIs(model.load_model("chroma-flash"), reloaded_flash)
            self.assertEqual(chroma_load.call_count, 2)
            self.assertEqual(turbo_load.call_count, 1)
            self.assertEqual([call.args[0] for call in fuse.call_args_list], [flash.transformer, reloaded_flash.transformer])
            self.assertEqual([call.args[0] for call in quantize.call_args_list], [flash, reloaded_flash])
            self.assertEqual(events, ["fuse", "quantize", "fuse", "quantize"])
            self.assertEqual(render.call_count, 3)
            self.assertEqual(model.active_model(), "chroma-flash")

    def test_original_precision_can_be_selected_for_chroma(self):
        with (
            patch.dict(model_config("chroma-hd"), {"quantization": "none"}),
            patch.object(model.torch.backends.mps, "is_available", return_value=False),
            patch.object(model.torch.cuda, "is_available", return_value=False),
            patch.object(model.ChromaPipeline, "from_pretrained"),
            patch("chroma_quantization.quantize_chroma") as quantize,
            patch.object(model, "_render"),
        ):
            model.load_model("chroma-hd")
            quantize.assert_not_called()

    def test_failed_switch_does_not_return_the_previous_models_images(self):
        model._pipeline, model._active_model = MagicMock(), "chroma-flash"
        with (
            patch.object(model.torch.backends.mps, "is_available", return_value=False),
            patch.object(model.torch.cuda, "is_available", return_value=False),
            patch.object(model.StableDiffusionXLPipeline, "from_pretrained", side_effect=RuntimeError("load failed")),
        ):
            with self.assertRaisesRegex(RuntimeError, "load failed"):
                model.load_model("sdxl-turbo")
        self.assertIsNone(model._pipeline)
        self.assertIsNone(model.active_model())

    def test_turbo_and_chroma_use_their_own_sampling_parameters(self):
        pipeline = MagicMock()
        pipeline.device = SimpleNamespace(type="cpu")
        pipeline.tokenizer.return_value = SimpleNamespace(input_ids=list(range(90)))
        for name, size, steps, guidance in [("sdxl-turbo", 512, 1, 0.0), ("chroma-flash", 384, 6, 1.0)]:
            model._render(pipeline, "a duck", model_config(name), seed=0)
            options = pipeline.call_args.kwargs
            self.assertEqual((options["width"], options["height"], options["num_inference_steps"], options["guidance_scale"]),
                             (size, size, steps, guidance))
            if name == "sdxl-turbo":
                self.assertNotIn("max_sequence_length", options)
                self.assertNotIn("negative_prompt", options)
            else:
                self.assertEqual(options["max_sequence_length"], 128)
                self.assertIsNone(options["negative_prompt"])


if __name__ == "__main__":
    unittest.main()
