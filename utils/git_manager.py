import subprocess
import os
import requests
import logging
import shutil
import platform
import time
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


class GitManager:
    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self.temp_dir = Path(self.config.get("download_temp_dir", "./temp")).resolve()
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        self.git_path = self._find_git_executable()

    # ---------------------------
    # 基础工具
    # ---------------------------
    def _find_git_executable(self) -> Optional[str]:
        cwd = os.getcwd()
        possible_paths: List[str] = [
            "git", "git.exe",
            r"C:\Program Files\Git\bin\git.exe",
            r"C:\Program Files\Git\cmd\git.exe",
            r"C:\Program Files (x86)\Git\bin\git.exe",
            r"C:\Program Files (x86)\Git\cmd\git.exe",
            os.path.join(cwd, "git", "git.exe"),
            os.path.join(cwd, "git", "cmd", "git.exe"),
            os.path.join(cwd, "git", "bin", "git.exe"),
            os.path.join(cwd, "git", "usr", "bin", "git.exe"),
            "/usr/bin/git", "/bin/git",
        ]
        for path in possible_paths:
            try:
                result = subprocess.run([path, "--version"], capture_output=True, text=True, shell=True, timeout=5)
                if result.returncode == 0:
                    logger.info(f"找到Git: {path}")
                    return path
            except (subprocess.TimeoutExpired, FileNotFoundError):
                continue
        logger.warning("未找到Git可执行文件")
        return None

    def _detect_arch_token(self) -> str:
        m = platform.machine().lower()
        if any(x in m for x in ["arm64", "aarch64"]):
            return "arm64"
        if any(x in m for x in ["x86_64", "amd64", "x64"]):
            return "64-bit"
        return "64-bit"

    def _portablegit_candidates(self, version: str, arch_token: str) -> List[str]:
        mirror_sf = (
            f"https://sourceforge.net/projects/git-for-windows.mirror/files/"
            f"v{version}.windows.1/PortableGit-{version}-{arch_token}.7z.exe/download"
        )
        official = (
            f"https://github.com/git-for-windows/git/releases/download/"
            f"v{version}.windows.1/PortableGit-{version}-{arch_token}.7z.exe"
        )
        custom_list: List[str] = self.config.get("git_download_urls", [])
        candidates = []
        candidates.extend(custom_list)
        candidates.append(mirror_sf)
        candidates.append(official)
        uniq, seen = [], set()
        for u in candidates:
            if u and u not in seen:
                uniq.append(u)
                seen.add(u)
        return uniq

    def _download_file(self, url: str, file_path: Path, name: str = "文件") -> bool:
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

    def _normalize_repo_id(self, url: str) -> Optional[tuple]:
        """
        将远程URL规范化为 (host, owner, repo) 三元组，host 统一到 github.com，
        支持以下形式：
          - https://github.com/owner/repo(.git)
          - https://kkgithub.com/owner/repo(.git)
          - git@github.com:owner/repo(.git)
          - ssh://git@github.com/owner/repo(.git)
        解析失败返回 None
        """
        if not url:
            return None
        u = url.strip()

        # 1) SSH 短格式：git@host:owner/repo(.git)
        if u.startswith("git@"):
            # 例：git@github.com:nikkigallery/WhimboxLauncher.git
            try:
                left, right = u.split(":", 1)
                host = left.split("@", 1)[1].lower()
                path = right
            except Exception:
                return None
            # 统一镜像到 github.com
            if host == "kkgithub.com":
                host = "github.com"
            parts = path.strip("/").split("/")
            if len(parts) >= 2:
                owner = parts[0]
                repo = parts[1]
                if repo.endswith(".git"):
                    repo = repo[:-4]
                return (host, owner, repo)
            return None

        # 2) 其它（含 https/ssh://）
        # 去掉协议头
        for pfx in ("ssh://", "https://", "http://"):
            if u.lower().startswith(pfx):
                u = u[len(pfx):]
                break
        # 剥离认证段（如 git@）
        if "@" in u and not u.startswith("github.com") and not u.startswith("kkgithub.com"):
            u = u.split("@", 1)[1]
        # host 与 path
        if "/" not in u:
            return None
        host, path = u.split("/", 1)
        host = host.lower().strip()
        if host == "kkgithub.com":
            host = "github.com"
        parts = path.strip("/").split("/")
        if len(parts) >= 2:
            owner = parts[0]
            repo = parts[1]
            if repo.endswith(".git"):
                repo = repo[:-4]
            return (host, owner, repo)
        return None

    def _to_https_repo_url(self, host: str, owner: str, repo: str) -> str:
        """将三元组组装为标准 https URL（统一为 github.com）。"""
        host = "github.com" if host in ("github.com", "kkgithub.com") else host
        return f"https://{host}/{owner}/{repo}.git"

    def _are_equivalent_repo(self, a_url: str, b_url: str, aliases: Optional[list] = None) -> bool:
        """
        判断两个URL是否等价仓库：
          - 解析 (host, owner, repo)，host 镜像归一；
          - owner 相同且 repo 相同 -> 等价；
          - 若提供别名列表（如 ["Whimbox", "WhimboxLauncher"]），只要 repo 在同一别名集合内也视为等价；
        """
        ida = self._normalize_repo_id(a_url)
        idb = self._normalize_repo_id(b_url)
        if not ida or not idb:
            return False
        (ha, oa, ra) = ida
        (hb, ob, rb) = idb
        if ha != hb:
            # 如果未来引入企业Git，host不同则不等价
            return False
        if oa != ob:
            return False
        if ra == rb:
            return True
        # 别名匹配
        if aliases:
            s = set(x.lower() for x in aliases)
            return (ra.lower() in s) and (rb.lower() in s)
        return False

    def _safe_remove(self, p: Path):
        try:
            if p.is_file():
                p.unlink(missing_ok=True)
            elif p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
        except Exception as e:
            logger.warning(f"清理失败：{p} - {e}")

    def _rmtree_retry_or_backup(self, target_path: Path, retries: int = 3, delay: float = 0.25) -> bool:
        for i in range(retries):
            try:
                if target_path.exists():
                    shutil.rmtree(target_path, ignore_errors=False)
                break
            except Exception as e:
                logger.warning(f"删除失败({i+1}/{retries})：{e}，{delay}s后重试")
                time.sleep(delay)
        if target_path.exists():
            try:
                ts = time.strftime("%Y%m%d_%H%M%S")
                bak = target_path.with_name(target_path.name + f".bak_{ts}")
                shutil.move(str(target_path), str(bak))
                logger.info(f"无法删除，已改为备份：{bak}")
            except Exception as e:
                logger.error(f"备份失败：{e}")
                return False
        return True

    def _backup_dir(self, target_path: Path) -> bool:
        try:
            ts = time.strftime("%Y%m%d_%H%M%S")
            bak = target_path.with_name(target_path.name + f".bak_{ts}")
            shutil.move(str(target_path), str(bak))
            logger.info(f"已备份目录：{bak}")
            return True
        except Exception as e:
            logger.error(f"备份目录失败：{e}")
            return False

    def _git(self, args: list, cwd: Optional[str] = None, timeout: int = 600) -> subprocess.CompletedProcess:
        return subprocess.run(
            [self.git_path] + args,
            capture_output=True,
            text=True,
            shell=True,
            cwd=cwd,
            timeout=timeout,
        )

    def _detect_origin_default_branch(self, repo_dir: str) -> Optional[str]:
        p = self._git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd=repo_dir, timeout=300)
        if p.returncode == 0 and p.stdout.strip():
            short = p.stdout.strip()
            if "/" in short:
                return short.split("/", 1)[1]
        p = self._git(["remote", "show", "origin"], cwd=repo_dir, timeout=300)
        if p.returncode == 0:
            for line in (p.stdout or "").splitlines():
                line = line.strip()
                if line.lower().startswith("head branch:"):
                    return line.split(":", 1)[1].strip()
        return None

    def _repair_existing_repo(self, repo_dir: str, branch: Optional[str]) -> bool:
        p = self._git(["fetch", "--all", "--prune"], cwd=repo_dir, timeout=600)
        if p.returncode != 0:
            logger.warning(f"fetch 失败：{p.stderr or p.stdout}")
            # 不直接返回False，继续尝试后续操作
        
        target_branch = branch or self._detect_origin_default_branch(repo_dir) or "main"
        p = self._git(["checkout", "-B", target_branch, f"origin/{target_branch}"], cwd=repo_dir, timeout=3000)
        if p.returncode != 0:
            logger.warning(f"checkout {target_branch} 失败：{p.stderr or p.stdout}")
            p = self._git(["checkout", "-b", target_branch], cwd=repo_dir, timeout=3000)
            if p.returncode != 0:
                logger.error(f"创建分支 {target_branch} 失败：{p.stderr or p.stdout}")
                return False
        p = self._git(["reset", "--hard", f"origin/{target_branch}"], cwd=repo_dir, timeout=3000)
        if p.returncode != 0:
            logger.error(f"reset --hard 失败：{p.stderr or p.stdout}")
            return False
        p = self._git(["clean", "-fd"], cwd=repo_dir, timeout=120)
        if p.returncode != 0:
            logger.warning(f"clean -fd 警告：{p.stderr or p.stdout}")
        logger.info(f"仓库已修复到 origin/{target_branch}")
        return True

    def _is_url_responsive(self, url: str, timeout_ms: int = 5000) -> bool:
        timeout = timeout_ms / 1000.0
        headers = {"Range": "bytes=0-0", "User-Agent": "GitManager/1.0"}
        try:
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

    def _to_mirror(self, u: str) -> str:
        prefix = "https://github.com/"
        return ("https://kkgithub.com/" + u[len(prefix):]) if u.startswith(prefix) else u

    # ---------------------------
    # 对外 API
    # ---------------------------
    def is_installed(self) -> bool:
        return self.git_path is not None

    def get_version(self) -> Optional[str]:
        if not self.git_path:
            return None
        try:
            result = subprocess.run([self.git_path, "--version"], capture_output=True, text=True, shell=True, timeout=10)
            if result.returncode == 0:
                return result.stdout.strip()
        except Exception as e:
            logger.error(f"获取Git版本失败: {e}")
        return None

    def install_git(self, install_dir: Optional[str] = None, version: str = "2.51.0") -> bool:
        if install_dir is None:
            install_dir = os.path.join(os.getcwd(), "git")
        install_dir_path = Path(install_dir).resolve()
        install_dir_path.mkdir(parents=True, exist_ok=True)

        arch_token = self._detect_arch_token()
        candidates = self._portablegit_candidates(version, arch_token)
        filename = f"PortableGit-{version}-{arch_token}.7z.exe"
        down_path = (self.temp_dir / filename)

        logger.info(f"开始安装Git（目标目录：{install_dir_path}，架构：{arch_token}）")

        ok_download = False
        for url in candidates:
            if down_path.exists():
                self._safe_remove(down_path)
            if self._download_file(url, down_path, name=f"Git {version}({arch_token})"):
                ok_download = True
                break
        if not ok_download:
            logger.error("Git 安装包下载失败（镜像与官方均不可用）")
            return False

        try:
            logger.info("正在解压 Git（7z 自解压）...")
            result = subprocess.run(
                [str(down_path), "-y", f"-o{str(install_dir_path)}"],
                capture_output=True, text=True, shell=True, timeout=600,
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
            self._safe_remove(down_path)

        self.git_path = self._find_git_executable()
        if not self.git_path:
            logger.error("解压完成但未找到 git.exe，请检查目录结构")
            return False
        logger.info("Git 安装完成")
        return True

    def clone_repository(self, repo_url: str, target_dir: str = "./app", branch: Optional[str] = None) -> bool:
        """目录冲突自动删除/备份；远程匹配则修复；原链/镜像智能切换。"""
        if not self.git_path:
            logger.error("Git 未安装")
            return False

        try:
            os.makedirs(os.path.dirname(target_dir) or ".", exist_ok=True)
            target_path = Path(target_dir).resolve()

            if target_path.exists():
                if self.is_git_repository(target_dir):
                    logger.info(f"检测到已有 Git 仓库: {target_dir}")
                    current_remote = self.get_remote_url(target_dir)

                    # 可选：来自配置的“仓库名别名”列表，用于吞并 Whimbox / WhimboxLauncher 一类改名
                    aliases = self.config.get("repo_aliases", None)  # 例如 ["Whimbox", "WhimboxLauncher"]

                    equiv = False
                    if current_remote:
                        try:
                            equiv = self._are_equivalent_repo(repo_url, current_remote, aliases=aliases)
                        except Exception as e:
                            logger.warning(f"等价仓库判断失败：{e}")
                            equiv = False

                    if equiv:
                        logger.info("远程仓库等价（协议/镜像/别名/改名容忍），尝试对齐远程并修复/更新...")
                        # 若本地是 SSH、期望是 HTTPS，或者要切换到镜像，统一把 origin 调整到期望URL（或后续你检测速度后选择的URL）
                        # 这里先把 origin 对齐到 repo_url（如果你想优先镜像，可以换成 mirror_url）
                        p = self._git(["remote", "set-url", "origin", repo_url], cwd=target_dir, timeout=30)
                        if p.returncode != 0:
                            logger.warning(f"remote set-url 警告：{p.stderr or p.stdout}")
                        # 走修复路径（fetch/reset/clean/checkout）
                        if self._repair_existing_repo(target_dir, branch):
                            return True
                        logger.warning("修复失败，作为降级将执行备份后重克隆")
                        if not self._backup_dir(Path(target_dir).resolve()):
                            return False
                    else:
                        logger.warning(f"远程不匹配：期望 {repo_url}，实际 {current_remote}。备份后重克隆。")
                        if not self._backup_dir(Path(target_dir).resolve()):
                            return False

                else:
                    logger.warning(f"{target_dir} 存在但不是 Git 仓库，尝试删除/备份 ...")
                    if not self._rmtree_retry_or_backup(target_path):
                        return False

            mirror_url = self._to_mirror(repo_url)
            origin_fast = self._is_url_responsive(repo_url, timeout_ms=5000)
            try_list = [repo_url, mirror_url] if origin_fast else [mirror_url, repo_url]

            for idx, trial_url in enumerate(try_list, start=1):
                clone_cmd = [self.git_path, "clone"]
                if branch:
                    clone_cmd.extend(["-b", branch])
                clone_cmd.extend([trial_url, str(target_path)])

                logger.info(f"[尝试 {idx}] git clone {trial_url} -> {target_path}")
                result = subprocess.run(clone_cmd, capture_output=True, text=True, shell=True, timeout=900)

                if result.returncode == 0:
                    logger.info("仓库克隆完成")
                    return True

                msg = result.stderr or result.stdout or ""
                logger.warning(f"克隆失败（尝试 {idx}）：{msg}")

                if "already exists" in msg and target_path.exists():
                    logger.warning("检测到目标目录仍存在，执行一次删除/备份后换源重试")
                    if not self._rmtree_retry_or_backup(target_path):
                        return False
                    # 继续下一轮尝试（换另一个源）

            logger.error("仓库克隆失败（原链接与镜像均失败）")
            return False

        except Exception as e:
            logger.error(f"克隆仓库失败: {e}")
            return False

    def pull_repository(self, repo_dir: str = ".") -> bool:
        if not self.git_path:
            logger.error("Git 未安装")
            return False
        try:
            logger.info("正在拉取仓库更新 ...")
            p = self._git(["fetch", "--all", "--prune"], cwd=repo_dir, timeout=600)
            if p.returncode != 0:
                logger.error(f"fetch 失败: {p.stderr or p.stdout}")
                return False
            # 使用远端默认分支，更强一致
            target_branch = self._detect_origin_default_branch(repo_dir) or "main"
            p = self._git(["checkout", target_branch], cwd=repo_dir, timeout=120)
            if p.returncode != 0:
                logger.warning(f"checkout 警告: {p.stderr or p.stdout}")
            p = self._git(["reset", "--hard", f"origin/{target_branch}"], cwd=repo_dir, timeout=3000)
            if p.returncode != 0:
                logger.error(f"reset --hard 失败: {p.stderr or p.stdout}")
                return False
            p = self._git(["clean", "-fd"], cwd=repo_dir, timeout=120)
            if p.returncode != 0:
                logger.warning(f"clean 警告: {p.stderr or p.stdout}")
            logger.info("仓库更新完成（已与远端强一致）")
            return True
        except Exception as e:
            logger.error(f"拉取仓库更新失败: {e}")
            return False

    def get_current_branch(self, repo_dir: str = ".") -> Optional[str]:
        if not self.git_path:
            return None
        try:
            result = self._git(["branch", "--show-current"], cwd=repo_dir, timeout=10)
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
            result = self._git(["remote", "get-url", "origin"], cwd=repo_dir, timeout=10)
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
            result = self._git(["rev-parse", "HEAD"], cwd=repo_dir, timeout=10)
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
                r1 = self._git(["config", "--global", "user.name", user_name])
                if r1.returncode != 0:
                    logger.error(f"设置Git用户名失败: {r1.stderr}")
                    return False
            if user_email:
                r2 = self._git(["config", "--global", "user.email", user_email])
                if r2.returncode != 0:
                    logger.error(f"设置Git邮箱失败: {r2.stderr}")
                    return False
            logger.info("Git 配置完成")
            return True
        except Exception as e:
            logger.error(f"配置Git失败: {e}")
            return False
