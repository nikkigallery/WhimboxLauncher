const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const logger = require('./logger'); // 引入日志模块（必须在最前面初始化）
const downloader = require('./downloader');
const pythonManager = require('./python-manager');
const appManager = require('./app-manager');
const scriptManager = require('./script-manager');

// 避免因为使用Administrator账户运行，引起权限问题，导致加载不了页面，直接梭哈全禁用了
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('disable-features', 'RendererCodeIntegrity');

// 单实例检查 - 防止应用重复运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // 没有获得锁，说明已有实例在运行，直接退出
  console.log('应用已在运行，退出当前实例');
  app.quit();
} else {
  // 获得了锁，监听第二个实例启动事件
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    console.log('检测到第二个实例尝试启动，聚焦到现有窗口');
    // 如果窗口存在，聚焦它
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

// 主窗口引用
let mainWindow;
let authServer = null;
let authPort = 0;

// 创建主窗口
const createWindow = () => {
  try {
    mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      minWidth: 800,
      minHeight: 600,
      frame: false, // 隐藏默认标题栏
      transparent: false,
      resizable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
      icon: path.join(__dirname, 'assets', 'icon.ico')
    });
    mainWindow.loadFile('index.html');
    
    // 开发环境下打开开发者工具
    if (process.env.NODE_ENV === 'development') {
      console.log('开发环境，打开开发者工具');
      mainWindow.webContents.openDevTools();
    }
  } catch (error) {
    console.error('创建主窗口时发生错误:', error);
    console.error('错误堆栈:', error.stack);
    throw error;
  }
};

// 认证服务器请求处理函数
function handleAuthRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${authPort}`);
  console.log(`收到HTTP请求: ${req.method} ${url.pathname}`);
  
  if (url.pathname === '/auth/callback') {
    const refreshToken = url.searchParams.get('refresh_token');
    
    if (refreshToken) {
      console.log('收到refresh_token:', refreshToken);
      
      // 发送refresh_token到渲染进程
      if (mainWindow) {
        mainWindow.webContents.send('auth-callback', { refreshToken });
      }
      
      // 返回成功页面
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('奇想盒启动器已经登录成功，你可以关闭该页面');
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing refresh_token');
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
}

// 启动认证服务器
function startAuthServer() {
  console.log('准备启动认证服务器...');
  return new Promise((resolve, reject) => {
    try {
      // 创建HTTP服务器
      const createServer = () => {
        authServer = http.createServer(handleAuthRequest);
      };
      
      createServer();
      console.log('HTTP服务器对象创建成功');
      
      // 尝试从8080端口开始，如果被占用则递增
      let port = 8080;
      const tryStart = () => {
        console.log(`尝试在端口 ${port} 启动认证服务器...`);
        
        // 添加错误事件监听器，用于捕获端口占用错误
        authServer.once('error', (err) => {
          console.warn(`端口 ${port} 启动失败:`, err.message);
          if (err.code === 'EADDRINUSE') {
            port++;
            if (port < 8090) { // 最多尝试到8089
              // 移除旧的监听器，创建新的服务器实例
              authServer.removeAllListeners();
              createServer();
              tryStart();
            } else {
              const error = new Error('无法找到可用端口');
              console.error(error.message);
              reject(error);
            }
          } else {
            console.error('启动认证服务器出错:', err);
            reject(err);
          }
        });
        
        authServer.listen(port, '127.0.0.1', () => {
          authPort = port;
          console.log(`认证服务器已启动，端口: ${authPort}`);
          resolve(port);
        });
      };
      
      tryStart();
    } catch (error) {
      console.error('创建认证服务器时发生错误:', error);
      reject(error);
    }
  });
}

// 停止认证服务器
function stopAuthServer() {
  if (authServer) {
    authServer.close();
    authServer = null;
    authPort = 0;
    console.log('认证服务器已停止');
  }
}

// 应用准备就绪时创建窗口
app.whenReady().then(async () => {
  console.log('应用准备就绪 (app.whenReady)');

  try {
    // 启动认证服务器
    console.log('开始启动认证服务器...');
    await startAuthServer();
    console.log('认证服务器启动完成');
  } catch (error) {
    console.error('启动认证服务器失败:', error);
    console.error('错误堆栈:', error.stack);
  }
  
  try {
    console.log('准备创建窗口...');
    createWindow();
    console.log('createWindow 调用完成');
  } catch (error) {
    console.error('createWindow 调用失败:', error);
    console.error('错误堆栈:', error.stack);
    // 不要让应用完全崩溃
  }

  // 设置下载进度事件监听
  if (mainWindow){
    console.log('设置事件监听器...');
    
    downloader.on('progress', (progress) => {
      mainWindow.webContents.send('download-progress', progress.progress);
    });
    
    // 设置安装进度事件监听
    pythonManager.on('install-progress', (data) => {
      mainWindow.webContents.send('install-progress', data.output);
    });

    // pip 源速度测试事件监听
    pythonManager.on('speed-test-start', (data) => {
      mainWindow.webContents.send('install-progress', data.message);
    });

    pythonManager.on('speed-test-progress', (data) => {
      mainWindow.webContents.send('install-progress', data.message);
    });

    pythonManager.on('speed-test-complete', (data) => {
      mainWindow.webContents.send('install-progress', data.message);
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

    appManager.on('launch-app-status', (data) => {
      mainWindow.webContents.send('launch-app-status', {message: data.message});
    });
    
    console.log('事件监听器设置完成');
  } else {
    console.error('mainWindow 为 null，无法设置事件监听器');
  }
  
  try {
    // 设置IPC处理程序
    console.log('设置IPC处理程序...');
    setupIpcHandlers();
    console.log('IPC处理程序设置完成');
  } catch (error) {
    console.error('设置IPC处理程序失败:', error);
    console.error('错误堆栈:', error.stack);
  }
  
  console.log('app.whenReady 处理完成');
}).catch((error) => {
  console.error('app.whenReady 处理过程中发生未捕获的错误:', error);
  console.error('错误堆栈:', error.stack);
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
  console.log('所有窗口已关闭');
  // 停止认证服务器
  stopAuthServer();
  
  if (process.platform !== 'darwin') {
    console.log('退出应用...');
    app.quit();
  }
});

// 应用退出前清理
app.on('before-quit', () => {
  console.log('应用即将退出，执行清理...');
  stopAuthServer();
});

// 监听应用激活事件（macOS）
app.on('activate', () => {
  console.log('应用被激活');
  if (BrowserWindow.getAllWindows().length === 0) {
    console.log('没有窗口，创建新窗口');
    createWindow();
  }
});

// 设置IPC处理程序
function setupIpcHandlers() {
  console.log('开始设置IPC处理程序...');
  
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

  // 打开外部链接
  ipcMain.on('open-external', (_, url) => {
    shell.openExternal(url);
  });

  // 获取认证服务器端口
  ipcMain.handle('get-auth-port', () => {
    return authPort;
  });

  // 接收渲染进程的日志
  ipcMain.on('renderer-log', (_, data) => {
    const { level, args } = data;
    const logInstance = logger.getLogger();
    
    // 在日志前添加 [Renderer] 标记，以便区分渲染进程日志
    const message = ['[Renderer]', ...args];
    
    // 根据日志级别调用对应的方法
    switch (level) {
      case 'error':
        logInstance.error(...message);
        break;
      case 'warn':
        logInstance.warn(...message);
        break;
      case 'info':
        logInstance.info(...message);
        break;
      case 'debug':
        logInstance.debug(...message);
        break;
      default:
        logInstance.info(...message);
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

  // 打开文件选择器选择 whl 文件
  ipcMain.handle('select-whl-file', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择 whl 安装包',
        filters: [
          { name: 'Python Wheel 包', extensions: ['whl'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      
      return null;
    } catch (error) {
      throw new Error(`选择文件失败: ${error.message}`);
    }
  });

  ipcMain.handle('install-whl', async (_, wheelPath, deleteWheel = true) => {
    try {
      return await appManager.installWhl(wheelPath, deleteWheel);
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

  ipcMain.handle('stop-app', async () => {
    try {
      return await appManager.stopApp();
    } catch (error) {
      throw new Error(`停止应用失败: ${error.message}`);
    }
  });
  
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('open-scripts-folder', async () => {
    return await scriptManager.openScriptsFolder();
  });

  ipcMain.handle('open-logs-folder', async () => {
    return await appManager.openLogsFolder();
  });


  // 更新订阅脚本 - 接收渲染进程传来的脚本数据并下载
  ipcMain.handle('update-subscribed-scripts', async (_, scriptsData) => {
    try {
      // 直接传递脚本数据给 scriptManager
      const result = await scriptManager.updateSubscribedScripts(scriptsData);
      return result;
    } catch (error) {
      throw new Error(`更新订阅脚本失败: ${error.message}`);
    }
  });

  // 获取脚本元数据
  ipcMain.handle('get-scripts-metadata', () => {
    try {
      return scriptManager.getScriptsMetadata();
    } catch (error) {
      throw new Error(`获取脚本元数据失败: ${error.message}`);
    }
  });

  // 监听脚本管理器事件并转发到渲染进程
  scriptManager.on('scriptDownloaded', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('script-downloaded', data);
    }
  });

  scriptManager.on('scriptDownloadError', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('script-download-error', data);
    }
  });

  scriptManager.on('updateComplete', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('script-update-complete', data);
    }
  });

  scriptManager.on('updateError', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('script-update-error', data);
    }
  });
}