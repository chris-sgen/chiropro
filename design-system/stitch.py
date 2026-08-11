"""Stitch clipped screenshot bands into one full-page image.
argv: out_path width total_height band1.png band2.png ..."""
import sys
from PIL import Image
out, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
bands = sys.argv[4:]
canvas = Image.new("RGB", (w, h), (255, 255, 255))
y = 0
for b in bands:
    im = Image.open(b).convert("RGB")
    canvas.paste(im, (0, y))
    y += im.size[1]
canvas.save(out)
print(f"stitched {len(bands)} bands -> {w}x{h}")
