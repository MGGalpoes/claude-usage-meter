# Remove fundo liso (cor das bordas) por flood fill + tira restos esverdeados. Uso:
# python tools/remove_bg.py <entrada.png> <saida.png> [--size 512]
import sys, numpy as np
from PIL import Image, ImageFilter
from collections import deque
src, dst = sys.argv[1], sys.argv[2]; size = int(sys.argv[sys.argv.index("--size")+1]) if "--size" in sys.argv else 512
im = Image.open(src).convert("RGB"); a = np.asarray(im).astype(int); h, w, _ = a.shape
bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
cand = np.abs(a - bg).sum(axis=2) < 60
mask = np.zeros((h, w), bool); q = deque()
for x in range(w): q.append((0, x)); q.append((h - 1, x))
for y in range(h): q.append((y, 0)); q.append((y, w - 1))
while q:
    y, x = q.popleft()
    if mask[y, x] or not cand[y, x]: continue
    mask[y, x] = True
    if y > 0: q.append((y - 1, x))
    if y < h - 1: q.append((y + 1, x))
    if x > 0: q.append((y, x - 1))
    if x < w - 1: q.append((y, x + 1))
alpha = np.asarray(Image.fromarray(((~mask) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
greenish = (g > r + 25) & (g > b + 15)          # sombra/restos da cor de fundo
alpha = np.where(greenish, 0, alpha)
rgba = np.dstack([a, alpha]).astype(np.uint8); out = Image.fromarray(rgba, "RGBA")
bbox = out.getchannel("A").getbbox(); c = out.crop(bbox); s = max(c.size) + 40
sq = Image.new("RGBA", (s, s), (0, 0, 0, 0)); sq.paste(c, ((s - c.width) // 2, (s - c.height) // 2))
sq.resize((size, size), Image.LANCZOS).save(dst, optimize=True); print("ok", dst, f"{mask.mean()*100:.0f}% fundo")
