import sys
import os
import json
import threading
import webview
import subprocess
import shutil
import requests
import zipfile
import tempfile
import platform
import winreg
import logging
import time
from pathlib import Path
from datetime import datetime

# 导入工具模块
from utils.git_manager import GitManager
from utils.python_manager import PythonManager
from utils.virtual_env_manager import VirtualEnvManager
from utils.dependency_manager import DependencyManager
from utils.updater import Updater
from utils.config_manager import ConfigManager

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('launcher.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class Api:
    def __init__(self, launcher):
        self.launcher = launcher
        
    def saveConfig(self, config):
        """保存配置"""
        try:
            self.launcher.config_manager.update_config(config)
            self.launcher.config_manager.save_config()
            return {"success": True, "message": "配置保存成功"}
        except Exception as e:
            logger.error(f"保存配置失败: {e}")
            return {"success": False, "message": f"配置保存失败: {str(e)}"}
    
    def loadConfig(self):
        """加载配置"""
        try:
            return self.launcher.config_manager.config
        except Exception as e:
            logger.error(f"加载配置失败: {e}")
            return None
    
    def startSetup(self):
        """开始设置"""
        try:
            # 在新线程中运行设置
            thread = threading.Thread(target=self.launcher.first_run_setup)
            thread.daemon = True
            thread.start()
            return {"success": True, "message": "设置已开始"}
        except Exception as e:
            logger.error(f"启动设置失败: {e}")
            return {"success": False, "message": f"启动设置失败: {str(e)}"}
    
    def startProject(self):
        """启动项目"""
        try:
            # 在新线程中启动项目
            thread = threading.Thread(target=self.launcher.start_main_program)
            thread.daemon = True
            thread.start()
            return {"success": True, "message": "项目启动中"}
        except Exception as e:
            logger.error(f"启动项目失败: {e}")
            return {"success": False, "message": f"启动项目失败: {str(e)}"}
    
    def checkUpdates(self):
        """检查更新"""
        try:
            has_update, update_info = self.launcher.updater.check_for_updates()
            if has_update:
                message = f"发现新版本 {update_info['version']}"
                if update_info.get('release_notes'):
                    message += f"\n\n更新说明:\n{update_info['release_notes']}"
            else:
                message = "启动器已是最新版本"
            
            return {
                "success": True, 
                "message": message,
                "has_update": has_update,
                "update_info": update_info if has_update else None
            }
        except Exception as e:
            logger.error(f"检查更新失败: {e}")
            return {"success": False, "message": f"检查更新失败: {str(e)}"}
    
    def openProjectFolder(self):
        """打开项目文件夹"""
        try:
            import subprocess
            subprocess.run(['explorer', os.getcwd()], shell=True)
            return {"success": True, "message": "项目文件夹已打开"}
        except Exception as e:
            logger.error(f"打开项目文件夹失败: {e}")
            return {"success": False, "message": f"打开项目文件夹失败: {str(e)}"}
    
    def reconfigure(self):
        """重新配置"""
        try:
            # 重置环境配置状态
            self.launcher.config_manager.set('environment_configured', False)
            self.launcher.config_manager.save_config()
            return {"success": True, "message": "配置已重置，请重启启动器"}
        except Exception as e:
            logger.error(f"重置配置失败: {e}")
            return {"success": False, "message": f"重置配置失败: {str(e)}"}
    
    def restartLauncher(self):
        """重启启动器"""
        try:
            import subprocess
            import sys
            
            # 获取当前脚本路径
            script_path = sys.argv[0]
            
            # 重启程序
            subprocess.Popen([sys.executable, script_path], shell=True)
            
            # 关闭当前程序
            sys.exit(0)
            
        except Exception as e:
            logger.error(f"重启启动器失败: {e}")
            return {"success": False, "message": f"重启启动器失败: {str(e)}"}

    def ping(self):
        """简单连通性测试"""
        return {"success": True, "message": "pong", "time": time.time()}

    def echo(self, msg: str):
        """回显测试"""
        return {"success": True, "echo": msg, "time": time.time()}

    def demoLongTask(self, seconds: int = 5):
        """
        后台长任务模拟（逐步更新进度）。
        非阻塞：放到线程里跑，前端通过 updateProgress 实时显示。
        """
        def _job():
            steps = max(1, int(seconds))
            for i in range(steps + 1):
                pct = int(100 * i / steps)
                self.launcher.update_progress(pct, f"自测任务进度：{pct}%")
                time.sleep(1)
            self.launcher.update_progress(100, "自测任务完成")
        t = threading.Thread(target=_job, daemon=True)
        t.start()
        return {"success": True, "message": f"已启动自测长任务（约 {seconds}s）"}

class PythonLauncher:
    def __init__(self):
        self.window = None
        self.config_manager = ConfigManager()
        self.config = self.config_manager.config
        self.progress = 0
        self.status = "初始化中..."
        self.is_first_run = self.config_manager.is_first_run()
        
        # 初始化管理器
        self.git_manager = GitManager(self.config)
        self.python_manager = PythonManager(self.config)
        self.virtual_env_manager = VirtualEnvManager(self.python_manager, self.config)
        self.dependency_manager = DependencyManager(self.python_manager, self.config)
        self.updater = Updater(self.config)
        
        # 创建API接口
        self.api = Api(self)
        
    def update_progress(self, progress, status):
        """更新进度和状态"""
        self.progress = progress
        self.status = status
        logger.info(f"进度: {progress}%, 状态: {status}")
        if self.window:
            try:
                self.window.evaluate_js(f"updateProgress({progress}, '{status}')")
            except Exception as e:
                logger.warning(f"更新进度显示失败: {e}")
    
    def check_admin_privileges(self):
        """检查管理员权限"""
        try:
            import ctypes
            return ctypes.windll.shell32.IsUserAnAdmin()
        except:
            return False
    
    def first_run_setup(self):
        """首次运行设置"""
        try:
            self.update_progress(0, "开始首次运行设置...")
            
            # 检查Git
            if not self.git_manager.is_installed():
                self.update_progress(5, "未检测到Git，正在安装...")
                if not self.git_manager.install_git():
                    self.update_progress(100, "Git安装失败，请手动安装后重试")
                    return
            
            # 克隆仓库
            if self.config.get('github_repo'):
                self.update_progress(15, "正在克隆仓库...")
                if not self.git_manager.clone_repository(self.config['github_repo']):
                    self.update_progress(100, "仓库克隆失败，请检查网络连接和仓库地址")
                    return
            else:
                self.update_progress(100, "请先配置GitHub仓库地址")
                return
            
            # 检查Python
            if not self.python_manager.is_python_installed():
                self.update_progress(25, "未检测到Python，正在安装...")
                if not self.python_manager.install_python(self.config.get('python_version')):
                    self.update_progress(100, "Python安装失败，请手动安装后重试")
                    return
            
            # 检查虚拟环境
            envs = self.virtual_env_manager.detect_virtual_envs()
            env_config = self.config.get('environment_settings', {})
            
            if envs:
                self.update_progress(50, f"检测到现有虚拟环境: {[env['name'] for env in envs]}")
                # 这里应该询问用户是否重装环境，暂时跳过
                time.sleep(2)
            else:
                # 创建虚拟环境
                if env_config.get('auto_create_venv', True):
                    self.update_progress(60, "正在创建虚拟环境...")
                    venv_name = env_config.get('venv_name', 'venv')
                    if not self.virtual_env_manager.create_virtual_env(venv_name):
                        self.update_progress(100, "虚拟环境创建失败")
                        return
            
            # 激活虚拟环境
            envs = self.virtual_env_manager.detect_virtual_envs()
            if envs:
                python_path = self.virtual_env_manager.activate_virtual_env(envs[0]['name'])
            else:
                python_path = self.python_manager.python_path
            
            # 安装依赖
            self.update_progress(70, "正在安装依赖...")
            if not self.dependency_manager.install_from_requirements(python_path=python_path):
                self.update_progress(100, "依赖安装失败，请查看日志")
                return
            
            # 标记环境配置完成
            self.config_manager.mark_environment_configured()
            self.config_manager.mark_first_run_completed()
            self.config_manager.update_last_run()
            
            self.update_progress(90, "设置完成")
            
            # 自动启动项目
            if self.config.get('auto_start', True):
                time.sleep(1)
                self.start_main_program()
            else:
                self.update_progress(100, "设置完成，请手动启动项目")
                
        except Exception as e:
            logger.error(f"首次运行设置失败: {e}")
            self.update_progress(100, f"设置失败: {str(e)}")
    
    def start_main_program(self):
        """启动主程序"""
        try:
            self.update_progress(95, "正在启动主程序...")
            
            # 检查虚拟环境
            envs = self.virtual_env_manager.detect_virtual_envs()
            
            if envs:
                python_path = self.virtual_env_manager.activate_virtual_env(envs[0]['name'])
            else:
                python_path = self.python_manager.python_path
            
            if not python_path:
                self.update_progress(100, "未找到Python环境")
                return
            
            # 启动main.py
            main_file = 'app\\whimbox.py'
            if os.path.exists(main_file):
                if self.config.get('show_console', False):
                    subprocess.Popen([python_path, main_file], shell=True)
                else:
                    subprocess.Popen([python_path, main_file], 
                                   shell=True, 
                                   creationflags=subprocess.CREATE_NO_WINDOW)
                
                self.update_progress(100, "主程序已启动")
                
                # 更新最后运行时间
                self.config_manager.update_last_run()
            else:
                self.update_progress(100, "未找到main.py文件")
                
        except Exception as e:
            logger.error(f"启动主程序失败: {e}")
            self.update_progress(100, f"启动主程序失败: {str(e)}")

    def _abs_path(self, *parts):
        base_dir = getattr(sys, '_MEIPASS', os.path.abspath(os.path.dirname(__file__)))
        return os.path.join(base_dir, *parts)

    def _on_started(self):
        # 在窗口真正 ready 之后，显式 expose 所有方法（名字按函数名暴露）
        try:
            # 逐个暴露：名字来自 Python 方法名，在 JS 里就是 pywebview.api.saveConfig / ping 等
            self.window.expose(
                self.api.saveConfig,
                self.api.loadConfig,
                self.api.startSetup,
                self.api.startProject,
                self.api.checkUpdates,
                self.api.openProjectFolder,
                self.api.reconfigure,
                self.api.restartLauncher,
                # 测试用API
                self.api.ping,
                self.api.echo,
                self.api.demoLongTask,
            )
        except Exception as e:
            logger.warning(f"expose API 失败: {e}")
    
    def run(self):
        """运行启动器"""
        # 检查管理员权限
        if not self.check_admin_privileges():
            print("请以管理员身份运行此程序！")
            # input("按任意键退出...")
            return
        
        # 创建必要的目录
        os.makedirs('config', exist_ok=True)
        os.makedirs('logs', exist_ok=True)
        
        # 检查更新
        if self.config.get('check_updates', True):
            try:
                has_update, update_info = self.updater.check_for_updates()
                if has_update:
                    logger.info(f"发现新版本: {update_info['version']}")
                    # 可以在这里添加自动更新逻辑
            except Exception as e:
                logger.warning(f"检查更新失败: {e}")
        
        # 根据环境配置状态决定显示哪个界面
        html_rel = 'static/launch.html' if self.config_manager.is_environment_configured() else 'static/index1.html'
        html_abs = self._abs_path(html_rel)
        file_url = 'file:///' + html_abs.replace('\\', '/')
        
        # 创建webview窗口
        try:
            self.window = webview.create_window(
                title='',
                url=file_url,
                # js_api=self.api, # 注释掉这行是因为打包时出现嵌套错误，通过添加 expose 方法解决
                width=self.config.get('ui_settings', {}).get('window_width',1080),
                height=self.config.get('ui_settings', {}).get('window_height', 720),
                resizable=True,
                min_size=(600, 400),
                frameless=True
            )

            webview.start(self._on_started,debug=True)
            
        except Exception as e:
            logger.error(f"启动界面失败: {e}")
            # print(f"启动界面失败: {e}")
            # input("按任意键退出...")

if __name__ == '__main__':
    try:
        launcher = PythonLauncher()
        launcher.run()
    except Exception as e:
        logger.error(f"程序启动失败: {e}")
        # print(f"程序启动失败: {e}")
        # input("按任意键退出...")