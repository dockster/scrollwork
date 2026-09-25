// The source's pure parts, bundled once for Node: the unit tests import these
// instead of the TypeScript itself.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

const out = new URL('../.cache/', import.meta.url);
mkdirSync(out, { recursive: true });
await build({
  entryPoints: { easing: 'src/easing.ts', spec: 'src/spec.ts', animate: 'src/animate.ts', scroll: 'src/scroll.ts' },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outdir: out.pathname,
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
});
export const load = (name) => import(new URL(`${name}.mjs`, out).href);
