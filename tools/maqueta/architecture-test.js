/* Prueba de API y ciclo de vida de PW.architecture (sin captura).
   Uso: NODE_PATH=/opt/node22/lib/node_modules node architecture-test.js */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto((process.env.PW_BASE || 'http://127.0.0.1:8765/le-petit-trianon/maqueta/') + 'dev/harness.html?mods=architecture&view=maqueta');
  const r = await p.evaluate(async () => {
    const built = await window.PW_READY; const h = built[0].h; const g = h.group; const scene = g.parent;
    const out = { groupName: g.name, inScene: !!scene, stats: h.stats(), lotMarkers: Object.keys(h.lotMarkers).map(k => [k, h.lotMarkers[k].name, h.lotMarkers[k].userData]), children: g.children.length };
    const lights = g.children.filter(c => c.isPointLight);
    out.lightsOffDay = lights.every(l => !l.visible);
    h.setNight(true); out.lightsOnNight = lights.every(l => l.visible) && lights.length <= 4;
    out.windowEmissive = h.meshes.ventana.material.emissive.getHexString();
    h.setNight(false); out.lightsOffAgain = lights.every(l => !l.visible); out.windowEmissiveDay = h.meshes.ventana.material.emissive.getHexString();
    h.update(0.016, 1.0); h.update(0.016, 2.0);
    const before = scene.children.length; h.dispose(); out.sceneChildrenBefore = before; out.sceneChildrenAfter = scene.children.length; out.groupDetached = !g.parent;
    return out;
  });
  console.log(JSON.stringify({ result: r, errors: errs }, null, 1));
  await b.close();
})();
