// Генерация PNG-иконок из public/favicon.svg через Playwright (запускается один раз, результат коммитится).
const { chromium } = require('playwright');
const { readFileSync, writeFileSync } = require('node:fs');
(async () => {
const svg = readFileSync('public/favicon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, file, pad = 0, bg = 'transparent') {
  await page.setViewportSize({ width: size, height: size });
  const inner = size - pad * 2;
  await page.setContent(`<html><body style="margin:0;background:${bg}"><div style="padding:${pad}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: bg === 'transparent' }));
}
await render(192, 'public/pwa-192.png');
await render(512, 'public/pwa-512.png');
await render(512, 'public/pwa-maskable-512.png', 56, '#0b1020');
await render(180, 'public/apple-touch-icon.png', 0, '#0b1020');
await browser.close();
console.log('icons done');
})();
