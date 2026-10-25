/* Prueba de idiomas y parámetros de URL del visor (Playwright + SwiftShader).
   Uso: NODE_PATH=/opt/node22/lib/node_modules node i18n-test.js
   Carga el visor con ?lang=pt|en|fr&lote=3, comprueba <html lang>, <title>, la ficha (título, superficie, frente, CTA y texto de
   WhatsApp en el idioma), la cabecera (superficie del predio con el separador de miles del idioma), la marca (página del
   desarrollo del idioma; con embed=1 el inicio del sitio en _top), que en EN no quede ninguna palabra en español a la vista,
   y los parámetros view= y light=. Deja capturas en out/visor-{pt,en,fr}.png (1440×900, lote 3 abierto). */
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const BASE = process.env.PW_URL || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/';
const NN = ' ';   /* espacio fino insecable (FR) */
const EXPECT = {
  pt: { title: 'Lote 3', area: '633,90 m²', front: '≈ 19,9 m', sup: '5.468,82 m²', cta: 'Perguntar sobre o lote 3', wa: 'Olá, vi o lote 3 do loteamento Le Petit Trianon', doc: 'Le Petit Trianon · Maquete 3D', page: '/pt/le-petit-trianon/', home: '/pt/', toolbar: 'Maquete', close: 'Fechar a ficha (Esc)' },
  en: { title: 'Plot 3', area: '633.90 m²', front: '≈ 19.9 m', sup: '5,468.82 m²', cta: 'Ask about plot 3', wa: 'Hello, I saw plot 3 of the Le Petit Trianon subdivision', doc: 'Le Petit Trianon · 3D model', page: '/en/le-petit-trianon/', home: '/en/', toolbar: 'Model', close: 'Close the plot details (Esc)' },
  fr: { title: 'Lot 3', area: '633,90' + NN + 'm²', front: '≈ 19,9' + NN + 'm', sup: '5' + NN + '468,82' + NN + 'm²', cta: 'Se renseigner sur le lot 3', wa: 'Bonjour, j’ai vu le lot 3 du lotissement Le Petit Trianon', doc: 'Le Petit Trianon · Maquette 3D', page: '/fr/le-petit-trianon/', home: '/fr/', toolbar: 'Maquette', close: 'Fermer la fiche (Échap)' },
};
/* palabras españolas que no deben quedar a la vista en EN (los nombres propios Ruta San Bernardino – Pirayú y UTM 21S no cuentan) */
/* ficha «Para qué sirve»: el umbral es la inversión (parcela + construcción de la casa), nunca el precio del lote solo */
const USE = {
  pt: /construção da sua casa, o investimento a partir de US\$\u00A0200\.000, destinado a renda ou valorização/,
  en: /construction of your house, an investment from USD\u00A0200,000, held for rental or appreciation/,
  fr: /construction de votre maison, un investissement d’au moins 200\u202F000\u202FUSD, destiné à la location ou à la valorisation/,
};
const SPANISH = /(^|[^\p{L}])(Lote|lotes|Superficie|superficie|calle|Cerrar|Ayuda|Vista|Luz|Vegetación|Cotas|Leyenda|Maqueta|maqueta|Plano|plano|Atardecer|Noche|Día|Parque|Bosque|portón|portero|seleccionado|mensura|Frente|Lados|Consultar|Acercarme|Pedir|Dentro|teclas|elegir|cerrar|veredas|tacuaral|césped|empedrada|norte|según)(?![\p{L}])/u;
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'ok   ' : 'FALLO ') + name + (ok ? '' : ' → ' + JSON.stringify(detail))); };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errs = [];
  async function open(query, w, h) {
    const p = await b.newPage({ viewport: { width: w || 1440, height: h || 900 } });
    p.on('pageerror', e => errs.push(query + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(query + ' console: ' + m.text()); });
    await p.goto(BASE + '?' + query);
    await p.waitForFunction(() => window.PW && PW.app && PW.app.state && PW.app.state.ready, null, { timeout: 120000 });
    await p.waitForTimeout(600);
    await p.evaluate(() => { PW.app.settle(); PW.app.pause(); });
    await p.waitForTimeout(400);
    await p.evaluate(() => PW.app.settle());
    return p;
  }
  for (const lang of ['pt', 'en', 'fr']) {
    const E = EXPECT[lang];
    const p = await open('lang=' + lang + '&lote=3');
    const got = await p.evaluate(() => ({
      lang: document.documentElement.lang, title: document.title, desc: (document.querySelector('meta[name="description"]') || {}).content || '',
      sel: PW.app.state.selected, view: PW.app.state.view, open: document.querySelector('.pw-sheet').classList.contains('is-open'),
      sheetTitle: document.querySelector('.pw-sheet-title').textContent, area: document.querySelector('.pw-area-num').textContent,
      front: document.querySelector('.pw-data dd').textContent, facts: document.querySelector('.pw-facts').textContent,
      cta: document.querySelector('.pw-cta span').textContent, ctaHref: document.querySelector('.pw-cta').href, waFrom: document.querySelector('.pw-cta').getAttribute('data-wa-from'),
      brandHref: document.querySelector('.pw-brand').getAttribute('href'), brandTarget: document.querySelector('.pw-brand').getAttribute('target'),
      firstTb: document.querySelector('.pw-toolbar .pw-tb span').textContent, closeAria: document.querySelector('.pw-sheet .pw-close').getAttribute('aria-label'),
      canvasAria: document.getElementById('escena').getAttribute('aria-label'), use: document.querySelector('.pw-use p').textContent,
      bodyText: document.body.innerText,
    }));
    check(lang + ': <html lang>', got.lang === lang, got.lang);
    check(lang + ': <title> y descripción en el idioma, sin «Prototipo»', got.title === E.doc && !/Prototipo/.test(got.desc) && got.desc.length > 40, { title: got.title, desc: got.desc });
    check(lang + ': lote=3 abre el lote 3 en vista lote', got.sel === 3 && got.view === 'lote' && got.open, { sel: got.sel, view: got.view, open: got.open });
    check(lang + ': título de la ficha «' + E.title + '»', got.sheetTitle === E.title, got.sheetTitle);
    check(lang + ': superficie «' + E.area.replace(NN, '⍽') + '»', got.area === E.area, got.area.replace(NN, '⍽'));
    check(lang + ': frente «' + E.front.replace(NN, '⍽') + '»', got.front === E.front, got.front.replace(NN, '⍽'));
    check(lang + ': cabecera con la superficie del predio «' + E.sup.replace(/ /g, '⍽') + '»', got.facts.includes(E.sup), got.facts.replace(/ /g, '⍽'));
    check(lang + ': CTA de WhatsApp en el idioma', got.cta === E.cta && got.ctaHref.includes('wa.me/595993474309?text=' + encodeURIComponent(E.wa)) && got.waFrom === 'maqueta-lote-3', { cta: got.cta, href: decodeURIComponent(got.ctaHref), waFrom: got.waFrom });
    check(lang + ': marca → página del desarrollo del idioma, misma pestaña', got.brandHref === E.page && got.brandTarget === null, { href: got.brandHref, target: got.brandTarget });
    check(lang + ': barra y aria-labels en el idioma', got.firstTb === E.toolbar && got.closeAria === E.close && !/Maqueta 3D de/.test(got.canvasAria), { tb: got.firstTb, close: got.closeAria, canvas: got.canvasAria });
    check(lang + ': ficha «para qué sirve» con el umbral de la inversión (lote + casa), no del lote solo', USE[lang].test(got.use) && !/(lote|lot|plot|parcelle)\s+(pode integrar|can be included|peut entrer)/i.test(got.use), got.use);
    if (lang === 'en') {
      const lw = got.bodyText.match(/\blots?\b/i);
      check('en: «plot» como en la página, ningún «lot» a la vista', !lw, lw && got.bodyText.slice(Math.max(0, lw.index - 40), lw.index + 40).replace(/\s+/g, ' '));
      const m = got.bodyText.match(SPANISH);
      check('en: ninguna palabra española a la vista', !m, m && m[0] + ' … ' + got.bodyText.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' '));
      await p.keyboard.press('?'); await p.waitForTimeout(300);
      const help = await p.evaluate(() => document.querySelector('.pw-help-card').innerText + '\n' + document.querySelector('.pw-help-link').getAttribute('href'));
      const mh = help.match(SPANISH) || help.match(/\blots?\b/i);
      check('en: ayuda sin palabras españolas ni «lot», y con la nota «in Spanish»', !mh && /in Spanish/.test(help) && /nota-tecnica\/$/.test(help), mh && mh[0]);
      await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    }
    await p.evaluate(() => PW.app.settle());
    await p.screenshot({ path: path.join(OUT, 'visor-' + lang + '.png') });
    await p.close();
  }
  /* embed=1 + view + light: la marca va al inicio del idioma en _top; la vista y la luz iniciales obedecen a la URL */
  {
    const p = await open('lang=pt&embed=1&view=plano&light=noche');
    const got = await p.evaluate(() => ({ brandHref: document.querySelector('.pw-brand').getAttribute('href'), brandTarget: document.querySelector('.pw-brand').getAttribute('target'), view: PW.app.state.view, light: PW.app.state.light, uiLight: document.querySelector('.pw-ui').getAttribute('data-light'), plano: document.querySelector('.pw-ui').classList.contains('is-plano'), note: document.querySelector('.pw-help-link').getAttribute('target'), params: PW.app.params }));
    check('embed=1: marca → ' + EXPECT.pt.home + ' en _top', got.brandHref === EXPECT.pt.home && got.brandTarget === '_top', got);
    check('view=plano&light=noche: estado inicial', got.view === 'plano' && got.light === 'noche' && got.uiLight === 'noche' && got.plano, got);
    check('embed=1: la nota técnica abre en pestaña nueva', got.note === '_blank', got.note);
    await p.close();
  }
  /* sin parámetros: español por defecto y entrada a la vista maqueta (lang inválido también cae al español) */
  {
    const p = await open('lang=xx');
    const got = await p.evaluate(() => ({ lang: document.documentElement.lang, title: document.querySelector('.pw-sheet-title').textContent, view: PW.app.state.view, sel: PW.app.state.selected, chips: document.querySelector('.pw-chips-label').textContent, brand: document.querySelector('.pw-brand').getAttribute('href') }));
    check('lang inválido → español, vista maqueta, nada seleccionado, marca → /le-petit-trianon/', got.lang === 'es' && got.view === 'maqueta' && got.sel === null && got.chips === 'Lote' && got.brand === '/le-petit-trianon/', got);
    await p.close();
  }
  await b.close();
  const pass = results.filter(r => r.ok).length;
  console.log(JSON.stringify({ pass: pass + '/' + results.length, errors: errs }));
  if (errs.length || pass !== results.length) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
