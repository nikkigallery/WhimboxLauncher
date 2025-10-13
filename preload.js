const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取资源路径
  getAssetPath: () => {
    // 开发环境用相对路径，生产环境用绝对路径
    if (process.env.NODE_ENV === 'development') {
      return './assets/bg.webp';
    } else {
      // 生产环境，资源在 app.asar 同级的 resources/assets 目录
      return 'file:///resources/assets/bg.webp';
    }
  },
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  
  // Python环境
  detectPythonEnvironment: () => ipcRenderer.invoke('detect-python'),
  setupPythonEnvironment: () => ipcRenderer.invoke('setup-python'),
  
  // 更新和安装
  checkManualUpdateWhl: () => ipcRenderer.invoke('check-manual-update-whl'),
  installWhl: (wheelPath) => ipcRenderer.invoke('install-whl', wheelPath),
  downloadAndInstallWhl: (url, md5) => ipcRenderer.invoke('download-and-install-whl', url, md5),
  
  // 应用状态和控制
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  launchApp: () => ipcRenderer.invoke('launch-app'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 脚本下载
  downloadAndUnzipScript: () => ipcRenderer.invoke('download-and-unzip-script'),

  // 事件监听
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, progress) => callback(progress));
  },
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_, message) => callback(message));
  },
  onPythonSetup: (callback) => {
    ipcRenderer.on('python-setup', (_, data) => callback(data));
  },
  onLaunchAppStatus: (callback) => {
    ipcRenderer.on('launch-app-status', (_, data) => callback(data));
  },
  onLaunchAppEnd: (callback) => {
    ipcRenderer.on('launch-app-end', (_, data) => callback(data));
  },
});