# Paraways

Landing de paraways.com — residencia temporaria, cédula, RUC y cuenta bancaria en Paraguay, e Investor Pass (residencia permanente por inversión). Sitio estático en Vercel: sin framework ni paso de build; lo que está en el repositorio es lo que se sirve.

## Estructura

- `index.html` — landing en español; `pt/`, `en/`, `fr/` — la misma landing en portugués, inglés y francés
- `observatorio/` — sección editorial (`index.html`, `feed.xml`)
- `le-petit-trianon/` — página del desarrollo Le Petit Trianon (ES) con su CSS y JS propios (`trianon.css`, `trianon.js`); `pt/le-petit-trianon/`, `en/le-petit-trianon/`, `fr/le-petit-trianon/` — la página en los otros tres idiomas
- `le-petit-trianon/maqueta/` — la maqueta 3D interactiva (sub-app autónoma: three.js local, JS clásico, sin build), con su nota técnica, sus páginas de prueba (`dev/`) y su documentación (`README.md`, `CONTRACT.md`)
- `styles.css` — sistema de diseño (paleta: bordó `#6B1018`, marfil `#F2EDE0`, oro `#B8935A`, medianoche `#0B1738`; Newsreader + Inter + JetBrains Mono)
- `script.js` — barra de progreso, reveals, botón flotante de WhatsApp, nav de vidrio, formulario y eventos de analytics
- `api/contact.js` — endpoint serverless (Resend + Slack): nombre, correo, WhatsApp e interés
- `assets/` — marca, imágenes Open Graph por página e idioma (`og-*.png`) y lo de Le Petit Trianon (`trianon-*`): fotos reales de la propiedad (`trianon-foto-{casa,porton,piscina,parque}.jpg`, 1920 px, y sus `-800.jpg`), vista aérea con el límite del predio en oro (`trianon-aerea.jpg` y `-800.jpg`), película del hero sin audio (`trianon-film.mp4`/`.webm`, `trianon-film-movil.mp4`, `trianon-film-poster.jpg`), y pósters y loop de la maqueta
- `tools/maqueta/` — scripts Node/Playwright y Python de prueba y captura de la maqueta; de las fotos reales (`photo-clean.py`: cuadros del video original, limpieza de subtítulos y rótulos, gradación; `aerial-align.py`: el límite del predio sobre la aérea; `upscale.py` y `sr-photos.py`: escalado con Real-ESRGAN y exportación web); y de la película del hero (`film-build.py` con `film-frames.js` para los cuadros de la maqueta). Sus salidas van a `tools/maqueta/out/` (ignorada por git). No se despliega
- `docs/` — notas de operación. No se despliega
- `.vercelignore` — excluye `tools` y `docs` del despliegue
- `vercel.json` — `cleanUrls` y `trailingSlash` (las URLs terminan en `/`), cabeceras de seguridad (`X-Frame-Options: DENY`, salvo `SAMEORIGIN` bajo `/le-petit-trianon/maqueta/` para que la página pueda embeber la maqueta) y caché de `assets/` y de la maqueta
- `sitemap.xml`, `robots.txt`, `404.html`

## Le Petit Trianon

Desarrollo de siete lotes en San Bernardino (departamento de Cordillera) presentado con fotos y video reales de la propiedad, combinados con una maqueta 3D sobre el plano del proyecto. La página del desarrollo (`/le-petit-trianon/` y sus idiomas) muestra un póster y, tras un gesto del visitante, embebe el visor en un iframe (`/le-petit-trianon/maqueta/?lang=xx&embed=1`); en móvil abre el visor a pantalla completa.

Todo lo necesario para correr, probar y editar el visor (estructura de módulos, parámetros de URL, datos, textos en cuatro idiomas, pruebas con Playwright, presupuesto de rendimiento, reglas de contenido, licencias e integración en el sitio) está en [`le-petit-trianon/maqueta/README.md`](le-petit-trianon/maqueta/README.md); el contrato técnico de módulos y datos, en [`le-petit-trianon/maqueta/CONTRACT.md`](le-petit-trianon/maqueta/CONTRACT.md).

Para verlo en local: `python3 -m http.server 8765 --bind 127.0.0.1` desde la raíz del repositorio y abrir `http://127.0.0.1:8765/le-petit-trianon/`.

Reglas que valen para todo el sitio y también aquí: sin cifras de precio ni honorarios (los valores se comparten por WhatsApp; solo se publica el umbral legal del Investor Pass), plazos solo como estimación calificada, un solo canal de contacto (WhatsApp), ningún nombre de personas salvo el crédito de la arquitecta, sin emojis, sin librerías externas y sin datos que no estén verificados.

## Analytics

El sitio carga `/_vercel/insights/script.js` y emite `whatsapp_click` (con el origen en `data-wa-from`; desde la maqueta, `maqueta-<idioma>`), `form_submit`, `maqueta_open` y `trianon_chip`.
Pendiente: habilitar Web Analytics en el dashboard de Vercel (proyecto `paraways`).

## Variables de entorno (Vercel)

- `RESEND_API_KEY` — envío de correo del formulario
- `SLACK_LEAD_WEBHOOK_URL` — notificación de leads a Slack (opcional)
