// Renders the X header (1500x500 at 2x) and the Capability Graph explainer
// (1600x900 at 2x) into brand/evidentalent/:   node brand/src/render.cjs
const { chromium } = require('playwright'); const path = require('path');
const OUT = path.join(__dirname, '..', 'evidentalent');
(async () => {
  const b = await chromium.launch();
  for (const [file, w, h, out] of [['x-header.html', 1500, 500, 'x-header.png'], ['capability-explainer.html', 1600, 900, 'capability-graph-explainer.png']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.goto('file://' + path.join(__dirname, file), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: path.join(OUT, out) });
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
