#!/usr/bin/env python3
"""Draws the app icons in public/ from the design of public/favicon.svg (light theme colours).

Browsers use these for the installed app (taskbar, start menu, home screen); an SVG favicon alone
is not enough there. No dependencies: anti-aliased shapes computed per pixel, written as PNG with zlib.
Run from the repository root:  python3 scripts/make-icons.py
Then raise ?v= on the icons in public/manifest.webmanifest: installed apps keep their icon
until the browser sees a changed icon address in the manifest.
"""
import struct
import zlib

TILE = (0x5D, 0x5A, 0x8A)  # .tile in favicon.svg
MARK = (0xFA, 0xF9, 0xF6)  # .mark in favicon.svg (--paper)

# Geometry in the 64-unit grid of favicon.svg
RADIUS = 14
BARS = [(14, 31, 21), (14, 25, 33), (14, 39, 45)]  # x from, x to, y; stroke width 6, round caps
BAR_HALF = 3
RING = (45, 25, 6, 2.5)  # cx, cy, r, half stroke width

# name: (size, rounded tile with transparent corners?) – iOS fills transparency with black and rounds itself
SIZES = {"icon-192.png": (192, True), "icon-512.png": (512, True), "apple-touch-icon.png": (180, False)}


def coverage(signed_distance: float) -> float:
    """Pixel coverage from the distance of its centre to the shape edge in pixels (negative = inside)."""
    return min(1.0, max(0.0, 0.5 - signed_distance))


def tile_distance(x: float, y: float) -> float:
    qx, qy = abs(x - 32) - (32 - RADIUS), abs(y - 32) - (32 - RADIUS)
    outside = (max(qx, 0) ** 2 + max(qy, 0) ** 2) ** 0.5
    return outside + min(max(qx, qy), 0) - RADIUS


def mark_distance(x: float, y: float) -> float:
    d = min((((x - min(max(x, x1), x2)) ** 2 + (y - by) ** 2) ** 0.5) - BAR_HALF for x1, x2, by in BARS)
    cx, cy, r, half = RING
    return min(d, abs(((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 - r) - half)


def draw(size: int, rounded: bool) -> bytes:
    scale = size / 64
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter type: none
        for px in range(size):
            x, y = (px + 0.5) / scale, (py + 0.5) / scale
            alpha = coverage(tile_distance(x, y) * scale) if rounded else 1.0
            a = coverage(mark_distance(x, y) * scale)
            row += bytes(round(t + (m - t) * a) for t, m in zip(TILE, MARK)) + bytes([round(alpha * 255)])
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 9)

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


if __name__ == "__main__":
    for name, (size, rounded) in SIZES.items():
        with open(f"public/{name}", "wb") as f:
            f.write(draw(size, rounded))
        print(f"public/{name} {size}×{size}")
