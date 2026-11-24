import sys
import time
import ctypes
import threading
from ctypes import wintypes
from typing import Optional
from .config import load_config

OVERLAY_TITLE = "osu! Map Roulette Overlay"

GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
WS_EX_TRANSPARENT = 0x00000020
WS_EX_TOOLWINDOW = 0x00000080
WS_EX_TOPMOST = 0x00000008
HWND_TOPMOST = -1
SWP_NOMOVE = 0x0002
SWP_NOSIZE = 0x0001
SWP_NOACTIVATE = 0x0010
SWP_FRAMECHANGED = 0x0020


def is_osu_process_running() -> bool:
    """Check if osu!.exe is running using Win32 Toolhelp32Snapshot (zero subprocess / zero cmd flash)."""
    if sys.platform != "win32":
        return False

    TH32CS_SNAPPROCESS = 0x00000002

    class PROCESSENTRY32W(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(ctypes.c_ulong)),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", ctypes.c_wchar * 260),
        ]

    kernel32 = ctypes.windll.kernel32
    snapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    if snapshot == -1:
        return False

    try:
        entry = PROCESSENTRY32W()
        entry.dwSize = ctypes.sizeof(PROCESSENTRY32W)
        if not kernel32.Process32FirstW(snapshot, ctypes.byref(entry)):
            return False
        while True:
            exe_name = entry.szExeFile.lower()
            if exe_name in ("osu!.exe", "osu.exe"):
                return True
            if not kernel32.Process32NextW(snapshot, ctypes.byref(entry)):
                break
    except Exception:
        pass
    finally:
        kernel32.CloseHandle(snapshot)

    return False


class OverlayController:
    def __init__(self):
        self.window = None
        self.port: int = 8000
        self.is_open: bool = False
        self.is_expanded: bool = False
        self.pending_instant_roll: bool = False
        self._registered_hotkeys: list[str] = []
        self._monitor_started: bool = False
        self._lock = threading.Lock()

    def set_port(self, port: int):
        self.port = port

    def start_osu_process_watcher(self):
        if self._monitor_started:
            return
        self._monitor_started = True

        def _watch():
            was_running = False
            while True:
                time.sleep(5.0)
                try:
                    cfg = load_config()
                    if not cfg.overlay_autostart:
                        continue
                    running = is_osu_process_running()
                    if running and not was_running and not self.is_open:
                        self.open_overlay(expanded=False)
                    was_running = running
                except Exception:
                    pass

        threading.Thread(target=_watch, daemon=True).start()

    def _get_hwnd(self) -> int:
        if sys.platform != "win32":
            return 0
        return ctypes.windll.user32.FindWindowW(None, OVERLAY_TITLE)

    def _apply_win32_mode(self, expanded: bool):
        if sys.platform != "win32":
            return
        hwnd = self._get_hwnd()
        if not hwnd:
            return

        user32 = ctypes.windll.user32
        ex_style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)

        if expanded:
            new_style = (ex_style | WS_EX_LAYERED | WS_EX_TOPMOST | WS_EX_TOOLWINDOW) & ~WS_EX_TRANSPARENT
            user32.SetWindowLongW(hwnd, GWL_EXSTYLE, new_style)
            # Center on primary screen
            screen_w = user32.GetSystemMetrics(0)
            screen_h = user32.GetSystemMetrics(1)
            w, h = 920, 560
            x = max(0, (screen_w - w) // 2)
            y = max(0, (screen_h - h) // 2)
            user32.SetWindowPos(hwnd, HWND_TOPMOST, x, y, w, h, SWP_FRAMECHANGED)
            user32.SetForegroundWindow(hwnd)
        else:
            # Click-through mode! All mouse clicks pass straight to osu!(lazer)
            new_style = ex_style | WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOPMOST | WS_EX_TOOLWINDOW
            user32.SetWindowLongW(hwnd, GWL_EXSTYLE, new_style)
            user32.SetWindowPos(hwnd, HWND_TOPMOST, 24, 24, 360, 118, SWP_NOACTIVATE | SWP_FRAMECHANGED)

    def register_hotkey(self, hotkey_str: str = "", instant_roll_str: str = ""):
        try:
            import keyboard
            for old_hk in self._registered_hotkeys:
                try:
                    keyboard.remove_hotkey(old_hk)
                except Exception:
                    pass
            self._registered_hotkeys.clear()

            cfg = load_config()
            hk_overlay = (hotkey_str or cfg.overlay_hotkey or "F9").strip().lower()
            hk_instant = (instant_roll_str or cfg.instant_roll_hotkey or "Alt+R").strip().lower()

            if hk_overlay:
                keyboard.add_hotkey(hk_overlay, self.toggle_mode)
                self._registered_hotkeys.append(hk_overlay)

            if hk_instant and hk_instant != hk_overlay:
                keyboard.add_hotkey(hk_instant, self.trigger_instant_roll)
                self._registered_hotkeys.append(hk_instant)
        except Exception as e:
            print(f"[Overlay] Hotkey registration warning: {e}")

    def unhook_hotkeys(self):
        try:
            import keyboard
            for old_hk in self._registered_hotkeys:
                try:
                    keyboard.remove_hotkey(old_hk)
                except Exception:
                    pass
            self._registered_hotkeys.clear()
        except Exception:
            pass

    def trigger_instant_roll(self):
        """Expand overlay (or open it) and immediately start a roulette spin."""
        if not self.is_open or self.window is None:
            self.pending_instant_roll = True
            self.open_overlay(expanded=True)
            return

        if not self.is_expanded:
            self.set_mode(True)

        try:
            self.window.evaluate_js("triggerInstantRoll()")
        except Exception:
            self.pending_instant_roll = True

    def consume_pending_roll(self) -> bool:
        if self.pending_instant_roll:
            self.pending_instant_roll = False
            return True
        return False

    def open_overlay(self, expanded: bool = False):
        with self._lock:
            if self.is_open and self.window is not None:
                self.set_mode(expanded)
                return {"ok": True, "already_open": True, "expanded": self.is_expanded}

            try:
                import webview
                cfg = load_config()
                self.is_expanded = expanded
                url = f"http://127.0.0.1:{self.port}/overlay"

                w, h = (920, 560) if expanded else (360, 118)
                x, y = (200, 120) if expanded else (24, 24)

                self.window = webview.create_window(
                    title=OVERLAY_TITLE,
                    url=url,
                    width=w,
                    height=h,
                    x=x,
                    y=y,
                    frameless=True,
                    transparent=True,
                    on_top=True,
                    easy_drag=False,
                    background_color="#000000"
                )
                self.is_open = True

                def on_closed():
                    self.is_open = False
                    self.window = None

                self.window.events.closed += on_closed

                def _init_win32():
                    for _ in range(40):
                        time.sleep(0.1)
                        if self._get_hwnd():
                            self._apply_win32_mode(self.is_expanded)
                            break

                threading.Thread(target=_init_win32, daemon=True).start()
                self.register_hotkey(cfg.overlay_hotkey, cfg.instant_roll_hotkey)

                return {"ok": True, "expanded": self.is_expanded}
            except Exception as e:
                print(f"[Overlay] Failed to open overlay: {e}")
                return {"ok": False, "error": str(e)}

    def close_overlay(self):
        with self._lock:
            if self.window is not None:
                try:
                    self.window.destroy()
                except Exception:
                    pass
                self.window = None
            self.is_open = False
            return {"ok": True}

    def set_mode(self, expanded: bool):
        if not self.is_open or self.window is None:
            return
        self.is_expanded = expanded
        self._apply_win32_mode(expanded)
        try:
            mode_str = "expanded" if expanded else "compact"
            self.window.evaluate_js(f"setOverlayMode('{mode_str}')")
        except Exception:
            pass

    def toggle_mode(self):
        if not self.is_open or self.window is None:
            self.open_overlay(expanded=True)
            return
        self.set_mode(not self.is_expanded)

    def get_status(self):
        cfg = load_config()
        return {
            "is_open": self.is_open,
            "is_expanded": self.is_expanded,
            "hotkey": cfg.overlay_hotkey,
            "osu_running": is_osu_process_running(),
        }


overlay_controller = OverlayController()
