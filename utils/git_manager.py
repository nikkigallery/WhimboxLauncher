import subprocess
import os
import requests
import logging
import shutil
import platform
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


class GitManager:
    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        # 下载缓存目录：.\temp
        self.temp_dir = Path(self.config.get("download_temp_dir", "./temp")).resolve()
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.git_path = self._find_git_executable()

    # ---------------------------
    # 工具方法
    # ---------------------------
    def _find_git_executable(self) -> Optional[str]:
        """查找 Git 可执行文件路径（含 ./git 多路径）"""

        cwd = os.getcwd()
        possible_paths: List[str] = [
            # PATH 中
            "git",
            "git.exe",
            # 常见系统路径
            r"C:\Program Files\Git\bin\git.exe",
            r"C:\Program Files\Git\cmd\git.exe",
            r"C:\Program Files (x86)\Git\bin\git.exe",
            r"C:\Program Files (x86)\Git\cmd\git.exe",
            # 项目内便携安装（多种可能）
            os.path.join(cwd, "git", "git.exe"),
            os.path.join(cwd, "git", "cmd", "git.exe"),
            os.path.join(cwd, "git", "bin", "git.exe"),
            os.path.join(cwd, "git", "usr", "bin", "git.exe"),
            # WSL/MinGW 等（以防万一）
            "/usr/bin/git",
            "/bin/git",
        ]

        for path in possible_paths:
            try:
                result = subprocess.run(
                    [path, "--version"],
                    capture_output=True,
                    text=True,
                    shell=True,
                    timeout=5,
                )
                if result.returncode == 0:
                    logger.info(f"找到Git: {path}")
                    return path
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue

        logger.warning("未找到Git可执行文件")
        return None

    def _detect_arch_token(self) -> str:
        """
        返回 PortableGit 文件名中的架构标识：
        - x86_64 / AMD64 / x64 -> '64-bit'
        - ARM64 / aarch64      -> 'arm64'
        其他情况默认 '64-bit'
        """
        m = platform.machine().lower()
        if any(x in m for x in ["arm64", "aarch64"]):
            return "arm64"
        if any(x in m for x in ["x86_64", "amd64", "x64"]):
            return "64-bit"
        # Windows 上大多数还是 x64
        return "64-bit"

    def _portablegit_candidates(self, version: str, arch_token: str) -> List[str]:
        """
        生成下载候选 URL（先镜像、后官方），均为 PortableGit 自解压 7z
        """
        # 指定的镜像（示例为 2.51.0 arm64），会根据 arch/version 自动替换
        mirror_sf = (
            f"https://sourceforge.net/projects/git-for-windows.mirror/files/"
            f"v{version}.windows.1/PortableGit-{version}-{arch_token}.7z.exe/download"
        )
        # 官方 GitHub
        official = (
            f"https://github.com/git-for-windows/git/releases/download/"
            f"v{version}.windows.1/PortableGit-{version}-{arch_token}.7z.exe"
        )

        # 允许从 config 注入自定义候选（优先）
        custom_list: List[str] = self.config.get("git_download_urls", [])
        candidates = []
        candidates.extend(custom_list)
        candidates.append(mirror_sf)  # 镜像优先
        candidates.append(official)   # 官方回退

        # 去重保持顺序
        uniq, seen = [], set()
        for u in candidates:
            if u and u not in seen:
                uniq.append(u)
                seen.add(u)
        return uniq

    def _download_file(self, url: str, file_path: Path, name: str = "文件") -> bool:
        """下载文件到 file_path（覆盖），支持重定向、进度日志"""
        try:
            logger.info(f"正在下载{name}：{url}")
            with requests.get(url, stream=True, timeout=30, allow_redirects=True) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length", 0))
                done = 0
                with open(file_path, "wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 256):
                        if chunk:
                            f.write(chunk)
                            done += len(chunk)
                            if total > 0:
                                pct = done * 100.0 / total
                                logger.info(f"{name}下载进度：{pct:.1f}%")
            logger.info(f"{name}下载完成 -> {file_path}")
            return True
        except Exception as e:
            logger.error(f"下载{name}失败：{e}")
            return False

    def _safe_remove(self, p: Path):
        try:
            if p.is_file():
                p.unlink(missing_ok=True)
            elif p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
        except Exception as e:
            logger.warning(f"清理失败：{p} - {e}")

    # ---------------------------
    # 对外 API
    # ---------------------------
    def is_installed(self) -> bool:
        return self.git_path is not None

    def get_version(self) -> Optional[str]:
        if not self.git_path:
            return None
        try:
            result = subprocess.run(
                [self.git_path, "--version"],
                capture_output=True,
                text=True,
                shell=True,
                timeout=10,
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"获取Git版本失败: {e}")
        return None

    def install_git(self, install_dir: Optional[str] = None, version: str = "2.51.0") -> bool:
        """
        安装 PortableGit 到 install_dir（默认 ./git）
        - 先试镜像（SourceForge），失败再试官方（GitHub）
        - 自解压 7z：使用 -y -o 解压，不用 Inno 的静默参数
        - 下载缓存位于 ./temp，成功后删除下载包
        """
        if install_dir is None:
            install_dir = os.path.join(os.getcwd(), "git")

        install_dir_path = Path(install_dir).resolve()
        install_dir_path.mkdir(parents=True, exist_ok=True)

        arch_token = self._detect_arch_token()  # '64-bit' 或 'arm64'
        candidates = self._portablegit_candidates(version, arch_token)

        # 下载到 ./temp
        filename = f"PortableGit-{version}-{arch_token}.7z.exe"
        down_path = (self.temp_dir / filename)

        logger.info(f"开始安装Git（目标目录：{install_dir_path}，架构：{arch_token}）")

        ok_download = False
        for url in candidates:
            # 每次失败会覆盖重下
            if down_path.exists():
                self._safe_remove(down_path)
            if self._download_file(url, down_path, name=f"Git {version}({arch_token})"):
                ok_download = True
                break

        if not ok_download:
            logger.error("Git 安装包下载失败（镜像与官方均不可用）")
            return False

        # 自解压到 install_dir：7z SFX 支持 -y -o
        try:
            logger.info("正在解压 Git（7z 自解压）...")
            # 注意：-o<DIR> 紧贴参数，不要有空格
            # 使用 shell=True 可以支持路径中空格
            result = subprocess.run(
                [str(down_path), "-y", f"-o{str(install_dir_path)}"],
                capture_output=True,
                text=True,
                shell=True,
                timeout=600,
            )
            if result.returncode != 0:
                logger.error(f"Git 解压失败：{result.stderr or result.stdout}")
                return False
        except subprocess.TimeoutExpired:
            logger.error("Git 解压超时")
            return False
        except Exception as e:
            logger.error(f"Git 解压异常：{e}")
            return False
        finally:
            # 成功或失败都尽量清理下载缓存
            self._safe_remove(down_path)

        # 重新查找 git 可执行文件
        self.git_path = self._find_git_executable()
        if not self.git_path:
            logger.error("解压完成但未找到 git.exe，请检查目录结构")
            return False

        logger.info("Git 安装完成")
        return True

    def clone_repository(self, repo_url: str, target_dir: str = "./app", branch: Optional[str] = None) -> bool:
        """克隆 Git 仓库：原链接优先；若原链接 300ms 内无响应则自动改用 kkgithub 镜像。
        若已存在同仓库则 pull；若克隆失败会在两种 URL 间回退重试。"""
        if not self.git_path:
            logger.error("Git 未安装")
            return False

        import shutil
        import time
        from pathlib import Path
        import requests

        def _is_url_responsive(url: str, timeout_ms: int = 300) -> bool:
            """在 timeout_ms 内检查 URL 是否可快速响应。
            先 HEAD，不行再用 GET + Range: bytes=0-0，尽量减少流量。"""
            timeout = timeout_ms / 1000.0
            headers = {"Range": "bytes=0-0", "User-Agent": "GitManager/1.0"}
            try:
                # 有些站点不支持 HEAD，先试 HEAD，再回退 GET
                r = requests.head(url, timeout=timeout, allow_redirects=True)
                if r.ok:
                    return True
            except Exception:
                pass
            try:
                r = requests.get(url, timeout=timeout, headers=headers, allow_redirects=True, stream=True)
                return r.ok
            except Exception:
                return False

        def _to_mirror(u: str) -> str:
            """https://github.com/owner/repo(.git)?  ->  https://kkgithub.com/owner/repo(.git)?"""
            prefix = "https://github.com/"
            if u.startswith(prefix):
                return "https://kkgithub.com/" + u[len(prefix):]
            return u

        try:
            # 确保目标目录父级存在
            os.makedirs(os.path.dirname(target_dir) if os.path.dirname(target_dir) else ".", exist_ok=True)
            target_path = Path(target_dir).resolve()

            # 已存在：若是同一仓库则 pull
            if target_path.exists():
                if self.is_git_repository(target_dir):
                    logger.info(f"检测到已有 Git 仓库: {target_dir}")

                    current_remote = self.get_remote_url(target_dir)
                    expected_repo_name = repo_url.rstrip("/").split("/")[-1].replace(".git", "")
                    current_remote_clean = (
                        current_remote.rstrip("/").split("/")[-1].replace(".git", "")
                        if current_remote else None
                    )

                    if current_remote and (current_remote == repo_url or current_remote_clean == expected_repo_name):
                        logger.info("远程仓库匹配，执行 git pull ...")

                        # 可选切分支
                        if branch:
                            original_cwd = os.getcwd()
                            os.chdir(target_dir)
                            try:
                                r_fetch = subprocess.run(
                                    [self.git_path, "fetch", "origin"],
                                    capture_output=True, text=True, shell=True, timeout=300,
                                )
                                if r_fetch.returncode != 0:
                                    logger.warning(f"fetch 失败: {r_fetch.stderr}")
                                    return False

                                r_checkout = subprocess.run(
                                    [self.git_path, "checkout", branch],
                                    capture_output=True, text=True, shell=True, timeout=300,
                                )
                                if r_checkout.returncode != 0:
                                    logger.error(f"切换分支失败: {r_checkout.stderr}")
                                    return False
                                logger.info(f"已切换到分支 '{branch}'")
                            finally:
                                os.chdir(original_cwd)

                        return self.pull_repository(target_dir)
                    else:
                        logger.warning(f"远程仓库不匹配，期望: {repo_url}, 实际: {current_remote}，将重新克隆")
                        shutil.rmtree(target_path, ignore_errors=True)
                        logger.info(f"旧仓库已删除: {target_path}")
                else:
                    logger.warning(f"{target_dir} 存在但不是 Git 仓库，正在清理...")
                    shutil.rmtree(target_path, ignore_errors=True)
                    logger.info(f"非 Git 目录已删除: {target_path}")

            # 首次克隆 / 清理后克隆
            logger.info(f"准备克隆仓库 -> {target_dir}")

            # —— 原链接优先；300ms 内无响应则切换镜像 ——
            # 这里用仓库页面/地址作快速连通性预检（不直接测 git 协议），仅用于决定优先顺序
            start = time.perf_counter()
            origin_fast = _is_url_responsive(repo_url, timeout_ms=1000)
            elapsed_ms = (time.perf_counter() - start) * 1000
            logger.info(f"原链接预检：{'可用' if origin_fast else '超时/不可用'}，耗时≈{elapsed_ms:.0f}ms")

            mirror_url = _to_mirror(repo_url)
            # 按优先级决定尝试顺序
            try_list = [repo_url, mirror_url] if origin_fast else [mirror_url, repo_url]

            # 开始克隆（若第一个失败自动回退第二个）
            for idx, trial_url in enumerate(try_list, start=1):
                # 规范参数顺序：git clone [--branch/-b BR] <repo> <dir>
                clone_cmd = [self.git_path, "clone"]
                if branch:
                    clone_cmd.extend(["-b", branch])
                clone_cmd.extend([trial_url, str(target_path)])

                logger.info(f"[尝试 {idx}] git clone {trial_url} ...")
                result = subprocess.run(
                    clone_cmd, capture_output=True, text=True, shell=True, timeout=900
                )
                if result.returncode == 0:
                    logger.info("仓库克隆完成")
                    return True
                else:
                    logger.warning(f"克隆失败（尝试 {idx}）：{result.stderr or result.stdout}")

            logger.error("仓库克隆失败（原链接与镜像均失败）")
            return False

        except Exception as e:
            logger.error(f"克隆仓库失败: {e}")
            return False


    def pull_repository(self, repo_dir: str = ".") -> bool:
        """拉取更新"""
        if not self.git_path:
            logger.error("Git 未安装")
            return False
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            logger.info("正在拉取仓库更新 ...")
            result = subprocess.run(
                [self.git_path, "pull"],
                capture_output=True,
                text=True,
                shell=True,
                timeout=300,
            )
            os.chdir(original_cwd)
            if result.returncode == 0:
                logger.info("仓库更新完成")
                return True
            else:
                logger.error(f"仓库更新失败: {result.stderr or result.stdout}")
                return False
        except Exception as e:
            logger.error(f"拉取仓库更新失败: {e}")
            return False

    def get_current_branch(self, repo_dir: str = ".") -> Optional[str]:
        if not self.git_path:
            return None
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            result = subprocess.run(
                [self.git_path, "branch", "--show-current"],
                capture_output=True,
                text=True,
                shell=True,
                timeout=10,
            )
            os.chdir(original_cwd)
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"获取当前分支失败: {result.stderr}")
                return None
        except Exception as e:
            logger.error(f"获取当前分支失败: {e}")
            return None

    def get_remote_url(self, repo_dir: str = ".") -> Optional[str]:
        if not self.git_path:
            return None
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            result = subprocess.run(
                [self.git_path, "remote", "get-url", "origin"],
                capture_output=True,
                text=True,
                shell=True,
                timeout=10,
            )
            os.chdir(original_cwd)
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"获取远程URL失败: {result.stderr}")
                return None
        except Exception as e:
            logger.error(f"获取远程URL失败: {e}")
            return None

    def is_git_repository(self, repo_dir: str = ".") -> bool:
        return os.path.exists(os.path.join(repo_dir, ".git"))

    def get_commit_hash(self, repo_dir: str = ".") -> Optional[str]:
        if not self.git_path:
            return None
        try:
            original_cwd = os.getcwd()
            os.chdir(repo_dir)
            result = subprocess.run(
                [self.git_path, "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                shell=True,
                timeout=10,
            )
            os.chdir(original_cwd)
            if result.returncode == 0:
                return result.stdout.strip()
            else:
                logger.error(f"获取提交哈希失败: {result.stderr}")
                return None
        except Exception as e:
            logger.error(f"获取提交哈希失败: {e}")
            return None

    def configure_git(self, user_name: Optional[str] = None, user_email: Optional[str] = None) -> bool:
        if not self.git_path:
            logger.error("Git 未安装")
            return False
        try:
            if user_name:
                r1 = subprocess.run(
                    [self.git_path, "config", "--global", "user.name", user_name],
                    capture_output=True,
                    text=True,
                    shell=True,
                )
                if r1.returncode != 0:
                    logger.error(f"设置Git用户名失败: {r1.stderr}")
                    return False
            if user_email:
                r2 = subprocess.run(
                    [self.git_path, "config", "--global", "user.email", user_email],
                    capture_output=True,
                    text=True,
                    shell=True,
                )
                if r2.returncode != 0:
                    logger.error(f"设置Git邮箱失败: {r2.stderr}")
                    return False
            logger.info("Git 配置完成")
            return True
        except Exception as e:
            logger.error(f"配置Git失败: {e}")
            return False
