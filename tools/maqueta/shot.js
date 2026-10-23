/* Captura del harness con Playwright (WebGL por SwiftShader).
   Uso: NODE_PATH=/opt/node22/lib/node_modules node shot.js "mods=vegetation&view=maqueta" salida.png [ancho] [alto]
   Requiere el servidor local del repo (python3 -m http.server 8765 desde la raíz) */
const { chromium } = require('playwright');
const [,, query, out, w, h] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(w || 1280), height: +(h || 800) } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await p.goto((process.env.PW_BASE || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/') + 'dev/harness.html?' + query);
  const t0 = Date.now();
  try { await p.evaluate(() => window.PW_READY); } catch (e) { errs.push('PW_READY: ' + e.message); }
  await p.waitForTimeout(1500);
  const stats = await p.evaluate(() => document.getElementById('hud').textContent);
  await p.screenshot({ path: out });
  console.log(JSON.stringify({ out, ms: Date.now() - t0, stats, errors: errs }, null, 1));
  await b.close();
})();
