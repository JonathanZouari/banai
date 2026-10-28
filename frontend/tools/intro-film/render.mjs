// Renders the intro film frame by frame and encodes it: node tools/intro-film/render.mjs <viteUrl> <framesDir>
// Output goes to public/intro/ (intro + loop, WebM and MP4, and a poster).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [base, framesDir] = process.argv.slice(2);
const FPS = 24;
const out = 'public/intro';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${base}/tools/intro-film/film.html?w=1280&h=720&ss=1.5`);
await page.waitForFunction(() => window.film);
console.log('gpu:', await page.evaluate(() => window.film.gpu()));
for (const cut of ['intro', 'loop']) {
  const dir = join(framesDir, cut);
  mkdirSync(dir, { recursive: true });
  const total = await page.evaluate((c) => window.film.CUTS[c], cut) * FPS;
  for (let i = 0; i < total; i += 1) {
    const data = await page.evaluate(([c, t]) => { window.film.renderAt(c, t); return document.getElementById('film').toDataURL('image/jpeg', 0.93); }, [cut, i / FPS]);
    writeFileSync(join(dir, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(data.split(',')[1], 'base64'));
  }
  const input = ['-y', '-framerate', String(FPS), '-i', join(dir, '%04d.jpg'), '-vf', 'scale=1280:720:flags=lanczos'];
  execFileSync('ffmpeg', [...input, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-b:v', '0', '-crf', '38', '-row-mt', '1', '-an', join(out, `${cut}.webm`)], { stdio: 'ignore' });
  execFileSync('ffmpeg', [...input, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(out, `${cut}.mp4`)], { stdio: 'ignore' });
  console.log(cut, 'done');
}
execFileSync('ffmpeg', ['-y', '-i', join(framesDir, 'loop', '0000.jpg'), '-vf', 'scale=1280:720', '-q:v', '4', join(out, 'poster.jpg')], { stdio: 'ignore' });
await browser.close();
