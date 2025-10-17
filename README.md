# 奇想盒启动器

自动更新、安装，一键启动奇想盒
1. 标准windows安装程序，一键安装一键卸载。
2. 内置python环境，免配置，直接用。
3. 懒人一键自动更新奇想盒。


## 如何更新奇想盒
1. 自动更新：前往 [暖暖照相馆](https://nikkigallery.vip/) 注册账号，并开通自动更新会员（免费内测中，如有需要找群主开一下就行），启动器会在每次打开时，自动检测并更新。
2. 手动更新：下载 [奇想盒项目release](https://github.com/nikkigallery/Whimbox/releases) 中的whl包，放到启动器的downloads目录下，重启启动器，会自动检测并安装。

## 如何更新跑图脚本
1. 一键订阅，自动更新：前往[路线订阅网站](https://nikkigallery.vip/whimbox)，筛选自己需要的路线脚本，点击订阅。启动器会在每次打开时，自动同步并更新。
2. 手动更新：前往[路线仓库](https://github.com/nikkigallery/WhimboxScripts)，下载自己需要的路线脚本，放到启动器的scripts目录下。

## 开发
1. 安装依赖：
```bash
npm install
```

2. 启动应用：

```bash
npm start
```

### 打包

```bash
npm run build
```