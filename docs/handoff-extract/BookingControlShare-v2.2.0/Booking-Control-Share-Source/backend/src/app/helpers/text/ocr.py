import base64
import io
import re
from pathlib import Path

import ddddocr
from PIL import Image, ImageOps

_DATA_URI_RE = re.compile(r"^data:image/[a-zA-Z0-9.+-]+;base64,(?P<data>.+)$", re.DOTALL)

# Initialize the ONNX model once globally to avoid loading it per task
ocr = ddddocr.DdddOcr(show_ad=False)


def load_image_bytes(source) -> bytes:
    """Extract raw bytes from base64, bytes, or file path."""
    if isinstance(source, str) and source.startswith("data:image/"):
        match = _DATA_URI_RE.match(source.strip())
        if not match:
            raise ValueError("Unsupported data URI.")
        return base64.b64decode(match.group("data"))
    if isinstance(source, (bytes, bytearray)):
        return source
    return Path(source).read_bytes()


def preprocess_image(img_bytes: bytes) -> bytes:
    """Add a white background to transparent PNGs and apply 10px white padding."""
    with Image.open(io.BytesIO(img_bytes)) as img:
        # 1. Flatten transparency: put transparent images on a solid white background
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
            canvas = Image.new("RGBA", img.size, (255, 255, 255, 255))
            img = Image.alpha_composite(canvas, img)

        # Convert to standard RGB to drop the alpha channel safely
        img = img.convert("RGB")

        # 2. Add 10px white padding around the image
        img = ImageOps.expand(img, border=10, fill="white")

        # 3. Save the modified image back to a bytes buffer
        output = io.BytesIO()
        img.save(output, format="PNG")
        return output.getvalue()


def ocr_image(source) -> str:
    """Run neural-net CAPTCHA OCR with preprocessing."""
    raw_bytes = load_image_bytes(source)

    # Apply the background fix and padding
    processed_bytes = preprocess_image(raw_bytes)

    # ddddocr returns the exact string, handling noise and kerning automatically
    raw_text = ocr.classification(processed_bytes)

    return re.sub(r"[^a-zA-Z0-9]", "", raw_text)
