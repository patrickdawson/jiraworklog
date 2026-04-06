import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    main: {
        build: {
            rollupOptions: {
                input: resolve(__dirname, "electron/main.ts"),
            },
        },
    },
    preload: {
        build: {
            rollupOptions: {
                input: resolve(__dirname, "electron/preload.ts"),
            },
        },
    },
    renderer: {
        root: resolve(__dirname, "src/renderer"),
        publicDir: resolve(__dirname, "src/renderer/public"),
        plugins: [react()],
    },
});
