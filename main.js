const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const configManager = require('./config');
const downloader = require('./downloader');
const pythonManager = require('./python-manager');
const appManager = require('./app-manager');

// 主窗口引用
let mainWindow;

// 创建主窗口
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    frame: false, // 隐藏默认标题栏
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');
  
  // 开发环境下打开开发者工具
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
};

// 应用准备就绪时创建窗口
app.whenReady().then(() => {
  createWindow();

  // 设置下载进度事件监听
  downloader.on('progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progress.progress);
    }
  });
  
  // 设置安装进度事件监听
  pythonManager.on('install-progress', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('install-progress', data.output);
    }
  });
  
  // 设置 Python 环境设置事件监听
  pythonManager.on('setup-start', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-setup', { stage: 'setup-start', message: data.message });
    }
  });
  
  pythonManager.on('extract-progress', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-setup', { stage: 'extract-progress', message: data.message });
    }
  });
  
  pythonManager.on('extract-complete', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-setup', { stage: 'extract-complete', message: data.message });
    }
  });

  pythonManager.on('setup-pip', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-setup', { stage: 'setup-pip', message: data.message });
    }
  });

  pythonManager.on('pip-ready', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-setup', { stage: 'pip-ready', message: data.message });
    }
  });

  pythonManager.on('setup-complete', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('python-setup', { stage: 'setup-complete', message: data.message });
    }
  });

  // macOS应用激活时重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // 设置IPC处理程序
  setupIpcHandlers();
});

// 所有窗口关闭时退出应用（macOS除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 设置IPC处理程序
function setupIpcHandlers() {
  // 窗口控制
  ipcMain.on('minimize-window', () => {
    if (mainWindow) {
      mainWindow.minimize();
    }
  });
  
  ipcMain.on('close-window', () => {
    if (mainWindow) {
      mainWindow.close();
    }
  });
  
  // 配置相关
  ipcMain.handle('get-config', () => {
    return configManager.getConfig();
  });
  
  ipcMain.handle('save-config', (_, config) => {
    return configManager.updateConfig(config);
  });
  
  ipcMain.handle('should-check-updates', () => {
    return configManager.shouldCheckForUpdates();
  });
  
  // Python环境
  ipcMain.handle('detect-python', async () => {
    try {
      return await pythonManager.detectPythonEnvironment();
    } catch (error) {
      throw new Error(`检测Python环境失败: ${error.message}`);
    }
  });
  
  // 安装Python环境
  ipcMain.handle('setup-python', async () => {
    try {
      return await pythonManager.setupEmbeddedPython();
    } catch (error) {
      throw new Error(`安装Python环境失败: ${error.message}`);
    }
  });
  
  ipcMain.handle('download-and-install', async () => {
    try {
      return await appManager.downloadAndInstall();
    } catch (error) {
      throw new Error(`下载并安装失败: ${error.message}`);
    }
  });
  
  // 应用状态和控制
  ipcMain.handle('get-app-status', () => {
    return appManager.getAppStatus();
  });
  
  ipcMain.handle('launch-app', async () => {
    try {
      return await appManager.launchApp();
    } catch (error) {
      throw new Error(`启动应用失败: ${error.message}`);
    }
  });
  
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
}