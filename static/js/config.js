// ====== 固化默认参数（写死到前端）======
const DEFAULTS = {
  github_repo: "https://github.com/nikkigallery/Whimbox",
  python_version: "3.12",
  use_pip_update: true,
  use_git_mirror: true,
  use_python_mirror: true,
  check_updates: false,
  auto_start: true,
  show_console: false,
  git_mirror_url: "https://github.com.cnpmjs.org",
  python_mirror_url: "https://mirrors.aliyun.com/pypi/simple/",
  pip_mirror_url: "https://mirrors.aliyun.com/pypi/simple/",
  launcher_github_repo: "https://github.com/nikkigallery/WhimboxLauncher",
  first_run: true,
  environment_configured: false, 
  last_run: null,
  environment_settings: {
    auto_create_venv: true,
    venv_name: "venv",
    use_conda: false,
    conda_env_name: "conda_env"
  },
  advanced_settings: {
    download_timeout: 300,
    install_timeout: 600,
    max_retries: 3,
    log_level: "INFO",
    cleanup_temp_files: true
  },
  ui_settings: {
    theme: "infinity_nikki",
    language: "zh-CN",
    window_width: 1296,
    window_height: 864,
    remember_window_size: true
  }
};

let currentTab = 'setup';
let isRunning = false;

/* ========== 抽屉 & Modal ========== */
function toggleDrawer(force){
  const el = document.getElementById('drawer');
  if(!el) return;
  const hidden = el.getAttribute('aria-hidden') === 'true';
  const next = (typeof force === 'boolean') ? !force : hidden;
  el.setAttribute('aria-hidden', String(!next));
}
function openModal(){
  const m = document.getElementById('setup-modal');
  if(m) m.setAttribute('aria-hidden','false');
}
function closeModal(){
  const m = document.getElementById('setup-modal');
  if(m) m.setAttribute('aria-hidden','true');
}

/* ========== Tab ========== */
function switchTab(tabName, evt){
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`${tabName}-tab`);
  if(tab) tab.classList.add('active');
  if(evt?.target) evt.target.classList.add('active');
  currentTab = tabName;
}

/* ========== 进度 & 日志（同步到 Modal） ========== */
function updateProgress(progress, status) {
  const progressBar = document.getElementById('progress-bar');
  const statusText = document.getElementById('status-text');
  if (progressBar) progressBar.style.width = (progress||0) + '%';
  if (statusText) statusText.textContent = status || '';

  addLog(`[${new Date().toLocaleTimeString()}] ${status || ''}`);

  if (progress >= 100) {
    const launchBtn = document.getElementById('launch-btn');
    if (launchBtn) launchBtn.disabled = false;
    isRunning = false;
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
      startBtn.innerHTML = '开始设置';
      startBtn.disabled = false;
    }
  }
}
function addLog(message) {
  const logContent = document.getElementById('log-content');
  if (logContent) {
    logContent.innerHTML += (message || '') + '<br>';
    logContent.scrollTop = logContent.scrollHeight;
  }
}

/* ========== 映射默认值到表单（锁定仓库 & Python 版本） ========== */
function applyDefaultsToForm() {
  const repoEl = document.getElementById('github-repo');
  const pyEl = document.getElementById('python-version');
  if (repoEl) {
    repoEl.value = DEFAULTS.github_repo;
    repoEl.setAttribute('readonly', 'readonly');
    repoEl.setAttribute('disabled', 'disabled');
  }
  if (pyEl) {
    pyEl.value = DEFAULTS.python_version;
    pyEl.setAttribute('readonly', 'readonly');
    pyEl.setAttribute('disabled', 'disabled');
  }

  setCheckbox('use-git-mirror', DEFAULTS.use_git_mirror);
  setCheckbox('use-python-mirror', DEFAULTS.use_python_mirror);
  setCheckbox('use-pip-update', DEFAULTS.use_pip_update);
  setCheckbox('check-updates', DEFAULTS.check_updates);
  setCheckbox('auto-start', DEFAULTS.auto_start);
  setCheckbox('show-console', DEFAULTS.show_console);

  setValue('git-mirror-url', DEFAULTS.git_mirror_url);
  setValue('python-mirror-url', DEFAULTS.python_mirror_url);
  setValue('pip-mirror-url', DEFAULTS.pip_mirror_url);
}
function setCheckbox(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}

/* ========== 配置保存/重置 ========== */
function saveConfig() {
  const config = {
    github_repo: DEFAULTS.github_repo,
    python_version: DEFAULTS.python_version,
    use_git_mirror: document.getElementById('use-git-mirror')?.checked,
    use_python_mirror: document.getElementById('use-python-mirror')?.checked,
    use_pip_update: document.getElementById('use-pip-update')?.checked,
    check_updates: document.getElementById('check-updates')?.checked,
    auto_start: document.getElementById('auto-start')?.checked,
    show_console: document.getElementById('show-console')?.checked,
    git_mirror_url: document.getElementById('git-mirror-url')?.value,
    python_mirror_url: document.getElementById('python-mirror-url')?.value,
    pip_mirror_url: document.getElementById('pip-mirror-url')?.value,
    launcher_github_repo: DEFAULTS.launcher_github_repo,
    first_run: DEFAULTS.first_run,
    environment_configured: DEFAULTS.environment_configured,
    last_run: DEFAULTS.last_run,
    environment_settings: DEFAULTS.environment_settings,
    advanced_settings: DEFAULTS.advanced_settings,
    ui_settings: DEFAULTS.ui_settings
  };

  if(!window.pywebview?.api?.saveConfig){
    showNotification('后端 API saveConfig 未暴露', 'error'); return;
  }
  pywebview.api.saveConfig(config).then(result => {
    if (result?.success) showNotification('配置保存成功！', 'success');
    else showNotification('配置保存失败：' + (result?.message||''), 'error');
  }).catch(error => showNotification('配置保存失败：' + error, 'error'));
}
function resetConfig() {
  if (!confirm('确定要重置为默认配置吗？')) return;
  applyDefaultsToForm();
  showNotification('配置已重置为默认值', 'info');
}

/* ========== 工作流：打开Modal + 开始设置 ========== */
function openSetup(){
  openModal();
  startSetup();
}
function startSetup() {
  if (isRunning) { showNotification('正在进行设置，请稍候...', 'warning'); return; }
  const githubRepo = DEFAULTS.github_repo;
  if (!githubRepo) { showNotification('默认 GitHub 仓库地址缺失！', 'warning'); return; }

  isRunning = true;
  updateProgress(0, '开始配置...');
  const startBtn = document.getElementById('start-btn');
  if (startBtn) { startBtn.innerHTML = '设置中...'; startBtn.disabled = true; }
  const launchBtn = document.getElementById('launch-btn');
  if (launchBtn) launchBtn.disabled = true;

  if(!window.pywebview?.api?.startSetup){
    showNotification('后端 API startSetup 未暴露', 'error'); isRunning=false; return;
  }
  pywebview.api.startSetup().then(result => {
    // 后端在执行过程中可通过 window.updateProgress(%) 回调更新
    // 这里不强行写死 100%，交由后端驱动；若后端只给完成回执，可在此收尾：
    if(result?.success){ updateProgress(5, '读取设置完成'); }
    else { showNotification('设置失败：' + (result?.message||''), 'error'); }
  }).catch(error => {
    console.error('设置失败:', error);
    showNotification('设置失败：' + error, 'error');
    isRunning = false;
    if (startBtn) { startBtn.innerHTML = '开始设置'; startBtn.disabled = false; }
  });
}

/* ========== 启动/更新/打开项目目录 ========== */
function startProject() {
  if (isRunning) { showNotification('正在进行操作，请稍候...', 'warning'); return; }
  isRunning = true;
  const btn = document.getElementById('launch-btn');
  if (btn){ btn.innerHTML = '启动中...'; btn.disabled = true; }

  if(!window.pywebview?.api?.startProject){
    showNotification('后端 API startProject 未暴露', 'error'); isRunning=false;
    if(btn){ btn.innerHTML='直接启动'; btn.disabled=false; } return;
  }
  pywebview.api.startProject().then(result => {
    if(result?.success){ showNotification('项目已启动', 'success'); }
    else{ showNotification('项目启动失败：' + (result?.message||''), 'error'); }
    isRunning = false;
    if(btn){ btn.innerHTML='直接启动'; btn.disabled=false; }
  }).catch(error => {
    showNotification('项目启动失败：' + error, 'error');
    isRunning = false;
    if(btn){ btn.innerHTML='直接启动'; btn.disabled=false; }
  });
}
function checkUpdates() {
  if (isRunning) { showNotification('正在进行操作，请稍候...', 'warning'); return; }
  isRunning = true;
  updateProgress(0, '正在检查更新...');

  if(!window.pywebview?.api?.checkUpdates){
    showNotification('后端 API checkUpdates 未暴露', 'error'); isRunning=false; return;
  }
  pywebview.api.checkUpdates().then(result => {
    updateProgress(100, '更新检查完成');
    if (result?.success) {
      showNotification(result.message || '检查完成', result.has_update ? 'warning' : 'success');
    } else {
      showNotification(result?.message || '检查失败', 'error');
    }
    isRunning = false;
  }).catch(error => {
    console.error('检查更新失败:', error);
    showNotification('检查更新失败：' + error, 'error');
    isRunning = false;
  });
}
function openProjectFolder(){
  if(!window.pywebview?.api?.openProjectFolder){
    showNotification('后端 API openProjectFolder 未暴露', 'error'); return;
  }
  pywebview.api.openProjectFolder().catch(err=>{
    showNotification('打开项目文件夹失败：' + err, 'error');
  });
}

/* ========== 通知 ========== */
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${getNotificationIcon(type)}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="closeNotification(this)">×</button>
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 50);
  setTimeout(() => closeNotification(notification.querySelector('.notification-close')), 5000);
}
function getNotificationIcon(type) {
  switch (type) { case 'success': return '✓'; case 'error': return '✗'; case 'warning': return '⚠'; default: return 'ℹ'; }
}
function closeNotification(button) {
  const notification = button.closest('.notification');
  if (notification) {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }
}

/* ========== 初始化 ========== */
document.addEventListener('DOMContentLoaded', function() {
  // 默认收起抽屉；Modal 关闭
  toggleDrawer(false);
  closeModal();

  // 先渲染默认值
  applyDefaultsToForm();

  // 从后端加载配置（若有）
  if (window.pywebview?.api?.loadConfig) {
    pywebview.api.loadConfig().then(config => {
      if (!config) return;
      setCheckbox('use-git-mirror', config.use_git_mirror ?? DEFAULTS.use_git_mirror);
      setCheckbox('use-python-mirror', config.use_python_mirror ?? DEFAULTS.use_python_mirror);
      setCheckbox('use-pip-update', config.use_pip_update ?? DEFAULTS.use_pip_update);
      setCheckbox('check-updates', config.check_updates ?? DEFAULTS.check_updates);
      setCheckbox('auto-start', config.auto_start ?? DEFAULTS.auto_start);
      setCheckbox('show-console', config.show_console ?? DEFAULTS.show_console);
      setValue('git-mirror-url', config.git_mirror_url ?? DEFAULTS.git_mirror_url);
      setValue('python-mirror-url', config.python_mirror_url ?? DEFAULTS.python_mirror_url);
      setValue('pip-mirror-url', config.pip_mirror_url ?? DEFAULTS.pip_mirror_url);
      // 再次强制锁定两项
      applyDefaultsToForm();
    }).catch(err => console.error('加载配置失败:', err));
  }

  // 快捷键
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveConfig(); }
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); resetConfig(); }
    if (e.key === 'Enter' && currentTab === 'setup') { e.preventDefault(); openSetup(); }
    if (e.ctrlKey && e.key === 'Enter' && currentTab === 'launch') { e.preventDefault(); startProject(); }
    if (e.key === 'Escape') { closeModal(); }
  });

  // 可选：后端可在运行中回调 window.updateProgress(pct, status)
  window.updateProgress = updateProgress;
  window.addLog = addLog;
});
