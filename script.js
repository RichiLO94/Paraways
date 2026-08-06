/* Paraways — interacciones de la landing: reveals, parallax, formulario, analytics. */

const track = (name, data) => {
  if (window.va) window.va('event', { name, ...(data ? { data } : {}) });
};

/* ── Barra de progreso de lectura ──────────────────────────── */
const progressBar = document.querySelector('.progress');
if (progressBar) {
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ── Reveals al scroll ─────────────────────────────────────── */
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

/* ── Parallax sutil de la brújula del hero ─────────────────── */
const threadField = document.querySelector('.thread-field');
const glow = document.querySelector('.glow');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (threadField && !reducedMotion) {
  let ticking = false;
  const parallax = () => {
    const y = window.scrollY;
    threadField.style.translate = `0 ${y * -0.07}px`;
    if (glow) glow.style.translate = `0 ${y * 0.05}px`;
    ticking = false;
  };
  document.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(parallax); ticking = true; }
  }, { passive: true });
}

/* ── Formulario de consulta ────────────────────────────────── */
const form = document.querySelector('#lead-form');
const message = document.querySelector('#form-message');

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());

  submit.disabled = true;
  submit.textContent = 'Enviando…';
  message.textContent = '';
  message.classList.remove('ok');

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar la consulta.');
      message.textContent = 'Gracias. Ricardo recibió tu consulta y te responderá pronto.';
      message.classList.add('ok');
      form.reset();
      track('form_submit', data.interest || '');
    })
    .catch((error) => {
      message.textContent = error.message || 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.';
    })
    .finally(() => {
      submit.disabled = false;
      submit.innerHTML = 'Enviar consulta <span>↗</span>';
    });
});

/* ── Analytics de WhatsApp ─────────────────────────────────── */
document.querySelectorAll('a[href*="wa.me"]').forEach((a) => {
  a.addEventListener('click', () => track('whatsapp_click', a.dataset.waFrom || 'page'));
});
