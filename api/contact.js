const recipients = ['ricardo@paraways.com', 'paolo@paraways.com'];

function clean(value, limit) {
  return String(value || '').trim().slice(0, limit);
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Método no permitido.' });
  }

  const name = clean(request.body?.name, 120);
  const email = clean(request.body?.email, 254);
  const interest = clean(request.body?.interest, 120);
  const message = clean(request.body?.message, 2000);

  if (!name || !email || !interest || !/^\S+@\S+\.\S+$/.test(email)) {
    return response.status(400).json({ error: 'Completa nombre, correo y el motivo de tu consulta.' });
  }

  if (!process.env.RESEND_API_KEY) {
    return response.status(503).json({ error: 'El correo se está configurando. Escríbenos directamente por ahora.' });
  }

  const emailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Paraways <contact@paraways.com>',
      to: recipients,
      reply_to: email,
      subject: `Nueva consulta: ${name}`,
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
    console.error('Resend error', await emailResponse.text());
    return response.status(502).json({ error: 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.' });
  }

  return response.status(200).json({ ok: true });
}
