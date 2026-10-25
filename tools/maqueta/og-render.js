/* Tarjetas Open Graph del desarrollo: renderiza og-trianon.html?lang=… a 1200×630 con Chromium.
   Uso: node og-render.js <carpeta de salida> [idiomas=es,pt,en,fr]
   Requiere el servidor local del repo (python3 -m http.server 8765 desde la raíz) y red para Google Fonts
   (si no hay red, Chromium usa las Newsreader/Inter/JetBrains Mono instaladas en el sistema).
   El fondo es la foto real de la casa (assets/trianon-foto-casa.jpg): las capturas salen en 24 bits (~830 KB);
   para publicarlas, pasarlas por png-optimize.py (paleta 256 con libimagequant, ≈280 KB):
     python3.12 -I png-optimize.py <salida>/og-trianon-es.png ../../assets/og-trianon-es.png
   Ejecutar siempre envuelto en: flock /tmp/pw-render.lock node og-render.js … */
const fs = require('fs');
const { chromium } = require('playwright');
const [,, dir, langsArg] = process.argv;
const langs = (langsArg || 'es,pt,en,fr').split(',');
const URL = process.env.PW_URL || 'http://127.0.0.1:8765/tools/maqueta/og-trianon.html';
fs.mkdirSync(dir, { recursive: true });
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  for (const lang of langs) {
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    await p.goto(`${URL}?lang=${lang}`, { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForFunction(() => [...document.images].every(i => i.complete && i.naturalWidth > 0));
    await p.waitForTimeout(600);
    const fonts = await p.evaluate(() => ['Newsreader', 'Inter', 'JetBrains Mono'].map(f => f + ':' + document.fonts.check('16px "' + f + '"')));
    const out = `${dir}/og-trianon-${lang}.png`;
    await p.screenshot({ path: out });
    console.log(JSON.stringify({ out, fonts, errors: errs }));
    await p.close();
  }
  await b.close();
})();
