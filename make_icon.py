#!/usr/bin/env python3
"""
Generates CTRLr app icon — keyboard Ctrl-key style, Monaco font.
Output: CTRLr/Resources/AppIcon_1024.png  (1024×1024, iOS-ready)
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

SIZE     = 1024
OUT_PATH = os.path.join(os.path.dirname(__file__),
                        "CTRLr", "Assets.xcassets", "AppIcon.appiconset", "AppIcon_1024.png")

# ── palette ──────────────────────────────────────────────────────────────────
BG         = (10,  10,  15,  255)   # #0A0A0F  — app background
KEY_TOP    = (38,  38,  60,  255)   # top gradient of key face
KEY_BOT    = (20,  20,  34,  255)   # bottom gradient of key face
KEY_EDGE   = ( 8,   8,  16,  255)   # bottom 3-D edge (darker slab below face)
BEVEL_H    = (70,  70, 110, 150)    # top-edge highlight strip
BORDER     = (80,  80, 130, 200)    # thin outer stroke
TEXT_COLOR = (0,  229, 160, 255)    # #00E5A0 green
GLOW_COLOR = (0,  229, 160,  55)    # (unused — replaced by layered LED glow below)
FONT_PATH  = "/System/Library/Fonts/Monaco.ttf"

# ── helpers ───────────────────────────────────────────────────────────────────

def alpha_paste(base: Image.Image, layer: Image.Image) -> Image.Image:
    return Image.alpha_composite(base, layer)

def new_layer():
    return Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# ── canvas ────────────────────────────────────────────────────────────────────
canvas = Image.new("RGBA", (SIZE, SIZE), BG)

# Key geometry
pad = 88
R   = 130            # corner radius of the key cap
x1, y1 = pad, pad
x2, y2 = SIZE - pad, SIZE - pad
cx = (x1 + x2) // 2
cy = (y1 + y2) // 2
EDGE = 10            # how many px the 3-D bottom slab extends downward

# ── 1. drop shadow ────────────────────────────────────────────────────────────
sh = new_layer()
ImageDraw.Draw(sh).rounded_rectangle(
    [x1 + 6, y1 + 14, x2 + 6, y2 + 14], radius=R, fill=(0, 0, 0, 160))
sh = sh.filter(ImageFilter.GaussianBlur(radius=24))
canvas = alpha_paste(canvas, sh)

# ── 2. 3-D edge slab (darker bottom plane) ────────────────────────────────────
slab = new_layer()
ImageDraw.Draw(slab).rounded_rectangle(
    [x1, y1 + EDGE, x2, y2 + EDGE], radius=R, fill=KEY_EDGE)
canvas = alpha_paste(canvas, slab)

# ── 3. key face — vertical gradient ──────────────────────────────────────────
face_grad = new_layer()
grad_draw  = ImageDraw.Draw(face_grad)
face_h = y2 - y1
for row in range(y1, y2 + 1):
    t = (row - y1) / face_h
    r = int(KEY_TOP[0] + t * (KEY_BOT[0] - KEY_TOP[0]))
    g = int(KEY_TOP[1] + t * (KEY_BOT[1] - KEY_TOP[1]))
    b = int(KEY_TOP[2] + t * (KEY_BOT[2] - KEY_TOP[2]))
    grad_draw.line([(x1, row), (x2, row)], fill=(r, g, b, 255))

mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle([x1, y1, x2, y2], radius=R, fill=255)

face_clipped = new_layer()
face_clipped.paste(face_grad, mask=mask)
canvas = alpha_paste(canvas, face_clipped)

# ── 4. top-edge highlight strip (simulates bevelled top) ─────────────────────
hl = new_layer()
hl_draw = ImageDraw.Draw(hl)
for i in range(18):
    alpha = int(BEVEL_H[3] * (1 - i / 18) ** 1.6)
    hl_draw.rounded_rectangle(
        [x1 + i, y1 + i, x2 - i, y1 + i + 3], radius=3,
        fill=(BEVEL_H[0], BEVEL_H[1], BEVEL_H[2], alpha))
canvas = alpha_paste(canvas, hl)

# ── 5. left-edge highlight (subtle) ──────────────────────────────────────────
le = new_layer()
le_draw = ImageDraw.Draw(le)
for i in range(10):
    alpha = int(50 * (1 - i / 10))
    le_draw.rounded_rectangle(
        [x1 + i, y1 + i, x1 + i + 3, y2 - i], radius=3,
        fill=(255, 255, 255, alpha))
canvas = alpha_paste(canvas, le)

# ── 6. thin outer border ──────────────────────────────────────────────────────
bd = new_layer()
ImageDraw.Draw(bd).rounded_rectangle(
    [x1, y1, x2, y2], radius=R, outline=BORDER, width=3)
canvas = alpha_paste(canvas, bd)

# ── 7. inner-shadow at bottom of face (vignette feel) ─────────────────────────
vs = new_layer()
vs_draw = ImageDraw.Draw(vs)
for i in range(30):
    alpha = int(80 * (i / 30) ** 2)
    vs_draw.rounded_rectangle(
        [x1 + i, y2 - i - 3, x2 - i, y2 - i], radius=3,
        fill=(0, 0, 0, alpha))
canvas = alpha_paste(canvas, vs)

# ── 8. text "CTRLr" — upper-left of key face ─────────────────────────────────
LABEL     = "CTRLr"
TARGET_W  = (x2 - x1) * 0.70
font_size = 230
font      = None

while font_size >= 60:
    font  = ImageFont.truetype(FONT_PATH, font_size)
    bbox  = font.getbbox(LABEL)
    tw    = bbox[2] - bbox[0]
    if tw <= TARGET_W:
        break
    font_size -= 4

bbox = font.getbbox(LABEL)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

# Upper-left: inset ~10% from the key face edges
tx = x1 + int((x2 - x1) * 0.10) - bbox[0]
ty = y1 + int((y2 - y1) * 0.10) - bbox[1]

# Stroke width: thicker letterforms give the glow more surface area to bloom
# from, making the LED effect more pronounced at all icon sizes.
STROKE = 6

# ── LED glow — layered from widest/softest to tightest/brightest ─────────────
#
# Layer 1 — very wide ambient halo: lights the key face surface like the LED
#            is genuinely illuminating the material around it
glow_w = new_layer()
ImageDraw.Draw(glow_w).text((tx, ty), LABEL, font=font, fill=(0, 229, 160, 60),
                             stroke_width=STROKE, stroke_fill=(0, 229, 160, 60))
glow_w = glow_w.filter(ImageFilter.GaussianBlur(radius=55))
canvas = alpha_paste(canvas, glow_w)

# Layer 2 — medium bloom: the visible light spill around each letter
glow_m = new_layer()
ImageDraw.Draw(glow_m).text((tx, ty), LABEL, font=font, fill=(0, 229, 160, 110),
                             stroke_width=STROKE, stroke_fill=(0, 229, 160, 110))
glow_m = glow_m.filter(ImageFilter.GaussianBlur(radius=22))
canvas = alpha_paste(canvas, glow_m)

# Layer 3 — tight halo: concentrated energy just outside the letterform
glow_t = new_layer()
ImageDraw.Draw(glow_t).text((tx, ty), LABEL, font=font, fill=(0, 229, 160, 180),
                             stroke_width=STROKE, stroke_fill=(0, 229, 160, 180))
glow_t = glow_t.filter(ImageFilter.GaussianBlur(radius=7))
canvas = alpha_paste(canvas, glow_t)

# Layer 4 — hot inner core: a slightly whiter, very tight ring that makes
#            the letter look like it's the actual light source
glow_c = new_layer()
ImageDraw.Draw(glow_c).text((tx, ty), LABEL, font=font, fill=(120, 255, 210, 200),
                             stroke_width=STROKE, stroke_fill=(120, 255, 210, 200))
glow_c = glow_c.filter(ImageFilter.GaussianBlur(radius=2))
canvas = alpha_paste(canvas, glow_c)

# crisp text on top — same stroke so it matches the glow footprint exactly
txt_layer = new_layer()
ImageDraw.Draw(txt_layer).text((tx, ty), LABEL, font=font, fill=TEXT_COLOR,
                                stroke_width=STROKE, stroke_fill=TEXT_COLOR)
canvas = alpha_paste(canvas, txt_layer)

# ── save ──────────────────────────────────────────────────────────────────────
final = canvas.convert("RGB")
final.save(OUT_PATH, quality=100)
print(f"✓ Saved {OUT_PATH}  ({tw}×{th}px text, font size {font_size})")
