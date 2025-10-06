const Store = require('electron-store');

// 定义配置的默认值和类型
const schema = {
  githubRepo: {
    type: 'string',
    default: ''
  },
  customUrl: {
    type: 'string',
    default: ''
  },
  useCustomUrl: {
    type: 'boolean',
    default: false
  },
  pythonPath: {
    type: 'string',
    default: ''
  },
  autoUpdate: {
    type: 'boolean',
    default: true
  },
  checkFrequency: {
    type: 'string',
    enum: ['startup', 'daily', 'weekly'],
    default: 'startup'
  },
  lastUpdateCheck: {
    type: 'number',
    default: 0
  }
};

// 创建配置存储实例
const store = new Store();

// 配置管理模块
class ConfigManager {
  // 获取所有配置
  getConfig() {
    return {
      githubRepo: store.get('githubRepo', ''),
      customUrl: store.get('customUrl', ''),
      useCustomUrl: store.get('useCustomUrl', false),
      pythonPath: store.get('pythonPath', ''),
      autoUpdate: store.get('autoUpdate', true),
      checkFrequency: store.get('checkFrequency', 'startup'),
      lastUpdateCheck: store.get('lastUpdateCheck', 0)
    };
  }

  // 更新配置
  updateConfig(newConfig) {
    if (newConfig.githubRepo !== undefined) {
      store.set('githubRepo', newConfig.githubRepo);
    }
    if (newConfig.customUrl !== undefined) {
      store.set('customUrl', newConfig.customUrl);
    }
    if (newConfig.useCustomUrl !== undefined) {
      store.set('useCustomUrl', newConfig.useCustomUrl);
    }
    if (newConfig.pythonPath !== undefined) {
      store.set('pythonPath', newConfig.pythonPath);
    }
    if (newConfig.autoUpdate !== undefined) {
      store.set('autoUpdate', newConfig.autoUpdate);
    }
    if (newConfig.checkFrequency !== undefined) {
      store.set('checkFrequency', newConfig.checkFrequency);
    }
    
    // 更新最后检查时间
    if (newConfig.updateLastCheckTime) {
      store.set('lastUpdateCheck', Date.now());
    }
    
    return this.getConfig();
  }

  // 检查是否需要更新
  shouldCheckForUpdates() {
    const config = this.getConfig();
    
    if (!config.autoUpdate) {
      return false;
    }
    
    const now = Date.now();
    const lastCheck = config.lastUpdateCheck;
    
    // 根据设置的检查频率决定是否需要检查更新
    switch (config.checkFrequency) {
      case 'startup':
        return true;
      case 'daily':
        return (now - lastCheck) > 24 * 60 * 60 * 1000;
      case 'weekly':
        return (now - lastCheck) > 7 * 24 * 60 * 60 * 1000;
      default:
        return true;
    }
  }
}

module.exports = new ConfigManager();