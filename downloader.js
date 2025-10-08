const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { app } = require('electron');
const { EventEmitter } = require('events');

class Downloader extends EventEmitter {
  constructor() {
    super();
    // 获取程序安装目录
    const appDir = app.isPackaged 
      ? path.dirname(process.execPath) // 生产环境：启动器根目录
      : app.getAppPath(); // 开发环境：项目根目录
    
    // 创建下载目录
    this.downloadDir = path.join(appDir, 'downloads');
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  /**
   * 下载文件
   * @param {string} url - 文件下载URL
   * @param {string} fileName - 文件名
   * @returns {Promise<string>} 下载完成的文件路径
   */
  async downloadFile(url, fileName, targetMd5=null) {
    const filePath = path.join(this.downloadDir, fileName);
    
    if (targetMd5) {
      const fileMd5 = crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex');
      if (fileMd5 === targetMd5) {
        console.log('file already exists and md5 matches, skip download');
        return filePath;
      }
    }

    // 检查文件是否已存在，如果存在则删除
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    try {
      // 使用流式下载以支持大文件和进度报告
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        // 添加超时设置
        timeout: 30000
      });
      
      // 获取文件大小
      const totalLength = response.headers['content-length'];
      
      // 创建写入流
      const writer = fs.createWriteStream(filePath);
      
      // 设置下载进度监听
      let downloadedLength = 0;
      
      response.data.on('data', (chunk) => {
        downloadedLength += chunk.length;
        
        // 计算下载进度百分比
        const progress = totalLength ? Math.round((downloadedLength / totalLength) * 100) : 0;
        
        // 发出进度事件
        this.emit('progress', {
          fileName,
          progress,
          downloaded: downloadedLength,
          total: totalLength
        });
      });
      
      // 处理下载完成
      const downloadPromise = new Promise((resolve, reject) => {
        writer.on('finish', () => {
          this.emit('complete', {
            fileName,
            filePath
          });
          resolve(filePath);
        });
        
        writer.on('error', (err) => {
          this.emit('error', {
            fileName,
            error: err.message
          });
          reject(err);
        });
        
        response.data.on('error', (err) => {
          writer.destroy();
          this.emit('error', {
            fileName,
            error: err.message
          });
          reject(err);
        });
      });
      
      // 将响应数据写入文件
      response.data.pipe(writer);
      
      return downloadPromise;
    } catch (error) {
      this.emit('error', {
        fileName,
        error: error.message
      });
      throw new Error(`下载文件失败: ${error.message}`);
    }
  }

  /**
   * 从URL下载wheel包
   * @param {Object} options - 下载选项
   * @param {string} options.url - 下载URL
   * @param {string} options.fileName - 文件名
   * @returns {Promise<string>} 下载完成的文件路径
   */
  async downloadWheelPackage(options) {
    const { url, fileName, md5 } = options;
    
    try {
      // 发出开始下载事件
      this.emit('start', {
        fileName,
        url,
        md5,
      });
      
      // 下载文件
      const filePath = await this.downloadFile(url, fileName, md5);
      
      return filePath;
    } catch (error) {
      throw new Error(`下载wheel包失败: ${error.message}`);
    }
  }

  /**
   * 获取下载目录路径
   * @returns {string} 下载目录路径
   */
  getDownloadDirectory() {
    return this.downloadDir;
  }

  /**
   * 清理下载目录中的旧文件
   * @param {number} maxAgeInDays - 文件最大保留天数，默认为7天
   */
  cleanupOldDownloads(maxAgeInDays = 7) {
    try {
      const files = fs.readdirSync(this.downloadDir);
      const now = Date.now();
      const maxAge = maxAgeInDays * 24 * 60 * 60 * 1000;
      
      for (const file of files) {
        const filePath = path.join(this.downloadDir, file);
        const stats = fs.statSync(filePath);
        
        // 如果文件超过最大保留时间，则删除
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (error) {
      console.error('清理旧下载文件失败:', error);
    }
  }
}

module.exports = new Downloader();