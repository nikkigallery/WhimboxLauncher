// ==================== 登录模块 (ES6 Module) ====================

import { apiClient } from './api-client.js';

// 登录模块的 DOM 元素
const loginElements = {
  loginModal: document.getElementById('login-modal'),
  loginClose: document.getElementById('login-close'),
  loginCancel: document.getElementById('login-cancel'),
  loginSubmit: document.getElementById('login-submit'),
  loginWx: document.getElementById('login-wx'),
  registerBtn: document.getElementById('register-btn')
};

// 自定义提示框元素
const alertElements = {
  overlay: document.getElementById('custom-alert-overlay'),
  message: document.getElementById('custom-alert-message'),
  buttons: document.getElementById('custom-alert-buttons'),
  cancelButton: document.getElementById('custom-alert-cancel-button'),
  confirmButton: document.getElementById('custom-alert-confirm-button')
};

/**
 * 自定义 alert 函数（非阻塞）
 * @param {string} message - 提示消息
 * @param {object} options - 选项配置
 * @param {function} options.onConfirm - 确认回调函数（可选）
 * @param {function} options.onCancel - 取消回调函数（可选）
 * @param {boolean} options.showCancel - 是否显示取消按钮（默认false）
 * @param {string} options.confirmText - 确认按钮文字（默认"确定"）
 * @param {string} options.cancelText - 取消按钮文字（默认"取消"）
 */
export function customAlert(message, options = {}) {
  const {
    onConfirm = null,
    onCancel = null,
    showCancel = false,
    confirmText = '确定',
    cancelText = '取消'
  } = options;
  
  // 设置消息内容
  alertElements.message.textContent = message;
  
  // 设置按钮文字
  alertElements.confirmButton.textContent = confirmText;
  alertElements.cancelButton.textContent = cancelText;
  
  // 控制取消按钮显示
  if (showCancel) {
    alertElements.cancelButton.style.display = 'block';
  } else {
    alertElements.cancelButton.style.display = 'none';
  }
  
  // 显示弹框
  alertElements.overlay.classList.add('show');
  
  // 清理之前的事件监听器
  const newConfirmButton = alertElements.confirmButton.cloneNode(true);
  const newCancelButton = alertElements.cancelButton.cloneNode(true);
  alertElements.confirmButton.parentNode.replaceChild(newConfirmButton, alertElements.confirmButton);
  alertElements.cancelButton.parentNode.replaceChild(newCancelButton, alertElements.cancelButton);
  
  // 更新元素引用
  alertElements.confirmButton = newConfirmButton;
  alertElements.cancelButton = newCancelButton;
  
  // 关闭弹框的函数
  const closeAlert = () => {
    alertElements.overlay.classList.remove('show');
  };
  
  // 确认按钮事件
  alertElements.confirmButton.addEventListener('click', () => {
    closeAlert();
    if (onConfirm && typeof onConfirm === 'function') {
      onConfirm();
    }
  });
  
  // 取消按钮事件
  alertElements.cancelButton.addEventListener('click', () => {
    closeAlert();
    if (onCancel && typeof onCancel === 'function') {
      onCancel();
    }
  });
}

// 用户界面元素
const userElements = {
  loginBtn: document.getElementById('login-btn'),
  userAvatarContainer: document.getElementById('user-avatar-container'),
  userAvatarBtn: document.getElementById('user-avatar-btn'),
  userMenu: document.getElementById('user-menu'),
  userMenuAvatar: document.getElementById('user-menu-avatar'),
  userMenuName: document.getElementById('user-menu-name'),
  userMenuLogout: document.getElementById('user-menu-logout')
};

/**
 * 打开登录窗口
 */
export function openLoginModal() {
  loginElements.loginModal.classList.add('show');
}

/**
 * 关闭登录窗口
 */
export function closeLoginModal() {
  loginElements.loginModal.classList.remove('show');
}


/**
 * 外部浏览器登录处理
 */
async function handleExternalLogin() {
  try {
    
    // 获取认证服务器端口
    const api = window.electronAPI;
    if (api && api.openExternal && api.getAuthPort) {
      const authPort = await api.getAuthPort();
      
      if (!authPort) {
        throw new Error('认证服务器未启动');
      }
      
      // 构建登录URL，包含回调地址
      const loginUrl = `https://nikkigallery.vip/whimbox?login_redirect_uri=http://localhost:${authPort}/auth/callback`;
      
      // 跳转到外部浏览器进行登录
      api.openExternal(loginUrl);
      
      // 关闭登录弹窗
      closeLoginModal();
    } else {
      throw new Error('无法打开外部浏览器或获取认证端口');
    }
  } catch (error) {
    console.error('跳转登录失败:', error);
    customAlert('跳转登录失败: ' + error.message);
    
    // 恢复提交按钮
    loginElements.loginSubmit.disabled = false;
    loginElements.loginSubmit.textContent = '登录';
  }
}

/**
 * 微信登录处理
 */
async function handleWechatLogin() {
  try {
    // TODO: 实现微信登录逻辑
    console.log('微信登录');
    
    // 模拟微信登录
    // const api = window.electronAPI;
    // const result = await api.wechatLogin();
    
    customAlert('微信登录功能待实现');
  } catch (error) {
    console.error('微信登录失败:', error);
    customAlert('微信登录失败: ' + error.message);
  }
}

/**
 * 注册按钮处理
 */
function handleRegister() {
  // 使用 electronAPI 打开外部浏览器
  const api = window.electronAPI;
  if (api && api.openExternal) {
    api.openExternal('https://nikkigallery.vip/');
  } else {
    console.error('electronAPI.openExternal 不可用');
  }
}

// ==================== 用户界面管理 ====================

/**
 * 更新用户界面
 */
export function updateUserUI() {
  const userManager = apiClient.getUserManager();
  
  if (userManager.isLoggedIn()) {
    const user = userManager.getUser();
    const avatarUrl = userManager.getAvatarUrl();
    
    // 隐藏登录按钮，显示用户头像
    userElements.loginBtn.style.display = 'none';
    userElements.userAvatarContainer.style.display = 'block';
    
    // 设置头像
    userElements.userAvatarBtn.src = avatarUrl;
    userElements.userAvatarBtn.alt = user.username;
    userElements.userAvatarBtn.title = user.username;
    
    // 更新用户菜单信息
    userElements.userMenuAvatar.src = avatarUrl;
    userElements.userMenuAvatar.alt = user.username;
    userElements.userMenuName.textContent = user.username;

    return true;
  } else {
    // 显示登录按钮，隐藏用户头像
    userElements.loginBtn.style.display = '';
    userElements.userAvatarContainer.style.display = 'none';
    
    // 隐藏用户菜单
    userElements.userMenu.style.display = 'none';
    return false;
  }
}

/**
 * 切换用户菜单显示
 */
function toggleUserMenu() {
  const isVisible = userElements.userMenu.style.display === 'block';
  userElements.userMenu.style.display = isVisible ? 'none' : 'block';
  
  if (!isVisible) {
    // 计算菜单位置（相对于用户头像按钮）
    const rect = userElements.userAvatarBtn.getBoundingClientRect();
    userElements.userMenu.style.top = `${rect.bottom + 5}px`;
    userElements.userMenu.style.right = `${window.innerWidth - rect.right}px`;
  }
}

/**
 * 处理协议回调，获取refresh_token
 */
async function handleAuthCallback(data) {
  try {
    const { refreshToken } = data;
    
    if (!refreshToken) {
      console.error('未收到refresh_token');
      customAlert('登录失败：未收到有效的登录信息');
      return;
    }
    
    console.log('收到refresh_token:', refreshToken);
    
    // 使用refresh_token获取用户信息
    const userData = await apiClient.loginWithRefreshToken(refreshToken);
    
    console.log('登录成功:', userData);
    
    // 触发登录成功事件
    window.dispatchEvent(new CustomEvent('user-login-success', { 
      detail: userData 
    }));
    
    customAlert('登录成功！');
    
  } catch (error) {
    console.error('处理登录回调失败:', error);
    customAlert('登录失败: ' + error.message);
  }
}

/**
 * 处理退出登录
 */
function handleLogout() {
  apiClient.logout();
  updateUserUI();
  
  // 触发退出登录事件
  window.dispatchEvent(new CustomEvent('user-logout'));

  
  // 关闭用户菜单
  userElements.userMenu.style.display = 'none';
}

/**
 * 初始化登录模块
 */
export function initLoginModule() {
  // === 登录窗口事件 ===
  
  // 关闭按钮事件
  loginElements.loginClose.addEventListener('click', closeLoginModal);
  loginElements.loginCancel.addEventListener('click', closeLoginModal);
  
//   // 点击遮罩层关闭
//   loginElements.loginModal.addEventListener('click', (e) => {
//     if (e.target === loginElements.loginModal) {
//       closeLoginModal();
//     }
//   });
  
  // 外部浏览器登录提交
  loginElements.loginSubmit.addEventListener('click', handleExternalLogin);
  
  // 微信登录
  loginElements.loginWx.addEventListener('click', handleWechatLogin);
  
  // 注册按钮
  loginElements.registerBtn.addEventListener('click', handleRegister);
  
  // === 用户界面事件 ===
  
  // 登录按钮
  userElements.loginBtn.addEventListener('click', () => {
    openLoginModal();
  });
  
  // 用户头像按钮
  userElements.userAvatarBtn.addEventListener('click', () => {
    toggleUserMenu();
  });
  
  // 退出登录按钮
  userElements.userMenuLogout.addEventListener('click', handleLogout);
  
  // 点击其他地方关闭用户菜单
  document.addEventListener('click', (e) => {
    if (userElements.userMenu.style.display === 'block') {
      if (!userElements.userMenu.contains(e.target) && e.target !== userElements.userAvatarBtn) {
        userElements.userMenu.style.display = 'none';
      }
    }
  });
  
  // 监听登录成功事件
  window.addEventListener('user-login-success', () => {
    updateUserUI();
  });
  
  // 监听协议回调事件
  const api = window.electronAPI;
  if (api && api.onAuthCallback) {
    api.onAuthCallback(handleAuthCallback);
  }
  
  console.log('登录模块已初始化');
}
