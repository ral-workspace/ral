import type { Options } from "@wdio/types";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCI = !!process.env.CI;

// Path to the Tauri debug binary (built with --features e2e)
const appBinary = path.resolve(
  __dirname,
  "src-tauri/target/debug/ral",
);

let tauriWebdriver: ChildProcess | null = null;
let appProcess: ChildProcess | null = null;

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
    // 1. Launch the Tauri app (plugin listens on port 4445)
    console.log(`[e2e] Launching app: ${appBinary}`);
    appProcess = spawn(appBinary, [], {
      stdio: "pipe",
      env: { ...process.env },
    });

    appProcess.stdout?.on("data", (data: Buffer) => {
      process.stderr.write(`[app] ${data}`);
    });
    appProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[app] ${data}`);
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
    });
    tauriWebdriver.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`[tauri-wd] ${data}`);
    });

    // Wait for proxy to be ready
    await waitForPort(4444, 10000);
    console.log("[e2e] tauri-webdriver proxy ready");
  },

  onComplete: async () => {
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
