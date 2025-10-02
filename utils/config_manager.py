import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ConfigManager:
    def __init__(self, config_file: str = 'config/launcher_config.json'):
        self.config_file = config_file
        # 确保配置目录存在
        self._ensure_config_dir()
        self.config = self.load_config()
        
    def _ensure_config_dir(self):
        """确保配置目录存在"""
        try:
            config_dir = os.path.dirname(self.config_file)
            if config_dir and not os.path.exists(config_dir):
                os.makedirs(config_dir, exist_ok=True)
                logger.info(f"创建配置目录: {config_dir}")
        except Exception as e:
            logger.error(f"创建配置目录失败: {e}")
    
    def load_config(self) -> Dict[str, Any]:
        """加载配置文件"""
        try:
            if os.path.exists(self.config_file):
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    logger.info("配置文件加载成功")
                    return config
            else:
                logger.info("配置文件不存在，使用默认配置")
                default_config = self.get_default_config()
                self.save_config_to_file(default_config)
                return default_config
        except Exception as e:
            logger.error(f"加载配置文件失败: {e}")
            default_config = self.get_default_config()
            try:
                self.save_config_to_file(default_config)
            except:
                pass
            return default_config
    
    def save_config_to_file(self, config: Dict[str, Any]) -> bool:
        """保存配置到文件"""
        try:
            # 确保配置目录存在
            self._ensure_config_dir()
            
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            
            logger.info("配置文件保存成功")
            return True
        except Exception as e:
            logger.error(f"保存配置文件失败: {e}")
            return False
    
    def save_config(self) -> bool:
        """保存当前配置"""
        return self.save_config_to_file(self.config)
    
    def get_default_config(self) -> Dict[str, Any]:
        """获取默认配置"""
        return {
            "github_repo": "https://github.com/nikkigallery/Whimbox",
            "python_version": "3.12",
            "use_pip_update": True,
            "use_git_mirror": True,
            "use_python_mirror": True,
            "check_updates": True,
            "auto_start": True,
            "show_console": False,
            "git_mirror_url": "https://github.com.cnpmjs.org",
            "python_mirror_url": "https://mirrors.aliyun.com/pypi/simple/",
            "pip_mirror_url": "https://mirrors.aliyun.com/pypi/simple/",
            "launcher_github_repo": "https://github.com/nikkigallery/WhimboxLauncher",
            "first_run": True,
            "environment_configured": False,  # 环境是否已配置
            "last_run": None,
            "environment_settings": {
                "auto_create_venv": True,
                "venv_name": "venv",
                "use_conda": False,
                "conda_env_name": "conda_env"
            },
            "advanced_settings": {
                "download_timeout": 5000,
                "install_timeout": 6000,
                "max_retries": 3,
                "log_level": "INFO",
                "cleanup_temp_files": True
            },
            "ui_settings": {
                "theme": "infinity_nikki",
                "language": "zh-CN",
                "window_width": 1296,
                "window_height": 864,
                "remember_window_size": True
            }
        }
    
    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值"""
        keys = key.split('.')
        value = self.config
        
        for k in keys:
            if isinstance(value, dict) and k in value:
                value = value[k]
            else:
                return default
        
        return value
    
    def set(self, key: str, value: Any) -> bool:
        """设置配置值"""
        try:
            keys = key.split('.')
            config = self.config
            
            for k in keys[:-1]:
                if k not in config:
                    config[k] = {}
                config = config[k]
            
            config[keys[-1]] = value
            return True
        except Exception as e:
            logger.error(f"设置配置值失败: {e}")
            return False
    
    def update_config(self, new_config: Dict[str, Any]) -> bool:
        """更新配置"""
        try:
            self.config.update(new_config)
            return self.save_config()
        except Exception as e:
            logger.error(f"更新配置失败: {e}")
            return False
    
    def reset_config(self) -> bool:
        """重置配置为默认值"""
        try:
            self.config = self.get_default_config()
            return self.save_config()
        except Exception as e:
            logger.error(f"重置配置失败: {e}")
            return False
    
    def export_config(self, export_path: str) -> bool:
        """导出配置到文件"""
        try:
            with open(export_path, 'w', encoding='utf-8') as f:
                json.dump(self.config, f, indent=2, ensure_ascii=False)
            
            logger.info(f"配置已导出到: {export_path}")
            return True
        except Exception as e:
            logger.error(f"导出配置失败: {e}")
            return False
    
    def import_config(self, import_path: str) -> bool:
        """从文件导入配置"""
        try:
            with open(import_path, 'r', encoding='utf-8') as f:
                imported_config = json.load(f)
            
            # 验证导入的配置
            if self.validate_config(imported_config):
                self.config = imported_config
                return self.save_config()
            else:
                logger.error("导入的配置格式无效")
                return False
        except Exception as e:
            logger.error(f"导入配置失败: {e}")
            return False
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """验证配置格式"""
        try:
            # 检查必需的配置项
            required_keys = [
                'github_repo',
                'python_version',
                'use_pip_update',
                'use_git_mirror',
                'use_python_mirror',
                'check_updates'
            ]
            
            for key in required_keys:
                if key not in config:
                    logger.error(f"缺少必需的配置项: {key}")
                    return False
            
            # 检查Python版本格式
            python_version = config.get('python_version', '')
            if not self.validate_python_version(python_version):
                logger.error("Python版本格式无效")
                return False
            
            # 检查URL格式
            url_keys = ['git_mirror_url', 'python_mirror_url', 'pip_mirror_url']
            for key in url_keys:
                url = config.get(key, '')
                if url and not self.validate_url(url):
                    logger.error(f"URL格式无效: {key}")
                    return False
            
            return True
        except Exception as e:
            logger.error(f"验证配置失败: {e}")
            return False
    
    def validate_python_version(self, version: str) -> bool:
        """验证Python版本格式"""
        try:
            parts = version.split('.')
            if len(parts) < 2 or len(parts) > 3:
                return False
            
            for part in parts:
                if not part.isdigit():
                    return False
            
            return True
        except:
            return False
    
    def validate_url(self, url: str) -> bool:
        """验证URL格式"""
        try:
            return url.startswith(('http://', 'https://'))
        except:
            return False
    
    def get_environment_config(self) -> Dict[str, Any]:
        """获取环境配置"""
        return self.get('environment_settings', {})
    
    def get_advanced_config(self) -> Dict[str, Any]:
        """获取高级配置"""
        return self.get('advanced_settings', {})
    
    def get_ui_config(self) -> Dict[str, Any]:
        """获取UI配置"""
        return self.get('ui_settings', {})
    
    def set_environment_config(self, config: Dict[str, Any]) -> bool:
        """设置环境配置"""
        return self.set('environment_settings', config)
    
    def set_advanced_config(self, config: Dict[str, Any]) -> bool:
        """设置高级配置"""
        return self.set('advanced_settings', config)
    
    def set_ui_config(self, config: Dict[str, Any]) -> bool:
        """设置UI配置"""
        return self.set('ui_settings', config)
    
    def backup_config(self) -> bool:
        """备份配置"""
        try:
            backup_file = self.config_file.replace('.json', '_backup.json')
            return self.export_config(backup_file)
        except Exception as e:
            logger.error(f"备份配置失败: {e}")
            return False
    
    def restore_config(self) -> bool:
        """恢复配置"""
        try:
            backup_file = self.config_file.replace('.json', '_backup.json')
            if os.path.exists(backup_file):
                return self.import_config(backup_file)
            else:
                logger.error("未找到配置备份文件")
                return False
        except Exception as e:
            logger.error(f"恢复配置失败: {e}")
            return False
    
    def get_config_summary(self) -> Dict[str, Any]:
        """获取配置摘要"""
        try:
            return {
                'github_repo': self.get('github_repo'),
                'python_version': self.get('python_version'),
                'use_mirrors': {
                    'git': self.get('use_git_mirror'),
                    'python': self.get('use_python_mirror'),
                    'pip': self.get('use_pip_update')
                },
                'auto_settings': {
                    'check_updates': self.get('check_updates'),
                    'auto_start': self.get('auto_start')
                },
                'environment': self.get_environment_config(),
                'first_run': self.get('first_run', True),
                'environment_configured': self.get('environment_configured', False)
            }
        except Exception as e:
            logger.error(f"获取配置摘要失败: {e}")
            return {}
    
    def update_last_run(self) -> bool:
        """更新最后运行时间"""
        try:
            from datetime import datetime
            return self.set('last_run', datetime.now().isoformat())
        except Exception as e:
            logger.error(f"更新最后运行时间失败: {e}")
            return False
    
    def mark_first_run_completed(self) -> bool:
        """标记首次运行完成"""
        try:
            return self.set('first_run', False)
        except Exception as e:
            logger.error(f"标记首次运行完成失败: {e}")
            return False
    
    def mark_environment_configured(self) -> bool:
        """标记环境配置完成"""
        try:
            return self.set('environment_configured', True)
        except Exception as e:
            logger.error(f"标记环境配置完成失败: {e}")
            return False
    
    def is_first_run(self) -> bool:
        """检查是否为首次运行"""
        return self.get('first_run', True)
    
    def is_environment_configured(self) -> bool:
        """检查环境是否已配置"""
        return self.get('environment_configured', False)
    
    def cleanup_config(self) -> bool:
        """清理配置（删除无效或过期的配置项）"""
        try:
            # 获取默认配置的键
            default_config = self.get_default_config()
            default_keys = set(self._flatten_config(default_config).keys())
            
            # 获取当前配置的键
            current_keys = set(self._flatten_config(self.config).keys())
            
            # 找出需要删除的键
            keys_to_remove = current_keys - default_keys
            
            # 删除无效的键
            for key in keys_to_remove:
                self._remove_config_key(key)
            
            if keys_to_remove:
                logger.info(f"清理了 {len(keys_to_remove)} 个无效配置项")
                return self.save_config()
            else:
                logger.info("没有需要清理的配置项")
                return True
                
        except Exception as e:
            logger.error(f"清理配置失败: {e}")
            return False
    
    def _flatten_config(self, config: Dict[str, Any], parent_key: str = '') -> Dict[str, str]:
        """扁平化配置字典"""
        items = []
        for key, value in config.items():
            new_key = f"{parent_key}.{key}" if parent_key else key
            if isinstance(value, dict):
                items.extend(self._flatten_config(value, new_key).items())
            else:
                items.append((new_key, value))
        return dict(items)
    
    def _remove_config_key(self, key: str) -> bool:
        """删除配置键"""
        try:
            keys = key.split('.')
            config = self.config
            
            for k in keys[:-1]:
                if k in config:
                    config = config[k]
                else:
                    return False
            
            if keys[-1] in config:
                del config[keys[-1]]
                return True
            else:
                return False
        except Exception as e:
            logger.error(f"删除配置键失败: {e}")
            return False