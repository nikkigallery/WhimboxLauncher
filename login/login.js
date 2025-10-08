// ==================== 登录模块 (ES6 Module) ====================

import { apiClient } from '../api/api-client.js';

// 登录模块的 DOM 元素
const loginElements = {
  loginModal: document.getElementById('login-modal'),
  loginClose: document.getElementById('login-close'),
  loginCancel: document.getElementById('login-cancel'),
  loginSubmit: document.getElementById('login-submit'),
  email: document.getElementById('email'),
  password: document.getElementById('password'),
  loginWx: document.getElementById('login-wx')
};

// 用户界面元素
const userElements = {
  loginBtn: document.getElementById('login-btn'),
  userAvatarContainer: document.getElementById('user-avatar-container'),
  userAvatarBtn: document.getElementById('user-avatar-btn'),
  userMenu: document.getElementById('user-menu'),
  userMenuAvatar: document.getElementById('user-menu-avatar'),
  userMenuName: document.getElementById('user-menu-name'),
  userMenuEmail: document.getElementById('user-menu-email'),
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
 * 清空登录表单
 */
function clearLoginForm() {
  loginElements.email.value = '';
  loginElements.password.value = '';
}

/**
 * 邮箱登录处理
 */
async function handleEmailLogin() {
  const email = loginElements.email.value.trim();
  const password = loginElements.password.value;
  
  // 表单验证
  if (!email) {
    alert('请输入邮箱地址');
    loginElements.email.focus();
    return;
  }
  
  if (!password) {
    alert('请输入密码');
    loginElements.password.focus();
    return;
  }
  
  // 简单的邮箱格式验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert('请输入有效的邮箱地址');
    loginElements.email.focus();
    return;
  }
  
  try {
    // 禁用提交按钮，防止重复提交
    loginElements.loginSubmit.disabled = true;
    loginElements.loginSubmit.textContent = '登录中...';
    
    // 调用登录 API
    const userData = await apiClient.login(email, password);
    
    console.log('登录成功:', userData);
    
    // 登录成功后清空表单
    clearLoginForm();
    closeLoginModal();
    
    // 触发登录成功事件
    window.dispatchEvent(new CustomEvent('user-login-success', { 
      detail: userData 
    }));
    
    alert(`欢迎回来，${userData.username}！`);
  } catch (error) {
    console.error('登录失败:', error);
    alert('登录失败: ' + error.message);
  } finally {
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
    
    alert('微信登录功能待实现');
    closeLoginModal();
  } catch (error) {
    console.error('微信登录失败:', error);
    alert('微信登录失败: ' + error.message);
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
    userElements.userMenuEmail.textContent = user.email;
  } else {
    // 显示登录按钮，隐藏用户头像
    userElements.loginBtn.style.display = '';
    userElements.userAvatarContainer.style.display = 'none';
    
    // 隐藏用户菜单
    userElements.userMenu.style.display = 'none';
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
 * 处理退出登录
 */
function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    apiClient.logout();
    updateUserUI();
    alert('已退出登录');
  }
  
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
  
  // 邮箱登录提交
  loginElements.loginSubmit.addEventListener('click', handleEmailLogin);
  
  // 微信登录
  loginElements.loginWx.addEventListener('click', handleWechatLogin);
  
  // 支持回车键提交
  loginElements.email.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginElements.password.focus();
    }
  });
  
  loginElements.password.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginElements.loginSubmit.click();
    }
  });
  
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
  
  console.log('登录模块已初始化');
}
