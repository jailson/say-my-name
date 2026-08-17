import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const BUDGET_BYTES = 5 * 1024;
const file = 'dist/say-my-name.js';

const raw = await readFile(file);
const gzipped = gzipSync(raw, { level: 9 });
const pct = Math.round((gzipped.length / BUDGET_BYTES) * 100);

console.log(
  `${file}: ${raw.length} B raw, ${gzipped.length} B gzip ` +
    `(${pct}% of the ${BUDGET_BYTES} B budget)`,
);

if (gzipped.length > BUDGET_BYTES) {
  console.error(
    `\nSize budget exceeded by ${gzipped.length - BUDGET_BYTES} B gzip.\n` +
      `This component gets dropped onto other people's pages; keep it small or raise ` +
      `the budget deliberately in scripts/size.mjs.`,
  );
  process.exit(1);
}
