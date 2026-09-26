import asyncio
import os
import threading
import unittest
from unittest.mock import patch

with patch.dict(os.environ, {"IMAGE_API_SECRET": "image-api-test-secret"}):
    import app as image_api


class ModelThreadTest(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_requests_use_the_model_loading_thread(self):
        calls = []
        event_loop_thread = threading.get_ident()

        def load_generator():
            model_thread = threading.get_ident()
            self.assertNotEqual(model_thread, event_loop_thread)

            def generate(prompt, style, creativity):
                self.assertEqual(threading.get_ident(), model_thread)
                calls.append((prompt, style, creativity))
                return prompt.encode()

            return generate

        with patch.object(image_api, "load_generator", load_generator):
            async with image_api.lifespan(image_api.app):
                responses = await asyncio.gather(*(
                    image_api.generate_image(image_api.GenerateRequest(prompt=prompt, style="Cartoon", creativity=80))
                    for prompt in ("duck", "panda")
                ))

        self.assertEqual([response.body for response in responses], [b"duck", b"panda"])
        self.assertEqual(calls, [("duck", "Cartoon", 80), ("panda", "Cartoon", 80)])


if __name__ == "__main__":
    unittest.main()
