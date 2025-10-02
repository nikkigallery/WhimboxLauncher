# 工具模块详细文档

本文档详细介绍了Python项目启动器中各个工具模块的API和使用方法。

## 配置管理器 (config_manager.py)

### 类：ConfigManager

负责管理启动器的配置信息。

#### 主要方法

- `__init__()` - 初始化配置管理器
- `load_config()` - 从配置文件加载配置
- `save_config()` - 保存配置到配置文件
- `update_config(config)` - 更新配置
- `is_first_run()` - 检查是否首次运行
- `mark_first_run_completed()` - 标记首次运行已完成
- `is_environment_configured()` - 检查环境是否已配置
- `mark_environment_configured()` - 标记环境已配置
- `update_last_run()` - 更新最后运行时间

#### 使用示例

```python
config_manager = ConfigManager()
config = config_manager.config
config_manager.update_config({"github_repo": "https://github.com/user/repo"})
config_manager.save_config()
```

## Git管理器 (git_manager.py)

### 类：GitManager

处理Git相关操作。

#### 主要方法

- `__init__(config)` - 初始化Git管理器
- `is_installed()` - 检查Git是否已安装
- `install_git()` - 安装Git
- `clone_repository(repo_url)` - 克隆仓库
- `update_repository()` - 更新仓库

#### 使用示例

```python
git_manager = GitManager(config)
if not git_manager.is_installed():
    git_manager.install_git()
git_manager.clone_repository("https://github.com/user/repo")
```

## Python管理器 (python_manager.py)

### 类：PythonManager

管理Python环境。

#### 主要方法

- `__init__(config)` - 初始化Python管理器
- `is_python_installed()` - 检查Python是否已安装
- `install_python(version)` - 安装指定版本的Python
- `get_python_path()` - 获取Python路径

#### 使用示例

```python
python_manager = PythonManager(config)
if not python_manager.is_python_installed():
    python_manager.install_python("3.9")
python_path = python_manager.python_path
```

## 虚拟环境管理器 (virtual_env_manager.py)

### 类：VirtualEnvManager

处理Python虚拟环境。

#### 主要方法

- `__init__(python_manager, config)` - 初始化虚拟环境管理器
- `detect_virtual_envs()` - 检测现有虚拟环境
- `create_virtual_env(name)` - 创建虚拟环境
- `activate_virtual_env(name)` - 激活虚拟环境

#### 使用示例

```python
venv_manager = VirtualEnvManager(python_manager, config)
envs = venv_manager.detect_virtual_envs()
if not envs:
    venv_manager.create_virtual_env("venv")
python_path = venv_manager.activate_virtual_env("venv")
```

## 依赖管理器 (dependency_manager.py)

### 类：DependencyManager

管理项目依赖。

#### 主要方法

- `__init__(python_manager, config)` - 初始化依赖管理器
- `install_from_requirements(python_path)` - 从requirements.txt安装依赖
- `check_dependencies(python_path)` - 检查依赖状态

#### 使用示例

```python
dep_manager = DependencyManager(python_manager, config)
dep_manager.install_from_requirements(python_path)
```

## 更新管理器 (updater.py)

### 类：Updater

处理启动器的更新。

#### 主要方法

- `__init__(config)` - 初始化更新管理器
- `check_for_updates()` - 检查更新
- `download_update(version)` - 下载更新
- `apply_update(update_file)` - 应用更新

#### 使用示例

```python
updater = Updater(config)
has_update, update_info = updater.check_for_updates()
if has_update:
    update_file = updater.download_update(update_info["version"])
    updater.apply_update(update_file)
```