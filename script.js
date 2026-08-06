const form = document.querySelector('#lead-form');
const message = document.querySelector('#form-message');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());

  submit.disabled = true;
  submit.textContent = 'Enviando…';
  message.textContent = '';

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar la consulta.');
      message.textContent = 'Gracias. Ricardo y Paolo recibieron tu consulta y te responderán pronto.';
      form.reset();
    })
    .catch((error) => {
      message.textContent = error.message || 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.';
    })
    .finally(() => {
      submit.disabled = false;
      submit.innerHTML = 'Enviar consulta <span>↗</span>';
    });
});

const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);

revealItems.forEach((item) => observer.observe(item));
