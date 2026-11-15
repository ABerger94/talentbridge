// Renders the EvidenTalent logo files, homepage mock, app icons and link preview:  node brand/evidentalent/src/render.cjs
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
  // The site's default link-preview image (public/og-image.png, 1200x630).
  const og = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await og.goto('file://' + path.join(__dirname, 'og.html'), { waitUntil: 'networkidle' });
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: path.join(OUT, '..', '..', 'public', 'og-image.png') });
  // App icons and profile picture: the SVG is inlined at the exact pixel size, so each
  // PNG is a sharp render, not a resized screenshot.
  const fs = require('fs'); const PUB = path.join(OUT, '..', '..', 'public');
  const icon = async (svgFile, size, out, transparent) => {
    const svg = fs.readFileSync(svgFile, 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
    const q = await b.newPage({ viewport: { width: size, height: size } });
    await q.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
    await q.screenshot({ path: out, omitBackground: transparent });
    await q.close();
  };
  const tile = path.join(OUT, 'logo-icon.svg'), bleed = path.join(OUT, 'profile-picture.svg'), mask = path.join(__dirname, 'icon-maskable.svg');
  await icon(tile, 512, path.join(PUB, 'favicon.png'), true);
  await icon(tile, 192, path.join(PUB, 'icons', 'icon-192.png'), true);
  await icon(tile, 512, path.join(PUB, 'icons', 'icon-512.png'), true);
  await icon(mask, 192, path.join(PUB, 'icons', 'maskable-192.png'), false);
  await icon(mask, 512, path.join(PUB, 'icons', 'maskable-512.png'), false);
  await icon(bleed, 180, path.join(PUB, 'apple-touch-icon.png'), false);
  await icon(bleed, 1000, path.join(OUT, 'x-profile-picture.png'), false);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
