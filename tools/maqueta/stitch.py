"""Cose las capturas por pantalla de landing-test.js en una imagen de página completa.
Uso: python3.12 -I stitch.py out/raw-es-desktop out/landing-es-desktop-full.png"""
import sys, json, os
from PIL import Image
raw, dest = sys.argv[1], sys.argv[2]
meta = json.load(open(os.path.join(raw, 'offsets.json')))
w, h, total, offs = meta['w'], meta['h'], meta['totalH'], meta['offsets']
sheet = Image.new('RGB', (w, total), (242, 237, 224))
for i, y in enumerate(offs):
    im = Image.open(os.path.join(raw, 's%02d.png' % i)).convert('RGB')
    sheet.paste(im, (0, y))
sheet.save(dest)
print(dest, sheet.size)
