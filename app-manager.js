const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { app, shell } = require('electron');
const downloader = require('./downloader');
const pythonManager = require('./python-manager');
const { EventEmitter } = require('events');

class AppManager extends EventEmitter {
  constructor() {
    super();
    // 获取程序安装目录
    // 开发环境：使用项目根目录
    // 生产环境：使用可执行文件所在目录
    const appDir = app.isPackaged 
      ? path.dirname(process.execPath) // 生产环境：C:\Program Files\奇想盒启动器
      : app.getAppPath(); // 开发环境：项目根目录
    
    // 应用数据目录
    this.appDataDir = path.join(appDir, 'app-data');
    this.logsDir = path.join(appDir, 'logs');
    
    // 确保目录存在
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
    
    // 应用状态文件路径
    this.statusFilePath = path.join(this.appDataDir, 'app-status.json');
    
    // 初始化应用状态
    this.appStatus = this.loadAppStatus();
    
    // 保存运行中的应用进程
    this.appProcess = null;
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
   * 安装更新包
   * @returns {Promise<Object>} 安装结果
   */
  async installWhl(wheelPath, deleteWheel = true) {
    try {
      if (wheelPath) {
        // 安装wheel包
        await pythonManager.installWheelPackage(wheelPath);
        
        // 提取包名和版本
        const fileName = path.basename(wheelPath);
        const packageInfo = this.extractPackageInfo(fileName);
        
        // 初始化app
        const entryPoint = packageInfo.name.replace(/-/g, '_')
        await pythonManager.runCommand(
          pythonManager.embeddedPythonPath, 
          ['-s', '-m', `${entryPoint}.main`, 'init'], 
          {
            windowsHide: true,
            env: pythonManager.env
          }
        );

        // 更新应用状态
        this.appStatus = {
          installed: true,
          version: packageInfo.version,
          installedAt: Date.now(),
          packageName: packageInfo.name,
          entryPoint: entryPoint
        };
        this.saveAppStatus();

        // 删除安装包
        if (deleteWheel) {
          fs.unlinkSync(wheelPath);
        }
        
        return {
          success: true,
          packageInfo
        };
      } else {
        throw new Error('没有找到更新包');
      }
    } catch (error) {
      throw new Error(`安装更新包失败: ${error.message}`);
    }
  }

  /**
   * 下载并安装
   * @param {string} url - 下载URL
   * @param {string} md5 - 文件MD5
   * @returns {Promise<Object>} 安装结果
   */
  async downloadAndInstallWhl(url, md5) {
    try {
      // 确定下载URL和文件名
      const downloadUrl = url;
      const fileName = path.basename(new URL(url).pathname);
      
      // 下载wheel包
      const wheelPath = await downloader.downloadWheelPackage({
        url: downloadUrl,
        fileName,
        md5,
      });
      
      // 安装wheel包
      await this.installWhl(wheelPath, true);
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
      this.appProcess = spawn(
        pythonManager.embeddedPythonPath, 
        ['-s', '-m', `${this.appStatus.entryPoint}.main`], 
        {
          windowsHide: true,
          env: pythonManager.env
        });

      this.appProcess.stdout.on('data', (data) => {
        const output = data.toString('utf-8');
        if(output.includes('WAIT_FOR_GAME_START')) {
          this.emit('launch-app-status', {message: "等待游戏启动"});
        } else if(output.includes('GAME_STARTED')) {
          this.emit('launch-app-status', {message: "奇想盒启动中"});
        } else if (output.includes('WHIMBOX_READY')) {
          this.emit('launch-app-status', {message: "奇想盒运行中"});
        } 
      });

      // 监听进程错误
      this.appProcess.stderr.on('data', (data) => {
        const output = data.toString('utf-8');
        console.error(`运行异常: ${output}`);
      });
      

      this.appProcess.on('error', (error) => {
        console.error(`运行异常: ${error.message}`);
      });

      // 监听进程退出
      this.appProcess.on('close', code => {
        console.log(`进程退出, 代码: ${code}`);
        this.appProcess = null;
        if (code != null){
          this.emit('launch-app-end', {message: code.toString()});
        } else {
          this.emit('launch-app-end', {message: 'null'});
        }
      });
      
      return {
        success: true
      };
    } catch (error) {
      throw new Error(`启动应用失败: ${error.message}`);
    }
  }

  /**
   * 停止应用
   * @returns {Promise<Object>} 停止结果
   */
  async stopApp() {
    try {
      if (!this.appProcess) {
        return { success: true, message: '应用未运行' };
      }
      
      // 尝试优雅地终止进程
      this.appProcess.kill('SIGTERM');
      
      // 等待一段时间后如果还未结束，强制杀死进程
      setTimeout(() => {
        if (this.appProcess && !this.appProcess.killed) {
          console.log('强制结束进程');
          this.appProcess.kill('SIGKILL');
        }
      }, 3000);
      
      console.log('应用停止指令已发送');
      return { success: true };
    } catch (error) {
      throw new Error(`停止应用失败: ${error.message}`);
    }
  }

  async openLogsFolder() {
    try {
      await shell.openPath(this.logsDir);
    } catch (error) {
      throw new Error(`打开日志文件夹失败: ${error.message}`);
    }
  }
}

module.exports = new AppManager();