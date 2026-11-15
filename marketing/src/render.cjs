// Renders the campaign images and the flyer:
//   node marketing/src/render.cjs   -> marketing/assets/*.png, flyer.pdf
const { chromium } = require('playwright');
const path = require('path');
const SRC = __dirname;
const OUT = path.join(__dirname, '..', 'assets');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(SRC, 'social.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  for (const id of ['before-after', 'show-what-you-can-do', 'hospitality']) {
    await p.locator(`#${id}`).screenshot({ path: path.join(OUT, `post-${id}.png`) });
  }
  const f = await b.newPage({ viewport: { width: 816, height: 1056 } });
  await f.goto('file://' + path.join(SRC, 'flyer.html'), { waitUntil: 'networkidle' });
  await f.evaluate(() => document.fonts.ready);
  await f.pdf({ path: path.join(OUT, 'flyer.pdf'), format: 'Letter', printBackground: true });
  await f.screenshot({ path: path.join(SRC, 'flyer-preview.png') });
  const over = await f.evaluate(() => document.documentElement.scrollHeight);
  console.log('flyer height px (1056 = one page):', over);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
