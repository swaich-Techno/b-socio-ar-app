from __future__ import annotations

import sys
import gc
from pathlib import Path
from typing import Any

from PIL import Image

from .exceptions import WorkerConfigurationError
from .settings import Settings


def resolve_device(requested: str) -> str:
    try:
        import torch
    except ImportError as error:
        raise WorkerConfigurationError("PyTorch is not installed") from error
    if requested == "cuda":
        if not torch.cuda.is_available():
            raise WorkerConfigurationError("THREE_D_DEVICE=cuda but CUDA is unavailable")
        return "cuda"
    if requested == "cpu":
        return "cpu"
    return "cuda" if torch.cuda.is_available() else "cpu"


class TripoSRAdapter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.device = resolve_device(settings.device)
        self._model: Any | None = None

    def load(self) -> Any:
        if self._model is not None:
            return self._model
        if self.settings.triposr_repository_path:
            repository = self.settings.triposr_repository_path.expanduser().resolve()
            if not (repository / "tsr").is_dir():
                raise WorkerConfigurationError(f"TRIPOSR_REPOSITORY_PATH does not contain the official tsr package: {repository}")
            sys.path.insert(0, str(repository))
        try:
            import torch
            from tsr.system import TSR
        except ImportError as error:
            raise WorkerConfigurationError("Official open-source TripoSR is not importable. Configure TRIPOSR_REPOSITORY_PATH.") from error
        model = TSR.from_pretrained(self.settings.triposr_model_id, config_name="config.yaml", weight_name="model.ckpt")
        model.renderer.set_chunk_size(self.settings.triposr_chunk_size)
        model.to(self.device)
        model.eval()
        if self.device == "cuda":
            torch.cuda.empty_cache()
        self._model = model
        return model

    def generate_mesh(self, image_path: Path, output_path: Path) -> Path:
        try:
            import torch
        except ImportError as error:
            raise WorkerConfigurationError("PyTorch is not installed") from error
        try:
            meshes = self._generate(image_path, torch)
        except RuntimeError as error:
            cuda_failure = any(marker in str(error).lower() for marker in ("cuda", "cublas", "cudnn", "out of memory"))
            if self.settings.device != "auto" or self.device != "cuda" or not cuda_failure:
                raise
            self._model = None
            gc.collect()
            torch.cuda.empty_cache()
            self.device = "cpu"
            meshes = self._generate(image_path, torch)
        if not meshes:
            raise RuntimeError("TripoSR returned no mesh")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        meshes[0].export(str(output_path), include_normals=True)
        if not output_path.exists() or output_path.stat().st_size == 0:
            raise RuntimeError("TripoSR did not create a mesh file")
        return output_path

    def _generate(self, image_path: Path, torch: Any) -> Any:
        model = self.load()
        with Image.open(image_path) as image:
            rgb = image.convert("RGB")
            with torch.no_grad():
                scene_codes = model([rgb], device=self.device)
                return model.extract_mesh(scene_codes, has_vertex_color=self.settings.bake_texture, resolution=256)
