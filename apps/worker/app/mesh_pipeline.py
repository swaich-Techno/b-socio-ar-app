from __future__ import annotations

import math
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
import trimesh

from .exceptions import ModelValidationError


def _as_mesh(value: trimesh.Trimesh | trimesh.Scene) -> trimesh.Trimesh:
    if isinstance(value, trimesh.Scene):
        geometries = [geometry for geometry in value.geometry.values() if isinstance(geometry, trimesh.Trimesh)]
        if not geometries:
            raise ModelValidationError("Generated scene contains no mesh geometry")
        return trimesh.util.concatenate(geometries)
    return value


def optimise_to_glb(source: Path, destination: Path, target_size_mb: int, blender_executable: Path | None = None, texture_resolution: int = 1024) -> dict[str, Any]:
    loaded = trimesh.load(source, force="mesh", process=True)
    mesh = _as_mesh(loaded)
    if len(mesh.vertices) < 3 or len(mesh.faces) < 1:
        raise ModelValidationError("Generated mesh has no usable faces")
    mesh.remove_unreferenced_vertices()
    mesh.update_faces(mesh.nondegenerate_faces())
    mesh.fix_normals()
    centre = mesh.bounding_box.centroid
    mesh.apply_translation(-centre)
    maximum_extent = float(np.max(mesh.extents))
    if not math.isfinite(maximum_extent) or maximum_extent <= 0:
        raise ModelValidationError("Generated mesh has invalid physical extents")
    mesh.apply_scale(1.0 / maximum_extent)
    destination.parent.mkdir(parents=True, exist_ok=True)
    normalized = destination.with_name("normalized.glb")
    mesh.export(normalized, file_type="glb")
    warnings: list[str] = []
    if blender_executable and blender_executable.expanduser().exists():
        command = [str(blender_executable.expanduser().resolve()), "--background", "--factory-startup", "--python", str(Path(__file__).with_name("blender_optimize.py")), "--", str(normalized), str(destination), "120000", str(texture_resolution)]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=900)
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
            warnings.append(f"Blender optimisation failed and the normalized GLB was retained: {type(error).__name__}")
            normalized.replace(destination)
        else:
            normalized.unlink(missing_ok=True)
    else:
        warnings.append("Blender optimisation is unavailable; geometry and texture compression need manual review")
        normalized.replace(destination)
    size = destination.stat().st_size
    if size > target_size_mb * 1024 * 1024:
        warnings.append(f"GLB exceeds the {target_size_mb} MB demo target and needs manual optimisation")
    validate_glb(destination)
    return {"vertices": len(mesh.vertices), "polygons": len(mesh.faces), "size": size, "warnings": warnings, "scale": 1.0 / maximum_extent}


def validate_glb(path: Path) -> None:
    if path.suffix.lower() != ".glb" or path.stat().st_size < 100:
        raise ModelValidationError("GLB output is missing or empty")
    loaded = trimesh.load(path, force="scene", process=False)
    mesh = _as_mesh(loaded)
    if len(mesh.vertices) < 3 or len(mesh.faces) < 1:
        raise ModelValidationError("GLB validation found no usable mesh")
    if not np.isfinite(mesh.vertices).all():
        raise ModelValidationError("GLB contains non-finite vertex positions")
