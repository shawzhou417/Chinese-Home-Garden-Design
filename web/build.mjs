// Bundle the scene (three.js included) and inline it into ONE self-contained HTML
// file with no external requests, so it can be opened offline or hosted anywhere.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const res = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  loader: { '.png': 'dataurl', '.json': 'json' },
  legalComments: 'none',
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.html', 'utf8').replace('<!--SCRIPT-->', () => `<script>${js}</script>`);
mkdirSync('../dist', { recursive: true });
writeFileSync('../dist/garden-3d.html', html);
console.log(`dist/garden-3d.html  ${(html.length / 1024 / 1024).toFixed(2)} MB`);
