/* Paraways · Le Petit Trianon — entorno (PW.environment): luz de ambiente por PMREM a partir de un cielo procedural,
   sombras del sol ajustadas al predio, y el MODO DIORAMA de las vistas maqueta/plano: el predio como una losa de terreno
   (planta = polígono del predio +7,5 m, con la ruta y el camino vecinal) sobre una página marfil, sin cielo ni niebla,
   con sombra de contacto; en ruta/lote/dron vuelve el entorno completo con un fundido de ~0,6 s.
   API: PW.environment.build(ctx) → { setView(name, instant), setLight(mode, instant), update(dt, t), settle(), refresh(),
   setMode(), setNight(), dispose(), focus (Vector3), k(), isDiorama() }. Sin Math.random (PW.rng), sin fetch, solo CanvasTexture. */
(function () {
  'use strict';
  window.PW = window.PW || {};
  const OFF = 7.5;            /* desplazamiento de la planta hacia afuera del predio (m) */
  const Y_FRONT = -27;        /* la losa incluye ruta, banquina y la rosa de los vientos (y −27…0) */
  const THICK = 1.6;          /* espesor mínimo de la losa (m) */
  const GRID = 2.5;           /* paso de la malla de la cara superior (m) */
  const FADE = 0.6;           /* duración del fundido diorama ↔ entorno (s) */
  const PAGE = 0xF2EDE0, PAGE_NIGHT = 0x0E1A3C, PAPER = 0xEDE6D3;

  /* ───────── tono ACES de three (para que la página marfil quede exacta tras el OutputPass) ───────── */
  function acesFwd(r, g, b, exp) {
    r *= exp / 0.6; g *= exp / 0.6; b *= exp / 0.6;
    const x = 0.59719 * r + 0.35458 * g + 0.04823 * b, y = 0.07600 * r + 0.90834 * g + 0.01566 * b, z = 0.02840 * r + 0.13383 * g + 0.83777 * b;
    const fit = v => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.4329510) + 0.238081);
    const fx = fit(x), fy = fit(y), fz = fit(z);
    const cl = v => Math.min(1, Math.max(0, v));
    return [cl(1.60475 * fx - 0.53108 * fy - 0.07367 * fz), cl(-0.10208 * fx + 1.10813 * fy - 0.00605 * fz), cl(-0.00327 * fx - 0.07276 * fy + 1.07602 * fz)];
  }
  function acesInv(t, exp) {
    const c = [t[0], t[1], t[2]];
    for (let i = 0; i < 48; i++) { const f = acesFwd(c[0], c[1], c[2], exp); for (let j = 0; j < 3; j++) c[j] = Math.max(0, c[j] + (t[j] - f[j]) * 0.85); }
    return c;
  }
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  PW.environment = {
    build(ctx) {
      const THREE = ctx.THREE, scene = ctx.scene, renderer = ctx.renderer, D = ctx.data, T = ctx.terrain, elevation = ctx.elevation;
      const low = ctx.quality === 'low';
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const rng = ctx.rng(31);
      const group = new THREE.Group(); group.name = 'environment'; scene.add(group);
      const geos = [], mats = [], texs = [];
      const keepG = g => { geos.push(g); return g; }, keepM = m => { mats.push(m); return m; }, keepT = t => { texs.push(t); return t; };

      /* norte medido (como app.js): azimut desde el norte, horario; elevación en grados → dirección en mundo */
      const NORTH_DEG = (D.geo && typeof D.geo.norte_angulo_desde_x === 'number') ? D.geo.norte_angulo_desde_x : 90;
      function sunDir(az, el) { const a = THREE.MathUtils.degToRad(NORTH_DEG - az), e = THREE.MathUtils.degToRad(el); return new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), -Math.sin(a) * Math.cos(e)); }

      /* ───────── planta de la losa ───────── */
      const site = D.site.polygon.map(p => [p[0], p[1]]);
      if (site.length > 1 && Math.hypot(site[0][0] - site[site.length - 1][0], site[0][1] - site[site.length - 1][1]) < 1e-6) site.pop();
      const area2 = poly => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
      if (area2(site) < 0) site.reverse();                        /* CCW: interior a la izquierda de cada arista */
      function offsetPoly(pts, d) {
        const n = pts.length, out = [];
        for (let i = 0; i < n; i++) {
          const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
          let e1x = p[0] - a[0], e1y = p[1] - a[1], l1 = Math.hypot(e1x, e1y) || 1; e1x /= l1; e1y /= l1;
          let e2x = b[0] - p[0], e2y = b[1] - p[1], l2 = Math.hypot(e2x, e2y) || 1; e2x /= l2; e2y /= l2;
          const n1x = e1y, n1y = -e1x, n2x = e2y, n2y = -e2x;        /* normales exteriores (derecha de la arista) */
          let bx = n1x + n2x, by = n1y + n2y; const L = Math.hypot(bx, by);
          if (L < 1e-6) out.push([p[0] + n1x * d, p[1] + n1y * d]);
          else { bx /= L; by /= L; const k = d / Math.max(0.35, bx * n1x + by * n1y); out.push([p[0] + bx * k, p[1] + by * k]); }
        }
        return out;
      }
      const foot = offsetPoly(site, OFF);
      /* las dos esquinas del frente bajan hasta Y_FRONT siguiendo la arista lateral (así la losa incluye la ruta entera) */
      const minY = Math.min(...foot.map(p => p[1]));
      const nF = foot.length; let iWest = -1, iEast = -1;
      for (let i = 0; i < nF; i++) if (Math.abs(foot[i][1] - minY) < 0.05) { const j = (i + 1) % nF; if (Math.abs(foot[j][1] - minY) < 0.05) { iWest = i; iEast = j; } }
      if (iWest >= 0) {
        const slide = (i, jAdj) => { const p = foot[i], q = foot[jAdj]; const dx = q[0] - p[0], dy = q[1] - p[1]; const t = (Y_FRONT - p[1]) / (dy || 1e-9); foot[i] = [p[0] + dx * t, Y_FRONT]; };
        slide(iWest, (iWest - 1 + nF) % nF); slide(iEast, (iEast + 1) % nF);
      }
      const footV2 = foot.map(p => new THREE.Vector2(p[0], p[1]));
      const bb = { x0: Math.min(...foot.map(p => p[0])), x1: Math.max(...foot.map(p => p[0])), y0: Math.min(...foot.map(p => p[1])), y1: Math.max(...foot.map(p => p[1])) };
      const center = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
      function insideFoot(x, y) {
        let c = false;
        for (let i = 0, j = nF - 1; i < nF; j = i++) { const xi = foot[i][0], yi = foot[i][1], xj = foot[j][0], yj = foot[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; }
        return c;
      }
      /* planos de recorte (interior = lado positivo) de cada arista, en mundo (x = X, z = −Y) */
      const edgePlanes = foot.map((p, i) => {
        const q = foot[(i + 1) % nF]; let dx = q[0] - p[0], dy = q[1] - p[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const n = new THREE.Vector3(-dy, 0, -dx);               /* izquierda de la arista (−dy, dx) en plano → (−dy, 0, −dx) en mundo */
        const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, new THREE.Vector3(p[0], 0, -p[1])); pl.userData = { on: pl.constant }; return pl;
      });
      const planesRuta = iWest >= 0 ? [edgePlanes[iEast], edgePlanes[(iWest - 1 + nF) % nF]] : [];
      const planesCamino = iWest >= 0 ? [edgePlanes[(iWest - 2 + nF) % nF]] : [];

      /* ───────── malla superior: grilla recortada contra los triángulos de la planta ───────── */
      const footTris = THREE.ShapeUtils.triangulateShape(footV2, []).map(t => { const tri = [foot[t[0]], foot[t[1]], foot[t[2]]]; if (area2(tri) < 0) tri.reverse(); return tri; });
      function clipPoly(poly, clip) {
        let out = poly;
        for (let i = 0; i < clip.length && out.length; i++) {
          const a = clip[i], b = clip[(i + 1) % clip.length], ex = b[0] - a[0], ey = b[1] - a[1], inp = out; out = [];
          const side = p => ex * (p[1] - a[1]) - ey * (p[0] - a[0]);
          for (let j = 0; j < inp.length; j++) {
            const p = inp[j], q = inp[(j + 1) % inp.length], sp = side(p), sq = side(q);
            if (sp >= 0) out.push(p);
            if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
          }
        }
        return out;
      }
      const lawnSrc = (function () { const t = scene.getObjectByName('terreno'); const m = t && t.material; return (m && (m.userData.lawn || m.map)) || null; })();
      /* mismos verdes que el terreno del núcleo, apenas más claros: la franja se acerca al césped de los lotes */
      const c1 = new THREE.Color(0x97B463), c2 = new THREE.Color(0xACC274), c3 = new THREE.Color(0x82A35A), _c = new THREE.Color();
      function buildTop() {
        const pos = [], nor = [], uv = [], col = []; const h = 0.5;
        const emit = p => {
          const x = p[0], y = p[1], e = elevation(x, y);
          const nx = -(elevation(x + h, y) - elevation(x - h, y)) / (2 * h), nz = (elevation(x, y + h) - elevation(x, y - h)) / (2 * h);
          const L = Math.hypot(nx, 1, nz); pos.push(x, e - 0.04, -y); nor.push(nx / L, 1 / L, nz / L); uv.push(x / 4, y / 4);
          const n = T.noise(x * 0.06 + 3, y * 0.06 + 1), ins = T.inside(x, y) ? 1 : 0; _c.copy(c1).lerp(c2, n).lerp(c3, ins * 0.5); col.push(_c.r, _c.g, _c.b);
        };
        const gx0 = Math.floor(bb.x0 / GRID) * GRID, gy0 = Math.floor(bb.y0 / GRID) * GRID;
        for (let y = gy0; y < bb.y1; y += GRID) for (let x = gx0; x < bb.x1; x += GRID) {
          const cell = [[[x, y], [x + GRID, y], [x + GRID, y + GRID]], [[x, y], [x + GRID, y + GRID], [x, y + GRID]]];
          footTris.forEach(ft => {
            const fx0 = Math.min(ft[0][0], ft[1][0], ft[2][0]), fx1 = Math.max(ft[0][0], ft[1][0], ft[2][0]), fy0 = Math.min(ft[0][1], ft[1][1], ft[2][1]), fy1 = Math.max(ft[0][1], ft[1][1], ft[2][1]);
            if (x + GRID < fx0 || x > fx1 || y + GRID < fy0 || y > fy1) return;
            cell.forEach(tri => { const poly = clipPoly(tri, ft); for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); } });
          });
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        return keepG(g);
      }
      let lawn = null;
      if (lawnSrc) { lawn = keepT(lawnSrc.clone()); lawn.repeat.set(1, 1); lawn.wrapS = lawn.wrapT = THREE.RepeatWrapping; lawn.needsUpdate = true; }
      const topMat = keepM(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1, map: lawn, fog: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      const top = new THREE.Mesh(buildTop(), topMat); top.receiveShadow = true; top.name = 'losa-superior'; group.add(top);

      /* ───────── caras laterales: corte de terreno (estratos) ───────── */
      function strataTexture() {
        const S = 512, c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d');
        const gr = x.createLinearGradient(0, 0, 0, S);                      /* fila 0 = borde superior (v = 0, flipY = false); 512 px = 4 m */
        gr.addColorStop(0, '#3A2C20'); gr.addColorStop(0.05, '#4A3626'); gr.addColorStop(0.12, '#6B4330'); gr.addColorStop(0.24, '#8F4A2C'); gr.addColorStop(0.55, '#A4512D'); gr.addColorStop(1, '#8E4426');
        x.fillStyle = gr; x.fillRect(0, 0, S, S);
        /* estratos ondulados */
        for (let i = 0; i < 14; i++) {
          const yy = 40 + i * 34 + rng() * 10, amp = 2 + rng() * 3, ph = rng() * 6.28; x.strokeStyle = i % 3 === 0 ? 'rgba(60,24,12,0.35)' : 'rgba(200,120,80,0.18)'; x.lineWidth = 1 + rng() * 2;
          x.beginPath(); for (let px = 0; px <= S; px += 8) x.lineTo(px, yy + Math.sin(px * 0.02 + ph) * amp); x.stroke();
        }
        /* grano */
        for (let i = 0; i < 9000; i++) { const px = rng() * S, py = rng() * S, l = rng(); x.fillStyle = l < 0.5 ? 'rgba(40,16,8,' + (0.05 + rng() * 0.14).toFixed(2) + ')' : 'rgba(230,190,150,' + (0.04 + rng() * 0.1).toFixed(2) + ')'; x.fillRect(px, py, 1 + rng() * 2, 1 + rng() * 1.5); }
        /* piedritas: más densas hacia abajo */
        for (let i = 0; i < 360; i++) {
          const py = 70 + Math.pow(rng(), 0.6) * (S - 80), px = rng() * S, r = 1.5 + rng() * 3 + (py > 300 ? rng() * 3 : 0); const t = rng();
          x.fillStyle = t < 0.4 ? '#C9B79A' : t < 0.7 ? '#A89A80' : t < 0.88 ? '#6E5A48' : '#D9CDB4'; x.beginPath(); x.ellipse(px, py, r, r * (0.55 + rng() * 0.4), rng() * 3.14, 0, 6.29); x.fill();
          x.fillStyle = 'rgba(40,16,8,0.25)'; x.beginPath(); x.ellipse(px + r * 0.3, py + r * 0.5, r * 0.9, r * 0.35, 0, 0, 6.29); x.fill();
        }
        /* raíces del césped en el borde superior */
        for (let i = 0; i < 700; i++) { const px = rng() * S, len = 3 + rng() * 10; x.strokeStyle = 'rgba(' + (70 + rng() * 40 | 0) + ',' + (95 + rng() * 40 | 0) + ',' + (40 + rng() * 20 | 0) + ',0.75)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (rng() - 0.5) * 4, len); x.stroke(); }
        x.fillStyle = 'rgba(30,20,12,0.5)'; x.fillRect(0, 0, S, 3);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; return keepT(t);
      }
      const sideSamples = [];                     /* [{x,y,top}] para calcular el fondo */
      const edgeData = foot.map((p, i) => {
        const q = foot[(i + 1) % nF], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / 2)), pts = [];
        for (let k = 0; k <= n; k++) { const t = k / n, x = p[0] + (q[0] - p[0]) * t, y = p[1] + (q[1] - p[1]) * t; const s = { x, y, top: elevation(x, y) + 0.03, d: L * t }; pts.push(s); sideSamples.push(s); }
        return pts;
      });
      const yB = Math.min(...sideSamples.map(s => s.top)) - THICK;
      function buildSides() {
        const pos = [], nor = [], uv = [], idx = []; let base = 0;
        edgeData.forEach(pts => {
          const a = pts[0], b = pts[pts.length - 1]; let dx = b.x - a.x, dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
          const nx = dy, nz = dx;                                              /* normal exterior en mundo: (dy, 0, dx) */
          for (let k = 0; k + 1 < pts.length; k++) {
            const s0 = pts[k], s1 = pts[k + 1];
            pos.push(s0.x, yB, -s0.y, s1.x, yB, -s1.y, s1.x, s1.top, -s1.y, s0.x, s0.top, -s0.y);
            for (let m = 0; m < 4; m++) nor.push(nx, 0, nz);
            uv.push(s0.d / 6, (s0.top - yB) / 4, s1.d / 6, (s1.top - yB) / 4, s1.d / 6, 0, s0.d / 6, 0);
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3); base += 4;
          }
        });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return keepG(g);
      }
      const sideMat = keepM(new THREE.MeshStandardMaterial({ map: strataTexture(), roughness: 0.96, metalness: 0, fog: false }));
      const sides = new THREE.Mesh(buildSides(), sideMat); sides.castShadow = true; sides.receiveShadow = true; sides.name = 'losa-lados'; group.add(sides);

      /* ───────── página y sombra de contacto ───────── */
      const PAGE_W = 900;
      function pageShadowTexture() {
        const S = 1024, c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d');
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
        const k = S / PAGE_W, px = p => (p[0] - center.x) * k + S / 2, py = p => S / 2 - (p[1] - center.y) * k;
        const blob = (blur, alpha, ox, oy) => {
          x.save(); x.shadowColor = 'rgba(20,12,6,' + alpha + ')'; x.shadowBlur = blur; x.shadowOffsetX = 3000 + ox; x.shadowOffsetY = oy; x.fillStyle = '#000';
          x.beginPath(); foot.forEach((p, i) => { const X = px(p) - 3000, Y = py(p); i ? x.lineTo(X, Y) : x.moveTo(X, Y); }); x.closePath(); x.fill(); x.restore();
        };
        blob(70, 0.16, 6, 8); blob(26, 0.24, 1, 2); blob(9, 0.3, 0, 0);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return keepT(t);
      }
      const pageMat = keepM(new THREE.MeshBasicMaterial({ color: PAGE, map: pageShadowTexture(), fog: false, toneMapped: false }));
      const page = new THREE.Mesh(keepG(new THREE.PlaneGeometry(PAGE_W, PAGE_W)), pageMat); page.rotation.x = -Math.PI / 2; page.position.set(center.x, yB - 0.03, -center.y); page.name = 'pagina'; group.add(page);
      const catchMat = keepM(new THREE.ShadowMaterial({ color: 0x2A1A10, opacity: 0.3, transparent: true, depthWrite: false, fog: false }));
      const catcher = new THREE.Mesh(keepG(new THREE.PlaneGeometry(PAGE_W * 0.5, PAGE_W * 0.5)), catchMat); catcher.rotation.x = -Math.PI / 2; catcher.position.set(center.x, yB + 0.012, -center.y); catcher.receiveShadow = true; catcher.name = 'pagina-sombra'; group.add(catcher);

      /* ───────── copia recortada del plano base (el original desborda la losa) ───────── */
      const planBase = scene.getObjectByName('plano-base'); let planClip = null;
      if (planBase && planBase.geometry && planBase.geometry.parameters) {
        const pw = planBase.geometry.parameters.width, ph = planBase.geometry.parameters.height, X0 = planBase.position.x - pw / 2, Y0 = -planBase.position.z - ph / 2;
        const pos = [], uv = []; const emit = p => { pos.push(p[0], elevation(p[0], p[1]) + 0.06, -p[1]); uv.push((p[0] - X0) / pw, (p[1] - Y0) / ph); };
        const gx0 = Math.floor(bb.x0 / GRID) * GRID, gy0 = Math.floor(bb.y0 / GRID) * GRID;
        for (let y = gy0; y < bb.y1; y += GRID) for (let x = gx0; x < bb.x1; x += GRID) {
          [[[x, y], [x + GRID, y], [x + GRID, y + GRID]], [[x, y], [x + GRID, y + GRID], [x, y + GRID]]].forEach(tri => footTris.forEach(ft => { const poly = clipPoly(tri, ft); for (let k = 1; k + 1 < poly.length; k++) { emit(poly[0]); emit(poly[k]); emit(poly[k + 1]); } }));
        }
        const g = keepG(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        planClip = new THREE.Mesh(g, planBase.material); planClip.renderOrder = planBase.renderOrder; planClip.name = 'plano-base-losa'; planClip.visible = false; group.add(planClip);
      }

      /* ───────── objetos del núcleo que el diorama apaga o recorta ───────── */
      const terreno = scene.getObjectByName('terreno'), lejano = scene.getObjectByName('campo-lejano');
      const sky = scene.getObjectByName('cielo'), stars = scene.getObjectByName('estrellas'), sunSprite = scene.getObjectByName('sol');
      const fading = [terreno, lejano].filter(Boolean);
      fading.forEach(o => { o.userData.envOpacity = o.material.opacity; });
      const rutaMats = []; ['ruta', 'banquina'].forEach(n => { const o = scene.getObjectByName(n); if (o && o.material && !rutaMats.includes(o.material)) rutaMats.push(o.material); });
      scene.traverse(o => { const m = o.material; if (m && !Array.isArray(m) && m.name === 'ruta-lineas' && !rutaMats.includes(m)) rutaMats.push(m); });
      const camino = scene.getObjectByName('camino-vecinal');
      if (planesRuta.length) { renderer.localClippingEnabled = true; rutaMats.forEach(m => { m.clippingPlanes = planesRuta; m.needsUpdate = true; }); if (camino && camino.material) { camino.material.clippingPlanes = planesCamino; camino.material.needsUpdate = true; } }
      let clipOn = null;
      function setClip(on) { if (clipOn === on) return; clipOn = on; edgePlanes.forEach(pl => { pl.constant = on ? pl.userData.on : 1e6; }); }
      setClip(false);

      /* luces del núcleo: sol (sombras), hemisférica y ambiente (se bajan porque el PMREM ya aporta luz de cielo) */
      let sun = ctx.lights && ctx.lights.sun, hemi = ctx.lights && ctx.lights.hemi, amb = ctx.lights && ctx.lights.amb; const cur = ctx.lights && ctx.lights.cur;
      scene.traverse(o => { if (!sun && o.isDirectionalLight) sun = o; if (!hemi && o.isHemisphereLight) hemi = o; if (!amb && o.isAmbientLight) amb = o; });
      if (sun && sun.shadow) {
        const S = low ? 2048 : 4096; sun.shadow.mapSize.set(S, S); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
        const sc = sun.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 20; sc.far = 520; sc.updateProjectionMatrix();
        sun.shadow.bias = low ? -0.0005 : -0.00025; sun.shadow.normalBias = low ? 0.035 : 0.02;
      }

      /* ───────── cielo procedural → PMREM (scene.environment) ───────── */
      const SKY = {
        dia: { top: 0x6FA0D6, hor: 0xE4ECF2, ground: 0x7E9052, sun: 0xFFF3DC, dir: sunDir(10, 62), sunI: 5.0, hemiK: 0.68, ambK: 0.7, page: PAGE, shadowA: 0.28 },
        atardecer: { top: 0x5B7BB4, hor: 0xF6D6AE, ground: 0x727C4A, sun: 0xFFC78A, dir: sunDir(282, 13), sunI: 7.0, hemiK: 0.7, ambK: 0.75, page: PAGE, shadowA: 0.3 },
        noche: { top: 0x070E22, hor: 0x1C2C55, ground: 0x0E182E, sun: 0x9DB1E4, dir: sunDir(45, 48), sunI: 1.2, hemiK: 0.85, ambK: 0.8, page: PAGE_NIGHT, shadowA: 0.22 },
      };
      const DIO_HEMI = 0.9, DIO_AMB = 0.8;       /* en diorama la página clara rebota luz: la hemisférica baja un poco más */
      const skyScene = new THREE.Scene();
      const skyMat = keepM(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
        uniforms: { top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunI: { value: 1 } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunI; varying vec3 vP;' +
          'void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = h >= 0.0 ? mix(hor, top, smoothstep(0.0, 0.6, h)) : mix(hor, ground, smoothstep(0.0, 0.22, -h));' +
          ' float s = max(dot(d, sunDir), 0.0); c += sunCol * (pow(s, 700.0) * sunI + pow(s, 10.0) * sunI * 0.06); gl_FragColor = vec4(c, 1.0); }' }));
      skyScene.add(new THREE.Mesh(keepG(new THREE.SphereGeometry(50, 32, 16)), skyMat));
      let pmrem = null, envRT = null;
      try { pmrem = new THREE.PMREMGenerator(renderer); } catch (e) { console.warn('PMREM no disponible', e); pmrem = null; }
      const lightState = { mode: ctx.night ? 'noche' : 'atardecer', from: null, t0: 0, k: 1 };
      const mixed = { top: new THREE.Color(), hor: new THREE.Color(), ground: new THREE.Color(), sun: new THREE.Color(), dir: new THREE.Vector3(), sunI: 1, hemiK: 1, ambK: 1, page: new THREE.Color(), shadowA: 0.3 };
      const _ca = new THREE.Color(), _cb = new THREE.Color(), _groundDio = new THREE.Color(0xC9C1AE);
      function mixLight() {
        const a = SKY[lightState.from || lightState.mode], b = SKY[lightState.mode], k = easeInOut(lightState.k);
        const mc = (key) => mixed[key].copy(_ca.setHex(a[key])).lerp(_cb.setHex(b[key]), k);
        mc('top'); mc('hor'); mc('ground'); mc('sun'); mc('page');
        mixed.dir.copy(a.dir).lerp(b.dir, k).normalize(); mixed.sunI = a.sunI + (b.sunI - a.sunI) * k; mixed.hemiK = a.hemiK + (b.hemiK - a.hemiK) * k; mixed.ambK = a.ambK + (b.ambK - a.ambK) * k; mixed.shadowA = a.shadowA + (b.shadowA - a.shadowA) * k;
      }
      let envStamp = -1, envDio = -1;
      function regenEnv(force) {
        if (!pmrem) return;
        const now = performance.now(); if (!force && now - envStamp < 120) return; envStamp = now;
        const u = skyMat.uniforms; u.top.value.copy(mixed.top); u.hor.value.copy(mixed.hor); u.ground.value.copy(mixed.ground).lerp(_groundDio, dio.k * 0.7); u.sunDir.value.copy(mixed.dir); u.sunCol.value.copy(mixed.sun); u.sunI.value = mixed.sunI;
        let rt = null;
        try { rt = pmrem.fromScene(skyScene, 0, 0.1, 200); } catch (e) { console.warn('env', e); pmrem = null; return; }
        scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt; envDio = dio.k;
      }

      /* ───────── estado diorama / entorno ───────── */
      const dio = { target: 1, k: 1, from: 1, t0: 0, view: 'maqueta' };
      const pageLin = new THREE.Color(), _tmp = new THREE.Color();
      let lastPost = null, lastExp = -1, lastPageHex = -1, lastPlano = null;
      function postOn() { const a = window.PW && PW.app; return !!(a && a.post && a.post()); }
      function applyPageColors(force) {
        const wp = postOn(); const exp = (cur && cur.exp) || renderer.toneMappingExposure || 1; const hex = mixed.page.getHex();
        if (!force && wp === lastPost && exp === lastExp && hex === lastPageHex) return;
        lastPost = wp; lastExp = exp; lastPageHex = hex;
        if (wp) { const inv = acesInv([mixed.page.r, mixed.page.g, mixed.page.b], exp); pageLin.setRGB(inv[0], inv[1], inv[2], THREE.LinearSRGBColorSpace); }
        else pageLin.copy(mixed.page);
        pageMat.color.copy(pageLin);
        if (sky && sky.material.uniforms && sky.material.uniforms.page) {
          /* el shader del cielo escribe valores crudos: con postproceso los convierte el OutputPass; sin él se muestran tal cual (bytes sRGB) */
          if (wp) sky.material.uniforms.page.value.copy(pageLin); else sky.material.uniforms.page.value.setRGB(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255, THREE.LinearSRGBColorSpace);
        }
        catchMat.opacity = mixed.shadowA;
      }
      /* vegetación del campo (instancias fuera de la losa): se encogen hasta desaparecer con el fundido */
      const ext = [];
      function restoreVeg() { ext.forEach(e => { if (!e.mesh.parent) return; const arr = e.mesh.instanceMatrix.array; e.idx.forEach((i, j) => { arr.set(e.saved[j], i * 16); }); e.mesh.instanceMatrix.needsUpdate = true; }); ext.length = 0; }
      function scanVeg() {
        restoreVeg(); const g = scene.getObjectByName('vegetation'); if (!g) return;
        g.traverse(o => {
          if (!o.isInstancedMesh || !/^(entorno-|pastizal)/.test(o.name)) return;
          const arr = o.instanceMatrix.array, idx = [], saved = [];
          for (let i = 0; i < o.count; i++) { const x = arr[i * 16 + 12], y = -arr[i * 16 + 14]; if (!insideFoot(x, y)) { idx.push(i); saved.push(arr.slice(i * 16, i * 16 + 16)); } }
          if (idx.length) ext.push({ mesh: o, idx, saved, k: 1 });
        });
      }
      function applyVeg(k) {
        ext.forEach(e => {
          if (e.k === k || !e.mesh.parent) return; e.k = k; const arr = e.mesh.instanceMatrix.array;
          e.idx.forEach((i, j) => { const s = e.saved[j], o = i * 16; for (let n = 0; n < 12; n++) arr[o + n] = s[n] * k; arr[o + 12] = s[12]; arr[o + 13] = s[13]; arr[o + 14] = s[14]; arr[o + 15] = 1; });
          e.mesh.instanceMatrix.needsUpdate = true;
        });
      }
      scanVeg();

      function applyDiorama() {
        const k = dio.k, inv = 1 - k;
        if (sky && sky.material.uniforms && sky.material.uniforms.pageMix) sky.material.uniforms.pageMix.value = k;
        if (stars) stars.material.opacity = (cur && cur.stars != null ? cur.stars * 0.9 : stars.material.opacity) * inv;
        if (sunSprite) sunSprite.material.opacity = (cur && cur.sunSprite != null ? cur.sunSprite : sunSprite.material.opacity) * inv;
        if (scene.fog && cur && cur.fogN) { scene.fog.near = cur.fogN + (4000 - cur.fogN) * k; scene.fog.far = cur.fogF + (9000 - cur.fogF) * k; }
        fading.forEach(o => { const m = o.material; if (k >= 0.999) { o.visible = false; m.transparent = false; m.opacity = o.userData.envOpacity; } else { o.visible = true; m.transparent = k > 0.001; m.opacity = o.userData.envOpacity * inv; } });
        const show = k > 0.001; top.visible = sides.visible = page.visible = catcher.visible = show;
        if (planClip) { planClip.visible = show; if (planBase) planBase.visible = !show; }
        setClip(k > 0.35); applyVeg(inv * inv);    /* los árboles del campo se van antes que el terreno (curva cuadrática) */
      }
      function setPaper(on) {
        if (lastPlano === on) return; lastPlano = on;
        topMat.color.setHex(on ? PAPER : 0xffffff); topMat.vertexColors = !on; topMat.map = on ? null : lawn; topMat.needsUpdate = true;
      }

      /* ───────── API ───────── */
      function setView(name, instant) {
        dio.view = name; const target = (name === 'maqueta' || name === 'plano') ? 1 : 0;
        setPaper(name === 'plano');
        if (target === dio.target) return;
        dio.target = target; dio.from = dio.k; dio.t0 = performance.now(); if (instant || reduced) dio.k = target;
      }
      function setLight(mode, instant) {
        if (!SKY[mode] || mode === lightState.mode) return;
        lightState.from = lightState.mode; lightState.mode = mode; lightState.t0 = performance.now(); lightState.k = instant || reduced ? 1 : 0;
      }
      function update() {
        const now = performance.now();
        if (dio.k !== dio.target) { const t = Math.min(1, (now - dio.t0) / (FADE * 1000)); dio.k = dio.from + (dio.target - dio.from) * easeInOut(t); if (t >= 1) dio.k = dio.target; }
        const lightMoving = lightState.k < 1;
        if (lightMoving) lightState.k = Math.min(1, (now - lightState.t0) / 1600);
        mixLight();
        if (envRT === null || lightMoving || Math.abs(dio.k - envDio) > 0.001) regenEnv(envRT === null);
        if (hemi && cur && cur.hemiI != null) hemi.intensity = cur.hemiI * mixed.hemiK * (1 + (DIO_HEMI - 1) * dio.k);
        if (amb && cur && cur.amb != null) amb.intensity = cur.amb * mixed.ambK * (1 + (DIO_AMB - 1) * dio.k);
        applyPageColors(false);
        applyDiorama();                        /* cada cuadro: el núcleo reescribe niebla/estrellas en sus transiciones de luz */
      }
      function settle() {
        dio.k = dio.target; lightState.k = 1; mixLight(); regenEnv(true); applyPageColors(true); applyDiorama();
        if (hemi && cur && cur.hemiI != null) hemi.intensity = cur.hemiI * mixed.hemiK * (1 + (DIO_HEMI - 1) * dio.k);
        if (amb && cur && cur.amb != null) amb.intensity = cur.amb * mixed.ambK * (1 + (DIO_AMB - 1) * dio.k);
      }
      function refresh() { scanVeg(); applyVeg(1 - dio.k); }
      function dispose() {
        restoreVeg(); setClip(false); scene.environment = null; if (envRT) envRT.dispose(); if (pmrem) pmrem.dispose();
        fading.forEach(o => { o.visible = true; o.material.transparent = false; o.material.opacity = o.userData.envOpacity; });
        if (planBase) planBase.visible = true; if (sky && sky.material.uniforms && sky.material.uniforms.pageMix) sky.material.uniforms.pageMix.value = 0;
        rutaMats.forEach(m => { m.clippingPlanes = null; m.needsUpdate = true; }); if (camino && camino.material) { camino.material.clippingPlanes = null; camino.material.needsUpdate = true; }
        group.parent && group.parent.remove(group); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); texs.forEach(t => t.dispose());
      }
      const api = {
        group, focus: new THREE.Vector3(center.x, 0.5, -center.y), footprint: foot.map(p => p.slice()), bottomY: yB, center,
        setView, setLight, update, settle, refresh, dispose,
        setMode() { refresh(); }, setNight(on) { setLight(on ? 'noche' : 'atardecer'); },
        k() { return dio.k; }, isDiorama() { return dio.target === 1; },
        stats() { return { triangles: Math.round((top.geometry.attributes.position.count + sides.geometry.index.count + (planClip ? planClip.geometry.attributes.position.count : 0)) / 3) + 4, footprint: foot.length, bottomY: yB }; },
      };
      setView(ctx.view || 'maqueta', true);
      return api;
    },
  };
})();
