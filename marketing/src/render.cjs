// Renders the campaign images and the flyer:
//   node marketing/src/render.cjs   -> marketing/assets/*.png, flyer.pdf
// Images use sample people, labeled as samples.
const { chromium } = require('playwright');
const path = require('path');
const SRC = __dirname;
const OUT = path.join(__dirname, '..', 'assets');
(async () => {
  // The #ShowWhatYouCanDo post shows a real share card, made by the same code
  // that makes them for profiles (sample person).
  const { renderCard } = require('../../server/src/sharecard.js');
  require('fs').writeFileSync(path.join(SRC, 'sharecard-sample.png'), await renderCard({
    name: 'Danielle Okoro', headline: 'Registered Nurse, Med-Surg · Night shift', photo: null,
    strengths: [{ name: 'Early warning recognition', level: 4 }, { name: 'Patient & family teaching', level: 4 }, { name: 'Precepting new nurses', level: 3 }],
  }));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await p.goto('file://' + path.join(SRC, 'social.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  for (const id of ['career-changer', 'show-what-you-can-do', 'hospitality']) {
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
