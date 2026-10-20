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

// The minified effects carry their shaders without comments or indentation:
// esbuild leaves a template's text as written. Each GLSL template (a constant
// opening on a backtick, in gl.ts and shaders/) keeps its line breaks, which
// #version needs, and loses its // and /** */ notes and the space around them.
const glslTrim = {
  name: 'glsl-trim',
  setup(b) {
    b.onLoad({ filter: /src[\\/]fx[\\/](gl|shaders[\\/]\w+)\.ts$/ }, ({ path }) => ({
      loader: 'ts',
      contents: readFileSync(path, 'utf8').replace(/(export const [A-Z_]+ = `)([^`]*)`/g, (_, head, glsl) =>
        head +
        glsl
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/[^\n]*/g, '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n') +
        '`'
      ),
    }));
  },
};
const common = { bundle: true, target: 'es2020', banner: { js: banner }, legalComments: 'inline', logLevel: 'warning', define: { __SCROLLWORK_VERSION__: JSON.stringify(version) } };

await build({ ...common, entryPoints: ['src/index.ts'], format: 'esm', outfile: 'dist/scrollwork.mjs' });
await build({ ...common, entryPoints: ['src/global.ts'], format: 'iife', outfile: 'dist/scrollwork.js' });
await build({ ...common, entryPoints: ['src/global.ts'], format: 'iife', minify: true, outfile: 'dist/scrollwork.min.js' });
await build({ ...common, entryPoints: ['src/fx/index.ts'], format: 'esm', outfile: 'dist/fx.mjs' });
await build({ ...common, entryPoints: ['src/fx/global.ts'], format: 'iife', outfile: 'dist/scrollwork-fx.js' });
await build({ ...common, entryPoints: ['src/fx/global.ts'], format: 'iife', minify: true, outfile: 'dist/scrollwork-fx.min.js', plugins: [glslTrim] });
// The extras use the core's animate(), timeline() and scroll(): the module imports them from
// 'scrollwork' and the plain script reads window.Scrollwork, so neither carries a copy of the core
const core = (esm) => ({
  name: 'core',
  setup(b) {
    b.onResolve({ filter: /^\.\.\/index\.js$/ }, (a) => (/[\\/]extras[\\/]/.test(a.importer) ? (esm ? { path: 'scrollwork', external: true } : { path: 'core', namespace: 'sw-core' }) : undefined));
    b.onLoad({ filter: /.*/, namespace: 'sw-core' }, () => ({ contents: 'module.exports = window.Scrollwork', loader: 'js' }));
  },
});
await build({ ...common, entryPoints: ['src/extras/index.ts'], format: 'esm', outfile: 'dist/extras.mjs', plugins: [core(true)] });
await build({ ...common, entryPoints: ['src/extras/global.ts'], format: 'iife', outfile: 'dist/scrollwork-extras.js', plugins: [core(false)] });
await build({ ...common, entryPoints: ['src/extras/global.ts'], format: 'iife', minify: true, outfile: 'dist/scrollwork-extras.min.js', plugins: [core(false)] });
execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });

/** KB gzipped each minified file may reach; the README says these numbers */
// 1.11 (loop fade and upright, 3D states, the cursor) and 1.12 (the loader,
// flipbook) are budgeted at 21 KB together (docs/FOURMULA-EFFECTS-PLAN.md in uxdeck);
// 1.12's rollovers (letter roll, wipe, with a screen reader's copy and keyboard focus) take it to 22.0
// (docs/LETTER-ROLL-PLAN.md in uxdeck); the budget allows half a KB over, rather than trimming working code for bytes
// the effects add-on grew to 8.9 with pixel distortion in 1.13.0 (Codrops' Distorted Pixels): 9
// 1.13.1's sweep (distort with no pointer) took it to 9.1; the minified shaders lost their comments (glslTrim): 8.8
// 1.14 (timeline(), any CSS property, variable, colour and object in animate(), SVG draw, scroll()'s
// start and end, smooth, snap and enter/leave callbacks) takes it to 25.6: 26, for uxdeck's marketing site
// (uxdeck docs/MARKETING-SITE-PLAN.md); a project importing the module only carries what it uses
// the extras add-on (flip, morph, follow, drag, sideways) is 4.9 at 1.14: 5
// the clip state (a corner reveal), a scroll's ease, and words lit one by one as the page scrolls: 26.1, so 26.5
// formations (a scroll split by children: in an order, outward, varied, about an origin; Codrops' On-Scroll Layout Formations): 27.0, so 27.5
// scramble (a hover and in-view letter scramble; Codrops' Line Text Hover Animations): 28.1, so 28.5
// slices (a one-line text cut into slices that come together as the page scrolls; Codrops' Sliced Text Effect): 28.6, so 29; a text's pieces as a formation and masks from a side (Codrops' On-Scroll Typography Animations) take it to 29.0
// a pivot for a whole element's motion, an edge fade, an interaction heard on another element (a card hovered moves its picture), and the ripple wipe (from the pointer): 29.9, so 30
// a flipbook picked by the scroll (stepped or blended: a product turning as the page goes by) and a layer hidden until its interactions bring it in: 30.3, so 30.5
// 1.18: colours turned round the wheel, a glow, an SVG line drawn as a state, and a scroll that follows an element across the screen (axis x): 31.0, so 31.5; the effects add-on's colour map (a heat camera's ramp, by scroll progress): 10.2, so 10.5
// the bulge (Codrops' 3D Bulge Text Effect: a lit lens around the pointer, and a text host's words drawn into its picture): 9.8, so 10
const BUDGET = { 'scrollwork.min.js': 31.5, 'scrollwork-fx.min.js': 10.5, 'scrollwork-extras.min.js': 5 };
let over = '';
for (const f of ['scrollwork.mjs', 'scrollwork.js', 'scrollwork.min.js', 'fx.mjs', 'scrollwork-fx.js', 'scrollwork-fx.min.js', 'extras.mjs', 'scrollwork-extras.js', 'scrollwork-extras.min.js']) {
  const b = readFileSync(`dist/${f}`);
  const gz = gzipSync(b).length / 1024;
  const budget = BUDGET[f];
  console.log(`${f.padEnd(22)} ${(b.length / 1024).toFixed(1).padStart(6)} KB, ${gz.toFixed(1).padStart(5)} KB gzipped${budget ? ` (budget ${budget})` : ''}`);
  if (budget && gz > budget) over += `${f} is ${gz.toFixed(1)} KB gzipped, over its ${budget} KB budget\n`;
}
// the add-on must not carry a copy of the engine
if (readFileSync('dist/fx.mjs', 'utf8').includes('requestAnimationFrame(tick)')) over += 'fx.mjs bundles the engine\n';
for (const f of ['extras.mjs', 'scrollwork-extras.min.js']) if (/requestAnimationFrame\(frame\)|function startEngine/.test(readFileSync(`dist/${f}`, 'utf8'))) over += `${f} bundles the core\n`;
if (over) {
  console.error(over.trim());
  process.exit(1);
}
