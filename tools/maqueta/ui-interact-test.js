/* Prueba funcional de PW.ui (sin WebGL): chips, minimapa, teclado, ficha, ayuda y bottom sheet móvil.
   Uso: NODE_PATH=/opt/node22/lib/node_modules node ui-interact-test.js */
const { chromium } = require('playwright');
const assert = (c, m) => { if (!c) throw new Error('FALLO: ' + m); console.log('ok  ' + m); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errs = [];
  /* ── escritorio ── */
  let p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto((process.env.PW_BASE || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/') + 'dev/ui-test.html?sel=0');
  const calls = async () => p.evaluate(() => window.__calls || []);
  await p.evaluate(() => { window.__calls = []; const o = console.log; console.log = (...a) => { if (String(a[0]).startsWith('[ui]')) window.__calls.push(a.join(' ')); o(...a); }; });
  await p.click('.pw-chip[data-id="3"]');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet').classList.contains('is-open')), 'clic en chip 3 abre la ficha');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 3', 'ficha muestra Lote 3');
  assert(await p.evaluate(() => document.querySelector('.pw-area-num').textContent) === '633,90 m²', 'superficie con coma: 633,90 m² (sobre la mensura)');
  assert((await calls()).some(c => c.includes('onSelect 3')), 'handler onSelect(3) llamado');
  assert(await p.evaluate(() => document.querySelector('.pw-cta').href.includes('wa.me/595993474309?text=' + encodeURIComponent('Hola, vi el lote 3 de Le Petit Trianon (San Bernardino) en la maqueta 3D y quiero saber más.'))), 'CTA WhatsApp con texto codificado');
  assert(await p.evaluate(() => document.querySelector('.pw-chip[data-id="3"]').getAttribute('aria-pressed')) === 'true', 'chip 3 aria-pressed');
  assert(await p.evaluate(() => document.querySelector('.pw-map .pw-lot-g[data-id="3"] .pw-lot').classList.contains('is-selected')), 'minimapa pinta el lote 3 seleccionado');
  await p.hover('.pw-map .pw-lot-g[data-id="5"]');
  assert((await calls()).some(c => c.includes('onHover 5')), 'hover en minimapa → onHover(5)');
  await p.click('.pw-map .pw-lot-g[data-id="5"]');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 5', 'clic en minimapa → Lote 5');
  await p.click('.pw-sheet-nav button:last-child');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 6', 'siguiente → Lote 6');
  await p.keyboard.press('ArrowRight');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 7', 'flecha derecha → Lote 7');
  await p.keyboard.press('ArrowRight');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 1', 'flecha derecha cicla → Lote 1');
  await p.keyboard.press('Escape');
  assert(!(await p.evaluate(() => document.querySelector('.pw-sheet').classList.contains('is-open'))), 'Esc cierra la ficha');
  assert((await calls()).some(c => c.includes('onSelect null')), 'cerrar → onSelect(null)');
  await p.keyboard.press('2'); await p.keyboard.press('Enter');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 2', 'tecla 2 + Enter → Lote 2');
  await p.click('.pw-close'); assert(!(await p.evaluate(() => document.querySelector('.pw-sheet').classList.contains('is-open'))), 'botón cerrar cierra la ficha');
  for (const [k, h] of [['v', 'onView "plano"'], ['l', 'onLight "noche"'], ['t', 'onMode "bosque"'], ['c', 'onCotas true'], ['p', 'onView "maqueta"']]) { await p.keyboard.press(k); assert((await calls()).some(c => c.includes(h)), 'tecla ' + k.toUpperCase() + ' → ' + h); }
  assert(await p.evaluate(() => document.querySelector('.pw-ui').getAttribute('data-light')) === 'noche', 'tema nocturno aplicado (data-light=noche)');
  await p.keyboard.press('p'); assert(await p.evaluate(() => getComputedStyle(document.querySelector('.pw-map')).display) === 'none', 'vista Plano oculta el minimapa');
  await p.keyboard.press('r'); assert((await calls()).some(c => c.includes('onReset')), 'tecla R → onReset');
  assert(await p.evaluate(() => getComputedStyle(document.querySelector('.pw-map')).display) !== 'none', 'reiniciar muestra el minimapa');
  await p.click('.pw-tb-help');
  assert(await p.evaluate(() => document.querySelector('.pw-help').classList.contains('is-open')), '? abre la ayuda');
  assert(await p.evaluate(() => document.activeElement === document.querySelector('.pw-help .pw-close')), 'foco en cerrar ayuda');
  await p.keyboard.press('Escape'); assert(!(await p.evaluate(() => document.querySelector('.pw-help').classList.contains('is-open'))), 'Esc cierra la ayuda');
  await p.click('.pw-group[aria-label="Luz"] .pw-tb:nth-of-type(1)');
  assert((await calls()).some(c => c.includes('onLight "dia"')), 'botón Día → onLight("dia")');
  await p.evaluate(() => { ui.toast('Lote 4 seleccionado'); ui.setHover(4, { x: 500, y: 300 }); });
  assert(await p.evaluate(() => document.querySelector('.pw-toast').classList.contains('is-on') && document.querySelector('.pw-float').textContent === 'Lote 4 · 399,46 m²'), 'toast y hint flotante');
  await p.evaluate(() => ui.setLoading(0.5)); assert(await p.evaluate(() => document.querySelector('.pw-loading-fill').style.width) === '50%', 'setLoading(0.5) → barra al 50 %');
  await p.evaluate(() => ui.setLoading(false)); await p.waitForTimeout(800); assert(!(await p.evaluate(() => !!document.querySelector('.pw-loading'))), 'setLoading(false) retira la pantalla de carga');
  await p.evaluate(() => ui.setView('libre')); assert(await p.evaluate(() => document.querySelectorAll('.pw-group[aria-label="Vista"] [aria-pressed="true"]').length) === 0, 'vista libre: ningún botón de vista activo');
  /* cotas activas retiran el minimapa (clase is-cotas), como la vista Plano */
  await p.evaluate(() => ui.setCotas(true)); assert(await p.evaluate(() => getComputedStyle(document.querySelector('.pw-map')).display) === 'none', 'cotas activas ocultan el minimapa (is-cotas)');
  await p.evaluate(() => ui.setCotas(false)); assert(await p.evaluate(() => getComputedStyle(document.querySelector('.pw-map')).display) !== 'none', 'cotas apagadas: vuelve el minimapa');
  /* cola de avisos: el de la música espera a que termine «Lote N seleccionado» en vez de pisarlo */
  await p.waitForTimeout(1900);
  await p.evaluate(() => { ui.toast('Lote 2 seleccionado'); ui.toast('Música de fondo · M para silenciar', { queue: true }); });
  assert(await p.evaluate(() => document.querySelector('.pw-toast').textContent) === 'Lote 2 seleccionado', 'aviso en cola: el del lote se mantiene');
  await p.waitForTimeout(2300);
  assert(await p.evaluate(() => document.querySelector('.pw-toast').classList.contains('is-on') && /M para silenciar/.test(document.querySelector('.pw-toast').textContent)), 'aviso en cola: el de la música sale al terminar el anterior');
  assert(await p.evaluate(() => !document.querySelector('.pw-music') && !document.querySelector('.pw-head').classList.contains('has-music')), 'escritorio: sin música no hay botón de la nota');
  assert(await p.evaluate(() => getComputedStyle(document.querySelector('.pw-sheet-headnav')).display) === 'none', 'escritorio ancho: la navegación de la ficha sigue en la fila inferior');
  await p.close();
  /* ── móvil: bottom sheet deslizable ── */
  p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto((process.env.PW_BASE || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/') + 'dev/ui-test.html?sel=3'); await p.waitForTimeout(500);
  const r = await p.evaluate(() => { const m = document.querySelector('.pw-map').getBoundingClientRect(), s = document.querySelector('.pw-sheet').getBoundingClientRect(); return { mapBottom: m.bottom, sheetTop: s.top }; });
  assert(r.mapBottom < r.sheetTop, 'móvil: la ficha (' + Math.round(r.sheetTop) + 'px) no tapa el minimapa (' + Math.round(r.mapBottom) + 'px)');
  /* móvil: la nota va fija arriba a la derecha (fuera de la cabecera) y sigue visible con la ficha abierta; los chips se funden con opacity */
  const mb = await p.evaluate(() => { const b = document.querySelector('.pw-music'); return { music: !!b, chipsOp: getComputedStyle(document.querySelector('.pw-chips')).opacity, headTf: getComputedStyle(document.querySelector('.pw-head')).transform, cornerTf: getComputedStyle(document.querySelector('.pw-corner-tl')).transform }; });
  assert(!mb.music, 'móvil: sin música no hay botón de la nota (' + JSON.stringify(mb) + ')');
  assert(mb.chipsOp === '0' && mb.headTf !== 'none' && mb.cornerTf === 'none', 'móvil con ficha: cabecera retirada por transform propio (no .pw-corner-tl) y chips fundidos');
  /* móvil: la navegación entre lotes está en la cabecera de la ficha (botones redondos de 40 px con aria-label) y la fila inferior no se muestra */
  const hn = await p.evaluate(() => { const b = document.querySelector('.pw-sheet-headnav .pw-sheet-hb:last-child'), rc = b.getBoundingClientRect(); return { w: rc.width, h: rc.height, label: b.getAttribute('aria-label'), nav: getComputedStyle(document.querySelector('.pw-sheet-nav')).display, more: document.querySelector('.pw-sheet').classList.contains('has-more') }; });
  assert(hn.w === 40 && hn.h === 40 && hn.label === 'Ver el lote 4' && hn.nav === 'none', 'móvil: botones de lote anterior/siguiente en la cabecera de la ficha (' + JSON.stringify(hn) + ')');
  await p.click('.pw-sheet-headnav .pw-sheet-hb:last-child');
  assert(await p.evaluate(() => document.querySelector('.pw-sheet-title').textContent) === 'Lote 4', 'móvil: siguiente desde la cabecera → Lote 4');
  assert(hn.more === true, 'móvil: la ficha marca que hay más contenido (degradado inferior)');
  const hb = await p.evaluate(() => { const h = document.querySelector('.pw-sheet-head').getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; });
  await p.mouse.move(hb.x, hb.y); await p.mouse.down(); await p.mouse.move(hb.x, hb.y + 60, { steps: 4 }); await p.mouse.move(hb.x, hb.y + 160, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(400);
  assert(!(await p.evaluate(() => document.querySelector('.pw-sheet').classList.contains('is-open'))), 'móvil: arrastrar la ficha hacia abajo la cierra');
  const tb = await p.evaluate(() => { const t = document.querySelector('.pw-toolbar'); const W = window.innerWidth; return { allVisible: [...t.querySelectorAll('.pw-tb')].every(b => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.right <= W + 0.5 && r.width > 0; }), h: t.getBoundingClientRect().height }; });
  assert(tb.allVisible, 'móvil: todos los botones de la barra inferior quedan a la vista (dos filas, sin scroll)');
  await p.close();
  await b.close();
  if (errs.length) { console.log('errores de página:', errs); process.exit(1); }
  console.log('TODO OK');
})().catch(e => { console.error(e.message); process.exit(1); });
