const path = require("path");
const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1300, height: 760 },
    deviceScaleFactor: 1.5,
  });
  await page.goto("file:///" + path.join(__dirname, "defensive-lineup-guide.html").replace(/\\/g, "/"));
  await page.waitForTimeout(700); // fonts

  const slides = page.locator(".slide");
  const n = await slides.count();
  const imgs = [];
  for (let i = 0; i < n; i++) {
    const buf = await slides.nth(i).screenshot({ type: "png" });
    imgs.push(`<img src="data:image/png;base64,${buf.toString("base64")}">`);
  }

  const doc = `<!DOCTYPE html><html><head><style>
    @page { size: 1280px 720px; margin: 0; }
    * { margin: 0; padding: 0; }
    img { width: 1280px; height: 720px; display: block; page-break-after: always; }
    img:last-child { page-break-after: auto; }
  </style></head><body>${imgs.join("")}</body></html>`;

  const flat = await browser.newPage();
  await flat.setContent(doc, { waitUntil: "load" });
  await flat.pdf({
    path: path.join(__dirname, "defensive-lineup-guide.pdf"),
    width: "1280px",
    height: "720px",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log(`flattened ${n} slides`);
})();
