import asyncio
import os
import threading
import unittest
from unittest.mock import patch
from pydantic import ValidationError

with patch.dict(os.environ, {"IMAGE_API_SECRET": "image-api-test-secret"}):
    import app as image_api


class ModelThreadTest(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_requests_use_the_model_loading_thread(self):
        calls = []
        event_loop_thread = threading.get_ident()

        def load_generator():
            model_thread = threading.get_ident()
            self.assertNotEqual(model_thread, event_loop_thread)

            def generate(prompt, style, creativity, model):
                self.assertEqual(threading.get_ident(), model_thread)
                calls.append((prompt, style, creativity, model))
                return prompt.encode()

            def prepare(model):
                self.assertEqual(threading.get_ident(), model_thread)
                calls.append(("prepare", model))

            return generate, prepare

        with patch.object(image_api, "load_generator", load_generator), patch.object(image_api, "load_scorer", lambda: None):
            async with image_api.lifespan(image_api.app):
                prepared = await image_api.prepare_image_model(image_api.ModelRequest(model="sdxl-turbo"))
                self.assertEqual(prepared, {"ready": True, "model": "sdxl-turbo"})
                responses = await asyncio.gather(*(
                    image_api.generate_image(image_api.GenerateRequest(prompt=prompt, style="Cartoon", creativity=80, model=model))
                    for prompt, model in (("duck", "sdxl-turbo"), ("panda", "chroma-flash"))
                ))

        self.assertEqual([response.body for response in responses], [b"duck", b"panda"])
        self.assertEqual(calls, [("prepare", "sdxl-turbo"), ("duck", "Cartoon", 80, "sdxl-turbo"), ("panda", "Cartoon", 80, "chroma-flash")])

    def test_unknown_models_are_rejected_before_reaching_the_worker(self):
        for request in (image_api.ModelRequest, image_api.GenerateRequest):
            with self.assertRaises(ValidationError):
                request(prompt="duck", model="arbitrary/repository")
        self.assertIsNone(image_api.GenerateRequest(prompt="duck").model)


if __name__ == "__main__":
    unittest.main()
