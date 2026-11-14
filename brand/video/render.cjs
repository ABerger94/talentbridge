// TalentBridge "What's new" promo video (1920x1080, 30 fps, silent).
//   node brand/video/render.cjs preview 3.5,14,29   -> frame-*.png at those seconds
//   node brand/video/render.cjs full                -> talentbridge-whats-new.mp4
// Every frame is drawn from video.html's render(t), so output is exact and
// repeatable. Sound is added separately (see SCRIPT.md); sound-cues.json lists
// each scene's timing and on-screen text and every sound-effect moment, read
// from the page so it always matches the picture.
const { chromium } = require('playwright'); const fs = require('fs'); const { spawn, execFileSync } = require('child_process');
const D = __dirname; const FPS = 30; const mode = process.argv[2] || 'preview';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + D + '/video.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  console.log('fonts ok:', await p.evaluate(() => document.fonts.check('700 80px "Space Grotesk"')));
  const total = await p.evaluate(() => window.TOTAL);
  const scenes = await p.evaluate(() => [...document.querySelectorAll('.scene')].map((s, i) => {
    window.render(+s.dataset.start + 6); // fully built, to read its text
    return { scene: i + 1, start: +s.dataset.start, end: Math.min(+s.dataset.end, window.TOTAL), on_screen_text: s.innerText.replace(/\s*\n\s*/g, ' / ').trim() };
  }));
  const c = await p.evaluate(() => window.cues());
  fs.writeFileSync(D + '/sound-cues.json', JSON.stringify({
    video: { file: 'talentbridge-whats-new.mp4', duration_s: total, fps: FPS, width: 1920, height: 1080, audio: 'none' },
    scenes,
    sfx: {
      scene_transition_s: c.scene_changes,
      pop_in_s: c.ticks,
      level_up_s: c.chimes,
    },
  }, null, 2));
  if (mode === 'preview') {
    for (const t of (process.argv[3] || '3.5,8,14,21,29,34.5,40.5,45.5,50').split(',').map(Number)) {
      await p.evaluate((x) => window.render(x), t);
      await p.screenshot({ path: `${D}/frame-${String(t).replace('.', '_')}.png` });
    }
  } else {
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', D + '/video-only.mp4']);
    const frames = Math.round(total * FPS);
    for (let i = 0; i < frames; i++) {
      await p.evaluate((x) => window.render(x), i / FPS);
      const buf = await p.screenshot({ type: 'jpeg', quality: 95 });
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      if (i % 150 === 0) console.log(`frame ${i}/${frames}`);
    }
    ff.stdin.end(); await new Promise((r) => ff.on('close', r));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', D + '/video-only.mp4', '-an', '-c:v', 'copy', '-movflags', '+faststart', D + '/talentbridge-whats-new.mp4']);
    fs.unlinkSync(D + '/video-only.mp4');
    console.log('wrote talentbridge-whats-new.mp4');
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
