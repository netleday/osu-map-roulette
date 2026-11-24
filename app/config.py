import json
import os
from pathlib import Path
from pydantic import BaseModel

from .paths import CONFIG_FILE

DEFAULT_LAZER_PATH = os.path.expandvars(r"%APPDATA%\osu")

class ConfigModel(BaseModel):
    client_id: str = ""
    client_secret: str = ""
    source_mode: str = "local"  # "local" or "api"
    lazer_path: str = DEFAULT_LAZER_PATH
    preferred_mirror: str = "beatconnect"  # "beatconnect", "nerinyan", "catboy"
    sound_volume: float = 0.7
    enable_sounds: bool = True
    smart_mod_filter: bool = True
    pattern_style: str = "any"  # "any", "aim", "stream", "balanced"
    ladder_start_sr: float = 3.5
    ladder_step_sr: float = 0.15
    ladder_streak_best: int = 0
    ladder_streak_current: int = 0
    bg_image: str = "bg_1.png"
    ui_theme_style: str = "glass"  # "glass", "dark", "transparent"
    bg_dim: float = 0.72
    bg_blur: int = 12
    overlay_hotkey: str = "F9"  # "F9" or "Shift+Tab"
    instant_roll_hotkey: str = "Alt+R"  # "Alt+R", "F8", "Ctrl+Shift+R"
    overlay_autostart: bool = False
    overlay_auto_launch: bool = False
    sidebar_collapsed: bool = False

def load_config() -> ConfigModel:
    if not CONFIG_FILE.exists():
        cfg = ConfigModel()
        save_config(cfg)
        return cfg
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return ConfigModel(**data)
    except Exception as e:
        print(f"[Config] Error loading config: {e}, using defaults")
        return ConfigModel()

def save_config(cfg: ConfigModel):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg.model_dump(), f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[Config] Error saving config: {e}")
