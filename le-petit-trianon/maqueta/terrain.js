/* Paraways · Le Petit Trianon — terreno compartido (relieve) y utilidades de coordenadas.
   Plano en metros: X hacia el este (lado "Derechos del vendedor"), Y hacia el fondo (norte del plano).
   Mundo three.js: x = X, y = altura, z = -Y.  1 unidad = 1 metro. */
(function () {
  'use strict';
  window.PW = window.PW || {};
  const D = window.PW_DATA;

  /* Ruido de valor determinista (misma superficie en todos los módulos y sesiones). */
  function hash(ix, iy) {
    let h = (ix * 374761393 + iy * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  /* Distancia aproximada al polígono del terreno (0 dentro) para suavizar el relieve exterior. */
  const site = D.site.polygon;
  function inside(x, y) {
    let c = false;
    for (let i = 0, j = site.length - 1; i < site.length; j = i++) {
      const xi = site[i][0], yi = site[i][1], xj = site[j][0], yj = site[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
  }
  function distToSite(x, y) {
    if (inside(x, y)) return 0;
    let best = 1e9;
    for (let i = 0, j = site.length - 1; i < site.length; j = i++) {
      const ax = site[j][0], ay = site[j][1], bx = site[i][0], by = site[i][1];
      const vx = bx - ax, vy = by - ay, wx = x - ax, wy = y - ay;
      const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / (vx * vx + vy * vy)));
      const dx = ax + t * vx - x, dy = ay + t * vy - y;
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    return best;
  }

  /* Eje del camino vecinal: desde V2 (esquina ruta) siguiendo el lado oeste del predio (V2→V3) y más allá. */
  const CAM_A = [site[1][0], site[1][1]];
  const CAM_V = [site[2][0] - site[1][0], site[2][1] - site[1][1]];
  const CAM_L0 = Math.hypot(CAM_V[0], CAM_V[1]);
  const CAM_D = [CAM_V[0] / CAM_L0, CAM_V[1] / CAM_L0];
  const CAM_L = CAM_L0 + 30;
  CAM_A[0] -= CAM_D[0] * 6; CAM_A[1] -= CAM_D[1] * 6;

  /* Altura del terreno (m). El predio sube suavemente hacia el fondo (2 %) con una ondulación muy leve;
     afuera del predio el campo ondula más, con transición suave. La ruta y el camino vecinal se aplanan. */
  function elevation(x, y) {
    const base = 0.02 * Math.max(0, Math.min(96, y));
    const dist = distToSite(x, y);
    const w = Math.min(1, dist / 25);
    /* dentro del predio el suelo es un plano (los lotes apoyan exactos); la ondulación aparece afuera */
    const micro = (noise(x * 0.08 + 7.3, y * 0.08 + 2.1) - 0.5) * 0.5 * Math.min(1, dist / 6);
    const rolling = (noise(x * 0.02 + 11, y * 0.02 + 5) - 0.5) * 5 + (noise(x * 0.05 + 3, y * 0.05 + 9) - 0.5) * 1.2;
    let h = base + micro + w * rolling;
    if (y < 0.5) { const k = Math.min(1, (0.5 - y) / 6); h = h * (1 - k) + (-0.15) * k; } /* la ruta queda plana y apenas más baja */
    /* el camino vecinal (lado oeste, de V2 hacia el norte) también va sobre una franja plana */
    if (x < 6 && y > -8 && y < 75) {
      const px = x - CAM_A[0], py = y - CAM_A[1];
      const t = Math.max(0, Math.min(CAM_L, px * CAM_D[0] + py * CAM_D[1]));
      const dx = px - t * CAM_D[0], dy = py - t * CAM_D[1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < 11) { const k = d < 8 ? 1 : (11 - d) / 3; h = h * (1 - k) + base * k; }
    }
    return h;
  }

  PW.terrain = {
    elevation, noise, inside, distToSite,
    toWorld: function (x, y, lift) { return new THREE.Vector3(x, elevation(x, y) + (lift || 0), -y); },
    /* Rango de la maqueta: todo lo que se modela vive dentro de este rectángulo del plano. */
    extent: { x0: -70, x1: 140, y0: -60, y1: 160 },
  };

  /* Paleta de la casa (tokens de paraways.com) y verdes del render de la arquitecta. */
  PW.palette = {
    bordo: 0x6B1018, bordoVivo: 0xA81E2B, marfil: 0xF2EDE0, marfil2: 0xF8F4E8, oro: 0xB8935A, oroTinta: 0x7A5C28,
    oroClaro: 0xCFAD74, midnight: 0x0B1738, midnight2: 0x070E22, tinta: 0x1A1A1A,
    cesped: 0x7DAE4E, cespedOscuro: 0x5E9140, cespedClaro: 0x9CC66A, bosque: 0x3F7A3C, copaClara: 0x79B457,
    lapacho: 0xE9A2C9, lapachoOscuro: 0xD47FB0, tronco: 0x6E5033, piedra: 0x9A8E7A, piedraClara: 0xB9AE98,
    empedrado: 0x7A6E62, vereda: 0xCFC4AE, asfalto: 0x5A5651, agua: 0x4FA3C7, madera: 0xA47A46, muroBlanco: 0xF4F1E8,
  };

  /* Generador aleatorio con semilla (mulberry32) para que la vegetación sea idéntica en cada visita. */
  PW.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
})();
