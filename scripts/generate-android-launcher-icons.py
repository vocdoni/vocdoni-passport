#!/usr/bin/env python3
"""
Generates Android and iOS launcher icons from assets/icon.png.

Android adaptive icons:
  - background: solid blue rectangle (ic_launcher_background.xml)
  - foreground: extracted white logo, sized to fit within the adaptive icon safe zone

The adaptive icon safe zone is the inner 72dp of the 108dp canvas (66.67%).
At the xxxhdpi base canvas of 432px that is 288px. The logo target is set well
within that limit so no part of the artwork is clipped by Android's mask.

iOS:
  - transparent corners are filled with the background blue
  - all required sizes (2x/3x) are generated and Contents.json is updated
"""

import json
from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
SRC_ICON = ROOT / "assets" / "logo_blue_solid.png"
RES_DIR = ROOT / "android" / "app" / "src" / "main" / "res"
IOS_ICON_DIR = (
    ROOT / "ios" / "VocdoniPassport" / "Images.xcassets" / "AppIcon.appiconset"
)

# Android adaptive foreground sizes (dp × density scale, base canvas 108dp)
FOREGROUND_SIZES = {
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

# Android legacy icon sizes (48dp × density scale)
LEGACY_SIZES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}

# iOS: (logical_size_dp, scale, output_filename)
IOS_ICON_SIZES = [
    (20, 2, "Icon-20@2x.png"),
    (20, 3, "Icon-20@3x.png"),
    (29, 2, "Icon-29@2x.png"),
    (29, 3, "Icon-29@3x.png"),
    (40, 2, "Icon-40@2x.png"),
    (40, 3, "Icon-40@3x.png"),
    (60, 2, "Icon-60@2x.png"),
    (60, 3, "Icon-60@3x.png"),
    (1024, 1, "Icon-1024.png"),
]

BACKGROUND_BLUE = (62, 110, 204)  # corner/edge color of logo_blue_solid.png


def fill_background(source: Image.Image, color: tuple) -> Image.Image:
    """Composite an RGBA image over a solid color to eliminate transparency."""
    bg = Image.new("RGBA", source.size, (*color, 255))
    bg.alpha_composite(source.convert("RGBA"))
    return bg.convert("RGB")


def is_foreground_pixel(r: int, g: int, b: int, a: int) -> bool:
    if a == 0:
        return False
    brightness = (r + g + b) / 3
    chroma = max(r, g, b) - min(r, g, b)
    return brightness >= 148 and chroma <= 84


def extract_foreground(source: Image.Image) -> Image.Image:
    """
    Extract the white logo from the source icon and place it on a transparent
    canvas sized for the xxxhdpi adaptive foreground (432×432px).

    Safe-zone math (all values in pixels at xxxhdpi):
      Canvas:            432px  (= 108dp × 4)
      Safe-zone margin:   72px  (= 18dp  × 4, Android spec)
      Max artwork width: 288px  (= 432 - 2×72)
      Target used:       252px  → margins of ~90px L/R, 82px bottom (with +8 offset)
    """
    img = source.convert("RGBA")
    pixels = img.load()
    width, height = img.size
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out_pixels = out.load()
    margin_x = int(width * 0.12)
    margin_y = int(height * 0.12)

    for y in range(height):
        for x in range(width):
            if x < margin_x or x >= width - margin_x or y < margin_y or y >= height - margin_y:
                continue
            r, g, b, a = pixels[x, y]
            if not is_foreground_pixel(r, g, b, a):
                continue
            out_pixels[x, y] = (r, g, b, a)

    bbox = out.getbbox()
    if not bbox:
        raise RuntimeError("failed to extract icon foreground — no bright pixels found")

    cropped = out.crop(bbox)

    # Logo must not exceed the safe zone.  At the 432px canvas:
    #   safe margin = 72px  →  max artwork = 288px (inner visible circle)
    # Using 190px fills ~66% of the visible circle — a balanced proportion
    # that avoids the "zoomed" look while keeping the logo clearly legible.
    canvas_size = 432
    target_size = 190

    scale = min(target_size / cropped.width, target_size / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.LANCZOS,
    )

    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    left = (canvas_size - resized.width) // 2
    top = (canvas_size - resized.height) // 2 + 8  # slight downward shift for optical balance
    canvas.alpha_composite(resized, (left, top))
    return canvas


def write_legacy_icons(source: Image.Image) -> None:
    # Fill transparent rounded corners with the background blue so the icon
    # looks correct on older Android versions that show square icons.
    filled = fill_background(source, BACKGROUND_BLUE)
    for density, size in LEGACY_SIZES.items():
        output_dir = RES_DIR / f"mipmap-{density}"
        output_dir.mkdir(parents=True, exist_ok=True)
        icon = filled.resize((size, size), Image.LANCZOS)
        icon.save(output_dir / "ic_launcher.png")
        icon.save(output_dir / "ic_launcher_round.png")


def write_foreground_icons(foreground: Image.Image) -> None:
    for density, size in FOREGROUND_SIZES.items():
        output_dir = RES_DIR / f"mipmap-{density}"
        output_dir.mkdir(parents=True, exist_ok=True)
        foreground.resize((size, size), Image.LANCZOS).save(
            output_dir / "ic_launcher_foreground.png"
        )


def write_ios_icons(source: Image.Image) -> None:
    # iOS does not support transparency in app icons; fill corners with background blue.
    filled = fill_background(source, BACKGROUND_BLUE)
    IOS_ICON_DIR.mkdir(parents=True, exist_ok=True)

    images_json = []
    for logical_size, scale, filename in IOS_ICON_SIZES:
        pixel_size = logical_size * scale
        icon = filled.resize((pixel_size, pixel_size), Image.LANCZOS)
        icon.save(IOS_ICON_DIR / filename)

        idiom = "ios-marketing" if logical_size == 1024 else "iphone"
        images_json.append({
            "filename": filename,
            "idiom": idiom,
            "scale": f"{scale}x",
            "size": f"{logical_size}x{logical_size}",
        })

    contents = {
        "images": images_json,
        "info": {"author": "xcode", "version": 1},
    }
    (IOS_ICON_DIR / "Contents.json").write_text(
        json.dumps(contents, indent=2) + "\n", encoding="utf-8"
    )


def write_android_xml() -> None:
    anydpi_dir = RES_DIR / "mipmap-anydpi-v26"
    anydpi_dir.mkdir(parents=True, exist_ok=True)
    (RES_DIR / "drawable").mkdir(parents=True, exist_ok=True)

    r, g, b = BACKGROUND_BLUE
    background_xml = f"""<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="#{r:02X}{g:02X}{b:02X}" />
</shape>
"""
    (RES_DIR / "drawable" / "ic_launcher_background.xml").write_text(
        background_xml, encoding="utf-8"
    )

    launcher_xml = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""
    (anydpi_dir / "ic_launcher.xml").write_text(launcher_xml, encoding="utf-8")
    (anydpi_dir / "ic_launcher_round.xml").write_text(launcher_xml, encoding="utf-8")


def main() -> None:
    source = Image.open(SRC_ICON).convert("RGBA")
    foreground = extract_foreground(source)
    write_legacy_icons(source)
    write_foreground_icons(foreground)
    write_ios_icons(source)
    write_android_xml()
    print("Done. Icons written to:")
    print(f"  Android: {RES_DIR}")
    print(f"  iOS:     {IOS_ICON_DIR}")


if __name__ == "__main__":
    main()
