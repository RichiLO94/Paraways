# Leads de Paraways en Slack

La web está preparada para avisar en Slack cuando llegue una consulta válida.

## Flujo

1. El visitante completa la consulta en la web.
2. Resend entrega el correo a Ricardo y Paolo.
3. La web publica en Slack un aviso con nombre, correo, interés y origen.
4. El equipo crea o califica el candidato en Sales Tracker.

## Activación posterior

Cuando elijan el canal de Slack para leads, crear un *Incoming Webhook* exclusivo para ese canal y guardarlo en Vercel como variable sensible de Production y Preview:

`SLACK_LEAD_WEBHOOK_URL`

No guardar ni publicar el URL del webhook en GitHub. El mensaje de Slack no incluye el texto libre del cliente para reducir exposición de información sensible.

## Pipeline recomendado

- Nuevo lead
- Calificar requisitos
- Consulta agendada
- Propuesta enviada
- Contratado
- En pausa / no viable

Cada lead debe tener responsable, próximo paso y fecha de seguimiento.