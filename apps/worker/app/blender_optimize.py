"""Headless Blender GLB optimization invoked by mesh_pipeline.py."""

from __future__ import annotations

import sys
from pathlib import Path

import bpy


def arguments() -> tuple[Path, Path, int, int]:
    values = sys.argv[sys.argv.index("--") + 1:]
    if len(values) != 4:
        raise RuntimeError("Expected input, output, target faces and texture resolution")
    return Path(values[0]), Path(values[1]), int(values[2]), int(values[3])


def main() -> None:
    source, destination, target_faces, texture_resolution = arguments()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(source))
    mesh_objects = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    total_faces = sum(len(item.data.polygons) for item in mesh_objects)
    if total_faces > target_faces:
        ratio = max(min(target_faces / total_faces, 1.0), 0.05)
        for item in mesh_objects:
            bpy.context.view_layer.objects.active = item
            item.select_set(True)
            modifier = item.modifiers.new(name="B Socio geometry reduction", type="DECIMATE")
            modifier.ratio = ratio
            modifier.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=modifier.name)
            item.select_set(False)
    for image in bpy.data.images:
        if image.size[0] > texture_resolution or image.size[1] > texture_resolution:
            scale = min(texture_resolution / image.size[0], texture_resolution / image.size[1])
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format="GLB", export_apply=True, export_image_format="WEBP")
    if not destination.exists() or destination.stat().st_size < 100:
        raise RuntimeError("Blender did not create a valid GLB")


if __name__ == "__main__":
    main()
