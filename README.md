# Paraways

Sitio de paraways.com — residencia, inversión e instalación en Paraguay.

## Estructura

- `index.html` — página principal en español
- `pt/index.html` — versión en portugués brasilero (hreflang par), con simulador fiscal IRPF Brasil × Paraguay
- `styles.css` — sistema de diseño único (paleta Design: bordó `#6B1018`, marfil `#F2EDE0`, oro `#B8935A`, midnight `#0B1738`; Newsreader + Inter + DM Mono)
- `script.js` — wizard «Verificá tu ruta» (pre-check de elegibilidad por nacionalidad, bilingüe), formulario, reveals, eventos de analytics
- `api/contact.js` — endpoint serverless (Resend + Slack): recibe nombre, correo, WhatsApp, interés, idioma y la ruta del pre-check adjunta
- `assets/` — marca compass + imágenes OG (og-es.png / og-pt.png)
- `sitemap.xml`, `robots.txt`, `vercel.json` — SEO y headers

## Funcionalidades clave

- **Wizard de elegibilidad** (5 pasos → ruta con checklist documental, plazo, precio desde, banderas de atención y envío por WhatsApp) — ningún competidor del nicho lo ofrece
- **Simulador fiscal Brasil × Paraguay** en `/pt/` (tabla progresiva IRPF vs territorialidad paraguaya)
- **Precios publicados** («desde USD») + aranceles estatales de referencia — transparencia como diferenciador
- **Comparador Investor Pass vs golden visas europeas** (Res. MIC 0283/2026, SUACE)
- JSON-LD (LegalService + FAQPage), hreflang ES/PT, Open Graph con imágenes de marca

## Analytics

El sitio carga `/_vercel/insights/script.js` y emite eventos de funnel: `precheck_start`, `precheck_complete`, `route_card_click`, `whatsapp_click`, `form_submit`, `simulator_use`.
**Pendiente**: habilitar Web Analytics en el dashboard de Vercel (proyecto `paraways`) para que empiecen a registrarse.

## Variables de entorno (Vercel)

- `RESEND_API_KEY` — envío de correo del formulario
- `SLACK_LEAD_WEBHOOK_URL` — notificación de leads a Slack (opcional)
