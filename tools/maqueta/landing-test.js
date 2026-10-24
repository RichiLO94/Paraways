/* Prueba de la página del desarrollo (/le-petit-trianon/ y sus idiomas) con Playwright.
   Uso: NODE_PATH=/opt/node22/lib/node_modules flock /tmp/pw-render.lock node landing-test.js [ruta] [sufijo]
     ruta    → /le-petit-trianon/ (por defecto) · /pt/le-petit-trianon/ · …
     sufijo  → nombre de las capturas: out/landing-<sufijo>-*.png (por defecto "es")
   Comprueba a 1440×900 y 390×844: cero errores de consola (ignora el 404 de /_vercel/insights/script.js
   y los de /assets/trianon-* si aún no existen), el botón del hero inserta el iframe en escritorio y es
   enlace en móvil, los chips reescriben el WhatsApp, no hay scroll horizontal. Imprime un JSON con los
   resultados y la lista de URLs internas (para comprobarlas con curl). */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [, , route = '/le-petit-trianon/', tag = 'es'] = process.argv;
const BASE = process.env.PW_BASE || 'http://127.0.0.1:8765';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const IGNORE = /_vercel\/insights\/script\.js|\/assets\/trianon-/;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  const check = (name, got, want) => results.push({ name, ok: got === want, got, want });
  let urls = new Set();
  const errorsByView = {};

  for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: label === 'mobile', hasTouch: label === 'mobile' });
    const errs = [];
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => { if (m.type() !== 'error') return; const u = (m.location() || {}).url || ''; if (IGNORE.test(u)) return; errs.push('console: ' + u + ' ' + m.text()); });
    p.on('requestfailed', (r) => { if (!IGNORE.test(r.url())) errs.push('requestfailed: ' + r.url() + ' ' + (r.failure() || {}).errorText); });
    p.on('response', (r) => { if (r.status() >= 400 && !IGNORE.test(r.url())) errs.push('http ' + r.status() + ': ' + r.url()); });
    await p.goto(BASE + route, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1600);

    /* URLs internas de la página */
    const found = await p.evaluate(() => {
      const out = new Set();
      document.querySelectorAll('a[href], link[href], script[src], img[src], source[srcset], source[src], video[poster]').forEach((el) => {
        ['href', 'src', 'srcset', 'poster'].forEach((k) => {
          const v = el.getAttribute(k);
          if (v && v.startsWith('/')) out.add(v.split(' ')[0]);
        });
      });
      document.querySelectorAll('template').forEach((t) => t.content.querySelectorAll('[src],[poster]').forEach((el) => {
        ['src', 'poster'].forEach((k) => { const v = el.getAttribute(k); if (v && v.startsWith('/')) out.add(v); });
      }));
      return Array.from(out);
    });
    found.forEach((u) => urls.add(u));

    /* Geometría del primer pantallazo */
    const geo = await p.evaluate(() => {
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height) }; };
      return { h1: r('h1'), cta: r('[data-hero-cta]'), stage: r('.lpt-stage__media'), stats: r('.lpt-stats'), h1Lines: Math.round(document.querySelector('h1').getBoundingClientRect().height / parseFloat(getComputedStyle(document.querySelector('h1')).lineHeight)), h1Size: getComputedStyle(document.querySelector('h1')).fontSize, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, fonts: Array.from(document.fonts).filter((f) => f.status === 'loaded').map((f) => f.family).filter((v, i, a) => a.indexOf(v) === i) };
    });
    check(`${label}: sin scroll horizontal`, geo.scrollW <= geo.innerW, true);
    results.push({ name: `${label}: geometría`, ok: true, got: geo });
    await p.screenshot({ path: path.join(OUT, `landing-${tag}-${label}.png`) });

    /* recorrido para disparar los reveals y captura completa */
    const total = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += Math.round(h * 0.7)) { await p.evaluate((yy) => scrollTo({ top: yy, left: 0, behavior: 'instant' }), y); await p.waitForTimeout(140); }
    await p.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await p.waitForTimeout(1300);
    /* captura completa: Playwright agranda el viewport al alto de la página, así que las alturas en vh se
       inflan; se fija la del marco y se fuerzan los reveals (sin transición) solo durante la captura. */
    const stageH = await p.evaluate(() => Math.round(document.querySelector('.lpt-stage__media').getBoundingClientRect().height));
    await p.addStyleTag({ content: `#pw-shot{} .reveal{opacity:1!important;transform:none!important;filter:none!important;transition:none!important} .lpt-lotes-wrap .lpt-bar i{width:var(--w)!important;transition:none!important} h2 em::after{transform:scaleX(1)!important;transition:none!important} .lpt-stage__media{height:${stageH}px!important;max-height:none!important;aspect-ratio:auto!important} .fab{display:none!important}` });
    /* textos cortados: elementos de texto con desborde horizontal */
    const overflow = await p.evaluate(() => {
      const bad = [];
      document.querySelectorAll('h1, h2, h3, p, li, td, th, a, dd, dt, small, span.lpt-mono').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.overflow !== 'visible' || cs.whiteSpace === 'nowrap' && el.closest('.regla')) return;
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) bad.push(el.tagName + '.' + el.className + ' ' + el.scrollWidth + '>' + el.clientWidth + ' «' + el.textContent.trim().slice(0, 40) + '»');
      });
      return bad.slice(0, 12);
    });
    check(`${label}: sin textos desbordados`, overflow.length, 0);
    if (overflow.length) results.push({ name: `${label}: desbordes`, ok: false, got: overflow });
    /* Chromium con SwiftShader repite el contenido más allá de ~8192 px en una captura fullPage: se captura
       por pantallas desplazando y se cose con PIL (tools/maqueta/stitch.py) en out/landing-<tag>-<label>-full.png */
    await p.addStyleTag({ content: '#pw-shot2{} .top-nav.is-glass{visibility:hidden!important} .progress{display:none!important}' });
    const rawDir = path.join(OUT, `raw-${tag}-${label}`);
    fs.rmSync(rawDir, { recursive: true, force: true }); fs.mkdirSync(rawDir, { recursive: true });
    const totalH = await p.evaluate(() => document.documentElement.scrollHeight);
    const offsets = [];
    for (let y = 0, i = 0; y < totalH; y += h, i++) {
      const got = await p.evaluate((yy) => { scrollTo({ top: yy, left: 0, behavior: 'instant' }); return Math.round(document.scrollingElement.scrollTop); }, y);
      await p.waitForTimeout(160);
      await p.screenshot({ path: path.join(rawDir, `s${String(i).padStart(2, '0')}.png`) });
      offsets.push(got);
      if (got < y) break;
    }
    fs.writeFileSync(path.join(rawDir, 'offsets.json'), JSON.stringify({ offsets, w, h, totalH }));
    await p.evaluate(() => { scrollTo({ top: 0, left: 0, behavior: 'instant' }); const st = Array.from(document.querySelectorAll('style')).find((x) => x.textContent.startsWith('#pw-shot2')); if (st) st.remove(); });
    await p.evaluate(() => { const st = Array.from(document.querySelectorAll('style')).find((x) => x.textContent.startsWith('#pw-shot')); if (st) st.remove(); });
    await p.waitForTimeout(200);
    /* chips del cierre */
    await p.evaluate(() => document.querySelectorAll('.lpt-chips .diag-opt')[1].click());
    const wa = await p.evaluate(() => document.querySelector('[data-lpt-wa]').getAttribute('href'));
    check(`${label}: chip «Como inversión» reescribe el WhatsApp`, /Investor%20Pass/.test(wa) && wa.startsWith('https://wa.me/595993474309?text='), true);
    check(`${label}: chip queda aria-pressed`, await p.evaluate(() => document.querySelectorAll('.lpt-chips .diag-opt')[1].getAttribute('aria-pressed')), 'true');

    /* El botón del hero */
    const hero = await p.evaluate(() => { const a = document.querySelector('[data-hero-cta]'); return { tag: a.tagName, href: a.getAttribute('href'), role: a.getAttribute('role'), text: a.textContent.trim() }; });
    check(`${label}: hero CTA es <a> con href al visor`, hero.tag === 'A' && hero.href === route.replace(/^\/(pt|en|fr)\//, '/').replace(/\/$/, '') + '/maqueta/?lang=' + tag, true);
    if (label === 'desktop') {
      check('desktop: hero CTA actúa como botón (role)', hero.role, 'button');
      check('desktop: sin iframe antes del gesto', await p.evaluate(() => !!document.querySelector('.lpt-stage iframe')), false);
      await p.click('[data-hero-cta]');
      await p.waitForTimeout(900);
      const fr = await p.evaluate(() => { const f = document.querySelector('.lpt-stage iframe'); return f ? { src: f.getAttribute('src'), title: f.title, loading: f.getAttribute('loading'), allow: f.getAttribute('allow'), h: Math.round(f.getBoundingClientRect().height) } : null; });
      check('desktop: el clic inserta el iframe', !!fr, true);
      if (fr) {
        check('desktop: iframe src embed', fr.src, `/le-petit-trianon/maqueta/?lang=${tag}&embed=1`);
        check('desktop: iframe title/loading/allow', `${fr.title}|${fr.loading}|${fr.allow}`.length > 0 && fr.loading === 'lazy' && fr.allow === 'fullscreen', true);
        check('desktop: altura del marco ≥ 560', fr.h >= 560, true);
      }
      /* un lote desde la tabla cambia los parámetros */
      await p.evaluate(() => document.querySelector('.lpt-lotes [data-maqueta="lote=3"]').click());
      await p.waitForTimeout(500);
      const src3 = await p.evaluate(() => document.querySelector('.lpt-stage iframe').getAttribute('src'));
      check('desktop: «Ver en la maqueta» del lote 3 recarga el iframe con lote=3', src3, `/le-petit-trianon/maqueta/?lang=${tag}&embed=1&lote=3`);
      check('desktop: «Pantalla completa» sigue los parámetros', await p.evaluate(() => document.querySelector('[data-lpt-full]').getAttribute('href')), `/le-petit-trianon/maqueta/?lang=${tag}&lote=3`);
      check('desktop: el lote 3 queda marcado en «Elige tu lote»', await p.evaluate(() => document.querySelector('.lpt-pick[aria-current="true"]')?.getAttribute('data-maqueta')), 'lote=3');
      /* esperar a que el visor cargue para la captura del marco vivo */
      try { await p.waitForFunction(() => document.querySelector('.lpt-stage').classList.contains('is-ready'), null, { timeout: 90000 }); } catch (e) { results.push({ name: 'desktop: visor cargó en el iframe', ok: false, got: e.message }); }
      await p.waitForTimeout(2500);
      await p.evaluate(() => document.querySelector('.lpt-stage').scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(400);
      try { await p.screenshot({ path: path.join(OUT, `landing-${tag}-${label}-live.png`), timeout: 150000 }); } catch (e) { results.push({ name: 'desktop: captura del marco vivo', ok: false, got: e.message.split('\n')[0] }); }
    } else {
      check('mobile: hero CTA es un enlace simple (sin role=button)', hero.role, null);
      /* un clic con preventDefault externo para comprobar que el script NO inserta iframe en móvil */
      await p.evaluate(() => { document.addEventListener('click', (e) => e.preventDefault(), { capture: false }); document.querySelector('[data-hero-cta]').click(); });
      await p.waitForTimeout(400);
      check('mobile: el clic no inserta iframe (navega)', await p.evaluate(() => !!document.querySelector('.lpt-stage iframe')), false);
      check('mobile: botón del marco visible y ≥ 44 px', await p.evaluate(() => { const b = document.querySelector('.lpt-stage__open').getBoundingClientRect(); return b.height >= 44 && b.width > 0; }), true);
    }

    errorsByView[label] = errs;
    check(`${label}: cero errores de consola`, errs.length, 0);
    await p.close();
  }
  await b.close();
  console.log(JSON.stringify({ route, pass: results.filter((r) => r.ok).length + '/' + results.length, results, errors: errorsByView, urls: Array.from(urls).sort() }, null, 1));
})();
