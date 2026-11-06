import { chromium } from 'playwright';
import fs from 'fs';
const out = process.argv[2], shots = JSON.parse(process.argv[3]);   // [{name, split, path, s, back, h, lookAhead, lat}]
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await b.newPage({ viewport: { width: 800, height: 450 } });
pg.on('pageerror', (e) => console.log('ERR', e.message));
await pg.goto('http://localhost:4561/?track=village&q=medium&autostart=0');
await pg.waitForFunction(() => window.__game, null, { timeout: 120000 });
await pg.evaluate(() => window.__game.screenshotReady);
for (const sh of shots) {
  pg.on('console', (m) => { if (m.text().startsWith('RAY')) console.log(m.text()); });
  const url = await pg.evaluate((sh) => {
    const g = window.__game, T = g.world.track, THREE_V = g.camera.position.constructor;
    g.teleport(Math.max(5, sh.cartS ?? 5), 0); g.advance(0.05);
    const o = sh.path ? { [sh.split]: sh.path } : {};
    const p = T.sampleAt(sh.s, o), p2 = T.sampleAt(sh.s + (sh.look ?? 12), o);
    const rx = p.right ? p.right.x : 0, rz = p.right ? p.right.z : 0;
    const lat = sh.lat || 0;
    g.camera.position.set(p.position.x + rx * lat, p.position.y + (sh.h ?? 1.6), p.position.z + rz * lat);
    if (sh.down) { g.camera.position.set(p.position.x, p.position.y + sh.h, p.position.z); g.camera.up.set(0,0,-1); g.camera.lookAt(p.position.x + 0.01, p.position.y, p.position.z); g.camera.up.set(0,1,0);} else g.camera.lookAt(p2.position.x + rx * lat * 0.3, p2.position.y + (sh.lookH ?? 1.0), p2.position.z + rz * lat * 0.3);
    g.camera.updateMatrixWorld();
    g.world.update(0.016, g.camera, []);
    g.renderer.render(g.scene, g.camera);
    if (sh.ray) {
      const V = g.camera.position.constructor, [px, py] = sh.ray, ndc = new V(px / 400 - 1, 1 - py / 225, 0.5).unproject(g.camera);
      const o = g.camera.position.clone(), dir = ndc.sub(o).normalize(); let best = [1e9, null];
      const a = new V(), b = new V(), c = new V(), e1 = new V(), e2 = new V(), pv = new V(), tv = new V(), qv = new V();
      g.scene.traverse((m) => {
        if (!m.isMesh || !m.visible || !m.geometry || !m.geometry.attributes.position) return;
        m.updateWorldMatrix(true, false); const pos = m.geometry.attributes.position, ix = m.geometry.index, n = ix ? ix.count : pos.count;
        for (let t = 0; t < n; t += 3) {
          const i0 = ix ? ix.getX(t) : t, i1 = ix ? ix.getX(t + 1) : t + 1, i2 = ix ? ix.getX(t + 2) : t + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
          e1.subVectors(b, a); e2.subVectors(c, a); pv.crossVectors(dir, e2); const det = e1.dot(pv); if (Math.abs(det) < 1e-9) continue;
          tv.subVectors(o, a); const u = tv.dot(pv) / det; if (u < 0 || u > 1) continue; qv.crossVectors(tv, e1); const v = dir.dot(qv) / det; if (v < 0 || u + v > 1) continue;
          const tt = e2.dot(qv) / det; if (tt > 0.01 && tt < best[0]) best = [tt, m.name + ' mat=' + (m.material && m.material.name) + ' tris=' + n / 3 + ' at ' + [a.x, a.y, a.z].map((x) => x.toFixed(1))];
        }
      });
      console.log('RAY', JSON.stringify(best));
    }
    return g.renderer.domElement.toDataURL('image/jpeg', 0.85);
  }, sh);
  fs.writeFileSync(`${out}/${sh.name}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('ok', sh.name);
}
await b.close();
