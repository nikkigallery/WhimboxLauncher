# 用户指南

本指南将帮助您了解如何使用Python项目启动器。

## 安装与启动

1. 确保以管理员身份运行启动器
2. 双击 `run.bat` 或直接运行 `launcher.py` 启动程序

## 首次运行设置

首次运行时，启动器将显示配置界面，您需要：

1. 输入GitHub仓库地址
2. 选择Python版本（如果未安装）
3. 配置环境选项
4. 点击"开始设置"按钮

启动器将自动执行以下操作：
- 检查并安装Git（如果需要）
- 克隆指定的GitHub仓库
- 检查并安装Python（如果需要）
- 创建虚拟环境
- 安装项目依赖

## 启动项目

环境配置完成后，启动器将显示主界面，您可以：

1. 点击"启动项目"按钮运行主程序
2. 点击"检查更新"按钮检查启动器更新
3. 点击"打开项目文件夹"按钮浏览项目文件
4. 点击"重新配置"按钮重置环境配置

## 配置选项

启动器的配置文件位于 `config/launcher_config.json`，您可以手动编辑以下选项：

- `github_repo`: GitHub仓库地址
- `python_version`: 首选Python版本
- `auto_start`: 设置完成后是否自动启动项目
- `check_updates`: 是否自动检查更新
- `show_console`: 启动项目时是否显示控制台窗口
- `environment_settings`: 环境设置
  - `auto_create_venv`: 是否自动创建虚拟环境
  - `venv_name`: 虚拟环境名称
- `ui_settings`: 界面设置
  - `window_width`: 窗口宽度
  - `window_height`: 窗口高度

## 故障排除

如果遇到问题，请检查：

1. 日志文件 `launcher.log` 获取详细错误信息
2. 确保以管理员身份运行
3. 检查网络连接
4. 确保GitHub仓库地址正确

常见问题：

- **Git安装失败**: 尝试手动安装Git
- **Python安装失败**: 尝试手动安装Python
- **依赖安装失败**: 检查requirements.txt文件格式是否正确
- **启动失败**: 确保main.py文件存在且无语法错误