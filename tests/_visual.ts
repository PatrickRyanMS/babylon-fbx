import { chromium } from "playwright";

async function main() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    
    const errors: string[] = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("http://localhost:5173/");
    await page.waitForTimeout(6000);

    // Select walk animation and let it play a moment
    const animSelect = page.locator("select").nth(1);
    await animSelect.selectOption({ label: "Spider_Walk" });
    await page.waitForTimeout(2000);

    // Stop and set camera
    await page.evaluate(() => {
        const scene = (window as any).__scene;
        if (!scene) { console.error("No __scene!"); return; }
        scene.stopAllAnimations();
        const camera = scene.activeCamera;
        if (camera) {
            camera.alpha = Math.PI * 0.75;
            camera.beta = Math.PI / 3;
            camera.radius = 80;
            camera.target.set(0, 20, 0);
        }
    });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "tests/_screenshot_fbx_walk.png" });
    console.log("FBX walk captured");

    // Now load GLB for comparison  
    const modelSelect = page.locator("select").first();
    await modelSelect.selectOption({ label: "Spider (GLB reference)" });
    await page.waitForTimeout(500);
    const loadBtn = page.locator("button", { hasText: /load/i }).first();
    await loadBtn.click();
    await page.waitForTimeout(5000);

    // Play walk on GLB
    const animSelect2 = page.locator("select").nth(1);
    await animSelect2.selectOption({ label: "Spider_Walk" });
    await page.waitForTimeout(2000);

    // Stop and same camera
    await page.evaluate(() => {
        const scene = (window as any).__scene;
        if (!scene) return;
        scene.stopAllAnimations();
        const camera = scene.activeCamera;
        if (camera) {
            camera.alpha = Math.PI * 0.75;
            camera.beta = Math.PI / 3;
            camera.radius = 80;
            camera.target.set(0, 20, 0);
        }
    });
    await page.waitForTimeout(1000);

    await page.screenshot({ path: "tests/_screenshot_glb_walk.png" });
    console.log("GLB walk captured");

    if (errors.length) {
        console.log("\nErrors:", errors.slice(0, 5).join("\n"));
    }

    await browser.close();
}
main();
