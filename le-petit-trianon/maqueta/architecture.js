/* Paraways · Le Petit Trianon — PW.architecture (v4.1 · casa modelo de una sola planta según el render de la arquitecta,
   corregida con los hallazgos de los jueces: alero delgado, tarima chica, sin remate oscuro, escala 3,1 m, puerta 2,15)
   Edificaciones y mobiliario en escala real, apoyados en PW.terrain.elevation():
   casa modelo del lote 1 (huella de PW_DATA.house.volumes): volúmenes de UNA planta con losa plana y parapeto claro
   (cuerpo principal 3,1 + 0,3; alas 3,2–3,3 + 0,25), revoque greige cálido texturado con zócalo un tono más oscuro,
   acentos en antracita gris ('alero': losa de entrada de 0,15 m sobre dos parantes de 0,10, pérgola de la cochera,
   sombrerete) y antracita oscura ('carpinteria': marcos, puerta doble de 2,15 m con vidrio oscuro arriba y panel ciego
   abajo, macetas), ventanas de vidrio oscuro reflectante con cortina beige cálida detrás, faroles de pared de cuatro
   caras, macetas con plantas densas, tarima de piedra clara de 3,0 × 4,4 m con dos escalones y camino de losas hasta
   la vereda; cochera abierta (pérgola liviana sobre tres pilares, piso de adoquines); chimenea esbelta de hierro;
   pileta con venecitas, agua con normales animadas, borde de piedra, deck de madera, reposeras y sombrilla; driveway de
   adoquines con cordón; portón de pilares de piedra, hojas de reja, linternas, casilla, rejilla y cartel bordó con
   letras doradas; cerco perimetral (piedra + varas + postes); faroles, bancos y tótems. Todo se funde por material en
   pocos meshes (22 buckets 'arch-<bucket>' + 7 placas + halos = 30 meshes, ≈ 13,5 k triángulos; 4 PointLight de noche).
   Presupuesto de meshes: el bucket 'zocalo' (piedra oscura de la casilla y del cartel) se fundió en 'plinto' (mismo
   tono, textura de revoque) para dar lugar a 'alero' y 'vidrioPuerta'.
   Texturas: PW.textures.canvas(name) (CanvasTexture) con UV en metros por cara; reflejos con un mapa equirectangular
   de cielo dibujado en canvas (three lo convierte a PMREM). Sin Math.random, sin fetch, sin imágenes externas. */
(function () {
  'use strict';
  window.PW = window.PW || {};

  PW.architecture = {
    build: function (ctx) {
      const THREE = ctx.THREE, D = ctx.data, T = ctx.terrain;
      const elevation = ctx.elevation || T.elevation;
      const makeRng = ctx.rng || PW.rng;
      const shadows = ctx.shadows !== false;
      const low = ctx.quality === 'low';
      const group = new THREE.Group(); group.name = 'architecture';
      const disposables = [];           /* geometrías, materiales y texturas propias */
      const keep = o => { disposables.push(o); return o; };
      const maxAniso = ctx.renderer && ctx.renderer.capabilities ? Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy() || 1) : 4;
      const rnd = makeRng(1618);

      /* ------------------------------------------------------------------ utilidades geométricas */
      function mat4(tx, ty, tz, ry, sx, sy, sz, rx, rz) {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
        m.compose(new THREE.Vector3(tx, ty, tz), q, new THREE.Vector3(sx || 1, sy || 1, sz || 1));
        return m;
      }
      /* Une geometrías (posición + normal + uv) en una sola no indexada. */
      function merge(parts) {
        const list = []; let count = 0;
        for (const p of parts) {
          let g = p.g; if (g.index) { const ni = g.toNonIndexed(); g.dispose(); g = ni; }
          if (p.m) g.applyMatrix4(p.m);
          if (!g.attributes.normal) g.computeVertexNormals();
          list.push(g); count += g.attributes.position.count;
        }
        const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2); let o = 0;
        for (const g of list) {
          pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
          if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
          o += g.attributes.position.count; g.dispose();
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        return out;
      }
      /* Acumuladores por material: cada entrada termina en UN mesh. */
      const buckets = {};
      function add(bucket, g, m) { (buckets[bucket] = buckets[bucket] || []).push({ g, m }); }
      /* UV de una BoxGeometry en metros por cara (u a lo ancho, v a lo alto). grain: el eje largo de cada cara pasa a u
         (la veta de la madera corre a lo largo de la pieza). off: corrimiento para que piezas vecinas no repitan el mismo tile. */
      function boxUV(g, w, h, d, grain, off) {
        const a = g.attributes.uv, ou = off ? off[0] : 0, ov = off ? off[1] : 0;
        for (let i = 0; i < a.count; i++) {
          const f = i >> 2; let fw, fh;
          if (f < 2) { fw = d; fh = h; } else if (f < 4) { fw = w; fh = d; } else { fw = w; fh = h; }
          let u = a.getX(i) * fw, v = a.getY(i) * fh;
          if (grain && fh > fw * 1.5) { const t = u; u = v; v = t; }
          a.setXY(i, u + ou, v + ov);
        }
      }
      /* Caja en coordenadas de plano: centro (cx, cy) en metros, base a altura absoluta yBase (mundo), giro ry en el plano.
         o: { grain:true (madera), off:[u,v], rx, rz } */
      function box(bucket, cx, cy, yBase, w, h, d, ry, o) {
        const g = new THREE.BoxGeometry(w, h, d); o = o || {};
        boxUV(g, w, h, d, o.grain, o.off);
        add(bucket, g, mat4(cx, yBase + h / 2, -cy, ry || 0, 1, 1, 1, o.rx, o.rz));
      }
      /* Plano vertical de (ax,ay) a (bx,by), base yBase, alto h, cara hacia la derecha del recorrido (exterior si el polígono gira antihorario). UV en metros. */
      function wallPlane(bucket, ax, ay, bx, by, yBase, h, offset, uvOff) {
        const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
        const g = new THREE.PlaneGeometry(len, h);
        const a = g.attributes.uv, ou = uvOff ? uvOff[0] : 0, ov = uvOff ? uvOff[1] : 0;
        for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * len + ou, a.getY(i) * h + ov);
        const nx = Math.sin(ang), ny = -Math.cos(ang), off = offset || 0;
        add(bucket, g, mat4((ax + bx) / 2 + nx * off, yBase + h / 2, -((ay + by) / 2 + ny * off), ang));
      }
      /* Plano horizontal mirando arriba, centro (cx, cy), altura y absoluta, w × d metros (UV en metros). */
      function flatPlane(bucket, cx, cy, y, w, d, ry) {
        const g = new THREE.PlaneGeometry(w, d); const a = g.attributes.uv;
        for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * w + cx, a.getY(i) * d + cy);
        add(bucket, g, mat4(cx, y, -cy, ry || 0, 1, 1, 1, -Math.PI / 2));
      }
      /* UV de cilindros/conos en metros (perímetro × alto). */
      function cylUV(g, circ, h) { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * circ, a.getY(i) * h); return g; }
      /* (lx, ly) locales girados ry alrededor de (ox, oy) → coordenadas de plano */
      const rot = (ox, oy, ry, lx, ly) => [ox + lx * Math.cos(ry) - ly * Math.sin(ry), oy + lx * Math.sin(ry) + ly * Math.cos(ry)];

      /* ------------------------------------------------------------------ texturas */
      function canvasTex(wpx, hpx, draw, repeat) {
        const c = document.createElement('canvas'); c.width = wpx; c.height = hpx;
        draw(c.getContext('2d'), wpx, hpx);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
        t.anisotropy = maxAniso; t.needsUpdate = true; return keep(t);
      }
      /* Texturas procedurales de PW.textures (map sRGB + bump/normal lineales) con repeat = 1 / metros por tile, memoizadas. */
      const TX = window.PW.textures && typeof PW.textures.canvas === 'function' ? PW.textures : null;
      const texCache = new Map();
      function tex(name, fallback) {
        if (texCache.has(name)) return texCache.get(name);
        let r = null, tile = null;
        if (TX) {
          try { r = TX.canvas(name, !low); tile = TX.tile && TX.tile[name]; } catch (e) { r = null; }
          if (!r && fallback) { try { r = TX.canvas(fallback, !low); tile = TX.tile && TX.tile[fallback]; } catch (e) { r = null; } }
        }
        const m = (tile && tile.m) || 1;
        const mk = (cv, linear) => {
          const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.anisotropy = maxAniso;
          t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.repeat.set(1 / m, 1 / m); t.needsUpdate = true; return keep(t);
        };
        const e = { map: r && r.map ? mk(r.map, false) : null, bump: r && r.bump ? mk(r.bump, true) : null, normal: r && r.normal ? mk(r.normal, true) : null, m, tile: tile || {} };
        texCache.set(name, e); return e;
      }
      /* cielo equirectangular dibujado en canvas: el renderer lo convierte a PMREM; lo usan vidrios, agua y metales */
      const envTex = (function () {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d');
        const sky = x.createLinearGradient(0, 0, 0, 64); sky.addColorStop(0, '#3C5FA3'); sky.addColorStop(0.5, '#8DB0D9'); sky.addColorStop(0.9, '#EFD5B0'); sky.addColorStop(1, '#F6E2C2');
        x.fillStyle = sky; x.fillRect(0, 0, 256, 64);
        const gnd = x.createLinearGradient(0, 64, 0, 128); gnd.addColorStop(0, '#C9C2A2'); gnd.addColorStop(0.12, '#88A35A'); gnd.addColorStop(1, '#4A6632');
        x.fillStyle = gnd; x.fillRect(0, 64, 256, 64);
        const sun = x.createRadialGradient(70, 44, 0, 70, 44, 34); sun.addColorStop(0, 'rgba(255,250,238,1)'); sun.addColorStop(0.14, 'rgba(255,232,190,0.85)'); sun.addColorStop(1, 'rgba(255,214,160,0)');
        x.fillStyle = sun; x.fillRect(0, 0, 256, 64);
        const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return keep(t);
      })();
      /* rejilla metálica del piso del portón */
      const texRejilla = canvasTex(64, 64, (x, w, h) => {
        x.fillStyle = '#2B2A28'; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) { x.fillStyle = '#6E6A63'; x.fillRect(0, i * 8, w, 3); x.fillStyle = '#8C877E'; x.fillRect(0, i * 8, w, 1); }
      });
      /* cartel "LE PETIT TRIANON": placa bordó, filete oro y letras doradas nítidas (2048 px de ancho) */
      const texCartel = canvasTex(2048, 768, (x, w, h) => {
        x.fillStyle = '#6B1018'; x.fillRect(0, 0, w, h);
        const vg = x.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(255,255,255,0.08)'); vg.addColorStop(1, 'rgba(0,0,0,0.18)'); x.fillStyle = vg; x.fillRect(0, 0, w, h);
        x.strokeStyle = '#D9B877'; x.lineWidth = 10; x.strokeRect(52, 52, w - 104, h - 104);
        x.strokeStyle = '#B8935A'; x.lineWidth = 3; x.strokeRect(84, 84, w - 168, h - 168);
        x.textAlign = 'center'; x.textBaseline = 'middle';
        const family = 'Newsreader, Georgia, "Times New Roman", serif';
        const spaced = (txt, size, weight, y, sp, fill, shadow) => {
          x.font = weight + ' ' + size + 'px ' + family; let tw = 0;
          for (const ch of txt) tw += x.measureText(ch).width + sp;
          let cx = w / 2 - (tw - sp) / 2;
          for (const ch of txt) {
            const cw = x.measureText(ch).width;
            if (shadow) { x.fillStyle = 'rgba(40,6,10,0.9)'; x.fillText(ch, cx + cw / 2 + 4, y + 5); }
            x.fillStyle = fill; x.fillText(ch, cx + cw / 2, y); cx += cw + sp;
          }
        };
        spaced('LE PETIT TRIANON', 168, '500', h / 2 - 48, 16, '#E3C27E', true);
        x.fillStyle = '#CFAD74'; x.fillRect(w / 2 - 130, h / 2 + 86, 260, 3);
        spaced('SAN BERNARDINO', 58, '400', h / 2 + 156, 10, '#D9B877', false);
      }, false);
      /* atlas de números de lote (8 celdas de 256 px): placa marfil con número bordó en serif y filete oro */
      const texNumeros = canvasTex(2048, 256, (x, w, h) => {
        for (let i = 0; i < 8; i++) {
          const ox = i * 256;
          x.fillStyle = '#F4EFE2'; x.fillRect(ox, 0, 256, 256);
          x.strokeStyle = '#B8935A'; x.lineWidth = 8; x.strokeRect(ox + 16, 16, 224, 224);
          x.strokeStyle = '#D9B877'; x.lineWidth = 2; x.strokeRect(ox + 30, 30, 196, 196);
          x.fillStyle = '#6B1018'; x.textAlign = 'center'; x.textBaseline = 'middle';
          x.font = '600 150px Newsreader, Georgia, "Times New Roman", serif';
          if (i > 0) x.fillText(String(i), ox + 128, 132);
        }
      }, false);

      /* ------------------------------------------------------------------ materiales (uno por bucket) */
      const std = o => keep(new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, o)));
      /* material con textura de PW.textures: o = { tint, plain (color sin textura), roughness, bumpScale, normalScale, extra } */
      function texMat(name, o) {
        o = o || {}; const t = tex(name, o.fallback);
        const m = std(Object.assign({ color: (t.map || t.normal) ? (o.tint !== undefined ? o.tint : 0xffffff) : (o.plain !== undefined ? o.plain : 0xC9C2B4), roughness: o.roughness !== undefined ? o.roughness : (t.tile.rough || 0.9) }, o.extra || {}));
        if (t.map) m.map = t.map;
        if (t.bump && o.bump !== false) { m.bumpMap = t.bump; m.bumpScale = o.bumpScale !== undefined ? o.bumpScale : (t.tile.bump || 0.02); }
        if (t.normal) { m.normalMap = t.normal; const s = o.normalScale !== undefined ? o.normalScale : (t.tile.normal || 0.4); m.normalScale = new THREE.Vector2(s, s); }
        return m;
      }
      const M = {
        /* revoque greige cálido, un tono más oscuro que la membrana (≈ #B0A99D a la luz) con el relieve del 'plaster';
           el zócalo (plinto) es el mismo revoque un tono más oscuro; también la base de la casilla y del cartel */
        revoque: texMat('plaster', { tint: 0xB8B1A5, plain: 0xB1AA9E, roughness: 0.88, bumpScale: 0.007 }),
        plinto: texMat('plaster', { tint: 0xADA69A, plain: 0xA79F93, roughness: 0.92, bumpScale: 0.006 }),   /* un solo tono por debajo del revoque: no se lee como zócalo pintado */
        /* losa de techo (membrana clara) — también el techo cónico de la casilla */
        losa: texMat('plaster', { tint: 0xCFCAC0, plain: 0xC9C4B9, roughness: 0.94, bumpScale: 0.003 }),
        /* cortina beige cálida con pliegues suaves, detrás del vidrio (de noche emite con su propio mapa: se ven los pliegues) */
        cortina: texMat('curtain', { tint: 0xA99B7F, plain: 0xA3957A, roughness: 1, bumpScale: 0.004 }),
        planta: std({ color: 0x4C7A3A, roughness: 0.85 }),
        piedra: texMat('stone', { tint: 0xFFFFFF, plain: 0x9A8E7A, roughness: 0.95, bumpScale: 0.06 }),
        piedraClara: texMat('paver', { tint: 0xE6DECF, plain: 0xD8D0BC, roughness: 0.82, bumpScale: 0.012 }),
        adoquin: texMat('paver', { tint: 0xC4BAA4, plain: 0xB9AE98, roughness: 0.95, bumpScale: 0.02 }),
        madera: texMat('wood', { fallback: 'deck', plain: 0xA47A46, roughness: 0.72 }),
        deck: texMat('deck', { plain: 0xA47A46, roughness: 0.78 }),
        varas: texMat('slatsAlpha', { plain: 0xA98E66, roughness: 0.9, extra: { alphaTest: 0.5, side: THREE.DoubleSide, transparent: false } }),
        /* antracita oscura (#383C40) pintada: marcos y parantes de ventanas, puerta, macetas, remates de la casilla */
        carpinteria: std({ color: 0x383C40, roughness: 0.55, metalness: 0.2, envMap: envTex, envMapIntensity: 0.4 }),
        /* antracita gris con algo de reflejo (#4A4E53): alero de entrada y sus parantes, pérgola de la cochera, sombrerete */
        alero: std({ color: 0x4A4E53, roughness: 0.5, metalness: 0.12, envMap: envTex, envMapIntensity: 0.7 }),
        /* vidrio de ventanas: oscuro, reflectante y semitransparente (la cortina se ve detrás, apagada); de noche apenas emisivo */
        ventana: std({ color: 0x2F3A41, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.58, depthWrite: false, envMap: envTex, envMapIntensity: 1.1, emissive: 0x000000 }),   /* vidrio oscuro reflectante; la cortina asoma apagada detrás */
        /* vidrio oscuro de la puerta (sobre la hoja antracita), con reflejo: un punto más claro y azulado que la hoja
           (0x2E373B se confundía con la hoja a la sombra del alero) */
        vidrioPuerta: std({ color: 0x2A3237, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.7, depthWrite: false, envMap: envTex, envMapIntensity: 0.45, emissive: 0x000000 }),
        agua: texMat('water', { tint: 0x3E9EC3, plain: 0x4FA3C7, roughness: 0.1, normalScale: 0.55, extra: { transparent: true, opacity: 0.76, depthWrite: false, envMap: envTex, envMapIntensity: 1.0 } }),
        poolTile: texMat('poolTile', { plain: 0x7CC4DC, roughness: 0.4 }),
        hierro: std({ color: 0x1F1B1A, roughness: 0.5, metalness: 0.7, envMap: envTex, envMapIntensity: 0.5 }),
        cabezal: std({ color: 0xF3E8D0, roughness: 0.3, metalness: 0, emissive: 0x000000 }),
        rejilla: std({ color: 0xFFFFFF, map: texRejilla, roughness: 0.5, metalness: 0.5 }),
        cartel: std({ color: 0xFFFFFF, map: texCartel, roughness: 0.55, emissive: 0xFFFFFF, emissiveMap: texCartel, emissiveIntensity: 0 }),
        numeros: std({ color: 0xFFFFFF, map: texNumeros, roughness: 0.7 }),
        tela: std({ color: 0xF4ECD9, roughness: 1, side: THREE.DoubleSide }),
      };
      /* el agua lleva su propio mapa de normales animado */
      const aguaNormal = M.agua.normalMap;
      /* de noche la cortina emite con su propio mapa (los pliegues modulan la luz; sin esto la ventana es un rectángulo plano) */
      if (M.cortina.map) M.cortina.emissiveMap = M.cortina.map;
      /* en móvil (quality 'low') solo proyectan sombra los volúmenes que la definen: cada bucket que proyecta cuesta un draw call más */
      const castList = low
        ? { revoque: true, plinto: true, madera: true, piedra: true, hierro: true, piedraClara: true, varas: true, carpinteria: true, alero: true }
        : { revoque: true, plinto: true, losa: true, madera: true, deck: true, piedra: true, hierro: true, piedraClara: true, varas: true, tela: true, carpinteria: true, alero: true, planta: true };
      const receiveList = { adoquin: true, piedraClara: true, madera: true, deck: true, revoque: true, plinto: true, losa: true, piedra: true, rejilla: true, poolTile: true, carpinteria: true, alero: true, cortina: true };

      /* ================================================================== (1) CASA MODELO · lote 1 (una sola planta) */
      const H = D.house, vols = H.volumes || [];
      const byName = n => vols.find(v => v.name.indexOf(n) === 0);
      const vPrincipal = byName('cuerpo principal'), vEste = byName('ala este'), vCochera = byName('ala norte'),
        vPergola = vols.find(v => v.pergola), vSur = byName('cuerpo sur');
      /* nivel de piso: la casa apoya nivelada sobre el punto más alto de su huella (+0,32 m para quedar por encima del
         prisma de césped del núcleo, lift 0,2); cada volumen baja hasta el terreno con su propio zócalo */
      let hb = -1e9, gmin = 1e9;
      vols.forEach(v => { [[v.x0, v.y0], [v.x1, v.y0], [v.x0, v.y1], [v.x1, v.y1]].forEach(c => { const e = elevation(c[0], c[1]); hb = Math.max(hb, e); gmin = Math.min(gmin, e); }); });
      hb += 0.32;
      const cx = v => (v.x0 + v.x1) / 2, cy = v => (v.y0 + v.y1) / 2, wx = v => v.x1 - v.x0, wy = v => v.y1 - v.y0;
      /* tramo de una fachada entre dos coordenadas de plano (x en N/S, y en E/W) → [ax, ay, bx, by] recorrido con la
         normal exterior a la derecha (S: x0→x1 · N: x1→x0 · E: y0→y1 · W: y1→y0) */
      function span(v, side, c0, c1) {
        const lo = Math.min(c0, c1), hi = Math.max(c0, c1);
        return side === 'S' ? [lo, v.y0, hi, v.y0] : side === 'N' ? [hi, v.y1, lo, v.y1] : side === 'E' ? [v.x1, lo, v.x1, hi] : [v.x0, hi, v.x0, lo];
      }
      /* ventana: un paño de vidrio reflectante con marco y parantes de antracita, alféizar de piedra clara y, detrás del
         vidrio, cortina beige (en los ventanales de ≥ 2,4 m, dos paños de cortina abiertos y la habitación oscura al medio).
         c0..c1 coordenadas de plano a lo largo de la fachada; yBase altura absoluta del vidrio; h alto; o = { full, panes, u } */
      function win(v, side, c0, c1, yBase, h, o) {
        o = o || {};
        const f = span(v, side, c0, c1), dx = f[2] - f[0], dy = f[3] - f[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = uy, ny = -ux, ang = Math.atan2(uy, ux);
        const at = (s, off) => [f[0] + ux * s + nx * off, f[1] + uy * s + ny * off];
        wallPlane('ventana', f[0], f[1], f[2], f[3], yBase, h, 0.045);                     /* vidrio 4,5 cm por delante del revoque */
        if (L >= 2.4 && !o.full) {
          const c = L * 0.36;
          wallPlane('cortina', f[0], f[1], f[0] + ux * c, f[1] + uy * c, yBase, h, 0.015, [o.u || 0, 0]);
          wallPlane('cortina', f[2] - ux * c, f[3] - uy * c, f[2], f[3], yBase, h, 0.015, [(o.u || 0) + 1.7, 0]);
          wallPlane('carpinteria', f[0] + ux * c, f[1] + uy * c, f[2] - ux * c, f[3] - uy * c, yBase, h, 0.012);
        } else wallPlane('cortina', f[0], f[1], f[2], f[3], yBase, h, 0.015, [o.u || 0, 0]);
        /* marco perimetral 7 cm × 9 cm de fondo y parantes cada ≈ 1,2 m */
        const fr = 0.07, dp = 0.09, mid = at(L / 2, dp / 2);
        box('carpinteria', mid[0], mid[1], yBase - fr, L + 2 * fr, fr, dp, ang);
        box('carpinteria', mid[0], mid[1], yBase + h, L + 2 * fr, fr, dp, ang);
        const l = at(-fr / 2, dp / 2), r = at(L + fr / 2, dp / 2);
        box('carpinteria', l[0], l[1], yBase - fr, fr, h + 2 * fr, dp, ang); box('carpinteria', r[0], r[1], yBase - fr, fr, h + 2 * fr, dp, ang);
        const n = o.panes || Math.max(1, Math.round(L / 1.2));
        for (let i = 1; i < n; i++) { const p = at(L * i / n, dp / 2); box('carpinteria', p[0], p[1], yBase, 0.05, h, dp, ang); }
        const sl = at(L / 2, 0.07); box('piedraClara', sl[0], sl[1], yBase - fr - 0.05, L + 2 * fr + 0.1, 0.05, 0.14, ang);
      }
      /* altura de losa de cada volumen: el cuerpo principal se limita a 3,1 m (escala del render: remate ≈ 3,4 con el
         parapeto de 0,3, por debajo de las alas de 3,2–3,3 + 0,25); el resto usa la altura de PW_DATA */
      const hv = v => (v === vPrincipal ? Math.min(v.h, 3.1) : v === vCochera ? Math.min(v.h, 2.8) : v.h);   /* carport bajo (viga a ≈ 2,7 m), como en el render */
      /* volumen de una planta: muros de revoque hasta el parapeto (ph), zócalo apenas más oscuro hasta el terreno y losa
         clara retranqueada 20 cm dentro del parapeto; cap: babeta fina y clara sobre el parapeto (opcional, no se usa) */
      function volume(v, ph, cap) {
        const h = hv(v), top = hb + h;
        box('plinto', cx(v), cy(v), gmin - 0.35, wx(v) + 0.04, (hb + 0.15) - (gmin - 0.35), wy(v) + 0.04);
        box('revoque', cx(v), cy(v), hb - 0.3, wx(v), h + 0.3 + ph, wy(v));
        box('losa', cx(v), cy(v), top - 0.05, wx(v) - 0.4, 0.15, wy(v) - 0.4);
        if (cap) {   /* babeta clara de 10 cm × 2,5 cm sobre el parapeto (los tramos E/W se acortan en las esquinas) */
          const t = 0.10, y = top + ph;
          box('losa', cx(v), v.y0 + 0.04, y, wx(v) + 0.04, 0.025, t); box('losa', cx(v), v.y1 - 0.04, y, wx(v) + 0.04, 0.025, t);
          box('losa', v.x0 + 0.04, cy(v), y, t, 0.025, wy(v) - 2 * t + 0.04); box('losa', v.x1 - 0.04, cy(v), y, t, 0.025, wy(v) - 2 * t + 0.04);
        }
      }
      /* puerta doble oscura: tramo (ax,ay)→(bx,by) de la fachada (normal exterior a la derecha), marco, dos hojas de
         antracita con paño de vidrio oscuro en los 2/3 superiores (panel ciego abajo) y tiradores verticales a 0,45 h */
      function glassDoor(ax, ay, bx, by, yBase, h) {
        const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax), ux = (bx - ax) / len, uy = (by - ay) / len, nx = Math.sin(ang), ny = -Math.cos(ang);
        const mx = (ax + bx) / 2, my = (ay + by) / 2, g0 = yBase + h * 0.34, g1 = yBase + h - 0.14, gw = len / 4 - 0.14;
        box('carpinteria', mx + nx * 0.04, my + ny * 0.04, yBase - 0.02, len + 0.14, h + 0.08, 0.08, ang);
        for (const k of [-1, 1]) {
          const lx = mx + ux * k * len / 4, ly = my + uy * k * len / 4;
          box('carpinteria', lx + nx * 0.085, ly + ny * 0.085, yBase, len / 2 - 0.02, h, 0.05, ang);
          wallPlane('vidrioPuerta', lx - ux * gw, ly - uy * gw, lx + ux * gw, ly + uy * gw, g0, g1 - g0, 0.115);
          box('hierro', lx - ux * k * 0.07 + nx * 0.145, ly - uy * k * 0.07 + ny * 0.145, yBase + h * 0.45 - 0.17, 0.025, 0.34, 0.025, ang);
        }
      }
      const sconces = [];  /* apliques de pared: [x, y, yCentroDelVidrio] (halo de noche) */
      /* farol de pared de cuatro caras (0,18 × 0,38: placa y brazo de hierro, cuerpo de vidrio cálido, capucha y remate),
         el mismo diseño que las linternas del portón a escala 0,6; y = altura del centro; ang = normal de la fachada */
      function sconce(px, py, y, ang) {
        const nx = Math.sin(ang), ny = -Math.cos(ang), ox = px + nx * 0.15, oy = py + ny * 0.15;
        box('hierro', px + nx * 0.01, py + ny * 0.01, y - 0.06, 0.08, 0.12, 0.02, ang);
        box('hierro', px + nx * 0.08, py + ny * 0.08, y - 0.015, 0.03, 0.03, 0.16, ang);
        sconces.push([ox, oy, lanternHead(ox, oy, y - 0.19, 0.6)]);
      }
      /* maceta negra con planta densa: cilindro de antracita, cogollo y dos verticilos de hojas anchas (tarjetas verdes
         abiertas en abanico, inclinación rz y giro ry: la base de cada hoja queda en el centro de la maceta) */
      function planter(px, py, yBase, seed) {
        const r = makeRng(seed);
        add('carpinteria', new THREE.CylinderGeometry(0.26, 0.21, 0.52, low ? 8 : 12, 1), mat4(px, yBase + 0.26, -py));
        add('planta', new THREE.SphereGeometry(0.22, 6, 5), mat4(px, yBase + 0.62, -py, 0, 1, 0.7, 1));
        const n = low ? 7 : 11;
        const leaf = (a, tilt, len, w) => { const k = len / 2 * Math.sin(tilt); box('planta', px - Math.cos(a) * k, py + Math.sin(a) * k, yBase + 0.56 - len / 2 * (1 - Math.cos(tilt)), w, len, 0.012, -a, { rz: tilt }); };
        for (let i = 0; i < n; i++) leaf(i / n * Math.PI * 2 + r() * 0.4, 0.45 + r() * 0.45, 0.6 + r() * 0.4, 0.17);      /* verticilo alto */
        for (let i = 0; i < n; i++) leaf((i + 0.5) / n * Math.PI * 2 + r() * 0.3, 0.85 + r() * 0.3, 0.4 + r() * 0.18, 0.14);  /* verticilo bajo, más abierto */
      }

      /* --- volúmenes de una planta (losa plana y parapeto claro, sin remate oscuro): el cuerpo principal a 3,1 + 0,3 --- */
      if (vPrincipal) volume(vPrincipal, 0.3, false);
      if (vEste) volume(vEste, 0.25, false);
      if (vSur) volume(vSur, 0.25, false);
      vols.forEach(v => { if (v.pergola || v === vPrincipal || v === vEste || v === vSur || v === vCochera) return; volume(v, 0.25, false); });
      /* --- cuerpo principal: entrada en la fachada oeste (hacia la calle) --- */
      const dy0 = 15.7, dy1 = 17.3;                                /* puerta doble de 1,6 m centrada en y 16,5 */
      if (vPrincipal) {
        const v = vPrincipal, h = hv(v);
        win(v, 'W', 19.3, 22.4, hb + 0.8, 1.7);                   /* ventanal junto a la entrada (dintel 2,5, bajo el alero) */
        win(v, 'S', 45.9, 47.7, hb + 0.9, 1.4);                   /* patio lateral sur */
        win(v, 'E', 22.2, 24.0, hb + 0.9, 1.5);                   /* hacia el jardín este */
        win(v, 'N', 53.1, 54.3, hb + 1.3, 1.0);                   /* junto a la cochera */
        win(v, 'N', 47.6, 49.6, hb + 1.6, 0.8);                   /* alta, al fondo de la cochera */
        glassDoor(v.x0, dy1, v.x0, dy0, hb, 2.15);
        sconce(v.x0, dy1 + 0.55, hb + 2.05, -Math.PI / 2); sconce(v.x0, dy0 - 0.55, hb + 2.05, -Math.PI / 2);   /* −π/2: miran al oeste */
        /* chimenea: conducto esbelto de hierro (ø 0,26 × 1,1) con sombrerete, en la esquina NE de la losa principal */
        const chs = low ? 8 : 10;
        add('hierro', new THREE.CylinderGeometry(0.13, 0.13, 1.1, chs, 1), mat4(53.4, hb + h + 0.1 + 0.55, -23.3));
        add('alero', new THREE.CylinderGeometry(0.21, 0.19, 0.06, chs, 1), mat4(53.4, hb + h + 1.2 + 0.03, -23.3));
      }
      /* --- ala este (quincho / deck seco): ventanal hacia el deck de la pileta, un farol --- */
      if (vEste) {
        const v = vEste;
        win(v, 'E', 16.8, 20.6, hb + 0.35, 2.3, { u: 3 });
        win(v, 'N', 56.8, 58.6, hb + 0.9, 1.4); win(v, 'S', 56.8, 58.6, hb + 0.9, 1.4);
        sconce(v.x1, 21.3, hb + 2.05, Math.PI / 2);                /* mira al este */
      }
      /* --- cuerpo sur (dormitorios): ventana hacia la calle flanqueada por faroles, dos al sur, una al este --- */
      if (vSur) {
        const v = vSur;
        win(v, 'W', 11.5, 13.5, hb + 0.85, 1.5);
        win(v, 'S', 49.0, 50.6, hb + 0.9, 1.4); win(v, 'S', 52.3, 53.9, hb + 0.9, 1.4);
        win(v, 'E', 11.9, 13.4, hb + 0.9, 1.4);
        sconce(v.x0, 11.0, hb + 2.05, -Math.PI / 2); sconce(v.x0, 14.0, hb + 2.05, -Math.PI / 2);
      }
      /* --- cochera abierta (carport): piso de adoquines que continúa el driveway y pérgola liviana de acero antracita gris
             (dos vigas longitudinales 0,10 × 0,25, travesaños 0,06 × 0,14 cada ≈ 1,15 m) sobre tres pilares del lado norte;
             la viga sur apoya en el muro norte del cuerpo principal; sin paredes --- */
      if (vCochera) {
        const v = vCochera, top = hb + hv(v);
        box('adoquin', cx(v), cy(v), gmin - 0.35, wx(v), (hb - 0.02) - (gmin - 0.35), wy(v));
        box('piedraClara', cx(v), v.y1 - 0.08, hb - 0.1, wx(v), 0.12, 0.16);                         /* cordón norte */
        box('alero', cx(v), v.y0 + 0.12, top - 0.25, wx(v) + 0.1, 0.25, 0.1);
        box('alero', cx(v), v.y1 - 0.17, top - 0.25, wx(v) + 0.1, 0.25, 0.1);
        const n = Math.max(3, Math.round(wx(v) / 1.15));
        for (let k = 0; k <= n; k++) box('alero', v.x0 + 0.08 + (wx(v) - 0.16) * k / n, cy(v), top - 0.18, 0.06, 0.14, wy(v) - 0.1);
        [[v.x0 + 0.17, v.y1 - 0.17], [cx(v), v.y1 - 0.17], [v.x1 - 0.17, v.y1 - 0.17]].forEach(p => box('alero', p[0], p[1], hb - 0.02, 0.12, hv(v) - 0.23, 0.12));
      }
      /* --- acceso: tarima de piedra clara frente a la puerta, alero delgado sobre dos parantes, macetas y camino de losas.
             La huella del volumen "acceso / pérgola oeste" queda en césped (el prisma del lote), salvo la tarima --- */
      if (vPrincipal) {
        const v = vPrincipal, sw = 0.36, px0 = v.x0 - 3.0, ty0 = 14.3, ty1 = 18.7;
        /* tarima 3,0 × 4,4 m a nivel de piso (hb), centrada en la puerta (y 16,5) */
        /* la tarima queda un peldaño por debajo del umbral (hb − 0,15) para que sus cantos laterales sean bajos */
        box('piedraClara', (px0 + v.x0) / 2, (ty0 + ty1) / 2, gmin - 0.35, v.x0 - px0, (hb - 0.15) - (gmin - 0.35), ty1 - ty0);
        /* dos escalones de 0,36 m hacia el oeste, a todo el ancho de la tarima; la contrahuella se reparte el desnivel real
           hasta el césped (prisma del lote: elevación + 0,2) para que el escalón inferior quede apenas por encima del pasto */
        const sy0 = ty0, sy1 = ty1, sx = px0 - sw * 2;
        const lawn = Math.max(elevation(sx, sy0), elevation(sx, sy1), elevation(sx, (sy0 + sy1) / 2)) + 0.2;
        const rise = Math.min(0.17, Math.max(0.08, (hb - 0.17 - lawn) / 2));
        for (let k = 1; k <= 2; k++) box('piedraClara', px0 - sw * (k - 0.5), (sy0 + sy1) / 2, gmin - 0.35, sw, (hb - 0.15 - rise * k) - (gmin - 0.35), sy1 - sy0);
        /* macetas sobre la tarima, a ±0,75 m de la puerta */
        planter(v.x0 - 0.6, dy1 + 0.75, hb, 71); planter(v.x0 - 0.6, dy0 - 0.75, hb, 72);
        /* alero: losa delgada (0,15 m) de antracita gris pegada a la fachada oeste, que cubre la puerta y el ventanal
           (y 14,6–22,8), vuela 2,2 m y remata a hb + 2,75 (bajo el parapeto); dos parantes de 0,10 m en las esquinas exteriores */
        const ay0 = 14.6, ay1 = 22.8, cd = 2.2, th = 0.15, aTop = hb + 2.75;
        box('alero', v.x0 - cd / 2 + 0.03, (ay0 + ay1) / 2, aTop - th, cd + 0.06, th, ay1 - ay0);
        [[v.x0 - cd + 0.05, ay0 + 0.2], [v.x0 - cd + 0.05, ay1 - 0.2]].forEach(p => { const b = elevation(p[0], p[1]) + 0.05; box('alero', p[0], p[1], b, 0.10, aTop - th - b, 0.10); });
        /* camino de losas de piedra sobre el césped, desde la vereda hasta los escalones, alineado con la puerta (y 16,5) */
        {
          const y = 16.5, lot1 = D.lots.find(l => l.id === 1), side = lot1 && (lot1.sides || []).filter(s => s.calle).sort((a, b) => b.len - a.len)[0];
          let xs = px0 - 4; if (side && Math.abs(side.b[1] - side.a[1]) > 1e-6) xs = side.a[0] + (side.b[0] - side.a[0]) * (y - side.a[1]) / (side.b[1] - side.a[1]);
          for (let s = xs + 0.55; s < sx - 0.45; s += 0.95) box('piedraClara', s, y, elevation(s, y) + 0.2, 0.7, 0.06, 0.55, 0, { off: [s, 0] });
        }
      }

      /* pileta: vaso con venecitas (1,5 m), borde de piedra clara, deck de madera con veta, reposeras y sombrilla */
      if (H.pool) {
        const p = H.pool, pcx = (p.x0 + p.x1) / 2, pcy = (p.y0 + p.y1) / 2, pw = p.x1 - p.x0, pd = p.y1 - p.y0;
        const dk = p.deck || { x0: p.x0 - 1, y0: p.y0 - 1, x1: p.x1 + 1, y1: p.y1 + 1 };
        let pb = -1e9; [[dk.x0, dk.y0], [dk.x1, dk.y0], [dk.x0, dk.y1], [dk.x1, dk.y1]].forEach(c => pb = Math.max(pb, elevation(c[0], c[1])));
        const top = vols.length ? hb + 0.12 : pb + 0.45, bw = 0.35, base = pb - 0.5;
        const bx0 = p.x0 - bw, bx1 = p.x1 + bw, by0 = p.y0 - bw, by1 = p.y1 + bw;
        /* deck: marco de tablas entre el rectángulo del deck y el borde de piedra */
        box('deck', (dk.x0 + bx0) / 2, (dk.y0 + dk.y1) / 2, base, Math.max(0.05, bx0 - dk.x0), top - base, dk.y1 - dk.y0);
        box('deck', (dk.x1 + bx1) / 2, (dk.y0 + dk.y1) / 2, base, Math.max(0.05, dk.x1 - bx1), top - base, dk.y1 - dk.y0);
        box('deck', (bx0 + bx1) / 2, (dk.y0 + by0) / 2, base, bx1 - bx0, top - base, Math.max(0.05, by0 - dk.y0));
        box('deck', (bx0 + bx1) / 2, (dk.y1 + by1) / 2, base, bx1 - bx0, top - base, Math.max(0.05, dk.y1 - by1));
        /* borde de piedra clara, 3 cm por encima del deck, redondeado hacia el agua con un escalón fino */
        box('piedraClara', (bx0 + p.x0) / 2, pcy, base, bw, top + 0.03 - base, by1 - by0);
        box('piedraClara', (bx1 + p.x1) / 2, pcy, base, bw, top + 0.03 - base, by1 - by0);
        box('piedraClara', pcx, (by0 + p.y0) / 2, base, pw, top + 0.03 - base, bw);
        box('piedraClara', pcx, (by1 + p.y1) / 2, base, pw, top + 0.03 - base, bw);
        /* vaso: piso + 4 paredes mirando hacia adentro, con venecitas */
        const depth = 1.5, floorY = top - depth;
        flatPlane('poolTile', pcx, pcy, floorY, pw, pd);
        wallPlane('poolTile', p.x1, p.y0, p.x0, p.y0, floorY, depth, 0);   /* pared sur, mira al norte (adentro) */
        wallPlane('poolTile', p.x0, p.y1, p.x1, p.y1, floorY, depth, 0);   /* pared norte */
        wallPlane('poolTile', p.x0, p.y0, p.x0, p.y1, floorY, depth, 0);   /* pared oeste, mira al este */
        wallPlane('poolTile', p.x1, p.y1, p.x1, p.y0, floorY, depth, 0);   /* pared este */
        /* escalones de ingreso en la esquina */
        [[0.0, 0.26], [0.3, 0.52], [0.6, 0.78]].forEach(s => box('piedraClara', p.x0 + 0.65, p.y0 + 0.2 + s[0] * 1.1 + 0.3, top - s[1], 1.3, 0.1, 0.6));
        /* lámina de agua 12 cm bajo el borde */
        flatPlane('agua', pcx, pcy, top - 0.12, pw, pd);
        /* reposeras con colchoneta y sombrilla sobre el deck (lado norte) */
        if (dk.y1 - by1 > 0.5 || dk.x1 - bx1 > 0.5) {
          const ly = by1 + Math.max(0.4, (dk.y1 - by1) / 2), lx0 = pcx - 1.3;
          for (let k = 0; k < 2; k++) {
            const lx = lx0 + k * 1.45;
            box('madera', lx, ly, top + 0.24, 0.68, 0.05, 1.9, 0, { grain: true });
            box('tela', lx, ly - 0.15, top + 0.29, 0.6, 0.07, 1.4);
            box('tela', lx, ly + 0.55, top + 0.29, 0.6, 0.07, 0.5, 0, { rx: -0.9 });
            box('madera', lx, ly + 0.62, top + 0.3, 0.68, 0.04, 0.5, 0, { grain: true, rx: -0.9 });
            for (const q of [-1, 1]) { box('carpinteria', lx + q * 0.3, ly - 0.6, top, 0.04, 0.26, 0.04); box('carpinteria', lx + q * 0.3, ly + 0.6, top, 0.04, 0.26, 0.04); }
          }
          const ux = lx0 + 2.3;
          add('hierro', new THREE.CylinderGeometry(0.025, 0.03, 2.3, 6, 1), mat4(ux, top + 1.15, -ly));
          add('tela', new THREE.ConeGeometry(1.15, 0.38, 8, 1, true), mat4(ux, top + 2.12, -ly));
          add('hierro', new THREE.SphereGeometry(0.04, 6, 5), mat4(ux, top + 2.34, -ly));
          /* mesita baja de madera entre las reposeras */
          box('madera', lx0 + 0.72, ly - 0.2, top + 0.3, 0.45, 0.04, 0.45, 0, { grain: true });
          box('carpinteria', lx0 + 0.72, ly - 0.2, top, 0.3, 0.3, 0.3);
        }
      }

      /* driveway: cinta de adoquines que sigue el terreno desde la calle hasta la cochera, con cordón a los lados */
      if (H.driveway) {
        const d = H.driveway, ax = d.from[0], ay = d.from[1], bx = d.to[0], by = d.to[1];
        const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux, hw = (d.width || 3) / 2, n = 16;
        const pos = [], uvs = [], idx = [];
        for (let i = 0; i <= n; i++) {
          const s = L * i / n, px = ax + ux * s, py = ay + uy * s;
          const lift = 0.12 + 0.17 * Math.min(1, s / 3.5); /* sube desde la vereda hasta el nivel del podio */
          for (const k of [-1, 1]) { const x = px + nx * hw * k, y = py + ny * hw * k; pos.push(x, elevation(x, y) + lift, -y); uvs.push(s, k * hw); }
          if (i < n) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
        add('adoquin', g, null);
        for (const k of [-1, 1]) {
          const m = Math.max(1, Math.round(L / 3));
          for (let i = 0; i < m; i++) { const s0 = L * i / m, s1 = L * (i + 1) / m, sm = (s0 + s1) / 2, x = ax + ux * sm + nx * (hw + 0.08) * k, y = ay + uy * sm + ny * (hw + 0.08) * k; box('piedraClara', x, y, elevation(x, y) - 0.1, s1 - s0 + 0.02, 0.26 + 0.17 * Math.min(1, sm / 3.5), 0.16, Math.atan2(uy, ux)); }
        }
      }

      /* ================================================================== (2) PORTÓN, CASILLA, REJILLA Y CARTEL */
      const F = D.front, G = F.gate, yw = F.y_wall, gx0 = G.x0, gx1 = G.x1;
      const lanterns = []; /* posiciones de faroles de pilar (luz nocturna) */
      /* farol de cuatro caras: base, cuerpo de vidrio, varillas de esquina, capucha piramidal y remate */
      function lanternHead(px, py, yb, s) {
        s = s || 1;
        box('hierro', px, py, yb, 0.3 * s, 0.03, 0.3 * s);
        box('cabezal', px, py, yb + 0.03, 0.24 * s, 0.32 * s, 0.24 * s);
        if (!low) for (const q of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box('hierro', px + q[0] * 0.12 * s, py + q[1] * 0.12 * s, yb + 0.03, 0.022, 0.32 * s, 0.022);
        add('hierro', new THREE.ConeGeometry(0.22 * s, 0.17 * s, 4), mat4(px, yb + 0.035 + 0.32 * s + 0.085 * s, -py, Math.PI / 4));
        add('hierro', new THREE.SphereGeometry(0.035, 6, 5), mat4(px, yb + 0.035 + 0.32 * s + 0.17 * s + 0.02, -py));
        return yb + 0.03 + 0.16 * s;
      }
      function pillar(px, py) {
        const e = elevation(px, py);
        box('piedra', px, py, e - 0.3, 0.62, 2.7, 0.62, 0, { off: [rnd() * 2, rnd() * 2] });
        box('piedraClara', px, py, e + 2.4, 0.78, 0.08, 0.78);
        box('piedraClara', px, py, e + 2.48, 0.66, 0.06, 0.66);
        lanterns.push([px, py, lanternHead(px, py, e + 2.54, 1.15)]);
      }
      pillar(gx0 - 0.31, yw); pillar(gx1 + 0.31, yw);
      /* hojas de reja abiertas hacia adentro (dos por carril): travesaños, zócalo, barrotes con punta de lanza */
      function leaf(hx, hy, w, dir, theta) {
        const e = elevation(hx, hy), ex = dir * Math.cos(theta), ey = Math.sin(theta), ang = Math.atan2(ey, ex);
        const at = s => [hx + ex * s, hy + ey * s];
        const mid = at(w / 2);
        box('hierro', mid[0], mid[1], e + 0.1, w, 0.16, 0.04, ang);     /* zócalo */
        box('hierro', mid[0], mid[1], e + 1.0, w, 0.05, 0.045, ang);    /* travesaño medio */
        box('hierro', mid[0], mid[1], e + 1.95, w, 0.06, 0.045, ang);   /* travesaño alto */
        const n = Math.max(2, Math.round(w / 0.13));
        for (let i = 0; i <= n; i++) {
          const p = at(w * i / n); box('hierro', p[0], p[1], e + 0.25, 0.025, 1.95, 0.025);
          if (!low && i % 2 === 0) add('hierro', new THREE.ConeGeometry(0.03, 0.12, 4), mat4(p[0], e + 2.26, -p[1], Math.PI / 4));
        }
        const tip = at(w); box('hierro', tip[0], tip[1], e + 0.05, 0.06, 2.25, 0.06); box('hierro', hx, hy, e + 0.05, 0.06, 2.25, 0.06);
        add('hierro', new THREE.SphereGeometry(0.05, 6, 5), mat4(tip[0], e + 2.34, -tip[1]));
      }
      const L = G.lanes || { entrada: [gx0, (gx0 + gx1) / 2], salida: [(gx0 + gx1) / 2, gx1] };
      const open = 1.36;
      [L.entrada, L.salida].forEach(lane => {
        const w = (lane[1] - lane[0]) / 2 - 0.08;
        leaf(lane[0], yw, w, 1, open); leaf(lane[1], yw, w, -1, open);
      });
      [L.entrada[1], L.salida[0]].forEach(px => { const e = elevation(px, yw); box('hierro', px, yw, e - 0.2, 0.14, 2.45, 0.14); box('hierro', px, yw, e + 2.25, 0.2, 0.04, 0.2); add('hierro', new THREE.SphereGeometry(0.06, 6, 5), mat4(px, e + 2.34, -yw)); });
      /* casilla redonda del portero: zócalo, revoque, ventana corrida con marco, techo cónico y remate */
      if (G.booth) {
        const b = G.booth, bcx = (b.x0 + b.x1) / 2, bcy = (b.y0 + b.y1) / 2, r = Math.max(0.5, (b.x1 - b.x0) / 2), e = elevation(bcx, bcy), seg = low ? 14 : 24;
        add('revoque', cylUV(new THREE.CylinderGeometry(r, r, 2.6, seg, 1), 2 * Math.PI * r, 2.6), mat4(bcx, e - 0.3 + 1.3, -bcy));
        add('plinto', cylUV(new THREE.CylinderGeometry(r + 0.03, r + 0.03, 0.35, seg, 1), 2 * Math.PI * r, 0.35), mat4(bcx, e - 0.3 + 0.175 + 0.2, -bcy));
        add('piedraClara', new THREE.CylinderGeometry(r + 0.14, r + 0.18, 0.1, seg, 1), mat4(bcx, e + 0.05, -bcy));
        add('carpinteria', new THREE.CylinderGeometry(r + 0.01, r + 0.01, 0.85, seg, 1, true), mat4(bcx, e + 1.72, -bcy));   /* fondo oscuro tras el vidrio */
        add('ventana', new THREE.CylinderGeometry(r + 0.02, r + 0.02, 0.85, seg, 1, true), mat4(bcx, e + 1.72, -bcy));
        add('carpinteria', new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.05, seg, 1), mat4(bcx, e + 1.27, -bcy));
        add('carpinteria', new THREE.CylinderGeometry(r + 0.04, r + 0.04, 0.05, seg, 1), mat4(bcx, e + 2.17, -bcy));
        add('losa', new THREE.ConeGeometry(r + 0.46, 0.95, seg, 1), mat4(bcx, e + 2.3 + 0.475, -bcy));
        add('carpinteria', new THREE.CylinderGeometry(r + 0.47, r + 0.5, 0.07, seg, 1), mat4(bcx, e + 2.3, -bcy));
        add('hierro', new THREE.SphereGeometry(0.07, 8, 6), mat4(bcx, e + 3.28, -bcy));
      }
      /* rejilla metálica en el piso entre pilares */
      {
        const g = new THREE.PlaneGeometry(gx1 - gx0, 0.8); const a = g.attributes.uv; for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * (gx1 - gx0) / 0.5, a.getY(i) * 1.6);
        add('rejilla', g, mat4((gx0 + gx1) / 2, elevation((gx0 + gx1) / 2, yw) + 0.135, -yw, 0, 1, 1, 1, -Math.PI / 2));
      }
      /* cartel de piedra a la derecha del portón, mirando a la ruta: placa bordó con letras doradas y repisa de hierro */
      {
        const sx = gx1 + 0.62 + 0.35 + 1.75, e = elevation(sx, yw);
        box('piedra', sx, yw, e - 0.3, 3.5, 2.25, 0.55, 0, { off: [1.3, 0.4] });
        box('piedraClara', sx, yw, e + 1.95, 3.66, 0.08, 0.7);
        box('piedraClara', sx, yw, e + 2.03, 3.56, 0.05, 0.6);
        box('plinto', sx, yw, e - 0.3, 3.6, 0.5, 0.65);
        const sg = new THREE.PlaneGeometry(2.72, 1.02);
        add('cartel', sg, mat4(sx, e + 1.14, -(yw - 0.292), 0));
        box('hierro', sx, yw - 0.29, e + 0.58, 2.82, 0.04, 0.08);
        box('hierro', sx, yw - 0.29, e + 1.68, 2.82, 0.03, 0.05);
      }

      /* ================================================================== (3) CERCO PERIMETRAL */
      const S = D.site.polygon, nS = S.length;
      const xAtY = (a, b, y) => a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]);
      const fenceLines = [];
      for (let i = 0; i < nS; i++) {
        const a = S[i], b = S[(i + 1) % nS];
        if (Math.abs(a[1]) < 1e-6 && Math.abs(b[1]) < 1e-6) {
          /* frente: el muro corre por la línea y_wall, interrumpido en el portón */
          const prev = S[(i - 1 + nS) % nS], next = S[(i + 2) % nS];
          const xe = xAtY(a, prev, yw), xw = xAtY(b, next, yw);
          const lo = Math.min(xe, xw), hi = Math.max(xe, xw);
          fenceLines.push([[hi, yw], [gx1 + 0.62, yw]]);
          fenceLines.push([[gx0 - 0.62, yw], [lo, yw]]);
          continue;
        }
        let pa = a.slice(), pb = b.slice();
        if (pa[1] < yw) pa = [xAtY(a, b, yw), yw];
        if (pb[1] < yw) pb = [xAtY(a, b, yw), yw];
        fenceLines.push([pa, pb]);
      }
      fenceLines.forEach(line => {
        const a = line[0], b = line[1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.5) return;
        const n = Math.max(1, Math.ceil(len / 3.2)), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          const x0 = a[0] + (b[0] - a[0]) * t0, y0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, y1 = a[1] + (b[1] - a[1]) * t1;
          const e0 = elevation(x0, y0), e1 = elevation(x1, y1), eMin = Math.min(e0, e1), eMax = Math.max(e0, e1), sl = len / n;
          const yBase = eMin - 0.35, top = eMax + 0.6;
          box('piedra', (x0 + x1) / 2, (y0 + y1) / 2, yBase, sl + 0.02, top - yBase, 0.36, ang, { off: [i * 1.7 + rnd(), rnd() * 1.5] });
          box('piedraClara', (x0 + x1) / 2, (y0 + y1) / 2, top, sl + 0.02, 0.05, 0.42, ang);
          wallPlane('varas', x0, y0, x1, y1, top + 0.05, 1.45, 0, [i * sl, 0]);
          box('madera', (x0 + x1) / 2, (y0 + y1) / 2, top + 1.48, sl + 0.02, 0.06, 0.1, ang, { grain: true, off: [i * 1.3, 0] });
          box('madera', x0, y0, top + 0.03, 0.1, 1.55, 0.1, ang, { grain: true });
        }
        box('madera', b[0], b[1], Math.max(elevation(b[0], b[1]), elevation(a[0], a[1])) + 0.63, 0.1, 1.55, 0.1, ang, { grain: true });
      });

      /* ================================================================== (4) FAROLES */
      const lamps = [];
      {
        const C = D.road.centerline, step = 14; let acc = 0, nextAt = 6, side = 1;
        for (let i = 1; i < C.length; i++) {
          const a = C[i - 1], b = C[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (b[1] < yw + 1.5) continue;
          let s = 0;
          while (acc + (seg - s) >= nextAt) {
            const ds = nextAt - acc, t = (s + ds) / seg, px = a[0] + (b[0] - a[0]) * t, py = a[1] + (b[1] - a[1]) * t;
            const ux = (b[0] - a[0]) / seg, uy = (b[1] - a[1]) / seg;
            const half = (i >= (D.road.i_arc_start || 33) ? D.road.ancho_calle_oeste : D.road.ancho_calle_ns) / 2 + 0.8;
            lamps.push([px - uy * half * side, py + ux * half * side]);
            side = -side; acc = 0; s += ds; nextAt = step;
          }
          acc += seg - s;
        }
      }
      const lampHeads = [];
      lamps.forEach(p => {
        const e = elevation(p[0], p[1]), seg = low ? 6 : 10;
        add('hierro', new THREE.CylinderGeometry(0.12, 0.16, 0.4, seg, 1), mat4(p[0], e - 0.1 + 0.2, -p[1]));
        add('hierro', new THREE.CylinderGeometry(0.045, 0.07, 3.6, seg, 1, true), mat4(p[0], e + 0.3 + 1.8, -p[1]));
        add('hierro', new THREE.CylinderGeometry(0.09, 0.05, 0.12, seg, 1), mat4(p[0], e + 3.9 + 0.06, -p[1]));
        lampHeads.push([p[0], p[1], lanternHead(p[0], p[1], e + 3.96, 1.0)]);
      });

      /* ================================================================== (5) MOBILIARIO: bancos y tótems */
      function bench(x, y, fx, fy) {
        const e = elevation(x, y), ry = Math.atan2(fx, -fy), lx = Math.cos(ry), ly = Math.sin(ry);
        for (const k of [-0.16, 0, 0.16]) box('madera', x + fx * k, y + fy * k, e + 0.42, 1.6, 0.04, 0.13, ry, { grain: true, off: [k * 3, 0] });
        for (const k of [0.28, 0.5]) { const p = rot(x, y, ry, 0, 0.22); box('madera', p[0] + 0, p[1], e + k + 0.2, 1.6, 0.13, 0.04, ry, { grain: true, off: [k * 2, 0] }); }
        for (const k of [-1, 1]) {
          box('hierro', x + lx * 0.66 * k, y + ly * 0.66 * k, e - 0.05, 0.04, 0.47, 0.44, ry);
          const bp = rot(x, y, ry, 0.66 * k, 0.22); box('hierro', bp[0], bp[1], e + 0.42, 0.04, 0.5, 0.04, ry);
        }
      }
      {
        const C = D.road.centerline, ia = D.road.i_arc_start || 33, ib = D.road.i_arc_end || 47, k = Math.round((ia + ib) / 2);
        const a = C[k - 1], b = C[k + 1], ux = b[0] - a[0], uy = b[1] - a[1], l = Math.hypot(ux, uy) || 1, off = D.road.ancho_calle_oeste / 2 + 0.75;
        const nx = -uy / l, ny = ux / l; /* lado exterior de la curva (izquierda del recorrido) */
        bench(C[k][0] + nx * off, C[k][1] + ny * off, -nx, -ny);
        const ee = D.road.east_end || C[C.length - 1];
        bench(ee[0] - 4, ee[1] + D.road.ancho_calle_oeste / 2 + 0.75, 0, -1);
      }
      const lotMarkers = {};
      D.lots.forEach(l => {
        const sides = (l.sides || []).filter(s => s.calle); if (!sides.length) return;
        const s = sides.reduce((m, c) => (c.len > m.len ? c : m), sides[0]);
        const nx = s.n[0], ny = s.n[1], x = s.mid[0] - nx * 0.75, y = s.mid[1] - ny * 0.75, e = elevation(x, y);
        const ang = Math.atan2(nx, -ny); /* el frente (+z local) mira a la calle */
        const ry = Math.atan2(ny, nx) - Math.PI / 2 + Math.PI; /* dirección del recorrido a→b con normal n a la derecha */
        box('piedra', x, y, e - 0.15, 0.56, 0.86, 0.26, ry, { off: [l.id * 0.9, 0.3] });
        box('piedraClara', x, y, e + 0.71, 0.64, 0.05, 0.34, ry);
        box('hierro', x, y, e + 0.76, 0.34, 0.015, 0.14, ry);
        const g = new THREE.PlaneGeometry(0.42, 0.42); const a = g.attributes.uv; const tile = Math.min(7, Math.max(1, l.id));
        for (let i = 0; i < a.count; i++) a.setXY(i, tile / 8 + a.getX(i) / 8, a.getY(i));
        const plate = new THREE.Mesh(keep(g), M.numeros); plate.name = 'lote-' + l.id;
        plate.position.set(x + nx * 0.135, e + 0.14 + 0.21, -(y + ny * 0.135)); plate.rotation.y = ang;
        plate.userData = { lot: l.id, x, y };
        group.add(plate); lotMarkers[l.id] = plate;
      });

      /* ================================================================== meshes finales, noche, API */
      const meshes = {};
      Object.keys(buckets).forEach(k => {
        const mesh = new THREE.Mesh(keep(merge(buckets[k])), M[k]); mesh.name = 'arch-' + k;
        mesh.castShadow = shadows && !!castList[k]; mesh.receiveShadow = !!receiveList[k];
        if (k === 'agua') mesh.renderOrder = 3; if (k === 'ventana' || k === 'vidrioPuerta') mesh.renderOrder = 4;
        group.add(mesh); meshes[k] = mesh;
      });
      /* luces nocturnas: como máximo 4 PointLight repartidas entre las linternas del portón y dos faroles de la calle */
      const lights = [];
      {
        const cand = [];
        lanterns.forEach(p => cand.push(p));
        const n = lamps.length, pick = [Math.floor(n * 0.33), Math.floor(n * 0.75)];
        pick.forEach(i => { if (lamps[i]) cand.push([lamps[i][0], lamps[i][1], elevation(lamps[i][0], lamps[i][1]) + 4.0]); });
        cand.slice(0, 4).forEach(p => {
          const pl = new THREE.PointLight(0xFFD9A0, low ? 14 : 22, 18, 2); pl.position.set(p[0], p[2], -p[1]); pl.visible = false; group.add(pl); lights.push(pl);
        });
      }
      /* halos de luz (una sola nube de puntos aditiva, visible de noche) sobre cada farol, linterna y aplique */
      let halos = null;
      {
        const pts = [], sizes = [];
        lampHeads.forEach(p => pts.push(p[0], p[2], -p[1]));
        lanterns.forEach(p => pts.push(p[0], p[2], -p[1]));
        sconces.forEach(p => pts.push(p[0], p[2], -p[1]));
        void sizes;
        if (pts.length) {
          const hg = keep(new THREE.BufferGeometry()); hg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          const ht = canvasTex(64, 64, (x, w, h) => {
            const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
            gr.addColorStop(0, 'rgba(255,228,178,0.55)'); gr.addColorStop(0.22, 'rgba(255,212,145,0.25)'); gr.addColorStop(1, 'rgba(255,200,120,0)');   /* halo más suave: la pantalla del farol conserva su tono cálido */
            x.fillStyle = gr; x.fillRect(0, 0, w, h);
          }, false);
          const hm = keep(new THREE.PointsMaterial({ map: ht, size: 2.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, color: 0xFFD9A0 }));
          halos = new THREE.Points(hg, hm); halos.name = 'arch-halos'; halos.visible = false; halos.renderOrder = 6; group.add(halos);
        }
      }
      let night = false;
      function setNight(on) {
        night = !!on;
        if (halos) halos.visible = night;
        /* de noche la habitación encendida: la cortina emite con su propio mapa (pliegues visibles) y el vidrio apenas; sin sobreexposición */
        M.ventana.emissive.setHex(night ? 0xFFC98A : 0x000000); M.ventana.emissiveIntensity = night ? 0.16 : 1; M.ventana.envMapIntensity = night ? 0.25 : 1.1;
        M.vidrioPuerta.emissive.setHex(night ? 0xFFC98A : 0x000000); M.vidrioPuerta.emissiveIntensity = night ? 0.3 : 1; M.vidrioPuerta.envMapIntensity = night ? 0.2 : 1.0;
        M.cortina.emissive.setHex(night ? 0xFFCF92 : 0x000000); M.cortina.emissiveIntensity = night ? 0.7 : 1;
        M.cabezal.emissive.setHex(night ? 0xFFE3B8 : 0x000000); M.cabezal.emissiveIntensity = night ? 1.9 : 1;   /* VIS-14: bajo el umbral de bloom (2,4); el resplandor lo aporta la nube de halos */
        M.cartel.emissiveIntensity = night ? 0.75 : 0;
        M.agua.envMapIntensity = night ? 0.25 : 1.0;
        M.hierro.envMapIntensity = night ? 0.12 : 0.5; M.carpinteria.envMapIntensity = night ? 0.12 : 0.4; M.alero.envMapIntensity = night ? 0.15 : 0.7;
        lights.forEach(l => { l.visible = night; });
      }
      ctx.scene.add(group);
      if (ctx.night) setNight(true);

      const api = {
        group, lotMarkers, lamps, meshes, materials: M,
        update: function (dt, t) {
          if (aguaNormal) { aguaNormal.offset.x = (aguaNormal.offset.x + dt * 0.012) % 1; aguaNormal.offset.y = (aguaNormal.offset.y + dt * 0.008) % 1; }
          else if (meshes.agua) M.agua.opacity = 0.75 + 0.03 * Math.sin(t * 1.3);
        },
        setMode: function () {},
        setNight,
        stats: function () { let tri = 0; Object.keys(meshes).forEach(k => { tri += meshes[k].geometry.attributes.position.count / 3; }); return { triangles: Math.round(tri), meshes: Object.keys(meshes).length + Object.keys(lotMarkers).length, lamps: lamps.length, lights: lights.length, night }; },
        dispose: function () {
          if (group.parent) group.parent.remove(group);
          disposables.forEach(o => { if (o && o.dispose) o.dispose(); });
          disposables.length = 0;
        },
      };
      return api;
    },
  };
})();
