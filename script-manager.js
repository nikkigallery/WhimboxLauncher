const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const downloader = require('./downloader');
const AdmZip = require('adm-zip');
const { EventEmitter } = require('events');
const axios = require('axios');

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
    this.appDataDir = path.join(appDir, 'app-data');
    this.scriptsIndexJsonPath = path.join(this.appDataDir, 'scripts-index.json');
    
    // 确保目录存在
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
    if (!fs.existsSync(this.appDataDir)) {
      fs.mkdirSync(this.appDataDir, { recursive: true });
    }
  }

  /**
   * 更新订阅的脚本
   * @param {Object} scriptsData - 订阅脚本数据 { scripts: [{ name, md5 }] }
   * @returns {Promise<Object>} 更新结果
   */
  async updateSubscribedScripts(scriptsData) {
    try {
      console.log('开始更新订阅脚本...');
      
      // 1. 验证数据格式
      if (!scriptsData || !scriptsData.scripts || !Array.isArray(scriptsData.scripts)) {
        throw new Error('返回的脚本列表格式不正确');
      }
      
      const scripts = scriptsData.scripts;
      console.log(`获取到 ${scripts.length} 个订阅脚本`);
      
      // 2. 读取现有的 index.json
      let existingIndex = {};
      if (fs.existsSync(this.scriptsIndexJsonPath)) {
        try {
          const content = fs.readFileSync(this.scriptsIndexJsonPath, 'utf8');
          existingIndex = JSON.parse(content);
        } catch (error) {
          console.warn('读取 index.json 失败，将创建新的索引:', error);
          existingIndex = {};
        }
      }
      
      // 3. 下载所有脚本
      const newIndex = {};
      let successCount = 0;
      let failedCount = 0;
      
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        try {
          console.log(`正在处理脚本 ${i + 1}/${scripts.length}: ${script.name} (MD5: ${script.md5})`);
          
          // 下载脚本文件
          const url = `https://nikkigallery.vip/static/whimbox/scripts/${script.md5}.json`;
          const fileName = `${script.md5}.json`;
          const filePath = path.join(this.scriptsDir, fileName);
          
          let needDownload = true;
          if (fs.existsSync(filePath)) {
            console.log(`脚本文件 ${fileName} 已存在，跳过下载`);
            needDownload = false;
          }
          
          if (needDownload) {
            // 使用axios下载文件
            const fileResponse = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 30000
            });

            // 保存文件
            fs.writeFileSync(filePath, fileResponse.data);
            console.log(`脚本文件 ${fileName} 下载成功`);
          }
          
          // 读取并解析脚本文件，获取真实的脚本名
          let scriptName = script.name; // 默认使用API返回的名称
          try {
            const scriptContent = fs.readFileSync(filePath, 'utf8');
            const scriptJson = JSON.parse(scriptContent);
            if (scriptJson.info && scriptJson.info.name) {
              scriptName = scriptJson.info.name;
              console.log(`从脚本文件中读取到脚本名: ${scriptName}`);
            }
          } catch (error) {
            console.warn(`解析脚本文件失败，使用默认名称: ${scriptName}`, error);
          }
          
          // 检查是否有同名的旧脚本
          if (existingIndex[scriptName] && existingIndex[scriptName] !== script.md5) {
            const oldMd5 = existingIndex[scriptName];
            const oldFilePath = path.join(this.scriptsDir, `${oldMd5}.json`);
            if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
              console.log(`删除旧脚本: ${scriptName} (${oldMd5})`);
            }
          }
          
          // 更新索引: {脚本名: 脚本md5}
          newIndex[scriptName] = script.md5;
          successCount++;
          
          // 发出进度事件
          this.emit('scriptDownloaded', {
            name: scriptName,
            md5: script.md5,
            current: i + 1,
            total: scripts.length
          });
          
        } catch (error) {
          console.error(`处理脚本 ${script.name} 失败:`, error);
          failedCount++;
          // 继续下载其他脚本
          this.emit('scriptDownloadError', {
            name: script.name,
            md5: script.md5,
            error: error.message
          });
        }
      }
      
      // 4. 保存新的 index.json
      fs.writeFileSync(this.scriptsIndexJsonPath, JSON.stringify(newIndex, null, 2), 'utf8');
      
      console.log(`订阅脚本更新完成，成功 ${successCount}/${scripts.length} 个脚本`);
      
      // 发出完成事件
      this.emit('updateComplete', {
        totalCount: scripts.length,
        successCount: successCount,
        failedCount: failedCount
      });
      
      return {
        success: true,
        totalCount: scripts.length,
        successCount: successCount,
        failedCount: failedCount
      };
      
    } catch (error) {
      console.error('更新订阅脚本失败:', error);
      this.emit('updateError', { error: error.message });
      throw new Error(`更新订阅脚本失败: ${error.message}`);
    }
  }

  /**
   * 获取脚本元数据
   * @returns {object|null} 脚本元数据
   */
  getScriptsMetadata() {
    try {
      if (fs.existsSync(this.scriptsIndexJsonPath)) {
        const content = fs.readFileSync(this.scriptsIndexJsonPath, 'utf8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('读取脚本元数据失败:', error);
    }
    return null;
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

