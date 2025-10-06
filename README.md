# Whimbox Launcher

Whimbox Launcher 是一个用于下载、安装和启动 Python 项目的 Electron 应用程序。它可以自动从 GitHub Releases 或自定义 URL 获取最新的 wheel 包并安装。

## 功能特点

- 自动从 GitHub Releases 获取最新的 wheel 包
- 支持自定义下载 URL
- 内置简易 Python 环境
- 自动安装 wheel 包
- 自动更新检查

## 安装和运行

### 开发
1. 安装依赖：
```bash
npm install
```

2. 启动应用：

```bash
npm start
```

### 打包

使用 Electron Builder 构建应用：

```bash
npm run build
```

## 数据存储位置
安装后的目录结构：
```
安装位置\
├── whimbox_launcher.exe           # 主程序
├── python-embedded\               # 简易 Python 环境
├── app-data\                      # 奇想盒数据和配置
└── downloads\                     # 下载的 wheel 包
```