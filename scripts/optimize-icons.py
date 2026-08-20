from pathlib import Path

from PIL import Image


PROJECT = Path("/home/ubuntu/swarlipi")
SOURCE = PROJECT / "assets/images/icon.png"
TARGETS = [
    PROJECT / "assets/images/icon.png",
    PROJECT / "assets/images/splash-icon.png",
    PROJECT / "assets/images/favicon.png",
    PROJECT / "assets/images/android-icon-foreground.png",
]


def optimize_icon() -> None:
    with Image.open(SOURCE) as image:
        rgb = image.convert("RGB").resize((512, 512), Image.Resampling.LANCZOS)
        optimized = rgb.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
        for target in TARGETS:
            optimized.save(target, format="PNG", optimize=True)


if __name__ == "__main__":
    optimize_icon()
