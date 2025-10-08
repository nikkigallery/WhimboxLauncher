const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app } = require('electron');
const configManager = require('./config');
const downloader = require('./downloader');
const pythonManager = require('./python-manager');

class AppManager {
  constructor() {
    // 获取程序安装目录
    // 开发环境：使用项目根目录
    // 生产环境：使用可执行文件所在目录
    const appDir = app.isPackaged 
      ? path.dirname(process.execPath) // 生产环境：C:\Program Files\奇想盒启动器
      : app.getAppPath(); // 开发环境：项目根目录
    
    // 应用数据目录
    this.appDataDir = path.join(appDir, 'app-data');
    
    // 确保目录存在
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
    
    // 应用状态文件路径
    this.statusFilePath = path.join(this.appDataDir, 'app-status.json');
    
    // 初始化应用状态
    this.appStatus = this.loadAppStatus();
  }

  /**
   * 加载应用状态
   * @returns {Object} 应用状态
   */
  loadAppStatus() {
    try {
      if (fs.existsSync(this.statusFilePath)) {
        const statusData = fs.readFileSync(this.statusFilePath, 'utf8');
        return JSON.parse(statusData);
      }
    } catch (error) {
      console.error('加载应用状态失败:', error);
    }
    
    // 默认状态
    return {
      installed: false,
      version: null,
      path: null,
      installedAt: null,
      packageName: null,
      entryPoint: null
    };
  }

  /**
   * 保存应用状态
   */
  saveAppStatus() {
    try {
      fs.writeFileSync(this.statusFilePath, JSON.stringify(this.appStatus, null, 2));
    } catch (error) {
      console.error('保存应用状态失败:', error);
    }
  }

  /**
   * 获取应用状态
   * @returns {Object} 应用状态
   */
  getAppStatus() {
    return this.appStatus;
  }



  /**
   * 下载并安装
   * @param {Object} options - 下载选项
   * @returns {Promise<Object>} 安装结果
   */
  async downloadAndInstall(options = {}) {
    const config = configManager.getConfig();
    let downloadUrl, fileName;
    
    try {
      // 确定下载URL和文件名
      if (config.useCustomUrl && config.customUrl) {
        downloadUrl = config.customUrl;
        fileName = path.basename(new URL(config.customUrl).pathname);
      } else if (config.githubRepo) {
        const wheelPackage = await githubApi.findLatestWheelPackage(config.githubRepo);
        downloadUrl = wheelPackage.downloadUrl;
        fileName = wheelPackage.fileName;
      } else {
        throw new Error('未配置下载地址');
      }
      
      // 下载wheel包
      const wheelPath = await downloader.downloadWheelPackage({
        url: downloadUrl,
        fileName
      });
      
      // 安装wheel包
      const installResult = await pythonManager.installWheelPackage(wheelPath);
      
      // 提取包名和版本
      const packageInfo = this.extractPackageInfo(fileName);
      
      // 更新应用状态
      this.appStatus = {
        installed: true,
        version: packageInfo.version,
        path: wheelPath,
        installedAt: Date.now(),
        packageName: packageInfo.name,
        entryPoint: packageInfo.name.replace(/-/g, '_')
      };
      
      // 保存应用状态
      this.saveAppStatus();
      
      // 更新最后检查时间
      configManager.updateConfig({ updateLastCheckTime: true });
      
      return {
        success: true,
        packageInfo
      };
    } catch (error) {
      throw new Error(`下载并安装失败: ${error.message}`);
    }
  }

  /**
   * 从文件名中提取包信息
   * @param {string} fileName - wheel包文件名
   * @returns {Object} 包信息
   */
  extractPackageInfo(fileName) {
    try {
      // wheel文件名格式: {package_name}-{version}(-{build tag})?-{python tag}-{abi tag}-{platform tag}.whl
      const parts = fileName.split('-');
      
      // 至少需要5个部分
      if (parts.length < 5) {
        throw new Error('无效的wheel文件名格式');
      }
      
      // 第一部分是包名
      const name = parts[0];
      
      // 第二部分是版本
      const version = parts[1];
      
      return {
        name,
        version
      };
    } catch (error) {
      return {
        name: 'unknown',
        version: 'unknown'
      };
    }
  }

  /**
   * 启动应用
   * @returns {Promise<void>}
   */
  async launchApp() {
    try {
      if (!this.appStatus.installed) {
        throw new Error('应用未安装');
      }
      
      // 检测Python环境
      const pythonEnv = await pythonManager.detectPythonEnvironment();
      
      if (!pythonEnv.command) {
        throw new Error('未找到可用的Python环境');
      }
      
      // 启动Python应用
      // Windows 下不使用 shell: true，直接传递参数可以正确处理带空格的路径
      const process = spawn(pythonEnv.command, ['-m', this.appStatus.entryPoint], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true // Windows 下隐藏控制台窗口
      });
      
      // 分离进程，使其独立运行
      process.unref();
      
      return {
        success: true
      };
    } catch (error) {
      throw new Error(`启动应用失败: ${error.message}`);
    }
  }
}

module.exports = new AppManager();