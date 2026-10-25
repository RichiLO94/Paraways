/* Paraways · Le Petit Trianon — PW.textures
   Texturas procedurales tileables (CanvasTexture) para toda la maqueta + texto nítido (Sprite / plano).
   Sin imágenes externas, sin Math.random, sin fetch. Un solo archivo clásico; se registra en window.PW.textures.

   API
     PW.textures.build(ctx) → {
       get(name)          THREE.Texture memoizada (mapa de color sRGB; 'water' devuelve el mapa de normales lineal)
       bump(name)         THREE.Texture (escala de grises, lineal) o null si la textura no trae relieve
       normal(name)       mapa de normales (solo 'water') o null
       material(name, o)  MeshStandardMaterial listo: map + bump/normal con repeat o.repeat=[u,v], color, roughness, bumpScale
       box(w,h,d,name,o)  Mesh caja con 6 materiales (repeat por cara en metros)
       waterTick(dt)      desplaza el mapa de normales de la pileta (update() ya lo llama por frame)
       textSprite(text,o) / textPlane(text,o)   (atajos con THREE del ctx)
       tile               tabla {name: {m: metros por tile, bump: bumpScale sugerido, rough}}
       update(dt,t) setMode(mode) setNight(b) dispose()
     }
     PW.textures.textSprite(THREE, text, opts) → THREE.Sprite   (estático, sin build)
     PW.textures.textPlane(THREE, text, opts)  → THREE.Mesh     (estático, sin build)
     PW.textures.textTexture(THREE, text, opts) → { texture, aspect, width, height }
     opts de texto: { font:'serif'|'sans'|'mono'|cssFamily, size:48 (px), weight, color:'#1A1A1A', bg:null|'#...',
                      padding, radius, border, borderWidth, stroke, strokeWidth, lineHeight:1.2, letterSpacing,
                      dpr:2, sizeAttenuation:true, height:1 (unidades de mundo), width (alternativa a height),
                      depthTest:true, renderOrder, anisotropy, lit:false (textPlane: MeshStandardMaterial), side }

   Nombres: cobble (map+bump) · lawn · lawnDark · lawnMown · stone (map+bump) · slats (map+bump, opaco) ·
            slatsAlpha (map+bump, huecos transparentes) · deck (map+bump) · wood (map+bump, veta continua sin juntas) ·
            plaster (map+bump) · curtain (map+bump, cortina beige con pliegues verticales) · asphalt (map+bump) ·
            gravel (map+bump) · paver (map+bump, baldosón de vereda) · poolTile (map+bump) · water (normal animable)
   Los UV de ShapeGeometry son coordenadas de plano en metros → repeat = 1 / tile[name].m.
   Box/Plane tienen UV 0..1 → repeat = tamaño_en_metros / tile[name].m (material() y box() lo resuelven). */
(function () {
  'use strict';
  window.PW = window.PW || {};

  /* ---------- utilidades numéricas (deterministas) ---------- */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  function sstep(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hash(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + (seed | 0) * 1013904223) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }

  /* Ruido de valor periódico (fBm) en un campo S×S. cellsX/cellsY = celdas del primer octavo (el tile se repite
     sin costura porque la retícula se envuelve). Los octavos se suman con `gain`; resultado normalizado a 0..1. */
  function noiseField(S, cellsX, cellsY, octaves, seed, gain) {
    gain = gain === undefined ? 0.5 : gain;
    const out = new Float32Array(S * S);
    const x0 = new Int32Array(S), x1 = new Int32Array(S), tx = new Float32Array(S);
    let amp = 1, total = 0;
    for (let o = 0; o < octaves; o++) {
      const cx = Math.min(cellsX << o, S), cy = Math.min(cellsY << o, S);
      const L = new Float32Array(cx * cy);
      for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) L[j * cx + i] = hash(i, j, seed * 31 + o * 7 + 1);
      for (let x = 0; x < S; x++) { const f = x / S * cx, i = Math.floor(f); x0[x] = i % cx; x1[x] = (i + 1) % cx; tx[x] = smooth(f - i); }
      for (let y = 0; y < S; y++) {
        const f = y / S * cy, j = Math.floor(f), ya = (j % cy) * cx, yb = ((j + 1) % cy) * cx, ty = smooth(f - j), row = y * S;
        for (let x = 0; x < S; x++) {
          const a = L[ya + x0[x]], b = L[ya + x1[x]], c = L[yb + x0[x]], d = L[yb + x1[x]], t = tx[x];
          out[row + x] += amp * ((a + (b - a) * t) * (1 - ty) + (c + (d - c) * t) * ty);
        }
      }
      total += amp; amp *= gain;
    }
    const inv = 1 / total;
    for (let i = 0; i < out.length; i++) out[i] *= inv;
    return out;
  }

  /* Voronoi periódico: nx×ny celdas con jitter (jx, jy), hileras alternadas (stagger), estiramiento aleatorio por
     piedra (aniso) y deformación orgánica del dominio (warp, en celdas). Devuelve por píxel: distancia al centro f1,
     "borde" (f2 − f1, crece desde la junta) e id de celda para colorear cada piedra. */
  function voronoiField(S, nx, ny, o) {
    const seed = o.seed || 0, jx = o.jx === undefined ? 0.8 : o.jx, jy = o.jy === undefined ? 0.8 : o.jy;
    const N = nx * ny, px = new Float32Array(N), py = new Float32Array(N), ax = new Float32Array(N), ay = new Float32Array(N);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      px[k] = i + 0.5 + (hash(i, j, seed) - 0.5) * jx + (o.stagger && (j & 1) ? 0.5 : 0);
      py[k] = j + 0.5 + (hash(i, j, seed + 1) - 0.5) * jy;
      const s = o.aniso ? (hash(i, j, seed + 2) - 0.5) * o.aniso : 0;
      ax[k] = 1 + s; ay[k] = 1 - s;
    }
    const f1 = new Float32Array(S * S), edge = new Float32Array(S * S), id = new Int32Array(S * S);
    const wX = o.warp ? noiseField(S, 4, 4, 2, seed + 11) : null, wY = o.warp ? noiseField(S, 4, 4, 2, seed + 12) : null;
    const sx = S / nx, sy = S / ny, rx = o.stagger ? 2 : 1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x;
      let u = x / sx, v = y / sy;
      if (wX) { u += (wX[k] - 0.5) * o.warp; v += (wY[k] - 0.5) * o.warp; }
      const cu = Math.floor(u), cv = Math.floor(v);
      let d1 = 1e9, d2 = 1e9, best = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const cj = cv + dj, wj = ((cj % ny) + ny) % ny;
        for (let di = -rx; di <= rx; di++) {
          const ci = cu + di, wi = ((ci % nx) + nx) % nx, kk = wj * nx + wi;
          const ddx = (u - (px[kk] + ci - wi)) * sx * ax[kk], ddy = (v - (py[kk] + cj - wj)) * sy * ay[kk];
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d < d1) { d2 = d1; d1 = d; best = kk; } else if (d < d2) d2 = d;
        }
      }
      f1[k] = d1; edge[k] = d2 - d1; id[k] = best;
    }
    return { f1, edge, id };
  }

  /* Escritor de píxeles: devuelve {map, bump} con ImageData listos y una función put(k, r,g,b, a, h). */
  function pixels(S, withBump) {
    const map = canvas(S), mc = map.getContext('2d'), mi = mc.createImageData(S, S), md = mi.data;
    let bump = null, bc = null, bi = null, bd = null;
    if (withBump) { bump = canvas(S); bc = bump.getContext('2d'); bi = bc.createImageData(S, S); bd = bi.data; }
    return {
      map, bump,
      put(k, r, g, b, a, h) {
        const i = k * 4;
        md[i] = r < 0 ? 0 : r > 255 ? 255 : r; md[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g; md[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b; md[i + 3] = a;
        if (bd) { const v = h < 0 ? 0 : h > 255 ? 255 : h; bd[i] = v; bd[i + 1] = v; bd[i + 2] = v; bd[i + 3] = 255; }
      },
      done() { mc.putImageData(mi, 0, 0); if (bc) bc.putImageData(bi, 0, 0); return { map, bump }; },
    };
  }

  /* ---------- generadores ---------- */

  /* Calle empedrada paraguaya: piedra irregular gris-cálida, juntas de tierra más oscuras, leve variación de tono. */
  function genCobble(S, seed) {
    const n = 14, V = voronoiField(S, n, n, { jx: 0.85, jy: 0.85, aniso: 0.35, warp: 0.28, seed });
    const grain = noiseField(S, 40, 40, 3, seed + 5), mott = noiseField(S, 3, 3, 2, seed + 6), wear = noiseField(S, 9, 9, 2, seed + 8);
    const tones = [hex(0x9A9185), hex(0xA49B8E), hex(0x8F867A), hex(0x9E978C), hex(0xA9A094), hex(0x948B7E), hex(0x9D9183)];
    const joint = hex(0x6A6156), jw = S / n * 0.085;
    const P = pixels(S, true);
    for (let k = 0; k < S * S; k++) {
      const id = V.id[k], e = V.edge[k], f = V.f1[k];
      const st = sstep(jw * 0.55, jw * 1.7, e);
      const ratio = f / (f + e + 0.001), dome = 1 - 0.42 * ratio * ratio;
      const t = tones[Math.floor(hash(id, 3, seed) * tones.length)], vary = 0.93 + 0.14 * hash(id, 4, seed);
      const g = (0.88 + 0.24 * grain[k]) * (0.95 + 0.10 * mott[k]) * (0.96 + 0.08 * wear[k]) * vary * (0.8 + 0.2 * dome);
      const jg = 0.78 + 0.44 * grain[k];
      P.put(k, lerp(joint[0] * jg, t[0] * g, st), lerp(joint[1] * jg, t[1] * g, st), lerp(joint[2] * jg, t[2] * g, st), 255,
        (st * dome * 0.86 + grain[k] * 0.14) * 255);
    }
    return P.done();
  }

  /* Césped fino: dos tonos del render, parches suaves, grano de hojas, sin bandas. kind: 'light' | 'dark'; mown: franjas de corte. */
  function genLawn(S, kind, mown, seed) {
    const patches = noiseField(S, 3, 3, 3, seed + 1), fine = noiseField(S, 96, 96, 2, seed + 2), blades = noiseField(S, 48, 160, 2, seed + 3);
    const light = kind === 'dark' ? hex(0x8ABA5A) : hex(0xA9D074), dark = kind === 'dark' ? hex(0x66994A) : hex(0x82B256);
    const dry = hex(0xC9C672);
    const P = pixels(S, false);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x;
      let t = 0.32 + 0.5 * patches[k] + (fine[k] - 0.5) * 0.55 + (blades[k] - 0.5) * 0.35;
      if (mown) t += Math.sin((x / S + y / S * 0.08) * Math.PI * 2 * 4) * 0.07;
      t = clamp(t, 0, 1);
      let r = lerp(dark[0], light[0], t), g = lerp(dark[1], light[1], t), b = lerp(dark[2], light[2], t);
      if (hash(x, y, seed + 9) > 0.9965) { r = lerp(r, dry[0], 0.55); g = lerp(g, dry[1], 0.55); b = lerp(b, dry[2], 0.55); }
      P.put(k, r, g, b, 255, 0);
    }
    return P.done();
  }

  /* Muro de piedra apilada (gris cálido, como el muro bajo del render de la ruta) con junta en sombra. */
  function genStone(S, seed) {
    const nx = 6, ny = 13, V = voronoiField(S, nx, ny, { jx: 0.7, jy: 0.3, stagger: true, aniso: 0.2, warp: 0.2, seed });
    const grain = noiseField(S, 48, 48, 3, seed + 5), mott = noiseField(S, 4, 4, 2, seed + 6);
    const tones = [hex(0x9C978E), hex(0x8F8980), hex(0xA7A197), hex(0x868179), hex(0xADA69B), hex(0x97918A), hex(0xA19A8F)];
    const mortar = hex(0x66605A), jw = S / ny * 0.12;
    const P = pixels(S, true);
    for (let k = 0; k < S * S; k++) {
      const id = V.id[k], e = V.edge[k], f = V.f1[k];
      const st = sstep(jw * 0.5, jw * 1.6, e);
      const ratio = f / (f + e + 0.001), dome = 1 - 0.38 * Math.pow(ratio, 1.6);
      const t = tones[Math.floor(hash(id, 3, seed) * tones.length)], vary = 0.93 + 0.14 * hash(id, 4, seed);
      const g = (0.88 + 0.24 * grain[k]) * (0.95 + 0.1 * mott[k]) * vary * (0.8 + 0.2 * dome);
      const jg = 0.7 + 0.5 * grain[k];
      P.put(k, lerp(mortar[0] * jg, t[0] * g, st), lerp(mortar[1] * jg, t[1] * g, st), lerp(mortar[2] * jg, t[2] * g, st), 255,
        (st * dome * 0.88 + grain[k] * 0.12) * 255);
    }
    return P.done();
  }

  /* Cerco de varas verticales (caña / madera curada): 24 varas por tile, perfil cilíndrico, veta vertical. alpha → huecos transparentes. */
  function genSlats(S, alpha, seed) {
    const n = 24, gap = 0.17, w = 1 - gap, slatPx = S / n * w;
    const grain = noiseField(S, 160, 10, 3, seed + 1), ring = noiseField(S, 12, 3, 2, seed + 2);
    const tones = [hex(0xA89A82), hex(0xB5A890), hex(0x968A74), hex(0xAFA189), hex(0xBDB098), hex(0x9E9179)];
    const dark = hex(0x2A2520);
    const P = pixels(S, true);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x, sx = x / S * n, i = Math.floor(sx), f = sx - i;
      const distEdge = Math.min(f, w - f) * S / n;      /* px hasta el borde de la vara (negativo en el hueco) */
      const cover = sstep(-0.8, 0.8, distEdge);
      const prof = Math.sin(Math.PI * clamp(f / w, 0, 1));
      const t = tones[Math.floor(hash(i, 1, seed) * tones.length)], vary = 0.9 + 0.2 * hash(i, 2, seed);
      const g = (0.84 + 0.3 * grain[k]) * (0.93 + 0.14 * ring[k]) * vary * (0.7 + 0.3 * prof);
      const r = t[0] * g, gg = t[1] * g, b = t[2] * g;
      if (alpha) P.put(k, r, gg, b, cover * 255, prof * cover * 255);
      else P.put(k, lerp(dark[0], r, cover), lerp(dark[1], gg, cover), lerp(dark[2], b, cover), 255, prof * cover * 255);
    }
    const out = P.done(); out.alpha = !!alpha; void slatPx; return out;
  }

  /* Deck de madera: 8 tablas por tile, cortes alternados, veta a lo largo. */
  function genDeck(S, seed) {
    const rows = 8, rowPx = S / rows, seam = 2.2;
    const grain = noiseField(S, 5, 140, 3, seed + 1), ring = noiseField(S, 2, 24, 2, seed + 2);
    const tones = [hex(0xA67C48), hex(0xB78955), hex(0x977140), hex(0xAE845A), hex(0x8F6B3D), hex(0xBD9160)];
    const seamC = hex(0x4A3826);
    const P = pixels(S, true);
    for (let y = 0; y < S; y++) {
      const fy = y / rowPx, r = Math.floor(fy), fr = fy - r, dEdge = Math.min(fr, 1 - fr) * rowPx;
      const brk = hash(r, 7, seed);
      for (let x = 0; x < S; x++) {
        const k = y * S + x, u = x / S;
        const seg = u > brk ? 1 : 0, dBrk = Math.abs(u - brk) * S;
        const inPlank = sstep(seam, seam + 1.6, dEdge) * sstep(seam * 0.6, seam * 0.6 + 1.4, dBrk);
        const pid = r * 2 + seg, t = tones[Math.floor(hash(pid, 3, seed) * tones.length)], vary = 0.9 + 0.2 * hash(pid, 4, seed);
        const g = (0.84 + 0.3 * grain[k]) * (0.92 + 0.16 * ring[k]) * vary;
        P.put(k, lerp(seamC[0], t[0] * g, inPlank), lerp(seamC[1], t[1] * g, inPlank), lerp(seamC[2], t[2] * g, inPlank), 255,
          (inPlank * (0.88 + 0.08 * hash(pid, 5, seed)) + grain[k] * 0.08) * 255);
      }
    }
    return P.done();
  }

  /* Madera maciza sin juntas (vigas, pilares, puertas, bancos): veta continua a lo largo de u, anillos suaves y
     cambio de tono lento. Tile cuadrado; el eje largo de cada pieza debe ir en u (PW.architecture lo resuelve por cara). */
  function genWood(S, seed) {
    const grain = noiseField(S, 2, 96, 3, seed + 1, 0.55), ring = noiseField(S, 1, 18, 2, seed + 2), tone = noiseField(S, 1, 5, 1, seed + 3);
    const pores = noiseField(S, 48, 160, 1, seed + 4);
    const a = hex(0xB08A58), b = hex(0x8A6436), knot = hex(0x6E4A26);
    const P = pixels(S, true);
    for (let k = 0; k < S * S; k++) {
      const t = clamp(0.25 + 0.5 * tone[k] + (grain[k] - 0.5) * 0.9 + (ring[k] - 0.5) * 0.5, 0, 1);
      const dark = pores[k] > 0.72 ? (pores[k] - 0.72) * 1.2 : 0;
      const r = lerp(lerp(b[0], a[0], t), knot[0], dark), g = lerp(lerp(b[1], a[1], t), knot[1], dark), bl = lerp(lerp(b[2], a[2], t), knot[2], dark);
      P.put(k, r, g, bl, 255, (0.5 + (grain[k] - 0.5) * 0.7 - dark * 0.3) * 255);
    }
    return P.done();
  }

  /* Revoque blanco cálido (marfil) con grano apenas perceptible. */
  function genPlaster(S, seed) {
    const base = hex(0xF4F1E8), mott = noiseField(S, 5, 5, 3, seed + 1), fine = noiseField(S, 128, 128, 2, seed + 2);
    const P = pixels(S, true);
    for (let k = 0; k < S * S; k++) {
      const g = 0.965 + 0.045 * mott[k] + (fine[k] - 0.5) * 0.045;
      P.put(k, base[0] * g, base[1] * g, base[2] * g, 255, (0.5 + (fine[k] - 0.5) * 0.6) * 255);
    }
    return P.done();
  }

  /* Cortina beige (lino) con pliegues verticales suaves: el tono sube en la cresta y baja en el valle de cada pliegue;
     trama fina de tela. Los pliegues corren a lo largo de v (la altura); el tile se repite sin costura en u. */
  function genCurtain(S, seed) {
    const base = hex(0xD9CCB2), wave = noiseField(S, 1, 6, 2, seed + 1), weave = noiseField(S, 160, 160, 1, seed + 2), tone = noiseField(S, 3, 2, 2, seed + 3);
    const folds = 8, P = pixels(S, true);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const ph = x / S * folds * Math.PI * 2 + (wave[k] - 0.5) * 1.6;
      const f = 0.5 + 0.5 * Math.cos(ph);                              /* 1 en la cresta, 0 en el valle */
      const g = (0.8 + 0.22 * f) * (0.96 + 0.08 * tone[k]) * (0.97 + 0.06 * weave[k]);
      P.put(k, base[0] * g, base[1] * g, base[2] * g, 255, (0.3 + 0.55 * f + (weave[k] - 0.5) * 0.1) * 255);
    }
    return P.done();
  }

  /* Asfalto con grano y agregados claros aislados. */
  function genAsphalt(S, seed) {
    const base = hex(0x6E6C68), grain = noiseField(S, 96, 96, 3, seed + 1), mott = noiseField(S, 4, 4, 2, seed + 2);
    const P = pixels(S, true);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x;
      const speck = hash(x, y, seed + 3) > 0.975 ? 10 + 16 * hash(x, y, seed + 4) : 0;
      const g = (0.9 + 0.2 * grain[k]) * (0.95 + 0.1 * mott[k]);
      P.put(k, base[0] * g + speck, base[1] * g + speck, base[2] * g + speck, 255, (grain[k] * 0.7 + 0.15 + speck / 60) * 255);
    }
    return P.done();
  }

  /* Ripio claro: piedritas (Voronoi fino) sobre arena. */
  function genGravel(S, seed) {
    const n = 36, V = voronoiField(S, n, n, { jx: 0.9, jy: 0.9, aniso: 0.45, seed });
    const grain = noiseField(S, 64, 64, 3, seed + 5);
    const tones = [hex(0xD2C9B5), hex(0xBFB5A0), hex(0xDBD4C2), hex(0xABA391), hex(0xC7BEA9), hex(0xB5AB96), hex(0xCDC2AB)];
    const sand = hex(0xB6AD99), jw = S / n * 0.2;
    const P = pixels(S, true);
    for (let k = 0; k < S * S; k++) {
      const id = V.id[k], e = V.edge[k], f = V.f1[k];
      const st = sstep(jw * 0.5, jw * 1.5, e), ratio = f / (f + e + 0.001), dome = 1 - 0.5 * ratio * ratio;
      const t = tones[Math.floor(hash(id, 3, seed) * tones.length)], vary = 0.92 + 0.16 * hash(id, 4, seed);
      const g = (0.9 + 0.2 * grain[k]) * vary * (0.84 + 0.16 * dome), sg = 0.9 + 0.2 * grain[k];
      P.put(k, lerp(sand[0] * sg, t[0] * g, st), lerp(sand[1] * sg, t[1] * g, st), lerp(sand[2] * sg, t[2] * g, st), 255,
        (0.25 + st * dome * 0.6 + grain[k] * 0.15) * 255);
    }
    return P.done();
  }

  /* Baldosón de vereda (3×3 por tile, hormigón claro con junta y chaflán). */
  function genPaver(S, seed) {
    const n = 3, cell = S / n, seam = 2.5, base = hex(0xCFC4AE);
    const grain = noiseField(S, 64, 64, 3, seed + 1), mott = noiseField(S, 6, 6, 2, seed + 2);
    const seamC = hex(0x8E8676);
    const P = pixels(S, true);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x, fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy);
      const d = Math.min(fx - i, i + 1 - fx, fy - j, j + 1 - fy) * cell;
      const inSlab = sstep(seam, seam + 1.5, d), chamfer = sstep(seam, seam + cell * 0.08, d);
      const vary = 0.95 + 0.1 * hash(i, j, seed), speck = hash(x, y, seed + 3) > 0.985 ? 8 : 0;
      const g = (0.9 + 0.2 * grain[k]) * (0.96 + 0.08 * mott[k]) * vary;
      P.put(k, lerp(seamC[0], base[0] * g + speck, inSlab), lerp(seamC[1], base[1] * g + speck, inSlab), lerp(seamC[2], base[2] * g + speck, inSlab), 255,
        (0.15 + chamfer * 0.75 + grain[k] * 0.1) * 255);
    }
    return P.done();
  }

  /* Venecitas de pileta (10×10 por tile), celeste del render con junta clara. */
  function genPoolTile(S, seed) {
    const n = 10, cell = S / n, grout = 1.6;
    const tones = [hex(0x7CC4DC), hex(0x6AB8D4), hex(0x8CCCE0), hex(0x5FAECC), hex(0x76BED8), hex(0x84C8DE)];
    const groutC = hex(0xE6F1F4), grain = noiseField(S, 64, 64, 2, seed + 1);
    const P = pixels(S, true);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x, fx = x / cell, fy = y / cell, i = Math.floor(fx), j = Math.floor(fy);
      const d = Math.min(fx - i, i + 1 - fx, fy - j, j + 1 - fy) * cell, inTile = sstep(grout, grout + 1.2, d);
      const t = tones[Math.floor(hash(i, j, seed) * tones.length)], g = 0.95 + 0.1 * grain[k] + (fy - j) * 0.04;
      P.put(k, lerp(groutC[0], t[0] * g, inTile), lerp(groutC[1], t[1] * g, inTile), lerp(groutC[2], t[2] * g, inTile), 255, (0.55 + inTile * 0.45) * 255);
    }
    return P.done();
  }

  /* Agua: mapa de normales periódico (ondas largas + rizado), lineal. Se anima desplazando offset. */
  function genWater(S, seed) {
    const H = new Float32Array(S * S), rip = noiseField(S, 6, 6, 4, seed + 1, 0.55);
    const waves = [[3, 2, 1.0, 0.0], [-2, 5, 0.6, 1.3], [6, -1, 0.35, 2.1], [1, 1, 1.2, 0.7], [-4, -3, 0.45, 2.8]];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S; let h = 0;
      for (let i = 0; i < waves.length; i++) { const w = waves[i]; h += w[2] * Math.sin(Math.PI * 2 * (w[0] * u + w[1] * v) + w[3]); }
      H[y * S + x] = h + (rip[y * S + x] - 0.5) * 1.8;
    }
    let maxG = 1e-6;
    const gx = new Float32Array(S * S), gy = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x, xa = y * S + ((x + S - 1) % S), xb = y * S + ((x + 1) % S), ya = ((y + S - 1) % S) * S + x, yb = ((y + 1) % S) * S + x;
      gx[k] = H[xb] - H[xa]; gy[k] = H[yb] - H[ya];
      const m = Math.max(Math.abs(gx[k]), Math.abs(gy[k])); if (m > maxG) maxG = m;
    }
    const kS = 0.55 / maxG, cv = canvas(S), c = cv.getContext('2d'), im = c.createImageData(S, S), d = im.data;
    for (let k = 0; k < S * S; k++) {
      let nx = -gx[k] * kS, ny = gy[k] * kS, nz = 1; const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz); nx *= inv; ny *= inv; nz *= inv;
      d[k * 4] = nx * 127.5 + 127.5; d[k * 4 + 1] = ny * 127.5 + 127.5; d[k * 4 + 2] = nz * 127.5 + 127.5; d[k * 4 + 3] = 255;
    }
    c.putImageData(im, 0, 0);
    return { normal: cv };
  }

  /* ---------- texto nítido ---------- */
  const FONTS = {
    serif: "'Newsreader', Georgia, 'Times New Roman', serif",
    sans: "Inter, Arial, Helvetica, sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  };
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function textTexture(THREE, text, o) {
    o = o || {};
    const dpr = o.dpr || 2, size = o.size || 48, weight = o.weight || 500, lh = (o.lineHeight || 1.2) * size;
    const family = FONTS[o.font] || o.font || o.fontFamily || FONTS.sans, font = weight + ' ' + size + 'px ' + family;
    const lines = String(text).split('\n'), pad = o.padding !== undefined ? o.padding : (o.bg ? size * 0.5 : Math.ceil(size * 0.12));
    const sw = o.stroke ? (o.strokeWidth || size * 0.12) : 0;
    const meas = canvas(8, 8).getContext('2d'); meas.font = font;
    if (o.letterSpacing !== undefined && 'letterSpacing' in meas) meas.letterSpacing = o.letterSpacing + 'px';
    let maxW = 0; for (const l of lines) maxW = Math.max(maxW, meas.measureText(l).width);
    const W = Math.ceil(maxW + 2 * pad + sw * 2), H = Math.ceil(lines.length * lh + 2 * pad + sw * 2 - (lh - size) * 0.3);
    const cv = canvas(Math.ceil(W * dpr), Math.ceil(H * dpr)), c = cv.getContext('2d');
    c.scale(dpr, dpr);
    if (o.bg) {
      c.fillStyle = o.bg; roundRect(c, 0.5, 0.5, W - 1, H - 1, o.radius !== undefined ? o.radius : size * 0.35); c.fill();
      if (o.border) { c.lineWidth = o.borderWidth || Math.max(1, size * 0.04); c.strokeStyle = o.border; c.stroke(); }
    }
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    if (o.letterSpacing !== undefined && 'letterSpacing' in c) c.letterSpacing = o.letterSpacing + 'px';
    const cx = W / 2, top = (H - lines.length * lh) / 2 + lh / 2;
    lines.forEach((l, i) => {
      if (sw) { c.lineJoin = 'round'; c.lineWidth = sw * 2; c.strokeStyle = o.stroke; c.strokeText(l, cx, top + i * lh); }
      c.fillStyle = o.color || '#1A1A1A'; c.fillText(l, cx, top + i * lh);
    });
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = o.anisotropy || 4; tex.needsUpdate = true; tex.userData.text = true;
    return { texture: tex, aspect: W / H, width: W, height: H };
  }
  function textSprite(THREE, text, o) {
    o = o || {};
    const t = textTexture(THREE, text, o);
    const mat = new THREE.SpriteMaterial({ map: t.texture, transparent: true, depthTest: o.depthTest !== undefined ? o.depthTest : true,
      depthWrite: false, sizeAttenuation: o.sizeAttenuation !== undefined ? o.sizeAttenuation : true, toneMapped: false });
    const s = new THREE.Sprite(mat);
    const h = o.width ? o.width / t.aspect : (o.height || 1);
    s.scale.set(h * t.aspect, h, 1);
    if (o.center) s.center.set(o.center[0], o.center[1]);
    s.renderOrder = o.renderOrder !== undefined ? o.renderOrder : 10;
    s.userData.aspect = t.aspect; s.userData.textWidth = t.width; s.userData.textHeight = t.height; s.userData.texture = t.texture;
    return s;
  }
  function textPlane(THREE, text, o) {
    o = o || {};
    const t = textTexture(THREE, text, o);
    const h = o.width ? o.width / t.aspect : (o.height || 1);
    const geo = new THREE.PlaneGeometry(h * t.aspect, h);
    const mat = o.lit
      ? new THREE.MeshStandardMaterial({ map: t.texture, transparent: !o.bg, roughness: 0.85, metalness: 0, side: o.side || THREE.FrontSide, alphaTest: o.bg ? 0 : 0.02 })
      : new THREE.MeshBasicMaterial({ map: t.texture, transparent: !o.bg, side: o.side || THREE.FrontSide, toneMapped: false, alphaTest: o.bg ? 0 : 0.02 });
    const m = new THREE.Mesh(geo, mat);
    m.userData.aspect = t.aspect; m.userData.texture = t.texture;
    return m;
  }

  /* ---------- tabla de tiles (metros por repetición) y recetas ---------- */
  const TILE = {
    cobble: { m: 2.5, bump: 0.05, rough: 0.92 },
    lawn: { m: 4, bump: 0, rough: 1 }, lawnDark: { m: 4, bump: 0, rough: 1 }, lawnMown: { m: 4, bump: 0, rough: 1 },
    stone: { m: 2, bump: 0.06, rough: 0.95 },
    slats: { m: 1, bump: 0.02, rough: 0.9 }, slatsAlpha: { m: 1, bump: 0.02, rough: 0.9 },
    deck: { m: 1.2, bump: 0.015, rough: 0.8 },
    wood: { m: 1.5, bump: 0.008, rough: 0.72 },
    plaster: { m: 3, bump: 0.004, rough: 0.9 },
    curtain: { m: 1.2, bump: 0.012, rough: 1 },
    asphalt: { m: 4, bump: 0.015, rough: 0.98 },
    gravel: { m: 1.5, bump: 0.03, rough: 1 },
    paver: { m: 1.2, bump: 0.02, rough: 0.95 },
    poolTile: { m: 1, bump: 0.01, rough: 0.35 },
    water: { m: 4, bump: 0, rough: 0.12, normal: 0.45 },
  };
  const NAMES = Object.keys(TILE);
  function recipe(name, hiRes) {
    const S = hiRes ? 1024 : 512;
    switch (name) {
      case 'cobble': return genCobble(S, 101);
      case 'lawn': return genLawn(512, 'light', false, 202);
      case 'lawnDark': return genLawn(512, 'dark', false, 203);
      case 'lawnMown': return genLawn(512, 'light', true, 204);
      case 'stone': return genStone(S, 303);
      case 'slats': return genSlats(512, false, 404);
      case 'slatsAlpha': return genSlats(512, true, 404);
      case 'deck': return genDeck(512, 505);
      case 'wood': return genWood(512, 1212);
      case 'plaster': return genPlaster(512, 606);
      case 'curtain': return genCurtain(512, 1313);
      case 'asphalt': return genAsphalt(512, 707);
      case 'gravel': return genGravel(512, 808);
      case 'paver': return genPaver(512, 909);
      case 'poolTile': return genPoolTile(512, 1010);
      case 'water': return genWater(512, 1111);
      default: throw new Error('PW.textures: textura desconocida "' + name + '"');
    }
  }

  /* ---------- build ---------- */
  function build(ctx) {
    const THREE = ctx.THREE || window.THREE;
    const hiRes = ctx.quality !== 'low';
    const maxAniso = ctx.renderer && ctx.renderer.capabilities ? Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy() || 1) : 1;
    const cache = new Map(), clones = [];
    function makeTex(cv, linear) {
      const t = new THREE.CanvasTexture(cv);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = maxAniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      t.needsUpdate = true; return t;
    }
    function ensure(name) {
      let e = cache.get(name);
      if (!e) {
        const r = recipe(name, hiRes);
        e = { map: r.map ? makeTex(r.map, false) : null, bump: r.bump ? makeTex(r.bump, true) : null, normal: r.normal ? makeTex(r.normal, true) : null, alpha: !!r.alpha };
        cache.set(name, e);
      }
      return e;
    }
    function withRepeat(tex, rep) {
      if (!tex) return null;
      const c = tex.clone(); c.repeat.set(rep[0], rep[1]); c.needsUpdate = true; clones.push(c); return c;
    }
    const api = {
      tile: TILE, names: NAMES,
      get(name) { const e = ensure(name); return e.map || e.normal; },
      bump(name) { return ensure(name).bump; },
      normal(name) { return ensure(name).normal; },
      /* Material completo. o.repeat = [u, v] (repeticiones); si pasas o.meters = [ancho, alto] se calcula desde tile.m. */
      material(name, o) {
        o = o || {}; const e = ensure(name), T = TILE[name];
        const rep = o.repeat || (o.meters ? [o.meters[0] / T.m, o.meters[1] / T.m] : [1, 1]);
        const m = new THREE.MeshStandardMaterial({ color: o.color !== undefined ? o.color : 0xffffff, roughness: o.roughness !== undefined ? o.roughness : T.rough, metalness: 0 });
        if (e.map) m.map = withRepeat(e.map, rep);
        if (e.bump && o.bump !== false) { m.bumpMap = withRepeat(e.bump, rep); m.bumpScale = o.bumpScale !== undefined ? o.bumpScale : T.bump; }
        if (e.normal) { m.normalMap = withRepeat(e.normal, rep); const s = o.normalScale !== undefined ? o.normalScale : T.normal; m.normalScale = new THREE.Vector2(s, s); }
        if (e.alpha) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
        if (o.side !== undefined) m.side = o.side;
        if (o.transparent) { m.transparent = true; m.opacity = o.opacity !== undefined ? o.opacity : 1; }
        if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity || 1; }
        return m;
      },
      /* Caja con repetición correcta por cara (w,h,d en metros). Un cubo usa un solo material (1 draw call). */
      box(w, h, d, name, o) {
        o = o || {};
        const cube = Math.abs(w - h) < 1e-6 && Math.abs(h - d) < 1e-6;
        const mz = api.material(name, Object.assign({}, o, { meters: [w, h] }));
        const mx = cube ? mz : api.material(name, Object.assign({}, o, { meters: [d, h] })), my = cube ? mz : api.material(name, Object.assign({}, o, { meters: [w, d] }));
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cube ? mz : [mx, mx, my, my, mz, mz]);
        mesh.castShadow = o.castShadow !== false; mesh.receiveShadow = o.receiveShadow !== false;
        return mesh;
      },
      waterTick(dt) {
        const e = cache.get('water'); if (!e || !e.normal) return;
        e.normal.offset.x = (e.normal.offset.x + dt * 0.018) % 1; e.normal.offset.y = (e.normal.offset.y + dt * 0.011) % 1;
        for (let i = 0; i < clones.length; i++) { const c = clones[i]; if (c.source === e.normal.source) { c.offset.x = e.normal.offset.x; c.offset.y = e.normal.offset.y; } }
      },
      textSprite(text, o) { return textSprite(THREE, text, o); },
      textPlane(text, o) { return textPlane(THREE, text, o); },
      textTexture(text, o) { return textTexture(THREE, text, o); },
    };

    const group = new THREE.Group(); group.name = 'textures';
    if (ctx.scene) ctx.scene.add(group);
    if (ctx.demo === true) buildDemo(ctx, group, api, THREE);

    return Object.assign(api, {
      group,
      update(dt) { api.waterTick(dt); },
      setMode() {}, setNight() {},
      dispose() {
        group.traverse(o => { if (o.geometry) o.geometry.dispose(); const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []); ms.forEach(m => { if (m.map && m.map.userData && m.map.userData.text) m.map.dispose(); m.dispose(); }); });
        if (group.parent) group.parent.remove(group);
        clones.forEach(c => c.dispose()); clones.length = 0;
        cache.forEach(e => { if (e.map) e.map.dispose(); if (e.bump) e.bump.dispose(); if (e.normal) e.normal.dispose(); }); cache.clear();
      },
    });
  }

  /* ---------- demo (solo ctx.demo === true): muestrario + texturas aplicadas sobre la maqueta ---------- */
  function buildDemo(ctx, group, api, THREE) {
    const D = ctx.data, elevation = ctx.elevation, P = ctx.palette || {};
    if (!D || !elevation) return;
    function flat(coords, name, lift, o) {
      const sh = new THREE.Shape(coords.map(c => new THREE.Vector2(c[0], c[1])));
      const g = new THREE.ShapeGeometry(sh), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x, elevation(x, y) + lift, -y); }
      g.computeVertexNormals();
      const T = api.tile[name], m = new THREE.Mesh(g, api.material(name, Object.assign({ repeat: [1 / T.m, 1 / T.m] }, o || {})));
      m.receiveShadow = true; group.add(m); return m;
    }
    function gridPlane(x0, x1, y0, y1, lift, name, o) {
      const w = x1 - x0, h = y1 - y0, g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 3)));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2, y = p.getY(i) + (y0 + y1) / 2; p.setXYZ(i, x, elevation(x, y) + lift, -y); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, api.material(name, Object.assign({ meters: [w, h] }, o || {})));
      m.receiveShadow = true; group.add(m); return m;
    }
    function place(mesh, x, y, h, sink) { mesh.position.set(x, elevation(x, y) - (sink || 0) + h / 2, -y); group.add(mesh); return mesh; }

    /* Ruta (asfalto), camino vecinal (ripio), lotes (césped), vereda (baldosón), calle (empedrado). */
    gridPlane(-70, 140, D.ruta.asfalto.y1, D.ruta.asfalto.y0, 0.05, 'asphalt');
    const v2 = D.site.polygon[1], v3 = D.site.polygon[2], n = D.site.sides[1].n, cw = D.camino_vecinal.ancho;
    flat([v2, v3, [v3[0] + n[0] * cw, v3[1] + n[1] * cw], [v2[0] + n[0] * cw, v2[1] + n[1] * cw]], 'gravel', 0.07);
    D.lots.forEach((l, i) => flat(l.polygon, i % 2 ? 'lawnMown' : 'lawn', 0.1));
    flat(D.front.strip, 'lawnDark', 0.1);
    D.road.veredas.forEach(v => flat(v, 'paver', 0.12));
    flat(D.road.calle, 'cobble', 0.14);

    /* Cerco frontal: base de piedra + panel de varas con alpha; pilares de piedra en el portón. */
    const yw = D.front.y_wall, spans = [[0.3, D.front.gate.x0 - 0.35], [D.front.gate.x1 + 0.35, D.site.polygon[0][0] - 0.3]];
    spans.forEach(([a, b]) => {
      for (let x = a; x < b - 0.01; x += 12) {
        const len = Math.min(12, b - x), cx = x + len / 2;
        place(api.box(len, 0.7, 0.35, 'stone'), cx, yw, 0.7 + 0.3, 0.3);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.3), api.material('slatsAlpha', { meters: [len, 1.3] }));
        panel.castShadow = true; panel.receiveShadow = true; place(panel, cx, yw, 0.7 * 2 + 1.3, 0);
      }
    });
    [D.front.gate.x0 - 0.35, D.front.gate.x1 + 0.35].forEach(x => place(api.box(0.7, 2.3, 0.7, 'stone'), x, yw, 2.3 + 0.3, 0.3));
    /* Cartel con el nombre del proyecto sobre un muro de revoque (a la izquierda del portón). */
    const sign = place(api.box(8, 2.2, 0.5, 'plaster'), 25.3, yw, 2.2 + 0.3, 0.3);
    const label = api.textPlane(D.meta.proyecto.toUpperCase(), { font: 'serif', size: 64, weight: 600, color: '#F2EDE0', bg: '#0B1738', padding: 26, radius: 6, width: 6.4, letterSpacing: 6, border: '#B8935A', borderWidth: 2 });
    label.position.set(sign.position.x, sign.position.y + 0.15, sign.position.z + 0.26); group.add(label);

    /* Casa existente: volúmenes con revoque; pileta con venecitas, agua animada y deck de madera. */
    D.house.volumes.forEach(v => {
      const w = v.x1 - v.x0, d = v.y1 - v.y0;
      if (v.pergola) { place(api.box(w, 0.25, d, 'deck'), (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, v.h * 2 - 0.25, 0); return; }
      place(api.box(w, v.h + 0.3, d, 'plaster'), (v.x0 + v.x1) / 2, (v.y0 + v.y1) / 2, v.h + 0.3, 0.3);
    });
    const pl = D.house.pool, dk = pl.deck, pw = pl.x1 - pl.x0, pd = pl.y1 - pl.y0, pcx = (pl.x0 + pl.x1) / 2, pcy = (pl.y0 + pl.y1) / 2, pe = elevation(pcx, pcy);
    const basin = api.box(pw, 1.4, pd, 'poolTile', { side: THREE.BackSide, castShadow: false }); basin.position.set(pcx, pe - 0.6, -pcy); group.add(basin);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), api.material('water', { meters: [pw, pd], color: P.agua || 0x4FA3C7, transparent: true, opacity: 0.78 }));
    water.rotation.x = -Math.PI / 2; water.position.set(pcx, pe + 0.02, -pcy); group.add(water);
    [[dk.x0, dk.x1, dk.y0, pl.y0], [dk.x0, dk.x1, pl.y1, dk.y1], [dk.x0, pl.x0, pl.y0, pl.y1], [pl.x1, dk.x1, pl.y0, pl.y1]].forEach(([x0, x1, y0, y1]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), api.material('deck', { meters: [x1 - x0, y1 - y0] }));
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, pe + 0.12, -(y0 + y1) / 2); m.receiveShadow = true; group.add(m);
    });

    /* Etiquetas de lotes (número + superficie calculada sobre la mensura), con los textos y el formato numérico del idioma. */
    D.lots.forEach(l => {
      const s = api.textSprite(PW.i18n.t('lot.n', { n: l.id }) + '\n' + PW.i18n.fmt(l.area_drawn, 2) + PW.i18n.t('unit.m2'),
        { font: 'serif', size: 44, weight: 600, color: '#F2EDE0', bg: 'rgba(11,23,56,0.86)', border: '#B8935A', borderWidth: 2, padding: 18, radius: 14, height: 4.2, lineHeight: 1.15 });
      s.position.set(l.label[0], elevation(l.label[0], l.label[1]) + 3.4, -l.label[1]); group.add(s);
    });

    /* Muestrario: una caja por textura al sur de la ruta, con su nombre en mono. */
    api.names.forEach((name, i) => {
      const x = -22 + i * 7.6, y = -36, size = 5;
      const box = name === 'water'
        ? new THREE.Mesh(new THREE.BoxGeometry(size, size, size), api.material('water', { meters: [size, size], color: P.agua || 0x4FA3C7 }))
        : api.box(size, size, size, name);
      box.castShadow = true; place(box, x, y, size, 0.2);
      const tag = api.textSprite(name, { font: 'mono', size: 40, weight: 600, color: '#F2EDE0', bg: '#6B1018', padding: 12, radius: 8, height: 1.6 });
      tag.position.set(x, elevation(x, y) + size + 1.3, -y); group.add(tag);
    });
  }

  PW.textures = {
    build, textSprite, textPlane, textTexture, tile: TILE, names: NAMES,
    /* Acceso directo a los lienzos (para pruebas): PW.textures.canvas(name, hiRes) → {map, bump, normal} */
    canvas(name, hiRes) { return recipe(name, hiRes !== false); },
  };
})();
