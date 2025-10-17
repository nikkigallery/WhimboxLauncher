// ==================== API 客户端模块 ====================

/**
 * API 基础配置
 */
const API_CONFIG = {
  baseURL: 'https://www.nikkigallery.vip/api/v1',
  timeout: 5000
};

/**
 * 用户管理类
 */
class UserManager {
  constructor() {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.loadUserFromStorage();
  }

  /**
   * 从本地存储加载用户信息
   */
  loadUserFromStorage() {
    try {
      const userDataStr = localStorage.getItem('user_data');
      if (userDataStr) {
        const userData = JSON.parse(userDataStr);
        this.user = userData.user;
        this.accessToken = userData.accessToken;
        this.refreshToken = userData.refreshToken;
      }
    } catch (error) {
      console.error('加载用户信息失败:', error);
      this.clearUser();
    }
  }

  /**
   * 保存用户信息到本地存储
   */
  saveUserToStorage() {
    try {
      const userData = {
        user: this.user,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken
      };
      localStorage.setItem('user_data', JSON.stringify(userData));
    } catch (error) {
      console.error('保存用户信息失败:', error);
    }
  }

  /**
   * 设置用户信息
   */
  setUser(userData) {
    this.user = {
      id: userData.id,
      email: userData.email,
      username: userData.username,
      avatar: userData.avatar,
      uid: userData.uid,
    };
    this.accessToken = userData.access_token;
    this.refreshToken = userData.refresh_token;
    this.saveUserToStorage();
  }

  /**
   * 清除用户信息
   */
  clearUser() {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('user_data');
  }

  /**
   * 获取用户信息
   */
  getUser() {
    return this.user;
  }

  /**
   * 获取访问令牌
   */
  getAccessToken() {
    return this.accessToken;
  }

  /**
   * 获取刷新令牌
   */
  getRefreshToken() {
    return this.refreshToken;
  }

  /**
   * 判断是否已登录
   */
  isLoggedIn() {
    return !!this.accessToken && !!this.user;
  }

  /**
   * 获取用户头像URL
   */
  getAvatarUrl() {
    if (!this.user || !this.user.avatar) {
      return null;
    }
    return `https://nikkigallery.vip/static/img/avatar/${this.user.avatar}`;
  }
}

/**
 * API 客户端类
 */
class APIClient {
  constructor() {
    this.userManager = new UserManager();
    this.isRefreshing = false;
    this.refreshPromise = null;
  }

  /**
   * 发送 HTTP 请求
   * @param {string} endpoint - API 端点
   * @param {object} options - 请求选项
   * @returns {Promise<any>} 响应数据
   */
  async request(endpoint, options = {}) {
    const {
      method = 'GET',
      data = null,
      headers = {},
      requireAuth = false,
      isRetry = false
    } = options;

    const url = `${API_CONFIG.baseURL}${endpoint}`;
    
    // 设置请求头
    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    // 如果需要认证，添加 Authorization 头
    if (requireAuth && this.userManager.getAccessToken()) {
      requestHeaders['Authorization'] = `Bearer ${this.userManager.getAccessToken()}`;
    }

    // 构建请求选项
    const fetchOptions = {
      method,
      headers: requestHeaders,
      mode: 'cors'
    };

    // 如果有请求体，添加到选项中
    if (data) {
      if (method === 'GET') {
        // GET 请求将数据添加到 URL 参数
        const params = new URLSearchParams(data);
        const fullUrl = `${url}?${params}`;
        return this._fetchWithTimeout(fullUrl, fetchOptions);
      } else {
        // 其他请求将数据添加到请求体
        fetchOptions.body = JSON.stringify(data);
      }
    }

    try {
      const response = await this._fetchWithTimeout(url, fetchOptions);
      
      // 处理 401 未授权错误（token 过期）
      if (response.status === 401 && requireAuth && !isRetry) {
        // 尝试刷新 token
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // 重试请求
          return this.request(endpoint, { ...options, isRetry: true });
        } else {
          // 刷新失败，清除用户信息并抛出错误
          this.userManager.clearUser();
          throw new Error('登录已过期，请重新登录');
        }
      }

      // 处理其他错误状态码
      if (!response.ok) {
        let errorMessage = `请求失败 (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // 无法解析错误响应
        }
        throw new Error(errorMessage);
      }

      // 解析响应
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
    } catch (error) {
      console.error('API 请求失败:', error);
      throw error;
    }
  }

  /**
   * 带超时的 fetch 请求
   */
  async _fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);
    
    try {
      options.signal = controller.signal;
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接');
      }
      throw error;
    }
  }

  /**
   * 刷新访问令牌
   * @returns {Promise<boolean>} 是否刷新成功
   */
  async refreshAccessToken() {
    // 如果正在刷新，等待刷新完成
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    // 检查是否有刷新令牌
    const refreshToken = this.userManager.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    // 开始刷新
    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${API_CONFIG.baseURL}/token/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh: refreshToken }),
          mode: 'cors'
        });

        if (!response.ok) {
          return false;
        }

        const data = await response.json();
        
        // 更新 access token
        if (data.access) {
          this.userManager.accessToken = data.access;
          // 如果返回了新的 refresh token，也更新
          if (data.refresh) {
            this.userManager.refreshToken = data.refresh;
          }
          this.userManager.saveUserToStorage();
          return true;
        }

        return false;
      } catch (error) {
        console.error('刷新令牌失败:', error);
        return false;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * 用户登录
   * @param {string} email - 邮箱
   * @param {string} password - 密码
   * @returns {Promise<object>} 用户信息
   */
  async login(email, password) {
    try {
      const userData = await this.request('/user/login', {
        method: 'POST',
        data: { email, password }
      });

      // 保存用户信息
      this.userManager.setUser(userData);

      return userData;
    } catch (error) {
      console.error('登录失败:', error);
      throw error;
    }
  }

  /**
   * 用户登出
   */
  logout() {
    this.userManager.clearUser();
  }

  /**
   * 获取用户管理器
   */
  getUserManager() {
    return this.userManager;
  }

  /**
   * GET 请求
   */
  async get(endpoint, data = null, requireAuth = false) {
    return this.request(endpoint, {
      method: 'GET',
      data,
      requireAuth
    });
  }

  /**
   * POST 请求
   */
  async post(endpoint, data = null, requireAuth = false) {
    return this.request(endpoint, {
      method: 'POST',
      data,
      requireAuth
    });
  }

  /**
   * PUT 请求
   */
  async put(endpoint, data = null, requireAuth = false) {
    return this.request(endpoint, {
      method: 'PUT',
      data,
      requireAuth
    });
  }

  /**
   * DELETE 请求
   */
  async delete(endpoint, data = null, requireAuth = false) {
    return this.request(endpoint, {
      method: 'DELETE',
      data,
      requireAuth
    });
  }

  /**
   * 检查 Whimbox 更新
   * @returns {Promise<object>} 更新信息
   */
  async checkWhimboxUpdate() {
    try {
      const response = await this.get('/whimbox/latest', null, true);
      
      // 缓存远程版本信息
      const remoteVersion = {
        version: response.version,
        url: response.url,
        md5: response.md5,
        fetchedAt: Date.now()
      };
      localStorage.setItem('whimbox_remote_version', JSON.stringify(remoteVersion));
      
      return remoteVersion;
    } catch (error) {
      console.error('检查 Whimbox 更新失败:', error);
      throw error;
    }
  }

  /**
   * 获取缓存的远程版本信息
   * @returns {object|null} 远程版本信息
   */
  getCachedRemoteVersion() {
    try {
      const cached = localStorage.getItem('whimbox_remote_version');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('读取缓存的远程版本信息失败:', error);
    }
    return null;
  }

  /**
   * 获取所有订阅的脚本
   * @returns {Promise<object>} 订阅的脚本列表
   */
  async getAllSubscribedScripts() {
    try {
      const response = await this.get('/whimbox/scripts/all_subscribed', null, true);
      return response;
    } catch (error) {
      console.error('获取订阅脚本失败:', error);
      throw error;
    }
  }
}

// 创建全局 API 客户端实例
const apiClient = new APIClient();

// 导出
export { apiClient, APIClient, UserManager };

