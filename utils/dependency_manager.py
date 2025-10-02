import subprocess
import os
import re
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

class DependencyManager:
    def __init__(self, python_manager=None, config=None):
        self.python_manager = python_manager
        self.config = config or {}
        self.special_packages = {
            'torch': self._install_torch,
            'tensorflow': self._install_tensorflow,
            'pytorch': self._install_torch,
            'cuda': self._install_cuda_support,
            'cupy': self._install_cupy,
            'opencv-python': self._install_opencv,
            'pygame': self._install_pygame,
            'pandas': self._install_pandas,
            'numpy': self._install_numpy,
            'scipy': self._install_scipy,
            'matplotlib': self._install_matplotlib,
            'scikit-learn': self._install_scikit_learn,
            'jupyter': self._install_jupyter,
            'django': self._install_django,
            'flask': self._install_flask,
            'fastapi': self._install_fastapi,
            'streamlit': self._install_streamlit,
        }
    
    def install_from_requirements(self, requirements_file=None, python_path=None):
        """
        从requirements.txt文件安装依赖
        - 默认在 ./app 目录下查找 requirements.txt
        - 可通过参数指定其他路径
        - 使用指定的 Python 环境（python_path）进行安装
        """

        logger = logging.getLogger(__name__)

        if python_path is None:
            python_path = self.python_manager.python_path if self.python_manager else None

        if not python_path:
            logger.error("Python路径未设置")
            return False

        # 默认使用 ./app/requirements.txt
        if requirements_file is None:
            requirements_file = './app/requirements.txt'

        # 转为绝对路径或确保路径正确
        requirements_file = os.path.abspath(requirements_file)

        if not os.path.exists(requirements_file):
            logger.warning(f"requirements.txt 文件不存在: {requirements_file}")
            return False  # 建议设为 False，因为明确指定了却找不到

        try:
            logger.info(f"正在从 {requirements_file} 安装依赖...")

            with open(requirements_file, 'r', encoding='utf-8') as f:
                requirements = f.readlines()

            # 清理依赖项：去除注释、空行和空白字符
            cleaned_requirements = []
            for req in requirements:
                req = req.strip()
                if req and not req.startswith('#'):
                    cleaned_requirements.append(req)

            if not cleaned_requirements:
                logger.info("requirements.txt 为空，跳过依赖安装")
                return True

            # 升级 pip（可选）
            if self.config.get('use_pip_update', True):
                if not self._upgrade_pip(python_path):
                    logger.warning("pip 升级失败，继续安装依赖")

            # 安装每个包
            success_count = 0
            failed_packages = []

            for requirement in cleaned_requirements:
                if self._install_package(requirement, python_path):
                    success_count += 1
                else:
                    failed_packages.append(requirement)

            logger.info(f"依赖安装完成: 成功 {success_count} 个，失败 {len(failed_packages)} 个")

            if failed_packages:
                logger.error(f"安装失败的包: {', '.join(failed_packages)}")
                return False

            return True

        except Exception as e:
            logger.error(f"从 requirements.txt 安装依赖失败: {e}")
            return False
    
    def install_package(self, package_name, python_path=None):
        """安装单个包"""
        if python_path is None:
            python_path = self.python_manager.python_path if self.python_manager else None
        
        if not python_path:
            logger.error("Python路径未设置")
            return False
        
        return self._install_package(package_name, python_path)
    
    def _install_package(self, package_name, python_path):
        """安装包的内部方法"""
        try:
            logger.info(f"正在安装包: {package_name}")
            
            # 检查是否为特殊包
            for special_pkg, installer in self.special_packages.items():
                if special_pkg.lower() in package_name.lower():
                    logger.info(f"检测到特殊包 {special_pkg}，使用特殊安装方法")
                    return installer(package_name, python_path)
            
            # 标准安装
            cmd = [python_path, '-m', 'pip', 'install', package_name]
            
            # 使用镜像
            if self.config.get('use_python_mirror', True):
                mirror_url = self.config.get('pip_mirror_url', 'https://mirrors.aliyun.com/pypi/simple/')
                cmd.extend(['-i', mirror_url])
            
            # 添加超时和重试机制
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    result = subprocess.run(cmd, 
                                          capture_output=True, 
                                          text=True, 
                                          shell=True, 
                                          timeout=300)
                    
                    if result.returncode == 0:
                        logger.info(f"包 {package_name} 安装成功")
                        return True
                    else:
                        logger.warning(f"包 {package_name} 安装失败 (尝试 {attempt + 1}/{max_retries}): {result.stderr}")
                        if attempt == max_retries - 1:
                            break
                        continue
                        
                except subprocess.TimeoutExpired:
                    logger.warning(f"包 {package_name} 安装超时 (尝试 {attempt + 1}/{max_retries})")
                    if attempt == max_retries - 1:
                        break
                    continue
            
            logger.error(f"包 {package_name} 安装失败")
            return False
            
        except Exception as e:
            logger.error(f"安装包 {package_name} 时发生错误: {e}")
            return False
    
    def _upgrade_pip(self, python_path):
        """升级pip"""
        try:
            logger.info("正在升级pip...")
            
            cmd = [python_path, '-m', 'pip', 'install', '--upgrade', 'pip']
            
            # 使用镜像
            if self.config.get('use_python_mirror', True):
                mirror_url = self.config.get('pip_mirror_url', 'https://mirrors.aliyun.com/pypi/simple/')
                cmd.extend(['-i', mirror_url])
            
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=300)
            
            if result.returncode == 0:
                logger.info("pip升级成功")
                return True
            else:
                logger.error(f"pip升级失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"升级pip时发生错误: {e}")
            return False
    
    def _install_torch(self, package_name, python_path):
        """安装PyTorch"""
        try:
            logger.info("正在安装PyTorch...")
            
            # 检查CUDA支持
            cuda_version = self._check_cuda_support()
            
            if cuda_version:
                logger.info(f"检测到CUDA {cuda_version}，安装CUDA版本的PyTorch")
                # 使用CUDA版本的PyTorch
                torch_cmd = [python_path, '-m', 'pip', 'install', 
                           'torch', 'torchvision', 'torchaudio', 
                           f'--index-url', f'https://download.pytorch.org/whl/cu{cuda_version}']
            else:
                logger.info("未检测到CUDA，安装CPU版本的PyTorch")
                # 使用CPU版本的PyTorch
                torch_cmd = [python_path, '-m', 'pip', 'install', 
                           'torch', 'torchvision', 'torchaudio']
            
            # 使用镜像
            if self.config.get('use_python_mirror', True):
                mirror_url = self.config.get('pip_mirror_url', 'https://mirrors.aliyun.com/pypi/simple/')
                torch_cmd.extend(['-i', mirror_url])
            
            result = subprocess.run(torch_cmd, capture_output=True, text=True, shell=True, timeout=600)
            
            if result.returncode == 0:
                logger.info("PyTorch安装成功")
                return True
            else:
                logger.error(f"PyTorch安装失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"安装PyTorch时发生错误: {e}")
            return False
    
    def _install_tensorflow(self, package_name, python_path):
        """安装TensorFlow"""
        try:
            logger.info("正在安装TensorFlow...")
            
            # 检查CUDA支持
            cuda_version = self._check_cuda_support()
            
            if cuda_version and cuda_version >= '11':
                logger.info(f"检测到CUDA {cuda_version}，安装GPU版本的TensorFlow")
                tf_package = 'tensorflow-gpu'
            else:
                logger.info("安装CPU版本的TensorFlow")
                tf_package = 'tensorflow'
            
            cmd = [python_path, '-m', 'pip', 'install', tf_package]
            
            # 使用镜像
            if self.config.get('use_python_mirror', True):
                mirror_url = self.config.get('pip_mirror_url', 'https://mirrors.aliyun.com/pypi/simple/')
                cmd.extend(['-i', mirror_url])
            
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=600)
            
            if result.returncode == 0:
                logger.info("TensorFlow安装成功")
                return True
            else:
                logger.error(f"TensorFlow安装失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"安装TensorFlow时发生错误: {e}")
            return False
    
    def _install_cuda_support(self, package_name, python_path):
        """安装CUDA支持"""
        try:
            logger.info("正在检查CUDA支持...")
            
            cuda_version = self._check_cuda_support()
            if not cuda_version:
                logger.info("未检测到CUDA，跳过CUDA支持安装")
                return True
            
            logger.info(f"检测到CUDA {cuda_version}，安装相关支持包...")
            
            # 安装CUDA工具包（如果需要）
            cuda_packages = []
            
            if cuda_version == '11':
                cuda_packages.extend(['cupy-cuda11x', 'pynvml'])
            elif cuda_version == '12':
                cuda_packages.extend(['cupy-cuda12x', 'pynvml'])
            
            success = True
            for package in cuda_packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装CUDA支持时发生错误: {e}")
            return False
    
    def _install_cupy(self, package_name, python_path):
        """安装CuPy"""
        try:
            logger.info("正在安装CuPy...")
            
            # 检查CUDA版本
            cuda_version = self._check_cuda_support()
            
            if cuda_version:
                cupy_package = f'cupy-cuda{cuda_version}x'
            else:
                cupy_package = 'cupy'
            
            return self._install_package(cupy_package, python_path)
            
        except Exception as e:
            logger.error(f"安装CuPy时发生错误: {e}")
            return False
    
    def _install_opencv(self, package_name, python_path):
        """安装OpenCV"""
        try:
            logger.info("正在安装OpenCV...")
            
            # 安装OpenCV主包
            if not self._install_package('opencv-python', python_path):
                return False
            
            # 可选：安装contrib包
            if 'contrib' in package_name.lower():
                return self._install_package('opencv-contrib-python', python_path)
            
            return True
            
        except Exception as e:
            logger.error(f"安装OpenCV时发生错误: {e}")
            return False
    
    def _install_pygame(self, package_name, python_path):
        """安装PyGame"""
        try:
            logger.info("正在安装PyGame...")
            return self._install_package('pygame', python_path)
            
        except Exception as e:
            logger.error(f"安装PyGame时发生错误: {e}")
            return False
    
    def _install_pandas(self, package_name, python_path):
        """安装Pandas"""
        try:
            logger.info("正在安装Pandas...")
            
            # 安装pandas及其常用依赖
            packages = ['pandas', 'numpy', 'openpyxl', 'xlrd']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装Pandas时发生错误: {e}")
            return False
    
    def _install_numpy(self, package_name, python_path):
        """安装NumPy"""
        try:
            logger.info("正在安装NumPy...")
            return self._install_package('numpy', python_path)
            
        except Exception as e:
            logger.error(f"安装NumPy时发生错误: {e}")
            return False
    
    def _install_scipy(self, package_name, python_path):
        """安装SciPy"""
        try:
            logger.info("正在安装SciPy...")
            
            # 安装scipy及其依赖
            packages = ['scipy', 'numpy']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装SciPy时发生错误: {e}")
            return False
    
    def _install_matplotlib(self, package_name, python_path):
        """安装Matplotlib"""
        try:
            logger.info("正在安装Matplotlib...")
            
            # 安装matplotlib及其依赖
            packages = ['matplotlib', 'numpy', 'pillow']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装Matplotlib时发生错误: {e}")
            return False
    
    def _install_scikit_learn(self, package_name, python_path):
        """安装Scikit-learn"""
        try:
            logger.info("正在安装Scikit-learn...")
            
            # 安装scikit-learn及其依赖
            packages = ['scikit-learn', 'numpy', 'scipy', 'matplotlib']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装Scikit-learn时发生错误: {e}")
            return False
    
    def _install_jupyter(self, package_name, python_path):
        """安装Jupyter"""
        try:
            logger.info("正在安装Jupyter...")
            
            # 安装Jupyter及其组件
            packages = ['jupyter', 'jupyterlab', 'notebook', 'ipykernel']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装Jupyter时发生错误: {e}")
            return False
    
    def _install_django(self, package_name, python_path):
        """安装Django"""
        try:
            logger.info("正在安装Django...")
            
            # 安装Django及其常用扩展
            packages = ['django', 'djangorestframework', 'django-cors-headers']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装Django时发生错误: {e}")
            return False
    
    def _install_flask(self, package_name, python_path):
        """安装Flask"""
        try:
            logger.info("正在安装Flask...")
            
            # 安装Flask及其常用扩展
            packages = ['flask', 'flask-sqlalchemy', 'flask-login', 'flask-wtf']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装Flask时发生错误: {e}")
            return False
    
    def _install_fastapi(self, package_name, python_path):
        """安装FastAPI"""
        try:
            logger.info("正在安装FastAPI...")
            
            # 安装FastAPI及其依赖
            packages = ['fastapi', 'uvicorn[standard]', 'pydantic']
            
            success = True
            for package in packages:
                if not self._install_package(package, python_path):
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"安装FastAPI时发生错误: {e}")
            return False
    
    def _install_streamlit(self, package_name, python_path):
        """安装Streamlit"""
        try:
            logger.info("正在安装Streamlit...")
            return self._install_package('streamlit', python_path)
            
        except Exception as e:
            logger.error(f"安装Streamlit时发生错误: {e}")
            return False
    
    def _check_cuda_support(self):
        """检查CUDA支持"""
        try:
            # 检查nvidia-smi是否可用
            result = subprocess.run(['nvidia-smi'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            
            if result.returncode == 0:
                # 解析CUDA版本
                cuda_match = re.search(r'CUDA Version:\s*(\d+\.\d+)', result.stdout)
                if cuda_match:
                    cuda_version = cuda_match.group(1)
                    major_version = cuda_version.split('.')[0]
                    logger.info(f"检测到CUDA版本: {cuda_version}")
                    return major_version
            
            logger.info("未检测到CUDA支持")
            return None
            
        except Exception as e:
            logger.warning(f"检查CUDA支持时发生错误: {e}")
            return None
    
    def check_package_conflicts(self, python_path=None):
        """检查包冲突"""
        if python_path is None:
            python_path = self.python_manager.python_path if self.python_manager else None
        
        if not python_path:
            logger.error("Python路径未设置")
            return []
        
        try:
            logger.info("正在检查包冲突...")
            
            # 获取已安装的包列表
            result = subprocess.run([python_path, '-m', 'pip', 'list'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=30)
            
            if result.returncode != 0:
                logger.error("获取包列表失败")
                return []
            
            # 解析包列表
            packages = {}
            for line in result.stdout.split('\n')[2:]:  # 跳过标题行
                if line.strip():
                    parts = line.split()
                    if len(parts) >= 2:
                        package_name = parts[0].lower()
                        package_version = parts[1]
                        packages[package_name] = package_version
            
            # 检查常见冲突
            conflicts = []
            conflict_rules = {
                'tensorflow': ['tensorflow-gpu'],
                'tensorflow-gpu': ['tensorflow'],
                'opencv-python': ['opencv-contrib-python'],
                'opencv-contrib-python': ['opencv-python'],
            }
            
            for package, conflicts_with in conflict_rules.items():
                if package in packages:
                    for conflict in conflicts_with:
                        if conflict in packages:
                            conflicts.append({
                                'package': package,
                                'version': packages[package],
                                'conflicts_with': conflict,
                                'conflict_version': packages[conflict]
                            })
            
            return conflicts
            
        except Exception as e:
            logger.error(f"检查包冲突时发生错误: {e}")
            return []
    
    def fix_package_conflicts(self, conflicts, python_path=None):
        """修复包冲突"""
        if python_path is None:
            python_path = self.python_manager.python_path if self.python_manager else None
        
        if not python_path:
            logger.error("Python路径未设置")
            return False
        
        try:
            logger.info("正在修复包冲突...")
            
            success = True
            for conflict in conflicts:
                package = conflict['package']
                conflict_with = conflict['conflicts_with']
                
                # 卸载冲突的包
                logger.info(f"卸载冲突包: {conflict_with}")
                uninstall_cmd = [python_path, '-m', 'pip', 'uninstall', '-y', conflict_with]
                result = subprocess.run(uninstall_cmd, capture_output=True, text=True, shell=True, timeout=60)
                
                if result.returncode != 0:
                    logger.error(f"卸载包 {conflict_with} 失败: {result.stderr}")
                    success = False
            
            return success
            
        except Exception as e:
            logger.error(f"修复包冲突时发生错误: {e}")
            return False