const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const downloader = require('./downloader');
const pythonManager = require('./python-manager');
const appManager = require('./app-manager');
const scriptManager = require('./script-manager');

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
  // if (process.env.NODE_ENV === 'development') {
    // mainWindow.webContents.openDevTools();
  // }
  mainWindow.webContents.openDevTools();
};

// 应用准备就绪时创建窗口
app.whenReady().then(() => {
  createWindow();

  // 设置下载进度事件监听
  if (mainWindow){
    downloader.on('progress', (progress) => {
      mainWindow.webContents.send('download-progress', progress.progress);
    });
    
    // 设置安装进度事件监听
    pythonManager.on('install-progress', (data) => {
      mainWindow.webContents.send('install-progress', data.output);
    });
    
    // 设置 Python 环境设置事件监听
    pythonManager.on('setup-start', (data) => {
      mainWindow.webContents.send('python-setup', { stage: 'setup-start', message: data.message });
    });
    
    pythonManager.on('extract-progress', (data) => {
      mainWindow.webContents.send('python-setup', { stage: 'extract-progress', message: data.message });
    });
    
    pythonManager.on('extract-complete', (data) => {
      mainWindow.webContents.send('python-setup', { stage: 'extract-complete', message: data.message });
    });

    pythonManager.on('setup-pip', (data) => {
      mainWindow.webContents.send('python-setup', { stage: 'setup-pip', message: data.message });
    });

    pythonManager.on('pip-ready', (data) => {
      mainWindow.webContents.send('python-setup', { stage: 'pip-ready', message: data.message });
    });

    pythonManager.on('setup-complete', (data) => {
      mainWindow.webContents.send('python-setup', { stage: 'setup-complete', message: data.message });
    });

    appManager.on('launch-app-end', (data) => {
      mainWindow.webContents.send('launch-app-end', {message: data.message});
    });

    appManager.on('launch-app-success', () => {
      mainWindow.webContents.send('launch-app-success', {message: '奇想盒启动成功'});
    });
  }
  
  // 设置IPC处理程序
  setupIpcHandlers();
});

// 所有窗口关闭时退出应用
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
  
  ipcMain.handle('check-manual-update-whl', async () => {
    try {
      return await appManager.checkManualUpdateWhl();
    } catch (error) {
      throw new Error(`检查手动更新包失败: ${error.message}`);
    }
  });

  ipcMain.handle('install-whl', async (_, wheelPath) => {
    try {
      return await appManager.installWhl(wheelPath);
    } catch (error) {
      throw new Error(`安装更新包失败: ${error.message}`);
    }
  });

  ipcMain.handle('download-and-install-whl', async (_, url, md5) => {
    try {
      return await appManager.downloadAndInstallWhl(url, md5);
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

  // 脚本下载
  ipcMain.handle('download-and-unzip-script', async () => {
    try {
      return await scriptManager.downloadAndUnzipScript();
    } catch (error) {
      throw new Error(`下载脚本失败: ${error.message}`);
    }
  });
}