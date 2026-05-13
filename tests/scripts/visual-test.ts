/**
 * Visual test script — loads each model in the viewer and captures a screenshot.
 * Run: npx tsx tests/scripts/visual-test.ts
 * Prerequisites: Dev server running on localhost:5174
 */
import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = "http://localhost:5174";
const OUTPUT_DIR = path.resolve("tests/scripts/visual-output");

// Model indices in the viewer dropdown (0-based)
const MODELS_TO_TEST = [
    { index: 0, name: "spider-fbx" },
    { index: 1, name: "spider-glb" },
    { index: 2, name: "valkyrie-binary" },
    { index: 5, name: "phoenix" },
    { index: 6, name: "ww1-plane" },
    { index: 7, name: "hover-bike" },
    { index: 8, name: "mech-drone" },
    { index: 4, name: "cat" },
];

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Navigate to viewer
    await page.goto(BASE_URL);
    // Wait for initial model to load
    await page.waitForFunction(
        () => {
            const s = document.getElementById("status");
            return s && s.textContent && s.textContent.startsWith("Loaded:");
        },
        { timeout: 30000 }
    );
    // Wait a bit for rendering to settle
    await page.waitForTimeout(2000);

    // Hide the inspector to get a clean view
    const inspBtn = page.locator("button", { hasText: "Inspector" });
    if (await inspBtn.isVisible()) {
        await inspBtn.click();
        await page.waitForTimeout(500);
    }

    for (const model of MODELS_TO_TEST) {
        console.log(`Capturing: ${model.name} (index ${model.index})...`);

        // Select model from dropdown
        const select = page.locator("#modelSelect");
        await select.selectOption(String(model.index));

        // Wait for load to complete
        await page.waitForFunction(
            () => {
                const s = document.getElementById("status");
                return s && s.textContent && s.textContent.startsWith("Loaded:");
            },
            { timeout: 30000 }
        );

        // Let the scene render for a moment
        await page.waitForTimeout(2000);

        // Capture screenshot
        const screenshotPath = path.join(OUTPUT_DIR, `${model.name}.png`);
        await page.screenshot({ path: screenshotPath });
        console.log(`  Saved: ${screenshotPath}`);
    }

    await browser.close();
    console.log("\nDone! Screenshots saved to:", OUTPUT_DIR);
}

main().catch((err) => {
    console.error("Visual test failed:", err);
    process.exit(1);
});
