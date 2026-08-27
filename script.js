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

const FORM_TEXTS = {
  es: {
    sending: 'Enviando…',
    ok: 'Gracias. Nuestro equipo recibió tu consulta y te responderá dentro de las próximas 48 horas.',
    fail: 'No se pudo enviar la consulta. Inténtalo de nuevo o escríbenos por correo.',
    button: 'Enviar consulta <span>↗</span>',
  },
  pt: {
    sending: 'Enviando…',
    ok: 'Obrigado. Nossa equipe recebeu a sua consulta e vai responder dentro das próximas 48 horas.',
    fail: 'Não foi possível enviar a consulta. Tente novamente ou escreva para o nosso e-mail.',
    button: 'Enviar consulta <span>↗</span>',
  },
  en: {
    sending: 'Sending…',
    ok: 'Thank you. Our team has received your inquiry and will reply within 48 hours.',
    fail: 'Your inquiry could not be sent. Please try again or email us.',
    button: 'Send inquiry <span>↗</span>',
  },
};
const formText = FORM_TEXTS[document.documentElement.lang] || FORM_TEXTS.es;

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());

  submit.disabled = true;
  submit.textContent = formText.sending;
  message.textContent = '';
  message.classList.remove('ok');

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || formText.fail);
      message.textContent = formText.ok;
      message.classList.add('ok');
      form.reset();
      track('form_submit', data.interest || '');
    })
    .catch((error) => {
      message.textContent = error.message || formText.fail;
    })
    .finally(() => {
      submit.disabled = false;
      submit.innerHTML = formText.button;
    });
});

/* ── Botón flotante de WhatsApp ────────────────────────────── */
const waFloat = document.querySelector('.wa-float');
if (waFloat) {
  const toggleFloat = () => waFloat.classList.toggle('is-on', window.scrollY > 520);
  document.addEventListener('scroll', toggleFloat, { passive: true });
  toggleFloat();
}

/* ── Analytics de WhatsApp ─────────────────────────────────── */
document.querySelectorAll('a[href*="wa.me"]').forEach((a) => {
  a.addEventListener('click', () => track('whatsapp_click', a.dataset.waFrom || 'page'));
});

/* ── Glifos de fase (íconos de los servicios) ──────────────── */
const SVG_NS = 'http://www.w3.org/2000/svg';
const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
};
function svgEl(parent, name, attrs) {
  const e = document.createElementNS(SVG_NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent.appendChild(e);
  return e;
}
function svgArc(parent, cx, cy, r, a1, a2, w, color, op) {
  const [x1, y1] = polar(cx, cy, r, a1);
  const [x2, y2] = polar(cx, cy, r, a2);
  const large = (a2 - a1) % 360 > 180 ? 1 : 0;
  svgEl(parent, 'path', {
    d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
    fill: 'none', stroke: color, 'stroke-width': w, opacity: op, 'stroke-linecap': 'round',
  });
}
document.querySelectorAll('.glifo').forEach((svg) => {
  const GOLD = '#B8935A', IVORY = '#F2EDE0', WINE = '#A81E2B';
  const f = svg.dataset.fase;
  if (f === '1') {
    svgArc(svg, 60, 66, 42, 300, 60, 4, GOLD, 0.95);
    svgEl(svg, 'circle', { cx: 60, cy: 24, r: 4, fill: IVORY, opacity: 0.9 });
  } else if (f === '2') {
    svgEl(svg, 'circle', { cx: 60, cy: 60, r: 42, fill: 'none', stroke: IVORY, 'stroke-width': 2, opacity: 0.35 });
    svgArc(svg, 60, 60, 42, 0, 90, 6, GOLD, 0.95);
  } else if (f === '3') {
    svgEl(svg, 'circle', { cx: 60, cy: 60, r: 42, fill: 'none', stroke: IVORY, 'stroke-width': 2, opacity: 0.35 });
    svgArc(svg, 60, 60, 42, 0, 270, 6, GOLD, 0.95);
  } else if (f === '4') {
    svgEl(svg, 'circle', { cx: 60, cy: 60, r: 42, fill: 'none', stroke: GOLD, 'stroke-width': 5, opacity: 0.95 });
    svgEl(svg, 'circle', { cx: 60, cy: 60, r: 6, fill: WINE });
  }
});

/* ── Constelación del cierre (sección de contacto) ─────────── */
(function constellation() {
  const host = document.querySelector('.constellation');
  if (!host) return;
  const svg = svgEl(host, 'svg', { width: '100%', height: '100%', 'aria-hidden': 'true' });
  svg.style.cssText = 'position:absolute;inset:0';
  let seed = 251657;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 70; i++) {
    svgEl(svg, 'circle', {
      cx: `${(rnd() * 100).toFixed(2)}%`, cy: `${(rnd() * 100).toFixed(2)}%`,
      r: rnd() > 0.9 ? 1.4 : 0.8,
      fill: '#F2EDE0', opacity: (0.08 + rnd() * 0.22).toFixed(2),
    });
  }
  const g = svgEl(svg, 'g', { transform: 'translate(-140, 60)' });
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const [x, y] = polar(0, 0, 64 + (i % 2 ? 5 : -4), i * 45);
    pts.push([x, y]);
  }
  pts.forEach(([x1, y1], i) => {
    const [x2, y2] = pts[(i + 1) % 8];
    svgEl(g, 'line', { x1, y1, x2, y2, stroke: '#F2EDE0', 'stroke-width': 0.6, opacity: 0.28 });
  });
  pts.forEach(([x, y], i) => svgEl(g, 'circle', { cx: x, cy: y, r: i % 3 === 0 ? 2.2 : 1.6, fill: '#F2EDE0', opacity: 0.6 }));
  svgEl(g, 'circle', { cx: 0, cy: 0, r: 3, fill: '#A81E2B', opacity: 0.95 });
  svgEl(g, 'circle', { cx: 0, cy: 0, r: 9, fill: 'none', stroke: '#B8935A', 'stroke-width': 1, opacity: 0.7 });
  const place = () => {
    const w = host.clientWidth;
    g.setAttribute('transform', `translate(${w - 160}, 130)`);
  };
  place();
  window.addEventListener('resize', place, { passive: true });
})();
