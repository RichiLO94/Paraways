/* Prueba de interacción de la maqueta (Playwright + SwiftShader): hover, clic, teclado, vistas.
   Uso: NODE_PATH=/opt/node22/lib/node_modules node test-interactions.js [ancho] [alto]
   Imprime un JSON con cada verificación (ok/esperado/obtenido) y deja capturas en ../out/test-*.png */
const { chromium } = require('playwright');
const path = require('path');
const [,, w, h] = process.argv;
const OUT = path.join(__dirname, 'out');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +(w || 1440), height: +(h || 900) } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto(process.env.PW_URL || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/');
  await p.waitForFunction(() => window.PW && PW.app && PW.app.state && PW.app.state.ready, null, { timeout: 120000 });
  const results = [];
  const check = (name, got, want) => results.push({ name, ok: got === want, got, want });
  const settle = async () => { await p.evaluate(() => PW.app.settle()); await p.waitForTimeout(400); };
  const state = () => p.evaluate(() => ({ view: PW.app.state.view, sel: PW.app.state.selected, hover: PW.app.state.hover, light: PW.app.state.light, mode: PW.app.state.mode, cotas: PW.app.state.cotas }));

  await p.evaluate(() => PW.app.setView('maqueta')); await settle();
  /* hover sobre el lote 3 */
  const pos3 = await p.evaluate(() => PW.app.screenPos(3));
  await p.mouse.move(pos3.x, pos3.y + 8); await p.waitForTimeout(250); await p.mouse.move(pos3.x + 2, pos3.y + 10); await p.waitForTimeout(400);
  check('hover lote 3', (await state()).hover, 3);
  await settle(); await p.screenshot({ path: path.join(OUT, 'test-hover-3.png') });
  /* clic selecciona */
  await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(500);
  check('clic selecciona lote 3', (await state()).sel, 3);
  await settle(); await p.screenshot({ path: path.join(OUT, 'test-select-3.png') });
  /* teclado */
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(200); check('flecha derecha → 4', (await state()).sel, 4);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(200); check('flecha izquierda ×2 → 2', (await state()).sel, 2);
  await p.keyboard.press('7'); await p.waitForTimeout(200); check('tecla 7 → 7', (await state()).sel, 7);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200); check('Escape → ninguno', (await state()).sel, null);
  await p.keyboard.press('p'); await p.waitForTimeout(200); check('P → vista plano', (await state()).view, 'plano');
  await p.keyboard.press('c'); await p.waitForTimeout(200); check('C → cotas', (await state()).cotas, true);
  await settle(); await p.screenshot({ path: path.join(OUT, 'test-plano-cotas.png') });
  await p.keyboard.press('l'); await p.waitForTimeout(200); check('L → noche', (await state()).light, 'noche');
  await p.keyboard.press('t'); await p.waitForTimeout(200); check('T → bosque', (await state()).mode, 'bosque');
  await p.keyboard.press('v'); await p.waitForTimeout(200); check('V → siguiente vista (ruta)', (await state()).view, 'ruta');
  await p.keyboard.press('r'); await p.waitForTimeout(200); const s = await state(); check('R → reset vista', s.view, 'maqueta'); check('R → reset luz', s.light, 'atardecer'); check('R → reset modo', s.mode, 'parque');
  /* clic en vacío deselecciona; arrastre no selecciona */
  await p.keyboard.press('2'); await settle(); const pos5 = await p.evaluate(() => PW.app.screenPos(5));
  await p.mouse.move(pos5.x, pos5.y + 6); await p.mouse.down(); await p.mouse.move(pos5.x + 80, pos5.y + 40, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  check('arrastre no cambia la selección', (await state()).sel, 2);
  await p.mouse.move(720, 60); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(300); check('clic en el campo deselecciona', (await state()).sel, null);   /* página vacía sobre la maqueta (el minimapa ahora llega hasta y≈450) */
  const info = await p.evaluate(() => ({ tri: PW.app.renderer.info.render.triangles, calls: PW.app.renderer.info.render.calls, mem: PW.app.renderer.info.memory }));
  console.log(JSON.stringify({ results, pass: results.filter(r => r.ok).length + '/' + results.length, info, errors: errs }, null, 1));
  await b.close();
})();
