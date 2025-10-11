const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const downloader = require('./downloader');
const AdmZip = require('adm-zip');
const { EventEmitter } = require('events');

class ScriptManager extends EventEmitter {
  constructor() {
    super();
    // 获取程序安装目录
    // 开发环境：使用项目根目录
    // 生产环境：使用可执行文件所在目录
    const appDir = app.isPackaged 
      ? path.dirname(process.execPath) // 生产环境：启动器根目录
      : app.getAppPath(); // 开发环境：项目根目录
    
    // 脚本目录
    this.scriptsDir = path.join(appDir, 'scripts');
    
    // 确保目录存在
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
    
    // 脚本包下载URL
    this.scriptsUrl = 'https://nikkigallery.vip/static/whimbox/scripts/scripts-0.0.1.zip';
  }

  /**
   * 检查scripts目录是否为空
   * @returns {boolean} 是否为空
   */
  isScriptsDirectoryEmpty() {
    try {
      const files = fs.readdirSync(this.scriptsDir);
      // 过滤掉隐藏文件（如 .gitkeep）
      const visibleFiles = files.filter(file => !file.startsWith('.'));
      return visibleFiles.length === 0;
    } catch (error) {
      console.error('检查scripts目录失败:', error);
      return true;
    }
  }

  /**
   * 解压zip文件到指定目录
   * @param {string} zipPath - zip文件路径
   * @param {string} targetDir - 目标目录
   * @returns {Promise<void>}
   */
  async extractZip(zipPath, targetDir) {
    try {
      const zip = new AdmZip(zipPath);
      
      // 获取压缩包中的所有文件
      const zipEntries = zip.getEntries();
      const totalFiles = zipEntries.length;
      let extractedFiles = 0;
      
      // 解压文件
      zip.extractAllTo(targetDir, true);
      
      // 发出解压进度事件
      zipEntries.forEach(() => {
        extractedFiles++;
        const progress = Math.round((extractedFiles / totalFiles) * 100);
        this.emit('extract-progress', {
          progress,
          extracted: extractedFiles,
          total: totalFiles
        });
      });
      
      this.emit('extract-complete', {
        targetDir
      });
      
      console.log(`成功解压 ${totalFiles} 个文件到 ${targetDir}`);
    } catch (error) {
      this.emit('extract-error', {
        error: error.message
      });
      throw new Error(`解压文件失败: ${error.message}`);
    }
  }

  /**
   * 下载并解压脚本包
   * @returns {Promise<Object>} 操作结果
   */
  async downloadAndUnzipScript() {
    try {
      // 检查scripts目录是否为空
      if (!this.isScriptsDirectoryEmpty()) {
        console.log('scripts目录不为空，跳过下载');
        return {
          success: true,
          skipped: true,
          message: 'scripts目录已存在文件，跳过下载'
        };
      }
      
      console.log('scripts目录为空，开始下载脚本包...');
      
      // 发出开始下载事件
      this.emit('download-start', {
        url: this.scriptsUrl
      });
      
      // 从URL中提取文件名
      const fileName = path.basename(new URL(this.scriptsUrl).pathname);
      
      // 设置下载进度监听
      downloader.on('progress', (data) => {
        if (data.fileName === fileName) {
          this.emit('download-progress', data);
        }
      });
      
      downloader.on('complete', (data) => {
        if (data.fileName === fileName) {
          this.emit('download-complete', data);
        }
      });
      
      // 下载脚本压缩包
      const zipPath = await downloader.downloadFile(this.scriptsUrl, fileName);
      
      console.log(`脚本包下载完成: ${zipPath}`);
      
      // 发出开始解压事件
      this.emit('extract-start', {
        zipPath,
        targetDir: this.scriptsDir
      });
      
      // 解压到scripts目录
      await this.extractZip(zipPath, this.scriptsDir);
      
      console.log('脚本包解压完成');
      
      // 删除压缩包
      fs.unlinkSync(zipPath);
      console.log('已删除临时压缩包');
      
      return {
        success: true,
        skipped: false,
        message: '脚本包下载并解压成功'
      };
    } catch (error) {
      this.emit('error', {
        error: error.message
      });
      throw new Error(`下载并解压脚本包失败: ${error.message}`);
    }
  }

  /**
   * 获取脚本目录路径
   * @returns {string} 脚本目录路径
   */
  getScriptsDirectory() {
    return this.scriptsDir;
  }

  /**
   * 列出所有可用的脚本文件
   * @returns {Array<string>} 脚本文件列表
   */
  listScripts() {
    try {
      const files = fs.readdirSync(this.scriptsDir);
      // 过滤出Python脚本文件
      return files.filter(file => file.endsWith('.py'));
    } catch (error) {
      console.error('列出脚本文件失败:', error);
      return [];
    }
  }

  /**
   * 清空scripts目录
   * @returns {Promise<void>}
   */
  async clearScriptsDirectory() {
    try {
      const files = fs.readdirSync(this.scriptsDir);
      for (const file of files) {
        const filePath = path.join(this.scriptsDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
      console.log('scripts目录已清空');
    } catch (error) {
      console.error('清空scripts目录失败:', error);
      throw new Error(`清空scripts目录失败: ${error.message}`);
    }
  }
}

module.exports = new ScriptManager();

