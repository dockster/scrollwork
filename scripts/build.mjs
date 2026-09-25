// The builds: an ES module for projects, and a plain-script global
// (window.Scrollwork) in readable and minified form, then the types.
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
execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });

for (const f of ['scrollwork.mjs', 'scrollwork.js', 'scrollwork.min.js']) {
  const b = readFileSync(`dist/${f}`);
  console.log(`${f.padEnd(20)} ${(b.length / 1024).toFixed(1)} KB, ${(gzipSync(b).length / 1024).toFixed(1)} KB gzipped`);
}
