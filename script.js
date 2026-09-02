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
  },
  pt: {
    sending: 'Enviando…',
    ok: 'Obrigado. Nossa equipe recebeu a sua consulta e vai responder dentro das próximas 48 horas.',
    fail: 'Não foi possível enviar a consulta. Tente novamente ou escreva para o nosso e-mail.',
  },
  en: {
    sending: 'Sending…',
    ok: 'Thank you. Our team has received your inquiry and will reply within 48 hours.',
    fail: 'Your inquiry could not be sent. Please try again or email us.',
  },
  fr: {
    sending: 'Envoi en cours…',
    ok: 'Merci. Notre équipe a bien reçu votre demande et vous répondra sous 48 heures.',
    fail: "Votre demande n'a pas pu être envoyée. Réessayez, ou écrivez-nous par e-mail.",
  },
};
const formText = FORM_TEXTS[document.documentElement.lang] || FORM_TEXTS.es;

/* Textos de interfaz por página (FAB y diagnóstico) — JSON embebido en cada HTML. */
const PW_I18N = (() => {
  try { return JSON.parse(document.querySelector('#pw-i18n')?.textContent || '{}'); }
  catch { return {}; }
})();

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  const submitHTML = submit.innerHTML;
  const data = Object.fromEntries(new FormData(form).entries());

  submit.disabled = true;
  submit.style.minWidth = `${submit.getBoundingClientRect().width}px`; /* el botón no se encoge mientras envía */
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
      submit.style.minWidth = '';
      submit.innerHTML = submitHTML;
    });
});

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

/* ═══ Materia y Luz — capa cinemática ══════════════════════════ */

/* ── Nav de vidrio líquido ─────────────────────────────────── */
const topNav = document.querySelector('.top-nav');
if (topNav) {
  const navHost = topNav.parentElement;
  let glassOn = false;
  const glassToggle = () => {
    const on = window.scrollY > window.innerHeight * 1.15;
    if (on !== glassOn) {
      /* Reserva el alto que el nav ocupaba en flujo (medido antes de fijarlo) para que la página no salte. */
      navHost.style.paddingTop = on ? `${topNav.offsetHeight}px` : '';
      glassOn = on;
      topNav.classList.toggle('is-glass', on);
    }
  };
  document.addEventListener('scroll', glassToggle, { passive: true });
  glassToggle();
}

/* ── Linterna de cursor en servicios ───────────────────────── */
if (!reducedMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.querySelectorAll('.service-grid article').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });
}

/* ── Polvo de oro: motas de luz en el hero ─────────────────── */
(function goldDust() {
  const hero = document.querySelector('.hero');
  if (!hero || reducedMotion) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'dust';
  canvas.setAttribute('aria-hidden', 'true');
  hero.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  const N = window.innerWidth < 720 ? 20 : 42;
  let w = 0, h = 0, inView = false, running = false, raf = 0;
  const dots = [];
  const reset = (d, anywhere) => {
    d.x = Math.random() * w;
    d.y = anywhere ? Math.random() * h : h + 8;
    d.r = 0.6 + Math.random() * 1.6;
    d.vy = 0.06 + Math.random() * 0.2;
    d.vx = -0.05 + Math.random() * 0.1;
    d.tw = Math.random() * Math.PI * 2;
    d.ts = 0.004 + Math.random() * 0.012;
  };
  const size = () => {
    w = hero.clientWidth;
    h = hero.clientHeight;
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  };
  size();
  for (let i = 0; i < N; i++) { const d = {}; reset(d, true); dots.push(d); }
  const step = () => {
    ctx.clearRect(0, 0, w, h);
    for (const d of dots) {
      d.y -= d.vy;
      d.x += d.vx;
      d.tw += d.ts;
      if (d.y < -8 || d.x < -8 || d.x > w + 8) reset(d, false);
      const a = 0.08 + 0.34 * (0.5 + Math.sin(d.tw) / 2);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(143, 109, 51, ${a.toFixed(3)})`;
      ctx.fill();
    }
    raf = requestAnimationFrame(step);
  };
  const sync = () => {
    const on = inView && !document.hidden;
    if (on && !running) { running = true; raf = requestAnimationFrame(step); }
    else if (!on && running) { running = false; cancelAnimationFrame(raf); }
  };
  const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
  io.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', size, { passive: true });
})();

/* ── Glifos de fase que se dibujan al entrar en viewport ───── */
(function glifosVivos() {
  const svgs = document.querySelectorAll('.glifo');
  if (reducedMotion || !svgs.length || !('IntersectionObserver' in window)) return;
  svgs.forEach((svg) => {
    svg.querySelectorAll('path, circle').forEach((el, i) => {
      const fill = el.getAttribute('fill');
      if (fill && fill !== 'none') {
        el.dataset.pop = '1';
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.7s 1.1s ease';
        return;
      }
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      el.style.transition = `stroke-dashoffset 1.35s ${0.15 + i * 0.2}s cubic-bezier(0.22, 1, 0.36, 1)`;
    });
  });
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.querySelectorAll('path, circle').forEach((el) => {
        if (el.dataset.pop) el.style.opacity = '';
        else el.style.strokeDashoffset = '0';
      });
      io.unobserve(entry.target);
    });
  }, { threshold: 0.5 });
  svgs.forEach((svg) => io.observe(svg));
})();

/* ── La regla del hero mide la lectura de la página ────────── */
(function reglaViva() {
  const regla = document.querySelector('.regla');
  if (!regla) return;
  const medir = () => {
    const h = document.documentElement;
    const p = h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight);
    regla.style.setProperty('--lectura', `${(2 + p * 94).toFixed(2)}%`);
  };
  document.addEventListener('scroll', medir, { passive: true });
  medir();
})();

/* ── Estrella fugaz ocasional en la banda de contacto ──────── */
if (!reducedMotion) {
  const fugazBand = document.querySelector('.contact');
  if (fugazBand) {
    let fugazVisible = false;
    new IntersectionObserver(([e]) => { fugazVisible = e.isIntersecting; }).observe(fugazBand);
    const spawnFugaz = () => {
      if (fugazVisible && !document.hidden) {
        const s = document.createElement('span');
        s.className = 'fugaz';
        s.style.top = `${8 + Math.random() * 40}%`;
        s.style.left = `${5 + Math.random() * 65}%`;
        s.addEventListener('animationend', () => s.remove());
        fugazBand.insertBefore(s, fugazBand.firstChild);
      }
      setTimeout(spawnFugaz, 18000 + Math.random() * 22000);
    };
    setTimeout(spawnFugaz, 6000 + Math.random() * 10000);
  }
}

/* ═══ Capa v2 — FAB, diagnóstico, mapa ═════════════════════════ */

/* ── FAB 3D de WhatsApp: aparece cuando el CTA del hero sale de vista ── */
(function fab() {
  const fab = document.querySelector('.fab');
  if (!fab || !('IntersectionObserver' in window)) return;
  const heroCta = document.querySelector('[data-hero-cta]');
  const stop = document.querySelector('[data-fab-stop]');
  const i18n = PW_I18N.fab || {};
  const names = PW_I18N.sections || {};
  const base = fab.getAttribute('href').split('?')[0];
  const genericHref = fab.getAttribute('href');
  let pulsed = false, compactTimer = 0;

  const onShow = () => {
    if (!pulsed) {
      pulsed = true;
      fab.classList.add('pulse'); /* dos pulsos, una sola vez por visita; el CSS espera el fade-in */
    }
    if (!compactTimer && matchMedia('(max-width: 720px)').matches) {
      compactTimer = setTimeout(() => fab.classList.add('is-compact'), 4000);
    }
  };

  if (heroCta) {
    new IntersectionObserver(([e]) => {
      const show = !e.isIntersecting && e.boundingClientRect.top < 0;
      fab.classList.toggle('is-visible', show);
      if (show) onShow();
    }, { threshold: 0.2 }).observe(heroCta);
  } else {
    const byScroll = () => {
      const show = window.scrollY > 520;
      fab.classList.toggle('is-visible', show);
      if (show) onShow();
    };
    document.addEventListener('scroll', byScroll, { passive: true });
    byScroll();
  }
  if (stop) {
    new IntersectionObserver(([e]) => {
      fab.classList.toggle('is-hidden', e.isIntersecting);
    }, { rootMargin: '0px 0px -30% 0px', threshold: 0 }).observe(stop);
  }
  /* En móvil, el FAB cede el paso a los CTAs con los que compite en pantalla. */
  if (matchMedia('(max-width: 720px)').matches) {
    const yielding = new Set();
    document.querySelectorAll('.diag-actions, .ip-actions').forEach((el) => {
      new IntersectionObserver(([e]) => {
        if (e.isIntersecting) yielding.add(el); else yielding.delete(el);
        fab.classList.toggle('is-yield', yielding.size > 0);
      }, { threshold: 0 }).observe(el);
    });
  }

  /* El mensaje prellenado nombra la sección desde la que se escribe. */
  if (i18n.text) {
    const sections = document.querySelectorAll('main section[id], header[id]');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const id = e.target.id;
        const name = names[id];
        fab.setAttribute('href', name
          ? `${base}?text=${encodeURIComponent(i18n.text.replace('{s}', name))}`
          : genericHref);
        fab.dataset.waFrom = `fab-${id}`;
      });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    sections.forEach((s) => io.observe(s));
  }
})();

/* ── Diagnóstico en 30 segundos ────────────────────────────── */
(function diagnostico() {
  const root = document.querySelector('.diag');
  const i18n = PW_I18N.diag;
  if (!root || !i18n) return;
  const card = root.querySelector('.diag-card');
  const opts = Array.from(root.querySelectorAll('.diag-opt'));
  const leadForm = document.querySelector('#lead-form');
  const KEY = 'pw_diag';
  const state = {};

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ ...state, t: Date.now() })); } catch { /* sin persistencia */ } };
  const clear = () => { try { localStorage.removeItem(KEY); } catch { /* nada */ } };
  const label = (q, v) => {
    const b = opts.find((o) => o.dataset.q === q && o.dataset.v === v);
    return b ? b.textContent.trim() : '';
  };
  const fill = (tpl) => tpl
    .replace('{nac}', label('nac', state.nac))
    .replace('{obj}', label('obj', state.obj))
    .replace('{mom}', label('mom', state.mom));

  const syncButtons = () => {
    opts.forEach((o) => o.setAttribute('aria-pressed', state[o.dataset.q] === o.dataset.v ? 'true' : 'false'));
  };

  const formFields = () => (leadForm
    ? [leadForm.querySelector('select[name="interest"]'), leadForm.querySelector('textarea[name="message"]')]
    : [null, null]);
  /* Solo escribe sobre campos vacíos o sobre lo que el propio diagnóstico escribió antes; nunca pisa texto del usuario. */
  const prefillForm = () => {
    const [select, area] = formFields();
    const interest = (i18n.interest || {})[state.obj];
    if (select && interest && (!select.value || select.value === select.dataset.pwDiag)) {
      select.value = interest;
      select.dataset.pwDiag = interest;
    }
    if (area && i18n.form) {
      const txt = fill(i18n.form);
      if (!area.value.trim() || area.value === area.dataset.pwDiag) {
        area.value = txt;
        area.dataset.pwDiag = txt;
      }
    }
  };
  const clearPrefill = () => {
    const [select, area] = formFields();
    if (select && select.value === select.dataset.pwDiag) { select.value = ''; delete select.dataset.pwDiag; }
    if (area && area.value === area.dataset.pwDiag) { area.value = ''; delete area.dataset.pwDiag; }
  };
  let completed = false;

  const render = (announce) => {
    const answered = ['nac', 'obj', 'mom'].filter((q) => state[q]).length;
    const count = card.querySelector('.diag-count');
    if (count && i18n.count) count.textContent = i18n.count.replace('{n}', answered);
    if (answered < 3) { card.classList.add('is-waiting'); return; }

    const via = (i18n.via || {})[state.obj];
    if (!via) return;
    card.querySelector('.diag-via').innerHTML = via.via;
    card.querySelector('.diag-chips').innerHTML = (via.chips || []).map((c) => `<li>${c}</li>`).join('');
    const notes = [(i18n.nac || {})[state.nac], (i18n.mom || {})[state.mom]].filter(Boolean);
    card.querySelector('.diag-notes').innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
    const wa = card.querySelector('a[href*="wa.me"]');
    if (wa && i18n.wa) {
      wa.setAttribute('href', `${wa.getAttribute('href').split('?')[0]}?text=${encodeURIComponent(fill(i18n.wa))}`);
    }
    card.classList.remove('is-waiting');
    prefillForm();
    if (announce) {
      if (!completed) {
        completed = true;
        track('diag_complete', `${state.nac}-${state.obj}-${state.mom}`);
      }
      if (matchMedia('(max-width: 900px)').matches && !reducedMotion) {
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  opts.forEach((o) => o.addEventListener('click', () => {
    state[o.dataset.q] = o.dataset.v;
    syncButtons();
    if (state.nac && state.obj && state.mom) save();
    render(true);
  }));

  root.querySelector('.diag-reset')?.addEventListener('click', () => {
    delete state.nac; delete state.obj; delete state.mom;
    clear();
    clearPrefill();
    completed = false;
    syncButtons();
    render(false);
    root.querySelector('.diag-opt')?.focus();
  });

  const saved = load();
  if (saved && saved.nac && saved.obj && saved.mom) {
    Object.assign(state, { nac: saved.nac, obj: saved.obj, mom: saved.mom });
    syncButtons();
  }
  render(false);
})();

/* ── El mapa de Paraguay se dibuja al entrar en viewport ───── */
(function mapaVivo() {
  const map = document.querySelector('.py-map');
  const path = map?.querySelector('.py-borde');
  if (!map || !path || reducedMotion || !('IntersectionObserver' in window)) return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.style.transition = 'stroke-dashoffset 2.8s cubic-bezier(0.22, 1, 0.36, 1) 0.2s';
  new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    path.style.strokeDashoffset = '0';
    io.disconnect();
  }, { threshold: 0.3 }).observe(map);
})();
