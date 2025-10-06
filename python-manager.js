const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { EventEmitter } = require('events');
const configManager = require('./config');
const AdmZip = require('adm-zip');

const REQUIRED_PYTHON_VERSION = '3.12.8';

class PythonManager extends EventEmitter {
  constructor() {
    super();
    // 获取程序安装目录
    // 开发环境：使用项目根目录
    // 生产环境：使用可执行文件所在目录的上级目录
    const appDir = app.isPackaged 
      ? path.dirname(process.execPath) // 生产环境：C:\Program Files\奇想盒启动器
      : app.getAppPath(); // 开发环境：项目根目录
    
    this.embeddedPythonDir = path.join(appDir, 'python-embedded');
    this.embeddedPythonPath = path.join(this.embeddedPythonDir, 'python.exe');
  }

  /**
   * 检测 Python 环境是否已安装
   * 只检测不安装
   * @returns {Promise<Object>} Python 环境信息
   */
  async detectPythonEnvironment() {
    try {
      // 检查是否已经安装了 embedded Python
      if (fs.existsSync(this.embeddedPythonPath)) {
        // 已安装，获取版本信息
        const versionInfo = await this.getPythonVersion(this.embeddedPythonPath);
        const pipAvailable = await this.isPipAvailable(this.embeddedPythonPath);
        
        if (!pipAvailable) {
          return {
            installed: false,
            message: 'pip 未安装'
          };
        }else{
          return {
            command: this.embeddedPythonPath,
            version: versionInfo.version,
            path: this.embeddedPythonPath,
            installed: true
          };
        }
      } else {
        // 未安装
        return {
          installed: false,
          message: '需要安装内置 Python 环境'
        };
      }
    } catch (error) {
      return {
        installed: false,
        message: '检测失败: ' + error.message
      };
    }
  }

  /**
   * 设置 embedded Python
   * @returns {Promise<Object>} Python 环境信息
   */
  async setupEmbeddedPython() {
    try {
      // 检查是否已经解压
      const pythonExists = fs.existsSync(this.embeddedPythonPath);
      const pipAlreadyInstalled = pythonExists && await this.isPipAvailable(this.embeddedPythonPath);
      
      if (!pythonExists) {
        // Python 未安装，需要完整安装
        this.emit('setup-start', {
          message: '正在设置内置 Python 环境...'
        });
        
        // 解压 embedded Python
        await this.extractEmbeddedPython();
        
        // 配置 pip（必须成功）
        await this.setupPip();
        
        this.emit('setup-complete', {
          message: '内置 Python 环境设置完成'
        });
      } else if (!pipAlreadyInstalled) {
        // 配置 pip（必须成功）
        await this.setupPip();
        
        this.emit('setup-complete', {
          message: 'pip 配置完成'
        });
      } else {
        // 都已安装
        this.emit('setup-complete', {
          message: '检测到已有内置 Python 环境'
        });
      }

      // 最终验证：获取版本信息和 pip 状态
      const versionInfo = await this.getPythonVersion(this.embeddedPythonPath);
      const pipAvailable = await this.isPipAvailable(this.embeddedPythonPath);
      
      if (!pipAvailable) {
        throw new Error('pip 未能成功安装，环境配置失败');
      }
      
      return {
        command: this.embeddedPythonPath,
        version: versionInfo.version,
        path: this.embeddedPythonPath,
        pipAvailable: true,
        installed: true
      };
    } catch (error) {
      throw new Error(`设置内置 Python 失败: ${error.message}`);
    }
  }

  /**
   * 解压 embedded Python
   * @returns {Promise<void>}
   */
  async extractEmbeddedPython() {
    try {
      // embedded Python 压缩包路径（在应用资源目录中）
      const zipPath = path.join(process.resourcesPath || __dirname, 'assets', 'python-3.12.8-embed-amd64.zip');
      
      // 如果在开发环境，使用相对路径
      const devZipPath = path.join(__dirname, 'assets', 'python-3.12.8-embed-amd64.zip');
      const actualZipPath = fs.existsSync(zipPath) ? zipPath : devZipPath;

      if (!fs.existsSync(actualZipPath)) {
        throw new Error(`找不到内置 Python 压缩包: ${actualZipPath}`);
      }

      // 创建解压目录
      if (!fs.existsSync(this.embeddedPythonDir)) {
        fs.mkdirSync(this.embeddedPythonDir, { recursive: true });
      }

      // 解压文件
      this.emit('extract-progress', { message: '正在解压内置 Python 环境...' });
      const zip = new AdmZip(actualZipPath);
      zip.extractAllTo(this.embeddedPythonDir, true);
      
      this.emit('extract-complete', { message: '内置 Python 解压完成' });
    } catch (error) {
      throw new Error(`解压内置 Python 失败: ${error.message}`);
    }
  }

  /**
   * 配置 pip
   * @returns {Promise<void>}
   */
  async setupPip() {
    // 修改 python312._pth 文件以启用 site-packages
    const pthFile = path.join(this.embeddedPythonDir, 'python312._pth');
    
    if (fs.existsSync(pthFile)) {
      let content = fs.readFileSync(pthFile, 'utf8');
      
      // 取消注释 import site 行
      if (content.includes('#import site')) {
        content = content.replace('#import site', 'import site');
        fs.writeFileSync(pthFile, content);
      } else if (!content.includes('import site')) {
        // 如果不存在，添加 import site
        content += '\nimport site\n';
        fs.writeFileSync(pthFile, content);
      }
    }

    // 使用 assets 目录中的 get-pip.py
    this.emit('setup-pip', { message: '正在准备 pip 安装程序...' });
    
    // get-pip.py 路径（在应用资源目录中）
    const getPipZipPath = path.join(process.resourcesPath || __dirname, 'assets', 'get-pip.py');
    
    // 如果在开发环境，使用相对路径
    const devGetPipPath = path.join(__dirname, 'assets', 'get-pip.py');
    const getPipSourcePath = fs.existsSync(getPipZipPath) ? getPipZipPath : devGetPipPath;
    
    if (!fs.existsSync(getPipSourcePath)) {
      throw new Error(`找不到 get-pip.py 文件: ${getPipSourcePath}`);
    }
    
    // 复制到 Python 目录
    const getPipTargetPath = path.join(this.embeddedPythonDir, 'get-pip.py');
    fs.copyFileSync(getPipSourcePath, getPipTargetPath);
    
    this.emit('setup-pip', { message: '正在安装 pip...' });
    
    // 安装 pip
    await this.runCommand(this.embeddedPythonPath, [getPipTargetPath], false, 120000); // 120秒超时
    
    // 删除临时文件
    if (fs.existsSync(getPipTargetPath)) {
      fs.unlinkSync(getPipTargetPath);
    }
    
    // 验证 pip 是否安装成功
    const pipAvailable = await this.isPipAvailable(this.embeddedPythonPath);
    if (!pipAvailable) {
      throw new Error('pip 安装失败，无法使用 pip 命令');
    }
    
    this.emit('pip-ready', { message: 'pip 安装成功' });
  }

  /**
   * 检查 Python 命令是否有效
   * @param {string} command - Python 命令
   * @returns {Promise<boolean>} 命令是否有效
   */
  async isPythonCommandValid(command) {
    try {
      await this.runCommand(command, ['-c', 'print("ok")'], false, 5000);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 获取 Python 版本信息
   * @param {string} command - Python 命令
   * @returns {Promise<Object>} Python 版本信息
   */
  async getPythonVersion(command) {
    try {
      // 获取 Python 版本
      const versionOutput = await this.runCommand(command, ['--version']);
      const version = versionOutput.trim();
      
      return {
        version,
        path: command
      };
    } catch (error) {
      throw new Error(`获取 Python 版本失败: ${error.message}`);
    }
  }

  /**
   * 检查 pip 是否可用
   * @param {string} pythonCommand - Python 命令
   * @returns {Promise<boolean>} pip 是否可用
   */
  async isPipAvailable(pythonCommand) {
    try {
      await this.runCommand(pythonCommand, ['-m', 'pip', '--version'], false, 5000);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 安装 wheel 包
   * @param {string} wheelPath - wheel 包路径
   * @returns {Promise<Object>} 安装结果
   */
  async installWheelPackage(wheelPath) {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(wheelPath)) {
        throw new Error(`Wheel 包文件不存在: ${wheelPath}`);
      }
      
      // 检测 Python 环境
      const pythonEnv = await this.detectPythonEnvironment();
      
      // 发出开始安装事件
      this.emit('install-start', {
        wheelPath,
        pythonVersion: pythonEnv.version
      });
      
      // 使用 pip 安装 wheel 包
      const result = await this.runCommand(
        pythonEnv.command,
        ['-m', 'pip', 'install', '--force-reinstall', wheelPath],
        true
      );
      
      // 发出安装完成事件
      this.emit('install-complete', {
        wheelPath,
        success: true,
        output: result
      });
      
      return {
        success: true,
        output: result
      };
    } catch (error) {
      // 发出安装失败事件
      this.emit('install-error', {
        wheelPath,
        error: error.message
      });
      
      throw new Error(`安装 wheel 包失败: ${error.message}`);
    }
  }

  /**
   * 运行命令
   * @param {string} command - 要运行的命令
   * @param {Array<string>} args - 命令参数
   * @param {boolean} emitProgress - 是否发出进度事件
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<string>} 命令输出
   */
  runCommand(command, args, emitProgress = false, timeout = 30000) {
    return new Promise((resolve, reject) => {
      // Windows 下不使用 shell: true，直接传递参数可以正确处理带空格的路径
      // spawn 会自动处理参数中的特殊字符和空格
      const process = spawn(command, args, {
        windowsHide: true // Windows 下隐藏控制台窗口
      });
      
      let stdout = '';
      let stderr = '';
      let timeoutId;
      
      // 设置超时
      if (timeout) {
        timeoutId = setTimeout(() => {
          process.kill();
          reject(new Error('命令执行超时'));
        }, timeout);
      }
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        
        if (emitProgress) {
          this.emit('install-progress', {
            output
          });
        }
      });
      
      process.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        
        if (emitProgress) {
          this.emit('install-progress', {
            output,
            isError: true
          });
        }
      });
      
      process.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`命令执行失败，退出码: ${code}, 错误: ${stderr}`));
        }
      });
      
      process.on('error', (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(error);
      });
    });
  }
}

module.exports = new PythonManager();