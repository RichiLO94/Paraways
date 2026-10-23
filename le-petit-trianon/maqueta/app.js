/* Paraways · Le Petit Trianon — núcleo del visor 3D (escena, cámara, lotes, selección, luz, vistas).
   Depende de: three.min.js (r158 UMD), data.js (PW_DATA), terrain.js (PW.terrain/palette/rng) y, si existen,
   textures.js, vegetation.js, architecture.js, ui.js (ver CONTRACT.md). Sin librerías externas. */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') {
    /* three.js no cargó (red, bloqueador): se muestra el plano con las fichas y el WhatsApp, sin maqueta */
    const boot = () => { try { const u = window.PW && PW.ui && PW.ui.init({ data: window.PW_DATA, keys: true }, {}); u && u.showNoWebGL && u.showNoWebGL(); } catch (e) { console.warn('PW fallback', e); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    return;
  }
  const D = window.PW_DATA, T = PW.terrain, P = PW.palette;
  const app = (PW.app = {});
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = matchMedia('(max-width: 720px)').matches || ('ontouchstart' in window && innerWidth < 1024);
  const SITE_C = { x: 30, y: 48 };                 /* centro del predio (plano) */
  /* norte verdadero (mensura georreferenciada): ángulo desde +X del modelo, en grados; si falta, se asume +Y */
  const NORTH_DEG = (D.geo && typeof D.geo.norte_angulo_desde_x === 'number') ? D.geo.norte_angulo_desde_x : 90;
  /* posición del sol a partir de azimut (desde el norte, horario) y elevación, en coordenadas de mundo relativas al predio */
  function sunFrom(az, el, R) {
    const a = THREE.MathUtils.degToRad(NORTH_DEG - az), e = THREE.MathUtils.degToRad(el);
    return [Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, -Math.sin(a) * Math.cos(e) * R];
  }
  const state = { view: 'maqueta', light: 'atardecer', mode: 'parque', cotas: false, hover: null, selected: null, dron: false, ready: false };
  let renderer, scene, camera, ui, tex, veg, arch, env, sky, sunSprite, stars, sun, hemi, amb, planBase, terrainMesh, terrainMat, post = null;
  const lots = {};                                  /* id → { mesh, ring, ringMat, label, lift, dims } */
  const pickables = [];
  let perimeter, lotDims = null, clock = 0, lastT = performance.now(), running = true;

  /* ───────────── utilidades geométricas ───────────── */
  const fmt = (n, d = 2) => n.toLocaleString('es-PY', { minimumFractionDigits: d, maximumFractionDigits: d });
  function triangulate(coords) {
    const pts = coords.map(c => new THREE.Vector2(c[0], c[1]));
    if (pts.length > 1 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
    if (THREE.ShapeUtils.area(pts) < 0) pts.reverse();
    return { pts, tris: THREE.ShapeUtils.triangulateShape(pts, []) };
  }
  /* Prisma apoyado en el terreno: cara superior triangulada + paredes. uvScale: metros por tile. */
  function prism(coords, lift, thickness, uvScale) {
    const { pts, tris } = triangulate(coords);
    const pos = [], uv = [], idx = [];
    const n = pts.length;
    pts.forEach(p => { const h = T.elevation(p.x, p.y); pos.push(p.x, h + lift, -p.y); uv.push(p.x / uvScale, p.y / uvScale); });
    tris.forEach(t => idx.push(t[0], t[1], t[2]));
    let base = n;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const ha = T.elevation(a.x, a.y), hb = T.elevation(b.x, b.y), L = a.distanceTo(b) / uvScale;
      pos.push(a.x, ha + lift, -a.y, b.x, hb + lift, -b.y, b.x, hb + lift - thickness, -b.y, a.x, ha + lift - thickness, -a.y);
      uv.push(0, 1, L, 1, L, 0, 0, 0);
      idx.push(base, base + 3, base + 2, base, base + 2, base + 1); base += 4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function ringGeo(ring, lift) {
    const outer = triangulate(ring.outer).pts, inner = triangulate(ring.inner).pts.reverse();
    const shape = new THREE.Shape(outer); shape.holes.push(new THREE.Path(inner));
    const g = new THREE.ShapeGeometry(shape); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setXYZ(i, x, T.elevation(x, y) + lift, -y); }
    g.computeVertexNormals(); return g;
  }
  function lineOn(points, color, lift, opacity) {
    const arr = []; points.forEach(c => arr.push(c[0], T.elevation(c[0], c[1]) + lift, -c[1]));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity: opacity == null ? 1 : opacity }));
  }
  function canvasText(text, opt) {
    opt = opt || {}; const dpr = 2, size = opt.size || 48, pad = opt.pad == null ? 18 : opt.pad;
    const font = `${opt.italic ? 'italic ' : ''}${opt.weight || 500} ${size}px ${opt.font || 'Newsreader, Georgia, serif'}`;
    const c = document.createElement('canvas'); const x = c.getContext('2d'); x.font = font;
    const w = Math.ceil(x.measureText(text).width) + pad * 2, h = Math.ceil(size * 1.35) + pad * 2;
    c.width = w * dpr; c.height = h * dpr; x.scale(dpr, dpr);
    if (opt.disc) { x.fillStyle = opt.bg || '#F8F4E8'; x.beginPath(); x.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, Math.PI * 2); x.fill(); x.lineWidth = 3; x.strokeStyle = opt.stroke || '#6B1018'; x.stroke(); }
    else if (opt.bg) { x.fillStyle = opt.bg; const r = 8; x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, r) : x.rect(0, 0, w, h); x.fill(); }
    x.font = font; x.fillStyle = opt.color || '#6B1018'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + size * 0.04);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { texture: t, aspect: w / h };
  }
  function sprite(text, opt, scale) {
    const { texture, aspect } = canvasText(text, opt);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: opt.depthTest !== false, depthWrite: false }));
    s.scale.set(scale * aspect, scale, 1); s.renderOrder = 20; return s;
  }
  /* texto plano apoyado en el suelo; height en metros; rot = giro en el plano (rad, 0 = legible desde el sur) */
  function groundText(text, opt, height, x, y, rot) {
    const { texture, aspect } = canvasText(text, opt);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.rotation.set(-Math.PI / 2, 0, rot || 0); m.position.set(x, T.elevation(x, y) + 0.12, -y); m.renderOrder = 6; return m;
  }
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ───────────── cámara orbital propia (sin OrbitControls) ───────────── */
  const cam = {
    target: new THREE.Vector3(SITE_C.x, 1, -SITE_C.y), theta: 0.8, phi: 0.95, dist: 150,
    tTarget: null, tTheta: 0.8, tPhi: 0.95, tDist: 150,
    tween: null, minPhi: 0.03, maxPhi: 1.5, minDist: 9, maxDist: 320,
  };
  cam.tTarget = cam.target.clone();
  function applyCam() {
    const sp = Math.sin(cam.phi);
    camera.position.set(cam.target.x + cam.dist * sp * Math.sin(cam.theta), cam.target.y + cam.dist * Math.cos(cam.phi), cam.target.z + cam.dist * sp * Math.cos(cam.theta));
    const ground = T.elevation(camera.position.x, -camera.position.z) + 1.4;
    if (camera.position.y < ground) camera.position.y = ground;
    camera.lookAt(cam.target);
  }
  function flyTo(target, theta, phi, dist, dur) {
    cam.tTarget.copy(target); cam.tTheta = theta; cam.tPhi = THREE.MathUtils.clamp(phi, cam.minPhi, cam.maxPhi); cam.tDist = THREE.MathUtils.clamp(dist, cam.minDist, cam.maxDist);
    /* elegir el giro más corto en theta */
    while (cam.tTheta - cam.theta > Math.PI) cam.tTheta -= 2 * Math.PI;
    while (cam.theta - cam.tTheta > Math.PI) cam.tTheta += 2 * Math.PI;
    cam.tween = { t: 0, t0: performance.now(), dur: reduced ? 0.01 : (dur || 1.5), from: { target: cam.target.clone(), theta: cam.theta, phi: cam.phi, dist: cam.dist } };
  }
  /* maqueta y plano encuadran la losa del diorama entera (PW.environment) con margen; sin el módulo, el predio */
  const slabC = () => (env && env.center) ? env.center : SITE_C;
  /* distancia para que un radio dado entre a lo ancho de la pantalla (campo horizontal = fov vertical × aspecto):
     en vertical (móvil) el campo horizontal es estrecho y la distancia fija dejaba la losa o el lote cortados */
  const fitDist = (radius, base, pad) => { const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect); return Math.max(base, radius / Math.tan(hFov / 2) * (pad || 1.1)); };
  const lotRadius = l => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; l.polygon.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); return 0.5 * Math.hypot(x1 - x0, y1 - y0); };
  const VIEWS = {
    maqueta: () => { const c = slabC(); flyTo(new THREE.Vector3(c.x + 2, 0.5, -c.y - (isMobile ? 0 : 6)), 0.62, env ? (isMobile ? 0.9 : 0.87) : 0.95, env ? (isMobile ? fitDist(48, 222, 1.04) : 168) : (isMobile ? 175 : 128), 1.6); },
    plano: () => { const c = slabC(); flyTo(new THREE.Vector3(c.x, 0, -c.y - 2), 0.0, 0.03, env ? (isMobile ? fitDist(50, 255, 1.04) : 195) : (isMobile ? 200 : 150), 1.8); },
    ruta: () => flyTo(new THREE.Vector3(D.front.gate.center_x + 0.5, 2.4, -8), 0.05, 1.43, 40, 2.0),
    lote: () => { const l = D.lots.find(l => l.id === state.selected) || D.lots[0]; const c = l.centroid; flyTo(new THREE.Vector3(c[0], 0.5, -c[1]), 0.55, 0.98, fitDist(lotRadius(l), 52, 1.15), 1.5); },
    dron: () => { state.dron = true; flyTo(new THREE.Vector3(SITE_C.x, 2, -SITE_C.y), cam.theta, 1.02, 150, 2.0); },
  };
  function updateCam(dt) {
    if (cam.tween) {
      /* los vuelos van por reloj de pared: duran lo mismo a 10 que a 60 cuadros por segundo */
      const tw = cam.tween; tw.t = (performance.now() - tw.t0) / 1000; const k = easeInOut(Math.min(1, tw.t / tw.dur));
      cam.target.lerpVectors(tw.from.target, cam.tTarget, k);
      cam.theta = tw.from.theta + (cam.tTheta - tw.from.theta) * k; cam.phi = tw.from.phi + (cam.tPhi - tw.from.phi) * k; cam.dist = tw.from.dist + (cam.tDist - tw.from.dist) * k;
      if (tw.t >= tw.dur) { cam.tween = null; cam.target.copy(cam.tTarget); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.dist = cam.tDist; }
    } else {
      if (state.dron && !reduced) cam.tTheta += dt * 0.06;
      const k = 1 - Math.pow(0.0008, dt);
      cam.target.lerp(cam.tTarget, k); cam.theta += (cam.tTheta - cam.theta) * k; cam.phi += (cam.tPhi - cam.phi) * k; cam.dist += (cam.tDist - cam.dist) * k;
    }
    /* el corrimiento del encuadre (ficha abierta) se interpola para que la escena no salte */
    if (Math.abs(viewOff.tx - viewOff.x) > 0.5 || Math.abs(viewOff.ty - viewOff.y) > 0.5) {
      const k = 1 - Math.pow(0.001, dt); viewOff.x += (viewOff.tx - viewOff.x) * k; viewOff.y += (viewOff.ty - viewOff.y) * k;
      if (Math.abs(viewOff.tx - viewOff.x) < 0.5) viewOff.x = viewOff.tx; if (Math.abs(viewOff.ty - viewOff.y) < 0.5) viewOff.y = viewOff.ty;
      applyViewOffset();
    }
    applyCam();
  }
  function bindControls(el) {
    const ptrs = new Map(); let mode = null, last = null, pinch0 = 0, dist0 = 0, downPos = null, moved = 0, maxPtrs = 0, downButton = 0;
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { el.setPointerCapture(e.pointerId); } catch (err) { /* punteros sintéticos */ }
      if (ptrs.size === 1) { downPos = { x: e.clientX, y: e.clientY }; moved = 0; maxPtrs = 1; downButton = e.button; last = { x: e.clientX, y: e.clientY }; mode = (e.button === 2 || e.ctrlKey || e.shiftKey) ? 'pan' : 'rotate'; }
      if (ptrs.size === 2) { const a = [...ptrs.values()]; maxPtrs = 2; pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); dist0 = cam.tDist; mode = 'pinch'; last = { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
      userTouched();
    });
    el.addEventListener('pointermove', e => {
      if (ptrs.has(e.pointerId)) {
        const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved += Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
        if (mode === 'rotate' && ptrs.size === 1) { if (planoOn && moved > 4) exitPlano(); cam.tTheta -= (e.clientX - prev.x) * 0.0055; cam.tPhi = THREE.MathUtils.clamp(cam.tPhi - (e.clientY - prev.y) * 0.004, cam.minPhi, cam.maxPhi); cam.tween = null; }
        else if (mode === 'pan' && ptrs.size === 1) { pan(e.clientX - prev.x, e.clientY - prev.y); }
        else if (ptrs.size === 2) {
          const a = [...ptrs.values()]; const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
          cam.tDist = THREE.MathUtils.clamp(dist0 * pinch0 / Math.max(1, d), cam.minDist, cam.maxDist); cam.tween = null;
          const cx = (a[0].x + a[1].x) / 2, cy = (a[0].y + a[1].y) / 2; if (last) pan(cx - last.x, cy - last.y); last = { x: cx, y: cy };
        }
      } else hoverAt(e.clientX, e.clientY);
      if (ptrs.size === 0) hoverAt(e.clientX, e.clientY);
    });
    const up = e => {
      ptrs.delete(e.pointerId);
      if (ptrs.size === 1) { const r = [...ptrs.values()][0]; mode = 'rotate'; last = { x: r.x, y: r.y }; return; }   /* queda un dedo: sigue orbitando */
      if (ptrs.size === 0) {
        /* solo un toque/clic simple con el botón principal selecciona; dos dedos o botón derecho no */
        if (downPos && moved < 7 && maxPtrs === 1 && downButton === 0) clickAt(e.clientX, e.clientY, e.pointerType);
        mode = null; downPos = null; maxPtrs = 0;
        if (e.pointerType === 'mouse') { hoverThrottle = 0; hoverAt(e.clientX, e.clientY); }
      }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); cam.tDist = THREE.MathUtils.clamp(cam.tDist * Math.pow(1.0016, e.deltaY), cam.minDist, cam.maxDist); cam.tween = null; userTouched(); }, { passive: false });
    el.addEventListener('pointerleave', () => setHover(null));
    function pan(dx, dy) {
      const f = cam.tDist * 0.0014; const right = new THREE.Vector3(Math.cos(cam.theta), 0, -Math.sin(cam.theta)); const fwd = new THREE.Vector3(-Math.sin(cam.theta), 0, -Math.cos(cam.theta));
      cam.tTarget.addScaledVector(right, -dx * f).addScaledVector(fwd, dy * f * -1);
      cam.tTarget.x = THREE.MathUtils.clamp(cam.tTarget.x, -40, 110); cam.tTarget.z = THREE.MathUtils.clamp(cam.tTarget.z, -130, 40); cam.tween = null;
    }
  }
  function userTouched() { if (state.dron) { state.dron = false; state.view = 'libre'; ui && ui.setView('libre'); } }
  /* orbitar en vista Plano la abandona: el botón, el minimapa y el suelo de papel vuelven a la maqueta */
  function exitPlano() { setPlano(false); state.view = 'libre'; ui && ui.setView('libre'); }

  /* ───────────── luz, cielo, modos ───────────── */
  const LIGHTS = {
    /* sol real para 25° S: al mediodía hacia el norte y alto; atardecer al oeste-noroeste y bajo; luna al noreste */
    dia: { top: 0x5F93CF, hor: 0xDCE7EF, sun: 0xFFF3DC, sunI: 2.3, sunPos: sunFrom(10, 62, 150), hemiSky: 0xCFE2F3, hemiGround: 0x6B7A4A, hemiI: 0.85, amb: 0.12, fog: 0xD9E5EC, fogN: 260, fogF: 760, exp: 1.0, stars: 0, sunSprite: 0.55 },
    atardecer: { top: 0x4F6FA8, hor: 0xF2CDA0, sun: 0xFFC78A, sunI: 2.1, sunPos: sunFrom(282, 13, 150), hemiSky: 0xF1D6B4, hemiGround: 0x5C6A3E, hemiI: 0.7, amb: 0.1, fog: 0xEFCBA0, fogN: 220, fogF: 640, exp: 1.05, stars: 0, sunSprite: 1.0 },
    noche: { top: 0x070E22, hor: 0x1C2C55, sun: 0x9DB1E4, sunI: 0.55, sunPos: sunFrom(45, 48, 150), hemiSky: 0x2A3C6A, hemiGround: 0x101C3C, hemiI: 0.6, amb: 0.12, fog: 0x0B1738, fogN: 150, fogF: 520, exp: 0.95, stars: 1, sunSprite: 0 },
  };
  const lightCur = {}; let lightFrom = null, lightTo = null, lightT = 1, lightT0 = 0;
  function setupSky() {
    const g = new THREE.SphereGeometry(820, 24, 16);
    /* page/pageMix: en modo diorama (PW.environment) el cielo se funde al marfil de la página */
    const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color(0x4F6FA8) }, hor: { value: new THREE.Color(0xF2CDA0) }, page: { value: new THREE.Color(0xF2EDE0) }, pageMix: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 page; uniform float pageMix; varying vec3 vW; void main(){ float h = normalize(vW).y; float k = smoothstep(-0.05, 0.55, h); vec3 c = mix(mix(hor, top, k), page, pageMix); gl_FragColor = vec4(c, 1.0); }' });
    sky = new THREE.Mesh(g, m); sky.renderOrder = -10; sky.name = 'cielo'; scene.add(sky);
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.25, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sunSprite.scale.set(140, 140, 1); sunSprite.name = 'sol'; scene.add(sunSprite);
    const rnd = PW.rng(7), sp = [];
    for (let i = 0; i < 1400; i++) { const th = rnd() * Math.PI * 2, ph = Math.acos(rnd() * 0.9 + 0.1); sp.push(700 * Math.sin(ph) * Math.cos(th), 700 * Math.cos(ph), 700 * Math.sin(ph) * Math.sin(th)); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xF2EDE0, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); stars.name = 'estrellas'; scene.add(stars);
  }
  function setLight(mode, instant) {
    state.light = mode; const to = LIGHTS[mode];
    lightFrom = Object.assign({}, lightCur); lightTo = to; lightT = instant || reduced ? 1 : 0; lightT0 = performance.now();
    if (!lightFrom.top) { lightFrom = Object.assign({}, to); lightT = 1; }
    arch && arch.setNight && arch.setNight(mode === 'noche'); veg && veg.setNight && veg.setNight(mode === 'noche');
    env && env.setLight(mode, !!instant); ui && ui.setLight(mode);
  }
  /* en modo plano el sol pasa a cenital: el papel queda limpio, sin sombras largas */
  function placeSun() {
    if (!lightCur.sunPos) return;
    if (planoOn) sun.position.set(SITE_C.x + 12, 260, -SITE_C.y + 10);
    else sun.position.set(lightCur.sunPos[0] + SITE_C.x, lightCur.sunPos[1], lightCur.sunPos[2] - SITE_C.y);
  }
  const _c1 = new THREE.Color(), _c2 = new THREE.Color();
  function mixColor(a, b, k) { return _c1.setHex(a).lerp(_c2.setHex(b), k).getHex(); }
  function updateLight(dt) {
    if (!lightTo) return;
    if (lightT < 1) lightT = Math.min(1, (performance.now() - lightT0) / 1600);   /* por reloj de pared */
    const k = easeInOut(lightT), f = lightFrom, t = lightTo;
    const num = key => f[key] + (t[key] - f[key]) * k;
    lightCur.top = mixColor(f.top, t.top, k); lightCur.hor = mixColor(f.hor, t.hor, k); lightCur.sun = mixColor(f.sun, t.sun, k); lightCur.sunI = num('sunI');
    lightCur.sunPos = [0, 1, 2].map(i => f.sunPos[i] + (t.sunPos[i] - f.sunPos[i]) * k); lightCur.hemiSky = mixColor(f.hemiSky, t.hemiSky, k); lightCur.hemiGround = mixColor(f.hemiGround, t.hemiGround, k);
    lightCur.hemiI = num('hemiI'); lightCur.amb = num('amb'); lightCur.fog = mixColor(f.fog, t.fog, k); lightCur.fogN = num('fogN'); lightCur.fogF = num('fogF'); lightCur.exp = num('exp'); lightCur.stars = num('stars'); lightCur.sunSprite = num('sunSprite');
    sky.material.uniforms.top.value.setHex(lightCur.top); sky.material.uniforms.hor.value.setHex(lightCur.hor);
    sun.color.setHex(lightCur.sun); sun.intensity = lightCur.sunI; placeSun();
    hemi.color.setHex(lightCur.hemiSky); hemi.groundColor.setHex(lightCur.hemiGround); hemi.intensity = lightCur.hemiI; amb.intensity = lightCur.amb;
    scene.fog.color.setHex(lightCur.fog); scene.fog.near = lightCur.fogN; scene.fog.far = lightCur.fogF; renderer.toneMappingExposure = lightCur.exp;
    stars.material.opacity = lightCur.stars * 0.9; sunSprite.material.opacity = lightCur.sunSprite;
    const dir = new THREE.Vector3(lightCur.sunPos[0], lightCur.sunPos[1], lightCur.sunPos[2]).normalize(); sunSprite.position.copy(dir.multiplyScalar(640)).add(new THREE.Vector3(SITE_C.x, 0, -SITE_C.y));
    if (lightT >= 1) lightTo = null;
  }

  /* ───────────── terreno, plano base, ruta ───────────── */
  function buildTerrain() {
    /* el terreno visible es mucho más grande que el rango de trabajo de los módulos (T.extent): campo abierto hasta la niebla */
    const E = { x0: -190, x1: 250, y0: -170, y1: 270 }, nx = 220, ny = 220;
    const g = new THREE.PlaneGeometry(E.x1 - E.x0, E.y1 - E.y0, nx, ny); const p = g.attributes.position; const col = [];
    const c1 = new THREE.Color(0x8DAD5E), c2 = new THREE.Color(0xA3B96A), c3 = new THREE.Color(0x7B9D55);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + (E.x0 + E.x1) / 2, y = p.getY(i) + (E.y0 + E.y1) / 2; p.setZ(i, T.elevation(x, y));
      const n = T.noise(x * 0.06 + 3, y * 0.06 + 1), inside = T.inside(x, y) ? 1 : 0;
      const c = _c1.copy(c1).lerp(c2, n).lerp(c3, inside * 0.5); col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    /* campo lejano: un disco enorme bajo el terreno para que el horizonte nunca muestre el borde de la maqueta */
    const far = new THREE.Mesh(new THREE.CircleGeometry(1600, 48), new THREE.MeshStandardMaterial({ color: 0x8AA65A, roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(SITE_C.x, -2.2, -SITE_C.y); far.receiveShadow = false; far.name = 'campo-lejano'; scene.add(far);
    const lawn = tex && tex.get('lawn');
    terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: lawn || null });
    if (lawn) { lawn.repeat.set((E.x1 - E.x0) / 4, (E.y1 - E.y0) / 4); terrainMat.userData.lawn = lawn; }
    terrainMesh = new THREE.Mesh(g, terrainMat); terrainMesh.rotation.x = -Math.PI / 2; terrainMesh.position.set((E.x0 + E.x1) / 2, 0, -(E.y0 + E.y1) / 2); terrainMesh.receiveShadow = true; terrainMesh.name = 'terreno'; scene.add(terrainMesh);
    /* plano base de la arquitecta (líneas) sobre el terreno */
    const X0 = -40, X1 = 100, Y0 = -30, Y1 = 115; const pg = new THREE.PlaneGeometry(X1 - X0, Y1 - Y0, 140, 145); const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i) + (X0 + X1) / 2, y = pp.getY(i) + (Y0 + Y1) / 2; pp.setZ(i, T.elevation(x, y) + 0.06); }
    const pt = new THREE.TextureLoader().load('plano-base.png'); pt.colorSpace = THREE.SRGBColorSpace; pt.anisotropy = 8;
    planBase = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: pt, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    planBase.rotation.x = -Math.PI / 2; planBase.position.set((X0 + X1) / 2, 0, -(Y0 + Y1) / 2); planBase.renderOrder = 2; planBase.name = 'plano-base'; scene.add(planBase);
    /* ruta asfaltada (y −7…−14) con banquinas, y camino vecinal de ripio */
    const asph = tex && tex.get('asphalt');
    const R = D.ruta.asfalto, RX0 = -190, RX1 = 250; const roadPoly = [[RX0, R.y0], [RX1, R.y0], [RX1, R.y1], [RX0, R.y1]];
    const rm = new THREE.Mesh(prism(roadPoly, 0.05, 0.2, 4), new THREE.MeshStandardMaterial({ color: asph ? 0xffffff : P.asfalto, roughness: 0.98, map: asph || null })); rm.receiveShadow = true; rm.name = 'ruta'; scene.add(rm);
    /* línea central discontinua y líneas de borde */
    const lm = new THREE.MeshBasicMaterial({ color: 0xE9E2D0 }); lm.name = 'ruta-lineas';   /* PW.environment lo recorta al borde de la losa */
    for (let x = RX0; x < RX1; x += 9) scene.add(new THREE.Mesh(prism([[x, -10.42], [x + 4.5, -10.42], [x + 4.5, -10.58], [x, -10.58]], 0.07, 0.05, 1), lm));
    [[R.y0 - 0.35, R.y0 - 0.47], [R.y1 + 0.47, R.y1 + 0.35]].forEach(([ya, yb]) => scene.add(new THREE.Mesh(prism([[RX0, ya], [RX1, ya], [RX1, yb], [RX0, yb]], 0.07, 0.05, 1), lm)));
    const sh1 = new THREE.Mesh(prism([[RX0, R.y0 + 1.5], [RX1, R.y0 + 1.5], [RX1, R.y1 - 1.5], [RX0, R.y1 - 1.5]], 0.02, 0.1, 4), new THREE.MeshStandardMaterial({ color: 0xA9A08A, roughness: 1 })); sh1.name = 'banquina'; scene.add(sh1);
    const V2 = D.site.polygon[1], V3 = D.site.polygon[2]; const w = D.camino_vecinal.ancho;
    const dx = V3[0] - V2[0], dy = V3[1] - V2[1], L = Math.hypot(dx, dy), nx2 = -dy / L * -1, ny2 = dx / L * -1; /* normal hacia el este; se resta para ir al oeste */
    const CAMD = [dx / L, dy / L];
    const ext = 1.0; const a = [V2[0] - dx / L * 4, V2[1] - dy / L * 4], b = [V3[0] + dx / L * 22, V3[1] + dy / L * 22];
    const cam2 = [[a[0] - nx2 * 0.3, a[1] - ny2 * 0.3], [b[0] - nx2 * 0.3, b[1] - ny2 * 0.3], [b[0] - nx2 * w, b[1] - ny2 * w], [a[0] - nx2 * w, a[1] - ny2 * w]];
    const gm = new THREE.Mesh(prism(cam2, 0.04, 0.15, 1.5), new THREE.MeshStandardMaterial({ color: tex ? 0xffffff : 0xC9B994, roughness: 1, map: (tex && tex.get('gravel')) || null, bumpMap: (tex && tex.bump && tex.bump('gravel')) || null, bumpScale: 0.03 })); gm.receiveShadow = true; gm.name = 'camino-vecinal'; scene.add(gm);
    /* rótulos apoyados en el suelo (como pintura vial), no carteles flotantes */
    const cmid = [(cam2[0][0] + cam2[2][0]) / 2, (cam2[0][1] + cam2[2][1]) / 2];
    const cl = groundText('Camino vecinal', { size: 30, font: '"JetBrains Mono", monospace', weight: 500, color: '#6B4F22' }, 2.0, cmid[0], cmid[1] + 14, Math.atan2(CAMD[1], CAMD[0]) - Math.PI / 2); scene.add(cl);
    const rl = groundText('Ruta San Bernardino – Pirayú · Ruta II', { size: 30, font: '"JetBrains Mono", monospace', weight: 500, color: '#F2EDE0' }, 1.9, SITE_C.x + 24, R.y1 - 2.6, 0); scene.add(rl);
  }
  function buildRoad() {
    const cobble = tex && tex.get('cobble'), cbump = tex && tex.bump && tex.bump('cobble'), ver = tex && tex.get('paver'), vbump = tex && tex.bump && tex.bump('paver');
    const cm = new THREE.MeshStandardMaterial({ color: cobble ? 0xffffff : P.empedrado, roughness: 0.95, map: cobble || null, bumpMap: cbump || null, bumpScale: cbump ? 0.05 : 0 });
    const calle = new THREE.Mesh(prism(D.road.calle, 0.08, 0.3, 2.5), cm); calle.receiveShadow = true; calle.name = 'calle'; scene.add(calle);
    const vm = new THREE.MeshStandardMaterial({ color: ver ? 0xffffff : P.vereda, roughness: 0.95, map: ver || null, bumpMap: vbump || null, bumpScale: vbump ? 0.02 : 0 });
    D.road.veredas.forEach(v => { const m = new THREE.Mesh(prism(v, 0.17, 0.35, 1.2), vm); m.receiveShadow = true; m.name = 'vereda'; scene.add(m); });
    scene.add(lineOn(D.road.calle, 0x4F463D, 0.19, 0.9));
    /* isletas con cordón alrededor de los árboles existentes que el plano deja dentro de la calzada */
    (D.islands || []).forEach(isl => {
      const g = new THREE.Group(); g.name = 'isleta';
      const curb = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 40), new THREE.MeshStandardMaterial({ color: P.piedraClara, roughness: 0.9 }));
      curb.scale.set(isl.rx + 0.3, 1, isl.ry + 0.3); curb.position.y = 0.15; curb.castShadow = true; curb.receiveShadow = true; g.add(curb);
      const soil = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.34, 40), new THREE.MeshStandardMaterial({ color: P.cespedOscuro, roughness: 1 }));
      soil.scale.set(isl.rx, 1, isl.ry); soil.position.y = 0.19; soil.receiveShadow = true; g.add(soil);
      g.position.set(isl.x, T.elevation(isl.x, isl.y) + 0.08, -isl.y); g.rotation.y = THREE.MathUtils.degToRad(isl.ang || 0); scene.add(g);
    });
    const tm = new THREE.MeshStandardMaterial({ color: 0x5A7A3A, roughness: 1 }); const tac = new THREE.Mesh(prism(D.tacuaral, 0.14, 0.3, 4), tm); tac.receiveShadow = true; tac.name = 'tacuaral-suelo'; scene.add(tac);
    const fm = new THREE.MeshStandardMaterial({ color: P.cespedClaro, roughness: 1, map: (tex && tex.get('lawn')) || null }); if (fm.map) { fm.map = fm.map.clone(); fm.map.repeat.set(1, 1); fm.map.needsUpdate = true; }
    [D.front.strip, D.front.strip_oeste].filter(Boolean).forEach(poly => { const front = new THREE.Mesh(prism(poly, 0.1, 0.25, 6), fm); front.receiveShadow = true; front.name = 'area-verde-frente'; scene.add(front); });
    buildNorthMarker();
    (D.verde_extra || []).forEach(v => { const m = new THREE.Mesh(prism(v, 0.12, 0.25, 6), fm); m.receiveShadow = true; scene.add(m); });
    /* Franja de vereda-ripio sobre la línea de frente (y 4.6–5.4 del plano) */
    const walk = [[D.front.gate.x1 + 0.2, 4.6], [D.site.polygon[0][0] - 1, 4.6], [D.site.polygon[0][0] - 1, 5.4], [D.front.gate.x1 + 0.2, 5.4]];
    const walk2 = [[D.site.polygon[1][0] + 1, 4.6], [D.front.gate.x0 - 0.2, 4.6], [D.front.gate.x0 - 0.2, 5.4], [D.site.polygon[1][0] + 1, 5.4]];
    [walk, walk2].forEach(w => { const m = new THREE.Mesh(prism(w, 0.13, 0.2, 2), vm); scene.add(m); });
  }

  /* rosa de los vientos apoyada en el césped, con el norte medido por la mensura (UTM 21S) */
  function buildNorthMarker() {
    const g = new THREE.Group(); g.name = 'norte';
    const ang = THREE.MathUtils.degToRad(NORTH_DEG); const cx = 10, cy = -21, r = 3.2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 48), new THREE.MeshBasicMaterial({ color: P.marfil2, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, T.elevation(cx, cy) + 0.14, -cy); ring.renderOrder = 6; g.add(ring);
    const shape = new THREE.Shape(); shape.moveTo(0, r - 0.5); shape.lineTo(-0.7, -0.9); shape.lineTo(0, -0.3); shape.lineTo(0.7, -0.9); shape.closePath();
    const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: P.bordo, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    arrow.rotation.set(-Math.PI / 2, 0, ang - Math.PI / 2); arrow.position.set(cx, T.elevation(cx, cy) + 0.15, -cy); arrow.renderOrder = 7; g.add(arrow);
    const n = groundText('N', { size: 56, font: 'Newsreader, Georgia, serif', weight: 500, color: '#6B1018' }, 1.6, cx + Math.cos(ang) * (r + 1.3), cy + Math.sin(ang) * (r + 1.3), ang - Math.PI / 2); g.add(n);
    const t = groundText('norte · UTM 21S', { size: 26, font: '"JetBrains Mono", monospace', weight: 500, color: '#7A5C28' }, 0.9, cx, cy - r - 1.4, 0); g.add(t);
    scene.add(g);
  }
  /* ───────────── lotes ───────────── */
  /* colores de la luz del contorno (HDR: por encima de 1 para que el bloom los recoja) */
  /* ámbar HDR (R ≫ B) para que tras el tono ACES siga dorado y no recorte a blanco; la versión LDR se usa sin postproceso (móvil) */
  const GLOW_SEL = new THREE.Color(3.4, 2.0, 0.42), GLOW_HOV = new THREE.Color(1.6, 1.0, 0.26), BLACK = new THREE.Color(0, 0, 0);
  const GLOW_SEL_LDR = new THREE.Color(1.0, 0.70, 0.22), GLOW_HOV_LDR = new THREE.Color(0.95, 0.72, 0.35);
  /* desplaza un polígono CCW hacia afuera d metros (bisectriz en cada vértice) */
  function offsetPoly(pts, d) {
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      const e1 = new THREE.Vector2().subVectors(p, a).normalize(), e2 = new THREE.Vector2().subVectors(b, p).normalize();
      const n1 = new THREE.Vector2(e1.y, -e1.x), n2 = new THREE.Vector2(e2.y, -e2.x);
      const bis = new THREE.Vector2().addVectors(n1, n2); const L = bis.length();
      if (L < 1e-6) out.push(p.clone().addScaledVector(n1, d)); else { bis.divideScalar(L); out.push(p.clone().addScaledVector(bis, d / Math.max(0.35, bis.dot(n1)))); }
    }
    return out;
  }
  /* cortina vertical de luz sobre el contorno: brillante abajo, se apaga hacia arriba */
  function glowCurtain(pts, h) {
    const pos = [], col = [], idx = []; const n = pts.length; let base = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n]; const ha = T.elevation(a.x, a.y) + 0.22, hb = T.elevation(b.x, b.y) + 0.22;
      pos.push(a.x, ha, -a.y, b.x, hb, -b.y, b.x, hb + h, -b.y, a.x, ha + h, -a.y);
      col.push(GLOW_SEL.r, GLOW_SEL.g, GLOW_SEL.b, GLOW_SEL.r, GLOW_SEL.g, GLOW_SEL.b, 0, 0, 0, 0, 0, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3); base += 4;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
  }
  /* baño de luz en el suelo hacia afuera del lote: dorado junto al borde, negro (nada) a d metros */
  function glowWash(pts, d) {
    const outer = offsetPoly(pts, d); const pos = [], col = [], idx = []; const n = pts.length; let base = 0; const c = GLOW_SEL.clone().multiplyScalar(0.35);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], oa = outer[i], ob = outer[(i + 1) % n];
      pos.push(a.x, T.elevation(a.x, a.y) + 0.3, -a.y, b.x, T.elevation(b.x, b.y) + 0.3, -b.y, ob.x, T.elevation(ob.x, ob.y) + 0.3, -ob.y, oa.x, T.elevation(oa.x, oa.y) + 0.3, -oa.y);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b, 0, 0, 0, 0, 0, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3); base += 4;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
  }
  /* cuatro luces puntuales cálidas que acompañan al lote seleccionado (siempre en escena para no recompilar shaders) */
  const glowLights = [];
  /* intensidad del contorno según la distancia de la cámara al lote: plena desde ~100 m (maqueta), un cuarto a menos de 25 m
     (vista lote, acercamientos), para que de cerca sea un filo luminoso y no un resplandor que lave la casa y las cotas */
  function glowDistK(d) { return 0.25 + 0.75 * THREE.MathUtils.clamp((d - 25) / 75, 0, 1); }
  function buildGlowLights() { for (let i = 0; i < 4; i++) { const pl = new THREE.PointLight(0xFFD9A0, 0, 34, 2); pl.name = 'luz-lote-' + i; scene.add(pl); glowLights.push(pl); } }
  function placeGlowLights(id) {
    if (!id) return;
    const l = lots[id].data; const sides = (l.sides || []).slice().sort((a, b) => b.len - a.len).slice(0, 4);
    glowLights.forEach((pl, i) => { const s = sides[i] || sides[0]; if (s) pl.position.set(s.mid[0], T.elevation(s.mid[0], s.mid[1]) + 1.6, -s.mid[1]); });
  }
  function buildLots() {
    buildGlowLights();
    const lawn = tex && tex.get('lawn'), lawn2 = tex && tex.get('lawnMown');
    D.lots.forEach((l, i) => {
      const map = (i % 2 ? lawn2 : lawn) || null;
      const mat = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : (i % 2 ? P.cesped : P.cespedClaro), roughness: 1, map, emissive: 0x000000 });
      if (map) { mat.map = map.clone(); mat.map.needsUpdate = true; }
      const mesh = new THREE.Mesh(prism(l.polygon, 0.2, 0.42, 4), mat); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'lote-' + l.id; mesh.userData.lotId = l.id; scene.add(mesh); pickables.push(mesh);
      /* contorno luminoso: una cinta de luz dorada (valores HDR para que el bloom la haga brillar) que se ve por encima de cercos y árboles */
      /* depthTest se conmuta por cuadro: de lejos (maqueta) la cinta se dibuja por encima de cercos y árboles; de cerca respeta la casa */
      const ringMat = new THREE.MeshBasicMaterial({ color: GLOW_HOV.clone(), transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const ring = new THREE.Mesh(ringGeo(l.ring, 0.26), ringMat); ring.renderOrder = 15; ring.visible = false; scene.add(ring);
      /* cortina de luz vertical sobre el borde y baño de luz hacia afuera (aditivos: el negro no suma nada, así se funden) */
      const pts = triangulate(l.polygon).pts;
      const halo = new THREE.Mesh(glowCurtain(pts, 0.9), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })); halo.visible = false; halo.renderOrder = 14; scene.add(halo);
      const wash = new THREE.Mesh(glowWash(pts, 3.6), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false })); wash.visible = false; wash.renderOrder = 13; scene.add(wash);
      const label = sprite(String(l.id), { size: 64, disc: true, weight: 500, color: '#6B1018', stroke: '#6B1018', bg: '#F8F4E8', pad: 16 }, 4.2);
      const lp = l.label; label.position.set(lp[0], T.elevation(lp[0], lp[1]) + 2.4, -lp[1]); label.userData.base = label.position.clone(); scene.add(label);
      /* superficie calculada sobre la mensura (area_drawn), como pidió la arquitecta; su tabla queda como referencia en la nota técnica */
      const area = sprite(fmt(l.area_drawn) + ' m²', { size: 28, font: '"JetBrains Mono", monospace', weight: 500, color: '#F2EDE0', bg: 'rgba(107,16,24,0.92)', pad: 10 }, 2.3);
      area.position.set(lp[0], T.elevation(lp[0], lp[1]) + 0.9, -lp[1] + 2.2); area.visible = false; area.userData.base = area.scale.clone(); scene.add(area);
      scene.add(lineOn(l.polygon, 0x5E7D3B, 0.215, 0.5));
      lots[l.id] = { data: l, mesh, ring, ringMat, halo, wash, label, area, lift: 0, liftTarget: 0, baseY: mesh.position.y };
    });
    perimeter = new THREE.Mesh(ringGeo(D.site.ring, 0.24), new THREE.MeshBasicMaterial({ color: P.bordo, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })); perimeter.renderOrder = 4; scene.add(perimeter);
    buildPerimeterDims();
  }
  let perimDims;
  function buildPerimeterDims() {
    perimDims = new THREE.Group(); perimDims.name = 'cotas-perimetro'; perimDims.visible = false; scene.add(perimDims);
    D.site.sides.forEach(s => {
      const a = D.site.polygon[s.from - 1], b = D.site.polygon[s.to - 1], n = s.n, off = 3.2;
      const A = [a[0] + n[0] * off, a[1] + n[1] * off], B = [b[0] + n[0] * off, b[1] + n[1] * off];
      perimDims.add(lineOn([A, B], P.bordo, 0.8, 0.9));
      [[a, A], [b, B]].forEach(([p, q]) => perimDims.add(lineOn([[p[0] + n[0] * 0.4, p[1] + n[1] * 0.4], [q[0] + n[0] * 0.8, q[1] + n[1] * 0.8]], P.bordo, 0.8, 0.6)));
      const sp = sprite(s.label.replace('.', ',') + (s.label.includes('.') ? ' m' : ',00 m'), { size: 30, font: '"JetBrains Mono", monospace', weight: 500, color: '#6B1018', bg: 'rgba(248,244,232,0.92)', pad: 8 }, 3.0);
      sp.position.set(s.mid[0] + n[0] * (off + 2.6), T.elevation(s.mid[0], s.mid[1]) + 1.2, -(s.mid[1] + n[1] * (off + 2.6))); sp.userData.base = sp.scale.clone(); sp.material.depthTest = false; sp.renderOrder = 21; perimDims.add(sp);
    });
  }
  function showLotDims(id) {
    if (lotDims) { scene.remove(lotDims); lotDims.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.map && o.material.map.dispose(); }); lotDims = null; }
    if (!id) return;
    const l = lots[id].data; lotDims = new THREE.Group(); lotDims.name = 'cotas-lote';
    l.sides.forEach(s => {
      if (s.len < 3) return;
      const n = s.n, off = -2.3; const A = [s.a[0] + n[0] * off, s.a[1] + n[1] * off], B = [s.b[0] + n[0] * off, s.b[1] + n[1] * off];   /* hacia adentro, lejos del contorno luminoso */
      lotDims.add(lineOn([A, B], P.oroTinta, 0.7, 0.95));
      [[s.a, A], [s.b, B]].forEach(([p, q]) => lotDims.add(lineOn([[p[0] + n[0] * -0.2, p[1] + n[1] * -0.2], [q[0] + n[0] * -0.5, q[1] + n[1] * -0.5]], P.oroTinta, 0.7, 0.8)));
      const sp = sprite('≈ ' + fmt(s.len, 1) + ' m', { size: 26, font: '"JetBrains Mono", monospace', weight: 500, color: '#F2EDE0', bg: s.calle ? 'rgba(107,16,24,0.9)' : 'rgba(122,92,40,0.9)', pad: 8 }, 2.1);
      sp.position.set(s.mid[0] + n[0] * (off - 1.4), T.elevation(s.mid[0], s.mid[1]) + 1.0, -(s.mid[1] + n[1] * (off - 1.4))); sp.userData.base = sp.scale.clone(); sp.material.depthTest = false; sp.renderOrder = 21; lotDims.add(sp);
    });
    /* estacas doradas en los vértices */
    const pts = triangulate(l.polygon).pts; const sg = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6); const sm = new THREE.MeshStandardMaterial({ color: P.oro, roughness: 0.4, metalness: 0.3, emissive: 0x3a2a10 });
    pts.forEach(p => { const m = new THREE.Mesh(sg, sm); m.position.set(p.x, T.elevation(p.x, p.y) + 0.8, -p.y); lotDims.add(m); });
    scene.add(lotDims);
  }

  /* ───────────── selección e interacción ───────────── */
  /* elevación del lote al pasar el mouse / seleccionar; el lote 1 no se eleva porque sostiene la casa modelo y la pileta */
  function liftFor(l, hoverId) {
    if (l.data.id === 1) return 0;
    if (l.data.id === state.selected) return 0.32;
    return l.data.id === hoverId ? 0.22 : 0;
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0]; return hit ? hit.object.userData.lotId : null;
  }
  let hoverThrottle = 0;
  function hoverAt(cx, cy) { const now = performance.now(); if (now - hoverThrottle < 40) return; hoverThrottle = now; setHover(pick(cx, cy), { x: cx, y: cy }); }
  function setHover(id, pos) {
    if (state.hover === id) { if (id && ui) ui.setHover(id, pos); return; }
    state.hover = id; document.body.style.cursor = id ? 'pointer' : '';
    Object.values(lots).forEach(l => { l.liftTarget = liftFor(l, id); });
    ui && ui.setHover(id, pos);
  }
  function clickAt(cx, cy, type) {
    const id = pick(cx, cy);
    if (id) select(id, type === 'touch'); else if (state.selected) select(null);
  }
  function select(id, fly) {
    if (state.selected === id && id) { ui && ui.setSelected(id); return; }
    state.selected = id;
    Object.values(lots).forEach(l => {
      const on = l.data.id === id;
      l.ring.visible = on || l.data.id === state.hover; l.liftTarget = liftFor(l, state.hover);
      l.area.visible = on || planoOn; l.label.scale.setScalar(on ? 5.0 : 4.2); l.label.scale.x = l.label.scale.y * (l.label.material.map.image.width / l.label.material.map.image.height);
    });
    showLotDims(id); placeGlowLights(id); if (!id) glowLights.forEach(pl => { pl.intensity = 0; }); ui && ui.setSelected(id); frameForSheet();
    if (id && (state.view === 'lote' || fly)) { state.view = 'lote'; VIEWS.lote(); env && env.setView('lote'); ui && ui.setView('lote'); }
    if (id && innerWidth > 720) ui && ui.toast && ui.toast('Lote ' + id + ' seleccionado');   /* en móvil la ficha ya lo anuncia y el aviso taparía el botón */
  }
  /* con la ficha abierta en escritorio, la escena se corre a la izquierda para que el panel no tape el predio */
  const viewOff = { x: 0, y: 0, tx: 0, ty: 0 };
  function frameForSheet() {
    if (!camera) return;
    const open = !!(state.selected && ui && ui.isSheetOpen && ui.isSheetOpen());
    /* escritorio: la escena se corre a la izquierda del panel; móvil: sube para quedar por encima del bottom sheet */
    viewOff.tx = open && innerWidth > 720 ? Math.round(innerWidth * (innerWidth <= 1200 ? 0.05 : 0.12)) : 0;   /* en tablet la columna izquierda ya ocupa casi la mitad: corrimiento corto */
    viewOff.ty = open && innerWidth <= 720 ? Math.round(innerHeight * 0.24) : 0;
    if (reduced) { viewOff.x = viewOff.tx; viewOff.y = viewOff.ty; }
    applyViewOffset();
  }
  function applyViewOffset() {
    const W = innerWidth, H = innerHeight;
    if (Math.abs(viewOff.x) < 0.5 && Math.abs(viewOff.y) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(W, H, Math.round(viewOff.x), Math.round(viewOff.y), W, H);
    camera.updateProjectionMatrix();
  }
  function setView(name) {
    if (!VIEWS[name]) return; state.dron = false; state.view = name;
    if (name === 'lote' && !state.selected) select(1);
    VIEWS[name](); env && env.setView(name); ui && ui.setView(name);
    const plano = name === 'plano'; setPlano(plano);
  }
  let planoOn = false;
  function setPlano(on) {
    planoOn = on; perimDims.visible = on || state.cotas; perimeter.material.opacity = on ? 0.9 : (state.cotas ? 0.6 : 0);
    Object.values(lots).forEach(l => { l.area.visible = on || l.data.id === state.selected; });
    planBase.material.opacity = on ? 0.95 : 0.16; placeSun();
    if (terrainMat) { terrainMat.color.setHex(on ? 0xEDE6D3 : 0xffffff); terrainMat.vertexColors = !on; terrainMat.map = on ? null : (terrainMat.userData.lawn || null); terrainMat.needsUpdate = true; }
  }
  function setCotas(on) { state.cotas = on; perimDims.visible = on || planoOn; perimeter.material.opacity = (on || planoOn) ? (planoOn ? 0.9 : 0.6) : 0; ui && ui.setCotas(on); }
  function setMode(mode) { state.mode = mode; veg && veg.setMode && veg.setMode(mode); env && env.refresh(); ui && ui.setMode(mode); }
  function cycle(list, cur) { return list[(list.indexOf(cur) + 1) % list.length]; }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;            /* Ctrl+C, Cmd+L, etc. son del navegador */
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    /* con el foco en un botón, enlace o panel, Enter y Espacio pertenecen a ese control */
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.closest && e.target.closest('button, a, [role=button], [role=dialog]')) return;
    const k = e.key;
    if (/^[1-7]$/.test(k)) { select(+k, false); return; }
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); const cur = state.selected || (k === 'ArrowRight' ? 0 : 8); select(((cur - 1 + (k === 'ArrowRight' ? 1 : -1) + 7) % 7) + 1, false); return; }
    if (k === 'Escape') { if (ui && ui.isSheetOpen && ui.isSheetOpen()) { ui.setSelected(null); } select(null); return; }
    const lk = k.toLowerCase();
    if (lk === 'v') setView(cycle(['maqueta', 'plano', 'ruta', 'lote', 'dron'], state.view));
    else if (lk === 'l') setLight(cycle(['dia', 'atardecer', 'noche'], state.light));
    else if (lk === 't') setMode(cycle(['parque', 'bosque'], state.mode));
    else if (lk === 'c') setCotas(!state.cotas);
    else if (lk === 'p') setView(planoOn ? 'maqueta' : 'plano');
    else if (lk === 'r') reset();
    else if (k === '?') ui && ui.showHelp && ui.showHelp();
  }
  function reset() { select(null); setMode('parque'); setLight('atardecer'); setCotas(false); setView('maqueta'); }

  /* ───────────── bucle ───────────── */
  let rafId = 0;
  /* presentación de un lote para el cuadro actual (contorno luminoso, elevación, disco, rótulo, cotas). k = 1 aplica todo de golpe
     (settle, capturas); en el bucle k sigue a dt para que los fundidos duren lo mismo a cualquier tasa de cuadros */
  function lotFrame(l, k) {
      l.lift += (l.liftTarget - l.lift) * k;
      l.mesh.position.y = l.lift; l.ring.position.y = l.lift; l.halo.position.y = l.lift; l.label.position.y = l.label.userData.base.y + l.lift; l.area.position.y = T.elevation(l.data.label[0], l.data.label[1]) + 0.9 + l.lift;
      const sel = l.data.id === state.selected, hov = l.data.id === state.hover;
      l.ring.visible = sel || hov || l.ringMat.opacity > 0.02;
      /* seleccionado: luz dorada intensa que "respira"; hover: brillo suave */
      const nightK = state.light === 'noche' ? 0.55 : 1;                      /* de noche la luz no necesita gritar */
      const dcam = camera.position.distanceTo(l.label.position);
      const distK = glowDistK(dcam);                                          /* de cerca (vista lote) la luz baja: un filo nítido, no un resplandor que tape la casa */
      const hdr = !!post;                                                     /* sin postproceso (móvil) no hay bloom ni ACES: colores LDR y baño más suave */
      const breathe = (reduced ? 1 : 0.9 + 0.1 * Math.sin(clock * 2.2)) * nightK * distK;
      const target = sel ? breathe : hov ? (reduced ? 0.85 : 0.75 + 0.2 * Math.sin(clock * 5)) * nightK * distK : 0;
      l.ringMat.opacity += (target - l.ringMat.opacity) * k; l.ringMat.color.copy(sel ? (hdr ? GLOW_SEL : GLOW_SEL_LDR) : (hdr ? GLOW_HOV : GLOW_HOV_LDR));
      const glowT = sel ? breathe * (hdr ? 0.42 : 0.18) : 0; l.halo.material.opacity += (glowT - l.halo.material.opacity) * k; l.wash.material.opacity += (glowT - l.wash.material.opacity) * k;
      l.halo.visible = l.halo.material.opacity > 0.02; l.wash.visible = l.wash.material.opacity > 0.02; l.halo.position.y = l.lift; l.wash.position.y = l.lift;
      /* de lejos la luz se dibuja por encima de todo (cercos, árboles); de cerca respeta la casa y el relieve */
      const near = dcam < 70; l.ringMat.depthTest = near; l.halo.material.depthTest = near; l.wash.material.depthTest = near;
      if (sel) glowLights.forEach(pl => { pl.intensity = 12 * l.halo.material.opacity; });
      l.mesh.material.emissive.setHex(hov && !sel ? 0x2a2208 : sel ? 0x1c160a : 0x000000);
      /* los discos numerados mantienen un tamaño legible: crecen de lejos, se achican de cerca y desaparecen en los acercamientos
         (la ficha ya nombra el lote); de lejos se dibujan por encima de copas y sombrillas para que ninguno quede tapado */
      const s = (sel ? 5.0 : 4.2) * THREE.MathUtils.clamp(dcam / 110, 0.16, 1.35);
      l.label.scale.set(s * (l.label.material.map.image.width / l.label.material.map.image.height), s, 1);
      /* en la vista lote (o muy cerca) el disco y el rótulo del lote elegido se retiran: la ficha ya lo nombra y así no tapan las cotas */
      const closeSel = sel && (state.view === 'lote' || dcam < 60);
      l.label.visible = dcam >= 28 && !closeSel; l.label.material.depthTest = near; l.label.renderOrder = near ? 0 : 20;
      /* rótulo de superficie y cotas: escalan con la distancia como los discos */
      const ks = THREE.MathUtils.clamp(dcam / 110, 0.45, 1.6);
      if (l.area.userData.base) { l.area.scale.copy(l.area.userData.base).multiplyScalar(ks); l.area.material.depthTest = near; l.area.renderOrder = near ? 0 : 20; }
      l.area.visible = (planoOn || (sel && !closeSel)) && dcam >= 45;
      if (sel && lotDims) lotDims.children.forEach(o => { if (o.isSprite && o.userData.base) o.scale.copy(o.userData.base).multiplyScalar(ks); });
  }
  function cotasFrame() {
    if (perimDims && perimDims.visible) { const kp = THREE.MathUtils.clamp(camera.position.distanceTo(new THREE.Vector3(SITE_C.x, 0, -SITE_C.y)) / 150, 0.6, 1.6); perimDims.children.forEach(o => { if (o.isSprite && o.userData.base) o.scale.copy(o.userData.base).multiplyScalar(kp); }); }
  }
  function loop() {
    rafId = 0;
    if (!running) return;
    const now = performance.now(); const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; clock += dt;
    updateCam(dt); updateLight(dt); env && env.update(dt, clock);
    const k = 1 - Math.pow(0.002, dt);
    Object.values(lots).forEach(l => lotFrame(l, k)); cotasFrame();
    veg && veg.update && veg.update(dt, clock); arch && arch.update && arch.update(dt, clock); tex && tex.waterTick && tex.waterTick(dt);
    renderFrame();
    rafId = requestAnimationFrame(loop);
  }
  function renderFrame() { if (post) { post.tick(); post.composer.render(); } else renderer.render(scene, camera); }
  /* postproceso (escritorio): SSAO en escala de la escena, profundidad de campo tipo tilt-shift (solo diorama), bloom discreto
     para el contorno dorado, salida con tono ACES y, al final, viñeta + grano fino */
  function setupPost() {
    const PP = window.PW_POST; if (!PP || isMobile) return;
    try {
      const W = innerWidth, H = innerHeight;
      const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4, type: THREE.HalfFloatType });
      const composer = new PP.EffectComposer(renderer, rt);
      composer.addPass(new PP.RenderPass(scene, camera));
      /* radio en metros y distancias acotadas (profundidad lineal 0…1 sobre near…far): marca contactos sin ensuciar el césped; fuerza al 62 % */
      const ssao = new PP.SSAOPass(scene, camera, W, H); ssao.kernelRadius = 1.8; ssao.minDistance = 0.00012; ssao.maxDistance = 0.0016;
      ssao.ssaoMaterial.fragmentShader = ssao.ssaoMaterial.fragmentShader.replace('vec3( 1.0 - occlusion )', 'vec3( 1.0 - occlusion * 0.62 )'); ssao.ssaoMaterial.needsUpdate = true;
      composer.addPass(ssao);
      /* tilt-shift suave: foco en el centro de la losa, apertura mínima; se enciende solo en diorama (ver tick) y puede apagarse con app.setDof(false) */
      const bokeh = new PP.BokehPass(scene, camera, { focus: 150, aperture: 0.00002, maxblur: 0.0015 }); bokeh.enabled = false; composer.addPass(bokeh);   /* solo un matiz: no desenfoca los discos del fondo */
      /* umbral alto: solo brillan los valores HDR del contorno luminoso, no las paredes blancas al sol */
      const bloom = new PP.UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.55, 2.4); composer.addPass(bloom);
      composer.addPass(new PP.OutputPass());
      const vig = new PP.ShaderPass({ uniforms: { tDiffuse: { value: null }, uAspect: { value: W / H }, uTime: { value: 0 }, uVig: { value: 0.05 }, uGrain: { value: 0.026 } },   /* viñeta mínima: la página crema debe coincidir con los paneles */
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; uniform float uAspect; uniform float uTime; uniform float uVig; uniform float uGrain; varying vec2 vUv;' +
          'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)) + uTime) * 43758.5453); }' +
          'void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0); c.rgb *= 1.0 - uVig * smoothstep(0.45, 1.15, length(q)); c.rgb += (hash(gl_FragCoord.xy) - 0.5) * uGrain; gl_FragColor = c; }' });
      composer.addPass(vig);
      /* en los pases de normales/profundidad (SSAO, Bokeh) se ocultan sprites, puntos, tarjetas con alphaTest, aditivos (contorno luminoso)
         y transparentes sin depthWrite: así no dejan halos oscuros ni desenfoques falsos */
      const hideOverlays = pass => { const orig = pass.render; pass.render = function () {
        const hid = []; scene.traverse(o => { if (!o.visible || !(o.isSprite || o.isPoints || o.isMesh)) return; const m = o.material; if (o.isSprite || o.isPoints || (m && !Array.isArray(m) && (m.alphaTest > 0 || m.blending === THREE.AdditiveBlending || (m.transparent && !m.depthWrite)))) { o.visible = false; hid.push(o); } });
        try { return orig.apply(this, arguments); } finally { hid.forEach(o => { o.visible = true; }); } }; };
      hideOverlays(ssao); hideOverlays(bokeh);
      let dof = true;
      post = postObj = { composer, ssao, bloom, bokeh, vig, dofOn: () => dof, setDof(on) { dof = !!on; },
        setSize(w, h) { composer.setSize(w, h); vig.uniforms.uAspect.value = w / h; },
        tick() { const k = env ? env.k() : 0; bokeh.enabled = dof && k > 0.5; if (bokeh.enabled) bokeh.uniforms.focus.value = camera.position.distanceTo(env.focus); if (!reduced) vig.uniforms.uTime.value = (clock * 37) % 977; } };
    } catch (e) { console.warn('postproceso desactivado', e); post = null; }
  }
  let postObj = null;
  app.setPost = on => { post = on ? postObj : null; };
  app.setDof = on => { postObj && postObj.setDof(on); };
  /* pruebas automáticas: detener/reanudar el bucle para que el DOM pinte sin competir con el render por software */
  app.pause = () => { running = false; };
  app.resume = () => { if (!running) { running = true; lastT = performance.now(); if (!rafId) loop(); } };

  /* ───────────── arranque ───────────── */
  function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } }
  const step = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  app.start = async function () {
    const handlers = {
      onSelect: id => { if (id) select(id, false); else select(null); }, onHover: (id) => { setHover(id); },
      onView: setView, onLight: m => setLight(m), onMode: setMode, onCotas: setCotas, onReset: reset, onHelp: () => {},
    };
    if (!hasWebGL()) {
      /* sin WebGL la interfaz funciona sola (teclado propio, fichas y plano SVG), sin núcleo 3D */
      ui = PW.ui && PW.ui.init ? PW.ui.init({ data: D, keys: true }, {}) : null; ui && ui.showNoWebGL && ui.showNoWebGL(); return;
    }
    ui = PW.ui && PW.ui.init ? PW.ui.init({ data: D }, handlers) : null;
    ui && ui.setLoading && ui.setLoading(0.05);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 2)); renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace; else renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.domElement.id = 'escena'; renderer.domElement.setAttribute('role', 'img'); renderer.domElement.setAttribute('aria-label', 'Maqueta 3D de Le Petit Trianon'); document.body.prepend(renderer.domElement);
    scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xEFD6B8, 220, 640);
    camera = new THREE.PerspectiveCamera(isMobile ? 50 : 42, innerWidth / innerHeight, 0.4, 1800);
    sun = new THREE.DirectionalLight(0xFFC78A, 2); sun.castShadow = true; sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -125; sc.right = 125; sc.top = 125; sc.bottom = -125; sc.near = 20; sc.far = 520; sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    sun.target.position.set(SITE_C.x, 0, -SITE_C.y); scene.add(sun); scene.add(sun.target);
    hemi = new THREE.HemisphereLight(0xF1D6B4, 0x5C6A3E, 0.7); scene.add(hemi); amb = new THREE.AmbientLight(0xffffff, 0.1); scene.add(amb);
    setupSky(); setLight('atardecer', true);
    const ctx = { THREE, scene, camera, renderer, data: D, terrain: T, palette: P, toWorld: T.toWorld, elevation: T.elevation, rng: PW.rng, quality: isMobile ? 'low' : 'high', shadows: true, mode: state.mode, night: false, selectedLot: null, lights: { sun, hemi, amb, cur: lightCur } };
    try { tex = PW.textures && PW.textures.build ? PW.textures.build(ctx) : null; } catch (e) { console.warn('textures', e); tex = null; }
    ui && ui.setLoading && ui.setLoading(0.2); await step();
    buildTerrain(); ui && ui.setLoading && ui.setLoading(0.35); await step();
    buildRoad(); ui && ui.setLoading && ui.setLoading(0.5); await step();
    buildLots(); ui && ui.setLoading && ui.setLoading(0.62); await step();
    try { arch = PW.architecture && PW.architecture.build ? PW.architecture.build(ctx) : null; } catch (e) { console.warn('architecture', e); arch = null; }
    ui && ui.setLoading && ui.setLoading(0.8); await step();
    try { veg = PW.vegetation && PW.vegetation.build ? PW.vegetation.build(ctx) : null; } catch (e) { console.warn('vegetation', e); veg = null; }
    ui && ui.setLoading && ui.setLoading(0.9); await step();
    /* entorno: luz de ambiente PMREM, sombras ajustadas y modo diorama (va al final: recorta lo que otros módulos dejan fuera de la losa) */
    try { env = PW.environment && PW.environment.build ? PW.environment.build(Object.assign({ view: state.view }, ctx)) : null; } catch (e) { console.warn('environment', e); env = null; }
    env && env.setLight(state.light, true);
    ui && ui.setLoading && ui.setLoading(0.96); await step();
    /* cámara: entrada cinematográfica desde arriba hacia la vista maqueta */
    cam.target.set(SITE_C.x, 1, -SITE_C.y); cam.theta = 0.2; cam.phi = 0.25; cam.dist = 300; cam.tTarget.copy(cam.target); cam.tTheta = cam.theta; cam.tPhi = cam.phi; cam.tDist = cam.dist; applyCam();
    bindControls(renderer.domElement); addEventListener('keydown', onKey);
    addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; renderer.setSize(innerWidth, innerHeight); post && post.setSize(innerWidth, innerHeight); frameForSheet(); });
    setupPost();
    document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running && !rafId) { lastT = performance.now(); loop(); } });
    ui && ui.setLoading && ui.setLoading(false); ui && ui.setView('maqueta'); ui && ui.setMode(state.mode); ui && ui.setLight(state.light);
    state.ready = true; loop(); VIEWS.maqueta(); cam.tween.dur = reduced ? 0.01 : 2.6;
    app.state = state; app.select = select; app.setView = setView; app.setLight = setLight; app.setMode = setMode; app.setCotas = setCotas; app.scene = scene; app.renderer = renderer; app.camera = camera; app.lots = lots; app.cam = cam;
    /* posición en pantalla del disco de un lote (pruebas automáticas) */
    app.screenPos = function (id) { const v = lots[id].label.position.clone().project(camera); return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight }; };
    /* termina al instante todas las transiciones (pruebas automáticas y capturas) */
    app.settle = function () {
      if (cam.tween) { cam.tween.t0 = -1e12; updateCam(0); }
      cam.target.copy(cam.tTarget); cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.dist = cam.tDist; cam.tween = null;
      viewOff.x = viewOff.tx; viewOff.y = viewOff.ty; applyViewOffset(); applyCam();
      if (lightTo) { lightT0 = -1e12; updateLight(0); }
      env && env.settle();
      Object.values(lots).forEach(l => lotFrame(l, 1)); cotasFrame();   /* misma presentación que el bucle, aplicada de golpe */
      renderFrame();
    };
    app.post = () => post; app.env = () => env;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => app.start()); else app.start();
})();
