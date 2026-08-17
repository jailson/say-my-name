import { build, context } from 'esbuild';
import { rm, mkdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  format: 'esm',
  target: ['es2021'],
  platform: 'browser',
  logLevel: 'info',
};

/**
 * Three entry points, deliberately:
 *   index.js       - `import 'say-my-name'`, registers <say-my-name> on import
 *   element.js     - side-effect free, exports defineSayMyName() for custom tag names
 *   say-my-name.js - minified, what the CDN <script type="module"> snippet loads
 */
const builds = [
  { entryPoints: ['src/index.ts'], outfile: 'dist/index.js' },
  { entryPoints: ['src/element.ts'], outfile: 'dist/element.js' },
  { entryPoints: ['src/index.ts'], outfile: 'dist/say-my-name.js', minify: true },
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

if (watch) {
  const contexts = await Promise.all(builds.map((b) => context({ ...shared, ...b })));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('watching...');
} else {
  await Promise.all(builds.map((b) => build({ ...shared, ...b })));
  // Types come from tsc; esbuild does not emit declarations.
  execFileSync('npx', ['tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' });
}

// The docs site loads the built bundle directly, so a build refreshes the demo too.
await mkdir('docs/vendor', { recursive: true });
await cp('dist/say-my-name.js', 'docs/vendor/say-my-name.js');
