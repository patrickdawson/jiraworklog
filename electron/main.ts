import path from "path";
import { fileURLToPath } from "url";
import { app, BrowserWindow, nativeImage } from "electron";
import dotenv from "dotenv";
import { registerIpcHandlers } from "./ipc.js";

dotenv.config({ quiet: true });
dotenv.config({ path: ".env.local", override: true, quiet: true });
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function windowIcon(): nativeImage | undefined {
    const iconPath = app.isPackaged
        ? path.join(process.resourcesPath, "icon.png")
        : path.join(__dirname, "../../build/icon.png");
    const image = nativeImage.createFromPath(iconPath);
    return image.isEmpty() ? undefined : image;
}

function createWindow(): void {
    const mainWindow = new BrowserWindow({
        width: 960,
        height: 720,
        icon: windowIcon(),
        webPreferences: {
            preload: path.join(__dirname, "../preload/preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    if (process.env["ELECTRON_RENDERER_URL"]) {
        void mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
    }
}

app.whenReady().then(() => {
    registerIpcHandlers();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});
