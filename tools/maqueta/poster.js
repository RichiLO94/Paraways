/* Pósters del visor sin interfaz (Playwright + WebGL por SwiftShader).
   Uso: node poster.js <lista.json>
   lista.json: [{ "out": "ruta.png", "w": 1600, "h": 1000, "js": "código a evaluar tras la carga", "wait": 1500 }, …]
   Cada captura: viewport exacto (deviceScaleFactor 1), interfaz oculta, PW.app.settle() + PW.app.pause().
   Requiere el servidor local del repo (python3 -m http.server 8765 desde la raíz).
   Ejecutar siempre envuelto en: flock /tmp/pw-render.lock node poster.js … */
const fs = require('fs');
const { chromium } = require('playwright');
const URL = process.env.PW_URL || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/';
const shots = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const s of shots) {
    const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto(URL + (s.query || ''));
    await p.waitForFunction(() => window.PW && PW.app && PW.app.state && PW.app.state.ready, null, { timeout: 120000 }).catch(e => errs.push('ready timeout: ' + e.message));
    await p.waitForTimeout(3800);                                   /* sombras, PMREM y entrada cinematográfica */
    await p.evaluate(() => { const u = document.querySelector('.pw-ui'); if (u) u.style.display = 'none'; });
    if (s.js) { try { const r = await p.evaluate(s.js); if (r !== undefined) console.log('eval:', JSON.stringify(r)); } catch (e) { errs.push('eval: ' + e.message); } }
    await p.waitForTimeout(s.wait || 1500);
    /* discos numerados fuera (acercamientos): el disco es un sprite; lotFrame no toca su opacidad */
    if (s.hideDiscs) await p.evaluate(() => Object.values(PW.app.lots).forEach(l => { l.label.material.transparent = true; l.label.material.opacity = 0; l.area.material.transparent = true; l.area.material.opacity = 0; }));
    /* encuadre: centra la losa del diorama (huella + espesor) y ajusta la distancia para que entre con el margen pedido
       (margen negativo = recorte deliberado). Itera: el desplazamiento se mide sobre el plano del suelo */
    if (s.fit) {
      try {
        const bb = await p.evaluate(m => {
          const env = PW.app.env(), cam = PW.app.cam, camera = PW.app.camera;
          const pts = []; env.footprint.forEach(q => { pts.push(new THREE.Vector3(q[0], 0.4, -q[1])); pts.push(new THREE.Vector3(q[0], env.bottomY, -q[1])); });
          const bbox = () => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(q => { const v = q.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }); return { x0, x1, y0, y1 }; };
          const hit = (nx, ny) => { const r = new THREE.Raycaster(); r.setFromCamera(new THREE.Vector2(nx, ny), camera); const o = new THREE.Vector3(); return r.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5), o) ? o : null; };
          for (let i = 0; i < 10; i++) {
            PW.app.settle();
            const b = bbox(); const P1 = hit((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), P0 = hit(0, 0);
            if (P1 && P0) cam.tTarget.add(P1.sub(P0));
            const s = Math.max((b.x1 - b.x0) / (2 * (1 - m.x)), (b.y1 - b.y0) / (2 * (1 - m.y)));
            cam.tDist = THREE.MathUtils.clamp(cam.tDist * (0.5 + 0.5 * s), cam.minDist, cam.maxDist); cam.tween = null;
          }
          PW.app.settle(); const b = bbox();
          return { px: [b.x0, b.x1, b.y0, b.y1].map(v => +v.toFixed(3)), target: [cam.tTarget.x, cam.tTarget.y, cam.tTarget.z].map(v => +v.toFixed(2)), dist: +cam.tDist.toFixed(1) };
        }, s.fit);
        console.log('fit:', JSON.stringify(bb));
      } catch (e) { errs.push('fit: ' + e.message); }
    }
    try {
      await p.evaluate(() => { PW.app.settle(); PW.app.pause(); });
      await p.waitForTimeout(900);
      await p.evaluate(() => PW.app.settle());
      await p.waitForTimeout(900);
    } catch (e) { errs.push('settle: ' + e.message); }
    const info = await p.evaluate(() => { const c = PW.app.cam; return { view: PW.app.state.view, light: PW.app.state.light, sel: PW.app.state.selected, cam: { t: [c.target.x, c.target.y, c.target.z].map(v => +v.toFixed(2)), dist: +c.dist.toFixed(1), phi: +c.phi.toFixed(3), theta: +c.theta.toFixed(3) }, size: [innerWidth, innerHeight] }; });
    await p.screenshot({ path: s.out });
    console.log(JSON.stringify({ out: s.out, info, errors: errs }));
    await ctx.close();
  }
  await b.close();
})();
