const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("widgetApi", {
  close: () => ipcRenderer.send("widget:close"),
  openSettings: () => ipcRenderer.send("widget:settings"),
});
