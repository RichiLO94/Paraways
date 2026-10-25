/* Cuadros 3D de la película del hero (film-build.py): fundido cenital ALINEADO con la aérea e inclinación hasta la vista Maqueta.
   Uso: flock /tmp/pw-render.lock node film-frames.js <carpeta de trabajo de la película>
   Lee <carpeta>/cams-request.json (lo escribe «film-build.py plan») y escribe <carpeta>/3d/kNNNN.png (1280×720, sin interfaz)
   y <carpeta>/3d/proj.json (por cuadro: vértices de PW_DATA.site.polygon proyectados a píxeles y la cámara usada).
   - Cuadros «cenital»: la cámara del visor (phi ≈ 0, mirando hacia abajo) se resuelve para que el polígono medido caiga
     exactamente en los píxeles pedidos (los de la aérea con su empuje): iteración de escala (distancia), giro (theta) y
     centro (objetivo, por rayo al suelo) sobre una copia de la cámara, sin renderizar (residuo ≈ 0,6 px por el relieve).
   - Cuadros «tilt»: interpolación (u ya suavizado por film-build.py) desde la última cenital hasta la pose de la vista
     Maqueta del visor con el encuadre del póster (setView('maqueta') + el ajuste «fit» de poster.js con márgenes 0,12/0,15:
     theta 0,62, phi 0,87, losa centrada), theta por el giro corto, distancia en escala logarítmica y el objetivo
     resuelto para que el centro del predio recorra la pantalla en línea recta (sin vaivén). Discos numerados de las parcelas con la opacidad pedida (0 → 1).
   Luz Atardecer (?light=atardecer), modo diorama (página marfil), sin textos apoyados en el suelo (rótulos de ruta y del
   norte), bucle del visor detenido (PW.app.pause) y PW.app.settle() antes de cada captura, como poster.js y loop-frames.js.
   Requiere el servidor local del repo (python3 -m http.server 8765 desde la raíz) y Playwright con Chromium. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const URL = process.env.PW_URL || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/?light=atardecer';
const dir = process.argv[2];
if (!dir) { console.error('uso: node film-frames.js <carpeta>'); process.exit(1); }
const req = JSON.parse(fs.readFileSync(path.join(dir, 'cams-request.json'), 'utf8'));
const out = path.join(dir, '3d'); fs.mkdirSync(out, { recursive: true });
/* pruebas: FILM_ONLY=300,340 o 324-391 → solo se capturan esos cuadros (las cámaras y proj.json se calculan todos) */
const only = process.env.FILM_ONLY ? new Set(process.env.FILM_ONLY.split(',').flatMap(x => { const [a, b] = x.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; })) : null;

(async () => {
  const t0 = Date.now();
  const [W, H] = req.size;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.PW && PW.app && PW.app.state && PW.app.state.ready, null, { timeout: 120000 });
  await p.waitForTimeout(3800);                                     /* sombras, PMREM y entrada cinematográfica */
  const setup = await p.evaluate(() => {
    const u = document.querySelector('.pw-ui'); if (u) u.style.display = 'none';
    const app = PW.app, cam = app.cam, T = PW.terrain, D = PW_DATA;
    app.setView('maqueta'); app.settle(); app.pause();
    /* encuadre final = el del póster assets/trianon-maqueta.jpg (poster.js con fit {x: 0.12, y: 0.15}): misma vista
       Maqueta (theta 0,62, phi 0,87), losa del diorama centrada y con esos márgenes */
    const env = app.env(), camera = app.camera, fit = { x: 0.12, y: 0.15 };
    const pts = []; env.footprint.forEach(q => { pts.push(new THREE.Vector3(q[0], 0.4, -q[1])); pts.push(new THREE.Vector3(q[0], env.bottomY, -q[1])); });
    const bbox = () => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(q => { const v = q.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }); return { x0, x1, y0, y1 }; };
    const hit = (nx, ny) => { const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(nx, ny), camera); const o = new THREE.Vector3(); return r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), o) ? o : null; };
    for (let i = 0; i < 10; i++) {
      app.settle();
      const bb = bbox(); const P1 = hit((bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2), P0 = hit(0, 0);
      if (P1 && P0) cam.tTarget.add(P1.sub(P0));
      const sc = Math.max((bb.x1 - bb.x0) / (2 * (1 - fit.x)), (bb.y1 - bb.y0) / (2 * (1 - fit.y)));
      cam.tDist = THREE.MathUtils.clamp(cam.tDist * (0.5 + 0.5 * sc), cam.minDist, cam.maxDist); cam.tween = null;
    }
    app.settle();
    const maq = { t: [cam.tTarget.x, cam.tTarget.y, cam.tTarget.z], d: cam.tDist, phi: cam.tPhi, th: cam.tTheta };
    /* textos apoyados en el suelo (ruta, «N», «norte»): fuera, la película no lleva textos */
    let hidden = 0;
    app.scene.traverse(o => { if (o.isMesh && o.renderOrder === 6 && o.material && o.material.map && o.material.map.image && o.material.map.image.nodeName === 'CANVAS') { o.visible = false; hidden++; } });
    const W = innerWidth, H = innerHeight;
    const poly = D.site.polygon.map(q => T.toWorld(q[0], q[1]));
    const vcam = app.camera.clone(); vcam.updateProjectionMatrix();
    const place = (c, s) => {                                       /* misma geometría que applyCam() del visor */
      const sp = Math.sin(s.phi);
      c.position.set(s.t[0] + s.d * sp * Math.sin(s.th), s.t[1] + s.d * Math.cos(s.phi), s.t[2] + s.d * sp * Math.cos(s.th));
      c.lookAt(s.t[0], s.t[1], s.t[2]); c.updateMatrixWorld(true);
    };
    const project = c => poly.map(v => { const q = v.clone().project(c); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; });
    /* similitud por mínimos cuadrados a → b (forma compleja: b ≈ z·a + t) */
    const sim = (a, bb) => {
      const n = a.length; let ax = 0, ay = 0, bx = 0, by = 0;
      a.forEach((q, i) => { ax += q[0]; ay += q[1]; bx += bb[i][0]; by += bb[i][1]; }); ax /= n; ay /= n; bx /= n; by /= n;
      let re = 0, im = 0, den = 0;
      a.forEach((q, i) => { const x = q[0] - ax, y = q[1] - ay, u = bb[i][0] - bx, v = bb[i][1] - by; re += x * u + y * v; im += x * v - y * u; den += x * x + y * y; });
      const zr = re / den, zi = im / den;
      return { s: Math.hypot(zr, zi), r: Math.atan2(zi, zr), zr, zi, tx: bx - (zr * ax - zi * ay), ty: by - (zi * ax + zr * ay) };
    };
    const rms = (a, bb) => Math.sqrt(a.reduce((acc, q, i) => acc + (q[0] - bb[i][0]) ** 2 + (q[1] - bb[i][1]) ** 2, 0) / a.length);
    const ground = poly.reduce((acc, v) => acc + v.y, 0) / poly.length;
    /* sentido del giro de la imagen al aumentar theta (en cenital) */
    const c0 = poly.reduce((acc, v) => [acc[0] + v.x / poly.length, acc[1] + v.z / poly.length], [0, 0]);
    const probe = { t: [c0[0], ground, c0[1]], d: 240, phi: 1e-4, th: -0.6 };
    place(vcam, probe); const pa = project(vcam); place(vcam, Object.assign({}, probe, { th: -0.59 })); const pb = project(vcam);
    const kappa = Math.sign(sim(pa, pb).r / 0.01) || 1;
    function solve(want, s0) {
      const s = { t: s0.t.slice(), d: s0.d, phi: s0.phi, th: s0.th }; let err = 1e9, it = 0;
      let prev = 1e9;
      for (; it < 40; it++) {
        place(vcam, s); const pr = project(vcam); err = rms(pr, want);
        if (err < 0.05 || prev - err < 1e-4) break;              /* el relieve deja ~0,6 px de residuo: no es una similitud exacta */
        prev = err;
        const S = sim(pr, want);
        /* el punto de la imagen actual que debe quedar en el centro: S⁻¹(centro) */
        const cx = W / 2 - S.tx, cy = H / 2 - S.ty, dn = S.zr * S.zr + S.zi * S.zi;
        const qx = (S.zr * cx + S.zi * cy) / dn, qy = (-S.zi * cx + S.zr * cy) / dn;
        const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(qx / W * 2 - 1, 1 - qy / H * 2), vcam);
        const hit = new THREE.Vector3(); if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -ground), hit)) break;
        s.t = [hit.x, ground, hit.z]; s.d /= S.s; s.th += S.r / kappa;
      }
      place(vcam, s);
      return { s, err, it };
    }
    /* centro del predio (promedio de vértices) en pantalla y objetivo que lo lleva a un punto dado, con la orientación fija */
    const C = poly.reduce((acc, v) => acc.add(v.clone().multiplyScalar(1 / poly.length)), new THREE.Vector3());
    const screenC = s => { place(vcam, s); const q = C.clone().project(vcam); return [(q.x + 1) / 2 * W, (1 - q.y) / 2 * H]; };
    const gHit = (px, py) => { const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(px / W * 2 - 1, 1 - py / H * 2), vcam); const o = new THREE.Vector3(); return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -C.y), o) ? o : null; };
    function aimAt(s, want) {
      for (let i = 0; i < 8; i++) {
        const q = screenC(s); if (Math.hypot(q[0] - want[0], q[1] - want[1]) < 0.05) break;
        const a = gHit(q[0], q[1]), b = gHit(want[0], want[1]); if (!a || !b) break;
        s.t = [s.t[0] + a.x - b.x, s.t[1], s.t[2] + a.z - b.z];
      }
      return s;
    }
    window.FILM = { app, cam, maq, solve, place, project, vcam, ground, c0, screenC, aimAt };
    return { maq, hidden, kappa, ground: +ground.toFixed(3), lots: Object.keys(app.lots).length };
  });
  console.log('preparado', JSON.stringify(setup));
  const proj = {};
  let pose = null, last = null;
  for (const f of req.frames) {
    const shoot = !only || only.has(f.k);
    const r = await p.evaluate(([f, pose, last, shoot]) => {
      const F = window.FILM, app = F.app, cam = F.cam;
      let s, info = {};
      if (f.mode === 'cenital') {
        const init = pose || { t: [F.c0[0], F.ground, F.c0[1]], d: 240, phi: 1e-4, th: -0.63 };
        const R = F.solve(f.verts, init); s = R.s; info = { err: +R.err.toFixed(4), it: R.it };
      } else {
        const a = last, m = F.maq, u = f.u;
        let dth = m.th - a.th; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
        s = { t: a.t.map((v, i) => v + (m.t[i] - v) * u), d: Math.exp(Math.log(a.d) + (Math.log(m.d) - Math.log(a.d)) * u), phi: a.phi + (m.phi - a.phi) * u, th: a.th + dth * u };
        /* el centro del predio recorre la pantalla en línea recta entre la cenital y el encuadre final (sin vaivén) */
        const p0 = F.screenC(a), p1 = F.screenC(m);
        F.aimAt(s, [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u]);
      }
      const disc = f.mode === 'cenital' ? 0 : f.disc;
      /* lotFrame (dentro de settle) fija la visibilidad por distancia pero no toca la opacidad del disco */
      Object.values(app.lots).forEach(l => { l.label.material.transparent = true; l.label.material.opacity = disc; });
      cam.tTarget.set(s.t[0], s.t[1], s.t[2]); cam.tDist = s.d; cam.tPhi = s.phi; cam.tTheta = s.th; cam.tween = null;
      if (shoot) app.settle();
      F.place(F.vcam, s);
      return { s, info, verts: F.project(F.vcam).map(q => [+q[0].toFixed(3), +q[1].toFixed(3)]), cam: [app.camera.position.x, app.camera.position.y, app.camera.position.z].map(v => +v.toFixed(3)) };
    }, [f, pose, last, shoot]);
    if (f.mode === 'cenital') { pose = r.s; last = r.s; }
    proj[f.k] = { verts: r.verts, mode: f.mode, pose: r.s, info: r.info };
    if (shoot) {
      await p.waitForTimeout(120);
      await p.screenshot({ path: path.join(out, `k${String(f.k).padStart(4, '0')}.png`) });
    }
    if (f.k % 12 === 0) console.log(`cuadro ${f.k} ${f.mode} ${JSON.stringify(r.info)} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  fs.writeFileSync(path.join(out, 'proj.json'), JSON.stringify(proj));
  console.log(JSON.stringify({ frames: req.frames.length, seconds: Math.round((Date.now() - t0) / 1000), errors: errs }));
  await b.close();
})();
