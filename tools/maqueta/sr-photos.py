"""Fotos del sitio con escalado por IA: toma los maestros limpios y graduados de photo-clean.py, arma la piscina y el
parque desde el video y exporta las JPG del contrato a 1920 px (y -800) con Real-ESRGAN x4plus.

Uso:
  PW_SR_MODELS=<carpeta de pesos> python sr-photos.py <carpeta de trabajo> <carpeta de video> <carpeta assets> [escena ...]
    <carpeta de trabajo>  la de photo-clean.py (lee *-limpia-graduada.png y aerial-align.json)
    <carpeta de video>    con parte1.mov (casa, portón, parque, aérea) y parte2b.mov (piscina con jacuzzi y la casa detrás)
    <carpeta assets>      destino: trianon-foto-{casa,porton,parque,piscina}.jpg, trianon-aerea.jpg y sus -800.jpg
    [escena ...]          opcional: casa porton parque piscina aerea (por defecto, las cinco)

Método: maestro a resolución de origen (960×544) → Real-ESRGAN x4plus (3840 px) → reducción a 1920 y 800 px con área,
enfoque muy suave y grano finísimo (el modelo ya devuelve bordes nítidos). La piscina: promedio robusto de los cuadros
185–215 registrados sobre el 203 (cámara casi quieta) y relleno Shift-Map del subtítulo «Hermosa piscina con jacuzzi.»
sobre el césped. El parque: cuadro 240 de la parte 1 (el más nítido del video: árboles altos, césped y el sendero),
promedio robusto de 236–244 y encuadre 16:9 por encima del subtítulo y sin el vehículo estacionado a la izquierda, sin
relleno (el cuadro 332 que usa photo-clean.py está movido y el escalado le marca manchas en el follaje). La aérea
recibe el límite del predio en dorado después del escalado, a la resolución final.
Requiere el venv con PyTorch, OpenCV contrib, numpy y Pillow (ver BRIEF y upscale.py).
"""
import importlib.util
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, file):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, file))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


pc = _load('photo_clean', 'photo-clean.py')
up = _load('upscale', 'upscale.py')


def piscina_master(video, work):
    folder = os.path.join(work, 'f2b')
    pc.extract_frames(video, range(185, 216), folder)
    fr = pc.Frames(folder)
    ref = fr(203)
    Hh, W = ref.shape[:2]
    box = (280, 405, 690, 465)                                   # caja del subtítulo
    mask = np.full((Hh, W), 255, np.uint8); mask[box[1]:box[3], box[0]:box[2]] = 0
    frames, valids = [], []
    for i in range(185, 216):
        if i == 203:
            continue
        w, inside = pc.align_to(ref, fr(i), mask)
        v = (inside > 0).astype(np.float32); v[box[1]:box[3], box[0]:box[2]] = 0
        frames.append(w); valids.append(v)
    img = pc.robust_merge(ref, frames, valids, 5.0)
    # el subtítulo está quieto en pantalla: sale del cuadro de referencia, no del promedio
    hsv = cv2.cvtColor(ref, cv2.COLOR_BGR2HSV)
    core = np.zeros((Hh, W), np.uint8); x0, y0, x1, y1 = box
    core[y0:y1, x0:x1] = ((hsv[y0:y1, x0:x1, 2] >= 190) & (hsv[y0:y1, x0:x1, 1] <= 70)) * 255
    core = pc.drop_small(core, 4)
    m = cv2.dilate(core, pc.E(7)); m |= np.roll(np.roll(m, 2, 0), 2, 1)
    m = pc.fill_holes(cv2.morphologyEx(m, cv2.MORPH_CLOSE, pc.E(4)))
    bx0, by0, bx1, by1 = 160, 330, 820, Hh
    sub = img[by0:by1, bx0:bx1]; ms = m[by0:by1, bx0:bx1]
    dst = np.zeros_like(sub)
    cv2.xphoto.inpaint(cv2.cvtColor(sub, cv2.COLOR_BGR2Lab), 255 - ms, dst, cv2.xphoto.INPAINT_SHIFTMAP)
    dst = cv2.cvtColor(dst, cv2.COLOR_Lab2BGR)
    out = img.copy(); out[by0:by1, bx0:bx1] = np.where((ms > 0)[..., None], dst, sub)
    out = pc.lf_fix(img, out, m, 6, 1.0)
    cv2.imwrite(os.path.join(work, 'piscina-video-limpia.png'), out)
    return pc.grade(pc.denoise(out, pc.DENOISE['piscina']), **pc.PRESETS['piscina'])


def parque_master(video, work):
    folder = os.path.join(work, 'fpq')
    pc.extract_frames(video, range(236, 245), folder)
    fr = pc.Frames(folder)
    ref = fr(240)
    Hh, W = ref.shape[:2]
    box = (175, 420, 790, 476)                                   # «Amplia propiedad con casa y parque…»
    mask = np.full((Hh, W), 255, np.uint8); mask[box[1] - 10:box[3] + 10, box[0] - 10:box[2] + 10] = 0
    frames, valids = [], []
    for i in (236, 238, 239, 241, 242, 244):                    # los más nítidos del tramo
        w, inside = pc.align_to(ref, fr(i), mask)
        v = (inside > 0).astype(np.float32); v[box[1]:box[3], box[0]:box[2]] = 0
        frames.append(w); valids.append(v)
    img = pc.robust_merge(ref, frames, valids, 5.0)
    y1, x0, x1 = 408, 170, 890                                  # 720×408 = 1920×1088 exacto: sobre el subtítulo, sin el vehículo
    out = img[:y1, x0:x1].copy()
    cv2.imwrite(os.path.join(work, 'parque-video-limpia.png'), out)
    # cuadro de pleno sol, no el 332 con bruma: sombras menos levantadas y algo más de contraste que el preset 'parque'
    return pc.grade(pc.denoise(out, pc.DENOISE['parque']), exposure=1.0, gamma=1.0, warm=0.9, green=1.08,
                    lift=0.015, contrast=0.15)


def finish_from_sr(sr_bgr, width, grain, seed=7):
    h = round(sr_bgr.shape[0] * width / sr_bgr.shape[1])
    small = cv2.resize(sr_bgr, (width, h), interpolation=cv2.INTER_AREA)
    return pc.finish(small, width, grain=grain, seed=seed, sharpen=(0.8, 22, 2))    # RGB


def save(rgb, path, max_kb):
    from PIL import Image
    im = Image.fromarray(rgb)
    for q in range(86, 70, -2):
        im.save(path, 'JPEG', quality=q, optimize=True, progressive=True, subsampling=0 if q >= 84 else 2)
        if os.path.getsize(path) <= max_kb * 1024:
            break
    return round(os.path.getsize(path) / 1024), q


def main():
    if len(sys.argv) < 4:
        print(__doc__); return 1
    work, videos, assets = sys.argv[1:4]
    scenes = sys.argv[4:] or ['casa', 'porton', 'parque', 'piscina', 'aerea']
    built = {'piscina': lambda: piscina_master(os.path.join(videos, 'parte2b.mov'), work),
             'parque': lambda: parque_master(os.path.join(videos, 'parte1.mov'), work)}
    models = os.environ.get('PW_SR_MODELS', os.path.join(HERE, 'models'))
    import torch
    torch.set_num_threads(os.cpu_count() or 4)
    net, scale = up.load_model('x4plus', 0, models)
    names = {'casa': 'trianon-foto-casa', 'porton': 'trianon-foto-porton', 'parque': 'trianon-foto-parque',
             'piscina': 'trianon-foto-piscina', 'aerea': 'trianon-aerea'}
    report = {}
    for s in scenes:
        master = built[s]() if s in built else cv2.imread(os.path.join(work, f'{s}-limpia-graduada.png'))
        assert master is not None, s
        sr_path = os.path.join(work, f'{s}-sr-x4.png')
        if os.path.exists(sr_path) and s not in built:
            sr = cv2.imread(sr_path)
        else:
            sr = up.upscale(net, scale, master, tile=256); cv2.imwrite(sr_path, sr)
        for width, kb, grain in ((1920, 340, 1.2), (800, 110, 0.9)):
            rgb = finish_from_sr(sr, width, grain)
            if s == 'aerea':
                J = json.load(open(os.path.join(work, 'aerial-align.json')))
                v = np.array(J['vertices_px']['960x544'], float) * (width / 960.0)
                rgb = pc.draw_boundary(rgb, v, max(2.0, 3.0 * width / 1280.0))
            out = os.path.join(assets, names[s] + ('' if width == 1920 else '-800') + '.jpg')
            report[os.path.basename(out)] = save(rgb, out, kb) + (rgb.shape[1], rgb.shape[0])
            print(os.path.basename(out), report[os.path.basename(out)], flush=True)
    json.dump(report, open(os.path.join(work, 'sr-photos-report.json'), 'w'), indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
