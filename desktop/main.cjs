const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = process.env.PLUGIN_AGENT_PORT || "43177";

let serverProcess;
let win;

function standaloneDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone");
  }
  return path.join(__dirname, "..", ".next", "standalone");
}

function waitForServer(timeoutMs) {
  const url = `http://127.0.0.1:${PORT}`;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Plugin Agent did not start on ${url}`));
          return;
        }
        setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  if (process.platform === "win32" && serverProcess.pid) {
    spawn("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
  } else {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = undefined;
}

async function start() {
  const locked = app.requestSingleInstanceLock();
  if (!locked) {
    app.quit();
    return;
  }
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  await app.whenReady();

  const standalone = standaloneDir();
  const serverJs = path.join(standalone, "server.js");
  if (!fs.existsSync(serverJs)) {
    await dialog.showErrorBox(
      "Plugin Agent",
      `The bundled server is missing:\n${serverJs}\n\nReinstall Plugin Agent.`,
    );
    app.quit();
    return;
  }

  const userData = app.getPath("userData");
  const data = path.join(userData, "data");
  fs.mkdirSync(data, { recursive: true });

  const env = {
    ...process.env,
    PORT,
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    PLUGIN_AGENT_ROOT: standalone,
    PLUGIN_AGENT_DATA: data,
    ELECTRON_RUN_AS_NODE: "1",
  };

  serverProcess = spawn(process.execPath, [serverJs], {
    cwd: standalone,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  serverProcess.on("exit", (code) => {
    if (code && win) {
      dialog.showErrorBox("Plugin Agent", `The local server stopped (code ${code}).`);
    }
  });

  try {
    await waitForServer(45000);
  } catch (error) {
    await dialog.showErrorBox(
      "Plugin Agent",
      error instanceof Error ? error.message : "Could not start the local server.",
    );
    stopServer();
    app.quit();
    return;
  }

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 560,
    title: "Plugin Agent",
    autoHideMenuBar: true,
    backgroundColor: "#111111",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("closed", () => {
    win = undefined;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  await win.loadURL(`http://127.0.0.1:${PORT}`);
}

app.on("window-all-closed", () => {
  stopServer();
  app.quit();
});
app.on("before-quit", () => {
  stopServer();
});

start().catch((error) => {
  console.error(error);
  stopServer();
  app.exit(1);
});
