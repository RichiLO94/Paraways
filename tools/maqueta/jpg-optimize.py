"""Exporta un PNG de captura a JPG progresivo optimizado para la web.
Uso: python3.12 -I jpg-optimize.py <entrada.png> <salida.jpg> <ancho> <alto> [máx KB=260]
Calidad de 84 hacia abajo (mínimo 80) hasta cumplir el peso; primero croma 4:4:4 (bordes y rótulos nítidos),
luego 4:2:0. Si no entra en el tamaño pedido, se avisa y queda la última versión."""
import sys
from PIL import Image, ImageFilter

src, dst, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
max_kb = int(sys.argv[5]) if len(sys.argv) > 5 else 260
im = Image.open(src).convert('RGB')
if im.size != (w, h):
    sw, sh = im.size
    k = max(w / sw, h / sh)
    im = im.resize((round(sw * k), round(sh * k)), Image.LANCZOS)
    x0, y0 = (im.width - w) // 2, (im.height - h) // 2
    im = im.crop((x0, y0, x0 + w, y0 + h))
    im = im.filter(ImageFilter.UnsharpMask(radius=0.8, percent=45, threshold=2))
best = None
for subsampling in (0, 2):
    for q in range(84, 79, -1):
        im.save(dst, 'JPEG', quality=q, optimize=True, progressive=True, subsampling=subsampling)
        size = __import__('os').path.getsize(dst)
        best = (q, subsampling, size)
        if size <= max_kb * 1024:
            print(f'{dst}: {w}x{h} q{q} croma {"4:4:4" if subsampling == 0 else "4:2:0"} {size / 1024:.0f} KB')
            sys.exit(0)
print(f'{dst}: no entra en {max_kb} KB; queda q{best[0]} croma {best[1]} {best[2] / 1024:.0f} KB')
