import os
import sys
import io
import traceback
from datetime import datetime
from pathlib import Path

# Explicit AppUserModelID for Windows Taskbar grouping and icon display
if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("osu.map.roulette.app")
    except Exception:
        pass

# Fix for Windows pythonw.exe where stdout and stderr are None
from app.paths import (
    BUNDLE_DIR,
    APP_DIR,
    DATA_DIR,
    STATIC_DIR,
    ASSETS_DIR,
    DOWNLOADS_DIR,
    CACHE_DIR,
    HISTORY_FILE,
    LOCAL_MAPS_CACHE,
    LOG_FILE
)

CRASH_LOG_PATH = Path(os.environ.get("LOCALAPPDATA", ".")) / "osu_map_roulette" / "crash.log"

def setup_crash_logger():
    def handle_exception(exc_type, exc_value, exc_traceback):
        if issubclass(exc_type, KeyboardInterrupt):
            sys.__excepthook__(exc_type, exc_value, exc_traceback)
            return
        try:
            CRASH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(CRASH_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*60}\n[{datetime.now().isoformat()}] UNCAUGHT EXCEPTION:\n")
                traceback.print_exception(exc_type, exc_value, exc_traceback, file=f)
        except Exception:
            pass
        try:
            if sys.platform == "win32":
                import ctypes
                ctypes.windll.user32.MessageBoxW(
                    0,
                    f"A critical error occurred:\n\n{exc_value}\n\nDetails saved to:\n{CRASH_LOG_PATH}",
                    "osu! Map Roulette - Crash",
                    0x10
                )
        except Exception:
            pass

    sys.excepthook = handle_exception

setup_crash_logger()

class SafeOutput(io.StringIO):
    def __init__(self, log_path=None):
        super().__init__()
        self.log_path = log_path

    def write(self, s):
        if self.log_path and s:
            try:
                with open(self.log_path, "a", encoding="utf-8", errors="ignore") as f:
                    f.write(s)
            except Exception:
                pass
        return len(s)

    def flush(self):
        pass

    def isatty(self):
        return False

if sys.stdout is None:
    sys.stdout = SafeOutput(LOG_FILE)
if sys.stderr is None:
    sys.stderr = SafeOutput(LOG_FILE)
if sys.stdin is None:
    sys.stdin = io.StringIO("")

import time
import json
import socket
import random
import threading
import urllib.request
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, List
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
import uvicorn

from app.config import load_config, save_config, ConfigModel
from app.osu_api import search_online_beatmaps
from app.local_lazer import get_filtered_local_maps, index_local_lazer_maps, check_lazer_score, get_lazer_player_profile, check_lazer_tilt
from app.pp_calc import get_beatmap_content, calculate_pp_and_stats
from app.downloader import download_osz, launch_in_lazer
from app.collections import export_session_to_osdb, COLLECTIONS_DIR
from app.multiplayer import lobby_manager
from app.overlay import overlay_controller

CURRENT_SPIN_STATE: Dict[str, Any] = {
    "current_card": None,
    "current_stats": None,
    "current_mods": "NM",
    "roll_time": None,
}
_last_sent_score_sig = ""

BASE_DIR = BUNDLE_DIR

app = FastAPI(title="osu! Map Roulette", version="1.0.0")

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

class RollRequest(BaseModel):
    star_min: float = 3.5
    star_max: float = 4.8
    bpm_min: float = 120.0
    bpm_max: float = 260.0
    length_min: int = 30
    length_max: int = 300
    status: str = "ranked"
    roll_mods: bool = True
    smart_mod_filter: bool = True
    pattern_style: str = "any"
    ladder_mode: bool = False
    source_mode: Optional[str] = None

class PlayRequest(BaseModel):
    beatmap_id: int
    beatmapset_id: int
    local_path: Optional[str] = None

class LadderActionRequest(BaseModel):
    action: str  # "win" or "lose"
    step_sr: float = 0.15

class CheckScoreRequest(BaseModel):
    beatmap_id: int
    beatmap_hash: Optional[str] = ""
    since: Optional[str] = None

class HistoryEntry(BaseModel):
    card: Dict[str, Any]
    stats: Optional[Dict[str, Any]] = None
    mods: str = "NM"
    time: str = ""

MOD_POOL = [
    ("NM", 35),
    ("HD", 18),
    ("HR", 14),
    ("DT", 14),
    ("HD+HR", 6),
    ("HD+DT", 6),
    ("DT+HR", 3),
    ("DT+PF", 2),
    ("HR+PF", 2)
]

def pick_random_mod() -> str:
    mods, weights = zip(*MOD_POOL)
    return random.choices(mods, weights=weights, k=1)[0]

@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/overlay")
async def overlay_page():
    return FileResponse(STATIC_DIR / "overlay.html")

@app.get("/api/config")
async def get_config():
    return load_config().model_dump()

@app.post("/api/config")
async def update_config(cfg: ConfigModel):
    save_config(cfg)
    overlay_controller.register_hotkey(cfg.overlay_hotkey, cfg.instant_roll_hotkey)
    return {"status": "ok", "config": cfg.model_dump()}

@app.get("/api/local/status")
async def get_local_status():
    cfg = load_config()
    lazer_path = cfg.lazer_path
    realm_file = Path(lazer_path) / "client.realm"
    has_realm = realm_file.exists()
    exists = os.path.exists(lazer_path)
    maps = index_local_lazer_maps(lazer_path)
    return {
        "lazer_path": lazer_path,
        "exists": exists,
        "has_realm": has_realm,
        "map_count": len(maps)
    }

@app.post("/api/local/reindex")
async def reindex_local():
    cfg = load_config()
    maps = index_local_lazer_maps(cfg.lazer_path, force_reindex=True)
    return {"status": "ok", "map_count": len(maps)}

@app.post("/api/score/check")
async def score_check_endpoint(req: CheckScoreRequest):
    global _last_sent_score_sig
    res = check_lazer_score(req.beatmap_id, req.beatmap_hash or "", req.since)
    if res.get("found") and lobby_manager.room_code:
        sig = f"{req.beatmap_id}_{res.get('total_score')}_{res.get('accuracy')}_{res.get('date')}"
        if sig != _last_sent_score_sig:
            _last_sent_score_sig = sig
            lobby_manager.broadcast_score(res)
    return res


# ========================================================
# OVERLAY API
# ========================================================
@app.post("/api/overlay/open")
async def api_overlay_open(expanded: bool = False):
    return overlay_controller.open_overlay(expanded=expanded)

@app.post("/api/overlay/close")
async def api_overlay_close():
    return overlay_controller.close_overlay()

@app.post("/api/overlay/mode")
async def api_overlay_mode(expanded: bool = False):
    overlay_controller.set_mode(expanded=expanded)
    return {"ok": True, "expanded": overlay_controller.is_expanded}

@app.get("/api/overlay/state")
async def api_overlay_state():
    cfg = load_config()
    st = overlay_controller.get_status()
    return {
        **st,
        "instant_roll_hotkey": cfg.instant_roll_hotkey,
        "auto_launch": cfg.overlay_auto_launch,
        "pending_instant_roll": overlay_controller.consume_pending_roll(),
        "streak": cfg.ladder_streak_current,
        "best_streak": cfg.ladder_streak_best,
        "current_card": CURRENT_SPIN_STATE["current_card"],
        "current_stats": CURRENT_SPIN_STATE["current_stats"],
        "current_mods": CURRENT_SPIN_STATE["current_mods"],
        "roll_time": CURRENT_SPIN_STATE["roll_time"],
    }

@app.post("/api/overlay/auto_launch")
async def api_overlay_auto_launch(enabled: bool = False):
    cfg = load_config()
    cfg.overlay_auto_launch = enabled
    save_config(cfg)
    return {"ok": True, "auto_launch": enabled}


# ========================================================
# MULTIPLAYER LOBBY API
# ========================================================
class LobbyJoinRequest(BaseModel):
    code: str

@app.post("/api/lobby/create")
async def api_lobby_create():
    prof = get_lazer_player_profile()
    return lobby_manager.create_room(
        name=prof.get("username", "osu! Player"),
        avatar=prof.get("avatar_url", "")
    )

@app.post("/api/lobby/join")
async def api_lobby_join(req: LobbyJoinRequest):
    prof = get_lazer_player_profile()
    return lobby_manager.join_room(
        code=req.code,
        name=prof.get("username", "osu! Player"),
        avatar=prof.get("avatar_url", "")
    )

@app.post("/api/lobby/leave")
async def api_lobby_leave():
    return lobby_manager.leave_room()

@app.get("/api/lobby/state")
async def api_lobby_state():
    return lobby_manager.get_state()


# ========================================================
# COLLECTIONS (.osdb) & ANTI-TILT API
# ========================================================
class CollectionExportRequest(BaseModel):
    name: Optional[str] = ""

@app.post("/api/collections/export")
async def api_collections_export(req: CollectionExportRequest):
    hist = []
    if HISTORY_FILE.exists():
        try:
            hist = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        except Exception:
            hist = []
    if not hist and CURRENT_SPIN_STATE["current_card"]:
        hist = [{"card": CURRENT_SPIN_STATE["current_card"]}]
    if not hist:
        raise HTTPException(status_code=400, detail="История сессии пуста — сначала покрутите карты!")

    out_path = export_session_to_osdb(hist, req.name or "")
    return {
        "ok": True,
        "file_path": str(out_path),
        "folder_path": str(COLLECTIONS_DIR),
        "count": len(hist)
    }

@app.post("/api/collections/open_folder")
async def api_collections_open_folder():
    COLLECTIONS_DIR.mkdir(parents=True, exist_ok=True)
    if sys.platform == "win32":
        os.startfile(str(COLLECTIONS_DIR))
    return {"ok": True}

@app.get("/api/tilt/status")
async def api_tilt_status():
    since = CURRENT_SPIN_STATE.get("roll_time")
    return check_lazer_tilt(since_timestamp=since)

@app.get("/api/profile")
async def get_profile_endpoint():
    cfg = load_config()
    lazer_prof = get_lazer_player_profile()

    hist_data = []
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                if isinstance(parsed, dict):
                    hist_data = parsed.get("history", [])
                elif isinstance(parsed, list):
                    hist_data = parsed
        except Exception:
            hist_data = []

    playstyle_counts = {"aim": 0, "flow_aim": 0, "stream": 0, "tech": 0, "balanced": 0}
    for item in hist_data:
        card = item.get("card", {})
        pst = card.get("playstyle", "balanced")
        if pst in playstyle_counts:
            playstyle_counts[pst] += 1
        else:
            playstyle_counts["balanced"] += 1

    return {
        "lazer": lazer_prof,
        "roulette": {
            "total_spins": len(hist_data),
            "ladder_streak_current": cfg.ladder_streak_current,
            "ladder_streak_best": cfg.ladder_streak_best,
            "playstyles": playstyle_counts
        }
    }

@app.get("/api/history")
async def get_history_endpoint():
    cfg = load_config()
    hist_data = []
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                if isinstance(parsed, dict):
                    hist_data = parsed.get("history", [])
                elif isinstance(parsed, list):
                    hist_data = parsed
        except Exception:
            hist_data = []
    return {
        "history": hist_data,
        "ladder_streak_current": cfg.ladder_streak_current,
        "ladder_streak_best": cfg.ladder_streak_best
    }

@app.post("/api/history")
async def save_history_endpoint(entry: HistoryEntry):
    hist_data = []
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                parsed = json.load(f)
                if isinstance(parsed, dict):
                    hist_data = parsed.get("history", [])
                elif isinstance(parsed, list):
                    hist_data = parsed
        except Exception:
            hist_data = []

    hist_data.insert(0, entry.model_dump())
    hist_data = hist_data[:60]  # keep up to 60 items
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump({"history": hist_data}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[History] Error saving history: {e}")

    return {"status": "ok", "count": len(hist_data)}

@app.delete("/api/history")
async def clear_history_endpoint():
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump({"history": []}, f)
    except Exception:
        pass
    return {"status": "ok"}

@app.post("/api/roll")
async def roll_roulette(req: RollRequest):
    cfg = load_config()
    source = req.source_mode or cfg.source_mode or "local"

    # Step 1: Pre-select mod if mods are enabled
    selected_mod = pick_random_mod() if req.roll_mods else "NM"

    # Step 2: Fetch candidates
    if source == "local":
        candidates = get_filtered_local_maps(
            star_min=req.star_min,
            star_max=req.star_max,
            bpm_min=req.bpm_min,
            bpm_max=req.bpm_max,
            length_min=req.length_min,
            length_max=req.length_max,
            status_filter=req.status,
            mods=selected_mod,
            smart_mod_filter=req.smart_mod_filter,
            pattern_style=req.pattern_style,
            limit=60
        )
    else:
        # Online search with smart mod factor adjustments
        target_sr_min = req.star_min
        target_sr_max = req.star_max
        target_bpm_min = req.bpm_min
        target_bpm_max = req.bpm_max

        if req.smart_mod_filter and selected_mod != "NM":
            has_dt = "DT" in selected_mod
            has_hr = "HR" in selected_mod
            clock = 1.5 if has_dt else 1.0
            sr_factor = 1.45 if (has_dt and has_hr) else (1.38 if has_dt else (1.08 if has_hr else 1.0))
            target_sr_min = max(0.0, req.star_min / sr_factor)
            target_sr_max = req.star_max / sr_factor
            target_bpm_min = req.bpm_min / clock
            target_bpm_max = req.bpm_max / clock

        try:
            candidates = await search_online_beatmaps(
                star_min=target_sr_min,
                star_max=target_sr_max,
                bpm_min=target_bpm_min,
                bpm_max=target_bpm_max,
                length_min=req.length_min,
                length_max=req.length_max,
                status_filter=req.status,
                limit=60
            )
        except Exception as e:
            print(f"[API] Online search failed: {e}")
            candidates = []

    if not candidates:
        mod_hint = f" с модом {selected_mod}" if (req.roll_mods and req.smart_mod_filter and selected_mod != "NM") else ""
        pat_hint = f", стиль: {req.pattern_style}" if req.pattern_style != "any" else ""
        raise HTTPException(
            status_code=404,
            detail=f"Не найдено карт по фильтрам ({req.star_min}★–{req.star_max}★, {req.status}{mod_hint}{pat_hint}). Попробуйте расширить диапазон!"
        )

    # Prepare reel of 50 items for smooth CS2 case opening
    total_reel_items = 50
    winner_idx = 38  # CS2 style: winner lands near 75-80% of reel length

    reel = []
    while len(reel) < total_reel_items:
        reel.extend(random.sample(candidates, min(len(candidates), total_reel_items - len(reel))))

    winner_card = candidates[random.randint(0, len(candidates) - 1)]
    reel[winner_idx] = winner_card

    # PP & Star Rating calculation
    beatmap_bytes = await get_beatmap_content(
        winner_card["beatmap_id"],
        winner_card.get("local_path")
    )

    stats = None
    if beatmap_bytes:
        stats = calculate_pp_and_stats(
            beatmap_bytes=beatmap_bytes,
            mods=selected_mod,
            base_bpm=winner_card["bpm"]
        )
    else:
        # Fallback if .osu cannot be read
        stats = {
            "stars": winner_card.get("modded_sr", winner_card["difficulty_rating"]),
            "max_combo": 0,
            "bpm": winner_card.get("modded_bpm", winner_card["bpm"]),
            "ar": winner_card["ar"],
            "od": winner_card["od"],
            "cs": winner_card["cs"],
            "hp": winner_card["hp"],
            "pp_95": 0.0,
            "pp_98": 0.0,
            "pp_99": 0.0,
            "pp_100": 0.0,
            "mods": selected_mod
        }

    now_iso = datetime.now(timezone.utc).isoformat()
    playstyle = winner_card.get("playstyle", "balanced")
    playstyle_name = winner_card.get("playstyle_name", "Balanced")

    CURRENT_SPIN_STATE["current_card"] = winner_card
    CURRENT_SPIN_STATE["current_stats"] = stats
    CURRENT_SPIN_STATE["current_mods"] = selected_mod
    CURRENT_SPIN_STATE["roll_time"] = now_iso

    payload = {
        "reel": reel,
        "winner_index": winner_idx,
        "winner": winner_card,
        "mods": selected_mod,
        "stats": stats,
        "playstyle": playstyle,
        "playstyle_name": playstyle_name,
        "source": source,
        "roll_time": now_iso
    }

    # Broadcast spin to multiplayer lobby if connected
    if lobby_manager.room_code:
        lobby_manager.broadcast_spin({
            "winner": winner_card,
            "mods": selected_mod,
            "stats": stats,
            "playstyle": playstyle,
            "playstyle_name": playstyle_name,
            "roll_time": now_iso,
            "reel_sample": reel[:12] + [winner_card]
        })

    return payload

@app.post("/api/play")
async def play_beatmap(req: PlayRequest):
    osz_file = None
    
    # If not local or file not present, download .osz
    if not req.local_path or not os.path.exists(req.local_path):
        osz_file = await download_osz(req.beatmapset_id)

    launch_res = launch_in_lazer(req.beatmap_id, osz_file)
    return {
        "status": "launched" if launch_res["success"] else "failed",
        "method": launch_res["method"],
        "osz_path": str(osz_file) if osz_file else None
    }

@app.post("/api/ladder/action")
async def ladder_action(req: LadderActionRequest):
    cfg = load_config()
    if req.action == "win":
        cfg.ladder_streak_current += 1
        if cfg.ladder_streak_current > cfg.ladder_streak_best:
            cfg.ladder_streak_best = cfg.ladder_streak_current
        save_config(cfg)
        return {
            "status": "win",
            "current_streak": cfg.ladder_streak_current,
            "best_streak": cfg.ladder_streak_best
        }
    else:
        cfg.ladder_streak_current = 0
        save_config(cfg)
        return {
            "status": "lose",
            "current_streak": 0,
            "best_streak": cfg.ladder_streak_best
        }

def start_server_reliably(start_port: int = 8000, max_ports: int = 50):
    """
    Starts Uvicorn in a daemon thread, trying ports starting from start_port.
    Strictly verifies that:
      1) The server thread is alive and server.started is True
      2) An HTTP GET to http://127.0.0.1:{port}/ returns 200 OK
    Returns (port, server, thread)
    """
    for port in range(start_port, start_port + max_ports):
        # Quick check if port is currently free
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
            except OSError:
                continue

        server_error = [None]
        config = uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False
        )
        server = uvicorn.Server(config)

        def run_srv(srv=server):
            try:
                srv.run()
            except Exception as e:
                server_error[0] = e

        t = threading.Thread(target=run_srv, daemon=True)
        t.start()

        # Wait up to 6 seconds for server to start and return 200 OK
        start_time = time.time()
        ready = False
        while time.time() - start_time < 6.0:
            if server_error[0] is not None or not t.is_alive():
                break
            if getattr(server, "started", False):
                try:
                    req = urllib.request.Request(f"http://127.0.0.1:{port}/")
                    with urllib.request.urlopen(req, timeout=1.0) as resp:
                        if resp.status == 200:
                            ready = True
                            break
                except Exception:
                    pass
            time.sleep(0.08)

        if ready:
            print(f"[Server] Successfully started and verified on http://127.0.0.1:{port}")
            return port, server, t

        # Port failed to respond or errored, exit server cleanly and try next
        server.should_exit = True
        t.join(timeout=0.4)

    raise RuntimeError("Failed to start backend server on any port in range 8000-8050")

def apply_win32_taskbar_icon(icon_path: Path):
    """Enforce window and taskbar icons via Win32 SendMessageW (WM_SETICON)"""
    if sys.platform != "win32" or not icon_path.exists():
        return
    try:
        import ctypes
        IMAGE_ICON = 1
        LR_LOADFROMFILE = 0x00000010
        WM_SETICON = 0x0080
        ICON_SMALL = 0
        ICON_BIG = 1

        hicon_sm = ctypes.windll.user32.LoadImageW(0, str(icon_path), IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
        hicon_bg = ctypes.windll.user32.LoadImageW(0, str(icon_path), IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
        if not hicon_bg:
            hicon_bg = ctypes.windll.user32.LoadImageW(0, str(icon_path), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | 0x00000040)

        for _ in range(80):
            time.sleep(0.1)
            hwnd = ctypes.windll.user32.FindWindowW(None, "osu! Map Roulette")
            if hwnd:
                if hicon_sm:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_sm)
                if hicon_bg:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_bg)
                break
    except Exception as ex:
        print(f"[Icon] Failed to set Win32 icon: {ex}")

def start_app():
    try:
        port, server, server_thread = start_server_reliably()
    except Exception as err:
        print(f"[Fatal] Server startup failed: {err}")
        return

    overlay_controller.set_port(port)
    overlay_controller.start_osu_process_watcher()

    # Pre-index local lazer library in background thread so startup is instant
    cfg = load_config()
    overlay_controller.register_hotkey(cfg.overlay_hotkey, cfg.instant_roll_hotkey)
    try:
        threading.Thread(target=index_local_lazer_maps, args=(cfg.lazer_path,), daemon=True).start()
    except Exception as e:
        print(f"[Startup] Pre-index warning: {e}")

    url = f"http://127.0.0.1:{port}"
    use_browser = "--browser" in sys.argv

    if not use_browser:
        try:
            import webview
            print(f"[DesktopApp] Opening native desktop window on {url} ...")
            
            icon_ico = ASSETS_DIR / "icon.ico"
            icon_arg = str(icon_ico) if icon_ico.exists() else None

            # Spawn background thread to set Win32 window and taskbar icons
            if icon_ico.exists():
                threading.Thread(target=apply_win32_taskbar_icon, args=(icon_ico,), daemon=True).start()

            window = webview.create_window(
                title="osu! Map Roulette",
                url=url,
                width=1340,
                height=860,
                min_size=(1050, 700),
                background_color="#0c0c0e"
            )

            force_quit = [False]
            tray_holder = [None]

            def on_closing():
                if not force_quit[0]:
                    try:
                        window.hide()
                    except Exception:
                        pass
                    return False
                return True

            window.events.closing += on_closing

            def start_tray():
                try:
                    import pystray
                    from PIL import Image

                    tray_img_path = icon_ico if icon_ico.exists() else (ASSETS_DIR / "icon.png")
                    if not tray_img_path.exists():
                        return
                    img = Image.open(tray_img_path)

                    def action_open(icon, item):
                        try:
                            window.show()
                            window.restore()
                            if sys.platform == "win32":
                                import ctypes
                                hwnd = ctypes.windll.user32.FindWindowW(None, "osu! Map Roulette")
                                if hwnd:
                                    ctypes.windll.user32.SetForegroundWindow(hwnd)
                        except Exception:
                            pass

                    def action_quick_roll(icon, item):
                        overlay_controller.trigger_instant_roll()

                    def action_toggle_overlay(icon, item):
                        if overlay_controller.is_open:
                            overlay_controller.close_overlay()
                        else:
                            overlay_controller.open_overlay(expanded=True)

                    def action_quit(icon, item):
                        force_quit[0] = True
                        try:
                            overlay_controller.unhook_hotkeys()
                            overlay_controller.close_overlay()
                        except Exception:
                            pass
                        try:
                            lobby_manager.leave_room()
                        except Exception:
                            pass
                        try:
                            icon.stop()
                        except Exception:
                            pass
                        server.should_exit = True
                        try:
                            window.destroy()
                        except Exception:
                            os._exit(0)

                    menu = pystray.Menu(
                        pystray.MenuItem("Открыть окно рулетки", action_open, default=True),
                        pystray.MenuItem("Быстрая крутка (Quick Roll)", action_quick_roll),
                        pystray.MenuItem("Показать / Скрыть оверлей", action_toggle_overlay),
                        pystray.Menu.SEPARATOR,
                        pystray.MenuItem("Выход", action_quit),
                    )
                    tray = pystray.Icon("osu_map_roulette", img, "osu! Map Roulette", menu)
                    tray_holder[0] = tray
                    tray.run()
                except Exception as ex:
                    print(f"[Tray] Tray init warning: {ex}")

            threading.Thread(target=start_tray, daemon=True).start()

            webview.start(icon=icon_arg)
            if tray_holder[0]:
                try:
                    tray_holder[0].stop()
                except Exception:
                    pass
            overlay_controller.unhook_hotkeys()
            server.should_exit = True
            return
        except Exception as ex:
            print(f"[DesktopApp] Pywebview start failed, falling back to browser: {ex}")

    webbrowser.open(url)
    try:
        server_thread.join()
    except KeyboardInterrupt:
        server.should_exit = True

if __name__ == "__main__":
    try:
        start_app()
    except Exception as ex:
        try:
            CRASH_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(CRASH_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(f"\n[{datetime.now().isoformat()}] FATAL STARTUP ERROR:\n")
                traceback.print_exc(file=f)
        except Exception:
            pass
        if sys.platform == "win32":
            try:
                import ctypes
                ctypes.windll.user32.MessageBoxW(0, f"Critical error during startup:\n{ex}\n\nCheck crash.log", "osu! Map Roulette", 0x10)
            except Exception:
                pass
        sys.exit(1)
