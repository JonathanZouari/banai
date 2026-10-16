// Warm-up before the suite: the first page load makes Vite compile every module on
// demand and SwiftShader compile its shaders. Doing that once here (instead of in two
// parallel workers at the same time) keeps the first real tests within their timeout.
import { chromium } from '@playwright/test';

export default async function globalSetup(config) {
  const { baseURL, launchOptions } = config.projects[0].use;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();
  await page.goto(baseURL);
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'), null, { timeout: 120_000 });
  await browser.close();
}
