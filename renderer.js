// ==================== 导入模块 ====================
import { initLoginModule, updateUserUI, customAlert } from './login.js';
import { apiClient } from './api-client.js';

// 与主进程通信的API
const api = window.electronAPI;

// 应用状态
let appState = {
  isLogin: false,
  isVip: false,
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
  launcherVersion: document.getElementById('launcher-version'),
  
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
  
  appState.isProcessing = true;
  elements.launchBtn.disabled = true;
  
  if (!appState.pythonReady) {
    // 安装环境
    await setupEnvironment();
    appState.isProcessing = false;
    elements.launchBtn.disabled = false;
  } else if (appState.autoUpdateAvailable) {
    // 自动更新
    await autoUpdate();
    appState.isProcessing = false;
    elements.launchBtn.disabled = false;
  } else if (appState.manualUpdateAvailable) {
    // 手动更新
    await manualUpdate();
    appState.isProcessing = false;
    elements.launchBtn.disabled = false;
  } else if (appState.appInstalled) {
    // 启动应用
    await launchApplication();
  } else {
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
    
    const hasUpdate = localVersion ? remoteVersion.version > localVersion : true;
    
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
    api.mylogger.error('检查更新失败:', error);
    if (error.message){
      // 如果是权限不够
      if (error.message.includes('403')) {
        return {
          needsLogin: false,
          hasUpdate: false,
          needVip: true,
          message: '权限不够，请升级会员'
        }
      }
      // 如果是认证错误
      else if (error.message.includes('登录')) {
        return {
          needsLogin: true,
          hasUpdate: false,
          needVip: false,
          message: '登录已过期，请重新登录'
        };
      }    
    }
    throw error;
  }
}

// ==================== 核心功能函数 ====================

// 设置环境
async function setupEnvironment() {
  try {
    updateButtonState('disabled', '安装环境中...');
    showProgress('开始配置 Python 环境...', 0);
    // 安装Python环境
    await api.setupPythonEnvironment();
    await checkState();
  } catch (error) {
    updateButtonState('installing', '重装环境');
    elements.pythonStatus.textContent = '安装失败';
    customAlert(`环境安装失败：${error.message}`);
  } finally {
    hideProgress();
  }
}

// 执行更新
async function autoUpdate() {
  try {
    updateButtonState('disabled', '自动更新中...');
    showProgress('正在下载更新...', 0);
    
    const updateResult = await checkAppUpdate();
    if (updateResult.hasUpdate) {
      const url = updateResult.downloadUrl;
      const md5 = updateResult.md5;
      await api.downloadAndInstallWhl(url, md5);
    }
    await checkState();
  } catch (error) {
    updateButtonState('updating', '重新更新');
    elements.updateStatus.textContent = '自动更新失败';
    customAlert(`自动更新失败：${error.message}`);
  } finally {
    hideProgress();
  }
}

async function manualUpdate() {
  try {
    updateButtonState('disabled', '安装中...');
    showProgress('安装更新中...', 0);
    const whlPath = await api.checkManualUpdateWhl();
    if (whlPath) {
      await api.installWhl(whlPath);
      await checkState();
    } else {
      throw new Error('没有找到更新包');
    }
  } catch (error) {
    updateButtonState('updating', '重新安装');
    elements.updateStatus.textContent = '安装失败';
    customAlert(`手动更新失败：${error.message}`);
  } finally {
    hideProgress();
  }
}

// 启动应用
async function launchApplication() {
  try {
    updateButtonState('disabled', '奇想盒启动中');
    await api.launchApp();
  } catch (error) {
    updateButtonState('ready', '一键启动');
    customAlert(`启动失败：${error.message}`);
  }
}

// ==================== UI 更新函数 ====================

// 更新按钮状态
function updateButtonState(state, text) {
  if (state === 'disabled') {
    elements.launchBtn.disabled = true;
  }else{
    elements.launchBtn.disabled = false;
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

// 检查并更新状态
async function checkAndUpdateStatus() {
  try {
    elements.updateStatus.textContent = '检测中...';
    const updateResult = await checkAppUpdate();
    if (updateResult.needVip) {
      appState.isVip = false;
      appState.autoUpdateAvailable = false;
      elements.updateStatus.textContent = '未开通会员，无法自动更新';
      api.mylogger.log('更新检测需要升级会员:', updateResult.message);
    } else if (updateResult.needsLogin) {
      appState.isLogin = false;
      appState.autoUpdateAvailable = false;
      elements.updateStatus.textContent = '检测失败，请重新登录';
      api.mylogger.log('更新检测需要登录:', updateResult.message);
    } else if (updateResult.hasUpdate) {
      appState.isVip = true;
      appState.autoUpdateAvailable = true;
      elements.updateStatus.textContent = '有新版本';
      api.mylogger.log('发现新版本:', {
        local: updateResult.localVersion,
        remote: updateResult.remoteVersion,
      });
    } else {
      appState.isVip = true;
      appState.isLogin = true;
      appState.autoUpdateAvailable = false;
      elements.updateStatus.textContent = '已是最新版本';
      api.mylogger.log('已是最新版本:', updateResult.localVersion);
    }
  } catch (error) {
    api.mylogger.error('更新检测失败:', error);
    appState.autoUpdateAvailable = false;
    elements.updateStatus.textContent = '检测失败';
  }
}

function updateMainButton(){
  if (!appState.pythonReady) {
    updateButtonState('installing', '安装环境');
  } else if (appState.autoUpdateAvailable) {
    updateButtonState('updating', '自动更新');
  } else if (appState.manualUpdateAvailable) {
    updateButtonState('updating', '安装更新');
  } else if (appState.appInstalled) {
    updateButtonState('ready', '一键启动');
  } else if (!appState.isLogin){
    updateButtonState('disabled', '请先登录');
  } else if (!appState.isVip){
    updateButtonState('disabled', '请先开通会员');
  }
}

// ==================== 事件监听 ====================

// 下载进度
api.onDownloadProgress((progress) => {
  updateProgress(progress);
});

// 安装进度
let installProgress = 0
api.onInstallProgress((message) => {
  showProgress("安装中...", installProgress);
  installProgress += 5;
  if (installProgress > 100) {
    installProgress = 0;
  }
});

// Python环境设置
api.onPythonSetup((data) => {
  api.mylogger.log('Python设置:', data.message);
  
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

// 应用运行状态更新
api.onLaunchAppStatus((data) => {
  api.mylogger.log('应用运行状态:', data.message);
  updateButtonState('disabled', data.message);
});

// 应用运行结束
api.onLaunchAppEnd((data) => {
  api.mylogger.log('应用运行结束:', data.message);
  updateButtonState('ready', '一键启动');
  appState.isProcessing = false;
  elements.launchBtn.disabled = false;
});

// 监听登录成功事件，重新检查更新状态
window.addEventListener('user-login-success', async () => {
  api.mylogger.log('登录成功，重新检查更新状态...');
  appState.isLogin = true;
  await checkState();
  await checkSubscribedScripts();
});

// 监听退出登录事件
window.addEventListener('user-logout', async () => {
  api.mylogger.log('退出登录，重置状态...');
  appState.isLogin = false;
  await checkState();
});

// 监听脚本下载进度
api.onScriptDownloaded((data) => {
  const percent = Math.round((data.current / data.total) * 100);
  showProgress(`更新订阅路线: ${data.name}`, percent);
});

// 监听脚本下载错误
api.onScriptDownloadError((data) => {
  api.mylogger.error(`脚本 ${data.name} 下载失败:`, data.error);
});

// 监听脚本更新完成
api.onScriptUpdateComplete((data) => {
  api.mylogger.log(`脚本更新完成: 成功 ${data.successCount}/${data.totalCount}`);
  hideProgress();
});

// 监听脚本更新错误
api.onScriptUpdateError((data) => {
  api.mylogger.error('脚本更新错误:', data.error);
  hideProgress();
});

// ==================== 初始化 ====================

async function initialize() {
  api.mylogger.log('初始化应用...');
  
  // 获取并显示启动器版本号
  try {
    const version = await api.getAppVersion();
    elements.launcherVersion.textContent = `${version}`;
  } catch (error) {
    api.mylogger.error('获取版本号失败:', error);
    elements.launcherVersion.textContent = '?.?.?';
  }
  
  // 初始化模块
  initLoginModule();
  
  // 检查并更新用户登录状态
  appState.isLogin = updateUserUI();

  await checkState();
  await checkSubscribedScripts();
}
  

async function checkState(){
  appState.pythonReady = false;
  appState.appInstalled = false;
  appState.autoUpdateAvailable = false;
  appState.manualUpdateAvailable = false;
  // 检查Python环境
  try {
    elements.pythonStatus.textContent = '检测中...';
    const pythonEnv = await api.detectPythonEnvironment();
    if (pythonEnv.installed) {
      appState.pythonReady = true;
      elements.pythonStatus.textContent = '已就绪';
      api.mylogger.log('Python环境就绪');
    }else{
      appState.pythonReady = false;
      elements.pythonStatus.textContent = '未安装';
      api.mylogger.log('Python环境未安装');
    }
  } catch (error) {
    api.mylogger.error('Python环境检测失败:', error);
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
      api.mylogger.log('应用已安装，版本号：', appStatus.version);
    } else {
      appState.appInstalled = false;
      elements.appVersionDisplay.textContent = '未安装';
      api.mylogger.log('应用未安装');
    }
  } catch (error) {
    api.mylogger.error('应用版本检测失败:', error);
    appState.appInstalled = false;
    elements.appVersionDisplay.textContent = '检测失败';
  }

  if (appState.isLogin) {
    await checkAndUpdateStatus();
  } else{
    appState.autoUpdateAvailable = false;
    elements.updateStatus.textContent = '未登录，请手动更新';

    const manualUpdateWhl = await api.checkManualUpdateWhl();
    if (manualUpdateWhl) {
      appState.manualUpdateAvailable = true;
      elements.updateStatus.textContent = '有手动更新包';
    }
  }

  updateMainButton();
}

async function checkSubscribedScripts() {
  // 更新订阅脚本
  updateButtonState('disabled', '更新订阅路线...');
  if (appState.isLogin) {
    try {
      api.mylogger.log('开始更新订阅路线...');
      showProgress('获取订阅路线列表...', 0);
      
      // 1. 调用API获取订阅脚本列表
      const scriptsData = await apiClient.getAllSubscribedScripts();
      api.mylogger.debug('获取到订阅路线:', scriptsData);
      
      if (scriptsData.scripts && scriptsData.scripts.length > 0) {
        showProgress('开始更新路线...', 0);
        
        // 2. 将数据传递给主进程进行下载
        await api.updateSubscribedScripts(scriptsData);
        hideProgress();
      } else {
        api.mylogger.log('暂无订阅路线');
        hideProgress();
      }
    } catch (error) {
      api.mylogger.error('更新路线失败:', error);
      hideProgress();
    }
  } else {
    api.mylogger.log('未登录，跳过路线更新');
  }
  updateMainButton();
}

// 设置背景图
function setBackgroundImage() {
  const bgPath = api.getAssetPath();
  const mainContainer = document.querySelector('.main-container');
  if (mainContainer) {
    mainContainer.style.backgroundImage = `url('${bgPath}')`;
  }
}

// 当DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  setBackgroundImage();
  initialize();
});