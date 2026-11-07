"""Generate the extension icons.

Design: a rounded square with a horizontal gradient from Language Reactor purple
(left) to Anki blue (right) - the "LR -> Anki" bridge. On the left, LR-style
overlapping bubbles; on the right, an Anki-style 5-point star; a white 字
(character/word) in the centre.

Usage: python make_icon.py <output_dir>
Requires Pillow and a CJK font (macOS STHeiti).
"""

import math
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
SIZES = [16, 32, 48, 96, 128]
M = 512

LR_PURPLE = (124, 58, 237)   # Language Reactor (left)
ANKI_BLUE = (37, 99, 235)    # Anki (right)
WHITE = (255, 255, 255, 255)
CHAR = "字"
FONT_PATH = "/System/Library/Fonts/STHeiti Medium.ttc"


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


# Horizontal gradient: left LR purple -> right Anki blue.
grad = Image.new("RGBA", (M, M))
px = grad.load()
for x in range(M):
    r, g, b = lerp(LR_PURPLE, ANKI_BLUE, x / (M - 1))
    for y in range(M):
        px[x, y] = (r, g, b, 255)

# Rounded-corner mask.
mask = Image.new("L", (M, M), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, M - 1, M - 1], radius=int(M * 0.22), fill=255)
grad.putalpha(mask)

# LR bubbles (overlapping circles) on the left, semi-transparent white.
overlay = Image.new("RGBA", (M, M), (0, 0, 0, 0))
od = ImageDraw.Draw(overlay)
bubbles = [(0.17, 0.27, 0.115, 235), (0.29, 0.15, 0.068, 215), (0.10, 0.44, 0.052, 200)]
for fx, fy, fr, a in bubbles:
    cx, cy, rr = fx * M, fy * M, fr * M
    od.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 255, 255, a))
grad = Image.alpha_composite(grad, overlay)

draw = ImageDraw.Draw(grad)

# Centred 字.
font = ImageFont.truetype(FONT_PATH, int(M * 0.52), index=0)
bbox = draw.textbbox((0, 0), CHAR, font=font)
x = (M - (bbox[2] - bbox[0])) / 2 - bbox[0]
y = (M - (bbox[3] - bbox[1])) / 2 - bbox[1] + M * 0.15
draw.text((x, y), CHAR, font=font, fill=WHITE)

# Anki-style 5-point star on the right, moved up.
cx, cy, R, r = M * 0.83, M * 0.21, M * 0.165, M * 0.165 * 0.38
pts = []
for k in range(10):
    ang = math.radians(-90 + k * 36)
    rad = R if k % 2 == 0 else r
    pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
# Round the star's points via blur + threshold on a mask.
star_mask = Image.new("L", (M, M), 0)
ImageDraw.Draw(star_mask).polygon(pts, fill=255)
star_mask = star_mask.filter(ImageFilter.GaussianBlur(M * 0.018))
star_mask = star_mask.point(lambda v: 255 if v >= 128 else 0)
grad.paste(Image.new("RGBA", (M, M), WHITE), (0, 0), star_mask)

for s in SIZES:
    grad.resize((s, s), Image.LANCZOS).save(f"{OUT}/{s}.png")
print("icons written to", OUT)
