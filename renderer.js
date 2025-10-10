// ==================== 导入模块 ====================
import { initLoginModule, updateUserUI } from './login.js';
import { apiClient } from './api-client.js';

// 与主进程通信的API
const api = window.electronAPI;

// 应用状态
let appState = {
  isLogin: false,
  pythonReady: false,
  appInstalled: false,
  autoUpdateAvailable: false,
  manualUpdateAvailable: false,
  isProcessing: false
};

// DOM元素
const elements = {
  // 标题栏按钮
  minimizeBtn: document.getElementById('minimize-btn'),
  closeBtn: document.getElementById('close-btn'),
  
  // 公告
  announcementList: document.getElementById('announcement-list'),
  
  // 状态显示
  pythonStatus: document.getElementById('python-status'),
  appVersionDisplay: document.getElementById('app-version-display'),
  updateStatus: document.getElementById('update-status'),
  
  // 进度条
  progressContainer: document.getElementById('progress-container'),
  progressLabelText: document.getElementById('progress-label-text'),
  progressPercent: document.getElementById('progress-percent'),
  progressFill: document.getElementById('progress-fill'),
  
  // 启动按钮
  launchBtn: document.getElementById('launch-btn')
};

// ==================== 标题栏功能 ====================
// 最小化按钮
elements.minimizeBtn.addEventListener('click', () => {
  api.minimizeWindow();
});

// 关闭按钮
elements.closeBtn.addEventListener('click', () => {
  api.closeWindow();
});

// ==================== 启动按钮功能 ====================

elements.launchBtn.addEventListener('click', async () => {
  if (appState.isProcessing) return;
  
  try {
    appState.isProcessing = true;
    elements.launchBtn.disabled = true;
    
    if (!appState.pythonReady) {
      // 安装环境
      await setupEnvironment();
    } else if (appState.autoUpdateAvailable) {
      // 自动更新
      await autoUpdate();
    } else if (appState.manualUpdateAvailable) {
      // 手动更新
      await manualUpdate();
    } else if (appState.appInstalled) {
      // 启动应用
      await launchApplication();
    }
  } catch (error) {
    console.error('操作失败:', error);
    alert('操作失败: ' + error.message);
  } finally {
    appState.isProcessing = false;
    elements.launchBtn.disabled = false;
  }
});

// ==================== 工具函数 ====================
/**
 * 检查应用更新
 * @returns {Promise<object>} 更新检测结果
 */
async function checkAppUpdate() {
  try {
    // 调用 API 获取远程版本信息
    const remoteVersion = await apiClient.checkWhimboxUpdate();
    
    // 获取本地版本信息
    const appStatus = await api.getAppStatus();
    const localVersion = appStatus.version;
    
    // 比较版本
    const hasUpdate = localVersion ? remoteVersion.version > localVersion : false;
    
    return {
      needsLogin: false,
      hasUpdate,
      localVersion,
      remoteVersion: remoteVersion.version,
      downloadUrl: remoteVersion.url,
      md5: remoteVersion.md5,
      message: hasUpdate ? '发现新版本' : '已是最新版本'
    };
  } catch (error) {
    console.error('检查更新失败:', error);
    
    // 如果是认证错误
    if (error.message && error.message.includes('登录')) {
      return {
        needsLogin: true,
        hasUpdate: false,
        message: '登录已过期，请重新登录'
      };
    }
    
    throw error;
  }
}

// ==================== 核心功能函数 ====================

// 设置环境
async function setupEnvironment() {
  try {
    updateButtonState('installing', '安装环境中...');
    showProgress('开始配置 Python 环境...', 0);
    
    // 安装Python环境
    const pythonEnv = await api.setupPythonEnvironment();
    
    // 验证安装结果
    if (!pythonEnv.installed || !pythonEnv.pipAvailable) {
      throw new Error('Python 环境或 pip 安装不完整');
    }
    
    appState.pythonReady = true;
    elements.pythonStatus.textContent = '就绪';
    
    hideProgress();
  } catch (error) {
    hideProgress();
    appState.pythonReady = false;
    elements.pythonStatus.textContent = '安装失败';
    elements.updateStatus.textContent = '环境未就绪';
    updateButtonState('installing', '重装环境');
    
    // 显示详细错误信息
    console.error('安装环境失败:', error);
    alert(`环境安装失败：${error.message}\n\n请检查网络连接后重试。`);
    
    throw error;
  }
}

// 执行更新
async function autoUpdate() {
  try {
    updateButtonState('updating', '自动更新中...');
    showProgress('正在下载更新...', 0);
    
    const updateResult = await checkAppUpdate();
    if (updateResult.hasUpdate) {
      const url = updateResult.downloadUrl;
      const md5 = updateResult.md5;
      await api.downloadAndInstallWhl(url, md5);
    }
    
    appState.appInstalled = true;
    appState.autoUpdateAvailable = false;
    
    // 获取应用状态
    const appStatus = await api.getAppStatus();
    if (appStatus.installed) {
      elements.appVersionDisplay.textContent = appStatus.version || '已安装';
    }
    
    hideProgress();
    updateButtonState('ready', '一键启动');
    elements.updateStatus.textContent = '已是最新';
  } catch (error) {
    hideProgress();
    updateButtonState('updating', '自动更新');
    elements.updateStatus.textContent = '更新失败';
    throw error;
  }
}

async function manualUpdate() {
  try {
    updateButtonState('updating', '安装更新中...');
    showProgress('安装更新中...', 0);
    const whlPath = await api.checkManualUpdateWhl();
    if (whlPath) {
      await api.installWhl(whlPath);
      appState.appInstalled = true;
      appState.manualUpdateAvailable = false;
      // 获取应用状态
      const appStatus = await api.getAppStatus();
      if (appStatus.installed) {
        elements.appVersionDisplay.textContent = appStatus.version || '已安装';
      }
      hideProgress();
      updateButtonState('ready', '一键启动');
      elements.updateStatus.textContent = '未登录';
    } else {
      throw new Error('没有找到更新包');
    }
  } catch (error) {
    throw error;
  }
}

// 启动应用
async function launchApplication() {
  try {
    updateButtonState('ready', '启动中...');
    await api.launchApp();
    updateButtonState('ready', '运行中...');
  } catch (error) {
    updateButtonState('ready', '一键启动');
    throw error;
  }
}

// ==================== UI 更新函数 ====================

// 更新按钮状态
function updateButtonState(state, text) {
  if (state === 'error') {
    elements.launchBtn.disabled = true;
  }
  elements.launchBtn.className = 'launch-btn ' + state;
  elements.launchBtn.textContent = text;
}

// 显示进度
function showProgress(label, percent) {
  elements.progressContainer.style.display = 'block';
  elements.progressLabelText.textContent = label;
  elements.progressPercent.textContent = percent + '%';
  elements.progressFill.style.width = percent + '%';
}

// 隐藏进度
function hideProgress() {
  elements.progressContainer.style.display = 'none';
}

// 更新进度
function updateProgress(percent) {
  elements.progressPercent.textContent = percent + '%';
  elements.progressFill.style.width = percent + '%';
}

// ==================== 事件监听 ====================

// 下载进度
api.onDownloadProgress((progress) => {
  updateProgress(progress);
});

// 安装进度
let installProgress = 0
api.onInstallProgress((message) => {
  console.log('安装进度:', message);
  showProgress("安装中...", installProgress);
  installProgress += 5;
  if (installProgress > 100) {
    installProgress = 0;
  }
});

// Python环境设置
api.onPythonSetup((data) => {
  console.log('Python设置:', data.message);
  
  if (data.stage === 'setup-start'){
    showProgress(data.message, 0);
  } else if (data.stage === 'extract-progress') {
    showProgress(data.message, 20);
  } else if (data.stage === 'extract-complete') {
    showProgress(data.message, 50);
  } else if (data.stage === 'setup-pip') {
    showProgress(data.message, 70);
  } else if (data.stage === 'pip-ready') {
    showProgress(data.message, 90);
  } else if (data.stage === 'setup-complete') {
    showProgress(data.message, 100);
  }
});

// 应用运行结束
api.onLaunchAppEnd((data) => {
  console.log('应用运行结束:', data.message);
  updateButtonState('ready', '一键启动');
});
// ==================== 初始化 ====================

async function initialize() {
  console.log('初始化应用...');
  
  // 初始化模块
  initLoginModule();
  
  // 检查并更新用户登录状态
  appState.isLogin = updateUserUI();
  
  // 检查Python环境
  try {
    elements.pythonStatus.textContent = '检测中...';
    const pythonEnv = await api.detectPythonEnvironment();
    if (pythonEnv.installed) {
      appState.pythonReady = true;
      elements.pythonStatus.textContent = '就绪';
      console.log('Python环境就绪');
    }else{
      appState.pythonReady = false;
      elements.pythonStatus.textContent = '未安装';
      console.log('Python环境未安装');
    }
  } catch (error) {
    console.error('Python环境检测失败:', error);
    appState.pythonReady = false;
    elements.pythonStatus.textContent = '检测失败';
  }
      
  // 检查app版本
  try {
    elements.appVersionDisplay.textContent = '检测中...';
    const appStatus = await api.getAppStatus();
    if (appStatus.installed) {
      appState.appInstalled = true;
      elements.appVersionDisplay.textContent = appStatus.version;
      console.log('应用已安装，版本号：', appStatus.version);
    } else {
      appState.appInstalled = false;
      elements.appVersionDisplay.textContent = '未安装';
      console.log('应用未安装');
    }
  } catch (error) {
    console.error('应用版本检测失败:', error);
    appState.appInstalled = false;
    elements.appVersionDisplay.textContent = '检测失败';
  }

  if (appState.isLogin) {
    try {
      elements.updateStatus.textContent = '检测中...';
      const updateResult = await checkAppUpdate();
      
      if (updateResult.needsLogin) {
        appState.autoUpdateAvailable = false;
        elements.updateStatus.textContent = '请重新登录';
        console.log('更新检测需要登录:', updateResult.message);
      } else if (updateResult.hasUpdate) {
        appState.autoUpdateAvailable = true;
        elements.updateStatus.textContent = '有新版本';
        console.log('发现新版本:', {
          local: updateResult.localVersion,
          remote: updateResult.remoteVersion,
          downloadUrl: updateResult.downloadUrl
        });
      } else {
        appState.autoUpdateAvailable = false;
        elements.updateStatus.textContent = '已是最新';
        console.log('已是最新版本:', updateResult.localVersion);
      }
    } catch (error) {
      console.error('更新检测失败:', error);
      appState.autoUpdateAvailable = false;
      elements.updateStatus.textContent = '检测失败';
    }
  } else{
    appState.autoUpdateAvailable = false;
    elements.updateStatus.textContent = '未登录';

    const manualUpdateWhl = await api.checkManualUpdateWhl();
    if (manualUpdateWhl) {
      appState.manualUpdateAvailable = true;
      elements.updateStatus.textContent = '有手动更新包';
    }
  }
  

  if (!appState.pythonReady) {
    updateButtonState('installing', '安装环境');
  } else if (appState.autoUpdateAvailable) {
    updateButtonState('updating', '自动更新');
  } else if (appState.manualUpdateAvailable) {
    updateButtonState('updating', '安装更新');
  } else if (appState.appInstalled) {
    updateButtonState('ready', '一键启动');
  } else{
    updateButtonState('error', '请先登录');
  }
}

// 当DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize);