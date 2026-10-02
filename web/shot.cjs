// Usage: node shot.cjs out.png "v=0&t=15.5" [w h]
const { chromium } = require('playwright');
(async () => {
  const [out, q, w = 1280, h = 800] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const t0 = Date.now();
  await p.goto('file://' + require('path').resolve(__dirname, '../dist/garden-3d.html') + '?shot&' + q);
  await p.waitForFunction(() => window.__ready, null, { timeout: 180000 }).catch(e => errs.push('timeout ready'));
  await p.waitForTimeout(+process.env.WAIT || 2500);
  await p.screenshot({ path: out, timeout: 120000 });
  console.log('ok', out, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  errs.slice(0, 15).forEach(e => console.log(e.slice(0, 400)));
  await b.close();
})();
