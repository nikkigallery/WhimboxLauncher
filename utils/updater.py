import os
import sys
import json
import requests
import subprocess
import tempfile
import shutil
import zipfile
import logging
from pathlib import Path
from datetime import datetime
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

class Updater:
    def __init__(self, config=None):
        self.config = config or {}
        self.github_repo = self.config.get('launcher_github_repo', 'your-username/python-launcher')
        self.current_version = self._get_current_version()
        self.temp_dir = tempfile.gettempdir()
        
    def _get_current_version(self):
        """获取当前版本"""
        try:
            version_file = 'static/version.json'
            if os.path.exists(version_file):
                with open(version_file, 'r', encoding='utf-8') as f:
                    version_data = json.load(f)
                    return version_data.get('version', '1.0.0')
            else:
                return '1.0.0'
        except Exception as e:
            logger.error(f"获取当前版本失败: {e}")
            return '1.0.0'
    
    def _save_current_version(self, version):
        """保存当前版本"""
        try:
            os.makedirs('config', exist_ok=True)
            version_file = 'static/version.json'
            version_data = {
                'version': version,
                'last_updated': datetime.now().isoformat()
            }
            
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(version_data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"版本信息已保存: {version}")
            return True
            
        except Exception as e:
            logger.error(f"保存版本信息失败: {e}")
            return False
    
    def check_for_updates(self) -> Tuple[bool, Optional[Dict]]:
        """检查更新"""
        try:
            logger.info("正在检查启动器更新...")
            
            # 获取GitHub releases
            api_url = f"https://api.github.com/repos/{self.github_repo}/releases/latest"
            
            response = requests.get(api_url, timeout=30)
            response.raise_for_status()
            
            release_info = response.json()
            latest_version = release_info.get('tag_name', 'v1.0.0').lstrip('v')
            
            # 比较版本
            if self._compare_versions(latest_version, self.current_version) > 0:
                logger.info(f"发现新版本: {latest_version} (当前版本: {self.current_version})")
                
                # 获取下载链接
                download_url = None
                for asset in release_info.get('assets', []):
                    if asset.get('name', '').endswith('.zip'):
                        download_url = asset.get('browser_download_url')
                        break
                
                if download_url:
                    update_info = {
                        'version': latest_version,
                        'download_url': download_url,
                        'release_notes': release_info.get('body', ''),
                        'published_at': release_info.get('published_at', '')
                    }
                    return True, update_info
                else:
                    logger.warning("未找到可用的下载链接")
                    return False, None
            else:
                logger.info("启动器已是最新版本")
                return False, None
                
        except Exception as e:
            logger.error(f"检查更新失败: {e}")
            return False, None
    
    def _compare_versions(self, version1: str, version2: str) -> int:
        """比较版本号"""
        def normalize_version(v):
            return [int(x) for x in v.split('.')]
        
        v1_parts = normalize_version(version1)
        v2_parts = normalize_version(version2)
        
        # 补齐长度
        max_len = max(len(v1_parts), len(v2_parts))
        v1_parts.extend([0] * (max_len - len(v1_parts)))
        v2_parts.extend([0] * (max_len - len(v2_parts)))
        
        for i in range(max_len):
            if v1_parts[i] > v2_parts[i]:
                return 1
            elif v1_parts[i] < v2_parts[i]:
                return -1
        
        return 0
    
    def download_update(self, download_url: str, progress_callback=None) -> Optional[str]:
        """下载更新"""
        try:
            logger.info("正在下载更新...")
            
            # 创建临时文件
            temp_file = os.path.join(self.temp_dir, 'launcher_update.zip')
            
            # 下载文件
            response = requests.get(download_url, stream=True, timeout=60)
            response.raise_for_status()
            
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(temp_file, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        
                        if progress_callback and total_size > 0:
                            progress = (downloaded / total_size) * 100
                            progress_callback(progress, f"正在下载更新... {int(progress)}%")
            
            logger.info("更新下载完成")
            return temp_file
            
        except Exception as e:
            logger.error(f"下载更新失败: {e}")
            return None
    
    def install_update(self, update_file: str, progress_callback=None) -> bool:
        """安装更新"""
        try:
            logger.info("正在安装更新...")
            
            if progress_callback:
                progress_callback(10, "准备安装更新...")
            
            # 创建临时目录
            temp_extract_dir = os.path.join(self.temp_dir, 'launcher_update_extract')
            os.makedirs(temp_extract_dir, exist_ok=True)
            
            # 解压更新文件
            if progress_callback:
                progress_callback(20, "正在解压更新文件...")
            
            with zipfile.ZipFile(update_file, 'r') as zip_ref:
                zip_ref.extractall(temp_extract_dir)
            
            # 获取当前程序路径
            current_exe = sys.executable
            current_dir = os.path.dirname(current_exe)
            
            if progress_callback:
                progress_callback(40, "正在备份当前版本...")
            
            # 备份当前版本
            backup_dir = os.path.join(current_dir, 'backup')
            if os.path.exists(backup_dir):
                shutil.rmtree(backup_dir)
            
            shutil.copytree(current_dir, backup_dir)
            
            if progress_callback:
                progress_callback(60, "正在安装新版本...")
            
            # 复制新文件
            update_files = []
            for root, dirs, files in os.walk(temp_extract_dir):
                for file in files:
                    src_path = os.path.join(root, file)
                    rel_path = os.path.relpath(src_path, temp_extract_dir)
                    dst_path = os.path.join(current_dir, rel_path)
                    
                    # 创建目标目录
                    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
                    
                    # 复制文件
                    shutil.copy2(src_path, dst_path)
                    update_files.append(rel_path)
            
            if progress_callback:
                progress_callback(90, "正在清理临时文件...")
            
            # 清理临时文件
            try:
                os.remove(update_file)
                shutil.rmtree(temp_extract_dir)
            except:
                pass
            
            if progress_callback:
                progress_callback(100, "更新安装完成")
            
            logger.info("更新安装完成")
            return True
            
        except Exception as e:
            logger.error(f"安装更新失败: {e}")
            return False
    
    def perform_update(self, progress_callback=None) -> bool:
        """执行完整更新流程"""
        try:
            # 检查更新
            has_update, update_info = self.check_for_updates()
            
            if not has_update:
                if progress_callback:
                    progress_callback(100, "启动器已是最新版本")
                return True
            
            # 下载更新
            download_url = update_info['download_url']
            update_file = self.download_update(download_url, progress_callback)
            
            if not update_file:
                return False
            
            # 安装更新
            success = self.install_update(update_file, progress_callback)
            
            if success:
                # 更新版本信息
                self._save_current_version(update_info['version'])
                logger.info(f"启动器已更新到版本: {update_info['version']}")
                return True
            else:
                return False
                
        except Exception as e:
            logger.error(f"执行更新失败: {e}")
            return False
    
    def rollback_update(self) -> bool:
        """回滚更新"""
        try:
            logger.info("正在回滚更新...")
            
            current_dir = os.path.dirname(sys.executable)
            backup_dir = os.path.join(current_dir, 'backup')
            
            if not os.path.exists(backup_dir):
                logger.error("未找到备份文件")
                return False
            
            # 恢复备份
            for item in os.listdir(backup_dir):
                src_path = os.path.join(backup_dir, item)
                dst_path = os.path.join(current_dir, item)
                
                if os.path.exists(dst_path):
                    if os.path.isdir(dst_path):
                        shutil.rmtree(dst_path)
                    else:
                        os.remove(dst_path)
                
                if os.path.isdir(src_path):
                    shutil.copytree(src_path, dst_path)
                else:
                    shutil.copy2(src_path, dst_path)
            
            # 删除备份
            shutil.rmtree(backup_dir)
            
            logger.info("更新回滚完成")
            return True
            
        except Exception as e:
            logger.error(f"回滚更新失败: {e}")
            return False
    
    def create_update_package(self, source_dir: str, output_dir: str, version: str) -> bool:
        """创建更新包"""
        try:
            logger.info(f"正在创建更新包版本: {version}")
            
            # 创建输出目录
            os.makedirs(output_dir, exist_ok=True)
            
            # 创建临时目录
            temp_dir = os.path.join(self.temp_dir, 'launcher_package')
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            os.makedirs(temp_dir)
            
            # 复制文件
            exclude_files = ['.git', '__pycache__', '*.pyc', '.DS_Store', 'backup']
            exclude_dirs = ['backup', '__pycache__', '.git']
            
            for item in os.listdir(source_dir):
                src_path = os.path.join(source_dir, item)
                
                # 跳过排除的文件和目录
                if any(excluded in item for excluded in exclude_files):
                    continue
                if any(excluded == item for excluded in exclude_dirs):
                    continue
                
                dst_path = os.path.join(temp_dir, item)
                
                if os.path.isdir(src_path):
                    shutil.copytree(src_path, dst_path, 
                                  ignore=shutil.ignore_patterns(*exclude_files))
                else:
                    shutil.copy2(src_path, dst_path)
            
            # 创建版本文件
            version_file = os.path.join(temp_dir, 'config', 'version.json')
            os.makedirs(os.path.dirname(version_file), exist_ok=True)
            
            version_data = {
                'version': version,
                'build_date': datetime.now().isoformat(),
                'build_info': {
                    'platform': sys.platform,
                    'python_version': sys.version,
                    'build_user': os.getenv('USERNAME', 'unknown')
                }
            }
            
            with open(version_file, 'w', encoding='utf-8') as f:
                json.dump(version_data, f, indent=2, ensure_ascii=False)
            
            # 创建zip文件
            output_file = os.path.join(output_dir, f'launcher_v{version}.zip')
            
            with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, temp_dir)
                        zipf.write(file_path, arcname)
            
            # 清理临时目录
            shutil.rmtree(temp_dir)
            
            logger.info(f"更新包创建完成: {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"创建更新包失败: {e}")
            return False
    
    def get_update_history(self) -> list:
        """获取更新历史"""
        try:
            history_file = 'static/update_history.json'
            
            if os.path.exists(history_file):
                with open(history_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            else:
                return []
                
        except Exception as e:
            logger.error(f"获取更新历史失败: {e}")
            return []
    
    def add_update_history(self, version: str, action: str, success: bool = True):
        """添加更新历史记录"""
        try:
            history = self.get_update_history()
            
            history_record = {
                'version': version,
                'action': action,
                'success': success,
                'timestamp': datetime.now().isoformat()
            }
            
            history.append(history_record)
            
            # 限制历史记录数量
            if len(history) > 50:
                history = history[-50:]
            
            # 保存历史记录
            os.makedirs('config', exist_ok=True)
            history_file = 'static/update_history.json'
            
            with open(history_file, 'w', encoding='utf-8') as f:
                json.dump(history, f, indent=2, ensure_ascii=False)
                
        except Exception as e:
            logger.error(f"添加更新历史失败: {e}")
    
    def cleanup_old_backups(self, keep_count: int = 3):
        """清理旧备份"""
        try:
            current_dir = os.path.dirname(sys.executable)
            backup_dir = os.path.join(current_dir, 'backup')
            
            if not os.path.exists(backup_dir):
                return
            
            # 获取备份目录列表
            backup_dirs = []
            for item in os.listdir(current_dir):
                if item.startswith('backup_') and os.path.isdir(os.path.join(current_dir, item)):
                    backup_dirs.append(item)
            
            # 按时间排序
            backup_dirs.sort(reverse=True)
            
            # 删除旧备份
            for backup_dir_name in backup_dirs[keep_count:]:
                backup_path = os.path.join(current_dir, backup_dir_name)
                try:
                    shutil.rmtree(backup_path)
                    logger.info(f"已删除旧备份: {backup_dir_name}")
                except Exception as e:
                    logger.error(f"删除备份失败: {backup_dir_name}, 错误: {e}")
                    
        except Exception as e:
            logger.error(f"清理旧备份失败: {e}")
    
    def verify_update_integrity(self, update_file: str) -> bool:
        """验证更新文件完整性"""
        try:
            logger.info("正在验证更新文件完整性...")
            
            # 检查文件是否存在
            if not os.path.exists(update_file):
                logger.error("更新文件不存在")
                return False
            
            # 检查文件大小
            file_size = os.path.getsize(update_file)
            if file_size < 1024:  # 小于1KB可能有问题
                logger.error("更新文件大小异常")
                return False
            
            # 尝试解压文件
            try:
                with zipfile.ZipFile(update_file, 'r') as zip_ref:
                    # 检查zip文件是否有效
                    zip_ref.testzip()
                    
                    # 检查必要文件
                    required_files = ['launcher.py', 'static/index.html']
                    for required_file in required_files:
                        try:
                            zip_ref.getinfo(required_file)
                        except KeyError:
                            logger.error(f"更新文件中缺少必要文件: {required_file}")
                            return False
                
                logger.info("更新文件完整性验证通过")
                return True
                
            except zipfile.BadZipFile:
                logger.error("更新文件不是有效的zip文件")
                return False
                
        except Exception as e:
            logger.error(f"验证更新文件完整性失败: {e}")
            return False