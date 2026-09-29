import { build } from 'esbuild';
import { readdirSync, rmSync, unlinkSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Narrow build for the e2e harness: bundle ONLY the dashboard custom-element
// app into a single self-contained ESM file. Unlike scripts/bundle-wc.mjs, this
// does NOT build or depend on the full `webcomponents` app — the e2e suite only
// needs <mfp-wc-dashboard>. Run after `ng build webcomponents-dashboard`.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cleanup = ['prerendered-routes.json', '3rdpartylicenses.txt'];

function cleanDist(dir) {
  for (const file of readdirSync(dir)) {
    if (
      (file.startsWith('chunk-') && file.endsWith('.js')) ||
      cleanup.includes(file)
    ) {
      unlinkSync(join(dir, file));
    }
  }
}

const dist = join(repoRoot, 'dist/webcomponents');
const dashDist = join(repoRoot, 'dist/webcomponents-dashboard');
const dashEntry = join(dashDist, 'main.js');
const dashOut = join(dist, 'mfp-wc-dashboard.js');

await build({
  entryPoints: [dashEntry],
  bundle: true,
  format: 'esm',
  outfile: dashOut,
  minify: true,
  logLevel: 'warning',
});

// The lazy chunk-*.js files sit next to main.js in the ng build output; the
// esbuild bundle inlines everything, so drop the raw ng output afterwards.
cleanDist(dashDist);
rmSync(dashDist, { recursive: true });

console.log(
  'Single-file dashboard bundle written to dist/webcomponents/mfp-wc-dashboard.js',
);
