"""Fotos reales de Le Petit Trianon: cuadros del video original, limpieza de subtítulos y rótulos, gradación común
y exportación web. También expone la gradación para la película del hero (ver «Reutilizar la gradación»).

Uso:
  python photo-clean.py <parte1.mov> <carpeta raw> <carpeta de trabajo> <carpeta assets> <data.js> [escena ...]
                        [--mensura hoja-satelital.jpg]   (opcional: control independiente del ajuste de la aérea)
    <parte1.mov>         video de la publicación anterior (960×544, 30 fps)
    <carpeta raw>        capturas de respaldo: piscina.png (921×522); la piscina no está en la parte 1 del video
    <carpeta de trabajo> cuadros extraídos, máscaras, maestros PNG e intermedios (no van al repo)
    <carpeta assets>     destino de los JPG del sitio (assets/ del repo)
    <data.js>            le-petit-trianon/maqueta/data.js (polígono medido, para alinear la aérea)
    [escena ...]         opcional: casa porton parque piscina aerea (por defecto, las cinco)
  Salidas: assets/trianon-foto-{casa,porton,parque,piscina}.jpg y -800.jpg, assets/trianon-aerea.jpg y -800.jpg;
  en la carpeta de trabajo: aerea-clean.png (1280×725, graduada, sin límite dorado ni grano) y aerial-align.json
  (lo escribe aerial-align.py, que este script invoca), más los maestros *-limpia.png de cada escena.

Requiere Python 3 con opencv-contrib-python-headless (cv2 con xphoto, ximgproc y SIFT), numpy y Pillow, y ffmpeg
en el PATH. Determinista (grano con semilla fija).

Método por escena (cuadros del video, numerados desde 0 a 30 fps)
  casa     cuadro 4 (0,13 s), el más nítido de los dos sin subtítulo (0–2 son la portada con otro rótulo; desde el 5
           aparece «COMPLEJO LE PETIT TRIANON…»). Reducción de ruido temporal: los cuadros 3 y 5–30 se registran sobre
           el 4 (homografía SIFT + flujo óptico DIS) y se promedian con pesos robustos (solo donde coinciden con la
           referencia); en la caja del subtítulo solo cuentan los cuadros 3 y 4. Sin relleno inventado.
  porton   cuadro 114 (3,80 s), el más nítido con el portón centrado y sin destello fuerte; promedio robusto de los
           cuadros 104–122 registrados igual. El tramo 3,1–4,1 s no tiene subtítulos.
  parque   cuadro 332 (11,07 s): mejor composición (palmera, césped, cielo azul); los vecinos alternan desenfoque de
           movimiento. Se atenúa la estela vertical de destello (exceso positivo coherente en vertical dentro de su
           banda) y se quita «Y proyecto para 6 casas más!!»: máscara de letras + borde + sombra + sangrado de croma
           (dilatación 7 px), relleno Shift-Map (xphoto) y corrección de baja frecuencia con el entorno. Se compararon
           Criminisi, FSR rápido/óptimo, cv2.inpaint y un plato temporal sobre el plano del suelo (pocas coincidencias
           en la tierra movida): Shift-Map es el único sin bordes ni manchas a 100 %.
  piscina  captura raw/piscina.png (la parte 2 del video no se pudo descargar). El subtítulo cruza la losa clara, el
           borde de la piscina y dos juntas: ningún relleno quedó limpio, así que se recorta por encima del subtítulo
           (921×396, 2,33:1); la piscina y el jacuzzi quedan completos.
  aerea    plato limpio por fusión temporal de los cuadros 490–671 de la vista de Google Earth, registrados con
           homografías SIFT sobre la referencia (cuadro 520: norte-arriba, antes de que la cámara empiece a girar).
           El contorno blanco y las etiquetas de Google Maps están pegados al mapa; los rótulos y la flecha, a la
           pantalla. Cada píxel se toma de los cuadros donde no está tapado (el suelo bajo el contorno, de los cuadros
           anteriores a que se dibuje; bajo los rótulos, de los cuadros en que el mapa se movió), con peso según la
           nitidez del cuadro; donde ningún cuadro lo muestra (las etiquetas y pines con nombres de vecinos, el centro
           de la flecha) se rellena por ejemplos (Criminisi). La franja bajo «Ideal para…» sale de los cuadros del
           acercamiento, más blandos: se le transfiere detalle por ejemplos (cada parche borroso se compara con parches
           nítidos del entorno desenfocados igual y se suma su alta frecuencia). El resto se promedia con los cuadros
           536–566 (menos bloques de compresión). Luego aerial-align.py ajusta el polígono medido a la línea blanca
           original y se dibuja el límite en oro #C9A66B (3 px a 1280, halo suave, relleno al 8 %).

Gradación común (grade + finish): blancos levemente cálidos (el cielo azul se protege), curva suave con sombras
apenas levantadas, verdes con vibrancia moderada; reducción de ruido NL-means baja antes de graduar; Lanczos a 1280
y 800 px de ancho, máscara de enfoque suave y grano de luminancia finísimo. JPG progresivo q84→80 hasta ≤ 230 KB
(grande) y ≤ 110 KB (-800).

Reutilizar la gradación (p. ej. desde el script de la película):
  import importlib.util
  spec = importlib.util.spec_from_file_location('photo_clean', 'tools/maqueta/photo-clean.py')
  pc = importlib.util.module_from_spec(spec); spec.loader.exec_module(pc)
  out = pc.grade_frame(bgr, 'casa')          # BGR uint8 → BGR uint8, misma gradación que la foto de esa escena
  # o: pc.grade(pc.denoise(bgr, 2), **pc.PRESETS['casa'])  ·  pc.finish(...) para escalar + enfoque + grano
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageFilter

GOLD_BGR = (0x6B, 0xA6, 0xC9)   # #C9A66B
E = lambda r: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
OUT_W = (1280, 800)
FRAMES = {
    'casa': [3, 4] + list(range(5, 31)),
    'porton': list(range(104, 123)),
    'parque': [332],
    'aerea': list(range(488, 676)),
}


# ---------------------------------------------------------------- cuadros
def extract_frames(video, frames, folder):
    """Extrae cuadros por índice (n desde 0) a <folder>/NNNN.png con ffmpeg; reutiliza los ya extraídos."""
    os.makedirs(folder, exist_ok=True)
    need = sorted(i for i in set(frames) if not os.path.exists(os.path.join(folder, '%04d.png' % i)))
    if not need:
        return
    tmp = os.path.join(folder, '_tmp'); os.makedirs(tmp, exist_ok=True)
    sel = '+'.join('eq(n\\,%d)' % i for i in need)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', "select='%s'" % sel, '-vsync', '0',
                    os.path.join(tmp, '%05d.png')], check=True)
    got = sorted(os.listdir(tmp))
    assert len(got) == len(need), f'ffmpeg devolvió {len(got)} cuadros, se esperaban {len(need)}'
    for i, g in zip(need, got):
        os.replace(os.path.join(tmp, g), os.path.join(folder, '%04d.png' % i))
    os.rmdir(tmp)


class Frames:
    def __init__(self, folder):
        self.folder = folder; self.cache = {}

    def __call__(self, i):
        if i not in self.cache:
            im = cv2.imread(os.path.join(self.folder, '%04d.png' % i))
            assert im is not None, f'falta el cuadro {i}'
            self.cache[i] = im
        return self.cache[i]


# ---------------------------------------------------------------- utilidades de máscara
def fill_holes(m):
    ff = m.copy(); h, w = m.shape
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    return m | cv2.bitwise_not(ff)


def white(img, v=185, s=70):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    return (((hsv[..., 2] >= v) & (hsv[..., 1] <= s)) * 255).astype(np.uint8)


def drop_small(m, area):
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] < area:
            m[lab == j] = 0
    return m


# ---------------------------------------------------------------- relleno por ejemplos (Criminisi 2004)
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


def lf_fix(img, filled, hole, sigma=7, weight=1.0):
    """Sustituye la baja frecuencia dentro del hueco por una interpolación suave multiescala del entorno."""
    f = filled.astype(np.float32)
    small = cv2.resize(img, None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
    hs = cv2.resize(hole, (small.shape[1], small.shape[0]), interpolation=cv2.INTER_AREA)
    hs = (cv2.dilate(hs, np.ones((3, 3), np.uint8)) > 0).astype(np.uint8) * 255
    sm = cv2.resize(cv2.inpaint(small, hs, 5, cv2.INPAINT_TELEA), (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    base = np.where((hole == 0)[..., None], img.astype(np.float32), sm)
    out = f + weight * (cv2.GaussianBlur(base, (0, 0), sigma) - cv2.GaussianBlur(f, (0, 0), sigma))
    hm = (hole > 0).astype(np.float32)
    a = np.maximum(cv2.GaussianBlur(hm, (0, 0), 2.0), hm)[..., None]
    return np.clip(f * (1 - a) + out * a, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- registro y fusión temporal
_SIFT = None


def homography(src, dst, mask_src=None, mask_dst=None, ratio=0.75, thr=2.0):
    global _SIFT
    if _SIFT is None:
        _SIFT = cv2.SIFT_create(6000)
    ka, da = _SIFT.detectAndCompute(cv2.cvtColor(src, cv2.COLOR_BGR2GRAY), mask_src)
    kb, db = _SIFT.detectAndCompute(cv2.cvtColor(dst, cv2.COLOR_BGR2GRAY), mask_dst)
    m = [x for x, y in cv2.BFMatcher().knnMatch(da, db, k=2) if x.distance < ratio * y.distance]
    if len(m) < 12:
        return None, 0
    s = np.float32([ka[x.queryIdx].pt for x in m]); d = np.float32([kb[x.trainIdx].pt for x in m])
    h, inl = cv2.findHomography(s, d, cv2.RANSAC, thr)
    return h, int(inl.sum()) if inl is not None else 0


def align_to(ref, img, mask=None):
    """Homografía SIFT + flujo óptico DIS residual; devuelve el cuadro alineado y su máscara de cobertura."""
    Hh, W = ref.shape[:2]
    h, _ = homography(img, ref, mask, mask)
    w = cv2.warpPerspective(img, h, (W, Hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    inside = cv2.warpPerspective(np.full((Hh, W), 255, np.uint8), h, (W, Hh), flags=cv2.INTER_NEAREST)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    f = dis.calc(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY), cv2.cvtColor(w, cv2.COLOR_BGR2GRAY), None)
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(Hh, dtype=np.float32))
    w = cv2.remap(w, gx + f[..., 0], gy + f[..., 1], cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    inside = cv2.remap(inside, gx + f[..., 0], gy + f[..., 1], cv2.INTER_NEAREST)
    return w, inside


def robust_merge(ref, frames, valids, sigma=5.0, sig_pre=1.2):
    """Promedio temporal con pesos robustos: cada cuadro cuenta solo donde coincide con la referencia."""
    R = ref.astype(np.float32); acc = R.copy(); wacc = np.ones(ref.shape[:2], np.float32)
    Rb = cv2.GaussianBlur(R, (0, 0), sig_pre)
    for f, v in zip(frames, valids):
        F = f.astype(np.float32)
        d = cv2.GaussianBlur(F, (0, 0), sig_pre) - Rb
        d2 = cv2.GaussianBlur((d * d).sum(2) / 3, (0, 0), 1.5)
        w = np.exp(-d2 / (2 * sigma * sigma)) * v
        acc += F * w[..., None]; wacc += w
    return np.clip(acc / wacc[..., None] + 0.5, 0, 255).astype(np.uint8)


def deflare_streak(img, x0, x1, y1, sy=30, sx=2.0, amount=0.85, pad=10):
    """Estela vertical de destello: exceso positivo, acromático y coherente en vertical dentro de la banda [x0, x1)."""
    f = img.astype(np.float32)
    Hh, W = f.shape[:2]
    xa, xb = max(0, x0 - pad), min(W, x1 + pad)
    sub = f[:, xa:xb]
    L = cv2.GaussianBlur(sub, (0, 0), sigmaX=0.1, sigmaY=sy)
    left = L[:, :pad].mean(1); right = L[:, -pad:].mean(1)
    t = np.linspace(0, 1, sub.shape[1])[None, :, None]
    base = left[:, None, :] * (1 - t) + right[:, None, :] * t
    exc = cv2.GaussianBlur(L - base, (0, 0), sigmaX=sx, sigmaY=4)
    exc = np.clip(exc.min(2, keepdims=True), 0, None)
    wy = np.clip((y1 - np.arange(Hh)) / 40.0, 0, 1)[:, None, None]
    wx = np.ones((1, sub.shape[1], 1), np.float32)
    wx[:, :pad] = np.linspace(0, 1, pad)[None, :, None]; wx[:, -pad:] = np.linspace(1, 0, pad)[None, :, None]
    out = f.copy(); out[:, xa:xb] = sub - amount * exc * wy * wx
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- escenas
def scene_casa(fr, raw, work):
    ref = fr(4); Hh, W = ref.shape[:2]
    box = (300, 380, 680, 544)                                   # caja del subtítulo (aparece desde el cuadro 5)
    mask = np.full((Hh, W), 255, np.uint8); mask[box[1]:box[3], box[0]:box[2]] = 0
    frames, valids = [], []
    for i in [3] + list(range(5, 31)):
        w, inside = align_to(ref, fr(i), mask)
        v = (inside > 0).astype(np.float32)
        if i >= 5:
            v[box[1]:box[3], box[0]:box[2]] = 0
        frames.append(w); valids.append(v)
    out = robust_merge(ref, frames, valids, 5.0)
    spot = np.zeros((Hh, W), np.uint8); cv2.circle(spot, (358, 88), 5, 255, -1)   # mota oscura en el cielo (polvo/pájaro)
    return cv2.inpaint(out, spot, 4, cv2.INPAINT_TELEA), spot


def scene_porton(fr, raw, work):
    ref = fr(114)
    frames, valids = [], []
    for i in FRAMES['porton']:
        if i == 114:
            continue
        w, inside = align_to(ref, fr(i))
        frames.append(w); valids.append((inside > 0).astype(np.float32))
    return robust_merge(ref, frames, valids, 5.0), None


def scene_parque(fr, raw, work):
    img = deflare_streak(fr(332), 548, 612, 300)
    Hh, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    core = np.zeros((Hh, W), np.uint8); y0, y1, x0, x1 = 420, 475, 285, 675
    core[y0:y1, x0:x1] = ((hsv[y0:y1, x0:x1, 2] >= 190) & (hsv[y0:y1, x0:x1, 1] <= 70)) * 255
    core = drop_small(core, 4)
    m = cv2.dilate(core, E(7)); m |= np.roll(np.roll(m, 2, 0), 2, 1)
    m = fill_holes(cv2.morphologyEx(m, cv2.MORPH_CLOSE, E(4)))
    bx0, by0, bx1, by1 = 150, 300, 800, Hh
    sub = img[by0:by1, bx0:bx1]; ms = m[by0:by1, bx0:bx1]
    dst = np.zeros_like(sub)
    cv2.xphoto.inpaint(cv2.cvtColor(sub, cv2.COLOR_BGR2Lab), 255 - ms, dst, cv2.xphoto.INPAINT_SHIFTMAP)
    dst = cv2.cvtColor(dst, cv2.COLOR_Lab2BGR)
    out = img.copy(); out[by0:by1, bx0:bx1] = np.where((ms > 0)[..., None], dst, sub)
    return lf_fix(img, out, m, 6, 1.0), m


def scene_piscina(fr, raw, work):
    img = cv2.imread(os.path.join(raw, 'piscina.png'))
    assert img is not None and img.shape[:2] == (522, 921), 'piscina.png: se espera 921×522'
    return img[:396].copy(), None                               # el subtítulo empieza en y = 401


# ---------------------------------------------------------------- aérea: plato limpio por fusión temporal
AER_REF_LINE = 550        # cuadro de la captura raw/aerea.png (contorno completo)
AER_GEOM = 520            # referencia geométrica: norte-arriba, antes del giro de cámara
AER_RECTS = {'ideal': (280, 412, 680, 485), 'a5min': (590, 180, 850, 268), 'arrow': (610, 245, 740, 350)}
AER_APPEAR = {'ideal': 498, 'a5min': 505, 'arrow': 486}
AER_LINE_ON = 514         # primer cuadro con contorno
AER_SKETCH = ([(383, 217), (600, 383), (411, 517), (347, 450), (387, 392), (274, 287)], 34,    # boceto del contorno
              [(598, 382), (431, 507), (342, 440), (409, 390), (276, 290), (376, 215)], 44)   # en el cuadro 550
AER_CORNERS_921 = [(574.0, 366.4), (413.7, 486.1), (328.3, 422.1), (392.4, 374.2), (264.4, 278.1), (360.6, 206.3)]


def scene_aerea(fr, raw, work):
    Hh, W = fr(AER_REF_LINE).shape[:2]
    # 1. homografías de cada cuadro al 550 (rasgos fuera de los rótulos y de lo blanco)
    def fmask(img):
        m = 255 - cv2.dilate(white(img, 190, 60), np.ones((15, 15), np.uint8))
        for (x0, y0, x1, y1) in ((590, 180, 850, 345), (280, 405, 680, 485)):
            m[y0:y1, x0:x1] = 0
        return m
    HR = {AER_REF_LINE: np.eye(3)}
    order = list(range(AER_REF_LINE - 1, 487, -1)) + list(range(AER_REF_LINE + 1, 676))
    for i in order:
        h, n = homography(fr(i), fr(AER_REF_LINE), fmask(fr(i)), fmask(fr(AER_REF_LINE)), thr=1.5)
        nb = i + 1 if i < AER_REF_LINE else i - 1
        if n < 150:
            h2, n2 = homography(fr(i), fr(nb), fmask(fr(i)), fmask(fr(nb)), thr=1.5)
            if h2 is not None and n2 > n:
                h = HR[nb] @ h2
        HR[i] = h
    to_ref = np.linalg.inv(HR[AER_GEOM])                         # coordenadas del 550 → referencia (520)
    HG = {i: to_ref @ HR[i] for i in HR}
    warpG = lambda m, i, interp=cv2.INTER_NEAREST: cv2.warpPerspective(m, HG[i], (W, Hh), flags=interp)
    # 2. rótulos y flecha fijos en pantalla (presentes en casi todos los cuadros tardíos), con borde, sombra y halo
    late = list(range(560, 670, 4)); acc = np.zeros((Hh, W), np.float32)
    for i in late:
        acc += white(fr(i)) / 255.0
    acc /= len(late)
    acc2 = np.zeros((Hh, W), np.float32); every = list(range(488, 672, 3))
    for i in every:
        acc2 += white(fr(i)) / 255.0
    acc2 /= len(every)
    scr = {}
    for k, (x0, y0, x1, y1) in AER_RECTS.items():
        a, thr = (acc2, 0.2) if k == 'arrow' else (acc, 0.85)   # la flecha se anima
        m = np.zeros((Hh, W), np.uint8); m[y0:y1, x0:x1] = (a[y0:y1, x0:x1] >= thr) * 255
        m = drop_small(m, 8 if k == 'arrow' else 4)
        m = cv2.dilate(m, E(4)); m |= np.roll(np.roll(m, 2, 0), 2, 1)
        scr[k] = cv2.dilate(cv2.morphologyEx(m, cv2.MORPH_CLOSE, E(3)), E(5))   # +5 px: halo de la sombra
    scrbig = {k: cv2.dilate(v, E(2)) for k, v in scr.items()}

    def screen_overlay(i):
        ov = np.zeros((Hh, W), np.uint8)
        for k, a in AER_APPEAR.items():
            if i >= a:
                if i < a + 15:                                   # entrada animada: toda la caja
                    x0, y0, x1, y1 = AER_RECTS[k]; ov[y0:y1, x0:x1] = 255
                ov |= scrbig[k]
        return ov
    # 3. contorno blanco (pegado al mapa): unión de lo visto en todos los cuadros con contorno, en la referencia
    bandR = np.zeros((Hh, W), np.uint8)
    cv2.polylines(bandR, [np.array(AER_SKETCH[0], np.int32)], True, 255, AER_SKETCH[1])
    cv2.polylines(bandR, [np.array(AER_SKETCH[2], np.int32)], True, 255, AER_SKETCH[3])
    band = cv2.warpPerspective(bandR, to_ref, (W, Hh), flags=cv2.INTER_NEAREST)
    lineU = np.zeros((Hh, W), np.uint8); seen = np.zeros((Hh, W), np.uint8)
    for i in range(AER_LINE_ON, 668):
        ov = screen_overlay(i)
        w = white(fr(i)); w[ov > 0] = 0
        lineU |= warpG(w, i) & band
        if i >= 550:
            seen |= warpG(255 - ov, i) & band
    lineU = drop_small(lineU, 25)
    cv2.imwrite(os.path.join(work, 'aerea-linea.png'), lineU)
    cv2.imwrite(os.path.join(work, 'aerea-linea-visible.png'), seen)
    line = cv2.morphologyEx(cv2.dilate(lineU, E(3)), cv2.MORPH_CLOSE, E(3))
    # 4. etiquetas y pines de Google Maps con nombres de vecinos (pegados al mapa; en el 550)
    img550 = fr(AER_REF_LINE); hsv = cv2.cvtColor(img550, cv2.COLOR_BGR2HSV)
    labR = np.zeros((Hh, W), np.uint8)
    for (x0, y0, x1, y1) in ((450, 66, 575, 87), (0, 139, 110, 160)):
        t = np.zeros((Hh, W), np.uint8)
        t[y0:y1, x0:x1] = ((hsv[y0:y1, x0:x1, 2] >= 150) & (hsv[y0:y1, x0:x1, 1] <= 70)) * 255
        labR |= cv2.dilate(t, E(3))
    for (cx, cy, r) in ((510, 57, 10), (49, 166, 10)):
        cv2.circle(labR, (cx, cy), r, 255, -1); cv2.ellipse(labR, (cx, cy + 8), (5, 6), 0, 0, 360, 255, -1)
    lab = cv2.warpPerspective(labR, to_ref, (W, Hh), flags=cv2.INTER_NEAREST)
    hole = cv2.warpPerspective(scr['ideal'] | scr['a5min'] | scr['arrow'], HG[AER_REF_LINE], (W, Hh), flags=cv2.INTER_NEAREST) | line | lab
    # 5. fusión: pesos por nitidez (^8) con validez suavizada; promedio llano 536–566 fuera de los huecos
    num = np.zeros((Hh, W, 3)); den = np.zeros((Hh, W)); smap = np.zeros((Hh, W))
    numD = np.zeros((Hh, W, 3)); denD = np.zeros((Hh, W))
    for i in range(490, 672):
        wi = cv2.warpPerspective(fr(i), HG[i], (W, Hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        inside = warpG(np.full((Hh, W), 255, np.uint8), i)
        bad = cv2.dilate(warpG(screen_overlay(i), i), E(1)) | lab | (255 - cv2.erode(inside, E(3)))
        if i >= AER_LINE_ON:
            bad |= line
        valid = (bad == 0).astype(np.float32)
        g = cv2.cvtColor(wi, cv2.COLOR_BGR2GRAY).astype(np.float32)
        lap = cv2.Laplacian(cv2.resize(g, None, fx=.5, fy=.5, interpolation=cv2.INTER_AREA), cv2.CV_32F)
        vm = cv2.resize(valid, (lap.shape[1], lap.shape[0])) > 0.99
        s = float(lap[vm].var())
        soft = cv2.GaussianBlur(valid, (0, 0), 4) * valid
        w = np.exp(8 * np.log(s / 1800.0) + 40)
        num += wi * (w * soft)[..., None]; den += w * soft; smap += w * soft * s
        if 536 <= i <= 566:
            numD += wi * valid[..., None]; denD += valid
    fill = num / np.where(den > 0, den, 1)[..., None]
    dn = numD / np.where(denD > 0, denD, 1)[..., None]
    out = np.clip(np.where(((hole > 0) | (denD < 3))[..., None], fill, dn) + 0.5, 0, 255).astype(np.uint8)
    eff = smap / np.where(den > 0, den, 1)
    miss = (den <= 0).astype(np.uint8) * 255
    # 6. lo que ningún cuadro muestra (etiquetas, pines, centro de la flecha): relleno por ejemplos
    m2 = cv2.dilate(miss, E(2))
    out = criminisi(out, m2, 9, 60, 255 - cv2.dilate(hole, E(4)))
    # 7. detalle por ejemplos en la franja blanda (bajo «Ideal para…», de los cuadros del acercamiento)
    out = detail_transfer(out, hole, eff, m2)
    # referencia original (con contorno) en la misma geometría, para el ajuste y la depuración
    cv2.imwrite(os.path.join(work, 'aerea-referencia-original.png'),
                cv2.warpPerspective(img550, HG[AER_REF_LINE], (W, Hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT))
    cA = np.array([[(x + 0.5) * 960 / 921 - 0.5, (y + 0.5) * 544 / 522 - 0.5, 1] for x, y in AER_CORNERS_921]) @ HG[AER_REF_LINE].T
    sizes = [(w_, round(Hh * w_ / W)) for w_ in OUT_W]
    json.dump({
        'referencia': f'cuadro {AER_GEOM} del video (norte-arriba), {W}×{Hh}',
        'H_ref_a_cuadro550': np.linalg.inv(HG[AER_REF_LINE]).tolist(),
        'rotacion_cuadro550_deg': round(float(np.degrees(np.arctan2(HG[AER_REF_LINE][1, 0], HG[AER_REF_LINE][0, 0]))), 3),
        'esquinas_aprox_ref': (cA[:, :2] / cA[:, 2:]).round(2).tolist(),
        'tamanos_salida': sizes,
        'imagen_limpia': {'archivo': 'aerea-clean.png', 'tamano': list(sizes[0]),
                          'nota': 'graduada, sin límite dorado, sin textos, sin grano'},
    }, open(os.path.join(work, 'aerea-geometria.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return out, hole


def detail_transfer(img, hole, eff, skip, p=9, S=56, step=3, gain=0.9):
    Hh, W = hole.shape
    ref = float(np.median(eff[(hole == 0) & (eff > 0)]))
    soft = ((hole > 0) & (eff < 0.75 * ref)).astype(np.uint8) * 255
    soft[skip > 0] = 0
    ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb).astype(np.float32)
    Y = ycc[..., 0]
    Bl = [cv2.GaussianBlur(Y, (0, 0), s) for s in (0.8, 1.3, 1.9, 2.6)]
    HF = [Y - b for b in Bl]
    validpos = cv2.erode((cv2.dilate(hole, E(6)) == 0).astype(np.uint8), np.ones((p, p), np.uint8))
    h = p // 2
    acc = np.zeros((Hh, W), np.float32); wacc = np.zeros((Hh, W), np.float32)
    g = cv2.getGaussianKernel(p, 2.5); gw = (g @ g.T).astype(np.float32)
    ys, xs = np.nonzero(soft)
    for (y, x) in sorted({(int(y) // step * step, int(x) // step * step) for y, x in zip(ys, xs)}):
        if y < h or x < h or y >= Hh - h or x >= W - h:
            continue
        T = np.ascontiguousarray(Y[y - h:y + h + 1, x - h:x + h + 1])
        y0, y1, x0, x1 = max(0, y - S), min(Hh, y + S + 1), max(0, x - S), min(W, x + S + 1)
        vm = validpos[y0 + h:y1 - h, x0 + h:x1 - h]
        if vm.sum() == 0:
            continue
        best = (np.inf, None, None)
        for k, B in enumerate(Bl):
            r = cv2.matchTemplate(np.ascontiguousarray(B[y0:y1, x0:x1]), T, cv2.TM_SQDIFF)
            r = np.where(vm > 0, r, np.inf); j = int(np.argmin(r))
            if r.flat[j] < best[0]:
                best = (r.flat[j], k, np.unravel_index(j, r.shape))
        _, k, (by, bx) = best
        sy, sx = y0 + by, x0 + bx
        acc[y - h:y + h + 1, x - h:x + h + 1] += HF[k][sy:sy + p, sx:sx + p] * gw
        wacc[y - h:y + h + 1, x - h:x + h + 1] += gw
    hf = acc / np.maximum(wacc, 1e-6)
    a = np.maximum(cv2.GaussianBlur(soft.astype(np.float32) / 255, (0, 0), 3), soft / 255.0) * (wacc > 0)
    ycc[..., 0] = Y + gain * hf * a
    return cv2.cvtColor(np.clip(ycc + 0.5, 0, 255).astype(np.uint8), cv2.COLOR_YCrCb2BGR)


# ---------------------------------------------------------------- gradación y acabado (reutilizable)
PRESETS = {
    'casa':    dict(exposure=1.0, gamma=1.0, warm=1.0, green=1.10, lift=0.035, contrast=0.12),
    'porton':  dict(exposure=1.05, gamma=0.95, warm=1.0, green=1.10, lift=0.045, contrast=0.12),
    'parque':  dict(exposure=1.0, gamma=0.97, warm=0.5, green=1.08, lift=0.04, contrast=0.13),
    'piscina': dict(exposure=0.985, gamma=1.0, warm=1.0, green=1.10, lift=0.035, contrast=0.12),
    'aerea':   dict(exposure=1.08, gamma=0.86, warm=1.0, green=1.06, lift=0.03, contrast=0.14),
}
DENOISE = {'casa': 2, 'porton': 2, 'parque': 2, 'piscina': 1, 'aerea': 2}


def denoise(bgr, h=2):
    """NL-means suave (bloques de compresión y ruido de croma); h=0 no hace nada."""
    if not h:
        return bgr
    return cv2.fastNlMeansDenoisingColored(bgr, None, h, h + 1, 7, 21)


def grade(bgr, exposure=1.0, gamma=1.0, warm=1.0, green=1.10, lift=0.035, contrast=0.12):
    """Gradación común: blancos levemente cálidos (cielo protegido), curva suave, sombras apenas levantadas, verdes vivos."""
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


def grade_frame(bgr, scene='casa', den=None):
    """Atajo para la película: NL-means suave + gradación de la escena. BGR uint8 → BGR uint8 (mismo tamaño)."""
    return grade(denoise(bgr, DENOISE[scene] if den is None else den), **PRESETS[scene])


def finish(bgr, width, grain=1.4, seed=7, sharpen=(1.1, 38, 2)):
    """Lanczos al ancho pedido, máscara de enfoque suave y grano de luminancia finísimo. BGR → RGB uint8."""
    im = Image.fromarray(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    height = round(im.height * width / im.width)
    im = im.resize((width, height), Image.LANCZOS)
    if sharpen:
        im = im.filter(ImageFilter.UnsharpMask(radius=sharpen[0], percent=sharpen[1], threshold=sharpen[2]))
    a = np.asarray(im).astype(np.float32)
    if grain:
        g = np.random.RandomState(seed).normal(0, 1, a.shape[:2]).astype(np.float32)
        g = cv2.GaussianBlur(g, (0, 0), 0.6); g /= g.std() + 1e-6
        Y = a.mean(2, keepdims=True) / 255.0
        a = a + g[..., None] * grain * (0.5 + 2.0 * Y * (1 - Y))
    return np.clip(a + 0.5, 0, 255).astype(np.uint8)


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
                return {'q': q, 'croma': '4:4:4' if sub == 0 else '4:2:0', 'kb': round(size / 1024, 1), 'ok': True, 'px': list(im.size)}
    return {'q': last[0], 'croma': '4:4:4' if last[1] == 0 else '4:2:0', 'kb': round(last[2] / 1024, 1), 'ok': False, 'px': list(im.size)}


SCENES = {
    'casa': (scene_casa, 'trianon-foto-casa'),
    'porton': (scene_porton, 'trianon-foto-porton'),
    'parque': (scene_parque, 'trianon-foto-parque'),
    'piscina': (scene_piscina, 'trianon-foto-piscina'),
    'aerea': (scene_aerea, 'trianon-aerea'),
}
LIMITS = {1280: (230, 1.4), 800: (110, 1.0)}     # KB máximos y grano por ancho


def main():
    if len(sys.argv) < 6:
        print(__doc__); sys.exit(1)
    args = sys.argv[1:]
    mensura = None
    if '--mensura' in args:
        k = args.index('--mensura'); mensura = args[k + 1]; del args[k:k + 2]
    video, raw, work, assets, data_js = args[:5]
    names = args[5:] or list(SCENES)
    os.makedirs(work, exist_ok=True); os.makedirs(assets, exist_ok=True)
    fdir = os.path.join(work, 'cuadros')
    extract_frames(video, sorted({i for n in names for i in FRAMES.get(n, [])}), fdir)
    fr = Frames(fdir)
    here = os.path.dirname(os.path.abspath(__file__))
    rp = os.path.join(work, 'photo-clean-report.json')
    report = json.load(open(rp, encoding='utf-8')) if os.path.exists(rp) else {}
    for name in names:
        fn, out = SCENES[name]
        clean, mask = fn(fr, raw, work)
        cv2.imwrite(os.path.join(work, f'{name}-limpia.png'), clean)
        if mask is not None:
            cv2.imwrite(os.path.join(work, f'{name}-mascara.png'), mask)
        graded = grade_frame(clean, name)
        cv2.imwrite(os.path.join(work, f'{name}-limpia-graduada.png'), graded)
        info = {'maestro_px': [int(clean.shape[1]), int(clean.shape[0])]}
        if name == 'aerea':
            subprocess.run([sys.executable, os.path.join(here, 'aerial-align.py'), work, data_js,
                            os.path.join(work, 'aerial-align.json'), os.path.join(work, 'aerial-align-debug.png')]
                           + ([mensura] if mensura else []), check=True)
            A = json.load(open(os.path.join(work, 'aerial-align.json'), encoding='utf-8'))
            plain = finish(graded, OUT_W[0], grain=0)
            cv2.imwrite(os.path.join(work, 'aerea-clean.png'), cv2.cvtColor(plain, cv2.COLOR_RGB2BGR))
        for width in OUT_W:
            max_kb, grain = LIMITS[width]
            rgb = finish(graded, width, grain=grain)
            chroma = (2,)
            if name == 'aerea':
                verts = A['vertices_px'][f'{rgb.shape[1]}x{rgb.shape[0]}']
                rgb = draw_boundary(rgb, verts, 3.0 * width / 1280)
                chroma = (0, 2)
            suffix = '' if width == OUT_W[0] else f'-{width}'
            info[str(width)] = save_jpeg(rgb, os.path.join(assets, f'{out}{suffix}.jpg'), max_kb, chroma)
        report[name] = info
        print(name, json.dumps(info, ensure_ascii=False), flush=True)
    json.dump(report, open(rp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
