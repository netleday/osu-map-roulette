import os
import sys
import time
import tempfile
import threading
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import httpx

from .version import APP_VERSION, AUTHOR, GITHUB_REPO, GITHUB_URL, AUTHOR_GITHUB_URL, LOCAL_CHANGELOG


def _parse_version(ver_str: str) -> Tuple[int, ...]:
    clean = (ver_str or "0.0.0").strip().lstrip("vV")
    parts = []
    for p in clean.split("."):
        digits = "".join(ch for ch in p if ch.isdigit())
        parts.append(int(digits) if digits else 0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts[:3])


class UpdateManager:
    def __init__(self):
        self.checking: bool = False
        self.update_available: bool = False
        self.latest_version: str = APP_VERSION
        self.release_title: str = ""
        self.release_notes: str = ""
        self.download_url: str = ""
        self.html_url: str = GITHUB_URL + "/releases"
        self.last_checked: float = 0.0
        self.error: str = ""

        # Download & install state
        self.downloading: bool = False
        self.download_progress: int = 0
        self.downloaded_bytes: int = 0
        self.total_bytes: int = 0
        self.download_error: str = ""
        self._lock = threading.Lock()

    def check_for_updates_async(self):
        threading.Thread(target=self.check_for_updates, daemon=True).start()

    def check_for_updates(self) -> Dict[str, Any]:
        with self._lock:
            if self.checking:
                return self.get_status()
            self.checking = True
            self.error = ""

        try:
            api_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
            headers = {
                "Accept": "application/vnd.github+json",
                "User-Agent": f"osu-map-roulette/{APP_VERSION} ({AUTHOR})"
            }
            with httpx.Client(timeout=5.0, follow_redirects=True) as client:
                resp = client.get(api_url, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    tag = str(data.get("tag_name") or "").strip()
                    clean_ver = tag.lstrip("vV")
                    notes = str(data.get("body") or "").strip()
                    title = str(data.get("name") or tag).strip()
                    html_url = str(data.get("html_url") or (GITHUB_URL + "/releases"))

                    exe_url = ""
                    for asset in data.get("assets", []):
                        name = str(asset.get("name") or "").lower()
                        if name.endswith(".exe"):
                            exe_url = str(asset.get("browser_download_url") or "")
                            break

                    is_newer = _parse_version(clean_ver) > _parse_version(APP_VERSION)
                    with self._lock:
                        self.update_available = bool(is_newer and exe_url)
                        self.latest_version = clean_ver or APP_VERSION
                        self.release_title = title
                        self.release_notes = notes
                        self.download_url = exe_url
                        self.html_url = html_url
                        self.last_checked = time.time()
                elif resp.status_code == 404:
                    # Repo or release not published yet
                    with self._lock:
                        self.update_available = False
                        self.latest_version = APP_VERSION
                        self.last_checked = time.time()
                else:
                    with self._lock:
                        self.error = f"GitHub API HTTP {resp.status_code}"
        except Exception as e:
            with self._lock:
                self.error = str(e)
        finally:
            with self._lock:
                self.checking = False

        return self.get_status()

    def start_download_and_install(self) -> Dict[str, Any]:
        with self._lock:
            if not self.update_available or not self.download_url:
                return {"ok": False, "error": "Нет доступного обновления для скачивания"}
            if self.downloading:
                return {"ok": True, "already_downloading": True}
            self.downloading = True
            self.download_progress = 0
            self.downloaded_bytes = 0
            self.total_bytes = 0
            self.download_error = ""

        threading.Thread(target=self._download_worker, daemon=True).start()
        return {"ok": True}

    def _download_worker(self):
        try:
            temp_dir = Path(tempfile.gettempdir())
            setup_path = temp_dir / f"osu-Map-Roulette-Setup-v{self.latest_version}.exe"

            with httpx.Client(timeout=60.0, follow_redirects=True) as client:
                with client.stream("GET", self.download_url) as resp:
                    if resp.status_code != 200:
                        raise RuntimeError(f"Ошибка загрузки: HTTP {resp.status_code}")

                    total = int(resp.headers.get("content-length") or 0)
                    with self._lock:
                        self.total_bytes = total

                    downloaded = 0
                    with open(setup_path, "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=65536):
                            if not chunk:
                                continue
                            f.write(chunk)
                            downloaded += len(chunk)
                            with self._lock:
                                self.downloaded_bytes = downloaded
                                if total > 0:
                                    self.download_progress = min(99, int((downloaded / total) * 100))

            with self._lock:
                self.download_progress = 100

            # Give UI a moment to render 100%
            time.sleep(0.4)

            creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            subprocess.Popen(
                [str(setup_path), "/SILENT"],
                creationflags=creationflags,
                close_fds=True
            )

            # Gracefully exit current app so installer can overwrite files cleanly
            time.sleep(0.3)
            os._exit(0)

        except Exception as e:
            with self._lock:
                self.download_error = str(e)
                self.downloading = False

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "current_version": APP_VERSION,
                "author": AUTHOR,
                "github_repo": GITHUB_REPO,
                "github_url": GITHUB_URL,
                "author_github_url": AUTHOR_GITHUB_URL,
                "checking": self.checking,
                "update_available": self.update_available,
                "latest_version": self.latest_version,
                "release_title": self.release_title,
                "release_notes": self.release_notes,
                "download_url": self.download_url,
                "html_url": self.html_url,
                "downloading": self.downloading,
                "download_progress": self.download_progress,
                "downloaded_bytes": self.downloaded_bytes,
                "total_bytes": self.total_bytes,
                "download_error": self.download_error,
                "error": self.error,
                "local_changelog": LOCAL_CHANGELOG,
            }


update_manager = UpdateManager()
