/* Paraways · Le Petit Trianon — capa de interfaz (DOM) sobre el canvas 3D.
   PW.ui.init(ctx, handlers) → { setSelected, setHover, setView, setLight, setMode, setCotas, toast, setLoading, showNoWebGL, isSheetOpen, showHelp, hideHelp, destroy }
   ctx = { data, keys?: true (teclado propio, solo cuando no hay núcleo), fonts?: false (no inyectar Google Fonts),
           embed?: true (visor embebido: la marca abre el inicio del sitio en la ventana superior) }
   handlers = { onSelect(id|null), onHover(id|null), onView(name), onLight(mode), onMode(mode), onCotas(bool), onReset(), onHelp() }
   Textos y formato numérico: PW.i18n (i18n.js, cargado antes). Sin dependencias, sin fetch, sin Math.random.
   El CSS vive en ui.css (se inyecta si la página no lo cargó). */
(function () {
  'use strict';
  window.PW = window.PW || {};
  const I = PW.i18n;
  if (!I || !I.t) throw new Error('PW.ui: falta i18n.js (debe cargarse antes de ui.js)');
  const t = I.t, fmt = I.fmt;
  const SCRIPT_DIR = (function () { const s = document.currentScript && document.currentScript.src; return s ? s.slice(0, s.lastIndexOf('/') + 1) : ''; })();
  const WA = 'https://wa.me/595993474309';
  const PROJECT = 'Le Petit Trianon';
  const FONTS_HREF = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
  const VIEWS = [
    { id: 'maqueta', label: t('view.maqueta'), icon: 'cube', title: t('view.maqueta_title') },
    { id: 'plano', label: t('view.plano'), icon: 'plan', title: t('view.plano_title') },
    { id: 'ruta', label: t('view.ruta'), icon: 'road', title: t('view.ruta_title') },
    { id: 'lote', label: t('view.lote'), icon: 'pin', title: t('view.lote_title') },
    { id: 'dron', label: t('view.dron'), icon: 'drone', title: t('view.dron_title') },
  ];
  const LIGHTS = [
    { id: 'dia', label: t('light.dia'), icon: 'sun', title: t('light.dia_title') },
    { id: 'atardecer', label: t('light.atardecer'), icon: 'sunset', title: t('light.atardecer_title') },
    { id: 'noche', label: t('light.noche'), icon: 'moon', title: t('light.noche_title') },
  ];
  const MODES = [
    { id: 'parque', label: t('mode.parque'), icon: 'tree', title: t('mode.parque_title') },
    { id: 'bosque', label: t('mode.bosque'), icon: 'forest', title: t('mode.bosque_title') },
  ];
  const KEYS = t('help.keys');
  const MOUSE = t('help.mouse');
  const LEGEND = [['#8FBF5A', t('legend.lots')], ['#7A6E62', t('legend.street')], ['#CFC4AE', t('legend.sidewalks')], ['#5E9140', t('legend.bamboo')], ['#9CC66A', t('legend.front')]];
  const NOTE = t('note');
  const USE_COPY = t('sheet.use');
  const M2 = t('unit.m2'), M = t('unit.m');
  const lotName = n => t('lot.n', { n });
  const lotArea = l => lotName(l.id) + ' · ' + fmt(l.area_drawn, 2) + M2;
  const ICONS = {
    note: '<path d="M6.2 12.6V3.4l7.2-1.6v8.6"/><circle cx="4.2" cy="12.6" r="2"/><circle cx="11.4" cy="10.4" r="2"/>',
    cube: '<path d="M8 1.8 14 5.1v5.8L8 14.2 2 10.9V5.1z"/><path d="M8 8.1 14 5.1M8 8.1 2 5.1M8 8.1v6.1"/>',
    plan: '<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M2 7.5h12M7.5 2v12"/>',
    road: '<path d="M4.3 14 6.3 2M11.7 14 9.7 2M8 3.2v2M8 7.2v2M8 11.2v2"/>',
    pin: '<path d="M8 14.3s4.6-4.1 4.6-7.8a4.6 4.6 0 0 0-9.2 0C3.4 10.2 8 14.3 8 14.3z"/><circle cx="8" cy="6.5" r="1.6"/>',
    drone: '<path d="M2.5 2.5h3M2.5 2.5v3M13.5 2.5h-3M13.5 2.5v3M2.5 13.5h3M2.5 13.5v-3M13.5 13.5h-3M13.5 13.5v-3M4 4l2.3 2.3M12 4 9.7 6.3M4 12l2.3-2.3M12 12l-2.3-2.3"/><rect x="6.3" y="6.3" width="3.4" height="3.4" rx=".8"/>',
    sun: '<circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
    sunset: '<path d="M4.5 10.5a3.5 3.5 0 0 1 7 0"/><path d="M1.5 10.5h13M8 2.5v2M3.4 5l1.2 1.2M12.6 5l-1.2 1.2M4 13.5h8"/>',
    moon: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>',
    tree: '<path d="M8 14.5v-3.2"/><path d="M8 1.8 4.3 7.2h2.2L3.8 11.3h8.4L9.5 7.2h2.2z"/>',
    forest: '<path d="M4.5 14.5v-2.4M11 14.5v-2.4"/><path d="M4.5 4.6 2 8.6h1.3L1.5 12.1h6L5.7 8.6H7z"/><path d="M11 1.8 8.3 6.2h1.4L7.8 10.3h6.4L12.3 6.2h1.4z"/>',
    ruler: '<path d="M2.2 10.3 10.3 2.2l3.5 3.5-8.1 8.1z"/><path d="M5.2 7.3l1.3 1.3M7.3 5.2l1.3 1.3M9.4 3.1l1.3 1.3"/>',
    close: '<path d="M4 4l8 8M12 4l-8 8"/>',
    north: '<path d="M8 2.5v11M8 2.5 5.2 6.3M8 2.5l2.8 3.8"/>',
    chevL: '<path d="M10 3 5 8l5 5"/>',
    chevR: '<path d="M6 3l5 5-5 5"/>',
    wa: '<path d="M8 1.8a6.2 6.2 0 0 0-5.3 9.4L2 14.2l3.1-.8A6.2 6.2 0 1 0 8 1.8z"/><path d="M5.9 5.6c.2-.4.4-.4.6-.4h.4c.1 0 .3 0 .4.3l.5 1.2c0 .1 0 .3-.1.4l-.4.5c-.1.1-.1.2 0 .4.3.5.9 1.3 1.9 1.7.2.1.3 0 .4-.1l.5-.6c.1-.2.3-.1.4-.1l1.2.6c.2.1.3.2.3.3 0 .2 0 .7-.3 1-.3.3-1 .6-1.4.5-1.6-.2-3.6-1.9-4.3-3.6-.3-.7 0-1.6.3-2.1z"/>',
  };

  /* ── utilidades ── */
  function icon(name, cls) { return '<svg class="pw-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'; }
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'html') n.innerHTML = v; else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    if (children != null) (Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  /* coordenadas del centro del predio en grados, minutos y segundos (un decimal), con los hemisferios del idioma: "25°19′59,5″ S · 57°15′24,2″ O" */
  function dms(v, pos, neg) {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), s = (mf - m) * 60;
    return d + '°' + (m < 10 ? '0' : '') + m + '′' + fmt(s, 1) + '″ ' + (v < 0 ? neg : pos);
  }
  function coordsText(geo) {
    const c = geo && geo.centroide;
    if (c && typeof c.lat === 'number' && typeof c.lon === 'number') { const h = t('coord.hemi').split(' '); return dms(c.lat, h[0], h[1]) + ' · ' + dms(c.lon, h[2], h[3]); }
    return c && c.texto ? c.texto.replace(/\s*·\s*/, ' · ') : '—';
  }
  function markSVG(size, cls) {
    let rays = '';
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      rays += '<line class="pw-mark-ray" style="--i:' + i + '" x1="' + (20 + c * 5.6).toFixed(2) + '" y1="' + (20 + s * 5.6).toFixed(2) + '" x2="' + (20 + c * 11.6).toFixed(2) + '" y2="' + (20 + s * 11.6).toFixed(2) + '"/>';
    }
    return '<svg class="pw-mark' + (cls ? ' ' + cls : '') + '" viewBox="0 0 40 40" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false"><circle class="pw-mark-ring" cx="20" cy="20" r="16"/><g class="pw-mark-rays">' + rays + '</g><circle class="pw-mark-core" cx="20" cy="20" r="2.4"/></svg>';
  }
  function brand(size) { return '<span class="pw-brand-mark">' + markSVG(size || 22) + '</span><span class="pw-brand-word">paraways</span>'; }
  function waLink(text) { return WA + '?text=' + encodeURIComponent(text); }
  function ensureFonts() {
    if (document.querySelector('link[data-pw-fonts]')) return;
    const head = document.head;
    head.appendChild(el('link', { rel: 'preconnect', href: 'https://fonts.googleapis.com', 'data-pw-fonts': 'pre' }));
    head.appendChild(el('link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: 'anonymous', 'data-pw-fonts': 'pre2' }));
    head.appendChild(el('link', { rel: 'stylesheet', href: FONTS_HREF, 'data-pw-fonts': 'css' }));
  }
  function ensureCSS() {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (let i = 0; i < links.length; i++) if (/(^|\/)ui\.css(\?|$)/.test(links[i].getAttribute('href') || '')) return;
    document.head.appendChild(el('link', { rel: 'stylesheet', href: SCRIPT_DIR + 'ui.css', 'data-pw-css': '' }));
  }

  /* ── minimapa SVG desde PW_DATA (y del plano hacia arriba → y SVG hacia abajo) ── */
  function buildMinimap(D, on, opts) {
    const NS = 'http://www.w3.org/2000/svg';
    const s = (t, a, text) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); if (text != null) n.textContent = text; return n; };
    const pts = poly => poly.map(p => p[0].toFixed(2) + ',' + (-p[1]).toFixed(2)).join(' ');
    let xa = 1e9, xb = -1e9, ya = 1e9, yb = -1e9;
    D.site.polygon.forEach(p => { xa = Math.min(xa, p[0]); xb = Math.max(xb, p[0]); ya = Math.min(ya, p[1]); yb = Math.max(yb, p[1]); });
    const x0 = xa - 6, x1 = xb + 6, top = yb + 5, bottom = -16;
    const svg = s('svg', { viewBox: x0.toFixed(1) + ' ' + (-top).toFixed(1) + ' ' + (x1 - x0).toFixed(1) + ' ' + (top - bottom).toFixed(1), class: 'pw-map-svg', role: 'group', 'aria-label': t('map.aria') });
    /* ruta (franja de asfalto y línea central) y camino vecinal */
    const R = D.ruta && D.ruta.asfalto ? D.ruta.asfalto : { y0: -7, y1: -14 };
    svg.appendChild(s('rect', { x: x0, y: -R.y0, width: x1 - x0, height: R.y0 - R.y1, class: 'pw-map-ruta' }));
    svg.appendChild(s('line', { x1: x0, y1: -R.y0 + 2.2, x2: x1, y2: -R.y0 + 2.2, class: 'pw-map-ruta-line' }));
    const v2 = D.site.polygon[1], v3 = D.site.polygon[2];
    const dx = v3[0] - v2[0], dy = v3[1] - v2[1], L = Math.hypot(dx, dy), nx = -dy / L * 3.6, ny = dx / L * 3.6;
    svg.appendChild(s('polyline', { points: pts([[v2[0] - nx - dx / L * 2, v2[1] - ny - dy / L * 2], [v3[0] - nx + dx / L * 8, v3[1] - ny + dy / L * 8]]), class: 'pw-map-camino' }));
    svg.appendChild(s('polygon', { points: pts(D.site.polygon), class: 'pw-map-site' }));
    if (D.front && D.front.strip) svg.appendChild(s('polygon', { points: pts(D.front.strip), class: 'pw-map-verde' }));
    (D.verde_extra || []).forEach(p => svg.appendChild(s('polygon', { points: pts(p), class: 'pw-map-verde' })));
    if (D.tacuaral) svg.appendChild(s('polygon', { points: pts(D.tacuaral), class: 'pw-map-tacuaral' }));
    svg.appendChild(s('polygon', { points: pts(D.road.corridor), class: 'pw-map-vereda' }));
    svg.appendChild(s('polygon', { points: pts(D.road.calle), class: 'pw-map-calle' }));
    const lot = {}, num = {};
    D.lots.forEach(l => {
      const g = s('g', { class: 'pw-lot-g', 'data-id': l.id, role: 'button', tabindex: opts && opts.focusable ? '0' : '-1', 'aria-pressed': 'false', 'aria-label': lotArea(l) });
      const p = s('polygon', { points: pts(l.polygon), class: 'pw-lot' });
      const txt = s('text', { x: l.label[0].toFixed(2), y: (-l.label[1]).toFixed(2), dy: '.36em', class: 'pw-lot-num' }, String(l.id));
      g.appendChild(p); g.appendChild(txt); svg.appendChild(g); lot[l.id] = p; num[l.id] = txt;
      g.addEventListener('pointerenter', () => on.hover(l.id)); g.addEventListener('pointerleave', () => on.hover(null));
      g.addEventListener('click', () => on.select(l.id));
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on.select(l.id); } });
    });
    /* casa modelo: los volúmenes rectangulares del plano (más limpios que el contorno de 73 puntos a esta escala) */
    if (D.house && D.house.volumes && D.house.volumes.length) D.house.volumes.forEach(v => svg.appendChild(s('rect', { x: v.x0, y: -v.y1, width: v.x1 - v.x0, height: v.y1 - v.y0, class: 'pw-map-house' + (v.pergola ? ' pw-map-pergola' : '') })));
    else if (D.house && D.house.outline) svg.appendChild(s('polygon', { points: pts(D.house.outline), class: 'pw-map-house' }));
    if (D.house && D.house.pool) { const q = D.house.pool; svg.appendChild(s('rect', { x: q.x0, y: -q.y1, width: q.x1 - q.x0, height: q.y1 - q.y0, rx: .4, class: 'pw-map-pool' })); }
    if (D.front && D.front.gate) { const g = D.front.gate; svg.appendChild(s('line', { x1: g.x0, y1: -D.front.y_wall, x2: g.x1, y2: -D.front.y_wall, class: 'pw-map-gate' })); }
    /* nombre corto de la ruta (sin el «(Ruta II)» de la cabecera: a esta escala no entra en el ancho del plano) */
    svg.appendChild(s('text', { x: ((x0 + x1) / 2).toFixed(1), y: (-R.y1 - 1.9).toFixed(1), class: 'pw-map-label' }, t('map.route')));
    return {
      svg,
      setHover(id) { for (const k in lot) lot[k].classList.toggle('is-hover', +k === id); },
      setSelected(id) { for (const k in lot) { lot[k].classList.toggle('is-selected', +k === id); num[k].classList.toggle('is-selected', +k === id); lot[k].parentNode.setAttribute('aria-pressed', +k === id ? 'true' : 'false'); } },
    };
  }

  /* ── init ── */
  function init(ctx, handlers) {
    ctx = ctx || {};
    const D = ctx.data || window.PW_DATA;
    if (!D || !D.lots) throw new Error('PW.ui: faltan los datos (PW_DATA)');
    const H = Object.assign({ onSelect() {}, onHover() {}, onView() {}, onLight() {}, onMode() {}, onCotas() {}, onReset() {}, onHelp() {}, onMusic() {} }, handlers || {});
    const standalone = !!ctx.keys;
    const embed = !!ctx.embed;
    if (ctx.fonts !== false) ensureFonts();
    ensureCSS();
    const old = document.querySelector('.pw-ui'); if (old) old.remove();
    const LOT = {}; D.lots.forEach(l => { LOT[l.id] = l; });
    const IDS = D.lots.map(l => l.id);
    const state = { selected: null, hover: null, view: 'maqueta', light: 'atardecer', mode: 'parque', cotas: false, sheet: false, help: false };
    let kbd = false; /* última interacción: teclado → foco a la ficha al abrirla */
    const root = el('div', { class: 'pw-ui', 'data-light': state.light });

    /* (a) cabecera */
    /* superficie: la del título según la mensura georreferenciada (5.468,82 m²); si no hubiera mensura, la del plano de la arquitecta */
    const supN = (D.geo && D.geo.superficie_titulo_m2) || (D.meta && (D.meta.superficie_titulo || D.meta.superficie_plano_arquitecta));
    const sup = D.geo && D.geo.superficie_titulo_m2 ? fmt(supN, 2) : fmt(supN || 5458, 0);
    const lugar = (D.meta && D.meta.lugar) || 'San Bernardino · Ruta San Bernardino – Pirayú (Ruta II)';
    /* la ruta va en su propia línea bajo las coordenadas y su nombre no se parte (espacios duros alrededor del guion) */
    const lugarLinea = lugar.replace(/^San Bernardino · /, '').replace(/ – /g, ' – ').replace(/^Ruta San Bernardino/, 'Ruta San Bernardino');
    /* coordenadas del centro del predio: medidas (mensura) o, en su defecto, aproximadas y marcadas para verificar */
    const coords = coordsText(D.geo);
    /* tipo de entrada (decide los textos de la música) y tamaño de pantalla (decide dónde vive el botón de la nota), fijados al iniciar */
    const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
    const tactil = mq('(hover: none)') || (navigator.maxTouchPoints || 0) > 0;
    const movil = mq('(max-width: 720px)');
    /* música de fondo: index.html no carga music.js. El bloque solo se activa si existe PW.music y la interfaz se inicia con
       ctx.music === true (harness). Sin música no hay botón de la nota, ni tecla M, ni fila en la ayuda, ni avisos. */
    const musicOn = !!(ctx.music === true && PW.music && PW.music.create);
    const MUSIC_PREF = 'pw-musica';
    function musicPref(v) { try { if (v === undefined) return localStorage.getItem(MUSIC_PREF); localStorage.setItem(MUSIC_PREF, v); } catch (e) { return null; } }
    const MUSIC_LABEL = tactil ? t('music.label') : t('music.label_key');
    const MUSIC_ARMED = tactil ? t('music.armed') : t('music.armed_key');
    const MUSIC_TOAST = tactil ? t('music.toast') : t('music.toast_key');
    const MUSIC_OFF = t('music.off');
    /* el aviso de la música espera a que termine el que esté en pantalla (p. ej. «Lote N seleccionado») en vez de pisarlo */
    const musicToast = () => toast(MUSIC_TOAST, { queue: true });
    let player = null;
    if (musicOn) { try { player = PW.music.create(); } catch (e) { player = null; } }
    const musicBtn = musicOn ? el('button', { class: 'pw-music', type: 'button', 'aria-pressed': 'false', 'aria-label': MUSIC_LABEL, title: MUSIC_LABEL, html: icon('note') + '<span class="pw-music-bars" aria-hidden="true"><i></i><i></i><i></i></span>' }) : null;
    function setArmed(on) { if (!musicBtn) return; musicBtn.classList.toggle('is-armed', !!on); musicBtn.setAttribute('aria-label', on ? MUSIC_ARMED : MUSIC_LABEL); musicBtn.title = on ? MUSIC_ARMED : MUSIC_LABEL; }
    function toggleMusic() {
      if (!musicOn) return;
      if (!player) { try { player = PW.music.create(); } catch (e) { player = null; } }
      if (!player) { toast(MUSIC_OFF); return; }
      if (player.disarm) player.disarm(); setArmed(false);       /* elección explícita del visitante: ya no arranca sola */
      const on = player.toggle(); applyMusic(on); H.onMusic(on); musicPref(on ? 'on' : 'off');
      if (on) musicToast();
    }
    function applyMusic(on) { if (!musicBtn) return; musicBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); musicBtn.classList.toggle('is-on', !!on); }
    if (musicBtn) musicBtn.addEventListener('click', toggleMusic);
    if (musicOn && player && player.armAutostart && musicPref() !== 'off' && ctx.autoMusic !== false) {
      setArmed(true);
      player.armAutostart({
        ignore: e => (e.target && e.target.closest && e.target.closest('.pw-music')) || (e.type === 'keydown' && /^m$/i.test(e.key)),   /* esos dos ya pasan por toggleMusic */
        onStart() { setArmed(false); applyMusic(true); H.onMusic(true); musicToast(); },
        onFail() { setArmed(false); toast(MUSIC_OFF); },
      });
    }
    /* en móvil el botón de la nota no vive en la cabecera: va fijo arriba a la derecha (sobre la esquina del minimapa)
       para seguir a la vista cuando la ficha retira la cabecera y el minimapa */
    /* marca: embebido en la página del desarrollo abre el inicio del sitio en la ventana superior; suelto, la página del desarrollo del idioma */
    const brandLink = embed
      ? el('a', { class: 'pw-brand', href: I.paths.home, target: '_top', 'aria-label': t('brand.home'), html: brand(22) })
      : el('a', { class: 'pw-brand', href: I.paths.page, 'aria-label': t('brand.page'), html: brand(22) });
    const dot = '<span class="pw-dot">·</span>';
    const head = el('header', { class: 'pw-head pw-glass' + (movil || !musicOn ? '' : ' has-music') }, [
      movil ? null : musicBtn,
      brandLink,
      el('div', { class: 'pw-eyebrow', text: t('head.eyebrow') }),
      el('h1', { class: 'pw-title', html: 'Le Petit <em>Trianon</em>' }),
      el('div', { class: 'pw-mono pw-coords' }, [coords, el('br'), lugarLinea]),
      el('div', { class: 'pw-facts', html: t('head.area') + ' <b>' + sup + M2 + '</b>' + dot + '<b>' + t('head.lots', { n: D.lots.length }) + '</b>' + dot + t('head.street') + dot + t('head.gate') }),
    ]);

    /* (b) selector de lotes */
    const chipRows = [];
    function buildChips() {
      const row = el('div', { class: 'pw-chips pw-glass', role: 'group', 'aria-label': t('chips.aria') });
      row.appendChild(el('span', { class: 'pw-eyebrow pw-chips-label', text: t('chips.label') }));
      IDS.forEach(id => {
        const b = el('button', { class: 'pw-chip', type: 'button', 'aria-pressed': 'false', 'aria-label': lotArea(LOT[id]), title: lotArea(LOT[id]), text: String(id), 'data-id': id });
        b.addEventListener('click', () => { pickLot(id); });
        b.addEventListener('pointerenter', e => { hoverLot(id, { x: e.clientX, y: e.clientY }); });
        b.addEventListener('pointerleave', () => { hoverLot(null); });
        row.appendChild(b);
      });
      row.appendChild(el('span', { class: 'pw-mono pw-chips-hint', text: t('chips.hint') }));
      chipRows.push(row); return row;
    }
    const chips = buildChips();
    const cornerTL = el('div', { class: 'pw-corner-tl' }, [head, chips]);

    /* (c) ficha del lote */
    const sheetTitleId = 'pw-sheet-title';
    const sEyebrow = el('div', { class: 'pw-eyebrow' });
    const sTitle = el('h2', { class: 'pw-sheet-title', id: sheetTitleId });
    const sAreaNum = el('span', { class: 'pw-area-num' });
    const sFrente = el('dd'), sLados = el('dd');
    const cta = el('a', { class: 'pw-cta', target: '_blank', rel: 'noopener', 'data-wa-from': 'maqueta-lote', html: icon('wa') + '<span></span>' });
    const quiet = el('a', { class: 'pw-quiet', target: '_blank', rel: 'noopener', 'data-wa-from': 'maqueta-ficha', text: t('sheet.full'), href: waLink(t('sheet.wa_full')) });
    /* acercar la cámara al lote (vista "lote" del núcleo) */
    const zoomBtn = el('button', { class: 'pw-quiet pw-zoom', type: 'button', text: t('sheet.zoom') });
    zoomBtn.addEventListener('click', () => { applyView('lote'); H.onView('lote'); });
    const goPrev = () => { if (state.selected) pickLot(IDS[(IDS.indexOf(state.selected) - 1 + IDS.length) % IDS.length]); };
    const goNext = () => { if (state.selected) pickLot(IDS[(IDS.indexOf(state.selected) + 1) % IDS.length]); };
    /* fila inferior «‹ Lote anterior / Lote siguiente ›» (escritorio ancho) */
    const prevBtn = el('button', { type: 'button', html: icon('chevL') + '<span></span>' });
    const nextBtn = el('button', { type: 'button', html: '<span></span>' + icon('chevR') });
    prevBtn.addEventListener('click', goPrev); nextBtn.addEventListener('click', goNext);
    /* en ≤ 1200 px la misma navegación pasa a la cabecera de la ficha (dos botones redondos junto a la X), siempre a la vista
       aunque el contenido no entre; viven fuera de .pw-sheet-head para no disparar el arrastre del bottom sheet */
    const prevHB = el('button', { class: 'pw-sheet-hb', type: 'button', html: icon('chevL') });
    const nextHB = el('button', { class: 'pw-sheet-hb', type: 'button', html: icon('chevR') });
    prevHB.addEventListener('click', goPrev); nextHB.addEventListener('click', goNext);
    const headNav = el('nav', { class: 'pw-sheet-headnav', 'aria-label': t('sheet.other') }, [prevHB, nextHB]);
    const closeBtn = el('button', { class: 'pw-close', type: 'button', 'aria-label': t('sheet.close_aria'), title: t('sheet.close_title'), html: icon('close') });
    closeBtn.addEventListener('click', () => closeSheet(true));
    const handle = el('div', { class: 'pw-sheet-handle', 'aria-hidden': 'true' });
    const sheetHead = el('div', { class: 'pw-sheet-head' }, [sEyebrow, sTitle]);
    /* degradado inferior (sticky) que sugiere desplazamiento mientras quede contenido por debajo */
    const sheetFade = el('div', { class: 'pw-sheet-fade', 'aria-hidden': 'true' });
    const sheet = el('aside', { class: 'pw-sheet', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': sheetTitleId, tabindex: '-1', 'aria-hidden': 'true' }, [
      handle, closeBtn, headNav, sheetHead,
      el('div', { class: 'pw-area' }, [sAreaNum, el('span', { class: 'pw-mono', text: t('sheet.area_note') })]),
      el('dl', { class: 'pw-data' }, [el('dt', { text: t('sheet.front') }), sFrente, el('dt', { text: t('sheet.sides') }), sLados]),
      el('p', { class: 'pw-where', html: t('sheet.where') }),
      el('div', { class: 'pw-use' }, [el('div', { class: 'pw-eyebrow', text: t('sheet.use_title') }), el('p', { text: USE_COPY })]),
      cta, zoomBtn, quiet,
      el('nav', { class: 'pw-sheet-nav', 'aria-label': t('sheet.other') }, [prevBtn, nextBtn]),
      sheetFade,
    ]);
    function updateSheetFade() { sheet.classList.toggle('has-more', state.sheet && sheet.scrollHeight - sheet.clientHeight - sheet.scrollTop > 8); }
    sheet.addEventListener('scroll', updateSheetFade, { passive: true });
    sheet.addEventListener('transitionend', updateSheetFade);
    /* bottom sheet deslizable (móvil): arrastrar la cabecera hacia abajo cierra */
    (function () {
      let y0 = null, dy = 0, pid = null;
      const start = e => { if (e.pointerType === 'mouse' && window.innerWidth > 720) return; y0 = e.clientY; dy = 0; pid = e.pointerId; sheet.style.transition = 'none'; try { sheetHead.setPointerCapture(pid); } catch (err) { /* sin captura */ } };
      const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = 'translateY(' + dy + 'px)'; };
      const end = () => { if (y0 == null) return; y0 = null; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 80) closeSheet(true); };
      [handle, sheetHead].forEach(h => { h.addEventListener('pointerdown', start); h.addEventListener('pointermove', move); h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end); });
    })();
    function fillSheet(l) {
      /* en ≤ 1200 px el «Lote N ·» del antetítulo se oculta (ya lo dice el título) para dejar sitio a los botones de la cabecera */
      sEyebrow.innerHTML = '<span class="pw-sheet-eyebrow-lot">' + lotName(+l.id) + ' · </span>' + PROJECT;
      sTitle.textContent = lotName(l.id);
      sAreaNum.textContent = fmt(l.area_drawn, 2) + M2;
      sFrente.textContent = '≈ ' + fmt(l.frente_calle, 1) + M;
      const main = (l.sides || []).filter(s => s.len >= 10).map(s => fmt(s.len, 1));
      sLados.textContent = (main.length ? main.join(' · ') : t('sheet.placeholder')) + M;
      cta.lastChild.textContent = t('sheet.cta', { n: l.id });
      cta.href = waLink(t('sheet.wa_lot', { n: l.id })); cta.setAttribute('data-wa-from', 'maqueta-lote-' + l.id);
      const i = IDS.indexOf(l.id), p = IDS[(i - 1 + IDS.length) % IDS.length], n = IDS[(i + 1) % IDS.length];
      prevBtn.lastChild.textContent = lotName(p); prevBtn.setAttribute('aria-label', t('sheet.view_lot', { n: p }));
      nextBtn.firstChild.textContent = lotName(n); nextBtn.setAttribute('aria-label', t('sheet.view_lot', { n: n }));
      prevHB.setAttribute('aria-label', t('sheet.view_lot', { n: p })); prevHB.title = lotName(p);
      nextHB.setAttribute('aria-label', t('sheet.view_lot', { n: n })); nextHB.title = lotName(n);
    }
    function openSheet(id) {
      const wasOpen = state.sheet;
      fillSheet(LOT[id]); state.sheet = true; sheet.classList.add('is-open'); sheet.setAttribute('aria-hidden', 'false'); root.classList.add('is-sheet');
      if (kbd && !wasOpen) sheet.focus({ preventScroll: true });   /* solo al abrirla: no robar el foco a un botón ya enfocado */
      updateSheetFade(); requestAnimationFrame(updateSheetFade);
    }
    function closeSheet(fromUser) {
      const was = state.sheet, openId = state.selected; state.sheet = false; sheet.classList.remove('is-open'); sheet.setAttribute('aria-hidden', 'true'); root.classList.remove('is-sheet'); sheet.classList.remove('has-more');
      if (fromUser) { if (standalone) applySelected(null); H.onSelect(null); }
      if (was && sheet.contains(document.activeElement)) { const c = (openId && chipRows[0].querySelector('.pw-chip[data-id="' + openId + '"]')) || chipRows[0].querySelector('.pw-chip'); c && c.focus({ preventScroll: true }); }
    }

    /* (d) barra inferior */
    function seg(list, key, label, onPick) {
      const g = el('div', { class: 'pw-group', role: 'group', 'aria-label': label });
      g.appendChild(el('span', { class: 'pw-key', text: key, 'aria-hidden': 'true', title: t('bar.key', { k: key }) }));
      const btns = {};
      list.forEach(it => {
        const b = el('button', { class: 'pw-tb', type: 'button', 'aria-pressed': 'false', title: it.title + t('bar.key_suffix', { k: key }), html: icon(it.icon) + '<span>' + it.label + '</span>' });
        b.addEventListener('click', () => onPick(it.id)); btns[it.id] = b; g.appendChild(b);
      });
      return { node: g, set(id) { for (const k in btns) btns[k].setAttribute('aria-pressed', k === id ? 'true' : 'false'); } };
    }
    const segView = seg(VIEWS, 'V', t('bar.view'), id => { applyView(id); H.onView(id); });
    const segLight = seg(LIGHTS, 'L', t('bar.light'), id => { applyLight(id); H.onLight(id); });
    const segMode = seg(MODES, 'T', t('bar.mode'), id => { applyMode(id); H.onMode(id); });
    const cotasBtn = el('button', { class: 'pw-tb', type: 'button', 'aria-pressed': 'false', title: t('bar.cotas_title'), html: icon('ruler') + '<span>' + t('bar.cotas') + '</span>' });
    cotasBtn.addEventListener('click', () => { const on = !state.cotas; applyCotas(on); H.onCotas(on); });
    const helpBtn = el('button', { class: 'pw-tb pw-tb-help', type: 'button', 'aria-label': t('bar.help_aria'), 'aria-haspopup': 'dialog', title: t('bar.help_title'), text: '?' });
    helpBtn.addEventListener('click', () => { showHelp(); H.onHelp(); });
    const toolbar = el('div', { class: 'pw-toolbar pw-glass', role: 'toolbar', 'aria-label': t('bar.aria') }, [
      segView.node, el('span', { class: 'pw-sep' }), segLight.node, el('span', { class: 'pw-sep' }), segMode.node, el('span', { class: 'pw-sep' }),
      el('div', { class: 'pw-group', role: 'group', 'aria-label': t('bar.cotas') }, [el('span', { class: 'pw-key', text: 'C', 'aria-hidden': 'true', title: t('bar.key', { k: 'C' }) }), cotasBtn]), el('span', { class: 'pw-sep' }), helpBtn,
    ]);

    /* (e) minimapa */
    const map = buildMinimap(D, { hover: id => hoverLot(id), select: id => pickLot(id) }, { focusable: true });
    const mapCard = el('div', { class: 'pw-map pw-glass' }, [
      el('div', { class: 'pw-map-head' }, [
        /* norte: medido (mensura UTM 21S) → la flecha gira al azimut real; sin mensura, "según plano".
           Rótulo corto en una sola línea («mensura» va al title); en móvil queda solo la «N» con la flecha. La fracción ya figura en la nota al pie. */
        el('span', { class: 'pw-eyebrow pw-map-north', title: (D.geo && typeof D.geo.norte_angulo_desde_x === 'number') ? t('map.north_survey') : t('map.north_plan'),
          html: (D.geo && typeof D.geo.norte_angulo_desde_x === 'number'
            ? '<span class="pw-north-rot" style="display:inline-block;transform:rotate(' + (90 - D.geo.norte_angulo_desde_x).toFixed(1) + 'deg)">' + icon('north') + '</span><span>N<span class="pw-map-north-x">' + t('map.north_survey_x') + '</span></span>'
            : icon('north') + '<span>N<span class="pw-map-north-x">' + t('map.north_plan_x') + '</span></span>') }),
      ]),
      map.svg,
      el('p', { class: 'pw-note', text: NOTE }),
    ]);

    /* (f) leyenda */
    const legend = el('div', { class: 'pw-legend pw-glass', role: 'group', 'aria-label': t('legend.title') }, [
      el('span', { class: 'pw-eyebrow', text: t('legend.title') }),
      el('ul', null, LEGEND.map(x => el('li', null, [el('span', { class: 'pw-sw', style: 'background:' + x[0] }), x[1]]))),
    ]);

    /* (h) toast + hint flotante */
    const toastEl = el('div', { class: 'pw-toast pw-glass', role: 'status', 'aria-live': 'polite' });
    const floatEl = el('div', { class: 'pw-float', 'aria-hidden': 'true' });

    /* ayuda */
    const helpClose = el('button', { class: 'pw-close', type: 'button', 'aria-label': t('help.close'), html: icon('close') });
    helpClose.addEventListener('click', hideHelp);
    const help = el('div', { class: 'pw-help', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pw-help-title', 'aria-hidden': 'true' }, [
      el('div', { class: 'pw-help-card' }, [
        helpClose,
        el('div', { class: 'pw-eyebrow', text: t('help.eyebrow') }),
        el('h2', { class: 'pw-help-title', id: 'pw-help-title', html: t('help.title') }),
        el('div', { class: 'pw-help-grid' }, KEYS.filter(k => musicOn || k[0] !== 'M').map(k => el('div', { class: 'pw-help-row' }, [el('kbd', { text: k[0] }), k[1]]))),
        el('div', { class: 'pw-eyebrow', text: t('help.mouse_title') }),
        el('div', { class: 'pw-help-grid' }, MOUSE.map(k => el('div', { class: 'pw-help-row' }, [el('kbd', { text: k[0] }), k[1]]))),
        el('div', { class: 'pw-help-legend' }, [el('div', { class: 'pw-eyebrow', text: t('legend.title') }), el('ul', null, LEGEND.map(x => el('li', null, [el('span', { class: 'pw-sw', style: 'background:' + x[0] }), x[1]])))]),
        el('p', { class: 'pw-note pw-help-note', text: NOTE }),
        /* la nota técnica está en español; en los demás idiomas el enlace lo dice */
        el('a', { class: 'pw-quiet pw-help-link', href: 'nota-tecnica/', target: '_blank', rel: 'noopener', hreflang: 'es', text: t('help.note_link') }),
      ]),
    ]);
    help.addEventListener('click', e => { if (e.target === help) hideHelp(); });
    let helpReturn = null;
    /* mientras la ayuda está abierta, el resto de la interfaz queda inerte (foco y lectores de pantalla) */
    const inertWhileHelp = on => { [head, musicBtn, chipRows[0], sheet, toolbar, mapCard, legend].forEach(x => { if (x) x.inert = on; }); };
    function showHelp() { if (state.help) return; helpReturn = document.activeElement; state.help = true; help.classList.add('is-open'); help.setAttribute('aria-hidden', 'false'); inertWhileHelp(true); helpClose.focus({ preventScroll: true }); }
    function hideHelp() { if (!state.help) return; state.help = false; help.classList.remove('is-open'); help.setAttribute('aria-hidden', 'true'); inertWhileHelp(false); if (helpReturn && helpReturn.focus) helpReturn.focus({ preventScroll: true }); }

    /* (g) carga y fallback */
    let loading = null, loadFill = null, loadTimer = null;
    function setLoading(f) {
      if (f === false || f == null) {
        if (!loading) return;
        loadFill.style.width = '100%'; loading.classList.add('is-hidden'); loading.setAttribute('aria-busy', 'false');
        clearTimeout(loadTimer); loadTimer = setTimeout(() => { if (loading) { loading.remove(); loading = null; } }, 700);
        return;
      }
      if (!loading) {
        loadFill = el('div', { class: 'pw-loading-fill' });
        loading = el('div', { class: 'pw-loading', role: 'status', 'aria-live': 'polite', 'aria-busy': 'true' }, [
          el('div', { class: 'pw-loading-box' }, [
            el('div', { html: markSVG(72, 'pw-mark--draw') }),
            el('p', { class: 'pw-loading-text', text: t('loading.text') }),
            el('div', { class: 'pw-loading-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': t('loading.aria') }, loadFill),
            el('div', { class: 'pw-loading-wm', html: brand(14) }),
          ]),
        ]);
        root.appendChild(loading);
      }
      loading.classList.remove('is-hidden'); clearTimeout(loadTimer);
      const pct = Math.max(2, Math.min(100, Math.round((+f || 0) * 100)));
      loadFill.style.width = pct + '%'; loading.querySelector('[role=progressbar]').setAttribute('aria-valuenow', String(pct));
    }
    let nowebgl = null, map2 = null;
    function showNoWebGL() {
      setLoading(false);
      if (nowebgl) return;
      map2 = buildMinimap(D, { hover: id => hoverLot(id), select: id => pickLot(id) }, { focusable: true });
      nowebgl = el('div', { class: 'pw-nowebgl', role: 'region', 'aria-label': t('nowebgl.aria') }, [
        el('div', { class: 'pw-nowebgl-box' }, [
          el('div', { html: markSVG(44) }),
          el('div', { class: 'pw-eyebrow', text: t('nowebgl.eyebrow') }),
          el('h2', { html: t('nowebgl.title') }),
          el('p', { text: t('nowebgl.text') }),
          map2.svg, buildChips(),
          el('a', { class: 'pw-cta', target: '_blank', rel: 'noopener', 'data-wa-from': 'maqueta-plano', href: waLink(t('sheet.wa_full')), html: icon('wa') + '<span>' + t('nowebgl.cta') + '</span>' }),
          el('p', { class: 'pw-note', text: NOTE }),
        ]),
      ]);
      root.appendChild(nowebgl); root.classList.add('is-nowebgl');
      toolbar.style.display = 'none'; mapCard.style.display = 'none'; legend.style.display = 'none';
      map2.setSelected(state.selected);
    }

    /* ── estado ── */
    function applySelected(id) {
      state.selected = id;
      chipRows.forEach(r => r.querySelectorAll('.pw-chip').forEach(b => b.setAttribute('aria-pressed', +b.getAttribute('data-id') === id ? 'true' : 'false')));
      map.setSelected(id); map2 && map2.setSelected(id);
      if (id) openSheet(id); else closeSheet(false);
    }
    function applyHover(id, pos) {
      state.hover = id;
      chipRows.forEach(r => r.querySelectorAll('.pw-chip').forEach(b => b.classList.toggle('is-hover', +b.getAttribute('data-id') === id)));
      map.setHover(id); map2 && map2.setHover(id);
      if (id && pos && typeof pos.x === 'number') {
        floatEl.textContent = lotArea(LOT[id]);
        const w = floatEl.offsetWidth || 150, h = floatEl.offsetHeight || 28;
        const x = Math.min(window.innerWidth - w - 8, pos.x + 16), y = Math.min(window.innerHeight - h - 8, pos.y + 18);
        floatEl.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)'; floatEl.classList.add('is-on');
      } else floatEl.classList.remove('is-on');
    }
    function applyView(name) { state.view = name; segView.set(name); root.classList.toggle('is-plano', name === 'plano'); }
    function applyLight(mode) { state.light = mode; segLight.set(mode); root.setAttribute('data-light', mode); }
    function applyMode(mode) { state.mode = mode; segMode.set(mode); }
    /* con cotas activas el minimapa se retira (igual que en vista Plano) para que las cotas del frente queden a la vista */
    function applyCotas(on) { state.cotas = !!on; cotasBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); root.classList.toggle('is-cotas', !!on); }
    /* acciones del usuario desde la interfaz: aplican localmente y avisan al núcleo */
    function pickLot(id) { applySelected(id); H.onSelect(id); if (standalone) toast(t('toast.selected', { n: id })); }
    function hoverLot(id, pos) { applyHover(id, pos); H.onHover(id); }
    /* avisos: un solo elemento. toast(msg) reemplaza al que esté en pantalla; toast(msg, { queue: true }) espera a que
       termine el actual y, si lo pisan antes de 1,2 s, vuelve a salir después (el aviso de la música no borra «Lote N seleccionado» ni al revés) */
    let toastTimer = null, toastShown = null, toastNext = null;
    function toastShow(msg, keep) { toastEl.textContent = msg; toastEl.classList.add('is-on'); toastShown = { msg, keep: !!keep, at: Date.now() }; clearTimeout(toastTimer); toastTimer = setTimeout(toastEnd, 1800); }
    function toastEnd() { toastEl.classList.remove('is-on'); toastShown = null; if (toastNext) { const m = toastNext; toastNext = null; toastTimer = setTimeout(() => toastShow(m, true), 260); } }
    function toast(msg, o) {
      const queue = !!(o && o.queue);
      if (queue && toastShown) { toastNext = msg; return; }
      if (!queue && toastShown && toastShown.keep && Date.now() - toastShown.at < 1200 && toastShown.msg !== msg) toastNext = toastShown.msg;
      toastShow(msg, queue);
    }

    /* teclado: Esc en la ayuda siempre; el resto solo en modo autónomo (sin núcleo) */
    function onKey(e) {
      if (e.key === 'Escape' && state.help) { e.stopImmediatePropagation(); e.preventDefault(); hideHelp(); return; }
      if (e.key === 'Tab' && state.help) { /* foco encerrado en la ayuda */
        const f = help.querySelectorAll('button, [href], [tabindex="0"]'); const a = f[0], b = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); } else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
        return;
      }
      if (state.help) { e.stopImmediatePropagation(); return; }   /* con la ayuda abierta ningún atajo actúa por detrás */
      /* M: música de fondo (siempre la maneja la interfaz, haya o no núcleo 3D) */
      if (musicOn && e.key.toLowerCase() === 'm' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !(e.target && /input|textarea|select/i.test(e.target.tagName))) { e.stopImmediatePropagation(); toggleMusic(); return; }
      if (!standalone) return;
      if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
      const k = e.key, lk = k.toLowerCase();
      const cyc = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];
      if (/^[1-7]$/.test(k)) pickLot(+k);
      else if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); const i = state.selected ? IDS.indexOf(state.selected) : (k === 'ArrowRight' ? -1 : 0); pickLot(IDS[(i + (k === 'ArrowRight' ? 1 : -1) + IDS.length) % IDS.length]); }
      else if (k === 'Enter' && state.selected) openSheet(state.selected);
      else if (k === 'Escape') { if (state.sheet) closeSheet(true); }
      else if (lk === 'v') { const v = cyc(VIEWS.map(x => x.id), state.view); applyView(v); H.onView(v); }
      else if (lk === 'l') { const v = cyc(LIGHTS.map(x => x.id), state.light); applyLight(v); H.onLight(v); }
      else if (lk === 't') { const v = cyc(MODES.map(x => x.id), state.mode); applyMode(v); H.onMode(v); }
      else if (lk === 'c') { applyCotas(!state.cotas); H.onCotas(state.cotas); }
      else if (lk === 'p') { const v = state.view === 'plano' ? 'maqueta' : 'plano'; applyView(v); H.onView(v); }
      else if (lk === 'r') { applySelected(null); applyMode('parque'); applyLight('atardecer'); applyCotas(false); applyView('maqueta'); H.onReset(); }
      else if (k === '?') { showHelp(); H.onHelp(); }
    }
    const onKbd = () => { kbd = true; }, onPtr = () => { kbd = false; };
    window.addEventListener('keydown', onKey, true); window.addEventListener('keydown', onKbd, true); window.addEventListener('pointerdown', onPtr, true);
    window.addEventListener('resize', updateSheetFade);

    root.appendChild(cornerTL); root.appendChild(sheet); root.appendChild(toolbar); root.appendChild(mapCard); root.appendChild(legend);
    if (movil && musicBtn) root.appendChild(musicBtn);
    root.appendChild(toastEl); root.appendChild(floatEl); root.appendChild(help);
    document.body.appendChild(root);
    applyView(state.view); applyLight(state.light); applyMode(state.mode); applyCotas(false);

    return {
      setSelected(id) { applySelected(id == null ? null : +id); },
      setHover(id, pos) { applyHover(id == null ? null : +id, pos); },
      setView(name) { applyView(name); },
      setLight(mode) { applyLight(mode); },
      setMode(mode) { applyMode(mode); },
      setCotas(on) { applyCotas(!!on); },
      setMusic(on) { applyMusic(!!on); }, toggleMusic, isMusicOn: () => !!(player && player.isPlaying()), isMusicArmed: () => !!(player && player.isArmed && player.isArmed()),
      toast, setLoading, showNoWebGL, showHelp, hideHelp,
      isSheetOpen() { return state.sheet; },
      destroy() { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keydown', onKbd, true); window.removeEventListener('pointerdown', onPtr, true); window.removeEventListener('resize', updateSheetFade); clearTimeout(toastTimer); toastNext = null; if (player && player.disarm) player.disarm(); root.remove(); },
      root,
    };
  }

  /* Para el harness (harness.html?mods=ui): monta la interfaz sobre la escena de prueba, sin núcleo. */
  function build(ctx) {
    const q = new URLSearchParams(location.search);
    const api = init({ data: ctx.data, keys: true, fonts: location.protocol !== 'file:', embed: q.get('embed') === '1' }, {});
    api.setView(q.get('view') || 'maqueta'); api.setLight(ctx.night ? 'noche' : (q.get('light') || 'atardecer')); api.setMode(ctx.mode || 'parque');
    if (ctx.selectedLot) api.setSelected(ctx.selectedLot);
    return { update() {}, setMode: api.setMode, setNight(n) { api.setLight(n ? 'noche' : 'atardecer'); }, dispose: api.destroy, api };
  }

  PW.ui = { init, build, fmt };
})();
