/* Prueba de la página del desarrollo v2 (/le-petit-trianon/ y sus idiomas) con Playwright.
   Uso: NODE_PATH=/opt/node22/lib/node_modules flock /tmp/pw-render.lock node landing-test.js [ruta] [sufijo]
     ruta    → /le-petit-trianon/ (por defecto) · /pt/le-petit-trianon/ · …
     sufijo  → nombre de las capturas: out/v2-<sufijo>-*.png (por defecto "es")
   Variables: PW_BASE (servidor, por defecto http://127.0.0.1:8765) · PW_STANDINS=<carpeta> sirve, SOLO para
   mirar el diseño, provisionales de las fotos y la película que todavía den 404 (se informa cuáles).
   Comprueba a 1440×900 y 390×844:
     · cero errores de consola (ignora /_vercel/insights/script.js; los 404 de /assets/trianon-film*,
       trianon-foto* y trianon-aerea* se informan como «pendientes», no como error);
     · la oferta en cuatro líneas dentro del primer pantallazo a 1440×900; h1 y CTA dentro del primero a 390×844;
     · el CTA del hero es WhatsApp; todos los enlaces wa.me con texto, target=_blank, rel=noopener, data-wa-from=trianon-…;
     · la película: fuentes de escritorio (webm + mp4) en escritorio y solo la móvil en móvil; con
       prefers-reduced-motion no se carga ningún video (queda el póster); pausa fuera de pantalla y a pedido;
     · la galería abre un <dialog>, flechas, Esc y foco devuelto; ninguna foto se muestra a más de 1280 px;
     · «Explorar la maqueta 3D» (sección III) inserta el iframe en escritorio y es un enlace en móvil;
     · los chips del cierre reescriben el WhatsApp; sin scroll horizontal; objetivos táctiles ≥ 44 px en móvil;
     · ≤ 1.100 palabras visibles (texto del body sin scripts, estilos ni plantillas; incluye las respuestas plegadas);
     · Actualización 4 (cumplimiento): ninguna frase retirada (la misma BANNED de home-banda-test.js, más «privado»,
       «lista para alquilar» y equivalentes) en el texto visible, alt, title, aria-label, figcaption, metas, JSON-LD,
       #pw-i18n y textos de WhatsApp; «con casa» en la línea 01 de la oferta; fotos con srcset «-800 800w, … 1920w» y
       width/height 1920×1088; crédito satelital en el pie de la aérea; description/og:title/og:description sin el
       umbral pegado al Investor Pass («dentro del Investor Pass desde» y equivalentes) y con «con casa»;
     · todos los href/src internos responden 200.
   Capturas: out/v2-<sufijo>-<vista>.png (primer pantallazo) y out/v2-<sufijo>-<vista>-tNN.png (página completa por
   tramos; tools/maqueta/stitch.py las cose a partir de out/raw-v2-<sufijo>-<vista>/). Imprime un JSON con los resultados. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const [, , route = '/le-petit-trianon/', tag = 'es'] = process.argv;
const LANG = (/^\/(pt|en|fr)\//.exec(route) || [null, 'es'])[1];
const BASE = process.env.PW_BASE || 'http://127.0.0.1:8765';
const STANDINS = process.env.PW_STANDINS || '';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const IGNORE = /_vercel\/insights\/script\.js/;
const PENDING = /\/assets\/(trianon-film|trianon-foto|trianon-aerea)[^/]*$/;
const MAX_WORDS = 1100;
/* Frases retiradas en la v2: la misma lista que home-banda-test.js (banda de las homes) … */
const BANNED = /ya existe|ya construida|proyecto en papel|já existe|já construída|already exists|already built|on paper|existe déjà|déjà construite|sur plan|mensura|medição|survey|relevé|casa modelo|show home|maison témoin|en regla|barrio cerrado|frente al lago|vista al lago/i;
/* … y lo que la Actualización 4 prohíbe además en esta página (sin \b final tras letras acentuadas: en JS \b es ASCII). */
const BANNED_A4 = /\bprivad[oa]s?\b|\bprivately\b|en privé|\bem dia\b|en règle|lista para alquilar|pronta para alugar|ready to (?:let|rent)|prête à louer/i;
/* Copy por idioma de la Actualización 4: «con casa», crédito satelital y el umbral que no va pegado al Investor Pass. */
const A4 = {
  es: { conCasa: /lote y (?:la construcción de )?tu casa/i, sat: /Imagen satelital: Google/, umbral: /dentro del Investor Pass,?\s+desde/i, retirados: /\bparcelas?\b|fraccionamiento|alta fiscal|cul-de-sac|casa nueva/i },
  pt: { conCasa: /lote com casa/i, sat: /Imagem de satélite: Google/, umbral: /dentro do Investor Pass,?\s+a partir de/i },
  en: { conCasa: /plot and house/i, sat: /Satellite image: Google/, umbral: /with(?:in)? the Investor Pass,?\s+from/i },
  fr: { conCasa: /parcelle avec maison/i, sat: /Image satellite : Google/, umbral: /Investor Pass,?\s+dès/i },
}[LANG];
const LAUNCH = { executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] };
const VIEWS = [[1440, 900, 'desktop'], [390, 844, 'mobile']];

(async () => {
  const b = await chromium.launch(LAUNCH);
  const results = [];
  const check = (name, got, want) => results.push({ name, ok: got === want, got, want });
  const note = (name, got) => results.push({ name, ok: true, got });
  const urls = new Set();
  const pending = new Set();      /* assets del contrato que el servidor todavía no tiene (404) */
  const standinsUsed = new Set(); /* de esos, los que se sirvieron con un provisional (PW_STANDINS) */
  const served404 = new Set();    /* los que le llegaron a la página como 404 */
  const errorsByView = {};

  const newPage = async (w, h, label, extra = {}) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: label === 'mobile', hasTouch: label === 'mobile', ...extra });
    const errs = [];
    const requests = [];
    if (STANDINS) {
      await ctx.route(PENDING, async (r) => {
        const resp = await r.fetch().catch(() => null);
        const file = path.join(STANDINS, path.basename(new URL(r.request().url()).pathname));
        if ((!resp || resp.status() === 404) && fs.existsSync(file)) {
          pending.add(new URL(r.request().url()).pathname);
          standinsUsed.add(path.basename(file));
          return r.fulfill({ path: file });
        }
        return resp ? r.fulfill({ response: resp }) : r.abort();
      });
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('console', (m) => {
      if (m.type() !== 'error') return;
      const u = (m.location() || {}).url || '';
      if (IGNORE.test(u) || PENDING.test(u)) return;
      errs.push('console: ' + u + ' ' + m.text());
    });
    p.on('request', (r) => requests.push(new URL(r.url()).pathname));
    p.on('requestfailed', (r) => {
      const u = r.url();
      if (IGNORE.test(u)) return;
      if (PENDING.test(u)) { pending.add(new URL(u).pathname); return; }
      if (/\/assets\/trianon-loop\./.test(u) && /ERR_ABORTED/.test((r.failure() || {}).errorText || '')) return; /* el loop del marco se retira al abrir la maqueta */
      errs.push('requestfailed: ' + u + ' ' + (r.failure() || {}).errorText);
    });
    p.on('response', (r) => {
      const u = r.url();
      if (r.status() < 400 || IGNORE.test(u)) return;
      if (PENDING.test(u)) { pending.add(new URL(u).pathname); served404.add(new URL(u).pathname); return; }
      errs.push('http ' + r.status() + ': ' + u);
    });
    await p.goto(BASE + route, { waitUntil: 'load' });
    return { ctx, p, errs, requests };
  };

  for (const [w, h, label] of VIEWS) {
    const { ctx, p, errs } = await newPage(w, h, label);
    await p.waitForTimeout(2600); /* entradas del hero (≈ 1,8 s) y arranque de la película */

    /* URLs internas de la página */
    (await p.evaluate(() => {
      const out = new Set();
      const add = (v) => { if (v && v.startsWith('/')) out.add(v.split(' ')[0]); };
      document.querySelectorAll('a[href], link[href], script[src], img[src], img[srcset], source[srcset], source[src], source[data-src], video[poster]').forEach((el) => {
        ['href', 'src', 'data-src', 'poster'].forEach((k) => add(el.getAttribute(k)));
        const ss = el.getAttribute('srcset');
        if (ss) ss.split(',').forEach((part) => add(part.trim().split(/\s+/)[0]));
      });
      document.querySelectorAll('template').forEach((t) => t.content.querySelectorAll('[src],[poster]').forEach((el) => ['src', 'poster'].forEach((k) => add(el.getAttribute(k)))));
      return Array.from(out);
    })).forEach((u) => urls.add(u));

    /* Geometría del primer pantallazo */
    const geo = await p.evaluate(() => {
      const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
      return {
        h1: r('h1'), cta: r('[data-hero-cta]'), film: r('.lpt2-film__frame'), oferta: r('.lpt2-oferta'),
        ofertaItems: document.querySelectorAll('.lpt2-oferta > li').length,
        ofertaLis: Array.from(document.querySelectorAll('.lpt2-oferta > li')).map((li) => { const b = li.getBoundingClientRect(); return Math.round(b.bottom); }),
        h1Size: getComputedStyle(document.querySelector('h1')).fontSize,
        scrollW: document.documentElement.scrollWidth, innerW: innerWidth, innerH: innerHeight
      };
    });
    check(`${label}: sin scroll horizontal`, geo.scrollW <= geo.innerW, true);
    note(`${label}: geometría del hero`, geo);
    check(`${label}: la oferta tiene cuatro líneas`, geo.ofertaItems, 4);
    if (label === 'desktop') {
      check('desktop: la oferta en cuatro líneas, entera en el primer pantallazo (1440×900)', geo.oferta && geo.oferta.top >= 0 && geo.oferta.bottom <= geo.innerH, true);
      check('desktop: la película, entera en el primer pantallazo', geo.film && geo.film.top >= 0 && geo.film.bottom <= geo.innerH && geo.film.width <= 780, true);
      check('desktop: h1 y CTA en el primer pantallazo', geo.h1.bottom <= geo.innerH && geo.cta.bottom <= geo.innerH, true);
    } else {
      check('mobile: h1 y CTA dentro del primer pantallazo (390×844)', geo.h1.top >= 0 && geo.h1.bottom <= geo.innerH && geo.cta.bottom <= geo.innerH, true);
      check('mobile: la película a todo el ancho', geo.film && geo.film.left === 0 && geo.film.width === geo.innerW, true);
    }

    /* El CTA del hero es WhatsApp; todos los enlaces wa.me cumplen el contrato */
    const hero = await p.evaluate(() => { const a = document.querySelector('[data-hero-cta]'); return { tag: a.tagName, href: a.getAttribute('href'), target: a.target, rel: a.rel, from: a.dataset.waFrom, text: a.textContent.trim() }; });
    check(`${label}: CTA del hero → WhatsApp (target _blank, rel noopener, trianon-hero)`, hero.tag === 'A' && hero.href.startsWith('https://wa.me/595993474309?text=') && hero.target === '_blank' && /noopener/.test(hero.rel) && hero.from === 'trianon-hero', true);
    /* sobre el HTML servido (el FAB reescribe su data-wa-from al vuelo con la sección: script.js del sitio) */
    const rawHtml = await (await fetch(BASE + route)).text();
    const waBad = await p.evaluate((html) => Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a[href*="wa.me"]')).filter((a) => {
      const href = a.getAttribute('href');
      const m = /^https:\/\/wa\.me\/595993474309\?text=([^#]+)$/.exec(href);
      let okText = false;
      try { okText = !!m && decodeURIComponent(m[1]).length > 20 && !/[\s]/.test(m[1]); } catch (e) { okText = false; }
      return !(okText && a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel') || '') && /^trianon-/.test(a.getAttribute('data-wa-from') || ''));
    }).map((a) => a.outerHTML.slice(0, 140)), rawHtml);
    note(`${label}: enlaces de WhatsApp revisados`, await p.evaluate((html) => new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a[href*="wa.me"]').length, rawHtml));
    check(`${label}: enlaces de WhatsApp con texto codificado, _blank, noopener y data-wa-from`, waBad.length, 0);
    if (waBad.length) note(`${label}: WhatsApp a revisar`, waBad);

    /* Actualización 4 (cumplimiento), una vez: textos, oferta 01, fotos, crédito satelital y metas */
    if (label === 'desktop') {
      const a4 = await p.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const meta = (sel) => (doc.querySelector(sel) || {}).content || '';
        const body = document.body.cloneNode(true);
        body.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
        const texts = [['texto visible', body.textContent], ['<title>', doc.title], ['description', meta('meta[name="description"]')], ['og:title', meta('meta[property="og:title"]')], ['og:description', meta('meta[property="og:description"]')]];
        document.querySelectorAll('[alt], [title], [aria-label]').forEach((el) => ['alt', 'title', 'aria-label'].forEach((k) => { if (el.hasAttribute(k)) texts.push([k, el.getAttribute(k)]); }));
        document.querySelectorAll('figcaption').forEach((el) => texts.push(['figcaption', el.textContent]));
        doc.querySelectorAll('script[type="application/ld+json"], script#pw-i18n').forEach((s) => texts.push([s.id || 'JSON-LD', s.textContent]));
        doc.querySelectorAll('[data-wa-text]').forEach((el) => texts.push(['data-wa-text', el.getAttribute('data-wa-text')]));
        doc.querySelectorAll('a[href*="wa.me"]').forEach((a) => { try { texts.push(['WhatsApp', decodeURIComponent((a.getAttribute('href').split('?text=')[1] || ''))]); } catch (e) { texts.push(['WhatsApp (sin decodificar)', a.getAttribute('href')]); } });
        const imgs = Array.from(doc.querySelectorAll('.lpt2-ph img, .lpt2-cierre__bg')).map((im) => ({ src: im.getAttribute('src'), srcset: im.getAttribute('srcset') || '', w: im.getAttribute('width'), h: im.getAttribute('height') }));
        const o1 = doc.querySelector('.lpt2-oferta > li:first-child');
        const aerea = doc.querySelector('.lpt2-ph--aerea figcaption');
        const filmLabel = doc.querySelector('.lpt2-film__label');
        return { texts, imgs, oferta1: o1 ? o1.textContent.replace(/\s+/g, ' ').trim() : '', aerea: aerea ? aerea.textContent.replace(/[ \t\r\n]+/g, ' ').trim() : '', /* solo espacios ASCII: el FR lleva U+202F antes de «:», que \s también borraría */ filmLabel: filmLabel ? filmLabel.textContent : '', og: [meta('meta[name="description"]'), meta('meta[property="og:title"]'), meta('meta[property="og:description"]')] };
      }, rawHtml);
      const hits = [];
      a4.texts.forEach(([where, t]) => { [BANNED, BANNED_A4].forEach((re) => { const m = re.exec(t || ''); if (m) hits.push(`${where}: «${m[0]}» en «${(t || '').slice(Math.max(0, m.index - 40), m.index + 40).replace(/\s+/g, ' ')}»`); }); });
      check('sin frases retiradas (texto visible, alt, title, aria-label, figcaption, metas, JSON-LD, #pw-i18n, WhatsApp)', hits.length, 0);
      if (hits.length) note('frases retiradas encontradas', hits.slice(0, 12));
      /* ES: términos retirados en la revisión de jerga local («lote», no «parcela»; «plano del proyecto»; «RUC»; «sin salida»; «lote y construcción de tu casa», no «casa nueva») */
      if (A4.retirados) {
        const viejos = a4.texts.filter(([, t]) => A4.retirados.test(t || '')).map(([w, t]) => `${w}: «${A4.retirados.exec(t)[0]}»`);
        check('ES: sin «parcela», «fraccionamiento», «alta fiscal», «cul-de-sac» ni «casa nueva»', viejos.length, 0);
        if (viejos.length) note('términos retirados encontrados', viejos.slice(0, 12));
      }
      check('la línea 01 de la oferta dice «con casa»', A4.conCasa.test(a4.oferta1), true);
      note('línea 01 de la oferta', a4.oferta1);
      const imgBad = a4.imgs.filter((im) => {
        const base = im.src.replace(/\.jpg$/, '');
        return !(im.w === '1920' && im.h === '1088' && im.srcset.includes(base + '-800.jpg 800w') && im.srcset.includes(im.src + ' 1920w'));
      });
      check(`fotos reales con srcset «-800 800w, … 1920w» y width/height 1920×1088 (${a4.imgs.length})`, a4.imgs.length >= 6 && imgBad.length === 0, true);
      if (imgBad.length) note('fotos a revisar', imgBad);
      check('el pie de la vista aérea lleva el crédito satelital', A4.sat.test(a4.aerea), true);
      note('pie de la vista aérea', a4.aerea);
      /* La película también muestra la imagen de Google: su rótulo lleva el mismo crédito (en minúscula y con espacios
         duros para que en móvil corte solo en los «·»; se comparan sin mayúsculas y con todo espacio como uno). */
      const flat = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      check('el rótulo de la película lleva el crédito satelital', flat(a4.filmLabel).includes(flat(A4.sat.source)), true);
      note('rótulo de la película', flat(a4.filmLabel));
      check('description / og:title / og:description sin el umbral pegado al Investor Pass', a4.og.filter((t) => A4.umbral.test(t)).length, 0);
      check('description y og:description dicen «con casa»', A4.conCasa.test(a4.og[0]) && A4.conCasa.test(a4.og[2]), true);
    }

    /* La película */
    const film = await p.evaluate(() => {
      const v = document.querySelector('[data-lpt2-film]');
      return {
        attrs: ['autoplay', 'muted', 'loop', 'playsinline', 'controls'].map((k) => k + '=' + v.hasAttribute(k)).join(' '),
        preload: v.getAttribute('preload'), poster: v.getAttribute('poster'),
        srcs: Array.from(v.querySelectorAll('source[src]')).map((s) => s.getAttribute('src')),
        all: v.querySelectorAll('source').length,
        currentSrc: v.currentSrc, paused: v.paused, t: v.currentTime,
        toggleHidden: document.querySelector('[data-lpt2-film-toggle]').hidden
      };
    });
    note(`${label}: película`, film);
    check(`${label}: <video autoplay muted loop playsinline preload=metadata poster>, sin controles`, film.attrs === 'autoplay=true muted=true loop=true playsinline=true controls=false' && film.preload === 'metadata' && film.poster === '/assets/trianon-film-poster.jpg', true);
    if (label === 'desktop') check('desktop: fuentes de escritorio (webm + mp4), sin la móvil', JSON.stringify(film.srcs), JSON.stringify(['/assets/trianon-film.webm', '/assets/trianon-film.mp4']));
    else check('mobile: solo la fuente móvil', JSON.stringify(film.srcs), JSON.stringify(['/assets/trianon-film-movil.mp4']));
    const h264 = await p.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'));
    const filmMissing = film.srcs.some((u) => served404.has(u));
    let filmAvailable = !!film.currentSrc && !film.paused && !filmMissing && !(label === 'mobile' && !h264);
    if (filmMissing) note(`${label}: la película todavía no está en /assets (queda el póster)`, film.srcs.filter((u) => served404.has(u)));
    if (label === 'mobile' && !h264) note('mobile: este Chromium de prueba no decodifica H.264: la reproducción del mp4 móvil se comprueba en un navegador real', film.currentSrc || '(sin archivo)');
    if (filmAvailable) {
      try {
        await p.waitForFunction(() => { const v = document.querySelector('[data-lpt2-film]'); return v.currentTime > 0.2 && !document.querySelector('[data-lpt2-film-toggle]').hidden; }, null, { timeout: 12000 });
        film.t = await p.evaluate(() => document.querySelector('[data-lpt2-film]').currentTime);
        film.toggleHidden = false;
      } catch (e) {
        filmAvailable = false;
        check(`${label}: la película arranca (currentTime > 0 y botón de pausa visible)`, false, true);
      }
    }
    if (filmAvailable) {
      check(`${label}: la película se reproduce`, film.t > 0, true);
      check(`${label}: botón de pausa visible`, film.toggleHidden, false);
      await p.click('[data-lpt2-film-toggle]');
      await p.waitForTimeout(200);
      const t1 = await p.evaluate(() => { const v = document.querySelector('[data-lpt2-film]'); const t = document.querySelector('[data-lpt2-film-toggle]'); return { paused: v.paused, pressed: t.getAttribute('aria-pressed'), label: t.getAttribute('aria-label') }; });
      check(`${label}: el botón pausa la película (aria-pressed, etiqueta del idioma)`, t1.paused && t1.pressed === 'true' && !!t1.label, true);
      await p.click('[data-lpt2-film-toggle]');
      await p.waitForTimeout(300);
      check(`${label}: el botón la reanuda`, await p.evaluate(() => !document.querySelector('[data-lpt2-film]').paused), true);
    } else if (!filmMissing && !(label === 'mobile' && !h264)) {
      note(`${label}: película no disponible todavía (queda el póster)`, film.currentSrc || '(sin archivo)');
    }

    await p.screenshot({ path: path.join(OUT, `v2-${tag}-${label}.png`) });

    /* Recorrido para disparar los reveals; la película descansa fuera de pantalla */
    const total = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < total; y += Math.round(h * 0.7)) { await p.evaluate((yy) => scrollTo({ top: yy, left: 0, behavior: 'instant' }), y); await p.waitForTimeout(120); }
    await p.waitForTimeout(300);
    if (filmAvailable) check(`${label}: la película se pausa fuera de pantalla`, await p.evaluate(() => document.querySelector('[data-lpt2-film]').paused), true);
    await p.evaluate(() => scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await p.waitForTimeout(400);
    if (filmAvailable) check(`${label}: y vuelve al volver`, await p.waitForFunction(() => !document.querySelector('[data-lpt2-film]').paused, null, { timeout: 4000 }).then(() => true, () => false), true);

    /* Palabras visibles (una vez) */
    if (label === 'desktop') {
      const words = await p.evaluate(() => {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('script, style, template, noscript, dialog').forEach((n) => n.remove());
        return clone.textContent.split(/\s+/).filter((t) => /[0-9A-Za-zÀ-ÿ]/.test(t)).length;
      });
      check(`palabras visibles ≤ ${MAX_WORDS}`, words <= MAX_WORDS, true);
      note('palabras visibles', words);
    }

    /* Fotos: tamaño mostrado ≤ 1280 px; tamaño natural cuando el archivo existe */
    const photos = await p.evaluate(() => Array.from(document.querySelectorAll('.lpt2-ph img, .lpt2-cierre__bg')).map((im) => ({ shown: Math.round(im.getBoundingClientRect().width), file: (im.currentSrc || '').split('/').pop() || '—', attrs: im.getAttribute('width') + '×' + im.getAttribute('height') })));
    check(`${label}: ninguna foto real se muestra a más de 1280 px`, photos.every((x) => x.shown <= 1280), true);
    note(`${label}: fotos`, photos);

    /* Captura de la página completa por tramos (reveals forzados, sin nav fija ni FAB durante la captura) */
    const stageH = await p.evaluate(() => Math.round(document.querySelector('.lpt-stage__media').getBoundingClientRect().height));
    await p.addStyleTag({ content: `#pw-shot{} .reveal,.line-up{opacity:1!important;transform:none!important;filter:none!important;transition:none!important;animation:none!important} h2 em::after{transform:scaleX(1)!important;transition:none!important} .lpt-stage__media{height:${stageH}px!important;max-height:none!important;aspect-ratio:auto!important} .fab{display:none!important} .top-nav.is-glass{visibility:hidden!important} .progress{display:none!important}` });
    const overflow = await p.evaluate(() => {
      const bad = [];
      document.querySelectorAll('h1, h2, h3, p, li, td, th, a, b, small, figcaption, summary').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.overflow !== 'visible' || el.closest('.lpt2-sr')) return;
        for (let a = el.parentElement; a; a = a.parentElement) if (a.clientWidth > 0 && a.clientWidth <= 1) return; /* encabezados visualmente ocultos */
        if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) bad.push(el.tagName + '.' + el.className + ' ' + el.scrollWidth + '>' + el.clientWidth + ' «' + el.textContent.trim().slice(0, 40) + '»');
      });
      return bad.slice(0, 12);
    });
    check(`${label}: sin textos desbordados`, overflow.length, 0);
    if (overflow.length) note(`${label}: desbordes`, overflow);
    const rawDir = path.join(OUT, `raw-v2-${tag}-${label}`);
    fs.rmSync(rawDir, { recursive: true, force: true }); fs.mkdirSync(rawDir, { recursive: true });
    for (const f of fs.readdirSync(OUT)) if (f.startsWith(`v2-${tag}-${label}-t`)) fs.rmSync(path.join(OUT, f));
    const totalH = await p.evaluate(() => document.documentElement.scrollHeight);
    const offsets = [];
    for (let y = 0, i = 0; y < totalH; y += h, i++) {
      const got = await p.evaluate((yy) => { scrollTo({ top: yy, left: 0, behavior: 'instant' }); return Math.round(document.scrollingElement.scrollTop); }, y);
      await p.waitForTimeout(220);
      const shot = path.join(rawDir, `s${String(i).padStart(2, '0')}.png`);
      await p.screenshot({ path: shot });
      fs.copyFileSync(shot, path.join(OUT, `v2-${tag}-${label}-t${String(i + 1).padStart(2, '0')}.png`));
      offsets.push(got);
      if (got < y) break;
    }
    fs.writeFileSync(path.join(rawDir, 'offsets.json'), JSON.stringify({ offsets, w, h, totalH }));
    await p.evaluate(() => { scrollTo({ top: 0, left: 0, behavior: 'instant' }); Array.from(document.querySelectorAll('style')).filter((x) => x.textContent.startsWith('#pw-shot')).forEach((x) => x.remove()); });
    await p.waitForTimeout(200);

    /* Objetivos táctiles en móvil */
    if (label === 'mobile') {
      const small = await p.evaluate(() => Array.from(document.querySelectorAll('a[href], button, summary')).filter((el) => {
        const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden || b.width === 0 || el.closest('[hidden], dialog, .fab, .lpt2-sr')) return false;
        return b.height < 44 - 0.5 || b.width < 44 - 0.5;
      }).map((el) => el.tagName + '.' + (el.className || '').toString().slice(0, 30) + ' ' + Math.round(el.getBoundingClientRect().width) + '×' + Math.round(el.getBoundingClientRect().height) + ' «' + el.textContent.trim().slice(0, 24) + '»'));
      check('mobile: objetivos táctiles ≥ 44 px', small.length, 0);
      if (small.length) note('mobile: objetivos pequeños', small);
    }

    /* Galería: <dialog>, flechas, Esc y foco devuelto */
    await p.evaluate(() => document.querySelector('#propiedad').scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(500);
    await p.click('.lpt2-ph--casa a');
    await p.waitForTimeout(400);
    const g1 = await p.evaluate(() => { const d = document.querySelector('dialog.lpt2-lb'); const i18n = JSON.parse(document.getElementById('pw-i18n').textContent).gallery; return { open: d && d.open, focus: document.activeElement && document.activeElement.className, count: d.querySelector('.lpt2-lb__count').textContent, closeLabel: d.querySelector('.lpt2-lb__close').getAttribute('aria-label'), want: i18n.close, label: d.getAttribute('aria-label'), imgW: Math.round(d.querySelector('.lpt2-lb__img').getBoundingClientRect().width) }; });
    check(`${label}: la galería abre el <dialog> con el foco en «${g1.want}»`, g1.open && /lpt2-lb__close/.test(g1.focus) && g1.closeLabel === g1.want && !!g1.label, true);
    check(`${label}: la foto ampliada no pasa de 1280 px`, g1.imgW <= 1280, true);
    await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(250);
    const c2 = await p.evaluate(() => document.querySelector('.lpt2-lb__count').textContent);
    check(`${label}: la flecha derecha pasa a la foto 2`, /^2\D+5$/.test(c2.trim()), true);
    await p.keyboard.press('ArrowLeft');
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.documentElement.classList.contains('lpt2-lock'), null, { timeout: 4000 }).catch(() => {});
    const g2 = await p.evaluate(() => ({ open: document.querySelector('dialog.lpt2-lb').open, back: document.activeElement === document.querySelector('.lpt2-ph--casa a'), lock: document.documentElement.classList.contains('lpt2-lock') }));
    check(`${label}: Esc cierra la galería y devuelve el foco a la foto`, !g2.open && g2.back && !g2.lock, true);

    /* Chips del cierre */
    const chip = await p.evaluate(() => {
      const bs = document.querySelectorAll('.lpt-chips .diag-opt'); const link = document.querySelector('[data-lpt-wa]');
      const before = link.getAttribute('href'); bs[0].click(); const after = link.getAttribute('href'); const pressed = bs[0].getAttribute('aria-pressed');
      bs[0].click(); const reset = link.getAttribute('href');
      return { before, after, pressed, reset };
    });
    check(`${label}: el chip «Invertir con el Investor Pass» reescribe el WhatsApp`, chip.after !== chip.before && /Investor%20Pass/.test(chip.after) && chip.after.startsWith('https://wa.me/595993474309?text=') && chip.pressed === 'true', true);
    check(`${label}: un segundo toque devuelve el mensaje base`, chip.reset, chip.before);

    /* La maqueta: «Explorar la maqueta 3D» de la sección III */
    const open = await p.evaluate(() => { const a = document.querySelector('#maqueta .lpt-stage__open'); return { href: a.getAttribute('href'), role: a.getAttribute('role'), text: a.textContent.trim() }; });
    check(`${label}: «Explorar la maqueta 3D» es un enlace al visor`, open.href === '/le-petit-trianon/maqueta/?lang=' + LANG && /Explorar|3D/.test(open.text), true);
    if (label === 'desktop') {
      check('desktop: actúa como botón (role)', open.role, 'button');
      check('desktop: sin iframe antes del gesto', await p.evaluate(() => !!document.querySelector('.lpt-stage iframe')), false);
      await p.evaluate(() => document.querySelector('#maqueta').scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(300);
      await p.click('#maqueta .lpt-stage__open');
      await p.waitForTimeout(900);
      const fr = await p.evaluate(() => { const f = document.querySelector('.lpt-stage iframe'); return f ? { src: f.getAttribute('src'), title: f.title, loading: f.getAttribute('loading'), allow: f.getAttribute('allow'), h: Math.round(f.getBoundingClientRect().height) } : null; });
      check('desktop: el clic inserta el iframe', !!fr, true);
      if (fr) {
        check('desktop: iframe src embed', fr.src, `/le-petit-trianon/maqueta/?lang=${LANG}&embed=1`);
        check('desktop: iframe con title, loading=lazy y allow=fullscreen', !!fr.title && fr.loading === 'lazy' && fr.allow === 'fullscreen', true);
        check('desktop: altura del marco ≥ 540', fr.h >= 540, true);
      }
      await p.evaluate(() => document.querySelector('.lpt2-lotes [data-maqueta="lote=3&view=lote"]').click());
      await p.waitForTimeout(500);
      check('desktop: «Ver en la maqueta» del lote 3 recarga el iframe', await p.evaluate(() => document.querySelector('.lpt-stage iframe').getAttribute('src')), `/le-petit-trianon/maqueta/?lang=${LANG}&embed=1&lote=3&view=lote`);
      check('desktop: «Pantalla completa» sigue los parámetros', await p.evaluate(() => document.querySelector('[data-lpt-full]').getAttribute('href')), `/le-petit-trianon/maqueta/?lang=${LANG}&lote=3&view=lote`);
      check('desktop: la fila 3 queda marcada', await p.evaluate(() => document.querySelector('.lpt2-lotes tr.is-current [data-maqueta]')?.getAttribute('data-maqueta')), 'lote=3&view=lote');
      try { await p.waitForFunction(() => document.querySelector('.lpt-stage').classList.contains('is-ready'), null, { timeout: 60000 }); } catch (e) { results.push({ name: 'desktop: el visor cargó en el iframe', ok: false, got: e.message.split('\n')[0] }); }
      await p.waitForTimeout(2000);
      await p.evaluate(() => document.querySelector('.lpt-stage').scrollIntoView({ block: 'start' }));
      await p.waitForTimeout(400);
      try { await p.screenshot({ path: path.join(OUT, `v2-${tag}-${label}-maqueta.png`), timeout: 120000 }); } catch (e) { note('desktop: captura del marco vivo', e.message.split('\n')[0]); }
    } else {
      check('mobile: sin role=button (navega al visor)', open.role, null);
      await p.evaluate(() => { document.addEventListener('click', (e) => e.preventDefault()); document.querySelector('#maqueta .lpt-stage__open').click(); });
      await p.waitForTimeout(400);
      check('mobile: el clic no inserta iframe', await p.evaluate(() => !!document.querySelector('.lpt-stage iframe')), false);
    }

    errorsByView[label] = errs;
    check(`${label}: cero errores de consola`, errs.length, 0);
    await ctx.close();
  }

  /* prefers-reduced-motion: ningún video, queda el póster */
  for (const [w, h, label] of VIEWS) {
    const { ctx, p, errs, requests } = await newPage(w, h, label, { reducedMotion: 'reduce' });
    await p.waitForTimeout(1500);
    const rm = await p.evaluate(() => { const v = document.querySelector('[data-lpt2-film]'); return { srcs: v.querySelectorAll('source[src]').length, currentSrc: v.currentSrc, toggleHidden: document.querySelector('[data-lpt2-film-toggle]').hidden, poster: getComputedStyle(document.querySelector('.lpt2-film__frame')).backgroundImage.includes('trianon-film-poster') }; });
    const videoReqs = requests.filter((u) => /trianon-film(\.|-movil)/.test(u) && !/poster/.test(u));
    check(`${label} · reduced-motion: sin video (ninguna fuente, ninguna descarga), queda el póster`, rm.srcs === 0 && !rm.currentSrc && rm.toggleHidden && rm.poster && videoReqs.length === 0, true);
    check(`${label} · reduced-motion: cero errores de consola`, errs.length, 0);
    if (errs.length) errorsByView[label + '-reduced'] = errs;
    await ctx.close();
  }
  await b.close();

  /* Enlaces internos: 200 */
  const statuses = [];
  for (const u of Array.from(urls).sort()) {
    const clean = u.split('#')[0];
    if (!clean || IGNORE.test(clean)) continue; /* /_vercel/insights solo existe en Vercel */
    let st = 0;
    try { st = (await fetch(BASE + clean, { method: 'GET', redirect: 'manual' })).status; } catch (e) { st = -1; }
    statuses.push({ u: clean, st });
  }
  const bad = statuses.filter((x) => x.st !== 200 && !(PENDING.test(x.u) && x.st === 404));
  statuses.filter((x) => PENDING.test(x.u) && x.st === 404).forEach((x) => pending.add(x.u));
  check('todos los href/src internos responden 200 (salvo los assets pendientes)', bad.length, 0);
  if (bad.length) note('internos con error', bad);

  const pass = results.filter((r) => r.ok).length + '/' + results.length;
  console.log(JSON.stringify({ route, pass, failed: results.filter((r) => !r.ok), results, errors: errorsByView, pendientes: Array.from(pending).sort(), provisionales: Array.from(standinsUsed).sort(), urls: statuses }, null, 1));
})();
