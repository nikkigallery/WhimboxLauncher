import subprocess
import os
import requests
import sys
import logging
import winreg
import zipfile
import shutil
import time
from pathlib import Path

logger = logging.getLogger(__name__)

class PythonManager:
    def __init__(self, config=None):
        self.config = config or {}
        self.python_path = self._find_python_executable()
        self.conda_path = self._find_conda_executable()

    # ---------------------------
    # 路径/探测
    # ---------------------------
    def _find_python_executable(self):
        """查找Python可执行文件路径（新增更稳健的 /python 检测 & embed 结构支持）"""
        cwd = os.getcwd()
        python_dir = os.path.join(cwd, 'python')
        # embed/自带结构下常见可执行路径
        embed_candidates = [
            os.path.join(python_dir, 'python.exe'),
            os.path.join(python_dir, 'Scripts', 'python.exe'),
        ]

        possible_paths = [
            'python', 'python3', 'python.exe', 'python3.exe',
            r'C:\Python39\python.exe', r'C:\Python310\python.exe',
            r'C:\Python311\python.exe', r'C:\Python312\python.exe',
            r'C:\Program Files\Python39\python.exe', r'C:\Program Files\Python310\python.exe',
            r'C:\Program Files\Python311\python.exe', r'C:\Program Files\Python312\python.exe',
            *embed_candidates
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

        # 注册表
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
            'conda', 'conda.exe',
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
            # 64位
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

            # 32位
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

    # ---------------------------
    # 状态查询
    # ---------------------------
    def is_python_installed(self):
        return self.python_path is not None

    def is_conda_installed(self):
        return self.conda_path is not None

    def get_python_version(self):
        if not self.python_path:
            return None
        try:
            result = subprocess.run([self.python_path, '--version'],
                                    capture_output=True, text=True,
                                    shell=True, timeout=10)
            if result.returncode == 0:
                # 有些版本输出到 stderr
                out = result.stdout.strip() or result.stderr.strip()
                return out
        except Exception as e:
            logger.error(f"获取Python版本失败: {e}")
        return None

    def get_conda_version(self):
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

    # ---------------------------
    # 安装：改为下载 embed zip -> /python
    # ---------------------------
    def install_python(self, version=None, install_dir=None):
        """
        安装Python（按需求改为下载并解压 embed 版本到 /python）
        - 先用 1000ms 探测官方源是否可达，不行再用镜像
        - 临时文件下载到 /temp，完成后清理
        """
        # 目标版本固定为 3.12.8 embed（用户指定）
        # 保持函数签名兼容：可传 version/dir，但内部仍以 3.12.8 embed 为准
        embed_version = '3.12.8'
        version = embed_version if version is None else version
        # 如果用户传的不是 embed 版本，也仍使用 embed 路径（满足用户新需求）
        install_dir = install_dir or os.path.join(os.getcwd(), 'python')

        logger.info(f"开始安装Python (embed) {version} 到 {install_dir} ...")

        # 两个候选链接，按 1000ms 可达性测试来选择实际下载源
        candidates = [
            f"https://www.python.org/ftp/python/{embed_version}/python-{embed_version}-embed-amd64.zip",
            f"https://mirror.nju.edu.cn/python/{embed_version}/python-{embed_version}-embed-amd64.zip",
        ]

        chosen_url = None
        for url in candidates:
            if self._probe_url_fast(url, timeout_ms=1000):
                chosen_url = url
                logger.info(f"优先可达源：{url}")
                break
        if not chosen_url:
            # 如果 1000ms 内都不可达，仍然尝试第一个源下载（有时只是探测慢）
            chosen_url = candidates[0]
            logger.warning("两个源均未在1000ms内响应，仍将尝试首选源下载。")

        temp_dir = os.path.join(os.getcwd(), 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        zip_path = os.path.join(temp_dir, f"python-{embed_version}-embed-amd64.zip")

        try:
            if not self._download_file(chosen_url, zip_path, name=f"Python {embed_version} embed 包"):
                return False

            # 解压到 install_dir
            if os.path.exists(install_dir) and os.listdir(install_dir):
                logger.info(f"{install_dir} 已存在，覆盖写入 embed 文件。")
            os.makedirs(install_dir, exist_ok=True)

            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(install_dir)

            # 做 embed 的最小化可用配置
            self._prepare_embed_python(install_dir, version_hint=embed_version)

            # 再次查找 python.exe
            self.python_path = self._find_python_executable()
            if not self.python_path:
                logger.error("安装完成但未找到 python.exe")
                return False

            logger.info("Python embed 安装完成")
            return True

        except Exception as e:
            logger.error(f"安装Python失败: {e}")
            return False
        finally:
            # 清理临时文件
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                # 若 temp 为空则删除
                if os.path.isdir(temp_dir) and not os.listdir(temp_dir):
                    os.rmdir(temp_dir)
            except Exception as e:
                logger.debug(f"清理临时文件失败: {e}")

    def install_conda(self, install_dir=None):
        """安装Conda（维持原逻辑，但也改为 /temp 下载与清理）"""
        install_dir = install_dir or os.path.join(os.getcwd(), 'conda')
        logger.info("开始安装Conda...")

        conda_url = "https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe"
        temp_dir = os.path.join(os.getcwd(), 'temp')
        os.makedirs(temp_dir, exist_ok=True)
        installer_path = os.path.join(temp_dir, "conda_installer.exe")

        try:
            if not self._download_file(conda_url, installer_path, "Conda"):
                return False

            install_cmd = [installer_path, '/S', '/D=' + install_dir]
            logger.info("正在安装Conda...")
            result = subprocess.run(install_cmd, shell=True, timeout=600)

            try:
                if os.path.exists(installer_path):
                    os.remove(installer_path)
                if os.path.isdir(temp_dir) and not os.listdir(temp_dir):
                    os.rmdir(temp_dir)
            except Exception:
                pass

            if result.returncode == 0:
                self.conda_path = self._find_conda_executable()
                logger.info("Conda安装完成")
                return True
            else:
                logger.error(f"Conda安装失败，返回码: {result.returncode}")
                return False
        except Exception as e:
            logger.error(f"安装Conda失败: {e}")
            return False

    # ---------------------------
    # 下载/网络
    # ---------------------------
    def _probe_url_fast(self, url, timeout_ms=1000):
        """快速探测URL可达性（仅做源选择，避免长时间等待）"""
        try:
            resp = requests.head(url, timeout=timeout_ms / 1000.0, allow_redirects=True)
            return resp.status_code == 200
        except Exception:
            return False

    def _download_file(self, url, file_path, name="文件"):
        """下载文件（下载目录改为 /temp 由调用方传入），带进度日志"""
        try:
            logger.info(f"正在下载{name}... {url}")
            with requests.get(url, stream=True, timeout=30) as response:
                response.raise_for_status()
                total_size = int(response.headers.get('content-length', 0))
                downloaded = 0
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                with open(file_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=1024 * 512):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                progress = (downloaded / total_size) * 100
                                logger.info(f"下载进度: {progress:.1f}%")
            logger.info(f"{name}下载完成: {file_path}")
            return True
        except Exception as e:
            logger.error(f"下载{name}失败: {e}")
            return False

    # ---------------------------
    # embed Python 的最小配置与 pip 引导
    # ---------------------------
    def _prepare_embed_python(self, install_dir, version_hint='3.12.8'):
        """
        对 embed 包进行最小配置：
        - 确保 python.exe 存在
        - 确保 python312._pth 启用 `import site`
        - 创建 Scripts/ 目录并加入 ._pth
        - 尝试安装 pip：先 `-m ensurepip`，失败则使用 get-pip.py 兜底
        """
        py_exe = os.path.join(install_dir, 'python.exe')
        if not os.path.exists(py_exe):
            raise RuntimeError("embed 包缺少 python.exe")

        # 找到 python312._pth
        # 3.12 的文件名是 python312._pth，其他版本相应变化
        major_minor = "312"
        if version_hint:
            parts = version_hint.split(".")
            if len(parts) >= 2:
                try:
                    major_minor = f"{int(parts[0])}{int(parts[1]):02d}"
                except Exception:
                    major_minor = "312"
        pth_name = f"python{major_minor}._pth"
        pth_path = os.path.join(install_dir, pth_name)

        # 若 ._pth 不存在，创建一个最小版；若存在，确保包含 import site 与 Scripts
        lines = []
        if os.path.exists(pth_path):
            with open(pth_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = [ln.rstrip("\r\n") for ln in f.readlines()]
        else:
            # embed 默认会有 pythonXY.zip；我们追加 import site 与 Scripts
            lines = [f"python{major_minor}.zip"]

        # 确保有 import site
        if not any(ln.strip() == "import site" for ln in lines):
            lines.append("import site")
        # 确保 Scripts 作为路径（相对路径即可）
        scripts_rel = "Scripts"
        if not any(ln.strip() == scripts_rel for ln in lines):
            lines.insert(0, scripts_rel)

        with open(pth_path, 'w', encoding='utf-8') as f:
            for ln in lines:
                f.write(ln + "\n")

        # 确保 Scripts 目录存在
        scripts_dir = os.path.join(install_dir, 'Scripts')
        os.makedirs(scripts_dir, exist_ok=True)

        # 尝试安装 pip
        # 1) ensurepip（embed常常不带，但尝试一下）
        pip_ok = self._try_run([py_exe, "-m", "ensurepip", "--upgrade"], timeout=300)
        if not pip_ok:
            # 2) get-pip.py 兜底
            temp_dir = os.path.join(os.getcwd(), 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            get_pip = os.path.join(temp_dir, "get-pip.py")
            try:
                if self._download_file("https://bootstrap.pypa.io/get-pip.py", get_pip, name="get-pip.py"):
                    self._try_run([py_exe, get_pip, "--no-warn-script-location"], timeout=600)
            finally:
                try:
                    if os.path.exists(get_pip):
                        os.remove(get_pip)
                    if os.path.isdir(temp_dir) and not os.listdir(temp_dir):
                        os.rmdir(temp_dir)
                except Exception:
                    pass

    def _try_run(self, cmd, timeout=120):
        try:
            logger.info(f"执行命令: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=timeout)
            if result.returncode == 0:
                return True
            else:
                logger.warning(f"命令失败({result.returncode}): {result.stderr[:200]}")
                return False
        except Exception as e:
            logger.warning(f"命令执行异常: {e}")
            return False

    # ---------------------------
    # 其余保持不变（但兼容 embed 环境）
    # ---------------------------
    def get_installed_packages(self, python_path=None):
        """获取已安装的包列表"""
        python_path = python_path or self.python_path
        if not python_path:
            logger.error("Python路径未设置")
            return []
        try:
            result = subprocess.run([python_path, '-m', 'pip', 'list', '--format=json'],
                                    capture_output=True, text=True,
                                    shell=True, timeout=60)
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
        python_path = python_path or self.python_path
        if not python_path:
            return None
        try:
            info = {}
            result = subprocess.run([python_path, '--version'],
                                    capture_output=True, text=True,
                                    shell=True, timeout=10)
            if result.returncode == 0:
                info['version'] = (result.stdout or result.stderr).strip()

            result = subprocess.run([python_path, '-c', 'import sys; print(sys.executable)'],
                                    capture_output=True, text=True,
                                    shell=True, timeout=10)
            if result.returncode == 0:
                info['executable'] = result.stdout.strip()

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
        python_path = python_path or self.python_path
        if not python_path:
            return False
        try:
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
        python_path = python_path or self.python_path
        if not python_path:
            logger.error("Python路径未设置")
            return False
        try:
            logger.info("正在升级pip...")
            cmd = [python_path, '-m', 'pip', 'install', '--upgrade', 'pip']
            if self.config.get('use_python_mirror'):
                mirror_url = self.config.get('pip_mirror_url', 'https://mirrors.aliyun.com/pypi/simple/')
                cmd.extend(['-i', mirror_url])
            result = subprocess.run(cmd, capture_output=True, text=True, shell=True, timeout=600)
            if result.returncode == 0:
                logger.info("pip升级完成")
                return True
            else:
                logger.error(f"pip升级失败: {result.stderr}")
                return False
        except Exception as e:
            logger.error(f"升级pip失败: {e}")
            return False
