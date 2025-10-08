// ==================== 设置模块 (ES6 Module) ====================

// 设置模块的 DOM 元素
const settingsElements = {
  settingsModal: document.getElementById('settings-modal'),
  settingsClose: document.getElementById('settings-close'),
  settingsCancel: document.getElementById('settings-cancel'),
  settingsSave: document.getElementById('settings-save'),
  githubRepo: document.getElementById('github-repo'),
  useCustomUrl: document.getElementById('use-custom-url'),
  customUrlGroup: document.getElementById('custom-url-group'),
  customUrl: document.getElementById('custom-url'),
  autoUpdate: document.getElementById('auto-update'),
  updateFrequencyGroup: document.getElementById('update-frequency-group'),
  updateFrequency: document.getElementById('update-frequency')
};

/**
 * 打开设置窗口
 */
export function openSettingsModal() {
  settingsElements.settingsModal.classList.add('show');
}

/**
 * 关闭设置窗口
 */
export function closeSettingsModal() {
  settingsElements.settingsModal.classList.remove('show');
}

/**
 * 加载设置配置
 */
export async function loadSettings(api) {
  const config = await api.getConfig();
  settingsElements.githubRepo.value = config.githubRepo || '';
  settingsElements.customUrl.value = config.customUrl || '';
  settingsElements.useCustomUrl.checked = config.useCustomUrl || false;
  settingsElements.autoUpdate.checked = config.autoUpdate !== undefined ? config.autoUpdate : true;
  settingsElements.updateFrequency.value = config.checkFrequency || 'startup';
  
  // 更新UI状态
  settingsElements.customUrlGroup.style.display = config.useCustomUrl ? 'block' : 'none';
  settingsElements.updateFrequencyGroup.style.display = config.autoUpdate !== false ? 'block' : 'none';
}

/**
 * 保存设置
 */
async function handleSaveSettings(api) {
  try {
    const config = {
      githubRepo: settingsElements.githubRepo.value,
      customUrl: settingsElements.customUrl.value,
      useCustomUrl: settingsElements.useCustomUrl.checked,
      autoUpdate: settingsElements.autoUpdate.checked,
      checkFrequency: settingsElements.updateFrequency.value
    };
    
    await api.saveConfig(config);
    closeSettingsModal();
  } catch (error) {
    console.error('保存设置失败:', error);
    alert('保存设置失败: ' + error.message);
  }
}

/**
 * 初始化设置模块
 */
export function initSettingsModule(api) {
  // 关闭按钮事件
  settingsElements.settingsClose.addEventListener('click', closeSettingsModal);
  settingsElements.settingsCancel.addEventListener('click', closeSettingsModal);
  
  // 点击遮罩层关闭
  settingsElements.settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsElements.settingsModal) {
      closeSettingsModal();
    }
  });
  
  // 自定义URL切换
  settingsElements.useCustomUrl.addEventListener('change', function() {
    settingsElements.customUrlGroup.style.display = this.checked ? 'block' : 'none';
  });
  
  // 自动更新切换
  settingsElements.autoUpdate.addEventListener('change', function() {
    settingsElements.updateFrequencyGroup.style.display = this.checked ? 'block' : 'none';
  });
  
  // 保存设置
  settingsElements.settingsSave.addEventListener('click', () => handleSaveSettings(api));
  
  console.log('设置模块已初始化');
}

