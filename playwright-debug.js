const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('CONSOLE', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGEERROR', err.message));
  page.on('requestfailed', req => console.log('REQUESTFAILED', req.url(), req.failure().errorText));
  await page.goto('http://127.0.0.1:8080', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log('READY');
  await browser.close();
})();
