const path = require("path");
const { chromium } = require("@playwright/test");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("file:///" + path.join(__dirname, "defensive-lineup-guide.html").replace(/\\/g, "/"));
  await page.waitForTimeout(500); // let fonts settle
  await page.pdf({
    path: path.join(__dirname, "defensive-lineup-guide.pdf"),
    width: "1280px",
    height: "720px",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log("PDF written");
})();
