# Le Petit Trianon · visor 3D — contrato de módulos

Directorio: `le-petit-trianon/maqueta/` (URL `/le-petit-trianon/maqueta/`; servidor local `python3 -m http.server 8765` desde la raíz del repo). Guía de uso para personas y asistentes (correr en local, parámetros de URL, pruebas, integración en el sitio, licencias): `README.md`, en este mismo directorio. Este contrato describe los módulos y los datos.
Three.js: **r158 UMD** (`window.THREE`), copia local `three.min.js`. **No hay OrbitControls ni ningún módulo de `examples/`** salvo los pases de postproceso de `addons/` (los carga `post.js` como módulo): todo lo demás se escribe con la API básica de three (Mesh, InstancedMesh, ShapeGeometry, ExtrudeGeometry, CanvasTexture, Sprite, Group…). Nada de `import`, nada de fetch, nada de CDNs: cada módulo es **un solo archivo JS clásico**, autocontenido, que se registra en `window.PW.<nombre>`.
Orden de carga en `index.html`: `i18n.js` (primero: fija el idioma de la página), `three.min.js`, `post.js` (módulo), `data.js`, `terrain.js`, `textures.js`, `vegetation.js`, `architecture.js`, `environment.js`, `ui.js`, `app.js`.

## Qué es esto
Una maqueta 3D interactiva del fraccionamiento **Le Petit Trianon** (San Bernardino, Ruta San Bernardino – Pirayú / Ruta II) con 7 lotes, calle empedrada interna con cul-de-sac, portón con portero, casa existente en el lote 1, cerco perimetral y arbolado. La geometría viene **del plano original de la arquitecta** (PDF vectorial) y no se altera. La estética une la paleta de paraways.com (bordó #6B1018, marfil #F2EDE0, oro #B8935A, oro tinta #7A5C28, medianoche #0B1738; Newsreader / Inter / JetBrains Mono) con los verdes y la luz dorada de tarde del render de la arquitecta. Público: compradores 50–65 años en móvil y escritorio. Debe correr fluido en un celular (presupuesto: ≤ 350 k triángulos en escena, ≤ 120 draw calls por módulo, instancing obligatorio para vegetación).

## Datos: `data.js` → `window.PW_DATA` (metros; plano: X al este, Y al fondo/norte)
- `site.polygon` 6 vértices (V1 esquina ruta/vendedor = (73.59,0); V2 esquina ruta/camino vecinal = (0,0); V3 (−12.45,42.05); V4 (17.84,42.43); V5 (2.65,96.04); V6 (46.09,96.02)). `site.sides[]` con `label` (cotas del plano: 75.00 / 40.00 / 30.00 / 60.00 / 45.00 / 100), `drawn`, `mid`, `n` (normal exterior). `site.ring` {outer, inner}.
- `lots[]`: `{id 1..7, polygon, area_plan, area_drawn, centroid, label (centro del círculo numérico del plano), ring {outer, inner} (anillo de 0,8 m para el contorno luminoso), sides[] {a,b,len,mid,n,calle:true si da a la calle}, bbox, frente_calle}`. `area_drawn` es la superficie calculada sobre la mensura georreferenciada: **es la que muestran la ficha, los chips y los rótulos 3D** (`ui.js`, `app.js`). `area_plan` es la tabla del plano de fraccionamiento de la arquitecta, anterior a la mensura; queda como referencia (nota técnica). `frente_calle` es aproximado (un decimal).
- `road`: `centerline` (polilínea en metros, empieza en la ruta y=−14, cruza el portón en y≈0 con x=32.62, sube el tramo recto-curvo, dobla al este con radio 7,5 y termina en el límite este en y=73.55), `ancho_calle_ns` 6.3, `ancho_calle_oeste` 7.9, `ancho_vereda` 1.5, `i_arc_start`/`i_arc_end` (índices de la curva), `calle` y `corridor` (polígonos: pavimento y pavimento+veredas), `veredas[]`, `tipo` "Calle empedrada".
- `tacuaral`: polígono (franja de tacuaras/bambú entre el lote 3 y la vereda sur del tramo del fondo).
- `front`: `strip` (área verde frente al condominio, y 0…7.6), `y_wall` 6.0 (línea del cerco/muro frontal), `gate` {x0 29.96, x1 35.34, center_x, booth {x0,x1,y0,y1} (casilla redonda del portero en el medio), lanes {entrada, salida}, label}.
- `house`: `volumes[]` {name,x0,y0,x1,y1,h,floors,pergola?} (rectángulos en metros), `pool` {x0,y0,x1,y1, deck}, `driveway` {from,to,width}, `outline` (contorno aproximado), `segments` (todas las líneas del dibujo original de la casa, para detalle opcional).
- `trees_plan` (2 árboles existentes marcados "Arbol"), `islands[]` {x, y, rx, ry, ang, nota} (isletas con cordón alrededor de esos árboles, dentro de la calzada; `island` es un campo histórico y vale null), `ruta` {lines, asfalto {y0:-7,y1:-14}, label}, `camino_vecinal` {lines, ancho 7, label}, `verde_extra[]`.
- `geo`: la mensura (fuente, equipo, `crs`, vértices medidos y en el modelo, `centroide` {E, N, lat, lon, texto}, azimut del eje X, linderos, lados del título). De aquí salen las coordenadas de la cabecera y el norte de la rosa de los vientos. No contiene nombres de personas y así debe seguir.

## Terreno y coordenadas: `terrain.js` → `PW.terrain`, `PW.palette`, `PW.rng`
- `PW.terrain.elevation(x, y)` altura del suelo (m) en coordenadas de plano. **Todo objeto apoya su base en esta altura.**
- `PW.terrain.toWorld(x, y, lift?)` → `THREE.Vector3(x, elevation+lift, −y)`. Mundo: +x este, +y arriba, −z norte.
- `PW.terrain.inside(x,y)`, `distToSite(x,y)`, `extent` {x0:-70,x1:140,y0:-60,y1:160} (rectángulo donde existe terreno).
- `PW.palette` colores (hex numéricos) de la casa y de los verdes. `PW.rng(seed)` → función aleatoria determinista (usar SIEMPRE esta; nunca Math.random).

## API de cada módulo
```js
PW.<nombre> = {
  build(ctx) { /* agrega objetos a ctx.scene */ return { update(dt, t), setMode(mode), setNight(bool), dispose() }; }
};
```
`ctx = { THREE, scene, camera, renderer, data, terrain, palette, toWorld, elevation, rng, quality:'high'|'low', shadows:true, mode:'parque'|'bosque', night:false, selectedLot:null }`.
- Todo lo tuyo cuelga de UN `THREE.Group` con `group.name = '<nombre>'` (el núcleo lo busca por nombre).
- `update(dt, t)` liviano (sin asignaciones por frame si puede evitarse). `dispose()` libera geometrías/materiales.
- Sombras: `castShadow` solo en lo que importa (árboles, casa, portón); `receiveShadow` en superficies.
- Materiales: `MeshStandardMaterial` (roughness alto, metalness 0). Colores sRGB (`new THREE.Color(hex)`); el renderer usa `outputColorSpace = SRGBColorSpace` y ACES tone mapping (exposición 1.0).
- Texturas: solo `CanvasTexture` generadas en código (no hay imágenes externas salvo `plano-base.png` que usa el núcleo). Si creas texturas, `texture.colorSpace = THREE.SRGBColorSpace` y `wrapS = wrapT = RepeatWrapping`.
- r158: `Geometry` no existe (usar BufferGeometry); `InstancedMesh` con `setMatrixAt`; `Sprite` con `SpriteMaterial`.

## Probar tu módulo
`dev/harness.html?mods=<tuModulo>&view=maqueta|ruta|plano|lote|fondo&mode=parque|bosque&night=0|1&lot=N` carga `i18n.js`, `data.js`, `terrain.js`, una escena base (terreno con relieve, lotes planos, calle) y tu archivo, y expone `window.PW_READY` (promesa que resuelve con `[{ m, h }]`: nombre y handle de cada módulo cargado). Captura y mide desde `tools/maqueta/`, con el servidor local corriendo (`python3 -m http.server 8765` en la raíz del repo):
```sh
export NODE_PATH=/opt/node22/lib/node_modules PATH=/opt/node22/bin:$PATH
cd tools/maqueta
flock /tmp/pw-render.lock node shot.js "mods=<tuModulo>&view=maqueta" out/<tuModulo>-maqueta.png 1280 800   # harness
flock /tmp/pw-render.lock node shot-app.js out/app.png 1440 900 "PW.app.select(3)"                          # visor completo
```
Los dos imprimen errores de consola, triángulos y draw calls; `out/` está ignorado por git. Mira tus capturas y corrige hasta que se vea bien en `maqueta`, `ruta` y `fondo`, de día y de noche, y en ambos modos cuando aplique. Verifica `node --check <archivo>.js`. Otras páginas de prueba: `dev/architecture-test.html` (el mismo harness con cámara libre, `cam=x,y,z,tx,ty,tz`), `dev/textures-test.html` (muestrario de `PW.textures`, sin datos ni terreno) y `dev/ui-test.html` (interfaz sin WebGL). Pruebas automáticas: `tools/maqueta/test-interactions.js` (visor completo), `ui-interact-test.js` (interfaz sin WebGL), `i18n-test.js` (idiomas y parámetros de URL), `architecture-test.js` y `textures-dispose-test.js` (API y ciclo de vida de un módulo en el harness). Requisitos, comandos completos, cola de capturas e integración en el sitio: `README.md`.

## Reglas de la casa (no negociables)
- Cero precios, honorarios, plazos, promesas de aprobación, "retornos", "pasaporte". Si escribes texto: positivo, sobrio, en español rioplatense neutro con "tú" (como paraways.com).
- No inventes datos del proyecto: superficies, medidas, nombres y cotas vienen de `PW_DATA`. Lo que no esté se muestra como «—» (clave `sheet.placeholder`) y se reporta como `[a confirmar]`.
- Nombre del proyecto: **Le Petit Trianon** (así está en el cartel del render de la arquitecta). Ubicación: San Bernardino · Ruta San Bernardino – Pirayú (Ruta II).
- Sin emojis. Sin librerías externas. Sin `Math.random`. Sin `fetch`.
- Todo texto visible o audible (DOM, aria-labels, titles, rótulos pintados en canvas) pasa por `PW.i18n.t()` y todo número por `PW.i18n.fmt()` (ver la sección «Idiomas y parámetros de URL»). Los nombres propios no se traducen.

## Entorno y diorama: `environment.js` → `PW.environment` (lo integra el núcleo; se construye DESPUÉS de los demás módulos)
- `build(ctx)` → `{ setView(name, instant), setLight(mode, instant), update(dt, t), settle(), refresh(), setMode(), setNight(), dispose(), focus, center, footprint, k(), isDiorama() }`. El núcleo llama `setView` en `setView()`/selección, `setLight` en `setLight()`, `refresh()` tras `veg.setMode()` y `settle()` en `app.settle()`.
- `ctx.lights = { sun, hemi, amb, cur }` (`cur` = valores interpolados de la luz del núcleo) y `ctx.view` (vista inicial) los agrega app.js.
- Hace: `scene.environment` por PMREM de un cielo procedural (dia/atardecer/noche, regenerado en las transiciones), sombra del sol 4096 (2048 en `quality:'low'`) con cámara ±80 m, y el **modo diorama** en maqueta/plano: página marfil (#F2EDE0; medianoche de noche), sin niebla ni cielo, terreno y campo lejano apagados, el predio como losa (planta = predio +7,5 m, con ruta y camino vecinal, y −27…0 incluido) con caras de corte de terreno y sombra de contacto. Fundido de 0,6 s (instantáneo con `prefers-reduced-motion`).
- Convenciones que respeta/espera de los demás módulos: los objetos del núcleo `cielo`, `estrellas`, `sol`, `terreno`, `campo-lejano`, `plano-base`, `ruta`, `banquina`, `camino-vecinal` y el material `ruta-lineas` se buscan por nombre; en `vegetation` las mallas instanciadas cuya `name` empieza por `entorno-` o `pastizal` se consideran campo abierto y sus instancias fuera de la losa se ocultan en diorama (escala 0, restauradas al salir). Todo lo que un módulo ponga fuera de la losa (más de ~7 m del predio, o al sur de y = −27) flotaría en el vacío en maqueta/plano: ubícalo adentro o nómbralo `entorno-*`.
- Postproceso (app.js `setupPost`, solo escritorio): RenderPass → SSAO (radio 1,8 m, fuerza 62 %) → Bokeh tilt-shift (solo diorama; `PW.app.setDof(false)` lo apaga) → UnrealBloom (umbral 2,4: solo el contorno luminoso HDR) → OutputPass (ACES + sRGB) → viñeta + grano fino. En SSAO/Bokeh se ocultan sprites, puntos, materiales con `alphaTest`, aditivos y transparentes sin `depthWrite`, así que las tarjetas de hojas no dejan halos de oclusión.

## Idiomas y parámetros de URL: `i18n.js` → `PW.i18n`, y `app.js`
`i18n.js` es el primer script de `index.html` (también lo cargan `dev/harness.html` y `dev/ui-test.html`; `ui.js` lanza un error claro si falta). Expone `PW.i18n = { lang, t(key, vars), fmt(n, decimals), dict, dicts, langs, paths: { home, page } }`.
- **Idioma**: `?lang=es|pt|en|fr`; por defecto `es` y cualquier otro valor cae a `es`. El idioma se fija al cargar (no hay cambio en caliente: para otro idioma se recarga con otro `lang=`). Al arrancar ajusta `<html lang>`, `<title>` y `<meta name="description">` con `meta.title` / `meta.description`. El `<noscript>` de `index.html` va en ES, PT, EN y FR.
- **Diccionarios** (claves planas, `'sheet.cta'`): ES es la fuente; PT-BR con «você»; EN sobrio; FR con «vous» y espacio fino insecable (U+202F) delante de `;` `:` y de las unidades. `t(key, vars)` sustituye `{n}`, `{k}`…; las claves que faltan en un idioma caen al ES y, si tampoco existen, devuelven la clave. Los valores que no son cadenas (listas de la ayuda, `help.keys` / `help.mouse`) se devuelven tal cual.
- **No se traducen**: Le Petit Trianon, San Bernardino, Ruta San Bernardino – Pirayú (Ruta II), UTM 21S, GNSS RTK, los nombres de las teclas (`1–7`; `Esc`, que en FR se muestra como `Échap`) y la ruta de la nota técnica, que existe solo en español (en PT/EN/FR el enlace lo indica y lleva `hreflang="es"`).
- **Formato numérico**: `fmt(5468.8157, 2)` → ES/PT `5.468,82` · EN `5,468.82` · FR `5 468,82` (U+202F como separador de miles). Las unidades se toman de `t('unit.m2')` / `t('unit.m')` (` m²` / ` m`; en FR con U+202F en lugar del espacio). `ui.js` (ficha, chips, hint flotante, cabecera) y `app.js` (rótulos 3D: superficie sobre el disco de cada lote, cotas del perímetro y del lote) usan siempre `PW.i18n.fmt`; el disco solo lleva el número del lote. Las coordenadas de la cabecera se calculan desde `geo.centroide.lat/lon` con el decimal y los hemisferios del idioma (`coord.hemi`: EN usa `W`).
- **Textos de WhatsApp** (`sheet.wa_lot`, `sheet.wa_full`) van prellenados en el idioma del visitante; los enlaces llevan `target="_blank" rel="noopener"` y `data-wa-from` (`maqueta-lote-N`, `maqueta-ficha`, `maqueta-plano`).
- **Parámetros de URL** (los lee `app.js`; `PW.app.params` expone lo aceptado):
  - `embed=1`: visor embebido en la página del desarrollo. La marca abre el inicio del sitio del idioma (`/`, `/pt/`, `/en/`, `/fr/`) con `target="_top"`; nada más navega fuera del iframe (la nota técnica y WhatsApp abren en pestaña nueva). Sin `embed`, la marca lleva a la página del desarrollo del idioma (`/le-petit-trianon/`, `/pt/le-petit-trianon/`, …) en la misma pestaña (`PW.i18n.paths`).
  - `lote=1..7`: abre con ese lote seleccionado y, salvo que `view=` pida otra, en vista `lote` (la cámara vuela desde la posición inicial).
  - `view=maqueta|plano|ruta|lote|dron` y `light=dia|atardecer|noche`: estado inicial. Sin `lote` ni `view`, entrada cinematográfica a la vista maqueta. Valores inválidos se ignoran.
- **Analítica**: `index.html` define el stub `window.va`, carga `/_vercel/insights/script.js` (defer) y un listener delegado emite `window.va('event', { name: 'whatsapp_click', data: 'maqueta-<lang>' })` al pulsar cualquier enlace `wa.me`. Sin `fetch` propio.
- **CSS por idioma**: `ui.css` puede ajustar por `:root[lang="xx"]` (hoy solo el tracking del antetítulo portugués). Capturas de control a 1440×900 con el lote 3 abierto: `tools/maqueta/out/visor-{pt,en,fr}.png` (las genera `i18n-test.js`).
