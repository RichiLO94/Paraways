"""Optimiza un PNG de tarjeta Open Graph: paleta de 256 colores (libimagequant si PIL lo trae; si no, mediana)
con difuminado Floyd-Steinberg y compresión máxima. Con libimagequant el error medio queda en ~1/255 por canal.
Uso: python3.12 -I png-optimize.py <entrada.png> <salida.png> [ancho=1200] [alto=630] [--truecolor]
Con --truecolor conserva los 24 bits (solo recomprime)."""
import os
import sys
from PIL import Image, features

src, dst = sys.argv[1], sys.argv[2]
w = int(sys.argv[3]) if len(sys.argv) > 3 and not sys.argv[3].startswith('--') else 1200
h = int(sys.argv[4]) if len(sys.argv) > 4 and not sys.argv[4].startswith('--') else 630
truecolor = '--truecolor' in sys.argv
im = Image.open(src).convert('RGB')
if im.size != (w, h):
    im = im.resize((w, h), Image.LANCZOS)
method = 'paleta 256'
if not truecolor:
    liq = features.check('libimagequant')
    im = im.quantize(colors=256, method=Image.Quantize.LIBIMAGEQUANT if liq else Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)
    method += ' (libimagequant)' if liq else ' (mediana)'
im.save(dst, 'PNG', optimize=True, compress_level=9)
print(f'{dst}: {w}x{h} {"24 bits" if truecolor else method} {os.path.getsize(dst) / 1024:.0f} KB')
