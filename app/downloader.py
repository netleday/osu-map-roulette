import os
import sys
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any
import httpx
from .config import load_config
from .paths import DOWNLOADS_DIR

MIRROR_URLS = {
    "beatconnect": "https://beatconnect.io/b/{id}",
    "nerinyan": "https://api.nerinyan.moe/d/{id}",
    "catboy": "https://catboy.best/d/{id}"
}

async def download_osz(beatmapset_id: int) -> Optional[Path]:
    """Download .osz file from mirrors with automatic fallback"""
    if not beatmapset_id or beatmapset_id <= 0:
        return None

    target_file = DOWNLOADS_DIR / f"{beatmapset_id}.osz"
    if target_file.exists() and target_file.stat().st_size > 10000:
        return target_file

    cfg = load_config()
    pref = cfg.preferred_mirror
    order = [pref] + [m for m in ["beatconnect", "nerinyan", "catboy"] if m != pref]

    headers = {"User-Agent": "osu-map-roulette/1.0"}

    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, headers=headers) as client:
        for mirror in order:
            url = MIRROR_URLS[mirror].format(id=beatmapset_id)
            try:
                resp = await client.get(url)
                if resp.status_code == 200 and len(resp.content) > 5000:
                    target_file.write_bytes(resp.content)
                    print(f"[Downloader] Successfully downloaded {target_file.name} via {mirror}")
                    return target_file
            except Exception as e:
                print(f"[Downloader] Mirror {mirror} failed: {e}")

    return None

def launch_in_lazer(beatmap_id: int, osz_path: Optional[Path] = None) -> Dict[str, Any]:
    """Launch map in osu!(lazer) via .osz file association or deep-link"""
    success = False
    method = ""

    creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0

    # 1. If we have the downloaded .osz, open it using default Windows handler
    if osz_path and osz_path.exists():
        try:
            if sys.platform == "win32":
                os.startfile(str(osz_path))
                success = True
                method = "os.startfile(.osz)"
            else:
                subprocess.Popen(["xdg-open", str(osz_path)], creationflags=creationflags)
                success = True
                method = "xdg-open(.osz)"
        except Exception as e:
            print(f"[Launcher] os.startfile failed: {e}")

    # 2. Try deep-link: osu://b/<id>
    if not success and beatmap_id > 0:
        try:
            deep_link = f"osu://b/{beatmap_id}"
            if sys.platform == "win32":
                try:
                    os.startfile(deep_link)
                except Exception:
                    # Fallback to webbrowser without cmd window
                    import webbrowser
                    webbrowser.open(deep_link)
                success = True
                method = f"deep-link ({deep_link})"
            else:
                subprocess.Popen(["xdg-open", deep_link], creationflags=creationflags)
                success = True
                method = f"deep-link ({deep_link})"
        except Exception as e:
            print(f"[Launcher] deep-link failed: {e}")

    return {"success": success, "method": method}
