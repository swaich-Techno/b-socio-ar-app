from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from .exceptions import CustomerInputError, WorkerConfigurationError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}


def validate_image(path: Path, max_size_mb: int) -> tuple[int, int]:
    size = path.stat().st_size
    if size <= 0:
        raise CustomerInputError("The source image is empty.")
    if size > max_size_mb * 1024 * 1024:
        raise CustomerInputError(f"The source image exceeds {max_size_mb} MB.")
    try:
        with Image.open(path) as probe:
            if probe.format not in ALLOWED_FORMATS:
                raise CustomerInputError("Use a valid JPG, PNG or WebP source image.")
            probe.verify()
        with Image.open(path) as image:
            width, height = image.size
            if width < 256 or height < 256:
                raise CustomerInputError("The source image must be at least 256×256 pixels.")
            if width * height > 80_000_000:
                raise CustomerInputError("The source image dimensions are too large.")
            return width, height
    except (UnidentifiedImageError, OSError) as error:
        raise CustomerInputError("The source image is corrupted or unreadable.") from error


def process_background(source: Path, destination: Path) -> Path:
    try:
        from rembg import remove
    except ImportError as error:
        raise WorkerConfigurationError("rembg is required for background processing") from error
    with Image.open(source) as image:
        corrected = ImageOps.exif_transpose(image).convert("RGBA")
        result = remove(corrected)
        if not isinstance(result, Image.Image):
            raise RuntimeError("Background processor returned an unexpected result")
        bbox = result.getbbox()
        if bbox is None:
            raise CustomerInputError("No foreground product could be detected in the source image.")
        cropped = result.crop(bbox)
        destination.parent.mkdir(parents=True, exist_ok=True)
        cropped.save(destination, "PNG", optimize=True)
    return destination


def generate_mask(processed: Path, destination: Path) -> Path:
    with Image.open(processed) as image:
        alpha = image.convert("RGBA").getchannel("A")
        destination.parent.mkdir(parents=True, exist_ok=True)
        alpha.save(destination, "PNG", optimize=True)
    return destination


def generate_thumbnail(source: Path, destination: Path, size: int = 768) -> Path:
    with Image.open(source) as image:
        foreground = ImageOps.exif_transpose(image).convert("RGBA")
        foreground.thumbnail((int(size * 0.82), int(size * 0.82)), Image.Resampling.LANCZOS)
        background = Image.new("RGBA", (size, size), (241, 245, 249, 255))
        x = (size - foreground.width) // 2
        y = (size - foreground.height) // 2
        background.alpha_composite(foreground, (x, y))
        destination.parent.mkdir(parents=True, exist_ok=True)
        background.convert("RGB").save(destination, "WEBP", quality=84, method=6)
    return destination
