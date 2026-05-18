/**
 * Visual test script — loads each model in the viewer and captures a screenshot.
 * Run: npm run viewer, then npx tsx tests/scripts/visual-test.ts
 */
import { chromium } from "playwright";
import * as path from "path";
import * as fs from "fs";

const BASE_URL = process.env.VIEWER_URL ?? "http://localhost:5173";
const OUTPUT_DIR = path.resolve("tests/scripts/visual-output");

const MODELS_TO_TEST = [
    { locator: "spider-animated-character/Spider_sketchfab.fbx", name: "spider-fbx" },
    { locator: "spider-animated-character/spider_animated_character.glb", name: "spider-glb" },
    { locator: "valkyrie/valkyrie_asset.fbx", name: "valkyrie-binary" },
    { locator: "behemot-cat/LowPoly_Cat_V04.fbx", name: "behemot-cat" },
    { locator: "stylized-mangrove-greenhouse/Mangrove Greenhouse.fbx", name: "mangrove-greenhouse" },
    { locator: "the-last-stronghold-animated/Floating_Gate_Chinese1.fbx", name: "last-stronghold" },
    { locator: "spartan-armour-mkv-halo-reach/Spartan_Sketchfab.fbx", name: "spartan-fbx" },
];

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    for (const model of MODELS_TO_TEST) {
        console.log(`Capturing: ${model.name}...`);

        const url = new URL(BASE_URL);
        url.searchParams.set("model", model.locator);
        await page.goto(url.href);
        await waitForModelLoad(page);

        const inspectorButton = page.locator("button", { hasText: "Inspector" });
        if (await inspectorButton.isVisible()) {
            await inspectorButton.click();
            await page.waitForTimeout(500);
        }
        await page.waitForTimeout(2000);

        const screenshotPath = path.join(OUTPUT_DIR, `${model.name}.png`);
        await page.screenshot({ path: screenshotPath });
        console.log(`  Saved: ${screenshotPath}`);
    }

    await browser.close();
    console.log("\nDone! Screenshots saved to:", OUTPUT_DIR);
}

async function waitForModelLoad(page: import("playwright").Page): Promise<void> {
    await page.waitForFunction(
        () => {
            const status = document.getElementById("status");
            return status?.textContent?.startsWith("Loaded:");
        },
        { timeout: 60000 }
    );
}

main().catch((err) => {
    console.error("Visual test failed:", err);
    process.exit(1);
});
