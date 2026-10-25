"""Fotos reales de Le Petit Trianon: limpieza de subtítulos y rótulos quemados, gradación común y exportación web.

Uso:
  python photo-clean.py <carpeta raw> <carpeta de trabajo> <carpeta assets> <aerial-align.json> [foto ...]
    <carpeta raw>       porton.png, casa.png, piscina.png, aerea.png (cuadros de 921×522 sin bandas negras)
    <carpeta de trabajo> máscaras, intermedios y maestros PNG limpios (no van al repo)
    <carpeta assets>    destino de los JPG del sitio (assets/ del repo)
    <aerial-align.json> salida de aerial-align.py (polígono medido en píxeles de la aérea)
    [foto ...]          opcional: porton casa piscina aerea (por defecto, las cuatro)

Requiere Python 3 con opencv-contrib-python-headless (cv2), numpy y Pillow. Determinista (grano con semilla fija).

Método
  1. Máscara del texto quemado (blanco con borde y sombra oscura): núcleo claro y poco saturado dentro de la caja
     del subtítulo (o, sobre hormigón claro, el contorno oscuro cerrado y relleno), dilatado para cubrir borde,
     sombra y halo de compresión.
  2. Relleno por ejemplos (Criminisi 2004): orden de relleno por confianza × término de datos, parches de 9×9
     buscados con SSD en una ventana local, con región de origen restringida (césped, suelo, sin agua de la
     piscina, sin techos claros). Luego se corrige la baja frecuencia del hueco con una interpolación suave
     multiescala del entorno para que la luz y las sombras sigan el gradiente real.
     Se compararon cv2.inpaint (TELEA y NS, radios 3 y 7), xphoto FSR rápido/óptimo y Shift-Map, una completación
     multiescala por votación de parches y este método; este es el que no deja manchas a 100 %.
  3. Portón: el subtítulo de cuatro líneas sobre el camino de tierra no se puede reconstruir sin repeticiones
     visibles; la foto se recorta por encima del subtítulo (921×362, 2,54:1). El relleno completo queda solo
     como referencia en la carpeta de trabajo.
  4. Aérea: se borran contorno blanco, flecha, rótulos y etiquetas/pines de Google Maps; se dibuja el límite
     medido (aerial-align.json) en oro #C9A66B, 3 px a 1440 de ancho, con halo suave y relleno al 8 %.
  5. Gradación común: blancos levemente cálidos (cielo protegido), curva suave con sombras apenas levantadas,
     verdes con vibrancia moderada. Lanczos a 1440 y 800 px de ancho, unsharp suave, grano fino de luminancia.
     JPG progresivo q84→80 hasta ≤ 260 KB (grande) y ≤ 110 KB (-800).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

GOLD_BGR = (0x6B, 0xA6, 0xC9)   # #C9A66B
E = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


# ---------------------------------------------------------------- máscaras
def fill_holes(m):
    ff = m.copy(); h, w = m.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    return m | cv2.bitwise_not(ff)


def core_mask(img, box, vt, st, min_area):
    x0, y0, x1, y1 = box
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = np.zeros(img.shape[:2], np.uint8)
    b = hsv[y0:y1, x0:x1]
    m[y0:y1, x0:x1] = ((b[..., 2] >= vt) & (b[..., 1] <= st)) * 255
    n, lab, stt, _ = cv2.connectedComponentsWithStats(m, 8)
    for i in range(1, n):
        if stt[i, cv2.CC_STAT_AREA] < min_area:
            m[lab == i] = 0
    return m


def text_mask(img, box, vt, st, min_area, r, shadow=(1, 1), close=0):
    m = cv2.dilate(core_mask(img, box, vt, st, min_area), E(r))
    if shadow != (0, 0):
        m |= np.roll(np.roll(m, shadow[0], 0), shadow[1], 1)
    if close:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, E(close))
    return fill_holes(m)


def outline_mask(img, box, vt, close, grow):
    """Texto blanco sobre fondo claro: se toma el contorno oscuro, se cierra y se rellena."""
    x0, y0, x1, y1 = box
    v = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)[..., 2]
    m = np.zeros(img.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = (v[y0:y1, x0:x1] < vt) * 255
    m = fill_holes(cv2.morphologyEx(m, cv2.MORPH_CLOSE, E(close)))
    return fill_holes(cv2.dilate(m, E(grow)))


def poly_mask(shape, pts):
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 255)
    return m


# ---------------------------------------------------------------- relleno por ejemplos (Criminisi)
def criminisi(img, hole, patch=9, search=70, src_ok=None):
    h = patch // 2; pad = h + 1
    I = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REFLECT)
    Hm = cv2.copyMakeBorder((hole > 0).astype(np.uint8), pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    S = np.ones_like(Hm) if src_ok is None else cv2.copyMakeBorder((src_ok > 0).astype(np.uint8), pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
    S = S & (1 - Hm)
    S[:pad] = 0; S[-pad:] = 0; S[:, :pad] = 0; S[:, -pad:] = 0
    valid = cv2.erode(S, np.ones((patch, patch), np.uint8), borderType=cv2.BORDER_CONSTANT, borderValue=0)
    Wl = cv2.cvtColor(I, cv2.COLOR_BGR2LAB).astype(np.float32)
    gray = cv2.cvtColor(I, cv2.COLOR_BGR2GRAY).astype(np.float32)
    C = (1 - Hm).astype(np.float32)
    rows, cols = Hm.shape
    k3 = np.ones((3, 3), np.uint8)
    while True:
        front = cv2.dilate(1 - Hm, k3) & Hm
        ys, xs = np.nonzero(front)
        if len(ys) == 0:
            break
        Cs = cv2.boxFilter(C, -1, (patch, patch), normalize=True, borderType=cv2.BORDER_CONSTANT)
        g = gray.copy(); g[Hm > 0] = 0
        gx = cv2.Scharr(g, cv2.CV_32F, 1, 0) / 32; gy = cv2.Scharr(g, cv2.CV_32F, 0, 1) / 32
        touch = cv2.dilate(Hm, k3) > 0
        gx[touch] = 0; gy[touch] = 0
        Hf = cv2.GaussianBlur(Hm.astype(np.float32), (5, 5), 1.0)
        nx = cv2.Sobel(Hf, cv2.CV_32F, 1, 0); ny = cv2.Sobel(Hf, cv2.CV_32F, 0, 1)
        nn = np.sqrt(nx * nx + ny * ny) + 1e-6
        gxb = cv2.boxFilter(gx, -1, (patch, patch)); gyb = cv2.boxFilter(gy, -1, (patch, patch))
        D = np.abs(-gyb[ys, xs] * nx[ys, xs] / nn[ys, xs] + gxb[ys, xs] * ny[ys, xs] / nn[ys, xs]) / 255.0 + 0.001
        i = int(np.argmax(Cs[ys, xs] * (D + 0.05)))
        cy, cx = int(ys[i]), int(xs[i])
        ty, tx = cy - h, cx - h
        T = Wl[ty:ty + patch, tx:tx + patch]
        Mk = np.repeat((1 - Hm[ty:ty + patch, tx:tx + patch]).astype(np.float32)[..., None], 3, axis=2)
        sr = search
        while True:
            sy0, sy1 = max(0, cy - sr), min(rows, cy + sr + 1)
            sx0, sx1 = max(0, cx - sr), min(cols, cx + sr + 1)
            R = np.ascontiguousarray(Wl[sy0:sy1, sx0:sx1]); MT = np.ascontiguousarray(T * Mk)
            res = cv2.matchTemplate(R * R, np.ascontiguousarray(Mk), cv2.TM_CCORR) - 2 * cv2.matchTemplate(R, MT, cv2.TM_CCORR) + float((MT * T).sum())
            vm = valid[sy0 + h:sy0 + h + res.shape[0], sx0 + h:sx0 + h + res.shape[1]]
            res = np.where(vm > 0, res, np.inf)
            if np.isfinite(res).any() or sr > max(rows, cols):
                break
            sr *= 2
        by, bx = np.unravel_index(int(np.argmin(res)), res.shape)
        py, px = sy0 + by, sx0 + bx
        fill = Hm[ty:ty + patch, tx:tx + patch] > 0
        for A in (I, Wl, gray):
            A[ty:ty + patch, tx:tx + patch][fill] = A[py:py + patch, px:px + patch][fill]
        C[ty:ty + patch, tx:tx + patch][fill] = Cs[cy, cx]
        Hm[ty:ty + patch, tx:tx + patch][fill] = 0
    return I[pad:-pad, pad:-pad]


def lf_fix(img, filled, hole, sigma=7, weight=1.0, region=None):
    """Sustituye la baja frecuencia dentro del hueco por una interpolación suave multiescala del entorno."""
    f = filled.astype(np.float32)
    small = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    hs = cv2.resize(hole, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_AREA)
    hs = (cv2.dilate(hs, np.ones((3, 3), np.uint8)) > 0).astype(np.uint8) * 255
    sm = cv2.resize(cv2.inpaint(small, hs, 5, cv2.INPAINT_TELEA), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    base = np.where((hole == 0)[..., None], img.astype(np.float32), sm)
    out = f + weight * (cv2.GaussianBlur(base, (0, 0), sigma) - cv2.GaussianBlur(f, (0, 0), sigma))
    hm = (hole > 0).astype(np.float32)
    if region is not None:
        hm *= (region > 0)
    a = np.maximum(cv2.GaussianBlur(hm, (0, 0), 2.0), hm)[..., None]
    return np.clip(f * (1 - a) + out * a, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- recetas por foto
def clean_casa(img, work):
    m = text_mask(img, (168, 410, 762, 446), 140, 90, 3, 5, (1, 1), 2)
    src = poly_mask(img.shape, [(0, 422), (921, 382), (921, 522), (0, 522)])          # solo césped, sin la vereda
    r = lf_fix(img, criminisi(img, m, 9, 70, src), m, 7, 1.0)
    return r, m


def clean_piscina(img, work):
    m = outline_mask(img, (292, 401, 630, 435), 150, 3, 3)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    water = ((hsv[..., 0] > 85) & (hsv[..., 0] < 135) & (hsv[..., 1] > 50)).astype(np.uint8) * 255
    water = cv2.dilate(cv2.morphologyEx(water, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), np.ones((13, 13), np.uint8))
    r = lf_fix(img, criminisi(img, m, 9, 80, 255 - water), m, 7, 1.0)
    return r, m


def clean_porton(img, work):
    m = text_mask(img, (335, 362, 592, 480), 160, 80, 25, 5, (2, 2), 3)
    top = int(np.nonzero(m.any(1))[0].min()) - 2
    # referencia (no se publica): relleno completo del subtítulo
    src = poly_mask(img.shape, [(0, 420), (298, 400), (318, 290), (496, 290), (500, 368), (921, 376), (921, 522), (0, 522)])
    full = lf_fix(img, criminisi(img, m, 9, 70, src), m, 9, 0.5)
    cv2.imwrite(os.path.join(work, 'porton-relleno-completo-referencia.png'), full)
    return img[:top].copy(), m


AERIAL_SKETCH = np.array([(367, 208), (575, 367), (394, 496), (333, 432), (371, 376), (263, 275)], np.int32)


def clean_aerea(img, work):
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    white = ((hsv[..., 2] >= 185) & (hsv[..., 1] <= 50)).astype(np.uint8) * 255
    hole = np.zeros((H, W), np.uint8)
    band = np.zeros((H, W), np.uint8); cv2.polylines(band, [AERIAL_SKETCH], True, 255, 22)
    line = white & band; line[352:402, 468:528] = 0                                     # sin el techo de la casa
    n, lab, st, _ = cv2.connectedComponentsWithStats(line, 8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 30:
            line[lab == i] = 0
    hole |= cv2.dilate(line, E(3))
    captions = ((606, 258, 690, 316), (578, 186, 806, 256), (280, 398, 632, 466))     # flecha y dos rótulos
    for (x0, y0, x1, y1) in captions:
        sub = np.zeros((H, W), np.uint8); sub[y0:y1, x0:x1] = white[y0:y1, x0:x1]
        sub = cv2.dilate(sub, E(4)); sub |= np.roll(np.roll(sub, 1, 0), 1, 1)
        hole |= sub
    for (x0, y0, x1, y1) in ((0, 137, 104, 152), (434, 66, 548, 83)):                 # etiquetas de Google Maps
        cv2.rectangle(hole, (x0, y0), (x1, y1), 255, -1)
    for (cx, cy, r) in ((47, 159, 10), (490, 56, 11)):                                  # pines de Google Maps
        cv2.circle(hole, (cx, cy), r, 255, -1)
    hole = cv2.morphologyEx(hole, cv2.MORPH_CLOSE, E(2))
    pale = ((hsv[..., 2] >= 170) & (hsv[..., 1] <= 60)).astype(np.uint8) * 255         # techos y estructuras claras
    src = 255 - cv2.dilate(pale, np.ones((7, 7), np.uint8))
    r = criminisi(img, hole, 9, 60, src)
    field = np.zeros((H, W), np.uint8); field[180:262, 570:812] = 255                  # campo bajo «A 5 min…»
    r = lf_fix(img, r, hole, 6, 0.7, field)
    return r, hole


# ---------------------------------------------------------------- gradación y acabado
def grade(bgr, exposure=1.0, gamma=1.0, warm=1.0, green=1.10, lift=0.035, contrast=0.12):
    x = bgr.astype(np.float32) / 255.0
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    Hh, S = hsv[..., 0], hsv[..., 1] / 255.0
    x = np.clip(x * exposure, 0, 1) ** gamma
    Y = 0.2126 * x[..., 2] + 0.7152 * x[..., 1] + 0.0722 * x[..., 0]
    sky = np.clip((S - 0.12) / 0.2, 0, 1) * ((Hh > 92) & (Hh < 130))                  # el azul no vira
    w = (0.35 + 0.65 * Y) * (1 - sky) * warm
    x[..., 2] *= 1 + 0.028 * w; x[..., 1] *= 1 + 0.006 * w; x[..., 0] *= 1 - 0.03 * w
    s = 1 / (1 + np.exp(-(x - 0.5) * 6)); s = (s - s.min()) / (s.max() - s.min() + 1e-6)
    x = x * (1 - contrast) + s * contrast
    x = np.clip(x + lift * (1 - x) ** 4, 0, 1)
    hsv = cv2.cvtColor((x * 255 + 0.5).astype(np.uint8), cv2.COLOR_BGR2HSV).astype(np.float32)
    h, sat = hsv[..., 0], hsv[..., 1] / 255.0
    gw = np.clip(1 - np.abs(h - 52) / 30, 0, 1)
    hsv[..., 1] = np.clip(sat + (green - 1) * gw * sat * (1 - sat) * 2.2, 0, 1) * 255
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def finish(bgr, width, grain=1.5, seed=7, sharpen=(1.1, 38, 2)):
    im = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    height = round(im.height * width / im.width)
    im = im.resize((width, height), Image.LANCZOS)
    im = im.filter(ImageFilter.UnsharpMask(radius=sharpen[0], percent=sharpen[1], threshold=sharpen[2]))
    a = np.asarray(im).astype(np.float32)
    if grain:
        g = np.random.RandomState(seed).normal(0, 1, a.shape[:2]).astype(np.float32)
        g = cv2.GaussianBlur(g, (0, 0), 0.6); g /= g.std() + 1e-6
        Y = a.mean(2, keepdims=True) / 255.0
        a = a + g[..., None] * grain * (0.5 + 2.0 * Y * (1 - Y))
    return np.clip(a + 0.5, 0, 255).astype(np.uint8)                                   # RGB


def draw_boundary(rgb, verts, line_px):
    """Límite medido: halo oscuro suave + brillo dorado + trazo #C9A66B, relleno al 8 %. Supermuestreo 4×."""
    Hh, Ww = rgb.shape[:2]
    k = 4
    P = np.round((np.array(verts, float) * k + (k - 1) / 2) * 16).astype(np.int32)       # centros de píxel; 4 bits de subpíxel
    def layer(thick, fill=False):
        m = np.zeros((Hh * k, Ww * k), np.uint8)
        if fill:
            cv2.fillPoly(m, [P], 255, cv2.LINE_AA, 4)
        else:
            cv2.polylines(m, [P], True, 255, max(1, int(round(thick * k))), cv2.LINE_AA, 4)
        return cv2.resize(m, (Ww, Hh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    out = rgb.astype(np.float32)
    gold = np.array(GOLD_BGR[::-1], np.float32)
    s = line_px / 3.0
    fill = layer(0, True) * 0.08
    out = out * (1 - fill[..., None]) + gold * fill[..., None]
    shadow = cv2.GaussianBlur(layer(line_px * 2.6), (0, 0), 2.6 * s) * 0.42
    out = out * (1 - shadow[..., None])
    glow = cv2.GaussianBlur(layer(line_px * 1.8), (0, 0), 2.2 * s) * 0.38
    out = out * (1 - glow[..., None]) + gold * glow[..., None]
    stroke = layer(line_px)
    out = out * (1 - stroke[..., None]) + gold * stroke[..., None]
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def save_jpeg(rgb, path, max_kb, chroma=(2,)):
    im = Image.fromarray(rgb)
    last = None
    for sub in chroma:
        for q in range(84, 79, -1):
            im.save(path, 'JPEG', quality=q, optimize=True, progressive=True, subsampling=sub)
            size = os.path.getsize(path)
            last = (q, sub, size)
            if size <= max_kb * 1024:
                return {'q': q, 'croma': '4:4:4' if sub == 0 else '4:2:0', 'kb': round(size / 1024, 1), 'ok': True, 'size': im.size}
    return {'q': last[0], 'croma': '4:4:4' if last[1] == 0 else '4:2:0', 'kb': round(last[2] / 1024, 1), 'ok': False, 'size': im.size}


RECIPES = {
    'porton': (clean_porton, dict(), 'trianon-foto-porton'),
    'casa': (clean_casa, dict(), 'trianon-foto-casa'),
    'piscina': (clean_piscina, dict(exposure=0.985), 'trianon-foto-piscina'),
    'aerea': (clean_aerea, dict(exposure=1.08, gamma=0.86, lift=0.03, green=1.06, contrast=0.14), 'trianon-aerea'),
}


def main():
    if len(sys.argv) < 5:
        print(__doc__); sys.exit(1)
    raw, work, assets, align = sys.argv[1:5]
    names = sys.argv[5:] or list(RECIPES)
    os.makedirs(work, exist_ok=True); os.makedirs(assets, exist_ok=True)
    report = {}
    for name in names:
        fn, gp, out = RECIPES[name]
        img = cv2.imread(os.path.join(raw, f'{name}.png'))
        assert img is not None and img.shape[:2] == (522, 921), f'{name}: se espera un cuadro de 921×522'
        clean, mask = fn(img, work)
        cv2.imwrite(os.path.join(work, f'{name}-mascara.png'), mask)
        cv2.imwrite(os.path.join(work, f'{name}-limpia.png'), clean)
        graded = grade(clean, **gp)
        cv2.imwrite(os.path.join(work, f'{name}-limpia-graduada.png'), graded)
        info = {'recorte_px': [int(clean.shape[1]), int(clean.shape[0])]}
        for width, max_kb, suffix, grain in ((1440, 260, '', 1.5), (800, 110, '-800', 1.1)):
            rgb = finish(graded, width, grain=grain)
            chroma = (2,)
            if name == 'aerea':
                A = json.load(open(align, encoding='utf-8'))
                key = f'{rgb.shape[1]}x{rgb.shape[0]}'
                verts = A['vertices_px'][key]
                rgb = draw_boundary(rgb, verts, 3.0 * width / 1440)
                Image.fromarray(rgb).save(os.path.join(work, f'aerea-con-limite-{width}.png'))
                chroma = (0, 2)
            info[f'{width}'] = save_jpeg(rgb, os.path.join(assets, f'{out}{suffix}.jpg'), max_kb, chroma)
        report[name] = info
        print(name, json.dumps(info, ensure_ascii=False))
    json.dump(report, open(os.path.join(work, 'photo-clean-report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
