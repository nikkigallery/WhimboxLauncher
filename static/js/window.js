// 绑定右上角按钮
document.addEventListener('DOMContentLoaded', () => {
  const btnMin = document.getElementById('win-min');
  const btnClose = document.getElementById('win-close');

  if (btnMin) {
    btnMin.addEventListener('click', () => {
      if (window.pywebview?.api?.minimizeWindow) {
        window.pywebview.api.minimizeWindow().catch(err => console.error(err));
      } else {
        console.warn('minimizeWindow API 未暴露');
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (window.pywebview?.api?.closeWindow) {
        window.pywebview.api.closeWindow().catch(err => console.error(err));
      } else {
        console.warn('closeWindow API 未暴露');
      }
    });
  }
});
// 初始化抽屉状态
document.addEventListener('DOMContentLoaded', function() {
  const drawer = document.getElementById('drawer');
  const btn = document.getElementById('btn-advanced');
  
  // 确保初始状态为隐藏
  drawer.setAttribute('aria-hidden', 'true');
  
  // 添加点击事件监听
  btn.addEventListener('click', toggleDrawer);
});

function toggleDrawer() {
  const drawer = document.getElementById('drawer');
  const btn = document.getElementById('btn-advanced');
  const isHidden = drawer.getAttribute('aria-hidden') === 'true';
  
  drawer.setAttribute('aria-hidden', !isHidden);
  btn.classList.toggle('expanded');
  btn.textContent = isHidden ? '▲' : '▼';
}