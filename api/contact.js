const recipients = ['ricardo@paraways.com', 'paolo@paraways.com'];
const interests = new Set([
  'Residencia o radicación',
  'Inversión o empresa',
  'Operativa local o documentación',
  'Otro',
]);

function readString(value, limit, required = false) {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  if ((required && !cleaned) || cleaned.length > limit) return null;
  return cleaned;
}

function containsControlCharacters(value) {
  return /[\u0000-\u001F\u007F]/.test(value);
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
  const interest = readString(body.interest, 120, true);
  const message = body.message === undefined ? '' : readString(body.message, 2000);
  const website = body.website === undefined ? '' : readString(body.website, 200);

  if (website === null) {
    return response.status(400).json({ error: 'Datos de consulta no válidos.' });
  }

  if (website) {
    return response.status(204).end();
  }

  if (!name || !email || !interest || message === null || containsControlCharacters(name) || !/^\S+@\S+\.\S+$/.test(email) || !interests.has(interest)) {
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
        subject: `Nueva consulta: ${name.replace(/\s+/g, ' ')}`,
        text: [
          `Nombre: ${name}`,
          `Correo: ${email}`,
          `Interés: ${interest}`,
          '',
          'Mensaje:',
          message || 'Sin mensaje adicional.',
        ].join('\n'),
      }),
    });

    if (!emailResponse.ok) {
      return response.status(502).json({ error: 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.' });
    }

    return response.status(200).json({ ok: true });
  } catch {
    return response.status(502).json({ error: 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.' });
  } finally {
    clearTimeout(timeout);
  }
}
