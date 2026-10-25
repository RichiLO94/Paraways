"""Alinea el polígono medido del predio (data.js → PW_DATA.site.polygon, metros) con la vista aérea norte-arriba.

Uso:
  python aerial-align.py <aerea.png> <data.js> <salida.json> [mensura-satelite.jpg] [debug.png]

Requiere Python 3 con opencv-contrib-python-headless (cv2 con ximgproc y SIFT), numpy.

Qué hace
  1. Detecta en la aérea ORIGINAL (921×522, antes de borrar nada) la línea blanca del contorno dibujado:
     píxeles claros y poco saturados dentro de una banda alrededor del contorno aproximado, sin la caja del
     rótulo inferior ni el techo blanco de la casa existente; la adelgaza a un esqueleto de 1 px.
  2. Proyecta el polígono medido a píxeles con el norte de cuadrícula del plano: el eje +X tiene azimut
     geo.azimut_eje_x (54,06°) desde el norte, así que +X → (sin a, −cos a) y +Y → (−cos a, −sin a) en la
     imagen (x a la derecha, y hacia abajo).
  3. Busca escala (px/m), traslación del origen (vértice 2) y una rotación residual de ±3° que minimizan la
     distancia de chamfer simétrica y truncada entre el borde del polígono y el esqueleto blanco
     (rejilla gruesa en rotación y escala + búsqueda por patrones).
  4. Control independiente (opcional): registra la imagen satelital de la mensura (con su polígono amarillo)
     sobre la aérea con SIFT + RANSAC (homografía), ajusta el mismo polígono al amarillo registrado y
     reporta la diferencia por vértice.
  Escribe parámetros, métricas y las coordenadas de los seis vértices en 921×522, 1440×816 y 800×453
  (convención de centros de píxel: x' = (x + 0,5)·k − 0,5).
"""
import json
import math
import sys

import cv2
import numpy as np

SRC_W, SRC_H = 921, 522
OUT_SIZES = {'1440': (1440, round(SRC_H * 1440 / SRC_W)), '800': (800, round(SRC_H * 800 / SRC_W))}
# Contorno aproximado del dibujo blanco (solo para acotar la búsqueda) y zonas sin evidencia.
SKETCH = np.array([(367, 208), (575, 367), (394, 496), (333, 432), (371, 376), (263, 275)], np.int32)
CAPTION = (278, 392, 646, 468)   # rótulo «Ideal para…» tapa parte de la línea
ROOF = (468, 352, 528, 402)      # techo blanco de la casa existente, junto al frente
TAU = 12.0


def load_polygon(data_js):
    s = open(data_js, encoding='utf-8').read()
    d = json.loads(s[s.index('{'):s.rstrip().rindex('}') + 1])
    return np.array(d['site']['polygon'], float), float(d['geo']['azimut_eje_x'])


class Model:
    def __init__(self, poly, az):
        a = math.radians(az)
        self.ex = np.array([math.sin(a), -math.cos(a)])
        self.ey = np.array([-math.cos(a), -math.sin(a)])
        self.base = poly[:, :1] * self.ex + poly[:, 1:] * self.ey

    def pts(self, p):
        s, th, tx, ty = p
        t = math.radians(th)
        R = np.array([[math.cos(t), -math.sin(t)], [math.sin(t), math.cos(t)]])
        return (self.base @ R.T) * s + np.array([tx, ty])


def edge_samples(V, step=0.5):
    out = []
    for i in range(len(V)):
        A, B = V[i], V[(i + 1) % len(V)]
        k = max(2, int(np.linalg.norm(B - A) / step))
        out.append(A + (B - A) * np.linspace(0, 1, k, endpoint=False)[:, None])
    return np.vstack(out)


def make_cost(model, skel, excl):
    H, W = skel.shape
    dt = cv2.distanceTransform(255 - skel, cv2.DIST_L2, 5)
    sy, sx = np.nonzero(skel)

    def cost(p):
        V = model.pts(p)
        S = edge_samples(V)
        xi, yi = np.round(S[:, 0]).astype(int), np.round(S[:, 1]).astype(int)
        ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        xi, yi = xi[ok], yi[ok]
        keep = excl[yi, xi] == 0
        fwd = float(np.minimum(dt[yi[keep], xi[keep]], TAU).mean())
        m = np.zeros((H, W), np.uint8)
        cv2.polylines(m, [np.round(V * 8).astype(np.int32)], True, 255, 1, cv2.LINE_8, 3)
        dtm = cv2.distanceTransform(255 - m, cv2.DIST_L2, 5)
        bwd = float(np.minimum(dtm[sy, sx], TAU).mean())
        return fwd + bwd, fwd, bwd
    return cost


def optimise(cost, p0, th_lim=3.0):
    def local(q):
        best = cost(q)[0]
        steps = np.array([0.04, 0.25, 1.0, 1.0])
        while steps[2] > 0.06:
            improved = False
            for i in range(4):
                for sg in (1, -1):
                    r = q.copy(); r[i] += sg * steps[i]
                    if abs(r[1]) > th_lim:
                        continue
                    c = cost(r)[0]
                    if c < best - 1e-7:
                        best, q, improved = c, r, True
            if not improved:
                steps /= 2
        return best, q
    best = None
    for th in np.arange(-th_lim, th_lim + 0.01, 1.0):
        for ds in (-0.2, 0.0, 0.2):
            for dx, dy in ((0, 0), (4, 4), (-4, -4), (4, -4), (-4, 4)):
                c, q = local(np.array([p0[0] + ds, th, p0[2] + dx, p0[3] + dy], float))
                if best is None or c < best[0]:
                    best = (c, q)
    return best[1]


def procrustes_init(model):
    # vértices visibles del dibujo ↔ vértices del modelo (orden de data.js: 1, 2, n1, n2, c, b)
    img = np.array([(575, 367), (394, 496), (333, 432), (371, 376), (263, 275), (367, 208)], float)
    use = [0, 1, 3, 4, 5]
    P, Q = model.base[use], img[use]
    mp, mq = P.mean(0), Q.mean(0)
    U, S, Vt = np.linalg.svd((P - mp).T @ (Q - mq))
    R = (U @ Vt).T
    s = S.sum() / ((P - mp) ** 2).sum()
    th = math.degrees(math.atan2(R[1, 0], R[0, 0]))
    t = mq - s * (R @ mp)
    return np.array([s, max(-3, min(3, th)), t[0], t[1]])


def white_skeleton(img):
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    white = ((hsv[..., 2] >= 185) & (hsv[..., 1] <= 50)).astype(np.uint8) * 255
    band = np.zeros((H, W), np.uint8)
    cv2.polylines(band, [SKETCH], True, 255, 26)
    line = white & band
    for (x0, y0, x1, y1) in (CAPTION, ROOF):
        line[y0:y1, x0:x1] = 0
    n, lab, st, _ = cv2.connectedComponentsWithStats(line, 8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 40:
            line[lab == i] = 0
    excl = np.zeros((H, W), np.uint8)
    for (x0, y0, x1, y1) in (CAPTION, ROOF):
        excl[y0:y1, x0:x1] = 1
    return cv2.ximgproc.thinning(line), excl


def surveyor_check(img, mensura_path, model, p0):
    M = cv2.imread(mensura_path)
    if M is None:
        return None
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    over = cv2.dilate((((hsv[..., 2] >= 185) & (hsv[..., 1] <= 50)) * 255).astype(np.uint8), np.ones((9, 9), np.uint8))
    hm = cv2.cvtColor(M, cv2.COLOR_BGR2HSV)
    yel = ((hm[..., 0] >= 18) & (hm[..., 0] <= 40) & (hm[..., 1] >= 110) & (hm[..., 2] >= 120)).astype(np.uint8) * 255
    mh, mw = M.shape[:2]
    mm = 255 - cv2.dilate(yel, np.ones((9, 9), np.uint8))
    mm[:, int(mw * 0.955):] = 0; mm[int(mh * 0.96):, :] = 0      # margen blanco de la hoja fotografiada
    sift = cv2.SIFT_create(4000)
    ka, da = sift.detectAndCompute(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 255 - over)
    km, dm = sift.detectAndCompute(cv2.cvtColor(M, cv2.COLOR_BGR2GRAY), mm)
    good = [a for a, b in cv2.BFMatcher(cv2.NORM_L2).knnMatch(dm, da, k=2) if a.distance < 0.75 * b.distance]
    src = np.float32([km[g.queryIdx].pt for g in good]); dst = np.float32([ka[g.trainIdx].pt for g in good])
    Hh, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
    wy = (cv2.warpPerspective(yel, Hh, (W, H)) > 100).astype(np.uint8) * 255
    wy = cv2.morphologyEx(wy, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    sk = cv2.ximgproc.thinning(wy)
    n, lab, st, _ = cv2.connectedComponentsWithStats(sk, 8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < 6:
            sk[lab == i] = 0
    cov = cv2.warpPerspective(np.full((int(mh * 0.96), int(mw * 0.955)), 255, np.uint8), Hh, (W, H))
    excl = (cov < 128).astype(np.uint8)
    cost = make_cost(model, sk, excl)
    p = optimise(cost, p0)
    return {'matches': len(good), 'inliers': int(inl.sum()), 'homography': Hh.tolist(), 'params': p, 'cost': cost(p)}


def to_size(V, w, h):
    kx, ky = w / SRC_W, h / SRC_H
    return [[round((x + 0.5) * kx - 0.5, 2), round((y + 0.5) * ky - 0.5, 2)] for x, y in V]


def main():
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(1)
    img = cv2.imread(sys.argv[1]); data_js, out = sys.argv[2], sys.argv[3]
    mensura = sys.argv[4] if len(sys.argv) > 4 else None
    debug = sys.argv[5] if len(sys.argv) > 5 else None
    assert img.shape[:2] == (SRC_H, SRC_W), 'se espera la aérea original de 921×522'
    poly, az = load_polygon(data_js)
    model = Model(poly, az)
    skel, excl = white_skeleton(img)
    cost = make_cost(model, skel, excl)
    p0 = procrustes_init(model)
    p = optimise(cost, p0)
    c = cost(p)
    V = model.pts(p)
    res = {
        'fuente': 'aérea norte-arriba 921×522; polígono de data.js (site.polygon, metros); ajuste a la línea blanca original',
        'azimut_eje_x_deg': az,
        'eje_x_px': model.ex.round(6).tolist(), 'eje_y_px': model.ey.round(6).tolist(),
        'escala_px_por_m': round(float(p[0]), 4),
        'rotacion_residual_deg': round(float(p[1]), 3),
        'origen_vertice_2_px': [round(float(p[2]), 2), round(float(p[3]), 2)],
        'chamfer_px': {'total': round(c[0], 3), 'poligono_a_linea': round(c[1], 3), 'linea_a_poligono': round(c[2], 3), 'truncado_en': TAU},
        'orden_vertices': ['1 (frente, lindero este)', '2 (origen, frente / camino vecinal)', 'n1', 'n2', 'c (fondo oeste)', 'b (fondo este)'],
        'vertices_px': {'921x522': [[round(x, 2), round(y, 2)] for x, y in V]},
        'convencion': "centros de píxel: x' = (x + 0,5)·k − 0,5",
    }
    for k, (w, h) in OUT_SIZES.items():
        res['vertices_px'][f'{w}x{h}'] = to_size(V, w, h)
    if mensura:
        chk = surveyor_check(img, mensura, model, p)
        if chk:
            Vy = model.pts(chk['params'])
            d = np.linalg.norm(V - Vy, axis=1)
            res['control_mensura'] = {
                'metodo': 'imagen satelital de la mensura registrada sobre la aérea (SIFT + RANSAC, homografía); mismo ajuste al polígono amarillo',
                'coincidencias': chk['matches'], 'inliers': chk['inliers'],
                'escala_px_por_m': round(float(chk['params'][0]), 4), 'rotacion_residual_deg': round(float(chk['params'][1]), 3),
                'origen_vertice_2_px': [round(float(chk['params'][2]), 2), round(float(chk['params'][3]), 2)],
                'chamfer_px': {'total': round(chk['cost'][0], 3), 'poligono_a_linea': round(chk['cost'][1], 3), 'linea_a_poligono': round(chk['cost'][2], 3)},
                'vertices_px_921x522': [[round(x, 2), round(y, 2)] for x, y in Vy],
                'diferencia_por_vertice_px': d.round(2).tolist(),
                'diferencia_por_vertice_m': (d / p[0]).round(2).tolist(),
            }
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: res[k] for k in ('escala_px_por_m', 'rotacion_residual_deg', 'origen_vertice_2_px', 'chamfer_px')}, ensure_ascii=False))
    if 'control_mensura' in res:
        print('control mensura: diferencias (px)', res['control_mensura']['diferencia_por_vertice_px'])
    if debug:
        k = 2
        big = cv2.resize(img, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
        big[cv2.resize(skel, None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST) > 0] = (255, 0, 255)
        cv2.polylines(big, [np.round(V * k * 4).astype(np.int32)], True, (107, 166, 201), 2, cv2.LINE_AA, 2)
        if 'control_mensura' in res:
            Vy = np.array(res['control_mensura']['vertices_px_921x522'])
            cv2.polylines(big, [np.round(Vy * k * 4).astype(np.int32)], True, (0, 220, 255), 1, cv2.LINE_AA, 2)
        cv2.imwrite(debug, big)


if __name__ == '__main__':
    main()
