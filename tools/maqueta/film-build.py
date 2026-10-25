"""Película del hero de Le Petit Trianon: assets/trianon-film.mp4 / .webm, trianon-film-movil.mp4 y trianon-film-poster.jpg.

Guion (1280×720, 24 fps, 17,0 s = 408 cuadros, bucle sin corte, SIN pista de audio, sin textos horneados):
  0,00–3,00   la casa de frente — parte 1, cuadros 3–89 (0,76×; 0–2 son de la toma anterior, con otro rótulo). El
              subtítulo (entra en el cuadro 6) se borra con una placa limpia (cuadros 3–5 promediados) alineada cuadro a
              cuadro por ECC (homografía sobre el fondo) y fundida con máscara de bordes suaves + corrección de baja
              frecuencia del entorno (sin costura ni parpadeo).
  2,75–5,00   el portón — parte 1, cuadros 93–122 (90–92 arrastran el rótulo; desde el 123 el original acelera), 0,44×:
              unos 2 s en pantalla, para que se registre.
  Casa, portón y jardín se retemporizan por movimiento medido: el original tiene una cadencia irregular de 3 cuadros que
  la cámara lenta volvería tirones. Cámara lenta = interpolación por flujo óptico suavizado (movimiento de cámara, no de
  hojas).
  4,50–7,00   piscina con jacuzzi y la casa detrás — parte 2b, cuadros 165–225 (cámara quieta), 0,81×. Subtítulo: un mismo
              parche limpio (promedio robusto + relleno Shift-Map, como photo-clean.py) para todos los cuadros, seguido
              por ECC y con corrección de baja frecuencia.
  6,50–9,75   el jardín visto desde la galería: césped, seto, árboles altos y la piscina con los chorros del jacuzzi —
              parte 2b, cuadros 60–111 (paneo lentísimo, nítido y a pleno sol), 0,53×. El subtítulo «con vista a la piscina
              y al jardín.» va sobre el deck claro: máscara de letras blancas junto a su borde oscuro y el mismo parche
              limpio que la piscina. (Reemplaza a la toma del parque a contraluz de la parte 1, cuadros 357–462: lechosa,
              con destello y blanda.)
  9,25–12,50  la aérea limpia (aerea-clean.png) con un empuje lento; el límite del predio en oro #C9A66B (halo suave) se
              dibuja a sí mismo desde el portón en 1,6 s y queda.
  12,50–13,50 la aérea se funde en la maqueta 3D cenital, ALINEADA (la cámara del visor se resuelve cuadro a cuadro para
              que el polígono de data.js caiga sobre el contorno dorado; la aérea se deforma con la similitud medida):
              primero se disuelve lo de alrededor en la página marfil, después el interior del predio.
  13,50–16,30 la cámara 3D se inclina desde la cenital hasta el encuadre de la vista Maqueta (luz Atardecer); el oro se
              retira y aparecen los discos numerados de las siete parcelas; 16,30–16,50 quieta.
  16,50–17,00 fundido a la casa (sus primeros cuadros, que preceden al cuadro 0): el bucle no tiene corte.
  Fundidos de 0,5 s centrados en cada corte. Real-ESRGAN (general, denoise 0,5; upscale.py) sobre los cuadros ya limpios,
  reducción por área a 1280×720, reducción de ruido temporal (vecinos ±2 alineados por flujo, pesos robustos: sin
  «hervor» del escalado) y la gradación de photo-clean.py (grade + PRESETS de cada escena) en cada cuadro.

Etapas (en orden; cada una reutiliza lo ya hecho en <work>):
  python film-build.py clean   <opciones>   cuadros fuente limpios (<work>/clean/<toma>/NNNN.png)
  python film-build.py sr      <opciones>   Real-ESRGAN → 1280×720 (<work>/sr/<toma>/NNNN.png; ~20 s por cuadro y proceso:
                                            conviene lanzar 4 procesos con --threads 1 --part 0/4 … 3/4)
  python film-build.py shots   <opciones>   gradación + cámara lenta → cuadros de la película (<work>/shots/<toma>/kNNNN.png)
  python film-build.py plan    <opciones>   pedido de cámaras 3D (<work>/cams-request.json)
  flock /tmp/pw-render.lock node film-frames.js <work>       render 3D del visor (<work>/3d/kNNNN.png + proj.json)
  python film-build.py compose <opciones>   cuadros finales (<work>/out/fNNNN.png)
  python film-build.py encode  <opciones>   mp4, webm, móvil y póster en <assets> + verificación (ffprobe, bucle);
                                            con --stills DIR, ocho cuadros de revisión film-*.png
Opciones: --video DIR (con parte1.mov y parte2b.mov) --work DIR --aerial aerea-clean.png --align aerial-align.json
          --assets DIR [--data le-petit-trianon/maqueta/data.js] [--threads 4]
  aerea-clean.png y aerial-align.json los deja photo-clean.py (aérea limpia y graduada sin contorno, 1280×725, y los
  vértices del polígono medido en sus píxeles). El render 3D requiere el servidor local del repo (python3 -m http.server
  8765 desde la raíz) y Playwright (ver film-frames.js).
  Codificación: H.264 (preset slow, yuv420p, +faststart) y VP9 (crf, b:v 0) sin audio; el crf sube solo hasta que cada
  archivo grande pesa ≤ 3,5 MB y el móvil (854×480) ≤ 1,6 MB (hoy: mp4 crf 28, webm crf 42, móvil crf 29); póster =
  primer cuadro, JPG progresivo ≤ 200 KB. La verificación compara último→primer cuadro con la mediana entre vecinos.
Ejemplo completo (W = carpeta de trabajo; V = carpeta con parte1.mov y parte2b.mov; A = aérea limpia y su JSON):
  export PW_SR_MODELS=<carpeta con realesr-general-x4v3.pth y realesr-general-wdn-x4v3.pth>
  python film-build.py clean --video V --work W
  for i in 0 1 2 3; do python film-build.py sr --work W --threads 1 --part $i/4 & done; wait
  python film-build.py shots --work W
  python film-build.py plan --work W --aerial A/aerea-clean.png --align A/aerial-align.json
  flock /tmp/pw-render.lock node film-frames.js W
  python film-build.py compose --work W --aerial A/aerea-clean.png --align A/aerial-align.json
  python film-build.py encode --work W --assets ../../assets --stills out
Requiere el venv con PyTorch, opencv-contrib (xphoto), numpy y Pillow; ffmpeg/ffprobe en el PATH. Determinista.
"""
import argparse
import importlib.util
import json
import math
import os
import shutil
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


pc = _load('photo_clean', 'photo-clean.py')

FPS = 24
W, H = 1280, 720
NFR = 408                                   # 17,0 s
GOLD = np.array([0x6B, 0xA6, 0xC9], np.float32)   # #C9A66B en BGR

# tomas de video: cuadros fuente (n desde 0, 30 fps), escena de gradación, recorte en la fuente (x, y, w, h)
SHOTS = {
    'casa':    dict(video='parte1.mov',  first=3,   last=89,  scene='casa',    crop=(0, 2, 960, 540), retime=True),
    'porton':  dict(video='parte1.mov',  first=93,  last=122, scene='porton',  crop=(0, 2, 960, 540), retime=True),
    'piscina': dict(video='parte2b.mov', first=165, last=225, scene='piscina', crop=(0, 2, 960, 540)),
    'jardin':  dict(video='parte2b.mov', first=60,  last=111, scene='piscina', crop=(0, 2, 960, 540), retime=True),
}
# línea de tiempo (segundos de película): tramo visible [a, b] de cada toma, fundidos de 0,5 s
XF = 0.5
TL = {
    'casa':    (0.00, 3.25),     # + pre-roll 16,50–17,00 (los primeros 0,5 s de la toma, fundidos sobre la maqueta)
    'porton':  (2.75, 5.00),
    'piscina': (4.50, 7.00),
    'jardin':  (6.50, 9.75),
    'aerea':   (9.25, 13.50),
    'maqueta': (12.50, 17.00),
}
CASA_PRE = 0.5                              # s de la casa que van al final (fundido de cierre del bucle)
DRAW = (9.75, 11.35)                        # el límite dorado se dibuja
DISSOLVE = (12.50, 13.50)                   # aérea → maqueta cenital
TILT = (13.50, 16.30)                       # inclinación a la vista Maqueta
LINE_OUT = (13.55, 14.25)                   # el oro se retira al empezar a inclinar
DISCS_IN = (14.90, 15.90)                   # discos numerados de las parcelas
PUSH_S = 0.16                               # empuje de la aérea: escala final 1,16 (desacelera hasta el fin del fundido)


def smooth(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def ease_io(x):                              # cúbica de entrada y salida (como el visor)
    x = min(1.0, max(0.0, x))
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ftime(k):
    return k / FPS


# ---------------------------------------------------------------- cuadros fuente
def extract(video, first, last, folder):
    os.makedirs(folder, exist_ok=True)
    need = [i for i in range(first, last + 1) if not os.path.exists(os.path.join(folder, '%04d.png' % i))]
    if not need:
        return
    tmp = os.path.join(folder, '_tmp'); shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', "select='between(n\\,%d\\,%d)'" % (first, last),
                    '-vsync', '0', '-an', os.path.join(tmp, '%05d.png')], check=True)
    got = sorted(os.listdir(tmp))
    assert len(got) == last - first + 1, (len(got), first, last)
    for i, g in zip(range(first, last + 1), got):
        os.replace(os.path.join(tmp, g), os.path.join(folder, '%04d.png' % i))
    os.rmdir(tmp)


def gray32(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0


def ecc(template, inp, mask=None, init=None, scale=0.5):
    """Homografía ECC que lleva coordenadas de `template` a las de `inp` (ambas BGR uint8). Se resuelve a media escala."""
    t = cv2.resize(gray32(template), None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    i = cv2.resize(gray32(inp), None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    m = None if mask is None else cv2.resize(mask, (t.shape[1], t.shape[0]), interpolation=cv2.INTER_NEAREST)
    S = np.diag([scale, scale, 1.0]).astype(np.float32)
    w0 = np.eye(3, dtype=np.float32) if init is None else (S @ init @ np.linalg.inv(S)).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-7)
    _, w = cv2.findTransformECC(t, i, w0, cv2.MOTION_HOMOGRAPHY, crit, m, 5)
    return (np.linalg.inv(S) @ w @ S).astype(np.float64)


def lowfreq_fill(diff, known, scale=4, sigma=3.0):
    """Interpola suavemente dentro de ~known la diferencia (cuadro − placa) conocida alrededor del hueco."""
    hh, ww = diff.shape[:2]
    small = cv2.resize(diff, (ww // scale, hh // scale), interpolation=cv2.INTER_AREA)
    ks = cv2.resize(known.astype(np.uint8) * 255, (ww // scale, hh // scale), interpolation=cv2.INTER_AREA) > 250
    out = np.zeros_like(small)
    for c in range(3):
        ch = np.clip(small[..., c] + 128, 0, 255).astype(np.uint8)
        out[..., c] = cv2.inpaint(ch, (~ks).astype(np.uint8) * 255, 6, cv2.INPAINT_TELEA).astype(np.float32) - 128
    out = cv2.resize(out, (ww, hh), interpolation=cv2.INTER_CUBIC)
    return cv2.GaussianBlur(out, (0, 0), sigma * scale / 2)


def patch_in(frame, plate_w, mask, feather=2.5, ring=6):
    """Reemplaza `mask` en `frame` por la placa alineada, igualando la baja frecuencia con el entorno (bordes suaves)."""
    f = frame.astype(np.float32); p = plate_w.astype(np.float32)
    grow = cv2.dilate(mask, pc.E(ring))
    d = np.clip(f - p, -40, 40)
    df = lowfreq_fill(d, grow == 0)
    a = cv2.GaussianBlur(cv2.dilate(mask, pc.E(3)).astype(np.float32) / 255.0, (0, 0), feather)
    a = np.maximum(a, mask.astype(np.float32) / 255.0)[..., None]
    return np.clip(f * (1 - a) + (p + df) * a + 0.5, 0, 255).astype(np.uint8)


def merge_plate(fr, ref_i, idx, box=None):
    """Promedio robusto de cuadros de cámara quieta alineados por ECC sobre la referencia (fuera de `box`)."""
    ref = fr(ref_i); hh, ww = ref.shape[:2]
    mask = np.full((hh, ww), 255, np.uint8)
    if box:
        mask[box[1]:box[3], box[0]:box[2]] = 0
    frames, valids = [], []
    for i in idx:
        if i == ref_i:
            continue
        Hm = ecc(ref, fr(i), mask)
        w = cv2.warpPerspective(fr(i), Hm, (ww, hh), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
        v = cv2.warpPerspective(np.full((hh, ww), 255, np.uint8), Hm, (ww, hh), flags=cv2.INTER_NEAREST | cv2.WARP_INVERSE_MAP)
        frames.append(w); valids.append((v > 0).astype(np.float32))
    return pc.robust_merge(ref, frames, valids, 5.0)


def clean_casa(src, dst, log):
    fr = pc.Frames(src)
    plate = merge_plate(fr, 4, range(3, 6))                     # 3–5: sin subtítulo (0–2 son de la toma anterior; desde el 6 entra)
    hh, ww = plate.shape[:2]
    box = (310, 368, 660, 544)                                  # «COMPLEJO / LE PETIT TRIANON / SAN BERNARDINO / PIRAYU'I»
    bgmask = np.full((hh, ww), 255, np.uint8); bgmask[box[1] - 10:, box[0] - 20:box[2] + 20] = 0
    Hs, union, init = {}, np.zeros((hh, ww), np.uint8), None
    for i in range(3, 90):
        Hm = ecc(plate, fr(i), bgmask, init); init = Hm; Hs[i] = Hm
        pw = cv2.warpPerspective(plate, Hm, (ww, hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        d = cv2.GaussianBlur(np.abs(fr(i).astype(np.float32) - pw.astype(np.float32)).max(2), (0, 0), 1.0)
        m = np.zeros((hh, ww), np.uint8); m[box[1]:box[3], box[0]:box[2]] = (d[box[1]:box[3], box[0]:box[2]] > 38) * 255
        union |= pc.drop_small(m, 12)
    mask = pc.fill_holes(cv2.morphologyEx(union, cv2.MORPH_CLOSE, pc.E(5)))
    mask = cv2.dilate(mask, pc.E(3))
    cv2.imwrite(os.path.join(dst, '_mask.png'), mask); cv2.imwrite(os.path.join(dst, '_plate.png'), plate)
    for i in range(3, 90):
        pw = cv2.warpPerspective(plate, Hs[i], (ww, hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        cv2.imwrite(os.path.join(dst, '%04d.png' % i), patch_in(fr(i), pw, mask))
    t = Hs[89] @ np.array([480, 272, 1.0]); log['casa'] = {'deriva_px_cuadro_89': [round(t[0] / t[2] - 480, 2), round(t[1] / t[2] - 272, 2)],
                                                           'mascara_px': int((mask > 0).sum())}


def clean_piscina(src, dst, log):
    fr = pc.Frames(src)
    box = (280, 405, 690, 470)                                  # «Hermosa piscina con jacuzzi.» sobre el césped
    ref_i = 195
    merged = merge_plate(fr, ref_i, range(180, 211), box)
    m = pc.subtitle_mask(fr(ref_i), box)                        # letras + borde + sombra + sangrado de croma
    plate = pc.shiftmap_fill(merged, m, (120, 300, 840, merged.shape[0]))
    hh, ww = plate.shape[:2]
    mask = cv2.dilate(m, pc.E(2))
    bgmask = np.full((hh, ww), 255, np.uint8); bgmask[box[1] - 10:box[3] + 10, box[0] - 10:box[2] + 10] = 0
    cv2.imwrite(os.path.join(dst, '_mask.png'), mask); cv2.imwrite(os.path.join(dst, '_plate.png'), plate)
    init = None; drift = None
    for i in range(165, 226):
        Hm = ecc(plate, fr(i), bgmask, init); init = Hm
        pw = cv2.warpPerspective(plate, Hm, (ww, hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        cv2.imwrite(os.path.join(dst, '%04d.png' % i), patch_in(fr(i), pw, mask))
        t = Hm @ np.array([480, 272, 1.0]); drift = [round(t[0] / t[2] - 480, 2), round(t[1] / t[2] - 272, 2)]
    log['piscina'] = {'deriva_px_cuadro_225': drift, 'mascara_px': int((mask > 0).sum())}


def deck_subtitle_mask(img, box, dil=6):
    """Subtítulo blanco sobre un fondo claro (el deck): solo cuenta el blanco puro que toca el borde oscuro de las letras
    (el travertino al sol también es claro y poco saturado); dilatado para cubrir borde, sombra y sangrado de croma."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    x0, y0, x1, y1 = box
    white = ((hsv[..., 2] >= 225) & (hsv[..., 1] <= 35)).astype(np.uint8)
    edge = cv2.dilate((hsv[..., 2] < 95).astype(np.uint8), np.ones((5, 5), np.uint8))
    core = np.zeros(img.shape[:2], np.uint8)
    core[y0:y1, x0:x1] = (white & edge)[y0:y1, x0:x1] * 255
    core = pc.drop_small(core, 4)
    m = cv2.dilate(core, pc.E(dil)); m |= np.roll(np.roll(m, 2, 0), 2, 1)
    return pc.fill_holes(cv2.morphologyEx(m, cv2.MORPH_CLOSE, pc.E(4)))


def clean_jardin(src, dst, log):
    fr = pc.Frames(src)
    s = SHOTS['jardin']
    box = (280, 408, 684, 454)                                  # «con vista a la piscina y al jardín.» sobre el deck
    ref_i = 80
    merged = merge_plate(fr, ref_i, range(s['first'], s['last'] + 1), box)
    m = deck_subtitle_mask(fr(ref_i), box)
    plate = pc.shiftmap_fill(merged, m, (150, 330, 820, merged.shape[0]))
    hh, ww = plate.shape[:2]
    mask = cv2.dilate(m, pc.E(2))
    bgmask = np.full((hh, ww), 255, np.uint8); bgmask[box[1] - 10:box[3] + 10, box[0] - 10:box[2] + 10] = 0
    cv2.imwrite(os.path.join(dst, '_mask.png'), mask); cv2.imwrite(os.path.join(dst, '_plate.png'), plate)
    init = None; drift = None
    for i in range(s['first'], s['last'] + 1):
        Hm = ecc(plate, fr(i), bgmask, init); init = Hm
        pw = cv2.warpPerspective(plate, Hm, (ww, hh), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        cv2.imwrite(os.path.join(dst, '%04d.png' % i), patch_in(fr(i), pw, mask))
        t = Hm @ np.array([480, 272, 1.0]); drift = [round(t[0] / t[2] - 480, 2), round(t[1] / t[2] - 272, 2)]
    log['jardin'] = {'deriva_px_ultimo_cuadro': drift, 'mascara_px': int((mask > 0).sum())}


def stage_clean(a):
    log = {}
    for name in (a.only.split(',') if a.only else list(SHOTS)):
        s = SHOTS[name]
        src = os.path.join(a.work, 'src', name)
        lo, hi = s['first'], s['last']
        if name == 'casa':
            lo = 3
        if name == 'piscina':
            lo, hi = min(lo, 180), max(hi, 210)
        extract(os.path.join(a.video, s['video']), lo, hi, src)
        dst = os.path.join(a.work, 'clean', name); os.makedirs(dst, exist_ok=True)
        if name == 'casa':
            clean_casa(src, dst, log)
        elif name == 'piscina':
            clean_piscina(src, dst, log)
        elif name == 'jardin':
            clean_jardin(src, dst, log)
        else:
            for i in range(s['first'], s['last'] + 1):
                shutil.copyfile(os.path.join(src, '%04d.png' % i), os.path.join(dst, '%04d.png' % i))
        print(name, 'limpio', log.get(name, ''), flush=True)
    path = os.path.join(a.work, 'clean-log.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(log); json.dump(old, open(path, 'w'), indent=1)


# ---------------------------------------------------------------- escalado con IA
def stage_sr(a):
    up = _load('upscale', 'upscale.py')
    import torch
    torch.set_num_threads(a.threads)
    models = os.environ.get('PW_SR_MODELS', os.path.join(HERE, 'models'))
    net, scale = up.load_model('general', 0.5, models)
    import time
    names = a.only.split(',') if a.only else list(SHOTS)
    part, nparts = (int(x) for x in a.part.split('/'))           # varios procesos de 1 hilo rinden más que uno de 4
    jobs = [(name, i) for name in names for i in range(SHOTS[name]['first'], SHOTS[name]['last'] + 1)]
    for j, (name, i) in enumerate(jobs):
        if j % nparts != part:
            continue
        s = SHOTS[name]
        src = os.path.join(a.work, 'clean', name); dst = os.path.join(a.work, 'sr', name); os.makedirs(dst, exist_ok=True)
        x, y, w, h = s['crop']
        if True:
            out = os.path.join(dst, '%04d.png' % i)
            if os.path.exists(out):
                continue
            t0 = time.time()
            img = cv2.imread(os.path.join(src, '%04d.png' % i))[y:y + h, x:x + w]
            big = up.upscale(net, scale, img, tile=a.tile)
            small = cv2.resize(big, (W, H), interpolation=cv2.INTER_AREA)
            cv2.imwrite(out + '.tmp.png', small); os.replace(out + '.tmp.png', out)
            print(f'sr {name} {i} {time.time() - t0:.1f} s', flush=True)


# ---------------------------------------------------------------- tomas a 24 fps (gradación + cámara lenta)
_DIS = None


def flow(a, b, smooth=0.0):
    """Flujo óptico DIS a media resolución. smooth > 0: mediana + gaussiana (en px de media resolución), para quedarse
    con el movimiento de cámara y no con el temblor de hojas y pasto (que en la interpolación deja manchas)."""
    global _DIS
    if _DIS is None:
        _DIS = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    ga = cv2.resize(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    gb = cv2.resize(cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    f = _DIS.calc(ga, gb, None)
    if smooth:
        f = np.dstack([cv2.medianBlur(np.ascontiguousarray(f[..., c]), 5) for c in range(2)])
        f = cv2.GaussianBlur(f, (0, 0), smooth)
    return cv2.resize(f, (W, H), interpolation=cv2.INTER_LINEAR) * 2.0


def interp(a, b, t):
    """Cuadro intermedio entre a y b (t ∈ [0, 1]) por flujo óptico en ambos sentidos."""
    if t < 0.02:
        return a
    if t > 0.98:
        return b
    fab, fba = flow(a, b, 6.0), flow(b, a, 6.0)
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    wa = cv2.remap(a, gx - t * fab[..., 0], gy - t * fab[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    wb = cv2.remap(b, gx - (1 - t) * fba[..., 0], gy - (1 - t) * fba[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
    return np.clip(wa.astype(np.float32) * (1 - t) + wb.astype(np.float32) * t + 0.5, 0, 255).astype(np.uint8)


def tdenoise(frames, r=2, sigma=5.0):
    """Reducción de ruido temporal: cada cuadro se promedia con sus vecinos ±r alineados por flujo óptico, con pesos
    robustos (photo-clean.robust_merge: solo cuentan donde coinciden). Quita el «hervor» del escalado y los bloques."""
    gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
    out = []
    for i, ref in enumerate(frames):
        nb, vs = [], []
        for j in range(max(0, i - r), min(len(frames), i + r + 1)):
            if j == i:
                continue
            f = flow(ref, frames[j])
            nb.append(cv2.remap(frames[j], gx + f[..., 0], gy + f[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT))
            vs.append(np.ones((H, W), np.float32))
        out.append(pc.robust_merge(ref, nb, vs, sigma))
    return out


def shot_times(name, s, frames):
    """Tiempo de cada cuadro fuente (s). Retemporizado: proporcional al movimiento medido (cadencia irregular del original)."""
    n = s['last'] - s['first']
    if not s.get('retime'):
        return np.arange(n + 1) / 30.0
    mags = []
    for i in range(n):
        f = flow(frames[i], frames[i + 1]); mags.append(float(np.median(np.sqrt((f ** 2).sum(2)))))
    mags = np.array(mags); mags = np.maximum(mags, 0.15 * mags.mean())
    tau = np.concatenate([[0], np.cumsum(mags)]); return tau / tau[-1] * (n / 30.0)


def shot_clock(name, t):
    """Tiempo local de la toma (s, desde su primer cuadro fuente, a velocidad de película) para el instante t de la película."""
    a, b = TL[name]
    if name == 'casa':
        return t + CASA_PRE if t <= b else (t - (NFR / FPS - CASA_PRE) if t >= NFR / FPS - CASA_PRE else None)
    return t - a if a <= t <= b + 1e-9 else None


def shot_span(name):
    a, b = TL[name]
    return (b - a) + (CASA_PRE if name == 'casa' else 0.0)


def stage_shots(a):
    names = a.only.split(',') if a.only else list(SHOTS)
    report = {}
    for name in names:
        s = SHOTS[name]
        src = os.path.join(a.work, 'sr', name); dst = os.path.join(a.work, 'shots', name); os.makedirs(dst, exist_ok=True)
        frames = [cv2.imread(os.path.join(src, '%04d.png' % i)) for i in range(s['first'], s['last'] + 1)]
        frames = [pc.grade(f, **pc.PRESETS[s['scene']]) for f in tdenoise(frames)]
        tau = shot_times(name, s, frames)
        speed = tau[-1] / shot_span(name)
        report[name] = {'velocidad': round(float(speed), 3), 'cuadros_fuente': len(frames)}
        for k in range(NFR):
            c = shot_clock(name, ftime(k))
            if c is None:
                continue
            st = min(c * speed, tau[-1])
            j = int(np.clip(np.searchsorted(tau, st, side='right') - 1, 0, len(tau) - 2))
            u = (st - tau[j]) / (tau[j + 1] - tau[j])
            cv2.imwrite(os.path.join(dst, 'k%04d.png' % k), interp(frames[j], frames[j + 1], float(u)))
        print(name, report[name], flush=True)
    path = os.path.join(a.work, 'shots-log.json')
    old = json.load(open(path)) if os.path.exists(path) else {}
    old.update(report); json.dump(old, open(path, 'w'), indent=1)


# ---------------------------------------------------------------- aérea: empuje y pedido de cámaras 3D
def load_data(path):
    txt = open(path, encoding='utf-8').read()
    return json.loads(txt[txt.index('{'):txt.rindex('}') + 1])


def aerial_verts(a):
    """Vértices del polígono medido en píxeles de la aérea (según su ancho real) y la aérea misma."""
    img = cv2.imread(a.aerial)
    J = json.load(open(a.align))
    k = img.shape[1] / 960.0
    v = (np.array(J['vertices_px']['960x544'], float) + 0.5) * k - 0.5
    return img, v


def push(t):
    """Similitud aérea → cuadro de película en el instante t (escala, traslación): empuje lento que desacelera."""
    a0, b0 = TL['aerea'][0], DISSOLVE[1]
    p = math.sin(0.5 * math.pi * min(1.0, max(0.0, (t - a0) / (b0 - a0))))
    s = 1.0 + PUSH_S * p
    return s, np.array([0.0, -2.5 + p * (-(725 * (1 + PUSH_S) - H) + 2.5)])


def sim_apply(S, pts):
    s, R, T = S
    return (s * (R @ np.asarray(pts, float).T)).T + T


def push_sim(t, img_w):
    s, T = push(t)
    k = W / img_w                                # la aérea puede venir a otra resolución (p. ej. escalada)
    return (s * k, np.eye(2), T)


def stage_plan(a):
    img, v = aerial_verts(a)
    D = load_data(a.data)
    frames = []
    k0, k1 = round(DISSOLVE[0] * FPS), round(DISSOLVE[1] * FPS)
    for k in range(k0, k1):
        frames.append({'k': k, 'mode': 'cenital', 'verts': sim_apply(push_sim(ftime(k), img.shape[1]), v).round(3).tolist()})
    kt0, kt1 = k1, round(TILT[1] * FPS)
    for k in range(kt0, kt1 + 1):
        u = ease_io((ftime(k) - TILT[0]) / (TILT[1] - TILT[0]))
        frames.append({'k': k, 'mode': 'tilt', 'u': round(u, 5), 'disc': round(smooth((ftime(k) - DISCS_IN[0]) / (DISCS_IN[1] - DISCS_IN[0])), 4)})
    gate = D['front']['gate']
    req = {'size': [W, H], 'frames': frames, 'gate_x': gate.get('center_x', (gate['x0'] + gate['x1']) / 2)}
    json.dump(req, open(os.path.join(a.work, 'cams-request.json'), 'w'))
    print('cams-request.json:', len(frames), 'cuadros 3D', k0, '→', kt1)


# ---------------------------------------------------------------- límite dorado (dibujo progresivo)
def boundary_paths(verts, lam, f):
    """Dos plumas desde el punto del portón (fracción lam del lado 0→1) en sentidos opuestos; f = fracción del recorrido."""
    P = np.asarray(verts, float); n = len(P)
    start = P[0] + lam * (P[1] - P[0])
    ring_cw = [start] + [P[(1 + i) % n] for i in range(n)] + [start]          # hacia el vértice 1, 2, … y vuelta
    seg = np.linalg.norm(np.diff(np.array(ring_cw), axis=0), axis=1)
    per = seg.sum(); half = per / 2

    def walk(pts, dist):
        out = [pts[0]]; acc = 0.0
        for p0, p1 in zip(pts[:-1], pts[1:]):
            L = float(np.linalg.norm(p1 - p0))
            if acc + L >= dist:
                out.append(p0 + (p1 - p0) * ((dist - acc) / max(L, 1e-9))); return out, True
            out.append(p1); acc += L
        return out, False
    if f >= 1:
        return [np.array(ring_cw)], True, []
    d = f * half
    pa, _ = walk(ring_cw, d)
    pb, _ = walk(ring_cw[::-1], d)
    return [np.array(pa), np.array(pb)], False, [pa[-1], pb[-1]]


def draw_gold(img, verts, lam, f, alpha, fill, line_px=3.0):
    """Trazo #C9A66B con halo oscuro suave y brillo dorado (estilo de photo-clean.draw_boundary), supermuestreo 4×."""
    if alpha <= 0.001:
        return img
    hh, ww = img.shape[:2]; k = 4
    paths, closed, heads = boundary_paths(verts, lam, f)

    def layer(thick, polys=paths, close=False, filled=False):
        m = np.zeros((hh * k, ww * k), np.uint8)
        P = [np.round((np.asarray(p) * k + (k - 1) / 2) * 16).astype(np.int32) for p in polys]
        if filled:
            cv2.fillPoly(m, P, 255, cv2.LINE_AA, 4)
        else:
            cv2.polylines(m, P, close, 255, max(1, int(round(thick * k))), cv2.LINE_AA, 4)
        return cv2.resize(m, (ww, hh), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
    out = img.astype(np.float32); s = line_px / 3.0
    if fill > 0:
        fl = layer(0, [np.asarray(verts)], filled=True) * 0.08 * fill * alpha
        out = out * (1 - fl[..., None]) + GOLD * fl[..., None]
    sh = cv2.GaussianBlur(layer(line_px * 2.6), (0, 0), 2.6 * s) * 0.42 * alpha
    out = out * (1 - sh[..., None])
    gl = cv2.GaussianBlur(layer(line_px * 1.8), (0, 0), 2.2 * s) * 0.38 * alpha
    out = out * (1 - gl[..., None]) + GOLD * gl[..., None]
    st = layer(line_px) * alpha
    out = out * (1 - st[..., None]) + GOLD * st[..., None]
    for hd in heads:                                                       # punta de la pluma: un brillo cálido
        m = np.zeros((hh, ww), np.float32); cv2.circle(m, (int(round(hd[0])), int(round(hd[1]))), 2, 1.0, -1, cv2.LINE_AA)
        g = cv2.GaussianBlur(m, (0, 0), 3.0); g = g / (g.max() + 1e-6) * 0.55 * alpha
        out = out * (1 - g[..., None]) + np.array([200, 235, 250], np.float32) * g[..., None]
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def fit_sim(src, dst):
    """Similitud por mínimos cuadrados (Umeyama 2D) que lleva src → dst. Devuelve (s, R, T)."""
    A = np.asarray(src, float); B = np.asarray(dst, float)
    ma, mb = A.mean(0), B.mean(0); a0, b0 = A - ma, B - mb
    U, Sg, Vt = np.linalg.svd(b0.T @ a0)
    R = U @ Vt
    if np.linalg.det(R) < 0:
        U[:, -1] *= -1; R = U @ Vt
    s = Sg.sum() / (a0 ** 2).sum()
    return (s, R, mb - s * (R @ ma))


def warp_aerial(img, S):
    s, R, T = S
    M = np.hstack([s * R, T[:, None]])
    return cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)


# ---------------------------------------------------------------- composición
def stage_compose(a):
    img, v = aerial_verts(a)
    D = load_data(a.data)
    req = json.load(open(os.path.join(a.work, 'cams-request.json')))
    proj = json.load(open(os.path.join(a.work, '3d', 'proj.json')))
    poly = np.array(D['site']['polygon'], float)
    lam = (poly[0][0] - req['gate_x']) / (poly[0][0] - poly[1][0])          # el portón sobre el frente (lado 0→1)
    out = os.path.join(a.work, 'out'); os.makedirs(out, exist_ok=True)
    k3 = sorted(int(x) for x in proj)
    last3 = k3[-1]
    rows = []
    todo = [int(x) for x in a.frames.split(',')] if a.frames else range(NFR)
    for k in todo:
        t = ftime(k)
        layers = []                                                         # (imagen, alfa de entrada)

        def vid(name):
            p = os.path.join(a.work, 'shots', name, 'k%04d.png' % k)
            return cv2.imread(p) if os.path.exists(p) else None
        for name in SHOTS:
            a0, b0 = TL[name]
            if a0 - 1e-9 <= t <= b0 + 1e-9:
                fr = vid(name); assert fr is not None, (name, k)
                layers.append((fr, 1.0 if name == 'casa' and t < 1 else smooth((t - a0 + 1 / FPS) / XF)))
        verts = None; line_a = 0.0
        if TL['aerea'][0] - 1e-9 <= t < DISSOLVE[0] - 1e-9:
            S = push_sim(t, img.shape[1]); verts = sim_apply(S, v)
            layers.append((warp_aerial(img, S), smooth((t - TL['aerea'][0] + 1 / FPS) / XF)))
        elif DISSOLVE[0] - 1e-9 <= t < DISSOLVE[1] - 1e-9:
            pv = np.array(proj[str(k)]['verts']); S = fit_sim(v, pv); verts = pv
            aer = warp_aerial(img, S).astype(np.float32)
            m3 = cv2.imread(os.path.join(a.work, '3d', 'k%04d.png' % k)).astype(np.float32)
            # lo de alrededor se disuelve primero (en la página marfil), el interior del predio después
            pm = np.zeros((H, W), np.uint8); cv2.fillPoly(pm, [np.round(pv * 16).astype(np.int32)], 255, cv2.LINE_AA, 4)
            pm = cv2.dilate(pm, pc.E(10))
            r = 1 - cv2.GaussianBlur(pm.astype(np.float32) / 255, (0, 0), 28)
            u = (t - DISSOLVE[0] + 1 / FPS) / (DISSOLVE[1] - DISSOLVE[0])
            a_out, a_in = 1 - smooth(u / 0.62), 1 - smooth((u - 0.32) / 0.68)
            al = (r * a_out + (1 - r) * a_in)[..., None]
            layers = [(np.clip(aer * al + m3 * (1 - al) + 0.5, 0, 255).astype(np.uint8), 1.0)]
        if t >= DISSOLVE[1] - 1e-9:
            kk = min(k, last3)
            m3 = cv2.imread(os.path.join(a.work, '3d', 'k%04d.png' % kk)); verts = np.array(proj[str(kk)]['verts'])
            layers.append((m3, 1.0))
            if t >= NFR / FPS - CASA_PRE - 1e-9:
                layers.append((vid('casa'), smooth((t - (NFR / FPS - CASA_PRE) + 1 / FPS) / CASA_PRE)))
        frame = layers[0][0].astype(np.float32)
        for im, al in layers[1:]:
            frame = frame * (1 - al) + im.astype(np.float32) * al
        frame = np.clip(frame + 0.5, 0, 255).astype(np.uint8)
        # el límite dorado
        if verts is not None and t >= DRAW[0]:
            f = ease_io((t - DRAW[0]) / (DRAW[1] - DRAW[0]))
            line_a = 1 - smooth((t - LINE_OUT[0]) / (LINE_OUT[1] - LINE_OUT[0]))
            fill = smooth((t - DRAW[1]) / 0.4)
            if t >= TL['aerea'][0] and t < DISSOLVE[0]:
                line_a *= smooth((t - TL['aerea'][0]) / XF)
            frame = draw_gold(frame, verts, lam, f, line_a, fill)
        cv2.imwrite(os.path.join(out, 'f%04d.png' % k), frame)
        rows.append(k)
        if k % 24 == 0:
            print('compose', k, flush=True)


# ---------------------------------------------------------------- codificación y verificación
def run(cmd):
    subprocess.run(cmd, check=True)


def probe(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames:format=duration,size',
                        '-of', 'json', path], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def decode_frames(path, idx):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True, check=True)
    J = probe(path); st = [s for s in J['streams'] if s['codec_type'] == 'video'][0]
    w, h = st['width'], st['height']
    arr = np.frombuffer(r.stdout, np.uint8).reshape(-1, h, w, 3)
    return arr, [arr[i] for i in idx]


def psnr(a, b):
    m = np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2)
    return 99.0 if m == 0 else 10 * math.log10(255 ** 2 / m)


def stage_encode(a):
    src = os.path.join(a.work, 'out', 'f%04d.png')
    base = os.path.join(a.assets, 'trianon-film')
    res = {}
    for crf in range(a.crf, a.crf + 6):
        run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', src, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
             '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '48', '-movflags', '+faststart', base + '.mp4'])
        if os.path.getsize(base + '.mp4') <= 3.5 * 1024 * 1024:
            res['mp4_crf'] = crf; break
    for crf in range(a.crf_vp9, a.crf_vp9 + 12, 2):
        run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', src, '-an', '-c:v', 'libvpx-vp9', '-crf', str(crf), '-b:v', '0',
             '-deadline', 'good', '-cpu-used', '1', '-row-mt', '1', '-g', '48', '-pix_fmt', 'yuv420p', base + '.webm'])
        if os.path.getsize(base + '.webm') <= 3.5 * 1024 * 1024:
            res['webm_crf'] = crf; break
    for crf in range(a.crf + 1, a.crf + 7):
        run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', src, '-an', '-vf', 'scale=854:480:flags=lanczos', '-c:v', 'libx264',
             '-preset', 'slow', '-crf', str(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '48', '-movflags', '+faststart', base + '-movil.mp4'])
        if os.path.getsize(base + '-movil.mp4') <= 1.6 * 1024 * 1024:
            res['movil_crf'] = crf; break
    from PIL import Image
    im = Image.open(os.path.join(a.work, 'out', 'f0000.png')).convert('RGB')
    for q in range(84, 60, -2):
        im.save(base + '-poster.jpg', 'JPEG', quality=q, optimize=True, progressive=True)
        if os.path.getsize(base + '-poster.jpg') <= 200 * 1024:
            res['poster_q'] = q; break
    # verificación
    for f in (base + '.mp4', base + '.webm', base + '-movil.mp4', base + '-poster.jpg'):
        J = probe(f) if not f.endswith('.jpg') else None
        info = {'kb': round(os.path.getsize(f) / 1024, 1)}
        if J:
            info['streams'] = [(s['codec_type'], s.get('codec_name'), s.get('width'), s.get('height'), s.get('r_frame_rate')) for s in J['streams']]
            info['duracion'] = round(float(J['format']['duration']), 3)
            arr, _ = decode_frames(f, [])
            info['cuadros'] = len(arr)
            # bucle: diferencia último→primero frente a la diferencia típica entre cuadros vecinos
            d = [psnr(arr[i], arr[i + 1]) for i in range(0, len(arr) - 1, max(1, len(arr) // 40))]
            info['bucle_psnr_ultimo_primero'] = round(psnr(arr[-1], arr[0]), 2)
            info['psnr_vecinos_mediana'] = round(float(np.median(d)), 2)
            info['psnr_vecinos_min'] = round(float(np.min(d)), 2)
        res[os.path.basename(f)] = info
    # ocho cuadros representativos del mp4 codificado (para revisar alineación, nitidez y ritmo)
    if a.stills:
        os.makedirs(a.stills, exist_ok=True)
        marks = [('1-casa', 1.5), ('2-porton', 3.9), ('3-piscina', 5.75), ('4-jardin', 8.1), ('5-aerea', 10.6),
                 ('6-fundido', 13.0), ('7-inclinacion', 14.9), ('8-maqueta', 16.4)]
        arr, _ = decode_frames(base + '.mp4', [])
        for nm, ts in marks:
            cv2.imwrite(os.path.join(a.stills, 'film-%s.png' % nm), cv2.cvtColor(arr[round(ts * FPS)], cv2.COLOR_RGB2BGR))
    json.dump(res, open(os.path.join(a.work, 'encode-log.json'), 'w'), indent=1)
    print(json.dumps(res, indent=1, ensure_ascii=False))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('stage', choices=['clean', 'sr', 'shots', 'plan', 'compose', 'encode'])
    ap.add_argument('--video', required=False); ap.add_argument('--work', required=True)
    ap.add_argument('--aerial'); ap.add_argument('--align'); ap.add_argument('--assets')
    ap.add_argument('--data', default=os.path.join(REPO, 'le-petit-trianon', 'maqueta', 'data.js'))
    ap.add_argument('--threads', type=int, default=4); ap.add_argument('--tile', type=int, default=544)
    ap.add_argument('--only', default=''); ap.add_argument('--part', default='0/1')
    ap.add_argument('--stills', default=''); ap.add_argument('--frames', default='')
    ap.add_argument('--crf', type=int, default=26); ap.add_argument('--crf-vp9', type=int, default=36)
    a = ap.parse_args()
    os.makedirs(a.work, exist_ok=True)
    {'clean': stage_clean, 'sr': stage_sr, 'shots': stage_shots, 'plan': stage_plan, 'compose': stage_compose, 'encode': stage_encode}[a.stage](a)


if __name__ == '__main__':
    sys.exit(main())
