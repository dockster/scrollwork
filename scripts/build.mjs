// The builds: an ES module for projects, and a plain-script global
// (window.Scrollwork) in readable and minified form, the same three for the
// effects add-on (scrollwork/fx, window.ScrollworkFx), then the types. Each
// minified file has a size budget: the README quotes these figures, so a
// build that outgrows its budget fails here rather than on npm.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
const banner = `/*! Scrollwork ${version} | (c) 2026 uxspot.io | MIT License | https://github.com/dockster/scrollwork */`;
rmSync('dist', { recursive: true, force: true });
const common = { bundle: true, target: 'es2020', banner: { js: banner }, legalComments: 'inline', logLevel: 'warning', define: { __SCROLLWORK_VERSION__: JSON.stringify(version) } };

await build({ ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/scrollwork.mjs' });
await build({ ...common, entryPoints: ['src/global.ts'], format: 'iife', outfile: 'dist/scrollwork.js' });
await build({ ...common, entryPoints: ['src/global.ts'], format: 'iife', minify: true, outfile: 'dist/scrollwork.min.js' });
await build({ ...common, entryPoints: ['src/fx/index.ts'], format: 'esm', outfile: 'dist/fx.mjs' });
await build({ ...common, entryPoints: ['src/fx/global.ts'], format: 'iife', outfile: 'dist/scrollwork-fx.js' });
await build({ ...common, entryPoints: ['src/fx/global.ts'], format: 'iife', minify: true, outfile: 'dist/scrollwork-fx.min.js' });
execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });

/** KB gzipped each minified file may reach; the README says these numbers */
// 1.11 (loop fade and upright, 3D states, the cursor) and 1.12 (the loader,
// flipbook) are budgeted at 21 KB together (docs/FOURMULA-EFFECTS-PLAN.md in uxdeck)
const BUDGET = { 'scrollwork.min.js': 21, 'scrollwork-fx.min.js': 8 };
let over = '';
for (const f of ['scrollwork.mjs', 'scrollwork.js', 'scrollwork.min.js', 'fx.mjs', 'scrollwork-fx.js', 'scrollwork-fx.min.js']) {
  const b = readFileSync(`dist/${f}`);
  const gz = gzipSync(b).length / 1024;
  const budget = BUDGET[f];
  console.log(`${f.padEnd(22)} ${(b.length / 1024).toFixed(1).padStart(6)} KB, ${gz.toFixed(1).padStart(5)} KB gzipped${budget ? ` (budget ${budget})` : ''}`);
  if (budget && gz > budget) over += `${f} is ${gz.toFixed(1)} KB gzipped, over its ${budget} KB budget\n`;
}
// the add-on must not carry a copy of the engine
if (readFileSync('dist/fx.mjs', 'utf8').includes('requestAnimationFrame(tick)')) over += 'fx.mjs bundles the engine\n';
if (over) {
  console.error(over.trim());
  process.exit(1);
}
