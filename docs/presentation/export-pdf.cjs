/**
 * Export pitch-v2.html → fheENV-pitch-deck-v2.pdf
 * Screenshots each slide at 1280×720 (native deck resolution) then
 * packs them as landscape pages inside a PDF using pdf-lib.
 *
 * Usage:  node export-pdf.cjs
 */
const { chromium } = require("/tmp/pdftools/node_modules/playwright");
const { PDFDocument } = require("/tmp/pdftools/node_modules/pdf-lib");
const { writeFileSync } = require("fs");
const { resolve } = require("path");

const HTML = resolve(__dirname, "pitch-v2.html");
const OUT = resolve(__dirname, "fheENV-pitch-deck-v2.pdf");
const W = 1280,
  H = 720;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`file://${HTML}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // let fonts / gradients paint

  const slideCount = await page.evaluate(
    () => document.querySelectorAll(".sl").length,
  );
  console.log(`Found ${slideCount} slides`);

  const pdfDoc = await PDFDocument.create();
  // 1 pt = 1/72 inch; 1280×720 px @ 96 dpi → pts
  const PW = (W / 96) * 72;
  const PH = (H / 96) * 72;

  for (let i = 0; i < slideCount; i++) {
    await page.evaluate((idx) => {
      document
        .querySelectorAll(".sl")
        .forEach((s, j) => s.classList.toggle("on", j === idx));
    }, i);
    await page.waitForTimeout(200);

    const buf = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: W, height: H },
    });

    const img = await pdfDoc.embedPng(buf);
    const pg = pdfDoc.addPage([PW, PH]);
    pg.drawImage(img, { x: 0, y: 0, width: PW, height: PH });
    process.stdout.write(`  slide ${i + 1}/${slideCount}\r`);
  }

  const pdfBytes = await pdfDoc.save();
  writeFileSync(OUT, pdfBytes);
  await browser.close();
  console.log(
    `\nSaved → ${OUT}  (${(pdfBytes.length / 1024 / 1024).toFixed(1)} MB)`,
  );
})();
