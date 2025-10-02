import subprocess
import os
import requests
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class GitManager:
    def __init__(self, config=None):
        self.config = config or {}
        self.git_path = self._find_git_executable()
        
    def _find_git_executable(self):
        """查找Git可执行文件路径"""
        possible_paths = [
            'git',
            'git.exe',
            r'C:\Program Files\Git\bin\git.exe',
            r'C:\Program Files (x86)\Git\bin\git.exe',
            os.path.join(os.getcwd(), 'git', 'bin', 'git.exe'),
            os.path.join(os.getcwd(), 'git', 'cmd', 'git.exe')
        ]
        
        for path in possible_paths:
            try:
                result = subprocess.run([path, '--version'], 
                                      capture_output=True, text=True, 
                                      shell=True, timeout=5)
                if result.returncode == 0:
                    logger.info(f"找到Git: {path}")
                    return path
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue
        
        logger.warning("未找到Git可执行文件")
        return None
    
    def is_installed(self):
        """检查Git是否已安装"""
        return self.git_path is not None
    
    def get_version(self):
        """获取Git版本"""
        if not self.git_path:
            return None
        
        try:
            result = subprocess.run([self.git_path, '--version'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"获取Git版本失败: {e}")
        
        return None
    
    def install_git(self, install_dir=None):
        """安装Git"""
        if install_dir is None:
            install_dir = os.path.join(os.getcwd(), 'git')
        
        logger.info("开始安装Git...")
        
        # Git下载URL
        git_version = "2.41.0"
        git_url = f"https://github.com/git-for-windows/git/releases/download/v{git_version}.windows.1/Git-{git_version}-64-bit.exe"
        
        try:
            # 下载Git安装包
            installer_path = os.path.join(os.getcwd(), "git_installer.exe")
            
            if not self._download_file(git_url, installer_path, "Git"):
                return False
            
            # 静默安装Git
            install_cmd = [
                installer_path,
                '/VERYSILENT',
                '/NORESTART',
                '/NOCANCEL',
                '/SP-',
                '/CLOSEAPPLICATIONS',
                '/RESTARTAPPLICATIONS',
                '/DIR=' + install_dir
            ]
            
            logger.info("正在安装Git...")
            result = subprocess.run(install_cmd, shell=True, timeout=300)
            
            # 删除安装包
            try:
                os.remove(installer_path)
            except:
                pass
            
            if result.returncode == 0:
                # 重新查找Git路径
                self.git_path = self._find_git_executable()
                logger.info("Git安装完成")
                return True
            else:
                logger.error(f"Git安装失败，返回码: {result.returncode}")
                return False
                
        except Exception as e:
            logger.error(f"安装Git失败: {e}")
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
    
    def clone_repository(self, repo_url, target_dir='./app', branch=None):
        """克隆Git仓库，如果已存在则尝试拉取更新"""
        if not self.git_path:
            logger.error("Git未安装")
            return False

        try:
            # 确保目标目录的父目录存在
            os.makedirs(os.path.dirname(target_dir) if os.path.dirname(target_dir) else '.', exist_ok=True)

            # 规范化路径
            target_path = Path(target_dir).resolve()

            if target_path.exists():
                if self.is_git_repository(target_dir):
                    # 已存在且为 Git 仓库
                    logger.info(f"检测到已有Git仓库: {target_dir}")

                    # 获取当前远程URL
                    current_remote = self.get_remote_url(target_dir)
                    expected_repo_name = repo_url.rstrip('/').split('/')[-1].replace('.git', '')
                    current_remote_clean = current_remote.rstrip('/').split('/')[-1].replace('.git', '') if current_remote else None

                    # 判断是否是同一个仓库
                    if current_remote and (current_remote == repo_url or current_remote_clean == expected_repo_name):
                        logger.info("远程仓库匹配，正在执行 git pull...")

                        # 检出指定分支（如果提供）
                        if branch:
                            original_cwd = os.getcwd()
                            os.chdir(target_dir)

                            try:
                                # 先获取远程分支
                                result_fetch = subprocess.run(
                                    [self.git_path, 'fetch', 'origin'],
                                    capture_output=True, text=True, shell=True, timeout=300
                                )
                                if result_fetch.returncode != 0:
                                    logger.warning(f"fetch 失败: {result_fetch.stderr}")
                                    return False

                                # 切换到指定分支
                                result_checkout = subprocess.run(
                                    [self.git_path, 'checkout', branch],
                                    capture_output=True, text=True, shell=True, timeout=300
                                )
                                if result_checkout.returncode != 0:
                                    logger.error(f"切换分支失败: {result_checkout.stderr}")
                                    return False

                                logger.info(f"已切换到分支 '{branch}'")

                            finally:
                                os.chdir(original_cwd)

                        # 执行 pull
                        return self.pull_repository(target_dir)
                    else:
                        logger.warning(f"远程仓库不匹配，期望: {repo_url}, 实际: {current_remote}，将重新克隆")
                        # 删除旧仓库
                        import shutil
                        shutil.rmtree(target_path)
                        logger.info(f"旧仓库已删除: {target_path}")

                else:
                    logger.warning(f"{target_dir} 存在但不是Git仓库，正在清理...")
                    import shutil
                    shutil.rmtree(target_path)
                    logger.info(f"非Git目录已删除: {target_path}")

            # 执行克隆（首次克隆或清理后）
            logger.info(f"正在克隆仓库: {repo_url} 到 {target_dir}")

            clone_cmd = [self.git_path, 'clone']
            
            # 使用镜像（如果配置）
            if self.config.get('use_git_mirror'):
                mirror_url = self.config.get('git_mirror_url', 'https://github.com.cnpmjs.org')
                if repo_url.startswith('https://github.com/'):
                    repo_url = repo_url.replace('https://github.com/', mirror_url + '/')

            clone_cmd.extend([repo_url, str(target_path)])

            if branch:
                clone_cmd.extend(['--branch', branch])

            result = subprocess.run(
                clone_cmd,
                capture_output=True,
                text=True,
                shell=True,
                timeout=600
            )

            if result.returncode == 0:
                logger.info("仓库克隆完成")
                return True
            else:
                logger.error(f"仓库克隆失败: {result.stderr}")
                return False

        except Exception as e:
            logger.error(f"克隆仓库失败: {e}")
            return False
    
    def pull_repository(self, repo_dir='.'):
        """拉取仓库更新"""
        if not self.git_path:
            logger.error("Git未安装")
            return False
        
        try:
            # 切换到仓库目录
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            
            # 拉取更新
            pull_cmd = [self.git_path, 'pull']
            
            logger.info("正在拉取仓库更新...")
            
            result = subprocess.run(pull_cmd, 
                                  capture_output=True, 
                                  text=True, 
                                  shell=True, 
                                  timeout=300)
            
            # 恢复原始目录
            os.chdir(original_cwd)
            
            if result.returncode == 0:
                logger.info("仓库更新完成")
                return True
            else:
                logger.error(f"仓库更新失败: {result.stderr}")
                return False
                
        except Exception as e:
            logger.error(f"拉取仓库更新失败: {e}")
            return False
    
    def get_current_branch(self, repo_dir='.'):
        """获取当前分支"""
        if not self.git_path:
            return None
        
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            
            result = subprocess.run([self.git_path, 'branch', '--show-current'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            
            os.chdir(original_cwd)
            
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"获取当前分支失败: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"获取当前分支失败: {e}")
            return None
    
    def get_remote_url(self, repo_dir='.'):
        """获取远程仓库URL"""
        if not self.git_path:
            return None
        
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            
            result = subprocess.run([self.git_path, 'remote', 'get-url', 'origin'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            
            os.chdir(original_cwd)
            
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"获取远程URL失败: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"获取远程URL失败: {e}")
            return None
    
    def is_git_repository(self, repo_dir='.'):
        """检查是否为Git仓库"""
        git_dir = os.path.join(repo_dir, '.git')
        return os.path.exists(git_dir)
    
    def get_commit_hash(self, repo_dir='.'):
        """获取当前提交哈希"""
        if not self.git_path:
            return None
        
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            
            result = subprocess.run([self.git_path, 'rev-parse', 'HEAD'], 
                                  capture_output=True, text=True, 
                                  shell=True, timeout=10)
            
            os.chdir(original_cwd)
            
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"获取提交哈希失败: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"获取提交哈希失败: {e}")
            return None
    
    def configure_git(self, user_name=None, user_email=None):
        """配置Git用户信息"""
        if not self.git_path:
            logger.error("Git未安装")
            return False
        
        try:
            if user_name:
                result = subprocess.run([self.git_path, 'config', '--global', 'user.name', user_name], 
                                      capture_output=True, text=True, shell=True)
                if result.returncode != 0:
                    logger.error(f"设置Git用户名失败: {result.stderr}")
                    return False
            
            if user_email:
                result = subprocess.run([self.git_path, 'config', '--global', 'user.email', user_email], 
                                      capture_output=True, text=True, shell=True)
                if result.returncode != 0:
                    logger.error(f"设置Git邮箱失败: {result.stderr}")
                    return False
            
            logger.info("Git配置完成")
            return True
            
        except Exception as e:
            logger.error(f"配置Git失败: {e}")
            return False