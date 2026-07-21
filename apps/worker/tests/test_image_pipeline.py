from pathlib import Path

import pytest
from PIL import Image

from app.exceptions import CustomerInputError
from app.image_pipeline import generate_mask, generate_thumbnail, validate_image


def test_validates_and_thumbnails_image(tmp_path: Path) -> None:
    source = tmp_path / "product.png"
    Image.new("RGB", (512, 400), "royalblue").save(source)
    assert validate_image(source, 15) == (512, 400)
    thumbnail = generate_thumbnail(source, tmp_path / "thumb.webp")
    assert thumbnail.exists() and thumbnail.stat().st_size > 0


def test_rejects_corrupt_image(tmp_path: Path) -> None:
    source = tmp_path / "broken.png"
    source.write_bytes(b"not an image")
    with pytest.raises(CustomerInputError):
        validate_image(source, 15)


def test_generates_alpha_mask_from_processed_image(tmp_path: Path) -> None:
    processed = tmp_path / "processed.png"
    image = Image.new("RGBA", (300, 300), (0, 0, 255, 0))
    image.putpixel((150, 150), (0, 0, 255, 255))
    image.save(processed)
    mask = generate_mask(processed, tmp_path / "mask.png")
    with Image.open(mask) as result:
        assert result.mode == "L" and result.getpixel((150, 150)) == 255 and result.getpixel((0, 0)) == 0
