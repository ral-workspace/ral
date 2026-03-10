import type { Options } from "@wdio/types";
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCI = !!process.env.CI;
const artifactsDir = path.resolve(__dirname, "e2e/artifacts");

// Path to the Tauri debug binary (built with --features e2e)
const appBinary = path.resolve(
  __dirname,
  "src-tauri/target/debug/ral",
);

let tauriWebdriver: ChildProcess | null = null;
let appProcess: ChildProcess | null = null;
let logStream: fs.WriteStream | null = null;

/**
 * Wait until a TCP port is accepting connections.
 */
function waitForPort(port: number, timeout = 15000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Port ${port} not ready after ${timeout}ms`));
      }
      const socket = net.createConnection({ port, host: "127.0.0.1" }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

export const config: Options.Testrunner = {
  runner: "local",
  autoCompileOpts: {
    tsNodeOpts: { project: "./tsconfig.json" },
  },

  specs: ["./e2e/**/*.spec.ts"],
  exclude: [],

  maxInstances: 1,

  // Connect to tauri-webdriver proxy
  hostname: "localhost",
  port: 4444,
  path: "/",

  capabilities: [
    {
      browserName: "wry",
      "wry:engineOptions": {} as any,
    } as any,
  ],

  outputDir: path.join(artifactsDir, "wdio-logs"),
  logLevel: isCI ? "warn" : "info",
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  framework: "mocha",
  reporters: ["spec"],

  mochaOpts: {
    ui: "bdd",
    timeout: 60000,
  },

  onPrepare: async () => {
    // Ensure artifacts directory exists
    fs.mkdirSync(artifactsDir, { recursive: true });
    logStream = fs.createWriteStream(
      path.join(artifactsDir, "tauri-webdriver.log"),
    );

    // 1. Launch the Tauri app (plugin listens on port 4445)
    console.log(`[e2e] Launching app: ${appBinary}`);
    appProcess = spawn(appBinary, [], {
      stdio: "pipe",
      env: { ...process.env },
    });

    appProcess.stdout?.on("data", (data: Buffer) => {
      process.stderr.write(`[app] ${data}`);
      logStream.write(`[app:stdout] ${data}`);
    });
    appProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[app] ${data}`);
      logStream.write(`[app:stderr] ${data}`);
    });

    // Wait for the plugin WebDriver server to be ready on port 4445
    console.log("[e2e] Waiting for plugin WebDriver on port 4445...");
    await waitForPort(4445, 20000);
    console.log("[e2e] Plugin WebDriver ready");

    // 2. Start tauri-webdriver intermediary (proxies 4444 → 4445)
    tauriWebdriver = spawn("tauri-webdriver", ["--port", "4444"], {
      stdio: "pipe",
    });

    tauriWebdriver.stdout?.on("data", (data: Buffer) => {
      process.stderr.write(`[tauri-wd] ${data}`);
      logStream.write(`[tauri-wd:stdout] ${data}`);
    });
    tauriWebdriver.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[tauri-wd] ${data}`);
      logStream.write(`[tauri-wd:stderr] ${data}`);
    });

    // Wait for proxy to be ready
    await waitForPort(4444, 10000);
    console.log("[e2e] tauri-webdriver proxy ready");
  },

  afterTest: async (
    test: Record<string, unknown>,
    _context: unknown,
    result: { error?: Error; passed: boolean },
  ) => {
    if (!result.passed) {
      const screenshotDir = path.join(artifactsDir, "screenshots");
      fs.mkdirSync(screenshotDir, { recursive: true });
      const name = `${String(test.parent)}_${String(test.title)}`
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 100);
      const filePath = path.join(screenshotDir, `${name}.png`);
      try {
        await browser.saveScreenshot(filePath);
        console.log(`[e2e] Screenshot saved: ${filePath}`);
      } catch (e) {
        console.error("[e2e] Failed to save screenshot:", e);
      }
    }
  },

  onComplete: async () => {
    if (logStream) {
      logStream.end();
      logStream = null;
    }
    if (tauriWebdriver) {
      tauriWebdriver.kill();
      tauriWebdriver = null;
    }
    if (appProcess) {
      appProcess.kill();
      appProcess = null;
    }
  },
};
