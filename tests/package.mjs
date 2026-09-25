#!/usr/bin/env node
// The package as someone installing it gets it: a consumer folder with
// scrollwork linked into its node_modules, then
//   - Node imports it (a server render must not touch window or document)
//   - require() resolves it (Jest, webpack's require, older tooling)
//   - TypeScript with moduleResolution node16 and no skipLibCheck reads its types,
//     and a deliberate type error is caught (types that resolve to `any` would pass it)
// Usage: npm run build && npm run test:package
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const dir = join(tmpdir(), `scrollwork-consumer-${process.pid}`);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, 'node_modules'), { recursive: true });
symlinkSync(root, join(dir, 'node_modules', 'scrollwork'));
symlinkSync(join(root, 'node_modules', 'typescript'), join(dir, 'node_modules', 'typescript'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}\n`);
};
const run = (args) => {
  try {
    return { ok: true, out: execFileSync(process.execPath, args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

writeFileSync(join(dir, 'esm.mjs'), `import * as s from 'scrollwork'; console.log(s.version, typeof s.animate, typeof s.start);`);
const esm = run(['esm.mjs']);
check('Node imports it without a DOM', esm.ok && /^\d+\.\d+\.\d+ function function/.test(esm.out.trim()), esm.out.trim().slice(0, 120));

writeFileSync(join(dir, 'cjs.cjs'), `const s = require('scrollwork'); console.log(typeof s.animate);`);
const cjs = run(['cjs.cjs']);
check('require() resolves it', cjs.ok && cjs.out.trim() === 'function', cjs.out.trim().slice(0, 160));

writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module', private: true }));
writeFileSync(
  join(dir, 'tsconfig.json'),
  JSON.stringify({ compilerOptions: { module: 'node16', moduleResolution: 'node16', strict: true, noEmit: true, lib: ['ES2021', 'DOM'], skipLibCheck: false }, files: ['use.ts'] })
);
writeFileSync(
  join(dir, 'use.ts'),
  `import { animate, start, type MotionSpec, type Controls } from 'scrollwork';
const spec: MotionSpec = { items: [{ id: 'a', text: false }], smooth: false };
const c: Controls = animate('.a', { y: [40, 0] }, { duration: 0.4 });
const n: number = c.progress;
start(spec, { attr: 'data-m', root: document.body, scroller: null, reduced: false, split: true });
// @ts-expect-error progress is a number: types that resolved to any would let this through
const wrong: string = c.progress;
export { n, wrong };
`
);
const tsc = run([join(dir, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json']);
check('TypeScript node16, no skipLibCheck: the types resolve and catch a mistake', tsc.ok, tsc.out.trim().slice(0, 300));

rmSync(dir, { recursive: true, force: true });
const failed = results.filter((r) => !r).length;
process.stdout.write(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
