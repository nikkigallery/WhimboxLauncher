const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { EventEmitter } = require('events');
const AdmZip = require('adm-zip');
const https = require('https');
const http = require('http');

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
    this.embeddedPythonScriptsDir = path.join(this.embeddedPythonDir, 'Scripts');
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
      // const pipAlreadyInstalled = pythonExists && await this.isPipAvailable(this.embeddedPythonPath);
      
      if (!pythonExists) {
        // Python 未安装，需要完整安装
        this.emit('setup-start', {
          message: '正在设置内置 Python 环境...'
        });
        
        // 解压 embedded Python
        await this.extractEmbeddedPython();
        
        this.emit('setup-complete', {
          message: '内置 Python 环境设置完成'
        });
      } else {
        // 已安装
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
      const zipPath = path.join(process.resourcesPath || __dirname, 'assets', 'Python312.zip');
      
      // 如果在开发环境，使用相对路径
      const devZipPath = path.join(__dirname, 'assets', 'Python312.zip');
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
      await this.runCommand(pythonCommand, ['-s', '-m', 'pip', '--version'], false, 5000);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 测试 pip 源的下载速度
   * @param {string} sourceUrl - pip 源 URL
   * @param {number} timeout - 超时时间（毫秒）
   * @returns {Promise<number>} 下载速度（KB/s），失败返回 0
   */
  async testPipSourceSpeed(sourceUrl, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const urlObj = new URL(sourceUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;
      
      let downloadedBytes = 0;
      let downloadStartTime = null; // 开始接收数据的时间
      
      const timeoutId = setTimeout(() => {
        req.destroy();
        console.log(`测试 ${sourceUrl}: 超时`)
        resolve(0);
      }, timeout);
      
      // 添加请求选项，包括 User-Agent
      // 测试下载一个常见的包信息页面来评估速度
      const testPath = urlObj.pathname.replace(/\/$/, '') + '/pip/';
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: testPath,
        method: 'GET',
        headers: {
          'User-Agent': 'pip/23.0 (python 3.12)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'identity',
        }
      };

      const req = protocol.request(options, (res) => {
        // 检查状态码
        if (res.statusCode < 200 || res.statusCode >= 400) {
          clearTimeout(timeoutId);
          console.log(`测试 ${sourceUrl}: 失败 ${res.statusCode}`)
          res.destroy();
          resolve(0);
          return;
        }
        
        // 接收数据，计算下载字节数
        res.on('data', (chunk) => {
          if (!downloadStartTime) {
            downloadStartTime = Date.now(); // 记录开始下载的时间
          }
          
          downloadedBytes += chunk.length;
          
          // 下载足够的数据后就可以停止了（比如 50KB 或 2 秒后）
          const totalElapsed = Date.now() - startTime;
          if (downloadedBytes >= 50 * 1024 || totalElapsed >= 2000) {
            clearTimeout(timeoutId);
            res.destroy();
            
            // 计算下载速度（KB/s）- 只计算实际下载时间
            const downloadTime = Date.now() - downloadStartTime; // 实际下载耗时
            const speedKBps = (downloadedBytes / 1024) / (downloadTime / 1000);
            
            console.log(`测试 ${sourceUrl}: 下载${(downloadedBytes/1024).toFixed(1)}KB用时${downloadTime}ms, 速度${speedKBps.toFixed(2)}KB/s`);
            resolve(speedKBps);
          }
        });
        
        res.on('end', () => {
          clearTimeout(timeoutId);
          
          if (downloadedBytes === 0 || !downloadStartTime) {
            console.log(`测试 ${sourceUrl}: 无数据`);
            resolve(0);
          } else {
            const downloadTime = Date.now() - downloadStartTime;
            const speedKBps = (downloadedBytes / 1024) / (downloadTime / 1000);
            
            console.log(`测试 ${sourceUrl}: 完成, 下载${(downloadedBytes/1024).toFixed(1)}KB用时${downloadTime}ms, 速度${speedKBps.toFixed(2)}KB/s`);
            resolve(speedKBps);
          }
        });
        
        res.on('error', (err) => {
          clearTimeout(timeoutId);
          console.log(`测试 ${sourceUrl}: 读取错误 ${err.message}`);
          resolve(0);
        });
      });
      
      req.on('error', (err) => {
        clearTimeout(timeoutId);
        console.log(`测试 ${sourceUrl}: 连接错误 ${err.message}`);
        resolve(0);
      });
      
      // 发送请求
      req.end();
    });
  }

  /**
   * 测试所有 pip 源并选择最快的
   * @param {Array<string>} sources - pip 源列表
   * @returns {Promise<Object>} 包含最快源和测试结果的对象
   */
  async selectFastestPipSource(sources) {
    try {
      this.emit('speed-test-start', {
        message: '正在测试 pip 源速度...',
        total: sources.length
      });
      
      // 并发测试所有源
      const testResults = await Promise.all(
        sources.map(async (source, index) => {
          const speed = await this.testPipSourceSpeed(source);
          
          this.emit('speed-test-progress', {
            source,
            speed,
            index,
            total: sources.length,
            message: speed === 0 
              ? `测试 ${source}: 失败或超时`
              : `测试 ${source}: ${speed.toFixed(2)} KB/s`
          });
          
          return {
            source,
            speed
          };
        })
      );
      
      // 找到最快的源（速度最高的）
      const fastestResult = testResults.reduce((fastest, current) => {
        return current.speed > fastest.speed ? current : fastest;
      });

      console.log(`最快的 pip 源: ${fastestResult.source} (速度: ${fastestResult.speed.toFixed(2)} KB/s)`)
      this.emit('speed-test-complete', {
        fastest: fastestResult.source,
        speed: fastestResult.speed,
        results: testResults,
        message: `最快的 pip 源: ${fastestResult.source} (${fastestResult.speed.toFixed(2)} KB/s)`
      });
      
      return {
        fastest: fastestResult.source,
        speed: fastestResult.speed,
        results: testResults
      };
    } catch (error) {
      this.emit('speed-test-error', {
        error: error.message
      });
      
      // 如果测速失败，返回第一个源作为默认值
      return {
        fastest: sources[0],
        speed: 0,
        results: [],
        error: error.message
      };
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
      if (!pythonEnv.installed) {
        throw new Error('Python环境未安装');
      }

      // 发出开始安装事件
      this.emit('install-start', {
        wheelPath,
        pythonVersion: pythonEnv.version
      });
      
      // pip 源列表
      const pip_source_list = [
        'https://mirrors.ustc.edu.cn/pypi/simple/',
        'https://pypi.tuna.tsinghua.edu.cn/simple/',
        'https://mirrors.cloud.tencent.com/pypi/simple/',
        'https://mirrors.aliyun.com/pypi/simple/',
      ];

      // 测试并选择最快的 pip 源
      const { fastest: fastestPipSource } = await this.selectFastestPipSource(pip_source_list);
      
      this.emit('install-progress', {
        output: `使用最快的 pip 源: ${fastestPipSource}\n`
      });

      // 为embeded python安装setuptools
      await this.runCommand(pythonEnv.command, ['-s', '-m', 'pip', 'install', '-i', fastestPipSource, 'setuptools'], true);

      // 使用 pip 安装 wheel 包
      const result = await this.runCommand(
        pythonEnv.command,
        ['-s', '-m', 'pip', 'install', '-i', fastestPipSource, wheelPath],
        true, 10 * 60 * 1000 // 超时10分钟
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
        console.log(output);
        stdout += output;
        
        if (emitProgress) {
          this.emit('install-progress', {
            output
          });
        }
      });
      
      process.stderr.on('data', (data) => {
        const output = data.toString();
        console.error(output);
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