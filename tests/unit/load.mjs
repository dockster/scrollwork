// The source's pure parts, bundled once for Node: the unit tests import these
// instead of the TypeScript itself. node --test runs each file in its own
// process at the same time, so each bundles into its own folder: a shared one
// let a file import a bundle another process was halfway through writing.
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'scrollwork-unit-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const out = pathToFileURL(dir + '/');
await build({
  entryPoints: { easing: 'src/easing.ts', spec: 'src/spec.ts', animate: 'src/animate.ts', scroll: 'src/scroll.ts', vars: 'src/vars.ts' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outdir: out.pathname,
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});
export const load = (name) => import(new URL(`${name}.mjs`, out).href);
