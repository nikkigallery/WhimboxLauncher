# Windows 构建脚本
# 使用国内镜像源加速下载

Write-Host "设置镜像源..." -ForegroundColor Green
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR = "https://npmmirror.com/mirrors/electron-builder-binaries/"

Write-Host "开始构建 Windows 安装包..." -ForegroundColor Green
npm run build
