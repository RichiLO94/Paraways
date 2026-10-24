/* Prueba de la capa v3 en las cuatro homes (banda Le Petit Trianon, nav, tarjeta Inmobiliaria, formulario, FAB).
   Uso: NODE_PATH=/opt/node22/lib/node_modules flock /tmp/pw-render.lock node home-banda-test.js [es,pt,en,fr]
   A 1440×900 y 390×844 por idioma: cero errores de consola (ignora el 404 de /_vercel/insights/script.js; las
   fallas de red de Google Fonts se listan aparte como avisos de entorno), nav en una sola línea a 1440 px,
   #trianon presente con su póster cargado, reveals visibles, FAB nombrando la sección, enlace en la tarjeta
   Inmobiliaria, formulario sin opción «trianon» (el desarrollo entra solo por WhatsApp), JSON #pw-i18n con la
   sección. Captura la banda en
   out/home-<lang>-banda.png (escritorio) y out/home-<lang>-banda-movil.png (móvil). Imprime un JSON. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const langs = (process.argv[2] || 'es,pt,en,fr').split(',');
const ROUTES = { es: '/', pt: '/pt/', en: '/en/', fr: '/fr/' };
const BASE = process.env.PW_BASE || 'http://127.0.0.1:8765';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const IGNORE = /_vercel\/insights\/script\.js/;
const ENV_NET = /fonts\.googleapis\.com|fonts\.gstatic\.com/;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const report = {};

  for (const lang of langs) {
    const route = ROUTES[lang];
    const results = [];
    const check = (name, got, want) => results.push({ name, ok: got === want, got, want });
    const errorsByView = {};
    const envByView = {};

    for (const [w, h, label] of [[1440, 900, 'desktop'], [390, 844, 'mobile']]) {
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

      /* Nav: una sola línea a 1440 px, sin desborde */
      if (label === 'desktop') {
        const nav = await p.evaluate(() => {
          const links = Array.from(document.querySelectorAll('.nav-links a'));
          const rects = links.map((a) => a.getBoundingClientRect());
          const tops = rects.map((r) => Math.round(r.top));
          const lineH = parseFloat(getComputedStyle(links[0]).lineHeight) || 18;
          const topNav = document.querySelector('.top-nav');
          const langs = document.querySelector('.langs').getBoundingClientRect();
          return {
            labels: links.map((a) => a.textContent.trim()),
            hrefs: links.map((a) => a.getAttribute('href')),
            oneLine: new Set(tops).size === 1 && Math.max(...rects.map((r) => r.height)) <= Math.ceil(lineH) + 1,
            maxLinkH: Math.round(Math.max(...rects.map((r) => r.height))),
            gap: getComputedStyle(document.querySelector('.nav-links')).gap,
            navLinksW: Math.round(document.querySelector('.nav-links').getBoundingClientRect().width),
            langsRight: Math.round(langs.right), topNavRight: Math.round(topNav.getBoundingClientRect().right),
            overflow: topNav.scrollWidth > topNav.clientWidth + 1,
          };
        });
        check('desktop: nav en una sola línea', nav.oneLine, true);
        check('desktop: nav sin desborde', nav.overflow, false);
        results.push({ name: 'desktop: nav (medidas)', ok: true, got: nav });
        const trIdx = nav.hrefs.indexOf(route + 'le-petit-trianon/');
        check('nav: «Le Petit Trianon» justo después de Inversión', trIdx, 2);
        check('nav: texto del enlace', nav.labels[trIdx], 'Le Petit Trianon');
      }

      /* Estructura: banda, tarjeta, formulario, JSON */
      const dom = await p.evaluate((route) => {
        const band = document.querySelector('#trianon');
        const i18n = (() => { try { return JSON.parse(document.querySelector('#pw-i18n').textContent); } catch { return null; } })();
        const opts = Array.from(document.querySelectorAll('select[name="interest"] option')).map((o) => o.value);
        const prevId = band && band.previousElementSibling && band.previousElementSibling.id;
        return {
          band: !!band, bandClass: band && band.className, prevId,
          img: band && (() => { const i = band.querySelector('img'); return i && { src: i.getAttribute('src'), w: i.getAttribute('width'), h: i.getAttribute('height'), loading: i.getAttribute('loading'), alt: (i.getAttribute('alt') || '').length }; })(),
          h2em: !!(band && band.querySelector('h2 em')), eyebrow: !!(band && band.querySelector('.eyebrow')),
          cta: band && (() => { const a = band.querySelector('a.cta'); return a && { href: a.getAttribute('href'), text: a.textContent.trim() }; })(),
          ipLink: (() => { const a = document.querySelector('.ip-card .lpt-ip-link'); return a && { href: a.getAttribute('href'), text: a.textContent.trim(), card: a.closest('.ip-card').querySelector('h3').textContent.trim() }; })(),
          opts, optTrianonIdx: opts.indexOf('trianon'), optOtroIdx: opts.indexOf('otro'),
          i18nTrianon: i18n && i18n.sections && i18n.sections.trianon,
          scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
        };
      }, route);
      check(`${label}: #trianon existe (lpt-band section)`, dom.band && /\blpt-band\b/.test(dom.bandClass) && /\bsection\b/.test(dom.bandClass), true);
      check(`${label}: #trianon va justo después del Investor Pass`, ['inversion', 'investimento', 'investment', 'investissement'].includes(dom.prevId), true);
      check(`${label}: póster 1600×1000 lazy con alt`, !!dom.img && dom.img.src === '/assets/trianon-maqueta.jpg' && dom.img.w === '1600' && dom.img.h === '1000' && dom.img.loading === 'lazy' && dom.img.alt > 40, true);
      check(`${label}: eyebrow + h2 con em`, dom.eyebrow && dom.h2em, true);
      check(`${label}: CTA .cta hacia la página del idioma`, dom.cta && dom.cta.href, route + 'le-petit-trianon/');
      check(`${label}: enlace en la tarjeta Inmobiliaria`, !!dom.ipLink && dom.ipLink.href === route + 'le-petit-trianon/' && /^(Inmobiliaria|Imobiliária|Real estate|Immobilière)$/.test(dom.ipLink.card), true);
      check(`${label}: formulario sin option trianon (canal único: WhatsApp)`, dom.optTrianonIdx, -1);
      check(`${label}: «otro» sigue cerrando la lista de intereses`, dom.optOtroIdx, dom.opts.length - 1);
      check(`${label}: #pw-i18n sections.trianon`, dom.i18nTrianon, 'Le Petit Trianon');
      check(`${label}: sin scroll horizontal`, dom.scrollW <= dom.innerW, true);
      results.push({ name: `${label}: dom`, ok: true, got: { cta: dom.cta, ipLink: dom.ipLink } });

      if (dom.band) {
        /* Hasta la banda: reveal, póster cargado, FAB nombrando la sección */
        await p.evaluate(() => document.querySelector('#trianon').scrollIntoView({ block: 'center', behavior: 'instant' }));
        await p.waitForTimeout(1800);
        const live = await p.evaluate(() => {
          const band = document.querySelector('#trianon');
          const img = band.querySelector('img');
          const rev = Array.from(band.querySelectorAll('.reveal'));
          const fab = document.querySelector('.fab');
          const r = band.getBoundingClientRect();
          const fig = band.querySelector('figure').getBoundingClientRect();
          const copy = band.querySelector('h2').getBoundingClientRect();
          const bad = [];
          band.querySelectorAll('h2, p, a, figcaption, small').forEach((el) => { if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) bad.push(el.tagName + '.' + el.className + ' ' + el.scrollWidth + '>' + el.clientWidth); });
          return {
            imgLoaded: img.complete && img.naturalWidth > 0, imgNatural: img.naturalWidth + '×' + img.naturalHeight, imgBox: Math.round(img.getBoundingClientRect().width) + '×' + Math.round(img.getBoundingClientRect().height),
            reveals: rev.length, revealed: rev.filter((e) => e.classList.contains('is-visible')).length,
            bandH: Math.round(r.height), bandBg: getComputedStyle(band).backgroundImage.slice(0, 60),
            layout: fig.right <= copy.left + 1 ? 'dos columnas (imagen izquierda)' : fig.bottom <= copy.top + 1 ? 'una columna (imagen arriba)' : 'otro',
            h2Lines: Math.round(copy.height / parseFloat(getComputedStyle(band.querySelector('h2')).lineHeight)), h2Size: getComputedStyle(band.querySelector('h2')).fontSize,
            overflow: bad,
            fab: fab && { visible: fab.classList.contains('is-visible'), yield: fab.classList.contains('is-yield'), from: fab.dataset.waFrom, href: fab.getAttribute('href') },
          };
        });
        check(`${label}: póster cargado`, live.imgLoaded, true);
        check(`${label}: reveals de la banda visibles`, live.revealed === live.reveals && live.reveals > 0, true);
        check(`${label}: sin textos desbordados en la banda`, live.overflow.length, 0);
        check(`${label}: FAB nombra la sección (data-wa-from)`, live.fab && live.fab.from, 'fab-trianon');
        check(`${label}: FAB href con «Le Petit Trianon»`, !!live.fab && /Le%20Petit%20Trianon/.test(live.fab.href) && live.fab.href.startsWith('https://wa.me/595993474309?text='), true);
        check(`${label}: layout de la banda`, live.layout, label === 'desktop' ? 'dos columnas (imagen izquierda)' : 'una columna (imagen arriba)');
        results.push({ name: `${label}: banda (medidas)`, ok: true, got: { imgNatural: live.imgNatural, imgBox: live.imgBox, bandH: live.bandH, h2Lines: live.h2Lines, h2Size: live.h2Size, fab: live.fab } });
        if (label === 'mobile') {
          await p.evaluate(() => document.querySelector('#trianon').scrollIntoView({ block: 'start', behavior: 'instant' }));
          await p.waitForTimeout(500);
        }
        await p.screenshot({ path: path.join(OUT, `home-${lang}-banda${label === 'mobile' ? '-movil' : ''}.png`) });
      }

      errorsByView[label] = errs;
      envByView[label] = env;
      check(`${label}: cero errores de consola`, errs.length, 0);
      await p.close();
    }
    report[lang] = { route, pass: results.filter((r) => r.ok).length + '/' + results.length, failed: results.filter((r) => !r.ok), results, errors: errorsByView, envWarnings: envByView };
  }
  await b.close();
  console.log(JSON.stringify(report, null, 1));
})();
