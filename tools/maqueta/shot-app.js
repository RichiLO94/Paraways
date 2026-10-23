/* Captura de la app completa (index.html) con Playwright + WebGL por SwiftShader.
   Uso: node shot-app.js <salida.png> [ancho] [alto] [script JS a evaluar tras la carga] [espera ms]
   Requiere el servidor local del repo (python3 -m http.server 8765 desde la raíz) */
const { chromium } = require('playwright');
const [,, out, w, h, js, wait] = process.argv;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(w || 1440), height: +(h || 900) } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto((process.env.PW_URL || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/'));
  await p.waitForFunction(() => window.PW && PW.app && PW.app.state && PW.app.state.ready, null, { timeout: 90000 }).catch(e => errs.push('ready timeout: ' + e.message));
  await p.waitForTimeout(3200);
  if (js) { try { const r = await p.evaluate(js); if (r !== undefined) console.log('eval:', JSON.stringify(r)); } catch (e) { errs.push('eval: ' + e.message); } }
  await p.waitForTimeout(+(wait || 2200));
  if (!process.env.PW_NOSETTLE) { try { await p.evaluate(() => { PW.app.settle && PW.app.settle(); PW.app.pause && PW.app.pause(); }); await p.waitForTimeout(1200); await p.evaluate(() => PW.app.settle && PW.app.settle()); await p.waitForTimeout(+(process.env.PW_AFTER || 1500)); } catch (e) { errs.push('settle: ' + e.message); } }
  const info = await p.evaluate(() => { const r = PW.app.renderer; return r ? { tri: r.info.render.triangles, calls: r.info.render.calls, view: PW.app.state.view, sel: PW.app.state.selected } : null; });
  await p.screenshot({ path: out });
  console.log(JSON.stringify({ out, info, errors: errs }, null, 1));
  await b.close();
})();
