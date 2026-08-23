import { build, context } from 'esbuild';
import { rm, mkdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { writeVoices } from './voices.mjs';

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
  // Used by the studio only, never by the component — so it stays out of the size budget.
  { entryPoints: ['src/respell.ts'], outfile: 'docs/studio/vendor/respell.js' },
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

// eSpeak NG for the studio's "suggest from spelling" button. Staged rather than committed:
// it is 18 MB, and it is GPLv3, so it stays out of this MIT repository's history. The studio
// loads it lazily, only when someone actually presses the button.
await mkdir('docs/studio/vendor', { recursive: true });
for (const file of ['espeak-ng.js', 'espeak-ng.wasm']) {
  await cp(`node_modules/espeak-ng/dist/${file}`, `docs/studio/vendor/${file}`);
}

// The language list the studio offers, taken from the engine that just got staged so the
// two can never disagree.
const voiceCount = await writeVoices();
console.log(`\n  docs/studio/vendor/voices.js  ${voiceCount} languages\n`);
