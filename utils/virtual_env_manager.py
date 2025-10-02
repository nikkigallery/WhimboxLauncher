import subprocess
import os
import sys
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class VirtualEnvManager:
    def __init__(self, python_manager=None, config=None):
        self.python_manager = python_manager
        self.config = config or {}
        self.common_env_names = ['venv', '.venv', '.conda', 'conda_env', 'env', '.env']
        
    def detect_virtual_envs(self):
        """检测当前目录下的虚拟环境"""
        detected_envs = []
        
        for env_name in self.common_env_names:
            env_path = Path(env_name)
            if env_path.exists() and env_path.is_dir():
                python_exe = self._get_python_executable(env_path)
                if python_exe and python_exe.exists():
                    detected_envs.append({
                        'name': env_name,
                        'path': str(env_path),
                        'python_exe': str(python_exe),
                        'type': self._detect_env_type(env_path)
                    })
        
        logger.info(f"检测到 {len(detected_envs)} 个虚拟环境")
        return detected_envs
    
    def _get_python_executable(self, env_path):
        """获取虚拟环境中的Python可执行文件路径"""
        possible_paths = [
            env_path / 'Scripts' / 'python.exe',  # Windows
            env_path / 'bin' / 'python',         # Unix-like
            env_path / 'python.exe',            # 直接在根目录
        ]
        
        for path in possible_paths:
            if path.exists():
                return path
        
        return None
    
    def _detect_env_type(self, env_path):
        """检测虚拟环境类型"""
        # 检查是否为conda环境
        conda_meta = env_path / 'conda-meta'
        if conda_meta.exists():
            return 'conda'
        
        # 检查是否为venv环境
        pyvenv_cfg = env_path / 'pyvenv.cfg'
        if pyvenv_cfg.exists():
            return 'venv'
        
        # 检查是否为virtualenv环境
        activate_script = env_path / 'Scripts' / 'activate.bat'
        if activate_script.exists():
            return 'virtualenv'
        
        return 'unknown'
    
    def create_virtual_env(self, env_name='venv', python_path=None):
        """创建虚拟环境"""
        if python_path is None:
            python_path = self.python_manager.python_path if self.python_manager else None
        
        if not python_path:
            logger.error("Python路径未设置")
            return False
        
        env_path = Path(env_name)
        
        # 检查是否已存在
        if env_path.exists():
            logger.warning(f"虚拟环境 {env_name} 已存在")
            return False
        
        try:
            logger.info(f"正在创建虚拟环境: {env_name}")
            
            # 使用venv模块创建虚拟环境
            cmd = [python_path, '-m', 'venv', str(env_path)]
            
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=300)
            
            if result.returncode == 0:
                logger.info(f"虚拟环境 {env_name} 创建完成")
                # 更新config中依赖成功标志
                if self.config_manager:
                    self.config_manager.set('environment_configured', True)
                return True
            else:
                logger.error(f"创建虚拟环境失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"创建虚拟环境失败: {e}")
            return False
    
    def create_conda_env(self, env_name='conda_env', python_version=None):
        """创建Conda环境"""
        if not self.python_manager or not self.python_manager.conda_path:
            logger.error("Conda未安装")
            return False
        
        env_path = Path(env_name)
        
        # 检查是否已存在
        if env_path.exists():
            logger.warning(f"Conda环境 {env_name} 已存在")
            return False
        
        try:
            logger.info(f"正在创建Conda环境: {env_name}")
            
            # 构建conda创建命令
            cmd = [self.python_manager.conda_path, 'create', '-n', env_name, '-y']
            
            if python_version:
                cmd.extend(['python=' + python_version])
            
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=600)
            
            if result.returncode == 0:
                logger.info(f"Conda环境 {env_name} 创建完成")
                # 更新config中依赖成功标志
                if self.config_manager:
                    self.config_manager.set('environment_configured', True)
                return True
            else:
                logger.error(f"创建Conda环境失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"创建Conda环境失败: {e}")
            return False
    
    def remove_virtual_env(self, env_name):
        """删除虚拟环境"""
        env_path = Path(env_name)
        
        if not env_path.exists():
            logger.warning(f"虚拟环境 {env_name} 不存在")
            return False
        
        try:
            logger.info(f"正在删除虚拟环境: {env_name}")
            
            # 在Windows上，可能需要先关闭相关进程
            if sys.platform == 'win32':
                self._kill_python_processes(env_path)
            
            # 删除虚拟环境目录
            shutil.rmtree(env_path)
            
            logger.info(f"虚拟环境 {env_name} 删除完成")
            return True
            
        except Exception as e:
            logger.error(f"删除虚拟环境失败: {e}")
            return False
    
    def _kill_python_processes(self, env_path):
        """杀死使用虚拟环境的Python进程"""
        try:
            import psutil
            
            for proc in psutil.process_iter(['pid', 'name', 'exe']):
                try:
                    if proc.info['name'] == 'python.exe':
                        if str(env_path) in proc.info['exe']:
                            proc.kill()
                            logger.info(f"已杀死进程: {proc.info['pid']}")
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                    
        except ImportError:
            logger.warning("psutil未安装，无法杀死相关进程")
    
    def activate_virtual_env(self, env_name):
        """激活虚拟环境（返回激活后的Python路径）"""
        env_path = Path(env_name)
        
        if not env_path.exists():
            logger.error(f"虚拟环境 {env_name} 不存在")
            return None
        
        python_exe = self._get_python_executable(env_path)
        
        if not python_exe or not python_exe.exists():
            logger.error(f"未找到虚拟环境 {env_name} 中的Python可执行文件")
            return None
        
        logger.info(f"虚拟环境 {env_name} 已激活")
        return str(python_exe)
    
    def get_env_info(self, env_name):
        """获取虚拟环境信息"""
        env_path = Path(env_name)
        
        if not env_path.exists():
            return None
        
        python_exe = self._get_python_executable(env_path)
        
        if not python_exe or not python_exe.exists():
            return None
        
        try:
            info = {
                'name': env_name,
                'path': str(env_path),
                'python_exe': str(python_exe),
                'type': self._detect_env_type(env_path),
                'size': self._get_dir_size(env_path),
                'created': self._get_creation_time(env_path)
            }
            
            # 获取Python版本
            result = subprocess.run([str(python_exe), '--version'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                info['python_version'] = result.stdout.strip()
            
            # 获取已安装包数量
            packages = self._get_installed_packages(str(python_exe))
            info['package_count'] = len(packages)
            
            return info
            
        except Exception as e:
            logger.error(f"获取虚拟环境信息失败: {e}")
            return None
    
    def _get_dir_size(self, path):
        """获取目录大小"""
        try:
            total_size = 0
            for dirpath, dirnames, filenames in os.walk(path):
                for f in filenames:
                    fp = os.path.join(dirpath, f)
                    try:
                        total_size += os.path.getsize(fp)
                    except OSError:
                        continue
            return total_size
        except:
            return 0
    
    def _get_creation_time(self, path):
        """获取目录创建时间"""
        try:
            return os.path.getctime(path)
        except:
            return None
    
    def _get_installed_packages(self, python_exe):
        """获取已安装的包列表"""
        try:
            result = subprocess.run([python_exe, '-m', 'pip', 'list', '--format=json'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=30)
            
            if result.returncode == 0:
                import json
                return json.loads(result.stdout)
            else:
                return []
                
        except Exception as e:
            logger.error(f"获取包列表失败: {e}")
            return []
    
    def copy_virtual_env(self, source_env, target_env):
        """复制虚拟环境"""
        source_path = Path(source_env)
        target_path = Path(target_env)
        
        if not source_path.exists():
            logger.error(f"源虚拟环境 {source_env} 不存在")
            return False
        
        if target_path.exists():
            logger.warning(f"目标虚拟环境 {target_env} 已存在")
            return False
        
        try:
            logger.info(f"正在复制虚拟环境: {source_env} -> {target_env}")
            
            # 复制整个目录
            shutil.copytree(source_path, target_path)
            
            # 更新虚拟环境中的路径
            self._update_env_paths(target_path)
            
            logger.info(f"虚拟环境复制完成: {target_env}")
            return True
            
        except Exception as e:
            logger.error(f"复制虚拟环境失败: {e}")
            return False
    
    def _update_env_paths(self, env_path):
        """更新虚拟环境中的路径"""
        try:
            # 更新activate脚本中的路径
            activate_scripts = [
                env_path / 'Scripts' / 'activate.bat',
                env_path / 'Scripts' / 'activate.ps1',
                env_path / 'bin' / 'activate'
            ]
            
            for script in activate_scripts:
                if script.exists():
                    try:
                        with open(script, 'r', encoding='utf-8') as f:
                            content = f.read()
                        
                        # 替换路径
                        old_path = str(script.parent.parent)
                        new_path = str(env_path)
                        content = content.replace(old_path, new_path)
                        
                        with open(script, 'w', encoding='utf-8') as f:
                            f.write(content)
                            
                    except Exception as e:
                        logger.warning(f"更新脚本 {script} 失败: {e}")
            
        except Exception as e:
            logger.error(f"更新虚拟环境路径失败: {e}")
    
    def list_env_python_versions(self):
        """列出所有虚拟环境的Python版本"""
        envs = self.detect_virtual_envs()
        versions = []
        
        for env in envs:
            try:
                result = subprocess.run([env['python_exe'], '--version'], 
                                      capture_output=True, text=True, 
                                      shell=True, timeout=10)
                if result.returncode == 0:
                    versions.append({
                        'env_name': env['name'],
                        'python_version': result.stdout.strip(),
                        'env_type': env['type']
                    })
            except Exception as e:
                logger.error(f"获取环境 {env['name']} 的Python版本失败: {e}")
        
        return versions
    
    def is_env_valid(self, env_name):
        """检查虚拟环境是否有效"""
        env_path = Path(env_name)
        
        if not env_path.exists():
            return False
        
        python_exe = self._get_python_executable(env_path)
        
        if not python_exe or not python_exe.exists():
            return False
        
        try:
            # 尝试运行Python
            result = subprocess.run([str(python_exe), '--version'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            return result.returncode == 0
            
        except Exception as e:
            logger.error(f"检查虚拟环境 {env_name} 有效性失败: {e}")
            return False
    
    def get_env_requirements(self, env_name):
        """获取虚拟环境的requirements.txt"""
        env_path = Path(env_name)
        
        if not env_path.exists():
            return None
        
        python_exe = self._get_python_executable(env_path)
        
        if not python_exe or not python_exe.exists():
            return None
        
        try:
            # 生成requirements.txt
            result = subprocess.run([str(python_exe), '-m', 'pip', 'freeze'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=30)
            
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                return None
                
        except Exception as e:
            logger.error(f"获取虚拟环境 {env_name} 的requirements失败: {e}")
            return None