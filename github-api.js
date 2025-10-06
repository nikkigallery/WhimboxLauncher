const { Octokit } = require('@octokit/rest');
const path = require('path');

class GitHubAPI {
  constructor() {
    // 创建不带认证的Octokit实例
    // 如果需要更高的API速率限制，可以在这里添加认证令牌
    this.octokit = new Octokit();
  }

  /**
   * 从GitHub仓库URL中提取所有者和仓库名
   * @param {string} repoUrl - GitHub仓库URL
   * @returns {Object} 包含所有者和仓库名的对象
   */
  parseRepoUrl(repoUrl) {
    try {
      // 处理不同格式的GitHub URL
      const url = new URL(repoUrl);
      
      if (url.hostname !== 'github.com') {
        throw new Error('不是有效的GitHub URL');
      }
      
      // 获取路径部分并分割
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      if (pathParts.length < 2) {
        throw new Error('无法从URL中提取仓库信息');
      }
      
      return {
        owner: pathParts[0],
        repo: pathParts[1]
      };
    } catch (error) {
      // 尝试另一种格式解析: owner/repo
      if (repoUrl.includes('/') && !repoUrl.includes(' ')) {
        const parts = repoUrl.split('/');
        if (parts.length === 2) {
          return {
            owner: parts[0],
            repo: parts[1]
          };
        }
      }
      
      throw new Error(`无法解析仓库URL: ${error.message}`);
    }
  }

  /**
   * 获取仓库的最新发布版本
   * @param {string} repoUrl - GitHub仓库URL
   * @returns {Promise<Object>} 最新发布版本的信息
   */
  async getLatestRelease(repoUrl) {
    try {
      const { owner, repo } = this.parseRepoUrl(repoUrl);
      
      const { data } = await this.octokit.repos.getLatestRelease({
        owner,
        repo
      });
      
      return {
        tag: data.tag_name,
        name: data.name,
        publishedAt: data.published_at,
        assets: data.assets,
        body: data.body
      };
    } catch (error) {
      throw new Error(`获取最新发布版本失败: ${error.message}`);
    }
  }

  /**
   * 从发布版本中查找匹配的wheel包
   * @param {string} repoUrl - GitHub仓库URL
   * @param {string} pattern - 可选的文件名匹配模式
   * @returns {Promise<Object>} wheel包的下载信息
   */
  async findLatestWheelPackage(repoUrl, pattern = '.whl') {
    try {
      const release = await this.getLatestRelease(repoUrl);
      
      // 过滤出所有.whl文件
      const wheelAssets = release.assets.filter(asset => 
        asset.name.toLowerCase().endsWith(pattern)
      );
      
      if (wheelAssets.length === 0) {
        throw new Error(`在最新发布版本中未找到wheel包`);
      }
      
      // 如果有多个wheel包，可以根据需要选择合适的一个
      // 这里简单地选择第一个
      const wheelAsset = wheelAssets[0];
      
      return {
        version: release.tag,
        fileName: wheelAsset.name,
        downloadUrl: wheelAsset.browser_download_url,
        size: wheelAsset.size,
        createdAt: wheelAsset.created_at
      };
    } catch (error) {
      throw new Error(`查找wheel包失败: ${error.message}`);
    }
  }
}

module.exports = new GitHubAPI();