"""Generate readable, watermarked SYNTHETIC demo document fixtures.

The Hassan demo needs documents that visibly open and are clearly labelled as
synthetic — not the 1×1 placeholder PNGs the seed previously used. This module
generates them at seed time using a small in-repo 5×7 bitmap font. No external
Python image library is required.

Every document carries the fixed banner:

    SYNTHETIC DEMO — NOT A REAL PATIENT DOCUMENT

so a screenshot cannot be mistaken for real clinical output.
"""
from __future__ import annotations

import struct
import zlib
from typing import Iterable

# --- 5x7 pixel font (ASCII 32..126) ----------------------------------------
# Each glyph is 7 rows × 5 columns, one bit per pixel (MSB = leftmost column).
# Only the characters we need are populated — anything missing renders as a
# blank space. This is deliberately tiny to keep the file readable.

_FONT: dict[str, tuple[int, ...]] = {
    " ": (0, 0, 0, 0, 0, 0, 0),
    "!": (0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100),
    "\"": (0b01010, 0b01010, 0b01010, 0, 0, 0, 0),
    "#": (0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010),
    "$": (0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100),
    "%": (0b11001, 0b11010, 0b00100, 0b01011, 0b10011, 0, 0),
    "&": (0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101),
    "'": (0b00100, 0b00100, 0b01000, 0, 0, 0, 0),
    "(": (0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010),
    ")": (0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000),
    "*": (0b00000, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0b00000),
    "+": (0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000),
    ",": (0, 0, 0, 0, 0, 0b00100, 0b01000),
    "-": (0, 0, 0, 0b11111, 0, 0, 0),
    ".": (0, 0, 0, 0, 0, 0b00110, 0b00110),
    "/": (0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0, 0),
    "0": (0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110),
    "1": (0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110),
    "2": (0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111),
    "3": (0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110),
    "4": (0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010),
    "5": (0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110),
    "6": (0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110),
    "7": (0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000),
    "8": (0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110),
    "9": (0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100),
    ":": (0, 0, 0b00110, 0b00110, 0, 0b00110, 0b00110),
    ";": (0, 0, 0b00110, 0b00110, 0, 0b00110, 0b01100),
    "<": (0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010),
    "=": (0, 0, 0b11111, 0, 0b11111, 0, 0),
    ">": (0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000),
    "?": (0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b00000, 0b00100),
    "@": (0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01111),
    "A": (0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001),
    "B": (0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110),
    "C": (0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110),
    "D": (0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110),
    "E": (0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111),
    "F": (0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000),
    "G": (0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110),
    "H": (0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001),
    "I": (0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110),
    "J": (0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100),
    "K": (0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001),
    "L": (0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111),
    "M": (0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001),
    "N": (0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001),
    "O": (0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110),
    "P": (0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000),
    "Q": (0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101),
    "R": (0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001),
    "S": (0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110),
    "T": (0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100),
    "U": (0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110),
    "V": (0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100),
    "W": (0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010),
    "X": (0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001),
    "Y": (0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100),
    "Z": (0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111),
    "[": (0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110),
    "\\": (0b10000, 0b01000, 0b00100, 0b00010, 0b00001, 0, 0),
    "]": (0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110),
    "_": (0, 0, 0, 0, 0, 0, 0b11111),
    "a": (0, 0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111),
    "b": (0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110),
    "c": (0, 0, 0b01110, 0b10001, 0b10000, 0b10001, 0b01110),
    "d": (0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b10001, 0b01111),
    "e": (0, 0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110),
    "f": (0b00110, 0b01001, 0b01000, 0b11110, 0b01000, 0b01000, 0b01000),
    "g": (0, 0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001),
    "h": (0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001),
    "i": (0b00100, 0, 0b01100, 0b00100, 0b00100, 0b00100, 0b01110),
    "j": (0b00010, 0, 0b00110, 0b00010, 0b00010, 0b10010, 0b01100),
    "k": (0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010),
    "l": (0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110),
    "m": (0, 0, 0b11010, 0b10101, 0b10101, 0b10001, 0b10001),
    "n": (0, 0, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001),
    "o": (0, 0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110),
    "p": (0, 0, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000),
    "q": (0, 0, 0b01111, 0b10001, 0b01111, 0b00001, 0b00001),
    "r": (0, 0, 0b10110, 0b11001, 0b10000, 0b10000, 0b10000),
    "s": (0, 0, 0b01110, 0b10000, 0b01110, 0b00001, 0b11110),
    "t": (0b01000, 0b01000, 0b11110, 0b01000, 0b01000, 0b01001, 0b00110),
    "u": (0, 0, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101),
    "v": (0, 0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100),
    "w": (0, 0, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010),
    "x": (0, 0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001),
    "y": (0, 0, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110),
    "z": (0, 0, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111),
    "|": (0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100),
}

CHAR_W, CHAR_H = 5, 7
GLYPH_SPACING = 1
LINE_SPACING = 3


def _pixel(canvas: list[list[int]], x: int, y: int, value: int = 0) -> None:
    if 0 <= y < len(canvas) and 0 <= x < len(canvas[0]):
        canvas[y][x] = value


def _draw_char(canvas: list[list[int]], x: int, y: int, ch: str, scale: int, value: int) -> None:
    glyph = _FONT.get(ch)
    if glyph is None:
        return
    for row in range(CHAR_H):
        bits = glyph[row]
        for col in range(CHAR_W):
            if bits & (1 << (CHAR_W - 1 - col)):
                for dy in range(scale):
                    for dx in range(scale):
                        _pixel(canvas, x + col * scale + dx, y + row * scale + dy, value)


def _draw_text(canvas: list[list[int]], x: int, y: int, text: str, scale: int = 2, value: int = 0) -> None:
    cx = x
    for ch in text:
        _draw_char(canvas, cx, y, ch, scale, value)
        cx += (CHAR_W + GLYPH_SPACING) * scale


def _draw_hline(canvas: list[list[int]], y: int, x0: int, x1: int, value: int = 0) -> None:
    for x in range(x0, x1):
        _pixel(canvas, x, y, value)


def _make_canvas(width: int, height: int, fill: int = 255) -> list[list[int]]:
    return [[fill] * width for _ in range(height)]


def _to_png(canvas: list[list[int]]) -> bytes:
    """Encode an 8-bit greyscale canvas as a PNG file (no external deps)."""
    height = len(canvas)
    width = len(canvas[0])

    def _chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack("!IIBBBBB", width, height, 8, 0, 0, 0, 0)
    raw = bytearray()
    for row in canvas:
        raw.append(0)
        raw.extend(row)
    idat = zlib.compress(bytes(raw), 9)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", idat)
        + _chunk(b"IEND", b"")
    )


def render_document(
    title: str,
    subtitle: str,
    body_lines: Iterable[str],
    *,
    width: int = 760,
    height: int = 520,
    footer: str = "SYNTHETIC DEMO - NOT A REAL PATIENT DOCUMENT",
) -> bytes:
    """Render a simple bilingual-friendly document PNG with a demo watermark."""
    canvas = _make_canvas(width, height, fill=255)
    # Top and bottom banners
    for y in range(0, 34):
        for x in range(width):
            canvas[y][x] = 220
    for y in range(height - 34, height):
        for x in range(width):
            canvas[y][x] = 220
    _draw_text(canvas, 20, 10, footer, scale=1)
    _draw_text(canvas, 20, height - 24, footer, scale=1)
    _draw_hline(canvas, 40, 20, width - 20)
    _draw_hline(canvas, height - 40, 20, width - 20)

    _draw_text(canvas, 20, 60, title, scale=3)
    _draw_text(canvas, 20, 100, subtitle, scale=2)

    y = 150
    for line in body_lines:
        if y > height - 60:
            break
        _draw_text(canvas, 20, y, line[:100], scale=2)
        y += (CHAR_H * 2) + LINE_SPACING + 4

    return _to_png(canvas)


def build_hassan_fixtures() -> dict[str, bytes]:
    """Return {name: png_bytes} for every Hassan demo document."""
    return {
        "hassan_cbc_demo.png": render_document(
            "Complete Blood Count",
            "Karachi Community Lab - 18 days ago",
            [
                "Patient: Hassan  Age: 34  Sex: Male",
                "Haemoglobin  11.2 g/dL   (Ref 13-17)  LOW",
                "WBC          6.8 x10^9/L (Ref 4-11)   normal",
                "Platelets    240 x10^9/L (Ref 150-450) normal",
                "MCV          82 fL       (Ref 80-100)  normal",
                "",
                "Impression: mild anaemia flagged for review.",
                "Discuss iron studies with the clinician.",
            ],
        ),
        "hassan_confirmed_rx_demo.png": render_document(
            "Prescription",
            "Dr Sara Khan  Family Clinic  12 days ago",
            [
                "Patient: Hassan  Age: 34",
                "Rx:",
                "  Cetirizine 10 mg  once nightly  x 7 days",
                "",
                "Advice: keep away from sedatives; return if",
                "symptoms worsen or new red flags appear.",
            ],
        ),
        "hassan_chest_xray_demo.png": render_document(
            "Chest X-ray Report",
            "Community Imaging Centre  42 days ago",
            [
                "Patient: Hassan  Age: 34",
                "Indication: seasonal cough, asthma follow-up.",
                "Findings: lung fields clear. No consolidation.",
                "Heart size within normal limits. No effusion.",
                "",
                "Impression: no acute cardiopulmonary process.",
                "Follow up per treating clinician.",
            ],
        ),
        "hassan_skin_progress_demo.png": render_document(
            "Skin progress note",
            "Self-recorded  3 days ago",
            [
                "Right arm: single red mark, roughly coin-sized.",
                "No open wound, no pus, no bleeding.",
                "Warmth or fever: not present at time of photo.",
                "Itch: mild, worse in the evening.",
                "",
                "Note: this is a synthetic demo record and is",
                "not clinical interpretation of a real image.",
            ],
        ),
    }
