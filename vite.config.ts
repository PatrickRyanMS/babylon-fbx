import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
    root: "viewer",
    assetsInclude: ["**/*.fbx", "**/*.glb"],
    resolve: {
        alias: {
            // Force Vite to use the ESM entry for the inspector (not the UMD dist/)
            "@babylonjs/inspector": resolve(
                __dirname,
                "node_modules/@babylonjs/inspector/lib/index.js"
            ),
        },
    },
    server: {
        fs: {
            allow: [resolve(__dirname)],
        },
    },
});
