"""Alinea el polígono medido del predio (data.js → PW_DATA.site.polygon, en metros) con la vista aérea norte-arriba.

Uso (lo llama photo-clean.py; también funciona solo):
  python aerial-align.py <work> <data.js> <salida.json> [debug.png] [mensura-satelite.jpg]
    <work>      carpeta de trabajo de photo-clean.py, con:
                  aerea-linea.png          línea blanca original del video (unión de todos los cuadros registrados),
                                           en la geometría de referencia (960×544, norte-arriba)
                  aerea-linea-visible.png  zonas donde esa línea se pudo observar (fuera de los rótulos fijos)
                  aerea-geometria.json     homografía referencia → cuadro 550 (el de la captura raw/aerea.png)
                                           y tamaños de salida
    <data.js>   le-petit-trianon/maqueta/data.js
    <salida.json>  parámetros del ajuste y vértices en píxeles

Requiere Python 3 con opencv-contrib-python-headless (cv2 con ximgproc) y numpy.

Método
  1. La línea blanca que dibujó la inmobiliaria se toma ANTES de borrarla: photo-clean.py la acumula de los cuadros
     514–668 del video ya registrados sobre la referencia (cuadro 520, el último antes de que Google Earth empiece a
     girar: norte-arriba), sin los rótulos de pantalla. Se adelgaza a un esqueleto de 1 px.
  2. El polígono medido se proyecta con el norte de cuadrícula del plano: el eje +X tiene azimut geo.azimut_eje_x
     (54,06°) desde el norte, así que +X → (sin a, −cos a) y +Y → (−cos a, −sin a) = (−sin 35,94°, −cos 35,94°)
     en la imagen (x a la derecha, y hacia abajo). Convergencia de cuadrícula UTM 21S en el predio ≈ 0,1° (despreciable).
  3. Se buscan escala (px/m), traslación del origen (vértice 2) y una rotación residual (±3°) que minimizan la distancia
     de chamfer simétrica y truncada entre el borde del polígono y el esqueleto (rejilla gruesa + búsqueda por patrones).
     Las muestras del borde que caen donde la línea nunca fue visible no cuentan.
  4. Control opcional (no cambia el dibujo): si se pasa la hoja satelital de la mensura con el polígono amarillo
     (no se publica en el repo), se registra sobre la aérea limpia y se repite el ajuste; se informa la diferencia
     por vértice.
  Escribe parámetros, métricas y los seis vértices en: la referencia 960×544, la captura raw 921×522 (cuadro 550 del
  video reescalado), y los tamaños de salida 1280×725 y 800×453 (centros de píxel: x' = (x + 0,5)·k − 0,5).
"""
import json
import math
import sys

import cv2
import numpy as np

TAU = 12.0
NOMBRES = ['a (frente, lindero este)', '2 (origen: frente / camino vecinal)', 'n1', 'n2', 'c (fondo oeste)', 'b (fondo este)']


def load_polygon(data_js):
    s = open(data_js, encoding='utf-8').read()
    d = json.loads(s[s.index('{'):s.rstrip().rindex('}') + 1])
    return np.array(d['site']['polygon'], float), float(d['geo']['azimut_eje_x'])


class Model:
    def __init__(self, poly, az):
        a = math.radians(az)
        self.ex = np.array([math.sin(a), -math.cos(a)])
        self.ey = np.array([-math.cos(a), -math.sin(a)])
        self.base = poly[:, :1] * self.ex + poly[:, 1:] * self.ey     # metros → dirección en píxeles

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


def make_cost(model, skel, seen):
    H, W = skel.shape
    dt = cv2.distanceTransform(255 - skel, cv2.DIST_L2, 5)
    sy, sx = np.nonzero(skel)

    def cost(p):
        V = model.pts(p)
        S = edge_samples(V)
        xi, yi = np.round(S[:, 0]).astype(int), np.round(S[:, 1]).astype(int)
        ok = (xi >= 0) & (xi < W) & (yi >= 0) & (yi < H)
        xi, yi = xi[ok], yi[ok]
        keep = seen[yi, xi] > 0
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
        while steps[2] > 0.04:
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
            for dx, dy in ((0, 0), (5, 5), (-5, -5), (5, -5), (-5, 5)):
                c, q = local(np.array([p0[0] + ds, th, p0[2] + dx, p0[3] + dy], float))
                if best is None or c < best[0]:
                    best = (c, q)
    return best[1]


def procrustes_init(model, corners):
    P, Q = model.base, np.array(corners, float)
    mp, mq = P.mean(0), Q.mean(0)
    U, S, Vt = np.linalg.svd((P - mp).T @ (Q - mq))
    R = (U @ Vt).T
    s = S.sum() / ((P - mp) ** 2).sum()
    th = math.degrees(math.atan2(R[1, 0], R[0, 0]))
    t = mq - s * (R @ mp)
    return np.array([s, max(-3, min(3, th)), t[0], t[1]])


def map_h(H, V):
    P = np.c_[V, np.ones(len(V))] @ np.asarray(H).T
    return P[:, :2] / P[:, 2:]


def to_size(V, src, dst):
    kx, ky = dst[0] / src[0], dst[1] / src[1]
    return [[round((x + 0.5) * kx - 0.5, 2), round((y + 0.5) * ky - 0.5, 2)] for x, y in V]


def surveyor_check(work, mensura_path, model, p0):
    """Control independiente: registra la hoja satelital de la mensura (foto de la hoja, polígono amarillo del
    agrimensor) sobre la aérea limpia con SIFT + RANSAC (homografía) y ajusta el mismo polígono al amarillo."""
    G = cv2.imread(f'{work}/aerea-limpia.png'); M = cv2.imread(mensura_path)
    if G is None or M is None:
        return None
    H, W = G.shape[:2]; mh, mw = M.shape[:2]
    hm = cv2.cvtColor(M, cv2.COLOR_BGR2HSV)
    yel = ((hm[..., 0] >= 18) & (hm[..., 0] <= 40) & (hm[..., 1] >= 110) & (hm[..., 2] >= 120)).astype(np.uint8) * 255
    mm = 255 - cv2.dilate(yel, np.ones((9, 9), np.uint8)); mm[:, int(mw * 0.955):] = 0; mm[int(mh * 0.955):, :] = 0
    sift = cv2.SIFT_create(6000)
    ka, da = sift.detectAndCompute(cv2.cvtColor(G, cv2.COLOR_BGR2GRAY), None)
    km, dm = sift.detectAndCompute(cv2.cvtColor(M, cv2.COLOR_BGR2GRAY), mm)
    good = [a for a, b in cv2.BFMatcher().knnMatch(dm, da, k=2) if a.distance < 0.75 * b.distance]
    src = np.float32([km[g.queryIdx].pt for g in good]); dst = np.float32([ka[g.trainIdx].pt for g in good])
    Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 2.5)
    wy = cv2.morphologyEx((cv2.warpPerspective(yel, Hm, (W, H)) > 100).astype(np.uint8) * 255, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    sk = cv2.ximgproc.thinning(wy)
    seen = (cv2.warpPerspective(np.full((int(mh * 0.955), int(mw * 0.955)), 255, np.uint8), Hm, (W, H)) > 128).astype(np.uint8) * 255
    cost = make_cost(model, sk, seen)
    p = optimise(cost, p0)
    return {'coincidencias': len(good), 'inliers': int(inl.sum()), 'params': p, 'cost': cost(p)}


def main():
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(1)
    work, data_js, out = sys.argv[1:4]
    debug = sys.argv[4] if len(sys.argv) > 4 else None
    mensura = sys.argv[5] if len(sys.argv) > 5 else None
    line = cv2.imread(f'{work}/aerea-linea.png', 0)
    seen = cv2.imread(f'{work}/aerea-linea-visible.png', 0)
    geo = json.load(open(f'{work}/aerea-geometria.json', encoding='utf-8'))
    H, W = line.shape
    skel = cv2.ximgproc.thinning(cv2.morphologyEx(line, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(skel, 8)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] < 15:
            skel[lab == j] = 0
    poly, az = load_polygon(data_js)
    model = Model(poly, az)
    cost = make_cost(model, skel, seen)
    p0 = procrustes_init(model, geo['esquinas_aprox_ref'])
    p = optimise(cost, p0)
    c = cost(p)
    V = model.pts(p)
    H550 = np.array(geo['H_ref_a_cuadro550'])
    V550 = map_h(H550, V)
    res = {
        'fuente': 'video de la inmobiliaria (parte 1), vista aérea de Google Earth; referencia = cuadro 520 (norte-arriba, '
                  'antes del giro de cámara), 960×544; polígono de data.js (site.polygon, metros) ajustado a la línea '
                  'blanca original acumulada de los cuadros 514–668 registrados',
        'azimut_eje_x_deg': az,
        'eje_x_px': model.ex.round(6).tolist(), 'eje_y_px': model.ey.round(6).tolist(),
        'escala_px_por_m_ref960': round(float(p[0]), 4),
        'rotacion_residual_deg': round(float(p[1]), 3),
        'origen_vertice_2_px_ref960': [round(float(p[2]), 2), round(float(p[3]), 2)],
        'chamfer_px': {'total': round(c[0], 3), 'poligono_a_linea': round(c[1], 3), 'linea_a_poligono': round(c[2], 3), 'truncado_en': TAU},
        'orden_vertices': NOMBRES,
        'vertices_px': {
            '960x544': [[round(x, 2), round(y, 2)] for x, y in V],
            '921x522': to_size(V550, (960, 544), (921, 522)),
        },
        'nota_921x522': 'coordenadas en la captura raw/aerea.png (= cuadro 550 del video reescalado a 921×522; ese cuadro '
                        'ya está girado ≈0,9° respecto del norte)',
        'convencion': "centros de píxel: x' = (x + 0,5)·k − 0,5",
        'imagen_limpia': geo.get('imagen_limpia'),
    }
    for (w, h) in geo['tamanos_salida']:
        res['vertices_px'][f'{w}x{h}'] = to_size(V, (W, H), (w, h))
    if mensura:
        chk = surveyor_check(work, mensura, model, p)
        if chk:
            Vm = model.pts(chk['params']); d = np.linalg.norm(V - Vm, axis=1)
            res['control_mensura'] = {
                'metodo': 'hoja satelital de la mensura (polígono amarillo del agrimensor) registrada sobre la aérea limpia '
                          '(SIFT + RANSAC, homografía) y mismo ajuste al amarillo; solo control, no se usa para dibujar',
                'coincidencias': chk['coincidencias'], 'inliers': chk['inliers'],
                'escala_px_por_m_ref960': round(float(chk['params'][0]), 4),
                'rotacion_residual_deg': round(float(chk['params'][1]), 3),
                'origen_vertice_2_px_ref960': [round(float(chk['params'][2]), 2), round(float(chk['params'][3]), 2)],
                'chamfer_px': {'total': round(chk['cost'][0], 3), 'poligono_a_linea': round(chk['cost'][1], 3), 'linea_a_poligono': round(chk['cost'][2], 3)},
                'diferencia_por_vertice_px_ref960': d.round(2).tolist(),
                'diferencia_por_vertice_m': (d / p[0]).round(2).tolist(),
            }
            print('control mensura: diferencias (m)', res['control_mensura']['diferencia_por_vertice_m'])
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: res[k] for k in ('escala_px_por_m_ref960', 'rotacion_residual_deg', 'origen_vertice_2_px_ref960', 'chamfer_px')}, ensure_ascii=False))
    if debug:
        ref = cv2.imread(f'{work}/aerea-referencia-original.png')
        k = 2
        big = cv2.resize(ref, None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)
        big[cv2.resize(skel, None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST) > 0] = (255, 0, 255)
        cv2.polylines(big, [np.round((V + 0.5) * k * 4 - 0.5 * 4).astype(np.int32)], True, (107, 166, 201), 2, cv2.LINE_AA, 2)
        cv2.imwrite(debug, big)


if __name__ == '__main__':
    main()
