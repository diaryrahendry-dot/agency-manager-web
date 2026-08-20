const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess = null;

function startServer() {
  const serverScript = path.join(__dirname, '../dist/server/_core/index.js');
  serverProcess = spawn('node', [serverScript], {
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' },
    stdio: 'inherit'
  });
}

function createWindow() {
  startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'AgencyManager Pro',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Wait a moment for server to start, then load
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 2000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) {
      serverProcess.kill();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
