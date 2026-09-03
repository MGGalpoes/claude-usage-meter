// Widget flutuante do Clauditchi (Electron): janela transparente, sem borda, sempre no topo.
// Sobe o servidor (node index.js serve) se a porta nao estiver aberta.
const { app, BrowserWindow, shell, screen, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");

const PORT = Number(process.env.CLAUDITCHI_PORT || 4242);
const ROOT = path.join(__dirname, "..");
const POS_FILE = path.join(os.homedir(), ".clauditchi-widget.json");
const W = 290, H = 330;
let server = null;

function portOpen() {
  return new Promise((res) => {
    const s = net.connect(PORT, "127.0.0.1");
    s.once("connect", () => { s.destroy(); res(true); });
    s.once("error", () => res(false));
  });
}
async function ensureServer() {
  if (await portOpen()) return;
  server = spawn(process.execPath, [path.join(ROOT, "index.js"), "serve", String(PORT)], { cwd: ROOT, stdio: "ignore", windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
  for (let i = 0; i < 50 && !(await portOpen()); i++) await new Promise((r) => setTimeout(r, 100));
}
function loadPos() { try { return JSON.parse(fs.readFileSync(POS_FILE, "utf8")); } catch { return null; } }

app.whenReady().then(async () => {
  await ensureServer();
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let pos = loadPos();
  if (!pos || pos.x < 0 || pos.y < 0 || pos.x > sw - 60 || pos.y > sh - 60) pos = { x: sw - W - 16, y: sh - H - 16 };
  const win = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y, transparent: true, frame: false, alwaysOnTop: true, resizable: false,
    hasShadow: false, skipTaskbar: true, title: "Clauditchi", webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  win.setMenu(null);
  win.loadURL(`http://localhost:${PORT}/?widget=1`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.on("moved", () => { const [x, y] = win.getPosition(); try { fs.writeFileSync(POS_FILE, JSON.stringify({ x, y })); } catch {} });
  ipcMain.on("widget:close", () => win.close());
  ipcMain.on("widget:settings", () => shell.openExternal(`http://localhost:${PORT}/`));
});
app.on("window-all-closed", () => { if (server) server.kill(); app.quit(); });
