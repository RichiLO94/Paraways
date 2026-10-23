/* Prueba funcional de PW.textures en el harness: memoización, dispose() y funciones estáticas de texto.
   Uso: NODE_PATH=/opt/node22/lib/node_modules node textures-dispose-test.js */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto((process.env.PW_BASE || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/') + 'dev/harness.html?mods=textures&view=maqueta');
  await p.evaluate(() => window.PW_READY);
  const r = await p.evaluate(() => {
    const built = window.PW_READY_BUILT || null; void built;
    const THREE = window.THREE;
    const scene = PW.terrain && document.querySelector('canvas') ? null : null; void scene;
    /* reconstruimos un handle propio sobre una escena nueva para inspeccionar sin tocar el harness */
    const sc = new THREE.Scene();
    const h = PW.textures.build({ THREE, scene: sc, quality: 'high', renderer: null });
    const a = h.get('cobble'), a2 = h.get('cobble'), bump = h.bump('cobble'), w = h.get('water'), n = h.normal('water');
    const m = h.material('stone', { meters: [4, 1] }), bx = h.box(2, 1, 0.5, 'deck'), cube = h.box(3, 3, 3, 'plaster');
    const before = w.offset.x; h.update(0.5); const after = w.offset.x;
    const s = PW.textures.textSprite(THREE, 'Lote 1\n723,03 m²', { font: 'serif', bg: '#0B1738', color: '#F2EDE0', height: 3 });
    const pl = PW.textures.textPlane(THREE, 'LE PETIT TRIANON', { font: 'serif', width: 6, bg: '#0B1738', color: '#F2EDE0' });
    const groupIn = sc.getObjectByName('textures') !== undefined;
    const names = h.names.slice();
    h.dispose();
    const groupOut = sc.getObjectByName('textures') === undefined;
    return {
      memo: a === a2, bumpOk: !!bump && bump.colorSpace === THREE.NoColorSpace, mapSRGB: a.colorSpace === THREE.SRGBColorSpace, wrap: a.wrapS === THREE.RepeatWrapping,
      waterIsNormal: w === n && w.colorSpace === THREE.NoColorSpace, waterMoves: after !== before,
      matHasBump: !!m.bumpMap && m.map.repeat.x === 2 && m.map.repeat.y === 0.5, boxMats: Array.isArray(bx.material) ? bx.material.length : 1, cubeSingle: !Array.isArray(cube.material),
      spriteAspect: s.userData.aspect > 1 && s.scale.y === 3, planeAspect: Math.abs(pl.geometry.parameters.width - 6) < 1e-6,
      groupIn, groupOut, names, size: a.image.width, aniso: a.anisotropy,
    };
  });
  console.log(JSON.stringify({ result: r, errors: errs.filter(e => !/deprecated with r150/.test(e)) }, null, 1));
  await b.close();
})();
