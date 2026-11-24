import os
import sys
import json
import random
import subprocess
from pathlib import Path
from typing import List, Dict, Any, Optional
import rosu_pp_py
from .config import load_config
from .pp_calc import normalize_mods
from .playstyle import analyze_playstyle, PLAYSTYLE_NAMES
from .paths import LOCAL_MAPS_CACHE, get_realm_reader_path

CACHE_FILE = LOCAL_MAPS_CACHE
READER_EXE, READER_PROJECT = get_realm_reader_path()

def parse_osu_metadata(content_str: str) -> Dict[str, str]:
    """Extract metadata fields from raw .osu string (fallback parser)"""
    meta = {
        "title": "Unknown Title",
        "title_unicode": "",
        "artist": "Unknown Artist",
        "artist_unicode": "",
        "creator": "Unknown Mapper",
        "version": "Normal",
        "beatmap_id": "0",
        "beatmapset_id": "0"
    }
    
    for line in content_str.splitlines():
        line = line.strip()
        if not line or line.startswith("[") or line.startswith("//"):
            continue
        if ":" in line:
            key, val = line.split(":", 1)
            key, val = key.strip(), val.strip()
            if key == "Title": meta["title"] = val
            elif key == "TitleUnicode": meta["title_unicode"] = val
            elif key == "Artist": meta["artist"] = val
            elif key == "ArtistUnicode": meta["artist_unicode"] = val
            elif key == "Creator": meta["creator"] = val
            elif key == "Version": meta["version"] = val
            elif key == "BeatmapID": meta["beatmap_id"] = val
            elif key == "BeatmapSetID": meta["beatmapset_id"] = val

    if not meta["title_unicode"]: meta["title_unicode"] = meta["title"]
    if not meta["artist_unicode"]: meta["artist_unicode"] = meta["artist"]
    return meta

def run_realm_reader(realm_path: Path) -> bool:
    """Run the C# Realm reader tool to parse client.realm directly into CACHE_FILE"""
    try:
        cmd = []
        if READER_EXE.exists():
            cmd = [str(READER_EXE), str(realm_path), str(CACHE_FILE)]
        elif READER_PROJECT.exists():
            cmd = ["dotnet", "run", "--project", str(READER_PROJECT.parent), "--", str(realm_path), str(CACHE_FILE)]
        else:
            print("[LocalLazer] Neither realm_reader.exe nor csproj found!")
            return False

        print(f"[LocalLazer] Executing realm reader: {' '.join(cmd)}")
        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, creationflags=creationflags)
        if result.returncode == 0 and CACHE_FILE.exists():
            print(f"[LocalLazer] Realm reader succeeded: {result.stdout.strip()}")
            return True
        else:
            print(f"[LocalLazer] Realm reader error (code {result.returncode}): {result.stderr or result.stdout}")
            return False
    except Exception as e:
        print(f"[LocalLazer] Exception running realm reader: {e}")
        return False

def get_lazer_player_profile() -> Dict[str, Any]:
    """Retrieve player profile, stats and scores from client.realm"""
    cfg = load_config()
    realm_path = Path(cfg.lazer_path) / "client.realm"
    default_profile = {
        "found": False,
        "username": "osu! Player",
        "online_id": 0,
        "avatar_url": "https://assets.ppy.sh/favicon/favicon-32x32.png",
        "country_code": "",
        "total_scores": 0,
        "passed_scores": 0,
        "max_pp": 0.0,
        "count_ss": 0,
        "count_s": 0,
        "count_a": 0
    }

    if not realm_path.exists():
        return default_profile

    try:
        cmd = []
        if READER_EXE.exists():
            cmd = [str(READER_EXE), "get_profile", str(realm_path)]
        elif READER_PROJECT.exists():
            cmd = ["dotnet", "run", "--project", str(READER_PROJECT.parent), "--", "get_profile", str(realm_path)]
        else:
            return default_profile

        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=creationflags)
        output = res.stdout.strip()
        for line in reversed(output.splitlines()):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                return json.loads(line)
        return default_profile
    except Exception as e:
        print(f"[LocalLazer] Error getting player profile: {e}")
        return default_profile

def check_lazer_score(
    beatmap_id: int,
    beatmap_hash: str = "",
    since_timestamp: Optional[str] = None
) -> Dict[str, Any]:
    """Check newest score for beatmap in client.realm"""
    cfg = load_config()
    realm_path = Path(cfg.lazer_path) / "client.realm"
    if not realm_path.exists():
        return {"found": False, "error": "client.realm not found"}

    try:
        cmd = []
        args_tail = ["check_score", str(realm_path), str(beatmap_id), beatmap_hash or ""]
        if since_timestamp:
            args_tail.append(since_timestamp)

        if READER_EXE.exists():
            cmd = [str(READER_EXE)] + args_tail
        elif READER_PROJECT.exists():
            cmd = ["dotnet", "run", "--project", str(READER_PROJECT.parent), "--"] + args_tail
        else:
            return {"found": False, "error": "realm_reader tool not found"}

        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=creationflags)
        output = res.stdout.strip()
        for line in reversed(output.splitlines()):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                return json.loads(line)

        return {"found": False, "raw": output}
    except Exception as e:
        print(f"[LocalLazer] Error checking score: {e}")
        return {"found": False, "error": str(e)}


def check_lazer_tilt(since_timestamp: Optional[str] = None) -> Dict[str, Any]:
    """Check if player had 3+ rapid consecutive fails/retries in client.realm"""
    cfg = load_config()
    realm_path = Path(cfg.lazer_path) / "client.realm"
    if not realm_path.exists():
        return {"tilting": False, "consecutive_fails": 0}

    try:
        args_tail = ["check_tilt", str(realm_path)]
        if since_timestamp:
            args_tail.append(since_timestamp)

        if READER_EXE.exists():
            cmd = [str(READER_EXE)] + args_tail
        elif READER_PROJECT.exists():
            cmd = ["dotnet", "run", "--project", str(READER_PROJECT.parent), "--"] + args_tail
        else:
            return {"tilting": False, "consecutive_fails": 0}

        creationflags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=10, creationflags=creationflags)
        output = res.stdout.strip()
        for line in reversed(output.splitlines()):
            line = line.strip()
            if line.startswith("{") and line.endswith("}"):
                return json.loads(line)
        return {"tilting": False, "consecutive_fails": 0}
    except Exception as e:
        print(f"[LocalLazer] Error checking tilt: {e}")
        return {"tilting": False, "consecutive_fails": 0}

def index_via_files_fallback(files_dir: Path) -> List[Dict[str, Any]]:
    """Fallback indexer by walking files/ if client.realm is unavailable"""
    print(f"[LocalLazer] Running fallback file-walker on {files_dir}...")
    indexed_maps: List[Dict[str, Any]] = []

    for root, _, files in os.walk(files_dir):
        for f in files:
            file_path = os.path.join(root, f)
            try:
                with open(file_path, "rb") as h:
                    header = h.read(17)
                    if header != b"osu file format v":
                        continue
                    h.seek(0)
                    raw_bytes = h.read()

                b = rosu_pp_py.Beatmap(bytes=raw_bytes)
                if b.mode != rosu_pp_py.GameMode.Osu:
                    continue

                diff = rosu_pp_py.Difficulty().calculate(b)
                sr = round(getattr(diff, "stars", 0.0), 2)

                text = raw_bytes.decode("utf-8", errors="ignore")
                meta = parse_osu_metadata(text)

                b_id = int(meta["beatmap_id"]) if meta["beatmap_id"].isdigit() and int(meta["beatmap_id"]) > 0 else abs(hash(file_path)) % 10000000
                set_id = int(meta["beatmapset_id"]) if meta["beatmapset_id"].isdigit() and int(meta["beatmapset_id"]) > 0 else 0

                cover_url = f"https://assets.ppy.sh/beatmaps/{set_id}/covers/cover.jpg" if set_id > 0 else "https://assets.ppy.sh/beatmaps/covers/cover.jpg"
                card_url = f"https://assets.ppy.sh/beatmaps/{set_id}/covers/card.jpg" if set_id > 0 else cover_url

                indexed_maps.append({
                    "beatmap_id": b_id,
                    "beatmapset_id": set_id,
                    "title": meta["title"],
                    "title_unicode": meta["title_unicode"],
                    "artist": meta["artist"],
                    "artist_unicode": meta["artist_unicode"],
                    "creator": meta["creator"],
                    "version": meta["version"],
                    "difficulty_rating": sr,
                    "bpm": round(float(b.bpm), 1),
                    "total_length": int(b.n_objects * 0.4) if b.n_objects else 120,
                    "cs": round(float(b.cs), 1),
                    "ar": round(float(b.ar), 1),
                    "od": round(float(b.od), 1),
                    "hp": round(float(b.hp), 1),
                    "status": "Graveyard",
                    "cover_url": cover_url,
                    "card_url": card_url,
                    "preview_url": f"https://b.ppy.sh/preview/{set_id}.mp3" if set_id > 0 else "",
                    "download_url": "",
                    "local_path": file_path,
                    "hash": ""
                })
            except Exception:
                continue

    try:
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(indexed_maps, f, ensure_ascii=False)
        print(f"[LocalLazer] Fallback indexed {len(indexed_maps)} maps to cache.")
    except Exception as e:
        print(f"[LocalLazer] Error writing fallback cache: {e}")

    return indexed_maps

def index_local_lazer_maps(lazer_path: Optional[str] = None, force_reindex: bool = False) -> List[Dict[str, Any]]:
    """Index beatmaps from osu!(lazer) client.realm"""
    if not lazer_path:
        cfg = load_config()
        lazer_path = cfg.lazer_path

    realm_path = Path(lazer_path) / "client.realm"
    files_dir = Path(lazer_path) / "files"

    if not force_reindex and CACHE_FILE.exists():
        try:
            cache_mtime = CACHE_FILE.stat().st_mtime
            realm_mtime = realm_path.stat().st_mtime if realm_path.exists() else 0
            if cache_mtime >= realm_mtime:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        return data
        except Exception as e:
            print(f"[LocalLazer] Cache read check failed: {e}")

    if realm_path.exists():
        print(f"[LocalLazer] Found client.realm at {realm_path}, indexing via Realm reader...")
        if run_realm_reader(realm_path):
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and len(data) > 0:
                        return data
            except Exception as e:
                print(f"[LocalLazer] Error reading newly generated cache: {e}")

    if files_dir.exists():
        return index_via_files_fallback(files_dir)

    return []

def get_filtered_local_maps(
    star_min: float = 3.5,
    star_max: float = 4.8,
    bpm_min: float = 120.0,
    bpm_max: float = 260.0,
    length_min: int = 30,
    length_max: int = 300,
    status_filter: str = "ranked",
    mods: str = "NM",
    smart_mod_filter: bool = True,
    pattern_style: str = "any",
    limit: int = 60
) -> List[Dict[str, Any]]:
    """Retrieve filtered beatmaps from client.realm index with smart mod & resilient playstyle support"""
    all_maps = index_local_lazer_maps()
    status_lower = (status_filter or "all").lower()

    # Determine mod adjustments
    has_dt = "DT" in mods
    has_hr = "HR" in mods
    clock_rate = 1.5 if has_dt else 1.0
    norm_mods = normalize_mods(mods) if (smart_mod_filter and mods != "NM") else ""

    # Estimate broad base SR and BPM bounds if smart mod filter is on
    if smart_mod_filter and norm_mods:
        if has_dt and has_hr:
            sr_min_factor, sr_max_factor = 1.35, 1.75
        elif has_dt:
            sr_min_factor, sr_max_factor = 1.25, 1.55
        elif has_hr:
            sr_min_factor, sr_max_factor = 1.03, 1.20
        else:
            sr_min_factor, sr_max_factor = 0.98, 1.02

        base_sr_min = max(0.0, star_min / sr_max_factor)
        base_sr_max = star_max / sr_min_factor
        base_bpm_min = bpm_min / clock_rate
        base_bpm_max = bpm_max / clock_rate
    else:
        base_sr_min = star_min
        base_sr_max = star_max
        base_bpm_min = bpm_min
        base_bpm_max = bpm_max

    # Step 1: Pre-filter maps by broad bounds and STRICT status
    broad_pool = []
    for m in all_maps:
        if not (base_sr_min <= m["difficulty_rating"] <= base_sr_max):
            continue
        if not (base_bpm_min <= m["bpm"] <= base_bpm_max):
            continue
        if not (length_min <= m["total_length"] <= length_max):
            continue

        m_status = str(m.get("status", "Graveyard")).lower()
        if status_lower in ("ranked", "rank"):
            if m_status not in ("ranked", "approved", "qualified"):
                continue
            if m.get("beatmap_id", 0) <= 0 or m.get("beatmapset_id", 0) <= 0:
                continue
        elif status_lower in ("loved", "love"):
            if m_status != "loved":
                continue
        elif status_lower in ("graveyard", "pending"):
            if m_status not in ("graveyard", "pending", "wip", "local"):
                continue

        broad_pool.append(m)

    # Shuffle for fresh randomness each spin
    random.shuffle(broad_pool)

    need_exact_calc = bool(norm_mods or pattern_style != "any")
    if not need_exact_calc:
        # Tag playstyle on cards if not calculated
        for item in broad_pool[:limit]:
            item.setdefault("playstyle", "balanced")
            item.setdefault("playstyle_name", "Balanced")
        return broad_pool[:limit]

    # Step 2: Resilient evaluation over pool of candidates
    exact_candidates = []
    scanned_candidates = []

    for m in broad_pool:
        local_path = m.get("local_path")
        if not local_path or not os.path.exists(local_path):
            continue

        try:
            with open(local_path, "rb") as f:
                content = f.read()
            b = rosu_pp_py.Beatmap(bytes=content)

            diff_calc = rosu_pp_py.Difficulty(mods=norm_mods) if norm_mods else rosu_pp_py.Difficulty()
            diff = diff_calc.calculate(b)

            exact_sr = round(getattr(diff, "stars", 0.0), 2)
            exact_bpm = round(m["bpm"] * clock_rate, 1)

            # Check exact SR & BPM
            if smart_mod_filter and norm_mods:
                if not (star_min <= exact_sr <= star_max):
                    continue
                if not (bpm_min <= exact_bpm <= bpm_max):
                    continue

            # Playstyle precision analysis
            ps_info = analyze_playstyle(content, diff)
            actual_style = ps_info["style"]

            card_copy = dict(m)
            card_copy["modded_sr"] = exact_sr
            card_copy["modded_bpm"] = exact_bpm
            card_copy["playstyle"] = actual_style
            card_copy["playstyle_name"] = ps_info["name"]

            scanned_candidates.append(card_copy)

            # Check pattern style filter
            if pattern_style != "any" and actual_style != pattern_style:
                if len(scanned_candidates) >= 150:
                    break
                continue

            exact_candidates.append(card_copy)

            if len(exact_candidates) >= limit:
                break
        except Exception:
            continue

    # Resilient fallback: if no candidate matched exact requested style after 80 scans,
    # pick the best available candidate so the roulette NEVER freezes or throws 404
    if not exact_candidates and scanned_candidates:
        print(f"[LocalLazer] Playstyle '{pattern_style}' fallback: selecting closest candidate from {len(scanned_candidates)} maps")
        exact_candidates = scanned_candidates[:limit]

    return exact_candidates
