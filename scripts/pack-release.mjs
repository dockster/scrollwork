// The download attached to a GitHub release: the built files, the examples,
// the reference, the README and the license, in scrollwork-<version>.zip.
// Run after `npm run build`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
if (!existsSync('dist/scrollwork.min.js')) throw new Error('Build first: npm run build');
const name = `scrollwork-${version}`;
rmSync('release', { recursive: true, force: true });
mkdirSync('release');
execFileSync('zip', ['-r', '-q', `release/${name}.zip`, 'dist', 'examples', 'docs', 'README.md', 'LICENSE'], { stdio: 'inherit' });
console.log(`release/${name}.zip`);
