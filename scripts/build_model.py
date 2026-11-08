"""Export the pinned public U-Net weights for ONNX Runtime Web."""

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from urllib.request import urlopen

import numpy as np
import onnx
import onnxruntime as ort
import torch

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REVISION = "55b4933b417822f8dda632cca19e391406d0bc7e"
SOURCE_URL = "https://huggingface.co/samir-mohamed/concrete-crack-segmentation"
WEIGHTS_HASH = "a709ea035bae805ee837341a4a6ca5045342995cf6b23451186ff582449a5454"
INFERENCE_HASH = "135019ffb9f457bae427f8675056a3b40fea2be6ea50e8e50844c2c4dee5debb"


def download(url, destination, expected_hash=None):
    with urlopen(url, timeout=180) as response:
        data = response.read()
    digest = hashlib.sha256(data).hexdigest()
    if expected_hash and digest != expected_hash:
        raise ValueError(f"Source hash mismatch for {destination.name}")
    destination.write_bytes(data)
    return digest


def main():
    torch.set_num_threads(2)
    output = ROOT / "models"
    vendor = ROOT / "static" / "vendor"
    output.mkdir(exist_ok=True)
    vendor.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as temporary:
        temporary = Path(temporary)
        source = temporary / "inference.py"
        weights = temporary / "weights.pth"
        download(f"{SOURCE_URL}/resolve/{SOURCE_REVISION}/inference.py", source, INFERENCE_HASH)
        local_weights = os.environ.get("CRACK_WEIGHTS_PATH")
        if local_weights:
            weights.write_bytes(Path(local_weights).read_bytes())
            if hashlib.sha256(weights.read_bytes()).hexdigest() != WEIGHTS_HASH:
                raise ValueError("Local weights hash mismatch")
        else:
            download(f"{SOURCE_URL}/resolve/{SOURCE_REVISION}/unet_model_weights.pth", weights, WEIGHTS_HASH)
        spec = importlib.util.spec_from_file_location("crack_source", source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.ImprovedUNet()
        model.load_state_dict(torch.load(weights, map_location="cpu", weights_only=True))
        model.eval()
        generator = torch.Generator().manual_seed(11)
        example = torch.rand((1, 3, 256, 256), generator=generator)
        exported = temporary / "concrete-unet.onnx"
        torch.onnx.export(model, example, exported, input_names=["image"],
                          output_names=["output"], opset_version=17, dynamo=False)
        onnx.checker.check_model(str(exported))
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        session = ort.InferenceSession(str(exported), sess_options=options,
                                       providers=["CPUExecutionProvider"])
        with torch.inference_mode():
            expected = model(example).numpy()
        actual = session.run(None, {"image": example.numpy()})[0]
        maximum_error = float(np.max(np.abs(actual - expected)))
        if maximum_error > 0.0001:
            raise ValueError(f"Export output mismatch: {maximum_error}")
        data = exported.read_bytes()
        chunk_size = 32 * 1024 * 1024
        chunks = []
        for index, start in enumerate(range(0, len(data), chunk_size)):
            content = data[start:start + chunk_size]
            name = f"concrete-unet.part{index:02d}.bin"
            (output / name).write_bytes(content)
            chunks.append({"file": name, "bytes": len(content),
                           "sha256": hashlib.sha256(content).hexdigest()})
        manifest = {
            "id": "samir-mohamed/concrete-crack-segmentation",
            "revision": SOURCE_REVISION,
            "source_url": SOURCE_URL,
            "weights_sha256": WEIGHTS_HASH,
            "license": "MIT",
            "format": "ONNX float32 opset 17",
            "input": {"name": "image", "shape": [1, 3, 256, 256],
                      "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]},
            "output": {"name": "output", "crack_score": "1 - output",
                       "note": "Source weights produce high background values in the inspected crack images."},
            "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "export_maximum_error": maximum_error,
            "chunks": chunks,
        }
        (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        print(json.dumps({"model_bytes": len(data), "maximum_error": maximum_error}), flush=True)
    for filename in ["ort.wasm.min.js", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]:
        download(f"https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/{filename}", vendor / filename)


if __name__ == "__main__":
    main()
