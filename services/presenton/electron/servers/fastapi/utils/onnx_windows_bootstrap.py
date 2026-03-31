"""
Set ORT_DYLIB_PATH on Windows so fastembed_vectorstore (Rust/ONNX) loads the correct
onnxruntime.dll from our venv instead of a stale one from System32.
Import this module before any fastembed_vectorstore import.
No-op on macOS / Linux.
"""
import os

if os.name == "nt" and "ORT_DYLIB_PATH" not in os.environ:
    import importlib.util

    try:
        spec = importlib.util.find_spec("onnxruntime")
        if spec and spec.origin:
            ort_dir = os.path.dirname(spec.origin)
            for sub in ("", "capi", os.path.join("capi", "Release")):
                dll = os.path.join(ort_dir, sub, "onnxruntime.dll")
                if os.path.exists(dll):
                    os.environ["ORT_DYLIB_PATH"] = os.path.abspath(dll)
                    break
    except Exception:
        pass
