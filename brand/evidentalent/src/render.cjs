// Renders the EvidenTalent logo files and homepage mock:  node brand/evidentalent/src/render.cjs
const { chromium } = require('playwright'); const path = require('path');
const OUT = path.join(__dirname, '..');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 1200 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'board.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  for (const id of ['lockup-light', 'lockup-dark', 'stacked']) await p.locator('#' + id).screenshot({ path: path.join(OUT, `logo-${id}.png`) });
  await p.locator('#hero').screenshot({ path: path.join(OUT, 'homepage-headline.png') });
  const i = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 2 });
  await i.goto('file://' + path.join(OUT, 'logo-icon.svg'));
  await i.screenshot({ path: path.join(OUT, 'logo-icon.png'), omitBackground: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
