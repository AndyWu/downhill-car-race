// Vite plugin (Agent 2 / net): after `vite build`, walk dist/, hash every file, write
// dist/precache-manifest.json and inline the same manifest into dist/sw.js so that any asset
// change produces a byte-different sw.js (which is what triggers a SW update on iOS).
//
// Usage in vite.config.js:
//   import swManifest from './vite.sw-manifest.js';
//   export default defineConfig({ plugins: [swManifest()], ... });

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const EXCLUDE = [/^sw\.js$/, /^precache-manifest\.json$/, /\.map$/, /(^|\/)\./, /\.DS_Store$/];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

export default function swManifest({ swFile = 'sw.js', placeholder = '/*__PRECACHE_MANIFEST__*/ null', exclude = [] } = {}) {
  let outDir = 'dist';
  return {
    name: 'sbd-sw-manifest',
    apply: 'build',
    configResolved(cfg) { outDir = cfg.build.outDir.startsWith('/') ? cfg.build.outDir : join(cfg.root, cfg.build.outDir); },
    async closeBundle() {
      const files = [];
      const all = await walk(outDir).catch(() => []);
      for (const abs of all.sort()) {
        const rel = relative(outDir, abs).split(sep).join('/');
        if ([...EXCLUDE, ...exclude].some((re) => re.test(rel))) continue;
        const buf = await readFile(abs);
        files.push({ url: rel, hash: createHash('sha256').update(buf).digest('hex').slice(0, 16), size: (await stat(abs)).size });
      }
      const version = createHash('sha256').update(files.map((f) => f.url + ':' + f.hash).join('\n')).digest('hex').slice(0, 12);
      const manifest = { version, generated: new Date().toISOString(), files: files.map(({ url, hash }) => ({ url, hash })) };
      await writeFile(join(outDir, 'precache-manifest.json'), JSON.stringify(manifest, null, 1));
      const swPath = join(outDir, swFile);
      try {
        const sw = await readFile(swPath, 'utf8');
        if (sw.includes(placeholder)) await writeFile(swPath, sw.replace(placeholder, JSON.stringify(manifest)));
        else this.warn?.(`[sw-manifest] placeholder not found in ${swFile}`);
      } catch { this.warn?.(`[sw-manifest] ${swFile} not found in ${outDir}`); }
      const total = files.reduce((a, f) => a + f.size, 0);
      console.log(`[sw-manifest] precache v${version}: ${files.length} files, ${(total / 1024).toFixed(0)} KiB`);
    },
  };
}
