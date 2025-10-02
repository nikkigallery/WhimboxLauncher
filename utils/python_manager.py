import subprocess
import os
import requests
import sys
import logging
import winreg
from pathlib import Path

logger = logging.getLogger(__name__)

class PythonManager:
    def __init__(self, config=None):
        self.config = config or {}
        self.python_path = self._find_python_executable()
        self.conda_path = self._find_conda_executable()
        
    def _find_python_executable(self):
        """查找Python可执行文件路径"""
        possible_paths = [
            'python',
            'python3',
            'python.exe',
            'python3.exe',
            r'C:\Python39\python.exe',
            r'C:\Python310\python.exe',
            r'C:\Python311\python.exe',
            r'C:\Python312\python.exe',
            r'C:\Program Files\Python39\python.exe',
            r'C:\Program Files\Python310\python.exe',
            r'C:\Program Files\Python311\python.exe',
            r'C:\Program Files\Python312\python.exe',
            os.path.join(os.getcwd(), 'python', 'python.exe'),
            os.path.join(os.getcwd(), 'python', 'Scripts', 'python.exe')
        ]
        
        for path in possible_paths:
            try:
                result = subprocess.run([path, '--version'], 
                                      capture_output=True, text=True, 
                                      shell=True, timeout=5)
                if result.returncode == 0:
                    logger.info(f"找到Python: {path}")
                    return path
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue
        
        # 检查注册表
        try:
            python_reg_path = self._get_python_from_registry()
            if python_reg_path:
                logger.info(f"从注册表找到Python: {python_reg_path}")
                return python_reg_path
        except Exception as e:
            logger.warning(f"从注册表查找Python失败: {e}")
        
        logger.warning("未找到Python可执行文件")
        return None
    
    def _find_conda_executable(self):
        """查找Conda可执行文件路径"""
        possible_paths = [
            'conda',
            'conda.exe',
            os.path.join(os.getcwd(), 'conda', 'Scripts', 'conda.exe'),
            os.path.join(os.getcwd(), 'conda', 'condabin', 'conda.bat'),
            r'C:\ProgramData\Anaconda3\Scripts\conda.exe',
            r'C:\ProgramData\Miniconda3\Scripts\conda.exe',
            r'C:\Users\%USERNAME%\Anaconda3\Scripts\conda.exe',
            r'C:\Users\%USERNAME%\Miniconda3\Scripts\conda.exe'
        ]
        
        for path in possible_paths:
            try:
                result = subprocess.run([path, '--version'], 
                                      capture_output=True, text=True, 
                                      shell=True, timeout=5)
                if result.returncode == 0:
                    logger.info(f"找到Conda: {path}")
                    return path
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue
        
        logger.warning("未找到Conda可执行文件")
        return None
    
    def _get_python_from_registry(self):
        """从注册表获取Python路径"""
        try:
            # 检查64位Python
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                               r'SOFTWARE\Python\PythonCore', 0, 
                               winreg.KEY_READ | winreg.KEY_WOW64_64KEY)
            
            for i in range(winreg.QueryInfoKey(key)[0]):
                version = winreg.EnumKey(key, i)
                try:
                    install_key = winreg.OpenKey(key, f'{version}\\InstallPath')
                    install_path = winreg.QueryValueEx(install_key, '')[0]
                    python_path = os.path.join(install_path, 'python.exe')
                    
                    if os.path.exists(python_path):
                        winreg.CloseKey(install_key)
                        winreg.CloseKey(key)
                        return python_path
                    
                    winreg.CloseKey(install_key)
                except WindowsError:
                    continue
            
            winreg.CloseKey(key)
            
            # 检查32位Python
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                               r'SOFTWARE\Python\PythonCore', 0, 
                               winreg.KEY_READ | winreg.KEY_WOW64_32KEY)
            
            for i in range(winreg.QueryInfoKey(key)[0]):
                version = winreg.EnumKey(key, i)
                try:
                    install_key = winreg.OpenKey(key, f'{version}\\InstallPath')
                    install_path = winreg.QueryValueEx(install_key, '')[0]
                    python_path = os.path.join(install_path, 'python.exe')
                    
                    if os.path.exists(python_path):
                        winreg.CloseKey(install_key)
                        winreg.CloseKey(key)
                        return python_path
                    
                    winreg.CloseKey(install_key)
                except WindowsError:
                    continue
            
            winreg.CloseKey(key)
            
        except Exception as e:
            logger.error(f"从注册表查找Python失败: {e}")
        
        return None
    
    def is_python_installed(self):
        """检查Python是否已安装"""
        return self.python_path is not None
    
    def is_conda_installed(self):
        """检查Conda是否已安装"""
        return self.conda_path is not None
    
    def get_python_version(self):
        """获取Python版本"""
        if not self.python_path:
            return None
        
        try:
            result = subprocess.run([self.python_path, '--version'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"获取Python版本失败: {e}")
        
        return None
    
    def get_conda_version(self):
        """获取Conda版本"""
        if not self.conda_path:
            return None
        
        try:
            result = subprocess.run([self.conda_path, '--version'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"获取Conda版本失败: {e}")
        
        return None
    
    def install_python(self, version=None, install_dir=None):
        """安装Python"""
        if version is None:
            version = self.config.get('python_version', '3.12.0')
        
        if install_dir is None:
            install_dir = os.path.join(os.getcwd(), 'python')
        
        logger.info(f"开始安装Python {version}...")
        
        # Python下载URL
        python_url = f"https://www.python.org/ftp/python/{version}/python-{version}-amd64.exe"
        
        try:
            # 下载Python安装包
            installer_path = os.path.join(os.getcwd(), "python_installer.exe")
            
            if not self._download_file(python_url, installer_path, "Python"):
                return False
            
            # 静默安装Python
            install_cmd = [
                installer_path,
                '/quiet',
                'InstallAllUsers=1',
                'PrependPath=1',
                'Include_test=0',
                'TargetDir=' + install_dir
            ]
            
            logger.info("正在安装Python...")
            result = subprocess.run(install_cmd, shell=True, timeout=600)
            
            # 删除安装包
            try:
                os.remove(installer_path)
            except:
                pass
            
            if result.returncode == 0:
                # 重新查找Python路径
                self.python_path = self._find_python_executable()
                logger.info("Python安装完成")
                return True
            else:
                logger.error(f"Python安装失败，返回码: {result.returncode}")
                return False
                
        except Exception as e:
            logger.error(f"安装Python失败: {e}")
            return False
    
    def install_conda(self, install_dir=None):
        """安装Conda"""
        if install_dir is None:
            install_dir = os.path.join(os.getcwd(), 'conda')
        
        logger.info("开始安装Conda...")
        
        # Conda下载URL
        conda_url = "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe"
        
        try:
            # 下载Conda安装包
            installer_path = os.path.join(os.getcwd(), "conda_installer.exe")
            
            if not self._download_file(conda_url, installer_path, "Conda"):
                return False
            
            # 静默安装Conda
            install_cmd = [
                installer_path,
                '/S',
                '/D=' + install_dir
            ]
            
            logger.info("正在安装Conda...")
            result = subprocess.run(install_cmd, shell=True, timeout=600)
            
            # 删除安装包
            try:
                os.remove(installer_path)
            except:
                pass
            
            if result.returncode == 0:
                # 重新查找Conda路径
                self.conda_path = self._find_conda_executable()
                logger.info("Conda安装完成")
                return True
            else:
                logger.error(f"Conda安装失败，返回码: {result.returncode}")
                return False
                
        except Exception as e:
            logger.error(f"安装Conda失败: {e}")
            return False
    
    def _download_file(self, url, file_path, name="文件"):
        """下载文件"""
        try:
            logger.info(f"正在下载{name}...")
            
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total_size > 0:
                            progress = (downloaded / total_size) * 100
                            logger.info(f"下载进度: {progress:.1f}%")
            
            logger.info(f"{name}下载完成")
            return True
            
        except Exception as e:
            logger.error(f"下载{name}失败: {e}")
            return False
    
    def get_installed_packages(self, python_path=None):
        """获取已安装的包列表"""
        if python_path is None:
            python_path = self.python_path
        
        if not python_path:
            logger.error("Python路径未设置")
            return []
        
        try:
            result = subprocess.run([python_path, '-m', 'pip', 'list', '--format=json'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=30)
            
            if result.returncode == 0:
                import json
                return json.loads(result.stdout)
            else:
                logger.error(f"获取包列表失败: {result.stderr}")
                return []
                
        except Exception as e:
            logger.error(f"获取包列表失败: {e}")
            return []
    
    def get_python_info(self, python_path=None):
        """获取Python详细信息"""
        if python_path is None:
            python_path = self.python_path
        
        if not python_path:
            return None
        
        try:
            info = {}
            
            # 获取版本
            result = subprocess.run([python_path, '--version'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                info['version'] = result.stdout.strip()
            
            # 获取路径
            result = subprocess.run([python_path, '-c', 'import sys; print(sys.executable)'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                info['executable'] = result.stdout.strip()
            
            # 获取平台信息
            result = subprocess.run([python_path, '-c', 'import platform; print(platform.system())'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                info['platform'] = result.stdout.strip()
            
            return info
            
        except Exception as e:
            logger.error(f"获取Python信息失败: {e}")
            return None
    
    def check_python_compatibility(self, python_path=None):
        """检查Python兼容性"""
        if python_path is None:
            python_path = self.python_path
        
        if not python_path:
            return False
        
        try:
            # 检查基本模块
            modules_to_check = ['pip', 'setuptools', 'wheel', 'venv']
            
            for module in modules_to_check:
                result = subprocess.run([python_path, '-c', f'import {module}'], 
                                      capture_output=True, text=True, 
                                      shell=True, timeout=10)
                if result.returncode != 0:
                    logger.warning(f"模块 {module} 不可用")
                    return False
            
            logger.info("Python兼容性检查通过")
            return True
            
        except Exception as e:
            logger.error(f"Python兼容性检查失败: {e}")
            return False
    
    def upgrade_pip(self, python_path=None):
        """升级pip"""
        if python_path is None:
            python_path = self.python_path
        
        if not python_path:
            logger.error("Python路径未设置")
            return False
        
        try:
            logger.info("正在升级pip...")
            
            cmd = [python_path, '-m', 'pip', 'install', '--upgrade', 'pip']
            
            # 使用镜像
            if self.config.get('use_python_mirror'):
                mirror_url = self.config.get('pip_mirror_url', 'https://mirrors.aliyun.com/pypi/simple/')
                cmd.extend(['-i', mirror_url])
            
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=300)
            
            if result.returncode == 0:
                logger.info("pip升级完成")
                return True
            else:
                logger.error(f"pip升级失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"升级pip失败: {e}")
            return False
                       