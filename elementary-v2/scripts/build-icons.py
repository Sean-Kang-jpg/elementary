"""Site icons from the logo artwork.

    python scripts/build-icons.py docs/assets/logo-source.png public

The artwork's tile is off-white on near-white, so at tab size it disappears.
The pin and map are cut out onto transparency for the favicon (whites they
enclose, like the house, stay); the Apple icon and the Organization logo get
an opaque white square. Needs Pillow.
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGBA')
w, h = im.size
r, g, b, _ = im.split()
minc = ImageChops.darker(ImageChops.darker(r, g), b)
binary = minc.point(lambda v: 255 if v >= 232 else 0)
for seed in [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]:
    ImageDraw.floodfill(binary, seed, 128)
bg = binary.point(lambda v: 255 if v == 128 else 0)          # outside region
band = bg.filter(ImageFilter.MaxFilter(5))                   # 2px around it
alpha = Image.new('L', (w, h), 255)
px, ap, bgp, bdp = im.load(), alpha.load(), bg.load(), band.load()
for y in range(h):
    for x in range(w):
        if bgp[x, y]:
            ap[x, y] = 0
        elif bdp[x, y]:
            R, G, B, _ = px[x, y]
            a = max(255 - R, 255 - G, 255 - B) / 255 * 255 * 1.0
            a = min(255, int(a * 2.2))                       # color-to-alpha against white
            if a > 0:
                f = 255 / a
                px[x, y] = (max(0, min(255, int(255 - (255 - R) * f))), max(0, min(255, int(255 - (255 - G) * f))), max(0, min(255, int(255 - (255 - B) * f))), 255)
            ap[x, y] = a
im.putalpha(alpha)
bbox = alpha.point(lambda v: 255 if v > 200 else 0).getbbox()
cut = im.crop(bbox)
cw, ch = cut.size

def square(img, pad_ratio, bgcolor):
    side = int(max(img.size) * (1 + 2 * pad_ratio))
    canvas = Image.new('RGBA', (side, side), bgcolor)
    canvas.alpha_composite(img, ((side - img.size[0]) // 2, (side - img.size[1]) // 2))
    return canvas

transparent = square(cut, 0.02, (0, 0, 0, 0))
opaque = square(cut, 0.12, (255, 255, 255, 255))
transparent.resize((48, 48), Image.LANCZOS).save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
transparent.resize((192, 192), Image.LANCZOS).save(f'{out}/icon-192.png', optimize=True)
opaque.convert('RGB').resize((180, 180), Image.LANCZOS).save(f'{out}/apple-touch-icon.png', optimize=True)
opaque.convert('RGB').resize((512, 512), Image.LANCZOS).save(f'{out}/logo.png', optimize=True)
