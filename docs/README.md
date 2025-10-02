# 奇想盒启动器文档

## 项目概述

奇想盒启动器是一个用于简化Python项目环境配置和启动的工具。它提供了图形化界面，帮助用户自动化以下过程：

- Git安装和仓库克隆
- Python环境安装和配置
- 虚拟环境创建和管理
- 依赖包安装
- 项目启动和更新

本启动器适用于需要快速部署和运行Python项目的场景，特别是对于不熟悉命令行操作的用户。

## 文档目录

- [模块介绍](modules.md) - 项目主要模块的概述和功能说明
- [工具模块详细文档](utils.md) - 工具模块的详细API和使用说明
- [用户指南](user_guide.md) - 面向最终用户的使用指南

## 系统要求

- 操作系统：Windows
- 管理员权限（用于安装软件和配置环境）
- 网络连接（用于下载依赖和更新）

## 项目结构

```
launcher/
├── config/                # 配置文件目录
│   └── launcher_config.json  # 启动器配置文件
├── docs/                  # 文档目录
├── logs/                  # 日志目录
├── static/                # 前端资源
│   ├── css/               # 样式文件
│   ├── js/                # JavaScript文件
│   ├── index.html         # 首次运行界面
│   └── launch.html        # 主启动界面
├── utils/                 # 工具模块
│   ├── config_manager.py  # 配置管理
│   ├── dependency_manager.py  # 依赖管理
│   ├── git_manager.py     # Git管理
│   ├── python_manager.py  # Python管理
│   ├── updater.py         # 更新管理
│   └── virtual_env_manager.py  # 虚拟环境管理
├── launcher.py            # 主程序
├── launcher.log           # 日志文件
└── run.bat                # 启动脚本
```

## 开发指南

如需参与项目开发，请参考以下步骤：

1. 克隆仓库到本地
2. 安装开发依赖
3. 遵循项目代码规范
4. 提交前进行测试