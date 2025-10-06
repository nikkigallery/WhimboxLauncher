// 与主进程通信的API
const api = window.electronAPI;

// 应用状态
let appState = {
  pythonReady: false,
  appInstalled: false,
  updateAvailable: false,
  isProcessing: false
};

// DOM元素
const elements = {
  // 标题栏按钮
  loginBtn: document.getElementById('login-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  minimizeBtn: document.getElementById('minimize-btn'),
  closeBtn: document.getElementById('close-btn'),
  
  // 轮播图
  carouselSlides: document.getElementById('carousel-slides'),
  carouselIndicators: document.querySelectorAll('.indicator'),
  
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
  launchBtn: document.getElementById('launch-btn'),
  
  // 设置模态窗口
  settingsModal: document.getElementById('settings-modal'),
  settingsClose: document.getElementById('settings-close'),
  settingsCancel: document.getElementById('settings-cancel'),
  settingsSave: document.getElementById('settings-save'),
  githubRepo: document.getElementById('github-repo'),
  useCustomUrl: document.getElementById('use-custom-url'),
  customUrlGroup: document.getElementById('custom-url-group'),
  customUrl: document.getElementById('custom-url'),
  autoUpdate: document.getElementById('auto-update'),
  updateFrequencyGroup: document.getElementById('update-frequency-group'),
  updateFrequency: document.getElementById('update-frequency'),
  
  // 登录模态窗口
  loginModal: document.getElementById('login-modal'),
  loginClose: document.getElementById('login-close'),
  loginCancel: document.getElementById('login-cancel'),
  loginSubmit: document.getElementById('login-submit'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  rememberMe: document.getElementById('remember-me')
};

// ==================== 标题栏功能 ====================

// 登录按钮
elements.loginBtn.addEventListener('click', () => {
  elements.loginModal.classList.add('show');
});

// 设置按钮
elements.settingsBtn.addEventListener('click', () => {
  elements.settingsModal.classList.add('show');
});

// 最小化按钮
elements.minimizeBtn.addEventListener('click', () => {
  api.minimizeWindow();
});

// 关闭按钮
elements.closeBtn.addEventListener('click', () => {
  api.closeWindow();
});

// ==================== 轮播图功能 ====================

let currentSlide = 0;
const totalSlides = 3;

function updateCarousel() {
  const offset = -currentSlide * 100;
  elements.carouselSlides.style.transform = `translateX(${offset}%)`;
  
  elements.carouselIndicators.forEach((indicator, index) => {
    if (index === currentSlide) {
      indicator.classList.add('active');
    } else {
      indicator.classList.remove('active');
    }
  });
}

// 自动轮播
setInterval(() => {
  currentSlide = (currentSlide + 1) % totalSlides;
  updateCarousel();
}, 5000);

// 指示器点击
elements.carouselIndicators.forEach((indicator, index) => {
  indicator.addEventListener('click', () => {
    currentSlide = index;
    updateCarousel();
  });
});

// ==================== 设置模态窗口 ====================

// 关闭设置窗口
function closeSettingsModal() {
  elements.settingsModal.classList.remove('show');
}

elements.settingsClose.addEventListener('click', closeSettingsModal);
elements.settingsCancel.addEventListener('click', closeSettingsModal);

// 点击遮罩层关闭
elements.settingsModal.addEventListener('click', (e) => {
  if (e.target === elements.settingsModal) {
    closeSettingsModal();
  }
});

// 自定义URL切换
elements.useCustomUrl.addEventListener('change', function() {
  elements.customUrlGroup.style.display = this.checked ? 'block' : 'none';
});

// 自动更新切换
elements.autoUpdate.addEventListener('change', function() {
  elements.updateFrequencyGroup.style.display = this.checked ? 'block' : 'none';
});

// 保存设置
elements.settingsSave.addEventListener('click', async () => {
  try {
    const config = {
      githubRepo: elements.githubRepo.value,
      customUrl: elements.customUrl.value,
      useCustomUrl: elements.useCustomUrl.checked,
      autoUpdate: elements.autoUpdate.checked,
      checkFrequency: elements.updateFrequency.value
    };
    
    await api.saveConfig(config);
    closeSettingsModal();
    
    // 重新检查更新
    checkForUpdates();
  } catch (error) {
    console.error('保存设置失败:', error);
    alert('保存设置失败: ' + error.message);
  }
});

// ==================== 登录模态窗口 ====================

// 关闭登录窗口
function closeLoginModal() {
  elements.loginModal.classList.remove('show');
}

elements.loginClose.addEventListener('click', closeLoginModal);
elements.loginCancel.addEventListener('click', closeLoginModal);

// 点击遮罩层关闭
elements.loginModal.addEventListener('click', (e) => {
  if (e.target === elements.loginModal) {
    closeLoginModal();
  }
});

// 登录提交（功能待实现）
elements.loginSubmit.addEventListener('click', async () => {
  const username = elements.username.value;
  const password = elements.password.value;
  const rememberMe = elements.rememberMe.checked;
  
  // TODO: 实现登录逻辑
  console.log('登录信息:', { username, password, rememberMe });
  
  alert('登录功能待实现');
  closeLoginModal();
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
    } else if (appState.updateAvailable) {
      // 自动更新
      await performUpdate();
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
async function performUpdate() {
  try {
    updateButtonState('updating', '更新中...');
    showProgress('正在下载更新...', 0);
    
    await api.downloadAndInstall();
    
    appState.appInstalled = true;
    appState.updateAvailable = false;
    
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
    throw error;
  }
}

// 启动应用
async function launchApplication() {
  try {
    updateButtonState('ready', '启动中...');
    
    // TODO: 实现启动逻辑
    // await api.launchApp();
    
    console.log('启动应用（功能待实现）');
    alert('启动功能待实现');
    
    updateButtonState('ready', '一键启动');
  } catch (error) {
    throw error;
  }
}

// 检查更新
async function checkForUpdates() {
  try {
    elements.updateStatus.textContent = '检查中...';
    
    const updateInfo = await api.checkForUpdates();
    
    if (updateInfo.available) {
      appState.updateAvailable = true;
      elements.updateStatus.textContent = '有新版本';
      updateButtonState('updating', '自动更新');
    } else {
      appState.updateAvailable = false;
      appState.appInstalled = true;
      elements.updateStatus.textContent = '已是最新';
      updateButtonState('ready', '一键启动');
    }
  } catch (error) {
    console.error('检查更新失败:', error);
    elements.updateStatus.textContent = '检查失败';
  }
}

// ==================== UI 更新函数 ====================

// 更新按钮状态
function updateButtonState(state, text) {
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
api.onInstallProgress((message) => {
  console.log('安装进度:', message);
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

// ==================== 初始化 ====================

async function initialize() {
  try {
    console.log('初始化应用...');
    
    // 加载配置
    const config = await api.getConfig();
    elements.githubRepo.value = config.githubRepo || '';
    elements.customUrl.value = config.customUrl || '';
    elements.useCustomUrl.checked = config.useCustomUrl || false;
    elements.autoUpdate.checked = config.autoUpdate !== undefined ? config.autoUpdate : true;
    elements.updateFrequency.value = config.checkFrequency || 'startup';
    
    // 更新UI状态
    elements.customUrlGroup.style.display = config.useCustomUrl ? 'block' : 'none';
    elements.updateFrequencyGroup.style.display = config.autoUpdate !== false ? 'block' : 'none';
    
    // 检查Python环境
    elements.pythonStatus.textContent = '检测中...';
    try {
      const pythonEnv = await api.detectPythonEnvironment();
      
      if (pythonEnv.installed) {
        // 已安装
        appState.pythonReady = true;
        elements.pythonStatus.textContent = '就绪';
        
        // Python就绪后检查应用状态和更新
        const appStatus = await api.getAppStatus();
        if (appStatus.installed) {
          appState.appInstalled = true;
          elements.appVersionDisplay.textContent = appStatus.version || '已安装';
        }
        
        // 检查更新
        await checkForUpdates();
      } else {
        // 未安装
        console.log('Python环境未安装:', pythonEnv.message);
        appState.pythonReady = false;
        elements.pythonStatus.textContent = '未安装';
        elements.updateStatus.textContent = '等待安装';
        updateButtonState('installing', '安装环境');
      }
    } catch (error) {
      console.error('Python环境检测失败:', error);
      appState.pythonReady = false;
      elements.pythonStatus.textContent = '检测失败';
      elements.updateStatus.textContent = '等待安装';
      updateButtonState('installing', '安装环境');
    }
    
  } catch (error) {
    console.error('初始化失败:', error);
  }
}

// 当DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', initialize);