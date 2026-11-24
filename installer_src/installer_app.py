import os
import sys
import time
import json
import base64
import shutil
import winreg
import zipfile
import threading
import subprocess
from pathlib import Path

if sys.platform == "win32":
    try:
        import ctypes
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("osu.map.roulette.setup")
    except Exception:
        pass

import webview

if getattr(sys, "frozen", False):
    BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", sys.executable)).resolve()
else:
    BUNDLE_DIR = Path(__file__).resolve().parent

UI_HTML_PATH = BUNDLE_DIR / "setup_ui.html"
PAYLOAD_ZIP_PATH = BUNDLE_DIR / "payload.zip"
HERO_ART_PATH = BUNDLE_DIR / "custom_icon.png"
ICON_ICO_PATH = BUNDLE_DIR / "icon.ico"

APP_NAME = "osu! Map Roulette"
APP_VERSION = "1.0.0"
EXE_NAME = "osu! Map Roulette.exe"
UNINSTALL_REG_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\osuMapRoulette"

window = None


def apply_win32_icon(title: str, icon_path: Path):
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

        for _ in range(60):
            time.sleep(0.1)
            hwnd = ctypes.windll.user32.FindWindowW(None, title)
            if hwnd:
                if hicon_sm:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_sm)
                if hicon_bg:
                    ctypes.windll.user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_bg)
                break
    except Exception:
        pass


def create_shortcut(lnk_path: Path, target_exe: Path, icon_path: Path, working_dir: Path):
    lnk_path.parent.mkdir(parents=True, exist_ok=True)
    ps_script = (
        f'$WshShell = New-Object -ComObject WScript.Shell; '
        f'$Shortcut = $WshShell.CreateShortcut("{str(lnk_path)}"); '
        f'$Shortcut.TargetPath = "{str(target_exe)}"; '
        f'$Shortcut.WorkingDirectory = "{str(working_dir)}"; '
        f'$Shortcut.IconLocation = "{str(icon_path)},0"; '
        f'$Shortcut.Description = "{APP_NAME}"; '
        f'$Shortcut.Save()'
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps_script],
        capture_output=True,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        timeout=15
    )


def register_uninstaller(install_path: Path, icon_path: Path):
    uninstall_ps = install_path / "uninstall.ps1"
    desktop_lnk = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop" / f"{APP_NAME}.lnk"
    start_dir = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / APP_NAME

    ps_content = f'''
Stop-Process -Name "osu! Map Roulette" -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400
Remove-Item -Path "{desktop_lnk}" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "{start_dir}" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\\{UNINSTALL_REG_KEY}" -Force -ErrorAction SilentlyContinue
Start-Process cmd -ArgumentList '/c timeout /t 1 /nobreak >nul & rmdir /s /q "{install_path}"' -WindowStyle Hidden
'''
    uninstall_ps.write_text(ps_content.strip(), encoding="utf-8")

    uninstall_cmd = f'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{uninstall_ps}"'
    try:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, UNINSTALL_REG_KEY) as key:
            winreg.SetValueEx(key, "DisplayName", 0, winreg.REG_SZ, APP_NAME)
            winreg.SetValueEx(key, "DisplayVersion", 0, winreg.REG_SZ, APP_VERSION)
            winreg.SetValueEx(key, "Publisher", 0, winreg.REG_SZ, "osu! Map Roulette Team")
            winreg.SetValueEx(key, "DisplayIcon", 0, winreg.REG_SZ, str(icon_path))
            winreg.SetValueEx(key, "InstallLocation", 0, winreg.REG_SZ, str(install_path))
            winreg.SetValueEx(key, "UninstallString", 0, winreg.REG_SZ, uninstall_cmd)
            winreg.SetValueEx(key, "NoModify", 0, winreg.REG_DWORD, 1)
            winreg.SetValueEx(key, "NoRepair", 0, winreg.REG_DWORD, 1)
    except Exception:
        pass


class SetupApi:
    def get_init_info(self):
        default_dir = str(Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "Programs" / APP_NAME)
        hero_b64 = ""
        if HERO_ART_PATH.exists():
            hero_b64 = base64.b64encode(HERO_ART_PATH.read_bytes()).decode("ascii")
        return {
            "default_dir": default_dir,
            "hero_art_b64": hero_b64
        }

    def minimize_window(self):
        if window:
            window.minimize()

    def close_window(self):
        if window:
            window.destroy()

    def browse_dir(self):
        if not window:
            return ""
        folder_dialog = webview.FileDialog.FOLDER if hasattr(webview, "FileDialog") else 20
        res = window.create_file_dialog(folder_dialog)
        if res and len(res) > 0:
            selected = Path(res[0])
            if selected.name != APP_NAME:
                selected = selected / APP_NAME
            return str(selected)
        return ""

    def start_install(self, install_dir: str, create_desktop: bool, create_startmenu: bool):
        threading.Thread(
            target=self._install_worker,
            args=(install_dir, create_desktop, create_startmenu),
            daemon=True
        ).start()

    def _install_worker(self, install_dir: str, create_desktop: bool, create_startmenu: bool):
        try:
            target_dir = Path(install_dir)

            # Stop any existing running app instance
            subprocess.run(
                ["taskkill", "/F", "/IM", EXE_NAME],
                capture_output=True,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
            )
            time.sleep(0.25)

            target_dir.mkdir(parents=True, exist_ok=True)

            if not PAYLOAD_ZIP_PATH.exists():
                raise FileNotFoundError("Внутренний архив payload.zip не найден!")

            with zipfile.ZipFile(PAYLOAD_ZIP_PATH, "r") as zf:
                members = zf.infolist()
                total = max(len(members), 1)
                last_ui_update = 0.0

                for idx, member in enumerate(members, start=1):
                    zf.extract(member, target_dir)
                    now = time.time()
                    if now - last_ui_update > 0.05 or idx == total:
                        pct = int((idx / total) * 88)
                        fname = member.filename.replace("\\", "/")
                        if len(fname) > 48:
                            fname = "..." + fname[-45:]
                        if window:
                            window.evaluate_js(
                                f'updateProgress({pct}, "Распаковка файлов...", {json.dumps(fname)})'
                            )
                        last_ui_update = now

            exe_path = target_dir / EXE_NAME
            icon_path = target_dir / "_internal" / "assets" / "icon.ico"
            if not icon_path.exists():
                icon_path = exe_path

            if window:
                window.evaluate_js('updateProgress(92, "Создание ярлыков...", "Настройка Рабочего стола и меню Пуск")')

            if create_desktop:
                desktop_lnk = Path(os.environ.get("USERPROFILE", str(Path.home()))) / "Desktop" / f"{APP_NAME}.lnk"
                create_shortcut(desktop_lnk, exe_path, icon_path, target_dir)

            if create_startmenu:
                start_lnk = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / APP_NAME / f"{APP_NAME}.lnk"
                create_shortcut(start_lnk, exe_path, icon_path, target_dir)

            if window:
                window.evaluate_js('updateProgress(97, "Регистрация приложения...", "Запись данных деинсталлятора")')

            register_uninstaller(target_dir, icon_path)

            if window:
                window.evaluate_js("onInstallComplete()")

        except Exception as exc:
            if window:
                window.evaluate_js(f"onInstallError({json.dumps(str(exc))})")

    def finish_setup(self, install_dir: str, launch_app: bool):
        if launch_app:
            exe_path = Path(install_dir) / EXE_NAME
            if exe_path.exists():
                try:
                    os.startfile(str(exe_path))
                except Exception:
                    subprocess.Popen(
                        [str(exe_path)],
                        cwd=str(install_dir),
                        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
                    )
        if window:
            window.destroy()


def main():
    global window
    api = SetupApi()
    html_content = UI_HTML_PATH.read_text(encoding="utf-8")

    if ICON_ICO_PATH.exists():
        threading.Thread(
            target=apply_win32_icon,
            args=("Установка osu! Map Roulette", ICON_ICO_PATH),
            daemon=True
        ).start()

    window = webview.create_window(
        title="Установка osu! Map Roulette",
        html=html_content,
        js_api=api,
        width=780,
        height=490,
        resizable=False,
        frameless=True,
        easy_drag=False,
        background_color="#09090b"
    )
    icon_arg = str(ICON_ICO_PATH) if ICON_ICO_PATH.exists() else None
    webview.start(icon=icon_arg)


if __name__ == "__main__":
    main()
