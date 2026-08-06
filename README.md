# Paraways

Landing de paraways.com — residencia temporaria, cédula, RUC y cuenta bancaria en Paraguay.

## Estructura

- `index.html` — landing en español (única página)
- `styles.css` — sistema de diseño (paleta Design: bordó `#6B1018`, marfil `#F2EDE0`, oro `#B8935A`, midnight `#0B1738`; Newsreader + Inter + DM Mono)
- `script.js` — reveals cinemáticos, parallax del hero, formulario y eventos de analytics
- `api/contact.js` — endpoint serverless (Resend + Slack): nombre, correo, WhatsApp e interés
- `assets/` — marca compass + imagen OG
- `sitemap.xml`, `robots.txt`, `vercel.json`

## Analytics

El sitio carga `/_vercel/insights/script.js` y emite `whatsapp_click` y `form_submit`.
Pendiente: habilitar Web Analytics en el dashboard de Vercel (proyecto `paraways`).

## Variables de entorno (Vercel)

- `RESEND_API_KEY` — envío de correo del formulario
- `SLACK_LEAD_WEBHOOK_URL` — notificación de leads a Slack (opcional)
