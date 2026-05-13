/**
 * Quick visual test: Capture Phoenix at multiple animation frames
 * to verify animation is working visually.
 */
import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = "http://localhost:5175";
const OUTPUT_DIR = path.resolve("tests/scripts/visual-output");

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.goto(BASE_URL);
    
    // Wait for initial model load
    await page.waitForFunction(
        () => {
            const s = document.getElementById("status");
            return s && s.textContent && s.textContent.startsWith("Loaded:");
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(2000);

    // Hide inspector
    const inspBtn = page.locator("button", { hasText: "Inspector" });
    if (await inspBtn.isVisible()) {
        await inspBtn.click();
        await page.waitForTimeout(500);
    }

    // Select Phoenix (index 5)
    console.log("Loading Phoenix...");
    const select = page.locator("#modelSelect");
    await select.selectOption("5");
    
    await page.waitForFunction(
        () => {
            const s = document.getElementById("status");
            return s && s.textContent && s.textContent.includes("Loaded:");
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(1000);

    // Capture at different time offsets to show animation
    // The animation auto-plays, so just take screenshots at intervals
    for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(150); // ~4.5 frames at 30fps
        await page.screenshot({
            path: path.join(OUTPUT_DIR, `phoenix-frame-${i}.png`),
        });
        console.log(`  Captured frame ${i}`);
    }

    // Also capture Spider for comparison
    console.log("\nLoading Spider FBX...");
    await select.selectOption("0");
    await page.waitForFunction(
        () => {
            const s = document.getElementById("status");
            return s && s.textContent && s.textContent.includes("Loaded:");
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(2000);
    await page.screenshot({
        path: path.join(OUTPUT_DIR, `spider-fbx-current.png`),
    });
    console.log("  Captured spider");

    // Spider GLB reference
    console.log("Loading Spider GLB...");
    await select.selectOption("1");
    await page.waitForFunction(
        () => {
            const s = document.getElementById("status");
            return s && s.textContent && s.textContent.includes("Loaded:");
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(2000);
    await page.screenshot({
        path: path.join(OUTPUT_DIR, `spider-glb-current.png`),
    });
    console.log("  Captured spider GLB");

    // Mech Drone
    console.log("Loading Mech Drone...");
    await select.selectOption("8");
    await page.waitForFunction(
        () => {
            const s = document.getElementById("status");
            return s && s.textContent && s.textContent.includes("Loaded:");
        },
        { timeout: 30000 }
    );
    await page.waitForTimeout(2000);
    await page.screenshot({
        path: path.join(OUTPUT_DIR, `mech-drone-current.png`),
    });
    console.log("  Captured mech drone");

    await browser.close();
    console.log("\nDone! Screenshots in tests/scripts/visual-output/");
}

main().catch(console.error);
