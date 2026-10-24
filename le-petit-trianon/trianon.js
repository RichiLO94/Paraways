/* Le Petit Trianon — comportamientos propios de la página del desarrollo.
   DOM puro: sin dependencias, sin fetch, sin Math.random. /script.js del sitio
   (barra de progreso, reveals, FAB, analytics) ya corre antes que este archivo.

   1. Loop de la maqueta en el marco: solo en escritorio (≥ 721 px) y sin
      prefers-reduced-motion; si los archivos no existen, queda el póster.
   2. «Explorar la maqueta 3D» y los enlaces con data-maqueta: en escritorio
      insertan el visor (iframe) dentro del marco — nunca sin un gesto del
      visitante —; en móvil (≤ 720 px) y sin JS, el enlace abre el visor a
      pantalla completa en la misma pestaña.
   3. Chips del cierre: reescriben el mensaje prellenado del único enlace de
      WhatsApp y lo muestran en claro antes de enviarlo. */
(function () {
  'use strict';

  var VIEWER = '/le-petit-trianon/maqueta/';
  var LANG = (document.documentElement.lang || 'es').slice(0, 2);
  var desktop = window.matchMedia('(min-width: 721px)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var stage = document.querySelector('[data-lpt-stage]');
  var media = stage ? stage.querySelector('.lpt-stage__media') : null;
  var status = stage ? stage.querySelector('.lpt-stage__status') : null;
  var fullLink = stage ? stage.querySelector('[data-lpt-full]') : null;
  var frame = null;
  /* Textos del marco en el idioma de la página: #pw-i18n → "stage" {title, loading, ready, switching}.
     Sin bloque (o sin JSON válido) quedan los literales en español. */
  var STAGE = (function () {
    var d = {};
    try {
      var el = document.getElementById('pw-i18n');
      d = el ? (JSON.parse(el.textContent).stage || {}) : {};
    } catch (e) { d = {}; }
    return {
      title: d.title || 'Maqueta 3D interactiva de Le Petit Trianon',
      loading: d.loading || 'Cargando la maqueta 3D…',
      ready: d.ready || 'La maqueta está abierta: arrastra para girar, toca un lote para ver su ficha.',
      switching: d.switching || 'Cambiando la vista…'
    };
  })();

  var track = function (name, data) {
    if (window.va) window.va('event', { name: name, data: data });
  };
  var viewerUrl = function (params, embed) {
    return VIEWER + '?lang=' + LANG + (embed ? '&embed=1' : '') + (params ? '&' + params : '');
  };

  /* ── 1. Loop del marco (póster como fallback) ─────────────── */
  function mountLoop() {
    var tpl = document.getElementById('lpt-loop');
    if (!tpl || !media || !desktop.matches || reduced.matches || !('content' in tpl)) return;
    var source = tpl.content.firstElementChild;
    if (!source) return;
    var video = document.importNode(source, true);
    var drop = function () {
      if (video.parentNode) video.parentNode.removeChild(video);
      stage.classList.remove('has-video');
    };
    var sources = video.querySelectorAll('source');
    if (sources.length) sources[sources.length - 1].addEventListener('error', drop);
    video.addEventListener('error', drop);
    video.addEventListener('playing', function () { stage.classList.add('has-video'); });
    media.insertBefore(video, media.querySelector('.lpt-stage__overlay'));
  }

  /* ── 2. El visor dentro del marco, tras un gesto ──────────── */
  function markLot(params) {
    var m = /(?:^|&)lote=(\d)/.exec(params || '');
    var picks = document.querySelectorAll('.lpt-pick');
    for (var i = 0; i < picks.length; i++) {
      var hit = m && picks[i].getAttribute('data-maqueta') === 'lote=' + m[1];
      if (hit) picks[i].setAttribute('aria-current', 'true');
      else picks[i].removeAttribute('aria-current');
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
  if (desktop.addEventListener) desktop.addEventListener('change', syncRoles);
  else if (desktop.addListener) desktop.addListener(syncRoles);

  /* ── 3. Chips del cierre: el mensaje, en claro, antes de enviarlo ── */
  (function chips() {
    var link = document.querySelector('[data-lpt-wa]');
    var buttons = document.querySelectorAll('.lpt-chips [data-wa-text]');
    var preview = document.querySelector('[data-lpt-preview]');
    if (!link || !buttons.length) return;
    var defaultHref = link.getAttribute('href');
    var base = defaultHref.split('?')[0];
    var defaultText = preview ? preview.textContent : '';
    var apply = function (text) {
      link.setAttribute('href', text ? base + '?text=' + encodeURIComponent(text) : defaultHref);
      if (preview) preview.textContent = text || defaultText;
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

  mountLoop();
})();
