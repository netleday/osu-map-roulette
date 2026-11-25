import os
import sys
from pathlib import Path

# BUNDLE_DIR: where static files, templates, and embedded binaries live
if getattr(sys, "frozen", False):
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", sys.executable)).resolve()
    APP_DIR = Path(sys.executable).resolve().parent
else:
    BUNDLE_DIR = Path(__file__).resolve().parent.parent
    APP_DIR = BUNDLE_DIR

# DATA_DIR: user-writable directory for config, cache, downloads, history, logs
if getattr(sys, "frozen", False):
    DATA_DIR = Path(os.environ.get("LOCALAPPDATA", str(APP_DIR))) / "osu_map_roulette"
else:
    DATA_DIR = BUNDLE_DIR

DATA_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = BUNDLE_DIR / "static"
ASSETS_DIR = BUNDLE_DIR / "assets"
DOWNLOADS_DIR = DATA_DIR / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR = DATA_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
CACHE_OSU_DIR = CACHE_DIR / "osu_files"
CACHE_OSU_DIR.mkdir(parents=True, exist_ok=True)
CUSTOM_BG_DIR = DATA_DIR / "custom_backgrounds"
CUSTOM_BG_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_FILE = DATA_DIR / "config.json"
HISTORY_FILE = CACHE_DIR / "history.json"
LOCAL_MAPS_CACHE = CACHE_DIR / "local_maps_index.json"
LOG_FILE = DATA_DIR / "app.log"

def get_realm_reader_path() -> tuple[Path, Path]:
    """Returns (READER_EXE, READER_PROJECT) checking bundle and app directories"""
    exe_candidates = [
        BUNDLE_DIR / "tools" / "realm_reader" / "bin" / "publish" / "realm_reader.exe",
        APP_DIR / "tools" / "realm_reader" / "bin" / "publish" / "realm_reader.exe",
        BUNDLE_DIR / "realm_reader.exe",
        APP_DIR / "realm_reader.exe",
    ]
    for c in exe_candidates:
        if c.exists():
            return c, Path()
            
    proj = BUNDLE_DIR / "tools" / "realm_reader" / "realm_reader.csproj"
    return exe_candidates[0], proj
