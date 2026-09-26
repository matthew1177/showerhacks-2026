"""Store Chroma's linear weights as INT8, with floating-point activations.

Quanto supports the existing PyTorch MPS pipeline. Fuse the Flash adapter before
calling this; freezing then discards the floating-point copies of the weights.
Keep the VAE and embeddings at their original precision.
"""

import logging

import torch
from optimum.quanto import QLinear, qint8

logger = logging.getLogger("uvicorn.error")


class ChromaInt8Linear(QLinear):
    def forward(self, inputs):
        # Quanto 0.2.7 does not select the native FP16/INT8 Metal kernel. Avoid
        # expanding every weight matrix to FP16 on every sampling step. PyTorch's
        # packed kernel requires contiguous matrices with widths divisible by 32.
        if inputs.device.type == "mps" and self.in_features % 32 == 0 and self.out_features % 32 == 0:
            weight = self.qweight
            output = torch._weight_int8pack_mm(
                inputs.reshape(-1, self.in_features).contiguous(),
                weight._data,
                weight._scale.flatten().to(inputs.dtype),
            ).reshape(*inputs.shape[:-1], self.out_features)
            return output if self.bias is None else output + self.bias
        return super().forward(inputs)


@torch.inference_mode()
def quantize_chroma(pipeline):
    for name in ("transformer", "text_encoder"):
        logger.info("Quantizing Chroma %s weights to INT8", name)
        component = getattr(pipeline, name)
        for path, module in component.named_modules():
            if isinstance(module, torch.nn.Linear) and not isinstance(module, QLinear):
                quantized = ChromaInt8Linear.from_module(module, weights=qint8)
                quantized.freeze()
                quantized.train(module.training)
                component.set_submodule(path, quantized)
