/* Paraways · Le Petit Trianon — PW.vegetation (v3, acabado archviz)
   Vegetación de la maqueta con copas de TARJETAS DE HOJAS: cada árbol es un tronco con ramas (corteza procedural)
   más una nube de quads (24–60) repartidos en una elipsoide con orientación aleatoria y textura de racimo de hojas
   (CanvasTexture con alfa: hojas individuales con degradado, nervaduras y borde irregular; alphaTest 0,5, doble cara).
   Especies: copa ancha oscura (mango / ficus), copa clara (tipa / ibirá pytá), lapacho rosado (racimos de flores sobre
   ramas casi desnudas), palmera pindó (frondas recortadas por alfa, tronco anillado) y, en el entorno, un árbol alto.
   Además: tacuaral (cañas con nudos y hojas-tarjeta arriba), setos con textura de hojas densas (bump + borde superior
   dentado por alfa), topiarias esféricas, canteros de flores y pastizal / césped alto junto a la ruta (tarjetas cruzadas).
   Variación por instancia (escala, giro, tono: InstancedMesh con color por instancia), LOD por shader (a más de LOD_FAR
   metros de la cámara el árbol del entorno colapsa y lo reemplaza un impostor de 2 tarjetas cruzadas + 1 horizontal),
   viento sutil por uniforme de tiempo (solo tarjetas), noche desaturada. Colocación idéntica a la v2 (plano, calle,
   casa, isletas, portón, tacuaral, setos, frente, campo). Determinista con PW.rng. Sin Math.random, fetch ni imágenes. */
(function () {
  'use strict';
  window.PW = window.PW || {};

  PW.vegetation = {
    build: function (ctx) {
      const THREE = ctx.THREE, D = ctx.data, T = ctx.terrain, P = ctx.palette;
      const elevation = ctx.elevation || T.elevation;
      const makeRng = ctx.rng || PW.rng;
      const shadows = ctx.shadows !== false;
      const low = ctx.quality === 'low';
      const E = T.extent;
      const TEX = low ? 256 : 512;          /* atlas 2×2 de racimos */
      const LOD_FAR = low ? 90 : 150;       /* m: más lejos de la cámara, impostor (la vista maqueta orbita a 128 m) */
      const CARD_K = low ? 0.55 : 1;        /* tarjetas por copa (móvil: la mitad) */

      /* ------------------------------------------------------------------ utilidades 2D (plano) */
      function pip(x, y, poly) {
        let c = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c;
        }
        return c;
      }
      function distSeg(x, y, a, b) {
        const vx = b[0] - a[0], vy = b[1] - a[1], wx = x - a[0], wy = y - a[1];
        const l2 = vx * vx + vy * vy || 1e-9;
        const t = Math.max(0, Math.min(1, (vx * wx + vy * wy) / l2));
        const dx = a[0] + t * vx - x, dy = a[1] + t * vy - y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      function minEdgeDist(x, y, poly) {
        let best = 1e9;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, distSeg(x, y, poly[j], poly[i]));
        return best;
      }
      function insideMargin(x, y, poly, m) { return pip(x, y, poly) && minEdgeDist(x, y, poly) >= m; }
      function nearestOnPoly(x, y, poly) {
        let best = 1e9, bx = x, by = y;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[j], b = poly[i], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1e-9;
          const t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2));
          const px = a[0] + t * vx, py = a[1] + t * vy, d = Math.hypot(px - x, py - y);
          if (d < best) { best = d; bx = px; by = py; }
        }
        return [bx, by, best];
      }
      function hash3(a, b, c, s) {
        let h = (a * 374761393 + b * 668265263 + c * 2246822519 + s * 3266489917) | 0;
        h = (h ^ (h >>> 13)) * 1274126177;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      }
      function lerpHex(h1, h2, t) { const a = new THREE.Color(h1), b = new THREE.Color(h2); return a.lerp(b, t); }
      function shuffle(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }
      const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

      /* ================================================================== texturas procedurales (CanvasTexture) */
      const texs = [];
      function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      function mkTex(c, o) {
        o = o || {};
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping; t.wrapT = o.clampV ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        t.anisotropy = 4; texs.push(t); return t;
      }
      const rgb = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
      const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
      const css = (c, a) => 'rgba(' + Math.round(Math.min(255, c[0])) + ',' + Math.round(Math.min(255, c[1])) + ',' + Math.round(Math.min(255, c[2])) + ',' + (a === undefined ? 1 : a) + ')';
      /* fondo casi transparente teñido del color base por debajo de lo dibujado: los mipmaps no oscurecen los bordes */
      function underlay(c, base) { const x = c.getContext('2d'); x.globalCompositeOperation = 'destination-over'; x.fillStyle = css(base, 0.06); x.fillRect(0, 0, c.width, c.height); x.globalCompositeOperation = 'source-over'; }

      /* hoja: forma lanceolada de borde irregular, degradado base→punta, sombreado lateral y nervaduras insinuadas */
      function leaf(x, cx, cy, len, wid, ang, c0, c1, rnd, veins) {
        x.save(); x.translate(cx, cy); x.rotate(ang);
        const j = () => (rnd() - 0.5) * 0.5;
        x.beginPath(); x.moveTo(0, 0);
        x.bezierCurveTo(len * 0.22, -wid * (1 + j()), len * (0.62 + j() * 0.2), -wid * (0.95 + j()), len, 0);
        x.bezierCurveTo(len * (0.62 + j() * 0.2), wid * (0.95 + j()), len * 0.22, wid * (1 + j()), 0, 0);
        x.closePath();
        const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, css(c0)); g.addColorStop(1, css(c1));
        x.fillStyle = g; x.fill();
        const g2 = x.createLinearGradient(0, -wid, 0, wid); g2.addColorStop(0, 'rgba(255,255,255,0.16)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.3)');
        x.fillStyle = g2; x.fill();
        if (veins) {
          x.strokeStyle = css(mix3(c1, [255, 255, 255], 0.35), 0.55); x.lineWidth = Math.max(0.6, wid * 0.1);
          x.beginPath(); x.moveTo(len * 0.04, 0); x.lineTo(len * 0.95, 0); x.stroke();
          x.lineWidth = Math.max(0.5, wid * 0.06); x.strokeStyle = css(mix3(c1, [255, 255, 255], 0.3), 0.3);
          const nv = 3 + Math.floor(rnd() * 3);
          for (let i = 1; i <= nv; i++) { const t = i / (nv + 1), sx = len * t, L = wid * (1 - t * 0.6) * 0.8; x.beginPath(); x.moveTo(sx, 0); x.lineTo(sx + L * 0.7, -L * 0.8); x.moveTo(sx, 0); x.lineTo(sx + L * 0.7, L * 0.8); x.stroke(); }
        }
        x.restore();
      }
      /* flor de 5–6 pétalos con degradado y garganta */
      function flower(x, cx, cy, r, ang, cPetal, cCenter, rnd, petals) {
        x.save(); x.translate(cx, cy); x.rotate(ang);
        const n = petals || 5;
        for (let i = 0; i < n; i++) {
          const a = i * Math.PI * 2 / n, px = Math.cos(a) * r * 0.55, py = Math.sin(a) * r * 0.55;
          const g = x.createRadialGradient(px, py, 0, px, py, r * 0.55); g.addColorStop(0, css(mix3(cPetal, [255, 255, 255], 0.25))); g.addColorStop(1, css(shade(cPetal, 0.8)));
          x.fillStyle = g; x.beginPath(); x.ellipse(px, py, r * 0.52, r * 0.36, a, 0, Math.PI * 2); x.fill();
        }
        x.fillStyle = css(cCenter); x.beginPath(); x.arc(0, 0, r * 0.2, 0, Math.PI * 2); x.fill();
        x.restore();
      }
      /* atlas 2×2 de racimos: hojas (y flores) distribuidas en un disco con densidad decreciente → silueta irregular */
      function clusterAtlas(sp, seed) {
        const S = TEX, Tl = S / 2, c = cv(S, S), x = c.getContext('2d'), rnd = makeRng(seed);
        for (let q = 0; q < 4; q++) {
          const ox = (q & 1) * Tl, oy = (q >> 1) * Tl, cx = ox + Tl / 2, cy = oy + Tl / 2, R = Tl * sp.R;
          x.save(); x.beginPath(); x.rect(ox, oy, Tl, Tl); x.clip();
          const n = Math.round(sp.n * (0.85 + rnd() * 0.3)), items = [];
          for (let i = 0; i < n; i++) {
            const a = rnd() * Math.PI * 2, r = R * Math.pow(rnd(), sp.spread || 0.6);
            items.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a: a, d: rnd() });
          }
          items.sort((p, q2) => p.d - q2.d);
          items.forEach(it => {
            const k = 0.74 + 0.26 * it.d;                                          /* al fondo, más oscuro (VIS-08: menos que antes) */
            const len = Tl * sp.len * (0.75 + rnd() * 0.5), wid = len * sp.wid * (0.85 + rnd() * 0.3);
            const ang = Math.atan2(Math.sin(it.a) + (sp.hang || 0), Math.cos(it.a)) + (rnd() - 0.5) * sp.jit;
            const t = rnd(), c0 = shade(mix3(sp.c0, sp.c1, t), k), c1 = shade(mix3(sp.c1, sp.c2, t), Math.min(1, k * 1.08));
            leaf(x, it.x, it.y, len, wid, ang, c0, c1, rnd, sp.veins);
          });
          if (sp.flowers) {
            const F = sp.flowers;
            for (let k = 0; k < F.clusters; k++) {
              const a = rnd() * 6.283, r = R * 0.95 * Math.pow(rnd(), 0.5), fx = cx + Math.cos(a) * r, fy = cy + Math.sin(a) * r;
              for (let i = 0; i < F.per; i++) {
                const b = rnd() * 6.283, rr = Tl * F.spread * Math.sqrt(rnd()), col = rgb(F.cols[Math.floor(rnd() * F.cols.length)]);
                flower(x, fx + Math.cos(b) * rr, fy + Math.sin(b) * rr, Tl * F.r * (0.7 + rnd() * 0.6), rnd() * 6.283, shade(col, 0.82 + rnd() * 0.22), rgb(F.center), rnd, 5);
              }
            }
          }
          x.restore();
        }
        return c;
      }
      /* impostor (arriba: vista lateral con tronco; abajo: vista cenital), pintado con racimos del mismo atlas */
      function impostorTex(atlasC, sp, seed) {
        const W = low ? 128 : 256, c = cv(W, W * 2), x = c.getContext('2d'), rnd = makeRng(seed), Tl = atlasC.width / 2;
        const span = Math.max(sp.top, sp.rx * 2.2), s = W * 0.96 / span, gx = W / 2, gy = W * 0.98;
        const tg = x.createLinearGradient(gx - sp.rb * s, 0, gx + sp.rb * s, 0);
        tg.addColorStop(0, '#4A3524'); tg.addColorStop(0.45, '#7A5B3C'); tg.addColorStop(1, '#3E2C1C');
        x.fillStyle = tg; x.beginPath(); x.moveTo(gx - sp.rb * s * 1.4, gy); x.lineTo(gx + sp.rb * s * 1.4, gy); x.lineTo(gx + sp.rt * s, gy - (sp.cy + sp.ry * 0.3) * s); x.lineTo(gx - sp.rt * s, gy - (sp.cy + sp.ry * 0.3) * s); x.closePath(); x.fill();
        const n = low ? 30 : 48, items = [];
        for (let i = 0; i < n; i++) { const z = rnd() * 2 - 1, ph = rnd() * 6.2832, sq = Math.sqrt(1 - z * z), r = Math.pow(rnd(), 0.45); items.push({ x: sq * Math.cos(ph) * r, y: z * r, z: sq * Math.sin(ph) * r, q: Math.floor(rnd() * 4), rot: rnd() * 6.2832, sc: 0.75 + rnd() * 0.5 }); }
        const draw = (px, py, it, k) => { x.save(); x.translate(px, py); x.rotate(it.rot); x.drawImage(atlasC, (it.q & 1) * Tl, (it.q >> 1) * Tl, Tl, Tl, -k / 2, -k / 2, k, k); x.restore(); };
        items.slice().sort((a, b) => a.z - b.z).forEach(it => draw(gx + it.x * sp.rx * s, gy - (sp.cy + it.y * sp.ry) * s, it, sp.card * s * it.sc));
        x.globalCompositeOperation = 'source-atop';
        let g = x.createRadialGradient(gx + sp.rx * s * 0.4, gy - (sp.cy + sp.ry * 0.5) * s, sp.rx * s * 0.15, gx, gy - sp.cy * s, sp.rx * s * 1.25);
        g.addColorStop(0, 'rgba(255,250,225,0.12)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,18,8,0.42)');
        x.fillStyle = g; x.fillRect(0, 0, W, W);
        x.globalCompositeOperation = 'source-over';
        const cx2 = W / 2, cy2 = W * 1.5, s2 = W * 0.92 / (sp.rx * 2.2);
        items.slice().sort((a, b) => a.y - b.y).forEach(it => draw(cx2 + it.x * sp.rx * s2, cy2 + it.z * sp.rz * s2, it, sp.card * s2 * it.sc));
        x.globalCompositeOperation = 'source-atop';
        g = x.createRadialGradient(cx2 - sp.rx * s2 * 0.25, cy2 - sp.rx * s2 * 0.25, sp.rx * s2 * 0.1, cx2, cy2, sp.rx * s2 * 1.2);
        g.addColorStop(0, 'rgba(255,250,225,0.14)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,18,8,0.45)');
        x.fillStyle = g; x.fillRect(0, W, W, W);
        x.globalCompositeOperation = 'source-over';
        return c;
      }
      /* corteza tileable (fibras verticales, grietas); bands>0 añade anillos horizontales (palmera) */
      function barkTex(seed, base, dark, light, bands) {
        const S = low ? 128 : 256, c = cv(S, S), x = c.getContext('2d'), rnd = makeRng(seed);
        x.fillStyle = css(base); x.fillRect(0, 0, S, S);
        for (let i = 0; i < 260; i++) {
          const w = 1.5 + rnd() * 5, h = S * (0.12 + rnd() * 0.35), px = rnd() * S, py = rnd() * S, t = rnd();
          x.fillStyle = css(mix3(dark, light, t), 0.5 + rnd() * 0.45);
          for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.beginPath(); if (x.roundRect) x.roundRect(px + dx, py + dy, w, h, w / 2); else x.rect(px + dx, py + dy, w, h); x.fill(); }
        }
        if (bands) for (let b = 0; b < bands; b++) {
          const y = (b + 0.5) * S / bands, hh = S / bands * 0.22;
          x.fillStyle = css(dark, 0.6); x.fillRect(0, y - hh / 2 + (rnd() - 0.5) * 3, S, hh);
          x.fillStyle = css(light, 0.4); x.fillRect(0, y + hh / 2, S, Math.max(1, S / 128));
        }
        x.strokeStyle = css(shade(dark, 0.7), 0.6); x.lineWidth = 1;
        for (let i = 0; i < 70; i++) { const px = rnd() * S, py = rnd() * S, L = 4 + rnd() * 14; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (rnd() - 0.5) * 4, py + L); x.stroke(); }
        return c;
      }
      /* relieve (gris lineal) a partir de la luminancia del mapa; el alfa bajo cuenta como hueco */
      function bumpOf(c) {
        const W = c.width, H = c.height, b = cv(W, H), bx = b.getContext('2d'), src = c.getContext('2d').getImageData(0, 0, W, H).data, img = bx.createImageData(W, H), d = img.data;
        for (let i = 0; i < d.length; i += 4) { const l = src[i + 3] < 128 ? 0 : 0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2]; d[i] = d[i + 1] = d[i + 2] = l; d[i + 3] = 255; }
        bx.putImageData(img, 0, 0); return b;
      }
      /* seto: hojas chicas densas, tileable en u; franja superior (v > 0,84) con alfa: el corte deja de ser una recta */
      function hedgeTex(seed) {
        const S = low ? 128 : 256, c = cv(S, S), x = c.getContext('2d'), rnd = makeRng(seed), band = Math.round(S * 0.16);
        const c0 = rgb(0x2F6A2B), c1 = rgb(0x4C8F42), c2 = rgb(0x8CC45E);
        x.fillStyle = css(c0); x.fillRect(0, band, S, S - band);
        const n = low ? 220 : 520;
        for (let i = 0; i < n; i++) {
          const px = rnd() * S, py = band + rnd() * (S - band), d = rnd(), k = 0.55 + 0.45 * d;
          const len = S * (0.07 + rnd() * 0.05), wid = len * 0.42, ang = -Math.PI / 2 + (rnd() - 0.5) * 1.6;
          const a0 = shade(mix3(c0, c1, rnd()), k), a1 = shade(mix3(c1, c2, rnd()), k);
          for (const dx of [-S, 0, S]) leaf(x, px + dx, py, len, wid, ang, a0, a1, rnd, false);
        }
        for (let i = 0; i < (low ? 40 : 90); i++) {
          const px = rnd() * S, py = band + rnd() * band * 0.6, len = S * (0.06 + rnd() * 0.07), wid = len * 0.4, ang = -Math.PI / 2 + (rnd() - 0.5) * 1.2, k = 0.8 + 0.2 * rnd();
          for (const dx of [-S, 0, S]) leaf(x, px + dx, py, len, wid, ang, shade(c1, k), shade(c2, k), rnd, false);
        }
        underlay(c, c1); return c;
      }
      /* mata de césped alto: hojas desde la base, color paja → verde */
      function grassTex(seed) {
        const S = low ? 128 : 256, c = cv(S, S), x = c.getContext('2d'), rnd = makeRng(seed);
        const c0 = rgb(0x8E9A48), c1 = rgb(0xB9B35E), c2 = rgb(0x7FA447), c3 = rgb(0xD8CC7A), n = low ? 22 : 34;
        for (let i = 0; i < n; i++) {
          const x0 = S * (0.3 + rnd() * 0.4), h = S * (0.45 + rnd() * 0.52), lean = (rnd() - 0.5) * S * 0.7, w0 = 1.5 + rnd() * 3.5;
          const ca = mix3(c0, c2, rnd()), cb = mix3(c1, c3, rnd());
          const g = x.createLinearGradient(0, S, 0, S - h); g.addColorStop(0, css(shade(ca, 0.72))); g.addColorStop(1, css(cb));
          x.fillStyle = g; x.beginPath(); const pts = 7; x.moveTo(x0 - w0, S);
          for (let k = 0; k <= pts; k++) { const t = k / pts, px = x0 + lean * t * t, py = S - h * t, w = w0 * (1 - t) + 0.4; x.lineTo(px - w, py); }
          for (let k = pts; k >= 0; k--) { const t = k / pts, px = x0 + lean * t * t, py = S - h * t, w = w0 * (1 - t) + 0.4; x.lineTo(px + w, py); }
          x.closePath(); x.fill();
        }
        underlay(c, c0); return c;
      }
      /* canteros: atlas 2×2 (rosa, marfil, bordó, lavanda) de flores sobre follaje bajo */
      function flowerAtlas(seed) {
        const S = TEX, Tl = S / 2, c = cv(S, S), x = c.getContext('2d'), rnd = makeRng(seed);
        const cols = [0xE9A2C9, 0xF6EFE6, 0xB3485A, 0xC9A4DA], cent = [0xF4E3A1, 0xE9C98A, 0x3A0E14, 0xF4E3A1];
        const l0 = rgb(0x2F5E2A), l1 = rgb(0x4E8A3C), l2 = rgb(0x86B85A);
        for (let q = 0; q < 4; q++) {
          const ox = (q & 1) * Tl, oy = (q >> 1) * Tl, cx = ox + Tl / 2, cy = oy + Tl * 0.58;
          x.save(); x.beginPath(); x.rect(ox, oy, Tl, Tl); x.clip();
          for (let i = 0; i < (low ? 24 : 44); i++) { const a = rnd() * 6.283, r = Tl * 0.36 * Math.sqrt(rnd()), k = 0.6 + 0.4 * rnd(); leaf(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.75, Tl * (0.1 + rnd() * 0.06), Tl * 0.03, a + (rnd() - 0.5), shade(mix3(l0, l1, rnd()), k), shade(mix3(l1, l2, rnd()), k), rnd, false); }
          const pc = rgb(cols[q]), cc = rgb(cent[q]);
          for (let i = 0; i < (low ? 12 : 20); i++) { const a = rnd() * 6.283, r = Tl * 0.3 * Math.sqrt(rnd()); flower(x, cx + Math.cos(a) * r, cy - Tl * 0.08 + Math.sin(a) * r * 0.7, Tl * (0.045 + rnd() * 0.035), rnd() * 6.283, shade(pc, 0.85 + rnd() * 0.2), cc, rnd, 5 + Math.floor(rnd() * 2)); }
          x.restore();
        }
        underlay(c, rgb(0x4E7A3A)); return c;
      }
      /* caña de tacuara (VIS-09): verde medio (≈ 0x6E9A3C) con fibras y un nudo oscuro por tile */
      function caneTex(seed) {
        const W = low ? 32 : 64, H = W * 4, c = cv(W, H), x = c.getContext('2d'), rnd = makeRng(seed);
        const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#5E8C32'); g.addColorStop(0.45, '#80B04A'); g.addColorStop(1, '#56802C');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
        for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(46,80,26,' + (0.08 + rnd() * 0.15).toFixed(3) + ')'; x.fillRect(rnd() * W, 0, 1 + rnd() * 2, H); }
        const y = H * 0.5; x.fillStyle = '#2C4A1A'; x.fillRect(0, y - H * 0.03, W, H * 0.06); x.fillStyle = 'rgba(205,220,150,0.5)'; x.fillRect(0, y + H * 0.03, W, 2);
        return c;
      }
      /* fronda de pindó: raquis central y folíolos alternos recortados por alfa (u a lo ancho, v a lo largo) */
      function frondTex(seed) {
        const W = low ? 64 : 128, H = W * 4, c = cv(W, H), x = c.getContext('2d'), rnd = makeRng(seed);
        const c0 = rgb(0x35682F), c1 = rgb(0x5E9A42), c2 = rgb(0xA6CF6E), n = low ? 18 : 30;
        for (let i = 0; i < n; i++) for (const sd of [-1, 1]) {
          const t = 0.06 + 0.9 * (i + (sd > 0 ? 0.5 : 0)) / n, y = H * (1 - t);
          const len = W * 0.5 * Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * t)), 0.6) * (0.9 + rnd() * 0.2), ang = -Math.PI / 2 + sd * (0.62 + rnd() * 0.2), k = 0.8 + rnd() * 0.25;
          leaf(x, W / 2, y, len, len * 0.12, ang, shade(mix3(c0, c1, rnd()), k), shade(mix3(c1, c2, rnd()), k), rnd, false);
        }
        const rg = x.createLinearGradient(0, H, 0, 0); rg.addColorStop(0, '#8A8A48'); rg.addColorStop(1, '#6E8E3A');
        x.strokeStyle = rg; x.lineCap = 'round'; x.lineWidth = W * 0.06; x.beginPath(); x.moveTo(W / 2, H); x.lineTo(W / 2, H * 0.05); x.stroke();
        x.lineWidth = W * 0.02; x.strokeStyle = 'rgba(255,255,220,0.35)'; x.beginPath(); x.moveTo(W / 2 - W * 0.012, H); x.lineTo(W / 2 - W * 0.012, H * 0.08); x.stroke();
        underlay(c, c1); return c;
      }

      /* especies: hoja (atlas) y copa (elipsoide de tarjetas) */
      const SP = {
        dark: { base: rgb(0x5E9A4E), c0: rgb(0x3E6E34), c1: rgb(0x5E9A4E), c2: rgb(0x9ED06A), n: 64, len: 0.17, wid: 0.3, jit: 0.9, hang: 0.45, R: 0.33, veins: true },   /* VIS-08: paleta más clara */
        light: { base: rgb(0x79A94C), c0: rgb(0x4C7D33), c1: rgb(0x7DAE4E), c2: rgb(0xC6DD86), n: 110, len: 0.11, wid: 0.36, jit: 1.2, hang: 0.3, R: 0.34, veins: false, spread: 0.7 },
        lapacho: { base: rgb(0xE099C4), c0: rgb(0x6A7A3A), c1: rgb(0x8C9A4A), c2: rgb(0xB0B86A), n: 9, len: 0.1, wid: 0.3, jit: 1, hang: 0.3, R: 0.3, flowers: { clusters: 9, per: 9, r: 0.05, spread: 0.085, cols: [0xE9A2C9, 0xD47FB0, 0xF2BBD9, 0xE28FC0, 0xF6D5E6], center: 0xF4E3A1 } },
        bamboo: { base: rgb(0x6AA444), c0: rgb(0x3F7A2E), c1: rgb(0x6AA444), c2: rgb(0xA8CF6A), n: 14, len: 0.38, wid: 0.09, jit: 0.6, hang: 0.25, R: 0.1, veins: false, spread: 1 },   /* VIS-09: hoja de tacuara verde, no paja */
      };
      const CR = {
        lapacho: { n: 44, cy: 5.3, rx: 2.7, ry: 2.0, rz: 2.7, smin: 1.3, smax: 2.0, bottom: 0.5 },
        dark: { n: 58, cy: 5.4, rx: 3.3, ry: 2.5, rz: 3.3, smin: 1.7, smax: 2.5, bottom: 0.45 },
        light: { n: 54, cy: 6.4, rx: 3.0, ry: 2.3, rz: 3.0, smin: 1.6, smax: 2.4, bottom: 0.5 },
        tall: { n: 48, cy: 11.6, rx: 2.7, ry: 3.6, rz: 2.7, smin: 2.0, smax: 2.8, bottom: 0.45 },
      };
      const TR = {
        lapacho: { h: 3.6, rb: 0.2, rt: 0.11, branches: 4, bLen: 2.6, bR: 0.09, tilt: 0.55, sub: 2, lean: 0.05 },
        dark: { h: 3.0, rb: 0.32, rt: 0.2, branches: 4, bLen: 2.4, bR: 0.14, tilt: 0.7, sub: 1 },
        light: { h: 4.3, rb: 0.24, rt: 0.14, branches: 3, bLen: 2.6, bR: 0.1, tilt: 0.5, sub: 1, lean: 0.08 },
        tall: { h: 9.0, rb: 0.42, rt: 0.2, branches: 3, bLen: 2.4, bR: 0.12, tilt: 0.55, sub: 0 },
      };
      const atlas = { dark: clusterAtlas(SP.dark, 501), light: clusterAtlas(SP.light, 502), lapacho: clusterAtlas(SP.lapacho, 503), bamboo: clusterAtlas(SP.bamboo, 504) };
      const impSpec = (cr, tr) => ({ top: cr.cy + cr.ry, cy: cr.cy, rx: cr.rx, ry: cr.ry, rz: cr.rz, rb: tr.rb, rt: tr.rt, card: (cr.smin + cr.smax) / 2 });
      const impC = { light: impostorTex(atlas.light, impSpec(CR.light, TR.light), 511), tall: impostorTex(atlas.dark, impSpec(CR.tall, TR.tall), 512) };
      Object.keys(atlas).forEach(k => underlay(atlas[k], SP[k].base));
      underlay(impC.light, SP.light.base); underlay(impC.tall, SP.dark.base);
      const barkC = barkTex(521, rgb(0x6E5033), rgb(0x45311F), rgb(0x8E7452), 0), palmC = barkTex(522, rgb(0x9B8C74), rgb(0x66584A), rgb(0xBDAE92), 1), hedgeC = hedgeTex(523);
      const X = {
        dark: mkTex(atlas.dark), light: mkTex(atlas.light), lapacho: mkTex(atlas.lapacho), bamboo: mkTex(atlas.bamboo),
        impLight: mkTex(impC.light, { clampV: true }), impTall: mkTex(impC.tall, { clampV: true }),
        bark: mkTex(barkC), barkBump: mkTex(bumpOf(barkC), { linear: true }), palm: mkTex(palmC), palmBump: mkTex(bumpOf(palmC), { linear: true }),
        hedge: mkTex(hedgeC, { clampV: true }), hedgeBump: mkTex(bumpOf(hedgeC), { clampV: true, linear: true }),
        grass: mkTex(grassTex(531), { clampV: true }), flower: mkTex(flowerAtlas(532)), cane: mkTex(caneTex(533)), frond: mkTex(frondTex(534), { clampV: true }),
      };

      /* ================================================================== geometría (base en y=0, Y arriba) */
      const geos = [];
      function keep(g) { geos.push(g); return g; }
      function mat4(tx, ty, tz, rx, ry, rz, s) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
        m.compose(new THREE.Vector3(tx || 0, ty || 0, tz || 0), q, new THREE.Vector3(s || 1, s || 1, s || 1));
        return m;
      }
      function geoFrom(pos, nor, uv, sw) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setAttribute('aSway', new THREE.Float32BufferAttribute(sw, 1));
        return g;
      }
      /* une geometrías (posición, normal, uv, aSway) sin índice y libera las parciales */
      function merge(parts) {
        const list = []; let count = 0;
        for (const p of parts) {
          let g = p.g; if (g.index) { const ni = g.toNonIndexed(); g.dispose(); g = ni; }
          if (p.m) g.applyMatrix4(p.m);
          if (!g.attributes.normal) g.computeVertexNormals();
          list.push(g); count += g.attributes.position.count;
        }
        const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2), sw = new Float32Array(count); let o = 0;
        for (const g of list) {
          const n = g.attributes.position.count;
          pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); if (g.attributes.aSway) sw.set(g.attributes.aSway.array, o);
          o += n; g.dispose();
        }
        return geoFrom(pos, nor, uv, sw);
      }
      /* nube de tarjetas en una elipsoide: orientación aleatoria (sesgada a la radial), normal "doblada" radial para
         que la copa se ilumine como un volumen, cuadrante del atlas al azar, peso de viento según altura */
      function cardCloud(sp, seed) {
        const rnd = makeRng(seed), n = Math.max(8, Math.round(sp.n * CARD_K));
        const pos = [], nor = [], uv = [], sw = [];
        const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), nrm = new THREE.Vector3(), rgt = new THREE.Vector3(), upv = new THREE.Vector3(), ctr = new THREE.Vector3(), tmp = new THREE.Vector3(), bn = new THREE.Vector3();
        const bottom = sp.bottom === undefined ? 0.45 : sp.bottom;
        let made = 0, tries = 0;
        while (made < n && tries < n * 5) {
          tries++;
          const z = rnd() * 2 - 1, ph = rnd() * Math.PI * 2, sq = Math.sqrt(Math.max(0, 1 - z * z));
          dir.set(sq * Math.cos(ph), z, sq * Math.sin(ph));
          if (rnd() > bottom + (1 - bottom) * (dir.y + 1) / 2) continue;
          const r = Math.pow(rnd(), sp.shell || 0.4);
          ctr.set(dir.x * sp.rx * r, sp.cy + dir.y * sp.ry * r, dir.z * sp.rz * r);
          nrm.copy(dir).addScaledVector(up, 0.25); tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(sp.tilt === undefined ? 1.8 : sp.tilt); nrm.add(tmp).normalize();
          const a = rnd() * Math.PI * 2; tmp.set(Math.cos(a), Math.sin(a) * 0.6, Math.sin(a + 1.3));
          rgt.crossVectors(tmp, nrm); if (rgt.lengthSq() < 1e-6) rgt.set(1, 0, 0); rgt.normalize(); upv.crossVectors(nrm, rgt).normalize();
          const s = sp.smin + rnd() * (sp.smax - sp.smin), h = s / 2;
          const q = Math.floor(rnd() * 4), u0 = (q & 1) * 0.5, v0 = 0.5 - (q >> 1) * 0.5;
          bn.copy(dir).addScaledVector(up, sp.bend === undefined ? 0.45 : sp.bend).normalize();
          const swv = (ctr.y / (sp.cy + sp.ry)) * (0.5 + rnd() * 0.5);
          const cs = [[-h, -h], [h, -h], [h, h], [-h, h]], uvs = [[u0, v0], [u0 + 0.5, v0], [u0 + 0.5, v0 + 0.5], [u0, v0 + 0.5]];
          for (const i of [0, 1, 2, 0, 2, 3]) {
            const ex = cs[i][0], ey = cs[i][1];
            pos.push(ctr.x + rgt.x * ex + upv.x * ey, ctr.y + rgt.y * ex + upv.y * ey, ctr.z + rgt.z * ex + upv.z * ey);
            nor.push(bn.x, bn.y, bn.z); uv.push(uvs[i][0], uvs[i][1]); sw.push(swv);
          }
          made++;
        }
        return keep(geoFrom(pos, nor, uv, sw));
      }
      const BARK_TILE = 1.2;
      function bdir(yaw, tilt) { return [-Math.sin(tilt) * Math.cos(yaw), Math.cos(tilt), Math.sin(tilt) * Math.sin(yaw)]; }
      function branch(r, L, org, yaw, tilt) {
        const g = new THREE.CylinderGeometry(r * 0.4, r, L, 5, 1, true), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * L / BARK_TILE);
        const m = new THREE.Matrix4().makeTranslation(org[0], org[1], org[2]).multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(new THREE.Matrix4().makeRotationZ(tilt)).multiply(new THREE.Matrix4().makeTranslation(0, L / 2, 0));
        return { g: g, m: m };
      }
      /* tronco cónico con base ensanchada, leve inclinación, ramas principales y sub-ramas; UV para la corteza */
      function trunkGeo(o, seed) {
        const rnd = makeRng(seed), parts = [], lean = o.lean || 0;
        const tr = new THREE.CylinderGeometry(o.rt, o.rb, o.h, o.radial || 7, 4, true), p = tr.attributes.position, uv = tr.attributes.uv;
        const ur = Math.max(1, Math.round(2 * Math.PI * o.rb / BARK_TILE));
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) + o.h / 2, t = y / o.h, k = 1 + 0.4 * Math.pow(Math.max(0, 1 - t * 5), 2);
          p.setXYZ(i, p.getX(i) * k + lean * t * t * o.h, y, p.getZ(i) * k);
          uv.setXY(i, uv.getX(i) * ur, t * o.h / BARK_TILE);
        }
        tr.computeVertexNormals(); parts.push({ g: tr });
        const nb = o.branches || 0;
        for (let i = 0; i < nb; i++) {
          const yaw = i * Math.PI * 2 / nb + rnd() * 0.9, tilt = o.tilt * (0.7 + rnd() * 0.6), y0 = o.h * (0.74 + rnd() * 0.2), L = o.bLen * (0.8 + rnd() * 0.4);
          const org = [lean * (y0 / o.h) * (y0 / o.h) * o.h, y0, 0];
          parts.push(branch(o.bR, L, org, yaw, tilt));
          for (let j = 0; j < (o.sub || 0); j++) {
            const t = 0.55 + rnd() * 0.3, d = bdir(yaw, tilt), org2 = [org[0] + d[0] * L * t, org[1] + d[1] * L * t, org[2] + d[2] * L * t];
            parts.push(branch(o.bR * 0.5, L * 0.6, org2, yaw + (rnd() - 0.5) * 1.8, tilt + 0.3 + rnd() * 0.5));
          }
        }
        return keep(merge(parts));
      }
      /* palmera pindó: tronco esbelto anillado (UV alineado a los anillos) + corona de frondas texturadas + cogollo */
      function palmTrunkGeo(h) {
        const segs = 14, g = new THREE.CylinderGeometry(0.17, 0.26, h, 8, segs, true), p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i) + h / 2, t = y / h, ring = Math.round(t * segs);
          const k = (ring % 2 === 0) ? 1.0 : 0.88, lean = 0.012 * h * t * t, flare = 1 + 0.5 * Math.pow(Math.max(0, 1 - t * 6), 2);
          p.setXYZ(i, p.getX(i) * k * flare + lean, y, p.getZ(i) * k * flare);
          uv.setXY(i, uv.getX(i) * 2, t * segs);
        }
        g.computeVertexNormals(); return keep(g);
      }
      function frondGeo(L, w, rise, droop, yaw) {
        const g = new THREE.PlaneGeometry(1, 1, 1, 8), p = g.attributes.position, sw = new Float32Array(p.count);
        for (let i = 0; i < p.count; i++) {
          const t = p.getY(i) + 0.5, x = p.getX(i), wd = w * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.7);
          p.setXYZ(i, x * wd, L * (rise * t - droop * t * t), t * L); sw[i] = t * t;
        }
        g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
        g.rotateY(yaw); g.computeVertexNormals(); return g;
      }
      function palmCrownGeo(h, seed) {
        const rnd = makeRng(seed), parts = [], top = 0.012 * h, n = 11;
        for (let i = 0; i < n; i++) {
          const yaw = i * Math.PI * 2 / n + (rnd() - 0.5) * 0.5, upper = i % 3 === 0;
          const rise = upper ? 0.9 + rnd() * 0.35 : 0.2 + rnd() * 0.45, droop = 0.8 + rnd() * 0.5;
          parts.push({ g: frondGeo(3.0 + rnd() * 0.8, 0.85, rise, droop, yaw), m: mat4(top, h - 0.05 - (upper ? 0 : 0.25), 0) });
        }
        for (let i = 0; i < 3; i++) parts.push({ g: frondGeo(1.6, 0.4, 2.2, 0.6, i * 2.1), m: mat4(top, h - 0.1, 0) });
        return keep(merge(parts));
      }
      function topiaryBallGeo() {
        const g = new THREE.SphereGeometry(0.62, 14, 10), p = g.attributes.position, uv = g.attributes.uv;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.06 * (hash3(Math.round(x * 1000), Math.round(y * 1000), Math.round(z * 1000), 61) - 0.5);
          p.setXYZ(i, x * k, y * k + 1.72, z * k); uv.setXY(i, uv.getX(i) * 6.5, 0.04 + uv.getY(i) * 0.74);
        }
        g.computeVertexNormals(); return keep(merge([{ g: g }]));
      }
      function caneGeo() {
        const g = new THREE.CylinderGeometry(0.035, 0.065, 6, 5, 1, true), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 15);
        return keep(merge([{ g: g, m: mat4(0, 3, 0) }]));
      }
      /* n tarjetas verticales cruzadas (plantas de suelo), opcionalmente una tarjeta superior casi horizontal */
      function crossGeo(w, h, n, u0, u1, v0, v1, topCard) {
        const pos = [], nor = [], uv = [], sw = [];
        for (let k = 0; k < n; k++) {
          const a = k * Math.PI / n, cx = Math.cos(a) * w / 2, cz = Math.sin(a) * w / 2;
          const q = [[-cx, 0, -cz], [cx, 0, cz], [cx, h, cz], [-cx, h, -cz]], t = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], s = [0, 0, 1, 1];
          for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); nor.push(0, 1, 0); uv.push(t[i][0], t[i][1]); sw.push(s[i]); }
        }
        if (topCard) {
          const r = w * 0.45, y = h * 0.55, q = [[-r, y, r], [r, y, r], [r, y + 0.12, -r], [-r, y + 0.12, -r]], t = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
          for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); nor.push(0, 1, 0); uv.push(t[i][0], t[i][1]); sw.push(0.6); }
        }
        return keep(geoFrom(pos, nor, uv, sw));
      }
      /* impostor: dos tarjetas verticales cruzadas (mitad superior de la textura) + una horizontal a la altura de la copa */
      function impostorGeo(sp) {
        const S = Math.max(sp.top, sp.rx * 2.2) / 0.96, y0 = -0.02 * S, y1 = y0 + S, h = S / 2;
        const pos = [], nor = [], uv = [], sw = [];
        /* aSway hace de bandera: 0 = tarjeta vertical (el shader la gira hacia la cámara), 1 = tarjeta horizontal */
        function quad(a, b, c, d, t, n, flag) { const vs = [a, b, c, a, c, d], ts = [t[0], t[1], t[2], t[0], t[2], t[3]]; for (let i = 0; i < 6; i++) { pos.push(vs[i][0], vs[i][1], vs[i][2]); nor.push(n[0], n[1], n[2]); uv.push(ts[i][0], ts[i][1]); sw.push(flag); } }
        const uvL = [[0, 0.5], [1, 0.5], [1, 1], [0, 1]];
        quad([-h, y0, 0], [h, y0, 0], [h, y1, 0], [-h, y1, 0], uvL, [0, 0.8, 0.6], 0);
        quad([0, y0, -h], [0, y0, h], [0, y1, h], [0, y1, -h], uvL, [0.6, 0.8, 0], 0);
        const S2 = sp.rx * 2.2 / 0.92, h2 = S2 / 2, yc = sp.cy;
        quad([-h2, yc, h2], [h2, yc, h2], [h2, yc, -h2], [-h2, yc, -h2], [[0, 0], [1, 0], [1, 0.5], [0, 0.5]], [0, 1, 0], 1);
        return keep(geoFrom(pos, nor, uv, sw));
      }

      const G = { trunk: {}, crown: {} };
      [['lapacho', 11], ['dark', 21], ['light', 31]].forEach(([sp, seed]) => {
        G.trunk[sp] = [trunkGeo(TR[sp], seed), trunkGeo(TR[sp], seed + 1)];
        G.crown[sp] = [cardCloud(CR[sp], seed + 100), cardCloud(CR[sp], seed + 101)];
      });
      G.trunk.tall = [trunkGeo(TR.tall, 41)]; G.crown.tall = [cardCloud(CR.tall, 141)];
      G.palmTrunk = palmTrunkGeo(9); G.palmCrown = palmCrownGeo(9, 51);
      G.topiaryTrunk = keep(merge([{ g: new THREE.CylinderGeometry(0.05, 0.075, 1.15, 5, 1, true), m: mat4(0, 0.575, 0) }]));
      G.topiaryBall = topiaryBallGeo();
      /* VIS-09: 2,6× tarjetas de hoja repartidas desde un tercio de la altura de la caña (y 2,2…6,2 m), no solo en la punta */
      G.cane = caneGeo(); G.caneLeaves = cardCloud({ n: 26, cy: 4.2, rx: 0.5, ry: 2.0, rz: 0.5, smin: 0.55, smax: 0.95, shell: 0.5, bend: 0.2, bottom: 0.5 }, 81);
      G.grass = crossGeo(0.95, 0.8, 2, 0, 1, 0, 1, false);
      G.flower = crossGeo(0.9, 0.7, 3, 0, 0.5, 0.5, 1, true);
      G.imp = { light: impostorGeo(impSpec(CR.light, TR.light)), tall: impostorGeo(impSpec(CR.tall, TR.tall)) };

      /* ================================================================== materiales (viento, LOD y normales por shader) */
      const uTime = { value: 0 }, uLodFar = { value: LOD_FAR };
      /* VIS-08: levante del follaje = (x) irradiancia ambiente extra proporcional al albedo, (y) translucidez: el sol que
         entra por detrás de la hoja (normal doblada opuesta a la luz) la enciende; de noche casi nada */
      const LIFT_DAY = [0.32, 0.55], LIFT_NIGHT = [0.06, 0.12];
      const uLift = { value: new THREE.Vector2(LIFT_DAY[0], LIFT_DAY[1]) };
      const mats = [];
      const NOFLIP_CHUNK = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
      /* o: {p: parámetros del material, sway: amplitud (m), lod: 0 nada | 1 colapsa lejos | 2 colapsa cerca (impostor),
            noFlip: no invertir la normal en caras traseras (normales dobladas de las copas), tile: atributo aTile por instancia,
            lift: levante + translucidez del follaje (uLift)} */
      function material(o) {
        const m = new THREE.MeshStandardMaterial(Object.assign({ color: 0xffffff, roughness: 1, metalness: 0 }, o.p || {}));
        m.defines = { PW_SWAY: o.sway ? 1 : 0, PW_LOD: o.lod || 0, PW_NOFLIP: o.noFlip ? 1 : 0, PW_TILE: o.tile ? 1 : 0, PW_LIFT: o.lift ? 1 : 0 };
        m.userData.uSway = { value: o.sway || 0 };
        m.onBeforeCompile = function (shader) {
          shader.uniforms.uTime = uTime; shader.uniforms.uSway = m.userData.uSway; shader.uniforms.uLodFar = uLodFar; shader.uniforms.uLift = uLift;
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', ['#include <common>', 'uniform float uTime;', 'uniform float uSway;', 'uniform float uLodFar;',
              '#if PW_SWAY == 1 || PW_LOD == 2', 'attribute float aSway;', '#endif', '#if PW_TILE == 1', 'attribute vec2 aTile;', '#endif'].join('\n'))
            .replace('#include <uv_vertex>', ['#include <uv_vertex>', '#if PW_TILE == 1 && defined( USE_MAP )', 'vMapUv += aTile;', '#endif'].join('\n'))
            .replace('#include <begin_vertex>', ['#include <begin_vertex>',
              '#ifdef USE_INSTANCING',
              '  vec3 pwWp = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;',
              '  float pwPh = fract( sin( dot( pwWp.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;',
              '  #if PW_LOD == 1',
              '    if ( distance( pwWp, cameraPosition ) > uLodFar ) transformed = vec3( 0.0 );',
              '  #elif PW_LOD == 2',
              '    if ( distance( pwWp, cameraPosition ) <= uLodFar ) transformed = vec3( 0.0 );',
              '    else if ( aSway < 0.5 ) {',
              '      vec2 pwD = cameraPosition.xz - pwWp.xz; float pwAn = atan( pwD.x, pwD.y ), pwC = cos( pwAn ), pwS = sin( pwAn );',
              '      transformed.xz = vec2( transformed.x * pwC + transformed.z * pwS, -transformed.x * pwS + transformed.z * pwC );',
              '    }',
              '  #endif',
              '#else',
              '  float pwPh = 0.0;',
              '#endif',
              '#if PW_SWAY == 1',
              '  float pwA = aSway * uSway;',
              '  transformed.x += pwA * sin( uTime * 1.25 + pwPh + transformed.y * 0.6 );',
              '  transformed.z += pwA * 0.7 * sin( uTime * 0.93 + pwPh * 1.7 + transformed.x * 0.5 );',
              '#endif'].join('\n'));
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', ['#include <common>', '#if PW_LIFT == 1', 'uniform vec2 uLift;', '#endif'].join('\n'))
            .replace('#include <normal_fragment_begin>', ['#if PW_NOFLIP == 1', NOFLIP_CHUNK, '#else', '#include <normal_fragment_begin>', '#endif'].join('\n'))
            .replace('#include <lights_fragment_end>', ['#include <lights_fragment_end>',
              '#if PW_LIFT == 1',
              '  reflectedLight.indirectDiffuse += diffuseColor.rgb * uLift.x;',
              '  #if NUM_DIR_LIGHTS > 0',
              '    reflectedLight.indirectDiffuse += diffuseColor.rgb * directionalLights[ 0 ].color * ( uLift.y * max( 0.0, dot( -geometryNormal, directionalLights[ 0 ].direction ) ) );',
              '  #endif',
              '#endif'].join('\n'));
        };
        m.customProgramCacheKey = function () { return 'pw-veg3'; };
        mats.push(m); return m;
      }
      const DS = THREE.DoubleSide;
      /* VIS-15: alpha-to-coverage solo con el destino multimuestra del postproceso (escritorio, quality !== 'low');
         alphaTest se conserva (sombras y pase de profundidad del SSAO) */
      const A2C = !low;
      const leafP = map => ({ map: map, alphaTest: 0.5, side: DS, roughness: 1, alphaToCoverage: A2C });
      const M = {
        bark: material({ p: { map: X.bark, bumpMap: X.barkBump, bumpScale: 0.012, roughness: 0.95 } }),
        barkLod: material({ p: { map: X.bark, bumpMap: X.barkBump, bumpScale: 0.012, roughness: 0.95 }, lod: 1 }),
        leaf: { lapacho: material({ p: leafP(X.lapacho), sway: 0.05, noFlip: true, lift: true }), dark: material({ p: leafP(X.dark), sway: 0.05, noFlip: true, lift: true }), light: material({ p: leafP(X.light), sway: 0.06, noFlip: true, lift: true }) },
        leafLod: { light: material({ p: leafP(X.light), sway: 0.06, noFlip: true, lod: 1, lift: true }), tall: material({ p: leafP(X.dark), sway: 0.07, noFlip: true, lod: 1, lift: true }) },
        imp: { light: material({ p: Object.assign(leafP(X.impLight), { color: 0xD4D8CC }), lod: 2, noFlip: true, lift: true }), tall: material({ p: Object.assign(leafP(X.impTall), { color: 0xD4D8CC }), lod: 2, noFlip: true, lift: true }) },
        palmBark: material({ p: { map: X.palm, bumpMap: X.palmBump, bumpScale: 0.012, roughness: 0.95 } }),
        frond: material({ p: leafP(X.frond), sway: 0.12, lift: true }),
        cane: material({ p: { map: X.cane, roughness: 0.8 }, sway: 0.04 }),
        bamboo: material({ p: leafP(X.bamboo), sway: 0.07, noFlip: true, lift: true }),
        hedge: material({ p: { map: X.hedge, bumpMap: X.hedgeBump, bumpScale: 0.004, alphaTest: 0.5, side: DS, vertexColors: true, alphaToCoverage: A2C }, lift: true }),
        topiary: material({ p: { map: X.hedge, bumpMap: X.hedgeBump, bumpScale: 0.004 }, lift: true }),
        flower: material({ p: leafP(X.flower), sway: 0.03, noFlip: true, tile: true, lift: true }),
        grass: material({ p: leafP(X.grass), sway: 0.06, noFlip: true, lift: true }),
      };
      const leafMats = [M.leaf.lapacho, M.leaf.dark, M.leaf.light, M.leafLod.light, M.leafLod.tall, M.imp.light, M.imp.tall, M.frond, M.bamboo, M.hedge, M.topiary, M.flower, M.grass];
      leafMats.forEach(mm => { mm.userData.dayColor = mm.color.getHex(); });

      /* ================================================================== grupo y mallas */
      const group = new THREE.Group(); group.name = 'vegetation';
      ctx.scene.add(group);
      let meshes = [], temp = [], night = !!ctx.night, mode = ctx.mode || 'parque';

      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
      /* entries: {x,y, rot, tx, tz, s, sy, sink, c (hex), tile (0..3), m (Matrix4 opcional)} */
      function instanced(geo, mat, entries, cast, name, opts) {
        if (!entries.length) return null;
        opts = opts || {};
        if (opts.tile) { geo = geo.clone(); geo.setAttribute('aTile', new THREE.InstancedBufferAttribute(new Float32Array(entries.length * 2), 2)); temp.push(geo); }
        const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
        const base = new Float32Array(entries.length * 3);
        for (let i = 0; i < entries.length; i++) {
          const it = entries[i];
          if (it.m) { mesh.setMatrixAt(i, it.m); }
          else {
            _p.set(it.x, elevation(it.x, it.y) - (it.sink === undefined ? 0.12 : it.sink), -it.y);
            _e.set(it.tx || 0, it.rot || 0, it.tz || 0); _q.setFromEuler(_e);
            const s = it.s || 1; _s.set(s, it.sy || s, s);
            _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
          }
          _c.set(it.c === undefined ? 0xffffff : it.c); mesh.setColorAt(i, _c);
          base[i * 3] = _c.r; base[i * 3 + 1] = _c.g; base[i * 3 + 2] = _c.b;
          if (opts.tile) { const t = it.tile || 0; geo.attributes.aTile.setXY(i, (t & 1) * 0.5, -(t >> 1) * 0.5); }
        }
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
        mesh.frustumCulled = false; mesh.castShadow = !!cast && shadows; mesh.receiveShadow = !!opts.receive && !low;
        mesh.name = name; mesh.userData.baseColors = base;
        group.add(mesh); meshes.push(mesh);
        return mesh;
      }
      function applyNight(mesh) {
        if (!mesh.isInstancedMesh) return;
        const b = mesh.userData.baseColors, arr = mesh.instanceColor.array;
        for (let i = 0; i < b.length; i += 3) {
          let r = b[i], g = b[i + 1], bl = b[i + 2];
          if (night) { const l = 0.2126 * r + 0.7152 * g + 0.0722 * bl; r = (r + (l - r) * 0.45) * 0.84; g = (g + (l - g) * 0.45) * 0.86; bl = (bl + (l - bl) * 0.45) * 0.96; }
          arr[i] = r; arr[i + 1] = g; arr[i + 2] = bl;
        }
        mesh.instanceColor.needsUpdate = true;
      }
      /* setos: una sola malla con todos los tramos (UV exactos por tramo, color por vértice, tapa bajo el borde dentado) */
      function buildHedges(segs) {
        if (!segs.length) return null;
        const pos = [], nor = [], uv = [], col = [], sw = [];
        function quad(a, b, c, d, n, t, cc) { const vs = [a, b, c, a, c, d], ts = [t[0], t[1], t[2], t[0], t[2], t[3]]; for (let i = 0; i < 6; i++) { pos.push(vs[i][0], vs[i][1], vs[i][2]); nor.push(n[0], n[1], n[2]); uv.push(ts[i][0], ts[i][1]); col.push(cc.r, cc.g, cc.b); sw.push(0); } }
        segs.forEach(s => {
          const tile = s.tile || 0.6, band = 0.16 * tile;                   /* tile de textura (m); la masa del tacuaral usa 1,0 */
          const ax = s.a[0], ay = s.a[1], bx = s.b[0], by = s.b[1], L = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / L, dy = (by - ay) / L;
          const zx = dy, zz = dx, w2 = s.w / 2, h = s.h;                      /* eje X del seto = (dx, 0, −dy); transversal = (dy, 0, dx) */
          const A = [ax, elevation(ax, ay) - 0.15, -ay], B = [bx, elevation(bx, by) - 0.15, -by];
          const Pt = (base, sz, y) => [base[0] + zx * sz, base[1] + y, base[2] + zz * sz];
          _c.setHex(s.tint);
          const vb = 1 - (h + 0.15) / tile, uL = L / tile, uW = s.w / tile, side = [[0, vb], [uL, vb], [uL, 1], [0, 1]], end = [[0, vb], [uW, vb], [uW, 1], [0, 1]];
          quad(Pt(A, w2, 0), Pt(B, w2, 0), Pt(B, w2, h), Pt(A, w2, h), [zx, 0, zz], side, _c);
          quad(Pt(B, -w2, 0), Pt(A, -w2, 0), Pt(A, -w2, h), Pt(B, -w2, h), [-zx, 0, -zz], side, _c);
          quad(Pt(A, -w2, 0), Pt(A, w2, 0), Pt(A, w2, h), Pt(A, -w2, h), [-dx, 0, dy], end, _c);
          quad(Pt(B, w2, 0), Pt(B, -w2, 0), Pt(B, -w2, h), Pt(B, w2, h), [dx, 0, -dy], end, _c);
          const ht = h - band * 0.9;
          quad(Pt(A, w2, ht), Pt(B, w2, ht), Pt(B, -w2, ht), Pt(A, -w2, ht), [0, 1, 0], [[0, 0.1], [uL, 0.1], [uL, 0.7], [0, 0.7]], _c);
        });
        const g = geoFrom(pos, nor, uv, sw); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); temp.push(g);
        const mesh = new THREE.Mesh(g, M.hedge); mesh.castShadow = shadows; mesh.receiveShadow = !low; mesh.name = 'cercos-vivos';
        group.add(mesh); meshes.push(mesh); return mesh;
      }

      /* ================================================================== datos de referencia del plano */
      const calle = D.road.calle, corridor = D.road.corridor, site = D.site.polygon;
      const gate = D.front.gate, gateX = gate.center_x;
      const CL = D.road.centerline, cum = [0];
      for (let i = 1; i < CL.length; i++) cum[i] = cum[i - 1] + d2(CL[i - 1], CL[i]);
      function clAt(s) {
        let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
        const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1e-9)));
        const a = CL[i - 1], b = CL[i], len = d2(a, b) || 1e-9;
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, tx: (b[0] - a[0]) / len, ty: (b[1] - a[1]) / len };
      }
      function halfWidth(x, y, nx, ny) { let w = 0; for (let k = 0; k < 90; k++) { w += 0.1; if (!pip(x + nx * w, y + ny * w, calle)) return w; } return 4; }
      function inHouseZone(x, y) {
        for (const v of D.house.volumes) if (x > v.x0 - 2.5 && x < v.x1 + 2.5 && y > v.y0 - 2.5 && y < v.y1 + 2.5) return true;
        const pd = D.house.pool.deck; if (x > pd.x0 - 2 && x < pd.x1 + 2 && y > pd.y0 - 2 && y < pd.y1 + 2) return true;
        if (D.house.driveway && distSeg(x, y, D.house.driveway.from, D.house.driveway.to) < 3.5) return true;
        return false;
      }
      /* árboles existentes del plano: si caen sobre la calzada se corren al borde exterior de la vereda (+1,3 m);
         si el núcleo construye una isleta alrededor, se quedan exactamente donde los relevó el plano */
      const bigTrees = (D.trees_plan || []).map(function (t) {
        let x = t[0], y = t[1];
        if ((D.islands || []).some(function (i) { return Math.hypot(i.x - t[0], i.y - t[1]) < 0.6; })) return { x: x, y: y, moved: false };
        for (let k = 0; k < 4 && pip(x, y, corridor); k++) {
          const q = nearestOnPoly(x, y, corridor); const dx = q[0] - x, dy = q[1] - y, l = Math.hypot(dx, dy) || 1e-9;
          x = q[0] + dx / l * 1.3; y = q[1] + dy / l * 1.3;
        }
        return { x: x, y: y, moved: Math.hypot(x - t[0], y - t[1]) > 0.01 };
      });
      function entornoOK(x, y) {
        if (x < E.x0 + 2 || x > E.x1 - 2 || y < E.y0 + 2 || y > E.y1 - 2) return false;
        if (T.distToSite(x, y) < 2.5) return false;
        if (y > -17 && y < 1) return false;                              /* ruta, banquina y franja verde */
        if (y < 1 && Math.abs(x - gateX) < 11) return false;              /* acceso despejado desde la ruta */
        if (distSeg(x, y, site[1], site[2]) < 8.5) return false;          /* camino vecinal (lado V2–V3) */
        return true;
      }

      /* ================================================================== tonos por instancia (multiplican la textura) */
      const C = {
        leaf: rnd => { const c = lerpHex(0xB9CFA0, 0xFFFFFF, rnd()); c.offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.05); return c.getHex(); },
        golden: 0xE8D27A,
        lapacho: rnd => lerpHex(0xFFFFFF, 0xF2CFE4, rnd()).getHex(),
        trunk: (rnd, grey) => lerpHex(0xFFFFFF, grey ? 0xC9C2B8 : 0xB49A82, rnd() * 0.8).getHex(),
        frond: rnd => lerpHex(0xC8DDB0, 0xFFFFFF, rnd()).getHex(),
        hedge: rnd => lerpHex(0xC9DCB4, 0xFFFFFF, rnd()).getHex(),
        cane: rnd => lerpHex(0xFFFFFF, 0xD8E0A8, rnd()).getHex(),
        grass: rnd => lerpHex(0xE2D9A6, 0xFFFFFF, rnd()).getHex(),
        flower: rnd => lerpHex(0xE8E8E8, 0xFFFFFF, rnd()).getHex(),
        tileBed: rnd => { const r = rnd(); return r < 0.4 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3; },
        tileHedge: rnd => { const r = rnd(); return r < 0.45 ? 0 : r < 0.8 ? 1 : r < 0.9 ? 2 : 3; },
      };

      /* ================================================================== población por modo */
      function populate() {
        const bosque = mode === 'bosque';
        const placed = [];  /* [x,y] de árboles ya puestos (para separación) */
        const near = (x, y, r) => placed.some(p => Math.hypot(p[0] - x, p[1] - y) < r);

        /* (2b) los dos árboles grandes existentes del plano: copa ancha oscura, escala 1,5 */
        const rndB = makeRng(3001);
        const big = bigTrees.map(t => { placed.push([t.x, t.y]); return { x: t.x, y: t.y, rot: rndB() * 6.28, s: 1.45 + rndB() * 0.15, sy: 0.95 + rndB() * 0.1, c: C.leaf(rndB), ct: C.trunk(rndB), sp: 'dark', g: 0 }; });

        /* (3) palmeras pindó: 2 flanqueando el portón por dentro + 3 en el lote 1 junto a la pileta */
        const rndP = makeRng(3002);
        const palmPos = [[gateX - 6.1, 9.2, 1.08], [gateX + 6.3, 9.2, 1.18], [68.0, 13.5, 1.0], [63.6, 24.6, 1.12], [58.8, 12.3, 0.92]];
        const palms = palmPos.map(p => { placed.push([p[0], p[1]]); return { x: p[0], y: p[1], rot: rndP() * 6.28, s: p[2], c: C.frond(rndP), ct: C.trunk(rndP, true) }; });

        /* (1) lapachos en hilera sobre las veredas, cada ~8 m alternando lado, sin invadir calle ni portón */
        const rndL = makeRng(3003);
        const lapachos = [];
        let s0 = 0; while (clAt(s0).y < 13 && s0 < cum[cum.length - 1]) s0 += 0.5;
        const ia = D.road.i_arc_start, ib = D.road.i_arc_end, hasArc = ia !== undefined && ib !== undefined && ib < cum.length;
        const sArc0 = hasArc ? cum[ia] - 3 : 1e9, sArc1 = hasArc ? cum[ib] + 3 : -1e9;
        let innerSide = 0;
        if (hasArc) { const t0 = clAt(cum[ia] + 0.1), t1 = clAt(cum[ib] - 0.1); innerSide = (t0.tx * t1.ty - t0.ty * t1.tx) < 0 ? -1 : 1; }
        for (let s = s0, k = 0; s < cum[cum.length - 1] - 2.5; s += 8, k++) {
          const c = clAt(s), side = (k % 2 === 0) ? 1 : -1;
          if (s > sArc0 && s < sArc1 && side === innerSide) continue;      /* en la curva solo el lado exterior */
          const nx = -c.ty * side, ny = c.tx * side;
          const w = halfWidth(c.x, c.y, nx, ny);
          const x = c.x + nx * (w + 0.9), y = c.y + ny * (w + 0.9);
          if (pip(x, y, calle) || !pip(x, y, corridor) || near(x, y, 5.5)) continue;
          placed.push([x, y]);
          lapachos.push({ x: x, y: y, rot: rndL() * 6.28, s: 0.86 + rndL() * 0.3, sy: 0.92 + rndL() * 0.16, tz: (rndL() - 0.5) * 0.05, c: C.lapacho(rndL), ct: C.trunk(rndL, true), sp: 'lapacho', g: k % 2 });
        }

        /* (2) nativos: parque = 1 por lote (2,3,4,7), bosque = +4–6 por lote en los bordes */
        const rndN = makeRng(3004);
        const natives = [];
        function lotCandidates(lot, inset, step) {
          const out = [];
          lot.sides.forEach(sd => {
            if (sd.calle) return;
            const dx = (sd.b[0] - sd.a[0]) / sd.len, dy = (sd.b[1] - sd.a[1]) / sd.len;
            for (let t = step * 0.7; t < sd.len - step * 0.7; t += step) out.push([sd.a[0] + dx * t - sd.n[0] * inset, sd.a[1] + dy * t - sd.n[1] * inset]);
          });
          return out.filter(p => insideMargin(p[0], p[1], lot.polygon, 1.9) && !inHouseZone(p[0], p[1]) && !pip(p[0], p[1], corridor));
        }
        function addNative(x, y, rnd, sp) {
          placed.push([x, y]);
          const r = rnd();
          natives.push({ x: x, y: y, rot: rnd() * 6.28, s: 0.84 + rnd() * 0.34, sy: 0.9 + rnd() * 0.2, tz: (rnd() - 0.5) * 0.04,
            c: sp === 'lapacho' ? C.lapacho(rnd) : (sp === 'light' && r < 0.18 ? C.golden : C.leaf(rnd)), ct: C.trunk(rnd, sp === 'lapacho'), sp: sp, g: Math.floor(rnd() * 2) });
        }
        D.lots.forEach((lot, li) => {
          const street = lot.sides.find(sd => sd.calle) || lot.sides[0];
          /* un árbol plantado por lote como mucho (el lote 1 ya tiene las palmeras de la pileta; los árboles
             existentes del plano y las palmeras del portón no cuentan como árbol del lote) */
          const hasBig = palms.slice(2).some(p => pip(p.x, p.y, lot.polygon));
          if (!hasBig) {
            const cands = lotCandidates(lot, 3.0, 2.5).filter(p => !near(p[0], p[1], 7));
            cands.sort((a, b) => distSeg(b[0], b[1], street.a, street.b) - distSeg(a[0], a[1], street.a, street.b));
            if (cands.length) { const p = cands[Math.min(2, cands.length - 1)]; addNative(p[0], p[1], rndN, li % 2 ? 'light' : 'dark'); }
          }
          if (bosque) {
            const cands = shuffle(lotCandidates(lot, 2.3, 2.0), rndN);
            const n = 4 + Math.floor(rndN() * 3); let got = 0;
            for (const p of cands) { if (got >= n) break; if (near(p[0], p[1], 5.2)) continue; const r = rndN(); addNative(p[0], p[1], rndN, r < 0.25 ? 'lapacho' : r < 0.6 ? 'dark' : 'light'); got++; }
          }
        });

        /* (4) topiarias redondas a lo largo del frente, cada ~6 m, fuera del portón */
        const rndT = makeRng(3005);
        const topiaries = [];
        for (let k = 0; k < 8; k++) for (const sg of [-1, 1]) {
          const xx = gateX + sg * (7 + 6 * k) + (rndT() - 0.5) * 0.6, yy = 3.0 + (rndT() - 0.5) * 0.4;
          if (xx < 1.5 || xx > 72.5 || pip(xx, yy, corridor) || minEdgeDist(xx, yy, corridor) < 1.0) continue;
          topiaries.push({ x: xx, y: yy, rot: rndT() * 6.28, s: 0.92 + rndT() * 0.16, c: C.hedge(rndT) });
        }

        /* (5) cercos vivos entre lotes (lados sin calle y que no son el perímetro), retranqueados 0,25 m, con huecos en esquinas;
               flores que asoman sobre el seto */
        const rndH = makeRng(3006);
        const hedgeSegs = [], flowers = [];
        const seen = new Map(), lines = [];
        D.lots.forEach(lot => lot.sides.forEach(sd => {
          if (sd.calle) return;
          if (minEdgeDist(sd.a[0], sd.a[1], site) < 0.35 && minEdgeDist(sd.b[0], sd.b[1], site) < 0.35) return;
          const key = [sd.a, sd.b].map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).sort().join('|');
          if (seen.has(key)) { seen.get(key).shared = true; return; }
          const rec = { a: sd.a, b: sd.b, n: sd.n, shared: false }; seen.set(key, rec); lines.push(rec);
        }));
        lines.forEach(rec => {
          const off = rec.shared ? 0 : 0.25;                               /* lado compartido: un solo seto a caballo del límite */
          const ax = rec.a[0] - rec.n[0] * off, ay = rec.a[1] - rec.n[1] * off, bx = rec.b[0] - rec.n[0] * off, by = rec.b[1] - rec.n[1] * off;
          const L = Math.hypot(bx - ax, by - ay), dx = (bx - ax) / L, dy = (by - ay) / L;
          const gap = 1.0, len = L - 2 * gap; if (len < 1.2) return;
          const n = Math.ceil(len / 3.2), step = len / n;
          for (let i = 0; i < n; i++) {
            const t0 = gap + i * step, t1 = t0 + step;
            const pa = [ax + dx * t0, ay + dy * t0], pb = [ax + dx * t1, ay + dy * t1];
            hedgeSegs.push({ a: pa, b: pb, h: 0.7 + (rndH() - 0.5) * 0.08, w: 0.5, tint: C.hedge(rndH) });
            for (let u = 0.4; u < step - 0.3; u += 1.3) {
              if (rndH() < 0.45) continue;
              const px = pa[0] + dx * u + (rndH() - 0.5) * 0.3, py = pa[1] + dy * u + (rndH() - 0.5) * 0.3;
              flowers.push({ x: px, y: py, rot: rndH() * 6.28, sink: -0.3, s: 0.55 + rndH() * 0.35, c: C.flower(rndH), tile: C.tileHedge(rndH) });
            }
          }
        });

        /* (6) tacuaral: cañas finas, densas, dentro del polígono (fuera del corredor de la calle) */
        const rndC = makeRng(3007);
        const canes = [];
        const tp = D.tacuaral || [];
        if (tp.length) {
          let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; tp.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
          const sp = low ? 0.9 : 0.62;
          for (let y = y0; y <= y1; y += sp) for (let x = x0; x <= x1; x += sp) {
            const xx = x + (rndC() - 0.5) * sp, yy = y + (rndC() - 0.5) * sp;
            if (rndC() > 0.82 || !insideMargin(xx, yy, tp, 0.3) || pip(xx, yy, corridor)) continue;
            canes.push({ x: xx, y: yy, rot: rndC() * 6.28, tx: (rndC() - 0.5) * 0.08, tz: (rndC() - 0.5) * 0.08, s: 0.82 + rndC() * 0.36, c: C.cane(rndC) });
          }
          /* VIS-09: masa baja tipo seto (≈1,2 m) a lo largo de la franja, centrada en su ancho útil (fuera del corredor):
             da cuerpo al tacuaral desde lejos; las cañas la atraviesan. Va a la misma malla 'cercos-vivos' (sin draw call extra) */
          const okM = (x, y) => insideMargin(x, y, tp, 0.4) && !pip(x, y, corridor) && minEdgeDist(x, y, corridor) > 0.3;
          let ya = 1e9, yb = -1e9;
          for (let y = y0; y <= y1; y += 0.25) for (let x = x0; x <= x1; x += 0.5) if (okM(x, y)) { ya = Math.min(ya, y); yb = Math.max(yb, y); }
          if (yb > ya + 1) {
            const yc = (ya + yb) / 2, wM = Math.min(2.6, (yb - ya) * 0.7);
            let run = null;
            const flush = () => {
              if (run && run[1] - run[0] >= 1.0) {
                const n = Math.ceil((run[1] - run[0]) / 3.2), st = (run[1] - run[0]) / n;
                for (let i = 0; i < n; i++) hedgeSegs.push({ a: [run[0] + st * i, yc], b: [run[0] + st * (i + 1), yc], h: 1.15 + (rndC() - 0.5) * 0.2, w: wM, tile: 1.0, tint: C.hedge(rndC) });
              }
              run = null;
            };
            for (let x = x0; x <= x1 + 0.5; x += 0.5) { if (okM(x, yc)) { if (!run) run = [x, x]; else run[1] = x; } else flush(); }
            flush();
          }
        }

        /* (7) canteros bajos junto al portón (dentro y fuera), al pie del muro frontal, y en la isla si existe */
        const rndF = makeRng(3008);
        const yWall = D.front.y_wall || 6;
        const bushes = [];
        function bush(x, y, s) { bushes.push({ x: x, y: y, rot: rndF() * 6.28, s: s, c: C.flower(rndF), tile: C.tileBed(rndF) }); }
        function bed(xa, xb, y, sp, sMin, sMax) {
          for (let x = xa; x <= xb; x += sp) bush(x + (rndF() - 0.5) * 0.5, y + (rndF() - 0.5) * 0.4, sMin + rndF() * (sMax - sMin));
        }
        bed(gate.x1 + 3.2, gate.x1 + 12.5, yWall + 0.95, 1.05, 0.75, 1.15);  /* dentro, este (detrás del muro) */
        bed(gate.x0 - 12.5, gate.x0 - 3.2, yWall + 0.95, 1.05, 0.75, 1.15);  /* dentro, oeste */
        bed(gate.x1 + 3.3, gate.x1 + 6.3, yWall - 1.0, 1.0, 0.65, 0.95);     /* fuera, flanqueando el acceso */
        bed(gate.x0 - 6.3, gate.x0 - 3.3, yWall - 1.0, 1.0, 0.65, 0.95);
        for (let x = 2; x < 73; x += 3.1) { if (Math.abs(x - gateX) < 6) continue; bush(x + (rndF() - 0.5) * 1.2, yWall - 0.75 + (rndF() - 0.5) * 0.3, 0.55 + rndF() * 0.4); }
        palms.slice(0, 2).forEach(p => { for (let k = 0; k < 5; k++) { const a = k * 1.26 + rndF(); bush(p.x + Math.cos(a) * 1.1, p.y + Math.sin(a) * 1.1, 0.55 + rndF() * 0.35); } });
        /* nada de canteros sobre la calle ni las veredas (la calzada se ensancha hacia la ruta más que el portón) */
        for (let i = bushes.length - 1; i >= 0; i--) { const b = bushes[i]; if (pip(b.x, b.y, corridor) || minEdgeDist(b.x, b.y, corridor) < 0.5) bushes.splice(i, 1); }
        if (D.island) {
          const isl = D.island;
          if (Array.isArray(isl)) { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; isl.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
            for (let y = y0; y <= y1; y += 0.9) for (let x = x0; x <= x1; x += 0.9) { const xx = x + (rndF() - 0.5) * 0.5, yy = y + (rndF() - 0.5) * 0.5; if (insideMargin(xx, yy, isl, 0.35)) bush(xx, yy, 0.6 + rndF() * 0.4); } }
          else if (isl.cx !== undefined || isl.x !== undefined) { const cx = isl.cx !== undefined ? isl.cx : isl.x, cy = isl.cy !== undefined ? isl.cy : isl.y, rx = isl.rx || isl.r || 2, ry = isl.ry || isl.r || 2;
            for (let k = 0; k < 10; k++) { const a = k * 0.628, r = 0.55 + rndF() * 0.25; bush(cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r, 0.6 + rndF() * 0.4); } }
        }
        bushes.forEach(b => flowers.push(b));

        /* (8) entorno: pastizal y monte fuera del predio (sin ruta, sin camino vecinal, sin tapar el acceso) */
        const rndE = makeRng(3009), rndG = makeRng(3010);
        const entMed = [], entTall = [], grass = [];
        const ts = (bosque ? 9.5 : 12) * (low ? 1.4 : 1), tAcc = bosque ? 0.75 : 0.42;
        for (let y = E.y0; y < E.y1; y += ts) for (let x = E.x0; x < E.x1; x += ts) {
          const xx = x + (rndE() - 0.5) * ts * 0.9, yy = y + (rndE() - 0.5) * ts * 0.9;
          /* VIS-08: porte variado en el monte (escala 0,7–1,4; altura de copa ±22 %); misma secuencia del rng que antes */
          const accept = rndE() < tAcc, tall = rndE() < 0.4, rot = rndE() * 6.28, s = 0.7 + rndE() * 0.7, sy = 0.78 + rndE() * 0.44, c = C.leaf(rndE), ct = C.trunk(rndE, tall);
          if (!accept || !entornoOK(xx, yy)) continue;
          /* variedad de tono en el monte (dorado / claro) por hash de posición: no altera la secuencia del rng */
          const hv = hash3(Math.round(xx * 10), Math.round(yy * 10), 7, 3011), ctint = hv < 0.12 ? C.golden : hv < 0.3 ? 0xDDE8C8 : c;
          (tall ? entTall : entMed).push({ x: xx, y: yy, rot: rot, s: s, sy: sy, c: ctint, ct: ct });
        }
        const gs = (bosque ? 3.2 : 3.6) * (low ? 1.5 : 1), gAcc = bosque ? 0.7 : 0.55;
        for (let y = E.y0; y < E.y1; y += gs) for (let x = E.x0; x < E.x1; x += gs) {
          const xx = x + (rndG() - 0.5) * gs, yy = y + (rndG() - 0.5) * gs;
          const accept = rndG() < gAcc, rot = rndG() * 3.14, s = 0.7 + rndG() * 0.7, c = C.grass(rndG);
          if (!accept || !entornoOK(xx, yy)) continue;
          grass.push({ x: xx, y: yy, rot: rot, s: s, sy: s * (0.8 + rndG() * 0.5), sink: 0.05, c: c });
        }
        /* césped alto en las banquinas de la ruta (fuera del acceso y del camino vecinal) */
        const ry0 = D.ruta && D.ruta.asfalto ? Math.max(D.ruta.asfalto.y0, D.ruta.asfalto.y1) : -7, ry1 = D.ruta && D.ruta.asfalto ? Math.min(D.ruta.asfalto.y0, D.ruta.asfalto.y1) : -14;
        for (const yy0 of [ry0 + 2.2, ry1 - 2.0]) for (let x = E.x0 + 2; x < E.x1 - 2; x += low ? 2.4 : 1.6) {
          const xx = x + (rndG() - 0.5) * 1.2, yy = yy0 + (rndG() - 0.5) * 1.1, accept = rndG() < 0.7, rot = rndG() * 3.14, s = 0.6 + rndG() * 0.6, c = C.grass(rndG);
          if (!accept || Math.abs(xx - gateX) < 9 || distSeg(xx, yy, site[1], site[2]) < 8.5) continue;
          grass.push({ x: xx, y: yy, rot: rot, s: s, sy: s * (0.8 + rndG() * 0.4), sink: 0.05, c: c });
        }

        /* ---------------------------------------------------------------- mallas instanciadas */
        const trunkOf = list => list.map(e => Object.assign({}, e, { c: e.ct }));
        const trees = big.concat(lapachos, natives);
        for (const sp of ['lapacho', 'dark', 'light']) for (let g = 0; g < 2; g++) {
          const list = trees.filter(e => e.sp === sp && e.g === g);
          instanced(G.trunk[sp][g], M.bark, trunkOf(list), true, sp + '-tronco-' + g, { receive: true });
          instanced(G.crown[sp][g], M.leaf[sp], list, true, sp + '-copa-' + g);   /* VIS-08: las copas no reciben sombra (se auto-sombreaban tarjeta sobre tarjeta) */
        }
        instanced(G.palmTrunk, M.palmBark, trunkOf(palms), true, 'pindo-tronco', { receive: true });
        instanced(G.palmCrown, M.frond, palms, true, 'pindo-corona');
        instanced(G.trunk.light[0], M.barkLod, trunkOf(entMed), true, 'entorno-medio-tronco');
        instanced(G.crown.light[0], M.leafLod.light, entMed, true, 'entorno-medio-copa');
        const impOf = list => list.map(e => Object.assign({}, e, { rot: 0 }));   /* sin giro: el shader orienta las tarjetas */
        instanced(G.imp.light, M.imp.light, impOf(entMed), false, 'entorno-medio-impostor');
        instanced(G.trunk.tall[0], M.barkLod, trunkOf(entTall), true, 'entorno-alto-tronco');
        instanced(G.crown.tall[0], M.leafLod.tall, entTall, true, 'entorno-alto-copa');
        instanced(G.imp.tall, M.imp.tall, impOf(entTall), false, 'entorno-alto-impostor');
        instanced(G.topiaryTrunk, M.bark, topiaries.map(e => Object.assign({}, e, { c: 0xA89078 })), false, 'topiaria-tronco');
        instanced(G.topiaryBall, M.topiary, topiaries, true, 'topiaria-esfera', { receive: true });
        buildHedges(hedgeSegs);
        instanced(G.cane, M.cane, canes, true, 'tacuaral-canas', { receive: true });
        instanced(G.caneLeaves, M.bamboo, canes, true, 'tacuaral-hojas');
        instanced(G.flower, M.flower, flowers, false, 'flores', { tile: true });
        instanced(G.grass, M.grass, grass, false, 'pastizal');
        if (night) meshes.forEach(applyNight);
      }
      function clear() {
        meshes.forEach(m => { group.remove(m); m.dispose && m.dispose(); });
        meshes = []; temp.forEach(g => g.dispose()); temp = [];
      }

      populate();

      /* ================================================================== API */
      function stats() {
        let tri = 0, inst = 0;
        meshes.forEach(m => { const n = m.isInstancedMesh ? m.count : 1; tri += m.geometry.attributes.position.count / 3 * n; inst += n; });
        return { triangles: Math.round(tri), instances: inst, meshes: meshes.length, mode: mode, lodFar: uLodFar.value, bigTreesMoved: bigTrees.filter(b => b.moved).length };
      }
      const api = {
        group: group, stats: stats,
        update: function (dt, t) { uTime.value = t; },
        setMode: function (m) { m = m === 'bosque' ? 'bosque' : 'parque'; if (m === mode) return; mode = m; clear(); populate(); },
        setNight: function (on) {
          night = !!on; meshes.forEach(applyNight);
          leafMats.forEach(mm => { mm.color.setHex(mm.userData.dayColor); if (night) mm.color.multiply(_c.setHex(0xCBD2E2)); });
          M.cane.color.setHex(night ? 0xA8B0BE : 0xFFFFFF);                                        /* VIS-09: de noche las cañas bajan el albedo */
          uLift.value.set(night ? LIFT_NIGHT[0] : LIFT_DAY[0], night ? LIFT_NIGHT[1] : LIFT_DAY[1]);
        },
        setLod: function (far) { uLodFar.value = far; },
        dispose: function () { clear(); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); texs.forEach(t => t.dispose()); if (group.parent) group.parent.remove(group); },
      };
      if (night) api.setNight(true);
      return api;
    },
  };
})();
