# Le Petit Trianon · visor 3D — contrato de módulos (prototipo, fuera del repositorio)

Directorio de trabajo: `/tmp/claude-0/-home-user/e46e695b-fcdf-5e85-a6ad-07719c9d20a5/scratchpad/sb/app/`
Three.js: **r158 UMD** (`window.THREE`), copia local en `../lib/three.min.js`; en producción se carga desde cdnjs. **No hay OrbitControls ni ningún módulo de `examples/`**: todo lo que necesites lo escribes tú con la API básica de three (Mesh, InstancedMesh, ShapeGeometry, ExtrudeGeometry, CanvasTexture, Sprite, Group…). Nada de `import`, nada de fetch, nada de CDNs: cada módulo es **un solo archivo JS clásico**, autocontenido, que se registra en `window.PW.<nombre>`.

## Qué es esto
Una maqueta 3D interactiva del fraccionamiento **Le Petit Trianon** (San Bernardino, Ruta San Bernardino – Pirayú / Ruta II) con 7 lotes, calle empedrada interna con cul-de-sac, portón con portero, casa modelo en el lote 1, cerco perimetral y arbolado. La geometría viene **del plano original de la arquitecta** (PDF vectorial) y no se altera. La estética une la paleta de paraways.com (bordó #6B1018, marfil #F2EDE0, oro #B8935A, oro tinta #7A5C28, medianoche #0B1738; Newsreader / Inter / JetBrains Mono) con los verdes y la luz dorada de tarde del render de la arquitecta. Público: compradores 50–65 años en móvil y escritorio. Debe correr fluido en un celular (presupuesto: ≤ 350 k triángulos en escena, ≤ 120 draw calls por módulo, instancing obligatorio para vegetación).

## Datos: `data.js` → `window.PW_DATA` (metros; plano: X al este, Y al fondo/norte)
- `site.polygon` 6 vértices (V1 esquina ruta/vendedor = (73.59,0); V2 esquina ruta/camino vecinal = (0,0); V3 (−12.45,42.05); V4 (17.84,42.43); V5 (2.65,96.04); V6 (46.09,96.02)). `site.sides[]` con `label` (cotas del plano: 75.00 / 40.00 / 30.00 / 60.00 / 45.00 / 100), `drawn`, `mid`, `n` (normal exterior). `site.ring` {outer, inner}.
- `lots[]`: `{id 1..7, polygon, area_plan (tabla de la arquitecta — es LA cifra oficial), area_drawn, centroid, label (centro del círculo numérico del plano), ring {outer, inner} (anillo de 0,8 m para el contorno luminoso), sides[] {a,b,len,mid,n,calle:true si da a la calle}, bbox, frente_calle}`.
- `road`: `centerline` (polilínea en metros, empieza en la ruta y=−14, cruza el portón en y≈0 con x=32.62, sube el tramo recto-curvo, dobla al este con radio 7,5 y termina en el límite este en y=73.55), `ancho_calle_ns` 6.3, `ancho_calle_oeste` 7.9, `ancho_vereda` 1.5, `i_arc_start`/`i_arc_end` (índices de la curva), `calle` y `corridor` (polígonos: pavimento y pavimento+veredas), `veredas[]`, `tipo` "Calle empedrada".
- `tacuaral`: polígono (franja de tacuaras/bambú entre el lote 3 y la vereda sur del tramo del fondo).
- `front`: `strip` (área verde frente al condominio, y 0…7.6), `y_wall` 6.0 (línea del cerco/muro frontal), `gate` {x0 29.96, x1 35.34, center_x, booth {x0,x1,y0,y1} (casilla redonda del portero en el medio), lanes {entrada, salida}, label}.
- `house`: `volumes[]` {name,x0,y0,x1,y1,h,floors,pergola?} (rectángulos en metros), `pool` {x0,y0,x1,y1, deck}, `driveway` {from,to,width}, `outline` (contorno aproximado), `segments` (todas las líneas del dibujo original de la casa, para detalle opcional).
- `trees_plan` (2 árboles existentes marcados "Arbol"), `island` (óvalo "Arbol" en la calle, puede ser null), `ruta` {lines, asfalto {y0:-7,y1:-14}, label}, `camino_vecinal` {lines, ancho 7, label}, `verde_extra[]`.

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
`harness.html?mods=<tuModulo>&view=maqueta|ruta|plano|lote|fondo&mode=parque|bosque&night=0|1` carga `data.js`, `terrain.js`, una escena base (terreno con relieve, lotes planos, calle) y tu archivo. Captura con:
```
cd /tmp/claude-0/-home-user/e46e695b-fcdf-5e85-a6ad-07719c9d20a5/scratchpad/sb/app
NODE_PATH=/opt/node22/lib/node_modules node shot.js "mods=<tuModulo>&view=maqueta" /tmp/claude-0/-home-user/e46e695b-fcdf-5e85-a6ad-07719c9d20a5/scratchpad/sb/out/<tuModulo>-maqueta.png
```
(imprime errores de consola, triángulos y draw calls). Mira tus capturas (Read) y corrige hasta que se vea bien en `maqueta`, `ruta` y `fondo`, de día y de noche, y en ambos modos cuando aplique. Verifica `node --check <archivo>.js`.

## Reglas de la casa (no negociables)
- Cero precios, honorarios, plazos, promesas de aprobación, "retornos", "pasaporte". Si escribes texto: positivo, sobrio, en español rioplatense neutro con "tú" (como paraways.com).
- No inventes datos del proyecto: superficies, medidas, nombres y cotas vienen de `PW_DATA`. Lo que no esté, va como `[placeholder]`.
- Nombre del proyecto: **Le Petit Trianon** (así está en el cartel del render de la arquitecta). Ubicación: San Bernardino · Ruta San Bernardino – Pirayú (Ruta II).
- Sin emojis. Sin librerías externas. Sin `Math.random`. Sin `fetch`.

## Entorno y diorama: `environment.js` → `PW.environment` (lo integra el núcleo; se construye DESPUÉS de los demás módulos)
- `build(ctx)` → `{ setView(name, instant), setLight(mode, instant), update(dt, t), settle(), refresh(), setMode(), setNight(), dispose(), focus, center, footprint, k(), isDiorama() }`. El núcleo llama `setView` en `setView()`/selección, `setLight` en `setLight()`, `refresh()` tras `veg.setMode()` y `settle()` en `app.settle()`.
- `ctx.lights = { sun, hemi, amb, cur }` (`cur` = valores interpolados de la luz del núcleo) y `ctx.view` (vista inicial) los agrega app.js.
- Hace: `scene.environment` por PMREM de un cielo procedural (dia/atardecer/noche, regenerado en las transiciones), sombra del sol 4096 (2048 en `quality:'low'`) con cámara ±80 m, y el **modo diorama** en maqueta/plano: página marfil (#F2EDE0; medianoche de noche), sin niebla ni cielo, terreno y campo lejano apagados, el predio como losa (planta = predio +7,5 m, con ruta y camino vecinal, y −27…0 incluido) con caras de corte de terreno y sombra de contacto. Fundido de 0,6 s (instantáneo con `prefers-reduced-motion`).
- Convenciones que respeta/espera de los demás módulos: los objetos del núcleo `cielo`, `estrellas`, `sol`, `terreno`, `campo-lejano`, `plano-base`, `ruta`, `banquina`, `camino-vecinal` y el material `ruta-lineas` se buscan por nombre; en `vegetation` las mallas instanciadas cuya `name` empieza por `entorno-` o `pastizal` se consideran campo abierto y sus instancias fuera de la losa se ocultan en diorama (escala 0, restauradas al salir). Todo lo que un módulo ponga fuera de la losa (más de ~7 m del predio, o al sur de y = −27) flotaría en el vacío en maqueta/plano: ubícalo adentro o nómbralo `entorno-*`.
- Postproceso (app.js `setupPost`, solo escritorio): RenderPass → SSAO (radio 1,8 m, fuerza 62 %) → Bokeh tilt-shift (solo diorama; `PW.app.setDof(false)` lo apaga) → UnrealBloom (umbral 2,4: solo el contorno luminoso HDR) → OutputPass (ACES + sRGB) → viñeta + grano fino. En SSAO/Bokeh se ocultan sprites, puntos, materiales con `alphaTest`, aditivos y transparentes sin `depthWrite`, así que las tarjetas de hojas no dejan halos de oclusión.
