/* Objetivos táctiles (WCAG 2.2, 2.5.8) en la cabecera y el pie de ocho páginas (las cuatro homes y las cuatro del
   desarrollo), a 390×844: mide la caja de toque (border-box) de .top-nav .brand, .top-nav .langs a y footer a, en
   la cabecera del hero y con la nav de vidrio activada; exige ≥ 24×24 px, que las cajas de los idiomas no se
   superpongan y que un toque en el centro y en las cuatro esquinas de cada caja llegue al enlace (elementFromPoint).
   Registra la posición de los glifos (Range) relativa a su contenedor para compararla con una referencia tomada
   antes del cambio de CSS y demostrar que el trazado no se movió (el ancho de .langs cambia con el gap y se informa).
   Cero errores de consola a 1440×900 y 390×844 (ignora el 404 de /_vercel/insights/script.js; las fallas de red de
   Google Fonts se listan aparte como avisos de entorno). Captura out/touch-<tag>-nav.png y out/touch-<tag>-pie.png.
   Uso: NODE_PATH=/opt/node22/lib/node_modules flock /tmp/pw-render.lock node touch-targets-test.js [--baseline] [es,pt,en,fr]
     --baseline → solo mide a 390×844 y guarda out/touch-baseline.json; sin él compara contra esa referencia. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const args = process.argv.slice(2);
const BASELINE = args.includes('--baseline');
const langs = (args.find((a) => !a.startsWith('--')) || 'es,pt,en,fr').split(',');
const BASE = process.env.PW_BASE || 'http://127.0.0.1:8765';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const REF = path.join(OUT, 'touch-baseline.json');
const IGNORE = /_vercel\/insights\/script\.js/;
const ENV_NET = /fonts\.googleapis\.com|fonts\.gstatic\.com/;
const MIN = 24;
const PAGES = [];
for (const lang of langs) {
  const pre = lang === 'es' ? '' : `/${lang}`;
  PAGES.push({ tag: `home-${lang}`, route: `${pre}/` });
  PAGES.push({ tag: `lpt-${lang}`, route: `${pre}/le-petit-trianon/` });
}

/* En la página: cajas de toque, puntos de toque y glifos de los enlaces de un contenedor */
function measure([containerSel, linkSel, label]) {
  const container = document.querySelector(containerSel);
  if (!container) return null;
  const round = (v) => Math.round(v * 100) / 100;
  const c = container.getBoundingClientRect();
  const items = Array.from(container.querySelectorAll(linkSel)).map((el, i) => {
    const r = el.getBoundingClientRect();
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 1, r.top + 1], [r.right - 1, r.top + 1], [r.left + 1, r.bottom - 1], [r.right - 1, r.bottom - 1]];
    const hits = pts.filter(([x, y]) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); }).length;
    const text = Array.from(el.childNodes).reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    let glyph = null;
    if (text) { const range = document.createRange(); range.selectNodeContents(text); const g = range.getBoundingClientRect(); glyph = { dx: round(g.left - c.left), dy: round(g.top - c.top), w: round(g.width), h: round(g.height) }; }
    return { key: `${label} ${(el.className || el.tagName.toLowerCase()).toString().split(' ')[0] || 'a'}#${i} «${(el.textContent || '').trim().slice(0, 18)}»`, box: { x: round(r.left), y: round(r.top), w: round(r.width), h: round(r.height), right: r.right }, hits, glyph };
  });
  return { container: { w: round(c.width), h: round(c.height) }, items };
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ref = !BASELINE && fs.existsSync(REF) ? JSON.parse(fs.readFileSync(REF, 'utf8')) : null;
  const baseline = {};
  const report = {};

  for (const { tag, route } of PAGES) {
    const results = [];
    const check = (name, got, want) => results.push({ name, ok: got === want, got, want });
    const errorsByView = {};
    const envByView = {};
    const measures = {};

    for (const [w, h, label] of BASELINE ? [[390, 844, 'mobile']] : [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
      const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
      const errs = [];
      const env = [];
      const push = (msg, url) => { if (IGNORE.test(url)) return; if (ENV_NET.test(url)) env.push(msg); else errs.push(msg); };
      p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
      p.on('console', (m) => { if (m.type() !== 'error') return; const u = (m.location() || {}).url || ''; push('console: ' + u + ' ' + m.text(), u + ' ' + m.text()); });
      p.on('requestfailed', (r) => push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText, r.url()));
      p.on('response', (r) => { if (r.status() >= 400) push('http ' + r.status() + ': ' + r.url(), r.url()); });
      await p.goto(BASE + route, { waitUntil: 'networkidle' });
      await p.waitForTimeout(1200);

      if (label === 'mobile') {
        /* Cabecera en el hero */
        measures.hero = { brand: await p.evaluate(measure, ['.top-nav', '.brand', 'nav']), langs: await p.evaluate(measure, ['.top-nav .langs', 'a', 'langs']) };
        await p.screenshot({ path: path.join(OUT, `touch-${tag}-nav.png`), clip: { x: 0, y: 0, width: w, height: 96 } });
        /* Nav de vidrio (fija; script.js la activa cuando scrollY supera 1,15 × innerHeight) */
        await p.evaluate(() => scrollTo({ top: Math.round(innerHeight * 1.6), left: 0, behavior: 'instant' }));
        await p.waitForTimeout(800);
        if (await p.evaluate(() => !!document.querySelector('.top-nav.is-glass'))) {
          measures.glass = { brand: await p.evaluate(measure, ['.top-nav.is-glass', '.brand', 'vidrio']), langs: await p.evaluate(measure, ['.top-nav.is-glass .langs', 'a', 'vidrio-langs']) };
        }
        /* Pie */
        await p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, left: 0, behavior: 'instant' }));
        await p.waitForTimeout(700);
        measures.pie = { links: await p.evaluate(measure, ['footer .wrap', 'a', 'pie']) };
        const foot = await p.evaluate(() => { const r = document.querySelector('footer').getBoundingClientRect(); return { y: Math.max(0, Math.round(r.top)), h: Math.round(Math.min(r.height, innerHeight - Math.max(0, r.top))) }; });
        if (foot.h > 0) await p.screenshot({ path: path.join(OUT, `touch-${tag}-pie.png`), clip: { x: 0, y: foot.y, width: w, height: foot.h } });
      }

      errorsByView[label] = errs;
      envByView[label] = env;
      check(`${label}: cero errores de consola`, errs.length, 0);
      await p.close();
    }

    const flat = [];
    for (const [state, groups] of Object.entries(measures)) for (const [g, m] of Object.entries(groups)) if (m) flat.push({ state, group: g, m });

    if (BASELINE) {
      baseline[tag] = measures;
    } else {
      for (const { state, group, m } of flat) {
        for (const it of m.items) {
          check(`${it.key}: caja ≥ ${MIN}×${MIN} px`, it.box.w >= MIN && it.box.h >= MIN, true);
          results[results.length - 1].got = `${it.box.w}×${it.box.h}`;
          check(`${it.key}: el toque llega al enlace (5 puntos)`, it.hits, 5);
        }
        if (/langs/.test(group)) {
          /* bordes sin redondear: las cajas pueden quedar exactamente contiguas; se tolera medio píxel de subpíxel */
          const boxes = m.items.map((it) => it.box).sort((a, b2) => a.x - b2.x);
          const worst = Math.max(0, ...boxes.map((bx, i) => (i > 0 ? boxes[i - 1].right - bx.x : 0)));
          check(`${state} ${group}: cajas de toque sin superposición (máx. ${worst.toFixed(3)} px)`, worst <= 0.5, true);
        }
        if (ref && ref[tag] && ref[tag][state] && ref[tag][state][group]) {
          const r = ref[tag][state][group];
          const moved = [];
          m.items.forEach((it, i) => {
            const ri = r.items[i];
            if (!ri || !ri.glyph || !it.glyph) return;
            const dy = Math.abs(it.glyph.dy - ri.glyph.dy), dh = Math.abs(it.glyph.h - ri.glyph.h), dx = Math.abs(it.glyph.dx - ri.glyph.dx);
            if (dy > 0.5 || dh > 0.5 || (!/langs/.test(group) && dx > 0.5)) moved.push(`${it.key} dx=${(it.glyph.dx - ri.glyph.dx).toFixed(2)} dy=${(it.glyph.dy - ri.glyph.dy).toFixed(2)} dh=${(it.glyph.h - ri.glyph.h).toFixed(2)}`);
          });
          check(`${state} ${group}: glifos sin desplazamiento vs. referencia`, moved.length, 0);
          if (moved.length) results.push({ name: `${state} ${group}: desplazados`, ok: false, got: moved });
          check(`${state} ${group}: alto del contenedor igual a la referencia`, Math.abs(m.container.h - r.container.h) <= 0.5, true);
          results[results.length - 1].got = `${r.container.h} → ${m.container.h}`;
          if (/langs/.test(group)) results.push({ name: `${state} ${group}: ancho de .langs (gap)`, ok: true, got: `${r.container.w} → ${m.container.w}` });
        }
      }
    }

    report[tag] = {
      route,
      pass: results.filter((r) => r.ok).length + '/' + results.length,
      failed: results.filter((r) => !r.ok),
      boxes: flat.flatMap(({ m }) => m.items.map((it) => `${it.key} ${it.box.w}×${it.box.h} hits=${it.hits}/5`)),
      errors: errorsByView,
      envWarnings: envByView,
    };
  }
  await b.close();
  if (BASELINE) {
    fs.writeFileSync(REF, JSON.stringify(baseline, null, 1));
    console.log(JSON.stringify({ baseline: REF, pages: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { pass: v.pass, boxes: v.boxes, errors: v.errors }])) }, null, 1));
  } else {
    console.log(JSON.stringify(report, null, 1));
  }
})();
