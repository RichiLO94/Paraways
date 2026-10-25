/* Le Petit Trianon — comportamientos propios de la página del desarrollo (v2).
   DOM puro: sin dependencias, sin fetch, sin Math.random. /script.js del sitio
   (barra de progreso, reveals, nav de vidrio, FAB, analytics) corre antes que este archivo.

   1. La película del hero: la fuente se elige por el ancho ANTES de cargar (escritorio:
      webm/mp4 1280×720; ≤ 720 px: mp4 854×480). Sin JS, con prefers-reduced-motion o con
      ahorro de datos queda el póster. Se pausa fuera de pantalla, con la pestaña oculta y
      a pedido (botón bajo el marco, etiquetas desde #pw-i18n → film).
   2. Galería: cada foto abre un <dialog> con flechas, Esc y foco devuelto; sin JS (o sin
      <dialog>) el enlace abre la imagen. Se ve al instante la versión que la galería ya cargó y la
      grande la reemplaza cuando llega (sin velo). Etiquetas en el idioma de la página (#pw-i18n → gallery).
   3. La maqueta: «Explorar la maqueta 3D» y los enlaces con data-maqueta insertan el visor
      (iframe) en el marco en escritorio — nunca sin un gesto —; en móvil y sin JS el enlace
      abre el visor a pantalla completa. Loop del marco solo en escritorio y sin reduced-motion, y
      recién cuando el marco se acerca: no compite con la película del hero.
   4. Chips del cierre: reescriben el mensaje prellenado del WhatsApp. */
(function () {
  'use strict';

  var VIEWER = '/le-petit-trianon/maqueta/';
  var LANG = (document.documentElement.lang || 'es').slice(0, 2);
  var desktop = window.matchMedia('(min-width: 721px)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var I18N = (function () {
    try {
      var el = document.getElementById('pw-i18n');
      return el ? JSON.parse(el.textContent) : {};
    } catch (e) { return {}; }
  })();
  var track = function (name, data) {
    if (window.va) window.va('event', { name: name, data: data });
  };
  var onChange = function (mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  };

  /* ── 1. La película del hero ─────────────────────────────── */
  (function film() {
    var video = document.querySelector('[data-lpt2-film]');
    if (!video) return;
    var toggle = document.querySelector('[data-lpt2-film-toggle]');
    var F = I18N.film || {};
    var LABEL = { pause: F.pause || 'Pausar el video', play: F.play || 'Reproducir el video' };
    var saveData = navigator.connection && navigator.connection.saveData;
    if (reduced.matches || saveData) return; /* queda el póster */

    /* La fuente se elige por el ancho ANTES de cargar: ninguna <source> tiene src en el HTML. */
    var mobile = !desktop.matches;
    var sources = video.querySelectorAll('source[data-src]');
    var chosen = [];
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if ((s.getAttribute('data-film') === 'movil') === mobile) {
        s.setAttribute('src', s.getAttribute('data-src'));
        chosen.push(s);
      } else {
        s.parentNode.removeChild(s);
      }
    }
    if (!chosen.length) return;

    var failed = false, inView = true, played = false, userPaused = false;
    var sync = function () {
      if (failed) return;
      if (inView && !document.hidden && !reduced.matches && !userPaused) {
        var p = video.play();
        if (p && p.catch) p.catch(function () { /* autoplay bloqueado: queda el póster */ });
      } else if (!video.paused) {
        video.pause();
      }
    };
    var setToggle = function () {
      if (!toggle) return;
      toggle.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
      toggle.setAttribute('aria-label', userPaused ? LABEL.play : LABEL.pause);
    };
    chosen[chosen.length - 1].addEventListener('error', function () {
      failed = true;
      if (toggle) toggle.hidden = true;
    });
    video.addEventListener('playing', function () {
      if (toggle) toggle.hidden = false;
      if (!played) { played = true; track('trianon_film', mobile ? 'movil' : 'escritorio'); }
    });
    /* Pausa a pedido (WCAG 2.2.2): el bucle se detiene y queda detenido hasta que se reanude. */
    if (toggle) {
      setToggle();
      toggle.addEventListener('click', function () {
        userPaused = !userPaused;
        setToggle();
        sync();
      });
    }
    video.muted = true;
    video.defaultMuted = true;
    video.load();

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[entries.length - 1].isIntersecting; /* la última entrada es la vigente */
        sync();
      }, { threshold: 0.1 }).observe(video.parentNode);
    }
    document.addEventListener('visibilitychange', sync);
    onChange(reduced, function () {
      if (reduced.matches && toggle) toggle.hidden = true;
      sync();
    });
    sync();
  })();

  /* ── 2. Galería: <dialog> con flechas, Esc y foco devuelto ── */
  (function gallery() {
    var links = document.querySelectorAll('[data-lpt2-photo]');
    if (!links.length || typeof window.HTMLDialogElement !== 'function') return;
    var G = I18N.gallery || {};
    var T = {
      label: G.label || 'Fotos de la propiedad',
      close: G.close || 'Cerrar',
      prev: G.prev || 'Foto anterior',
      next: G.next || 'Foto siguiente',
      count: G.count || '{i} de {n}'
    };
    var items = Array.prototype.map.call(links, function (a) {
      var img = a.querySelector('img');
      var cap = a.parentNode.querySelector('figcaption');
      return {
        href: a.getAttribute('href'),
        srcset: img ? img.getAttribute('srcset') : '',
        alt: img ? img.getAttribute('alt') : '',
        cap: cap ? cap.innerHTML : '',
        thumb: img
      };
    });
    var arrow = function (d) {
      return '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    };

    var dlg = document.createElement('dialog');
    dlg.className = 'lpt2-lb';
    dlg.setAttribute('aria-label', T.label);
    dlg.innerHTML =
      '<div class="lpt2-lb__stage"><img class="lpt2-lb__img" alt="" decoding="async" /></div>' +
      '<div class="lpt2-lb__bar">' +
        '<p class="lpt2-lb__cap"></p>' +
        '<p class="lpt2-lb__count" aria-live="polite"></p>' +
        '<div class="lpt2-lb__nav">' +
          '<button type="button" class="lpt2-lb__btn" data-go="-1">' + arrow('M10 3.5 5.5 8l4.5 4.5') + '</button>' +
          '<button type="button" class="lpt2-lb__btn" data-go="1">' + arrow('M6 3.5 10.5 8 6 12.5') + '</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="lpt2-lb__btn lpt2-lb__close">' + arrow('M4 4l8 8M12 4l-8 8') + '</button>';
    document.body.appendChild(dlg);

    var img = dlg.querySelector('.lpt2-lb__img');
    var capEl = dlg.querySelector('.lpt2-lb__cap');
    var countEl = dlg.querySelector('.lpt2-lb__count');
    var closeBtn = dlg.querySelector('.lpt2-lb__close');
    var prevBtn = dlg.querySelector('[data-go="-1"]');
    var nextBtn = dlg.querySelector('[data-go="1"]');
    closeBtn.setAttribute('aria-label', T.close);
    prevBtn.setAttribute('aria-label', T.prev);
    nextBtn.setAttribute('aria-label', T.next);

    var SIZES = 'min(1280px, 100vw)';
    var index = 0, opener = null, turn = 0;
    var show = function (i) {
      index = (i + items.length) % items.length;
      var it = items[index];
      var mine = ++turn; /* una carga de una foto anterior no pisa a la vigente */
      var big = function () {
        if (it.srcset) img.setAttribute('srcset', it.srcset); else img.removeAttribute('srcset');
        img.setAttribute('sizes', SIZES);
        img.setAttribute('src', it.href);
      };
      img.onload = img.onerror = function () { if (mine === turn) img.classList.remove('is-loading'); };
      /* La versión que la galería ya muestra (en caché) entra al instante y sin velo; la grande se
         descarga aparte y la reemplaza cuando está lista. Si no hay ninguna cargada, velo hasta que llegue. */
      var t = it.thumb;
      var low = t && t.complete && t.naturalWidth ? t.currentSrc : '';
      if (low) {
        img.classList.remove('is-loading');
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.setAttribute('src', low);
        var pre = new Image();
        pre.onload = function () { if (mine === turn) big(); };
        if (it.srcset) { pre.sizes = SIZES; pre.srcset = it.srcset; }
        pre.src = it.href;
      } else {
        img.classList.add('is-loading');
        big();
        if (img.complete && img.naturalWidth) img.classList.remove('is-loading');
      }
      img.setAttribute('alt', it.alt);
      capEl.innerHTML = it.cap;
      countEl.textContent = T.count.replace('{i}', index + 1).replace('{n}', items.length);
    };
    var open = function (i, from) {
      opener = from || null;
      show(i);
      document.documentElement.classList.add('lpt2-lock');
      dlg.showModal();
      closeBtn.focus();
      track('trianon_foto', String(index + 1));
    };
    dlg.addEventListener('close', function () {
      document.documentElement.classList.remove('lpt2-lock');
      if (opener && opener.focus) opener.focus();
    });
    closeBtn.addEventListener('click', function () { dlg.close(); });
    prevBtn.addEventListener('click', function () { show(index - 1); });
    nextBtn.addEventListener('click', function () { show(index + 1); });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
      else if (e.key === 'Home') { e.preventDefault(); show(0); }
      else if (e.key === 'End') { e.preventDefault(); show(items.length - 1); }
    });
    /* Un toque fuera de la foto cierra; un deslizamiento horizontal cambia de foto. */
    var stageEl = dlg.querySelector('.lpt2-lb__stage');
    var x0 = null, y0 = 0, swiped = false;
    stageEl.addEventListener('pointerdown', function (e) { x0 = e.clientX; y0 = e.clientY; swiped = false; });
    stageEl.addEventListener('pointerup', function (e) {
      if (x0 === null) return;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) { swiped = true; show(index + (dx < 0 ? 1 : -1)); }
    });
    dlg.addEventListener('click', function (e) {
      if (swiped) { swiped = false; return; }
      if (e.target === dlg || e.target === stageEl) dlg.close();
    });

    Array.prototype.forEach.call(links, function (a, i) {
      a.setAttribute('aria-haspopup', 'dialog');
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;
        e.preventDefault();
        open(i, a);
      });
    });
  })();

  /* ── 3. La maqueta: el visor dentro del marco, tras un gesto ── */
  var stage = document.querySelector('[data-lpt-stage]');
  var media = stage ? stage.querySelector('.lpt-stage__media') : null;
  var status = stage ? stage.querySelector('.lpt-stage__status') : null;
  var fullLink = stage ? stage.querySelector('[data-lpt-full]') : null;
  var frame = null;
  var S = I18N.stage || {};
  var STAGE = {
    title: S.title || 'Maqueta 3D interactiva de Le Petit Trianon',
    loading: S.loading || 'Cargando la maqueta 3D…',
    ready: S.ready || 'La maqueta está abierta: arrastra para girar, toca una parcela para ver su ficha.',
    switching: S.switching || 'Cambiando la vista…'
  };
  var viewerUrl = function (params, embed) {
    return VIEWER + '?lang=' + LANG + (embed ? '&embed=1' : '') + (params ? '&' + params : '');
  };

  function mountLoop() {
    var tpl = document.getElementById('lpt-loop');
    if (!tpl || !media || !desktop.matches || reduced.matches || !('content' in tpl)) return;
    var source = tpl.content.firstElementChild;
    if (!source) return;
    var video = document.importNode(source, true);
    video.autoplay = false; /* lo arranca el observador de abajo, solo con el marco a la vista */
    video.removeAttribute('autoplay');
    var drop = function () {
      if (video.parentNode) video.parentNode.removeChild(video);
      stage.classList.remove('has-video');
    };
    var sources = video.querySelectorAll('source');
    if (sources.length) sources[sources.length - 1].addEventListener('error', drop);
    video.addEventListener('error', drop);
    video.addEventListener('playing', function () { stage.classList.add('has-video'); });
    media.insertBefore(video, media.querySelector('.lpt-stage__overlay'));
    /* el loop también descansa fuera de pantalla */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (!video.parentNode) return;
        if (entries[entries.length - 1].isIntersecting && !document.hidden) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
        else video.pause();
      }, { threshold: 0 }).observe(media);
    }
  }

  function markLot(params) {
    var m = /(?:^|&)lote=(\d)/.exec(params || '');
    var rows = document.querySelectorAll('.lpt2-lotes tbody tr');
    for (var i = 0; i < rows.length; i++) {
      var link = rows[i].querySelector('[data-maqueta]');
      var hit = !!(m && link && /(?:^|&)lote=(\d)/.exec(link.getAttribute('data-maqueta'))[1] === m[1]);
      rows[i].classList.toggle('is-current', hit);
      if (link) {
        if (hit) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      }
    }
  }

  function openStage(params) {
    if (!stage || !media) return;
    var src = viewerUrl(params, true);
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'lpt-stage__frame';
      frame.setAttribute('title', STAGE.title);
      frame.setAttribute('loading', 'lazy');
      frame.setAttribute('allow', 'fullscreen');
      frame.setAttribute('src', src);
      frame.addEventListener('load', function () {
        stage.classList.add('is-ready');
        if (status) status.textContent = STAGE.ready;
      });
      var loop = media.querySelector('.lpt-stage__loop');
      if (loop) {
        if (loop.pause) loop.pause();
        loop.parentNode.removeChild(loop);
      }
      media.appendChild(frame);
      stage.classList.add('is-live');
      if (status) status.textContent = STAGE.loading;
    } else if (frame.getAttribute('src') !== src) {
      stage.classList.remove('is-ready');
      if (status) status.textContent = STAGE.switching;
      frame.setAttribute('src', src);
    }
    if (fullLink) fullLink.setAttribute('href', viewerUrl(params, false));
    markLot(params);
    stage.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    track('maqueta_open', params || 'inicio');
  }

  var opener = function (target) {
    return target && target.closest ? target.closest('[data-lpt-open], [data-maqueta]') : null;
  };
  var wantsOtherTab = function (e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1;
  };
  document.addEventListener('click', function (e) {
    var a = opener(e.target);
    if (!a || !desktop.matches || wantsOtherTab(e)) return; /* móvil: el enlace navega al visor */
    e.preventDefault();
    openStage(a.getAttribute('data-maqueta') || '');
  });
  /* En escritorio estos enlaces actúan como botones: la barra espaciadora también los activa. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== ' ' || !desktop.matches) return;
    var a = opener(e.target);
    if (!a) return;
    e.preventDefault();
    a.click();
  });
  function syncRoles() {
    var nodes = document.querySelectorAll('[data-lpt-open], [data-maqueta]');
    for (var i = 0; i < nodes.length; i++) {
      if (desktop.matches) {
        nodes[i].setAttribute('role', 'button');
        nodes[i].setAttribute('aria-controls', 'escena');
      } else {
        nodes[i].removeAttribute('role');
        nodes[i].removeAttribute('aria-controls');
      }
    }
  }
  syncRoles();
  onChange(desktop, syncRoles);

  /* ── 4. Chips del cierre: reescriben el mensaje prellenado ── */
  (function chips() {
    var link = document.querySelector('[data-lpt-wa]');
    var buttons = document.querySelectorAll('.lpt-chips [data-wa-text]');
    if (!link || !buttons.length) return;
    var defaultHref = link.getAttribute('href');
    var base = defaultHref.split('?')[0];
    var apply = function (text) {
      link.setAttribute('href', text ? base + '?text=' + encodeURIComponent(text) : defaultHref);
    };
    Array.prototype.forEach.call(buttons, function (b) {
      b.addEventListener('click', function () {
        var wasOn = b.getAttribute('aria-pressed') === 'true';
        Array.prototype.forEach.call(buttons, function (o) { o.setAttribute('aria-pressed', 'false'); });
        if (wasOn) { apply(''); return; }
        b.setAttribute('aria-pressed', 'true');
        apply(b.getAttribute('data-wa-text'));
        track('trianon_chip', b.textContent.trim());
      });
    });
  })();

  /* El loop se monta recién cuando el marco está a ≈ 800 px de entrar en pantalla. */
  (function lazyLoop() {
    if (!stage || !media) return;
    if (!('IntersectionObserver' in window)) { mountLoop(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[entries.length - 1].isIntersecting) return;
      io.disconnect();
      if (!stage.classList.contains('is-live')) mountLoop();
    }, { rootMargin: '800px 0px' });
    io.observe(media);
  })();
})();
