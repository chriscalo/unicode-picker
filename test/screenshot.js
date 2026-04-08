import { chromium } from "playwright";
import { execSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_DIR = join(__dirname, "snapshots");
const PORT = process.argv[2] || "4175";
const BASE = `http://localhost:${PORT}`;

mkdirSync(SNAPSHOTS_DIR, { recursive: true });

function save(name, buffer) {
  const path = join(SNAPSHOTS_DIR, name);
  writeFileSync(path, buffer);
}

function diffSnapshots() {
  try {
    execSync(
      `git diff --quiet HEAD -- "${SNAPSHOTS_DIR}"`,
      { stdio: "ignore" },
    );
    console.log("✅ No visual changes detected.");
    return true;
  } catch {
    console.log("❌ Visual changes detected:");
    const diff = execSync(
      `git diff --stat HEAD -- "${SNAPSHOTS_DIR}"`,
      { encoding: "utf-8" },
    );
    console.log(diff);
    return false;
  }
}

async function scrollGrid(page, px) {
  await page.evaluate((scrollPx) => {
    // Works in both shadow DOM and light DOM
    const picker =
      document.querySelector("unicode-picker");
    const grid = picker.shadowRoot
      ? picker.shadowRoot
          .querySelector("char-grid")
          .shadowRoot
          .querySelector(".scroll-container")
      : picker.querySelector(
          "char-grid .scroll-container",
        );
    grid.scrollTop = scrollPx;
  }, px);
}

async function clickBlock(page, index) {
  await page.evaluate((idx) => {
    const picker =
      document.querySelector("unicode-picker");
    const nav = picker.shadowRoot
      ? picker.shadowRoot
          .querySelector(".blocks-nav")
      : picker.querySelector(".blocks-nav");
    const buttons =
      nav.querySelectorAll("button");
    if (buttons[idx]) buttons[idx].click();
  }, index);
}

async function capture() {
  const browser = await chromium.launch({
    headless: true,
  });

  // ── Desktop (1280 × 900) ────────────────────
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await desktop.newPage();
  await page.goto(BASE);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // 1. Default state
  save("01-default.png",
    await page.screenshot({ scale: "device" }));

  // 2. Scrolled down
  await scrollGrid(page, 3000);
  await page.waitForTimeout(300);
  save("02-scrolled.png",
    await page.screenshot({ scale: "device" }));

  // 3. Search with results
  await page.fill("input", "arrow");
  await page.waitForTimeout(300);
  save("03-search-results.png",
    await page.screenshot({ scale: "device" }));

  // 4. Search — no results
  await page.fill("input", "zzzznotfound");
  await page.waitForTimeout(300);
  save("04-search-empty.png",
    await page.screenshot({ scale: "device" }));

  // 5. Clear button visible
  await page.fill("input", "heart");
  await page.waitForTimeout(300);
  save("05-clear-button.png",
    await page.screenshot({ scale: "device" }));

  // 6. Keyboard selection
  await page.fill("input", "star");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  save("06-keyboard-selection.png",
    await page.screenshot({ scale: "device" }));

  // 7. Copy feedback
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  save("07-copy-feedback.png",
    await page.screenshot({ scale: "device" }));

  // 8. Block nav active state
  await page.fill("input", "");
  await page.waitForTimeout(300);
  await clickBlock(page, 4);
  await page.waitForTimeout(300);
  save("08-block-nav-active.png",
    await page.screenshot({ scale: "device" }));

  // 9. Block dimming
  await page.fill("input", "latin");
  await page.waitForTimeout(300);
  save("09-block-dimming.png",
    await page.screenshot({ scale: "device" }));

  await desktop.close();

  // ── Narrow (600 × 900) ──────────────────────
  const narrow = await browser.newContext({
    viewport: { width: 600, height: 900 },
    deviceScaleFactor: 2,
  });
  const narrowPage = await narrow.newPage();
  await narrowPage.goto(BASE);
  await narrowPage.waitForLoadState("networkidle");
  await narrowPage.waitForTimeout(500);

  // 10. Narrow — default
  save("10-narrow-default.png",
    await narrowPage.screenshot({
      scale: "device",
    }));

  // 11. Narrow — search
  await narrowPage.fill("input", "music");
  await narrowPage.waitForTimeout(300);
  save("11-narrow-search.png",
    await narrowPage.screenshot({
      scale: "device",
    }));

  await narrow.close();
  await browser.close();

  return diffSnapshots();
}

capture().then((passed) => {
  process.exit(passed ? 0 : 1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
