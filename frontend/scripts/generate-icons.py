#!/usr/bin/env python3
"""Regenerates every rasterized Skillet brand asset from the one master
vector source, `public/brand/skillet-mark.svg` (the frying-pan glyph, drawn
`currentColor`/transparent so it also works as an in-app React icon
component). Not part of `bun run build`/dev/test — a one-off design-asset
tool, run by hand whenever the mark itself changes, matching this repo's
own convention of committing generated static assets rather than
regenerating them on every build (see `public/icons/*.png`'s own git
history: hand-authored/regenerated, not build output).

Prerequisites (system tools, not npm/bun dependencies -- deliberately: this
script runs once in a while, by a human updating branding, not on every
contributor's machine or in CI, so it doesn't need to be dependency-free
for THAT loop, just documented here):
    - rsvg-convert (`brew install librsvg` / `apt install librsvg2-bin`)
    - Pillow (`pip install pillow`) -- for a real, standards-compliant
      multi-resolution .ico (rsvg-convert alone only emits PNG/PDF/etc.)

Usage: `python3 scripts/generate-icons.py` from `frontend/`.

Outputs (all regenerated, never hand-edited afterward):
    app/favicon.ico                     16/32/48 px, multi-resolution
    app/icon.svg                        crisp vector favicon, modern browsers
    app/apple-icon.png                  180x180, iOS "Add to Home Screen"
    public/icons/icon-192.png           PWA manifest icon, purpose "any"
    public/icons/icon-512.png           PWA manifest icon, purpose "any"
    public/icons/icon-maskable-512.png  PWA manifest icon, purpose "maskable"
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

FRONTEND_ROOT = Path(__file__).resolve().parents[1]
MARK_SVG = FRONTEND_ROOT / "public" / "brand" / "skillet-mark.svg"

# The warm burnt-orange accent + light-neutral background already
# established as Skillet's real brand colors (SPEC-app-shell.md Confirmed
# Decision 6/7; the same hex values app/manifest.ts's theme_color/
# background_color already use) -- not new colors invented for this
# script, the existing ones finally getting used for real branding instead
# of a generic placeholder.
BRAND_BG = "#C2410C"
BRAND_FG = "#FAFAF9"


def mark_paths() -> str:
    """The mark's own `<circle>`/`<path>` elements, extracted so they can
    be recolored and recomposed onto different backgrounds (a plain square
    for "any"-purpose icons, extra-padded for "maskable") without hand-
    duplicating the drawing in multiple files.
    """
    text = MARK_SVG.read_text()
    start = text.index("<circle")
    end = text.index("</svg>")
    return text[start:end]


def render_svg(svg_markup: str, size: int, out_path: Path) -> None:
    with tempfile.NamedTemporaryFile(suffix=".svg", mode="w", delete=False) as f:
        f.write(svg_markup)
        tmp_path = f.name
    try:
        subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size), tmp_path, "-o", str(out_path)],
            check=True,
        )
    finally:
        Path(tmp_path).unlink()


def composite_svg(*, padding_frac: float, rounded: bool) -> str:
    """A full-bleed square (rounded for the "any"-purpose icons, since
    those render as-is in most launchers; square for "maskable", since the
    OS applies its own mask shape and a baked-in rounded corner would
    conflict with it) with the mark centered and scaled down by
    `padding_frac` on each side -- maskable icons need real breathing room
    inside their own "safe zone" (~80% of the canvas, per the maskable
    icon spec) or the OS's mask can clip the drawing.
    """
    rect = f'<rect width="24" height="24" rx="{5 if rounded else 0}" fill="{BRAND_BG}"/>'
    inner = mark_paths()
    scale = 1 - 2 * padding_frac
    offset = 24 * padding_frac
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
        f"{rect}"
        f'<g transform="translate({offset:.3f} {offset:.3f}) scale({scale:.3f})" '
        f'fill="none" stroke="{BRAND_FG}" stroke-width="2" stroke-linecap="round" '
        f'stroke-linejoin="round">{inner}</g>'
        f"</svg>"
    )


def main() -> int:
    if not MARK_SVG.is_file():
        print(f"error: master mark not found at {MARK_SVG}", file=sys.stderr)
        return 1

    any_purpose_svg = composite_svg(padding_frac=0.0, rounded=True)
    # 0.12 was tried first and measured against the maskable spec's actual
    # safe-zone circle (centered, 80% of the icon diameter) with a
    # generated overlay -- the handle's tip landed right on the circle's
    # edge, not safely inside it. 0.20 was verified the same way (rendered,
    # overlaid, inspected) before trusting it.
    maskable_svg = composite_svg(padding_frac=0.20, rounded=False)

    icons_dir = FRONTEND_ROOT / "public" / "icons"
    icons_dir.mkdir(parents=True, exist_ok=True)
    render_svg(any_purpose_svg, 192, icons_dir / "icon-192.png")
    render_svg(any_purpose_svg, 512, icons_dir / "icon-512.png")
    render_svg(maskable_svg, 512, icons_dir / "icon-maskable-512.png")
    print("wrote public/icons/icon-{192,512,maskable-512}.png")

    # app/icon.svg: modern browsers (Chrome/Firefox/Safari all support an
    # SVG favicon via <link rel="icon" type="image/svg+xml">) get a crisp
    # vector tab icon instead of a rasterized one.
    (FRONTEND_ROOT / "app" / "icon.svg").write_text(any_purpose_svg + "\n")
    print("wrote app/icon.svg")

    # app/apple-icon.png: iOS "Add to Home Screen" -- Next.js auto-detects
    # this file the same way it does app/icon.svg, no metadata wiring
    # needed. Reuses the maskable composite (already verified against the
    # real safe-zone spec above) rather than a plain square background:
    # iOS applies its own corner rounding on top of whatever's supplied, so
    # the same generous, already-checked padding that protects against
    # Android's mask shapes protects against iOS's corner-rounding too.
    render_svg(maskable_svg, 180, FRONTEND_ROOT / "app" / "apple-icon.png")
    print("wrote app/apple-icon.png")

    # favicon.ico: a real multi-resolution ICO (16/32/48), for every
    # browser that still only looks for /favicon.ico. Rendered once at a
    # much larger size (256px) and downsampled with LANCZOS for each
    # target -- rsvg-convert rendering directly at 16px produces visibly
    # muddier strokes than rendering large and resampling down, confirmed
    # by eye against both approaches while building this script.
    #
    # Pillow's ICO writer resizes DOWN from whatever source image `.save`
    # is called on to fulfill its `sizes` list -- it can't upscale a small
    # source to a larger requested size, so the source here must be at
    # least as large as the biggest requested size (found the hard way:
    # calling `.save()` on the smallest of several separately-resized
    # images silently wrote only that one size, since Pillow had nothing
    # bigger to downsample from for the other two).
    sizes = [16, 32, 48]
    with tempfile.TemporaryDirectory() as tmp_dir:
        raw_path = Path(tmp_dir) / "source.png"
        render_svg(any_purpose_svg, 256, raw_path)
        source = Image.open(raw_path).convert("RGBA")
        source.save(
            FRONTEND_ROOT / "app" / "favicon.ico",
            format="ICO",
            sizes=[(s, s) for s in sizes],
        )
    print("wrote app/favicon.ico (16/32/48px)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
