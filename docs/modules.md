# 模块介绍

本文档介绍Python项目启动器的主要模块及其功能。

## 核心模块

### 1. 启动器主模块 (launcher.py)

`PythonLauncher` 类是整个应用程序的核心，负责协调各个功能模块的工作。主要功能包括：

- 初始化各个管理器模块
- 提供图形界面
- 处理首次运行设置
- 启动主程序
- 更新进度显示
- 检查管理员权限

### 2. API接口 (ApiInterface)

`ApiInterface` 类为前端界面提供API接口，允许JavaScript与Python后端交互。主要功能包括：

- 保存和加载配置
- 启动设置流程
- 启动主程序
- 检查更新
- 打开项目文件夹
- 重新配置环境
- 重启启动器

## 工具模块

### 1. 配置管理 (config_manager.py)

负责读取、保存和管理启动器的配置信息，包括：
- 环境配置状态
- 首次运行状态
- 上次运行时间
- 界面设置
- GitHub仓库信息

### 2. Git管理 (git_manager.py)

处理Git相关操作，包括：
- 检查Git安装状态
- 安装Git
- 克隆仓库
- 更新仓库

### 3. Python管理 (python_manager.py)

管理Python环境，包括：
- 检查Python安装状态
- 安装Python
- 获取Python路径

### 4. 虚拟环境管理 (virtual_env_manager.py)

处理Python虚拟环境，包括：
- 检测现有虚拟环境
- 创建虚拟环境
- 激活虚拟环境

### 5. 依赖管理 (dependency_manager.py)

管理项目依赖，包括：
- 从requirements.txt安装依赖
- 检查依赖状态

### 6. 更新管理 (updater.py)

处理启动器的更新，包括：
- 检查更新
- 下载更新
- 应用更新

## 前端模块

### 1. 首次运行界面 (index.html)

提供首次运行时的配置界面，允许用户：
- 配置GitHub仓库
- 选择Python版本
- 设置环境选项

### 2. 主启动界面 (launch.html)

提供主要的启动界面，允许用户：
- 启动项目
- 检查更新
- 打开项目文件夹
- 重新配置环境

### 3. JavaScript模块

- main.js: 处理首次运行界面的交互
- launch.js: 处理主启动界面的交互

### 4. CSS样式

- style.css: 提供界面样式
- notifications.css: 提供通知样式