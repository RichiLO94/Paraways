# Le Petit Trianon · maqueta 3D

Visor interactivo de **Le Petit Trianon** (siete lotes en San Bernardino, departamento de Cordillera, Paraguay), construido sobre el plano del proyecto de la Arquitecta Lolia Lima y la mensura georreferenciada del título. Es una sub-app autónoma de paraways.com: HTML, CSS y JavaScript clásico, una copia local de three.js y ningún paso de build. Se sirve en `/le-petit-trianon/maqueta/` y la página del desarrollo (`/le-petit-trianon/`) la embebe en un iframe.

Este archivo explica cómo correrla, probarla y editarla. El detalle técnico de cada módulo y de los datos está en [`CONTRACT.md`](CONTRACT.md); léelo antes de tocar un módulo.

## Estructura

```
le-petit-trianon/maqueta/
  index.html            entrada: orden de carga, stub de analítica, <noscript> en ES y EN
  i18n.js               PW.i18n: idioma por ?lang=, diccionarios ES/PT/EN/FR, t(), fmt(), paths
  three.min.js          three.js r158 (UMD, MIT), copia local; expone window.THREE
  addons/three.js       puente ESM → UMD: los addons importan 'three' y reciben el THREE global
  addons/postprocessing/, addons/shaders/, addons/math/   addons de three.js r158 (ESM, MIT)
  post.js               módulo ESM: publica los pases de postproceso en window.PW_POST
  data.js               window.PW_DATA: toda la geometría en metros (predio, lotes, calle, portón, casa, mensura)
  terrain.js            PW.terrain (elevación, toWorld), PW.palette (colores), PW.rng (aleatorio determinista)
  textures.js           PW.textures: texturas procedurales (CanvasTexture), sprites y planos de texto
  vegetation.js         PW.vegetation: arbolado instanciado (parque/bosque), césped, cercos vivos
  architecture.js       PW.architecture: casa existente, portón y casilla, cerco, faroles, marcadores de lote
  environment.js        PW.environment: cielo y PMREM, sombra del sol, modo diorama (maqueta de mesa)
  ui.js, ui.css         PW.ui: cabecera, chips, minimapa, barra, ficha de lote, ayuda, avisos
  app.js                núcleo: escena, cámara, vistas, luz, selección, parámetros de URL; expone PW.app
  plano-base.png        dibujo de la Arquitecta Lolia Lima, capa base de la vista Plano
  (la nota técnica no usa imágenes externas)
  nota-tecnica/index.html   nota técnica (ES): método, coordenadas, tablas de superficies
  dev/                  páginas de prueba (noindex): harness.html, ui-test.html, architecture-test.html, textures-test.html
  CONTRACT.md           contrato de módulos y datos
  README.md             este archivo

tools/maqueta/          scripts de prueba y captura (Node + Playwright, Python); no se despliegan
tools/maqueta/out/      salidas de los scripts; ignorada por git
```

Orden de carga en `index.html`: `i18n.js` (fija el idioma), `three.min.js`, `post.js` (módulo, con un `importmap` que resuelve `three` a `addons/three.js`), `data.js`, `terrain.js`, `textures.js`, `vegetation.js`, `architecture.js`, `environment.js`, `ui.js`, `app.js`. Cada módulo es un archivo clásico que se registra en `window.PW.<nombre>` con `build(ctx)` y devuelve `{ update, setMode, setNight, dispose }`; `app.js` los construye en ese orden y `environment.js` el último.

Peso en red (gzip): three.min.js 157 KB, addons 53 KB, código propio y CSS unos 110 KB, `data.js` 14 KB, `plano-base.png` 45 KB. Total de scripts y estilos: 335 KB comprimidos (1,18 MB sin comprimir). Las fotos de la mensura (330 KB) solo se cargan en la nota técnica.

## Correr en local

Hace falta un servidor HTTP (el módulo `post.js` y el `importmap` no funcionan desde `file://`). Desde la raíz del repositorio:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

y abrir `http://127.0.0.1:8765/le-petit-trianon/maqueta/`. Las rutas son las mismas que en producción; la página del desarrollo queda en `http://127.0.0.1:8765/le-petit-trianon/`. El servidor de Python no envía las cabeceras de `vercel.json` (no hacen falta en local) y `/_vercel/insights/script.js` responde 404: es normal y todos los scripts de prueba lo ignoran.

## Parámetros de URL

| Parámetro | Valores | Efecto |
|---|---|---|
| `lang` | `es` (por defecto), `pt`, `en`, `fr` | Idioma de toda la interfaz: textos, `aria-label`, títulos, ayuda, mensajes de WhatsApp y formato numérico. Otro valor cae a `es`. Se fija al cargar (no hay cambio en caliente). |
| `embed` | `1` | Modo embebido en la página del desarrollo: la marca abre el inicio del sitio del idioma (`/`, `/pt/`…) con `target="_top"`; la nota técnica y WhatsApp abren en pestaña nueva; nada navega el iframe fuera de sí mismo. |
| `lote` | `1`…`7` | Abre con ese lote seleccionado y, salvo que `view` pida otra, en la vista `lote`. |
| `view` | `maqueta`, `plano`, `ruta`, `lote`, `dron` | Vista inicial. Sin `lote` ni `view`, entrada cinematográfica a `maqueta`. |
| `light` | `dia`, `atardecer`, `noche` | Luz inicial (por defecto `atardecer`). |

Valores inválidos se ignoran. Sin `embed`, la marca lleva a la página del desarrollo del idioma (`/le-petit-trianon/`, `/pt/le-petit-trianon/`, …). Ejemplos: `?lang=pt&lote=3`, `?lang=en&embed=1&view=plano&light=noche`. Lo aceptado está en `PW.app.params`.

Teclado: `1`–`7` elige lote, `←` `→` cambia de lote, `Esc` cierra, `V` vista, `L` luz, `T` vegetación, `C` cotas, `P` plano, `R` reinicia, `?` ayuda. Mouse y táctil: arrastrar orbita, rueda o pellizco acerca, botón derecho desplaza, tocar un lote lo selecciona.

## Editar los datos (`data.js`)

`data.js` es una sola línea: `window.PW_DATA = { … };`. Todo está en **metros** en el marco del plano: origen en el vértice 2 (esquina camino vecinal / ruta), X hacia el este, Y hacia el fondo. `terrain.js` convierte a mundo 3D (`toWorld(x, y)` → `(x, elevación, −y)`). Claves de primer nivel: `meta`, `site` (polígono del predio medido, lados con sus cotas, anillo), `lots[]`, `road` (eje, calzada, veredas, anchos, curva), `tacuaral`, `front` (área verde, muro, portón con casilla y carriles), `house` (volúmenes, pileta, cochera, contorno), `trees_plan`, `islands`, `ruta`, `camino_vecinal`, `verde_extra`, `geo` (la mensura: CRS, vértices, centroide, azimut). El detalle campo por campo está en `CONTRACT.md`.

- **Superficies.** Cada lote tiene `area_drawn` (calculada sobre la mensura georreferenciada: es la que muestran la ficha, los chips y los rótulos 3D) y `area_plan` (tabla del plano de fraccionamiento de la Arquitecta Lolia Lima, anterior a la mensura; referencia en la nota técnica). `frente_calle` es aproximado, con un decimal. Si cambias una superficie, actualiza también: `tools/maqueta/data.json`, la tabla de `nota-tecnica/index.html`, los chips de lotes de la página del desarrollo (`le-petit-trianon/index.html` y sus idiomas) y los valores esperados en `tools/maqueta/ui-interact-test.js` e `i18n-test.js` (lote 3: `633,90 m²`).
- **Plano base.** `plano-base.png` es el dibujo de la Arquitecta Lolia Lima sin rótulos exteriores; `app.js` lo apoya sobre el predio y lo deforma al límite medido en la vista Plano. Es solo una imagen: la geometría viene de `data.js`.
- **Mensura.** `geo` y `site.polygon` llevan el límite medido (GNSS RTK, UTM 21S, WGS84). El norte y las coordenadas de la cabecera salen de `geo` (`azimut_eje_x`, `centroide`). No contiene nombres de personas y debe seguir así.
- **Copia legible.** `tools/maqueta/data.json` es exactamente `JSON.stringify(PW_DATA, null, 1)`: sirve para leer y comparar. Tras editar `data.js`, regenérala desde `tools/maqueta/`:

  ```sh
  node -e "const window={};eval(require('fs').readFileSync('../../le-petit-trianon/maqueta/data.js','utf8'));require('fs').writeFileSync('data.json',JSON.stringify(window.PW_DATA,null,1)+'\n')"
  ```

- **Pipeline histórico.** `tools/maqueta/finalize.py` (numpy + shapely) es la etapa que calculó el eje de la calle, la calzada, las veredas y los polígonos de los lotes a partir del dibujo; lee y escribe `out/data.json`. No regenera `ring`, `sides`, `bbox`, `frente_calle`, `islands` ni `geo`, que se añadieron después, así que la fuente de verdad hoy es `data.js`: para cambios puntuales edita `data.js` directamente.

Para no inventar: lo que no esté en `PW_DATA` o en la nota técnica no se afirma en la interfaz. Si un dato falta, en pantalla se muestra «—» (clave `sheet.placeholder`) y el hueco se reporta como `[a confirmar]`.

## Cambiar textos (`i18n.js`)

`i18n.js` es el primer script de la página y expone:

```js
PW.i18n = {
  lang,            // 'es' | 'pt' | 'en' | 'fr', resuelto de ?lang=
  t(key, vars),    // t('sheet.cta', { n: 3 }) → 'Consultar por el lote 3'
  fmt(n, decimals),// fmt(5468.8157, 2) → ES/PT '5.468,82' · EN '5,468.82' · FR '5 468,82'
  dict,            // diccionario del idioma activo
  dicts,           // { es, pt, en, fr }
  langs,           // ['es', 'pt', 'en', 'fr']
  paths,           // { home: '/' o '/pt/', page: '/le-petit-trianon/' o '/pt/le-petit-trianon/' }
};
```

- Cuatro diccionarios de claves planas (`'sección.nombre'`): **ES** es la fuente; **PT-BR** con «você»; **EN** sobrio; **FR** con «vous» y espacio fino insecable (U+202F) delante de `;` `:` y de las unidades. Una clave que falta en un idioma cae al español; si tampoco existe, `t()` devuelve la clave (se ve en pantalla, y así se detecta). Los valores que no son cadenas (las listas de la ayuda, `help.keys` y `help.mouse`) se devuelven tal cual.
- `{n}`, `{k}`… se sustituyen con `vars`. Las claves `*_title` y `*_aria` son títulos y `aria-label`; `sheet.wa_lot` y `sheet.wa_full` son los textos prellenados de WhatsApp; `meta.title` y `meta.description` reescriben `<title>` y la descripción al cargar.
- **Todo** texto visible o audible (DOM, `aria-label`, `title`, rótulos pintados en canvas) pasa por `t()`, y todo número por `fmt()` con la unidad de `t('unit.m2')` / `t('unit.m')`. No escribas texto ni números en `ui.js`, `app.js` ni `architecture.js`.
- Para añadir un texto: crea la clave en ES, PT, EN y FR (los cuatro, siempre) y úsala con `t()`. Para añadir un idioma: `LANGS`, un diccionario nuevo en `DICTS`, sus separadores en `NUM`, `coord.hemi` (hemisferios: EN usa `W`), y la tabla `EXPECT` de `tools/maqueta/i18n-test.js`.
- No se traducen: Le Petit Trianon, San Bernardino, Ruta San Bernardino – Pirayú (Ruta II), UTM 21S, GNSS RTK, los nombres de teclas (salvo `Esc`, que en FR es `Échap`) ni la ruta de la nota técnica, que existe solo en español (en PT/EN/FR el enlace lo indica y lleva `hreflang="es"`).
- Textos fuera de `i18n.js`: el `<noscript>` de `index.html` (ES, PT, EN y FR), la nota técnica (ES) y los valores por defecto de `<title>` y descripción en `index.html` (los sobrescribe `i18n.js`). La fila `M` de `help.keys` es para un módulo de música que no está en el repositorio; la interfaz la oculta si `PW.music` no existe.
- `ui.css` puede ajustar por idioma con `:root[lang="xx"]`.

## Probar

### Requisitos

- Node 22 y Playwright 1.56 instalado como paquete (`npm install -g playwright@1.56.1`), con su Chromium (`npx playwright install chromium`, build 1194). Los scripts lanzan el ejecutable `/opt/pw-browsers/chromium`; en otra máquina instala con `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright install chromium` y crea el enlace `ln -s /opt/pw-browsers/chromium-1194/chrome-linux/chrome /opt/pw-browsers/chromium`, o cambia `executablePath` en `tools/maqueta/*.js`.
- WebGL por software: los scripts arrancan Chromium con `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`, así que no hace falta GPU; cada render tarda segundos y usa toda la CPU disponible.
- El servidor local del repositorio corriendo (ver arriba). `PW_URL` (visor completo) y `PW_BASE` (harness y pruebas de interfaz) apuntan a otro servidor si hace falta.
- Python 3 con Pillow para los scripts de imágenes; `ffmpeg` para el loop; numpy y shapely solo para `finalize.py`.

Entorno de cada sesión:

```sh
export NODE_PATH=/opt/node22/lib/node_modules PATH=/opt/node22/bin:$PATH   # o donde esté tu Node 22
cd tools/maqueta
```

Cuando pueden correr varios renders a la vez (varias terminales, varios asistentes), envuelve **todo** lo que lance Playwright en `flock /tmp/pw-render.lock …`: los renders por software compiten por la CPU y, sin el cerrojo, los tiempos de espera de las pruebas fallan.

### Pruebas automáticas

```sh
flock /tmp/pw-render.lock node test-interactions.js        # visor completo: hover, clic, teclado, vistas, arrastre; 16 comprobaciones → "pass": "16/16"
flock /tmp/pw-render.lock node ui-interact-test.js         # PW.ui sin WebGL (dev/ui-test.html): chips, minimapa, teclado, ficha, ayuda, móvil; 47 aserciones, se detiene en la primera que falla
flock /tmp/pw-render.lock node i18n-test.js                # ?lang=pt|en|fr&lote=3, embed=1, view= y light=, idioma inválido; 36 comprobaciones; sale con 1 si algo falla
flock /tmp/pw-render.lock node architecture-test.js        # API y ciclo de vida de PW.architecture en el harness (luces de noche, dispose)
flock /tmp/pw-render.lock node textures-dispose-test.js    # PW.textures: memoización, espacios de color, dispose(), sprites de texto
```

Las tres primeras imprimen un JSON con cada comprobación y la lista `errors` (errores de consola y de página); las dos últimas, un JSON con `result` y `errors`. Todas deben terminar con `errors: []`. Antes de cualquier prueba, `node --check <archivo>.js` en cada archivo tocado. Capturas: `out/test-*.png` y `out/visor-{pt,en,fr}.png`.

### Capturas

```sh
flock /tmp/pw-render.lock node shot.js "mods=vegetation&view=maqueta" out/veg.png 1280 800     # harness con uno o más módulos (mods=a,b)
flock /tmp/pw-render.lock node shot-app.js out/app.png 1440 900 "PW.app.select(3)" 1800        # visor completo; el 4.º argumento se evalúa tras la carga
flock /tmp/pw-render.lock sh final-queue.sh                                                   # cola de 16 capturas de referencia → out/final-*.png (escritorio, móvil 390×844, tablet 1024×768)
```

`shot.js` imprime el HUD del harness (triángulos y draw calls); `shot-app.js` imprime `renderer.info` del visor. En escritorio el postproceso renderiza al final sobre un cuadrilátero, así que ahí `renderer.info` solo refleja ese último pase (`tri: 1, calls: 1`). Para medir el peso de la escena usa el harness (`shot.js`) o captura con un viewport de móvil (`shot-app.js out/m.png 390 844`), donde no hay postproceso; `PW.app.setDof(false)` solo apaga el desenfoque, no el compositor. `PW_NOSETTLE=1` evita que `shot-app.js` detenga las transiciones; `PW_AFTER` ajusta la espera final (ms).

Desde el navegador o desde un script, `PW.app` expone: `state` (`ready`, `view`, `selected`, `hover`, `light`, `mode`, `cotas`), `select(n|null)`, `setView(v)`, `setLight(l)`, `setMode(m)`, `setCotas(bool)`, `settle()` (termina las transiciones y fuerza un render), `pause()` / `resume()`, `screenPos(n)` (posición en pantalla del disco del lote), `setDof(bool)`, `cam` (`tTarget`, `tDist`, `tPhi`, `tTheta`, `tween`), `params`, `renderer`, `scene`, `camera`, `lots`.

### Página del desarrollo y recursos

```sh
flock /tmp/pw-render.lock node landing-test.js /le-petit-trianon/ es       # 1440×900 y 390×844: cero errores de consola, el botón inserta el iframe, chips de WhatsApp, sin scroll horizontal
python3 -I stitch.py out/raw-es-desktop out/landing-es-desktop-full.png    # cose las capturas por pantalla en una imagen de página completa
flock /tmp/pw-render.lock node poster.js lista.json                        # pósters del visor sin interfaz (lista JSON: out, w, h, js, wait) → jpg-optimize.py
flock /tmp/pw-render.lock node og-render.js out/og es,pt,en,fr             # tarjetas Open Graph 1200×630 desde og-trianon.html (servida en /tools/maqueta/) → png-optimize.py
flock /tmp/pw-render.lock node loop-frames.js out/frames 144 1280 720      # cuadros de una órbita de 360° → sh loop-encode.sh out/frames ../../assets/trianon-loop 24 1280
```

`landing-test.js` imprime además la lista de URLs internas de la página para comprobarlas con `curl` (en local no existen los `.html` sin extensión: usa siempre rutas con `/` final).

## Páginas de prueba (`dev/`)

Todas llevan `noindex`, cargan los módulos con rutas relativas (`../i18n.js`, `../data.js`…) y exponen `window.PW_READY`, una promesa que resuelve cuando lo pedido está construido.

- `harness.html?mods=textures,vegetation&view=maqueta|ruta|plano|lote|fondo&mode=parque|bosque&night=0|1&lot=N` — escena mínima (terreno con relieve, lotes planos, calle) más los módulos listados, cargados desde `../<mod>.js`; HUD con triángulos y draw calls. `PW_READY` resuelve con `[{ m, h }]` (nombre y handle de cada módulo).
- `architecture-test.html` — el mismo harness con cámara libre: `cam=x,y,z,tx,ty,tz`.
- `textures-test.html?view=grid|close&name=cobble&rep=1&night=0|1&quality=high|low` — muestrario de `PW.textures` sin datos ni terreno.
- `ui-test.html?sel=3&view=maqueta&light=atardecer&hover=2&help=1&loading=.6&nowebgl=1&toast=1&lang=pt&embed=1&bg=../out/app.png` — la interfaz sola, sin WebGL; los handlers escriben `[ui] …` en la consola.

## Presupuesto de rendimiento

Debe correr fluido en un celular de gama media. Límites: ≤ 350 k triángulos en escena, ≤ 120 draw calls por módulo, instancing obligatorio para la vegetación, texturas generadas en código (ninguna imagen externa salvo `plano-base.png`), `castShadow` solo en lo que importa. `app.js` decide la calidad al cargar: en móvil (≤ 720 px o táctil con menos de 1024 px) `quality: 'low'`, pixel ratio ≤ 1,5 (≤ 2 en escritorio), sombra del sol de 1024 px (2048 en escritorio; 4096 en `environment.js`) y sin postproceso; con `prefers-reduced-motion` las transiciones son instantáneas. El contorno luminoso del lote es el único material HDR (umbral del bloom 2,4). Mide con el harness antes y después de cada cambio y mira las capturas de `final-queue.sh` en escritorio y móvil.

## Reglas de contenido

Valen para el visor, la nota técnica y cualquier texto nuevo:

- Cero precios, honorarios, plazos, fechas de entrega, rentabilidades, promesas de aprobación. Los valores se comparten en privado por WhatsApp.
- Un solo canal de contacto: WhatsApp `https://wa.me/595993474309` con `?text=` prellenado (URL-encoded) en el idioma del visitante, que nombre el lote o la sección desde donde se escribe; enlaces con `target="_blank" rel="noopener"` y `data-wa-from`.
- Nada que no esté verificado: superficies, medidas, cotas y nombres vienen de `PW_DATA` y de la nota técnica. Lo que falta se muestra como «—» y se reporta como `[a confirmar]`; no se inventa.
- Ningún nombre de personas en código, datos, imágenes ni documentación: se firma como «el equipo de Paraways». El repositorio es público: sin notas internas.
- Disclaimers en positivo («Lo que ves es el plano de la Arquitecta Lolia Lima…», «Las medidas definitivas son las del título»).
- Sin emojis: íconos y flechas solo como SVG inline.
- Sin librerías externas, sin CDNs, sin `fetch`, sin `Math.random` (usa `PW.rng(seed)`). Lo único remoto: Google Fonts (las inyecta `ui.js`) y `/_vercel/insights/script.js`.
- Español rioplatense neutro con «tú»; PT-BR con «você»; EN sobrio; FR con «vous» y espacios finos en las cifras. El nombre es siempre **Le Petit Trianon**.

Antes de publicar, un barrido rápido de datos personales o internos sobre `le-petit-trianon/` y `tools/`:

```sh
grep -rniE '\bruc\b|padr[oó]n|matr[ií]cula\b|[a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,}|wa\.me/[0-9]+|\bcliente|/tmp/|scratchpad' le-petit-trianon tools \
  --include='*.html' --include='*.js' --include='*.css' --include='*.md' --include='*.json' --include='*.py' --include='*.sh' \
  | grep -vE 'wa\.me/595993474309|ricardo@paraways\.com|three\.min\.js|addons/|pw-render\.lock|^le-petit-trianon/maqueta/README\.md:[0-9]+:grep '
```

Debe devolver vacío (la última exclusión es este mismo comando). (`ricardo@paraways.com` es el correo del pie del sitio; `addons/math/SimplexNoise.js` conserva la atribución de sus autores, que forma parte de la licencia.)

## Licencias

- **three.js r158** (`three.min.js` y `addons/`): MIT, Copyright 2010–2023 Three.js Authors. Los addons son copias de `examples/jsm/` de esa versión, sin cambios propios (postprocessing, shaders, `math/SimplexNoise.js` con los créditos de sus autores originales); `addons/three.js` es el puente propio hacia el `THREE` global. Sin OrbitControls ni otros módulos de `examples/`.
- **Fuentes**: Newsreader, Inter y JetBrains Mono, servidas por Google Fonts bajo SIL Open Font License 1.1; no se incluyen en el repositorio (`ui.js` inserta el `<link>`).
- El código propio del visor y el contenido (datos del predio, textos, imágenes del plano y de la mensura) pertenecen a Paraways. El repositorio no declara por ahora una licencia abierta: consulta antes de reutilizarlo fuera de paraways.com.

## Cómo se integra en el sitio

- La página del desarrollo (`/le-petit-trianon/` y `/pt/`, `/en/`, `/fr/`) tiene un marco `figure.lpt-stage#escena[data-lpt-stage]` con un póster (`/assets/trianon-maqueta.jpg`; `trianon-maqueta-movil.jpg` hasta 720 px), un loop opcional (`<template id="lpt-loop">` con `trianon-loop.webm` / `.mp4`, solo en escritorio y sin `prefers-reduced-motion`; si los archivos no existen queda el póster) y el botón «Explorar la maqueta 3D» (`[data-lpt-open]`).
- `trianon.js` inserta el visor **solo tras un gesto del visitante** y solo en escritorio (≥ 721 px): `<iframe class="lpt-stage__frame" src="/le-petit-trianon/maqueta/?lang=xx&embed=1" title="…" loading="lazy" allow="fullscreen">`. En móvil (≤ 720 px) y sin JavaScript, el mismo enlace abre el visor a pantalla completa en la misma pestaña (`/le-petit-trianon/maqueta/?lang=xx`). Los enlaces con `data-maqueta="lote=N"` o `data-maqueta="view=plano"` recargan el iframe con esos parámetros; `[data-lpt-full]` abre el visor en pestaña nueva. Eventos de analítica: `maqueta_open` (página), `trianon_chip` (chips de WhatsApp) y, dentro del visor, `whatsapp_click` con `maqueta-<idioma>`.
- Con `embed=1` el visor no navega fuera del iframe: la marca abre el inicio del sitio con `target="_top"`, la nota técnica y WhatsApp abren en pestaña nueva.
- `vercel.json`: `X-Frame-Options: SAMEORIGIN` solo bajo `/le-petit-trianon/maqueta/` (en el resto del sitio es `DENY`), así que el visor solo puede embeberse desde paraways.com. Caché: los `.js`, `.css`, `.png` y `.jpg` del visor se sirven con `max-age=86400, stale-while-revalidate=604800` (al cambiar un archivo, la versión vieja puede verse hasta un día); `/assets/` con `max-age=604800`. `cleanUrls` y `trailingSlash` están activos: enlaza siempre con `/` final.
- Indexación: el visor, las páginas de `dev/` y la nota técnica llevan `noindex`; la página del desarrollo es la que se indexa. `tools/` y `docs/` no se despliegan (`.vercelignore`); `tools/maqueta/out/` está en `.gitignore`.
