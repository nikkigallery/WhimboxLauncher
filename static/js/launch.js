// ====== 启动页默认值（已配置完成场景）======
const LAUNCH_DEFAULTS = {
  github_repo: "https://github.com/nikkigallery/Whimbox",
  python_version: "3.12",
  check_updates: false,     // ⬅ 默认关闭
  show_console: false,
  auto_minimize: false,
  launcher_version: "v0.0.0"
};

let isBusy = false;
let currentTab = "options";

/* ================= 工具 ================= */
function getFirstFocusable(root) {
  const SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');
  return root.querySelector(SELECTOR);
}
function safeFocus(el) {
  try { el?.focus?.({ preventScroll: true }); } catch (_) {}
}
function safeBlur(el) {
  try { el?.blur?.(); } catch (_) {}
}

/* ================= Drawer：无障碍友好切换（inert + 焦点管理 + 捕获期兜底） ================= */
function setDrawerHidden(hidden) {
  const drawer = document.getElementById('drawer');
  if (!drawer) return;

  if (hidden) {
    // Step 1: 先禁止交互（避免在隐藏过程中新焦点落入）
    drawer.setAttribute('inert', '');

    // Step 2: 如焦点在抽屉内，先移走焦点
    if (drawer.contains(document.activeElement)) {
      safeBlur(document.activeElement);
      const trigger = document.getElementById('btn-advanced');
      safeFocus(trigger || document.body);
    }

    // Step 3: 下一帧再设置 aria-hidden=true，确保浏览器已处理完焦点事件
    requestAnimationFrame(() => {
      drawer.setAttribute('aria-hidden', 'true');
    });
  } else {
    // Step 1: 先允许交互
    drawer.removeAttribute('inert');

    // Step 2: 再在下一帧显示并聚焦到抽屉内第一个可聚焦元素
    requestAnimationFrame(() => {
      drawer.setAttribute('aria-hidden', 'false');
      const first = getFirstFocusable(drawer) || drawer;
      safeFocus(first);
    });
  }
}
function toggleDrawer(force) {
  const drawer = document.getElementById('drawer');
  if (!drawer) return;
  const isHidden = drawer.getAttribute('aria-hidden') !== 'false';
  const nextOpen = (typeof force === 'boolean') ? force : isHidden;
  setDrawerHidden(!nextOpen);
}
function openDrawer()  { setDrawerHidden(false); }
function closeDrawer() { setDrawerHidden(true); }

// —— 捕获期兜底：如果抽屉被隐藏，任何落在抽屉内的 focus/点击都转移到触发按钮或 body
(function installDrawerGuards(){
  const drawer = () => document.getElementById('drawer');
  const trigger = () => document.getElementById('btn-advanced');

  // 抽屉隐藏时，阻止其内部获得焦点
  document.addEventListener('focusin', (e) => {
    const d = drawer();
    if (!d) return;
    const hidden = d.getAttribute('aria-hidden') === 'true';
    if (hidden && d.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault?.();
      safeBlur(e.target);
      safeFocus(trigger() || document.body);
    }
  }, true);

  // 抽屉隐藏时，阻止指针事件在其内部生效，避免先聚焦后隐藏报错
  document.addEventListener('pointerdown', (e) => {
    const d = drawer();
    if (!d) return;
    const hidden = d.getAttribute('aria-hidden') === 'true';
    if (hidden && d.contains(e.target)) {
      e.stopPropagation();
      e.preventDefault?.();
      safeFocus(trigger() || document.body);
    }
  }, true);
})();

/* ================= Modal ================= */
function openModal() {
  const m = document.getElementById('setup-modal');
  if (!m) return;
  m.setAttribute('aria-hidden', 'false');
}
function closeModal() {
  const m = document.getElementById('setup-modal');
  if (!m) return;
  m.setAttribute('aria-hidden', 'true');
}

/* ================= Tabs ================= */
function switchTab(tabName, evt) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
  const tab = document.getElementById(`${tabName}-tab`);
  if (tab) tab.classList.add('active');
  if (evt?.target) evt.target.classList.add('active');
  currentTab = tabName;
}

/* ================= 进度 & 日志（供后端回调） ================= */
function updateProgress(progress, status) {
  const progressBar = document.getElementById('progress-bar');
  const statusText = document.getElementById('status-text');
  if (progressBar) progressBar.style.width = (progress || 0) + '%';
  if (statusText) statusText.textContent = status || '';

  addLog(`[${new Date().toLocaleTimeString()}] ${status || ''}`);

  if (progress >= 100) {
    isBusy = false;
    const btn = document.getElementById('btn-launch');
    if (btn) { btn.disabled = false; btn.innerHTML = '启动奇想盒'; }
  }
}
function addLog(message) {
  const logContent = document.getElementById('log-content');
  if (logContent) {
    logContent.innerHTML += (message || '') + '<br>';
    logContent.scrollTop = logContent.scrollHeight;
  }
}

/* ================= 表单读写 ================= */
function applyDefaultsToForm() {
  setCheckbox('check-updates', LAUNCH_DEFAULTS.check_updates);
  setCheckbox('show-console', LAUNCH_DEFAULTS.show_console);
  setCheckbox('auto-minimize', LAUNCH_DEFAULTS.auto_minimize);

  setValue('github-repo', LAUNCH_DEFAULTS.github_repo);
  setValue('python-version', LAUNCH_DEFAULTS.python_version);

  const ver = document.getElementById('launcher-version');
  if (ver && LAUNCH_DEFAULTS.launcher_version) ver.textContent = LAUNCH_DEFAULTS.launcher_version;
}
function setCheckbox(id, val) {
  const el = document.getElementById(id);
  if (el) el.checked = !!val;
}
function setValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ?? '';
}
function readLaunchOptionsFromForm() {
  return {
    check_updates: document.getElementById('check-updates')?.checked ?? LAUNCH_DEFAULTS.check_updates,
    show_console:  document.getElementById('show-console')?.checked ?? LAUNCH_DEFAULTS.show_console,
    auto_minimize: document.getElementById('auto-minimize')?.checked ?? LAUNCH_DEFAULTS.auto_minimize
  };
}

/* ================= 保存/重置（仅启动相关项） ================= */
function saveLaunchOptions() {
  const partial = readLaunchOptionsFromForm();

  if (!window.pywebview?.api?.saveConfig) {
    notify('后端 API saveConfig 未暴露', 'error');
    return;
  }

  window.pywebview.api.loadConfig?.().then(config => {
    const base = config || {};
    const merged = {
      ...base,
      check_updates: partial.check_updates,
      show_console:  partial.show_console,
      ui_settings: {
        ...(base.ui_settings || {}),
        auto_minimize: partial.auto_minimize
      }
    };
    return window.pywebview.api.saveConfig(merged);
  }).then(result => {
    if (!result) return;
    if (result.success) notify('启动选项已保存', 'success');
    else notify('保存失败：' + (result.message || ''), 'error');
  }).catch(err => notify('保存失败：' + err, 'error'));
}
function resetLaunchOptions() {
  applyDefaultsToForm();
  notify('已重置为默认启动选项（检查更新默认关闭）', 'info');
}

/* ================= 主流程：启动 ================= */
async function startProjectFlow() {
  if (isBusy) { notify('正在进行操作，请稍候...', 'warning'); return; }
  isBusy = true;

  const btn = document.getElementById('btn-launch');
  if (btn) { btn.disabled = true; btn.innerHTML = '启动中...'; }

  const opts = readLaunchOptionsFromForm();

  try {
    // 启动前检查更新（可选，默认关闭）
    if (opts.check_updates) {
      openModal();
      updateProgress(0, '正在检查更新...');
      if (!window.pywebview?.api?.checkUpdates) {
        notify('后端 API checkUpdates 未暴露', 'error');
      } else {
        const result = await window.pywebview.api.checkUpdates();
        updateProgress(20, '更新检查完成');
        if (result?.success) {
          if (result.has_update) {
            notify(result.message || '发现新版本', 'warning');
            addLog('发现更新：' + (result.message || ''));
          } else {
            notify(result.message || '已是最新版本', 'success');
          }
        } else {
          notify(result?.message || '检查更新失败', 'error');
        }
      }
    }

    // 启动主程序
    openModal();
    updateProgress(30, '正在启动项目...');
    if (!window.pywebview?.api?.startProject) {
      notify('后端 API startProject 未暴露', 'error');
      updateProgress(100, '发生错误');
      return;
    }
    const launchRes = await window.pywebview.api.startProject();
    if (launchRes?.success) {
      updateProgress(100, '项目启动中');
      notify('项目启动中', 'success');

      if (opts.auto_minimize && window.pywebview?.api?.minimizeWindow) {
        setTimeout(() => window.pywebview.api.minimizeWindow().catch(()=>{}), 300);
      }
    } else {
      updateProgress(100, '启动失败');
      notify('启动失败：' + (launchRes?.message || ''), 'error');
    }
  } catch (err) {
    updateProgress(100, '发生异常');
    notify('启动异常：' + err, 'error');
  } finally {
    isBusy = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '启动奇想盒'; }
  }
}

/* ================= 其它动作 ================= */
function checkUpdates() {
  if (isBusy) { notify('正在进行操作，请稍候...', 'warning'); return; }
  isBusy = true;
  openModal();
  updateProgress(0, '正在检查更新...');

  if (!window.pywebview?.api?.checkUpdates) {
    notify('后端 API checkUpdates 未暴露', 'error');
    isBusy = false;
    updateProgress(100, '已结束');
    return;
  }
  window.pywebview.api.checkUpdates().then(result => {
    updateProgress(100, '检查完成');
    if (result?.success) {
      notify(result.message || '检查完成', result.has_update ? 'warning' : 'success');
    } else {
      notify(result?.message || '检查失败', 'error');
    }
    isBusy = false;
  }).catch(err => {
    notify('检查更新失败：' + err, 'error');
    isBusy = false;
    updateProgress(100, '已结束');
  });
}
function openProjectFolder() {
  if (!window.pywebview?.api?.openProjectFolder) {
    notify('后端 API openProjectFolder 未暴露', 'error'); 
    return;
  }
  window.pywebview.api.openProjectFolder().catch(err => {
    notify('打开项目文件夹失败：' + err, 'error');
  });
}
function reconfigure() {
  if (!confirm('确定要重置配置并重新配置环境？此操作将把 “environment_configured” 置为未完成。')) return;
  if (!window.pywebview?.api?.reconfigure) {
    notify('后端 API reconfigure 未暴露', 'error'); 
    return;
  }
  window.pywebview.api.reconfigure().then(res => {
    if (res?.success) notify(res.message || '已重置配置', 'success');
    else notify('重置失败：' + (res?.message || ''), 'error');
  }).catch(err => notify('重置失败：' + err, 'error'));
}

/* ================= 通知 ================= */
function notify(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${iconOf(type)}</span>
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="closeNotification(this)">×</button>
    </div>
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 50);
  setTimeout(() => closeNotification(notification.querySelector('.notification-close')), 5000);
}
function iconOf(type) { return type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'; }
function closeNotification(button) {
  const notification = button.closest('.notification');
  if (notification) {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }
}

/* ================= 初始化 ================= */
document.addEventListener('DOMContentLoaded', function() {
  // 初始收起抽屉（用 API 保证 inert/焦点/aria 状态一致）
  closeDrawer();

  // 默认填充（检查更新默认关闭）
  applyDefaultsToForm();

  // 从后端读取配置覆盖选项
  if (window.pywebview?.api?.loadConfig) {
    window.pywebview.api.loadConfig().then(cfg => {
      if (!cfg) return;

      setCheckbox('check-updates', cfg.check_updates ?? LAUNCH_DEFAULTS.check_updates);
      setCheckbox('show-console',  cfg.show_console  ?? LAUNCH_DEFAULTS.show_console);
      const autoMin = cfg.ui_settings?.auto_minimize ?? LAUNCH_DEFAULTS.auto_minimize;
      setCheckbox('auto-minimize', autoMin);

      if (cfg.launcher_version) {
        const ver = document.getElementById('launcher-version');
        if (ver) ver.textContent = cfg.launcher_version;
      }
    }).catch(err => console.warn('加载配置失败:', err));
  }

  // 快捷键
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); saveLaunchOptions(); }
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); resetLaunchOptions(); }
    if (e.key === 'Enter')          { e.preventDefault(); startProjectFlow(); }
    if (e.key === 'Escape')         { closeModal(); closeDrawer(); }
  });

  // 暴露回调给后端
  window.updateProgress = updateProgress;
  window.addLog = addLog;
});

// 暴露给全局（HTML 内联调用）
window.toggleDrawer = toggleDrawer;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.openModal = openModal;
window.closeModal = closeModal;
window.switchTab = switchTab;
window.saveLaunchOptions = saveLaunchOptions;
window.resetLaunchOptions = resetLaunchOptions;
window.startProjectFlow = startProjectFlow;
window.checkUpdates = checkUpdates;
window.openProjectFolder = openProjectFolder;
window.reconfigure = reconfigure;
window.closeNotification = closeNotification;
