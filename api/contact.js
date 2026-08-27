const recipients = ['ricardo@paraways.com', 'paolo@paraways.com'];

const interestLabels = {
  residencia: 'Residencia temporaria',
  cedula: 'Cédula de identidad',
  ruc: 'RUC / alta tributaria',
  banco: 'Cuenta bancaria',
  inversion: 'Residencia por inversión',
  observatorio: 'Suscripción al Observatorio',
  otro: 'Otro',
};

function readString(value, limit, required = false) {
  if (value === undefined) return '';
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > limit) return null;
  return cleaned;
}

function containsControlCharacters(value) {
  return /[\u0000-\u001F\u007F]/.test(value);
}

async function notifySlack({ name, email, phone, interest, lang }) {
  if (!process.env.SLACK_LEAD_WEBHOOK_URL) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  const fields = [
    { type: 'mrkdwn', text: `*Nombre*\n${name}` },
    { type: 'mrkdwn', text: `*Interés*\n${interestLabels[interest]}` },
    { type: 'mrkdwn', text: `*Correo*\n${email}` },
    { type: 'mrkdwn', text: `*Origen*\nFormulario web (${lang.toUpperCase()})` },
  ];
  if (phone) fields.push({ type: 'mrkdwn', text: `*WhatsApp*\n${phone}` });

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: 'Nuevo lead · Paraways' } },
    { type: 'section', fields },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Crear o calificar el candidato en Sales Tracker.' }] },
  ];

  try {
    const slackResponse = await fetch(process.env.SLACK_LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ text: `Nuevo lead de Paraways: ${name}`, blocks }),
    });

    if (!slackResponse.ok) console.warn('Slack lead notification was rejected.');
  } catch {
    console.warn('Slack lead notification failed.');
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'Datos de consulta no válidos.' });
  }

  const name = readString(body.name, 120, true);
  const email = readString(body.email, 254, true);
  const interest = readString(body.interest, 40, true);
  const phone = readString(body.phone, 30);
  const message = readString(body.message, 2000);
  const lang = body.lang === 'pt' ? 'pt' : body.lang === 'en' ? 'en' : 'es';
  const website = readString(body.website, 200);

  if (website === null) {
    return response.status(400).json({ error: 'Datos de consulta no válidos.' });
  }

  if (website) {
    return response.status(204).end();
  }

  if (
    !name || !email || !interest || message === null || phone === null ||
    containsControlCharacters(name) || (phone && containsControlCharacters(phone)) ||
    !/^\S+@\S+\.\S+$/.test(email) || !(interest in interestLabels)
  ) {
    return response.status(400).json({ error: 'Completa nombre, correo y el motivo de tu consulta.' });
  }

  if (!process.env.RESEND_API_KEY) {
    return response.status(503).json({ error: 'El correo se está configurando. Escríbenos directamente por ahora.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: 'Paraways <contact@paraways.com>',
        to: recipients,
        reply_to: email,
        subject: `Nueva consulta (${lang.toUpperCase()}): ${name.replace(/\s+/g, ' ')}`,
        text: [
          `Nombre: ${name}`,
          `Correo: ${email}`,
          phone ? `WhatsApp: ${phone}` : null,
          `Interés: ${interestLabels[interest]}`,
          `Idioma: ${lang === 'pt' ? 'Portugués' : lang === 'en' ? 'Inglés' : 'Español'}`,
          '',
          'Mensaje:',
          message || 'Sin mensaje adicional.',
        ].filter((line) => line !== null).join('\n'),
      }),
    });

    if (!emailResponse.ok) {
      return response.status(502).json({ error: 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.' });
    }

    await notifySlack({ name, email, phone, interest, lang });
    return response.status(200).json({ ok: true });
  } catch {
    return response.status(502).json({ error: 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.' });
  } finally {
    clearTimeout(timeout);
  }
}
