const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // 配置相关
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Python环境
  detectPythonEnvironment: () => ipcRenderer.invoke('detect-python'),
  setupPythonEnvironment: () => ipcRenderer.invoke('setup-python'),
  
  // 更新和安装
  checkForUpdates: () => ipcRenderer.invoke('check-updates'),
  shouldCheckForUpdates: () => ipcRenderer.invoke('should-check-updates'),
  downloadAndInstall: () => ipcRenderer.invoke('download-and-install'),
  
  // 应用状态和控制
  getAppStatus: () => ipcRenderer.invoke('get-app-status'),
  launchApp: () => ipcRenderer.invoke('launch-app'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // 事件监听
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, progress) => callback(progress));
  },
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (_, message) => callback(message));
  },
  onPythonSetup: (callback) => {
    ipcRenderer.on('python-setup', (_, data) => callback(data));
  }
});