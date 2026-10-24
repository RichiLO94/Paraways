/* Cuadros del loop orbital de la maqueta (360° sin corte), sin interfaz, con el bucle del visor detenido.
   Uso: node loop-frames.js <carpeta> [cuadros=144] [ancho=1280] [alto=720]
   Cada cuadro: cámara fijada (theta = -0.78 + 2π·i/N, phi 0.87, dist 168, objetivo de la vista maqueta),
   PW.app.settle(), espera breve y captura. Luego: ffmpeg -framerate 24 -i f%04d.png …
   Ejecutar siempre envuelto en: flock /tmp/pw-render.lock node loop-frames.js … */
const fs = require('fs');
const { chromium } = require('playwright');
const [,, dir, nArg, wArg, hArg] = process.argv;
const N = +(nArg || 144), W = +(wArg || 1280), H = +(hArg || 720);
const URL = process.env.PW_URL || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/';
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const t0 = Date.now();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(URL);
  await p.waitForFunction(() => window.PW && PW.app && PW.app.state && PW.app.state.ready, null, { timeout: 120000 });
  await p.waitForTimeout(3800);
  /* objetivo: el centro de la losa del diorama (la vista maqueta lo corre hacia la cámara para dejar sitio a la interfaz;
     en una órbita completa eso descentra). Distancia: 168 salvo que la losa (huella + 11 m de copas) no entre en todos
     los ángulos con margen; entonces la mínima que la contenga, constante en todo el giro para que no "respire" */
  const base = await p.evaluate(([N, th0]) => {
    const u = document.querySelector('.pw-ui'); if (u) u.style.display = 'none';
    PW.app.setView('maqueta'); PW.app.settle(); PW.app.pause();
    const env = PW.app.env(), cam = PW.app.cam, camera = PW.app.camera;
    const t = { x: env.center.x, y: 0.5, z: -env.center.y };
    const pts = []; env.footprint.forEach(q => { pts.push(new THREE.Vector3(q[0], env.bottomY, -q[1])); pts.push(new THREE.Vector3(q[0], 11, -q[1])); });
    let dist = 168, worst = 0;
    for (let it = 0; it < 3; it++) {
      worst = 0;
      for (let k = 0; k < 24; k++) {
        cam.tTarget.set(t.x, t.y, t.z); cam.tDist = dist; cam.tPhi = 0.87; cam.tTheta = th0 + 2 * Math.PI * k / 24; cam.tween = null; PW.app.settle();
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; pts.forEach(q => { const v = q.clone().project(camera); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); });
        worst = Math.max(worst, (x1 - x0) / (2 * 0.95), (y1 - y0) / (2 * 0.9));
      }
      if (worst <= 1) break; dist = Math.min(cam.maxDist, dist * worst);
    }
    return { x: t.x, y: t.y, z: t.z, dist: +dist.toFixed(1), worst: +worst.toFixed(3) };
  }, [N, -0.78]);
  console.log('objetivo', JSON.stringify(base));
  for (let i = 0; i < N; i++) {
    const theta = -0.78 + 2 * Math.PI * i / N;
    await p.evaluate(([b, th]) => { const c = PW.app.cam; c.tTarget.set(b.x, b.y, b.z); c.tDist = b.dist; c.tPhi = 0.87; c.tTheta = th; c.tween = null; PW.app.settle(); }, [base, theta]);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${dir}/f${String(i).padStart(4, '0')}.png` });
    if (i % 12 === 0) console.log(`cuadro ${i}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  console.log(JSON.stringify({ frames: N, size: [W, H], seconds: Math.round((Date.now() - t0) / 1000), errors: errs }));
  await b.close();
})();
