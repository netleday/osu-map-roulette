import os
from pathlib import Path
from typing import Dict, Any, Optional
import httpx
import rosu_pp_py
from .paths import CACHE_OSU_DIR

CACHE_DIR = CACHE_OSU_DIR

async def get_beatmap_content(beatmap_id: int, local_file_path: Optional[str] = None) -> Optional[bytes]:
    """Retrieve raw .osu bytes from local cache, local file, or osu.ppy.sh"""
    cache_path = CACHE_DIR / f"{beatmap_id}.osu"
    if cache_path.exists():
        try:
            return cache_path.read_bytes()
        except Exception:
            pass

    if local_file_path and os.path.exists(local_file_path):
        try:
            content = Path(local_file_path).read_bytes()
            if content.startswith(b"osu file format v"):
                cache_path.write_bytes(content)
                return content
        except Exception:
            pass

    # Download from official osu! CDN
    url = f"https://osu.ppy.sh/osu/{beatmap_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200 and resp.content.startswith(b"osu file format v"):
                cache_path.write_bytes(resp.content)
                return resp.content
    except Exception as e:
        print(f"[PPCalc] Failed to download .osu for {beatmap_id}: {e}")

    return None

def normalize_mods(mods_str: str) -> str:
    """Normalize mod strings like 'DT+HR', 'HD,DT', 'NM' into format rosu-pp accepts"""
    clean = mods_str.replace("+", "").replace(",", "").replace(" ", "").upper()
    if not clean or clean == "NM" or clean == "NOMOD":
        return ""
    return clean

def calculate_pp_and_stats(
    beatmap_bytes: bytes,
    mods: str = "NM",
    base_bpm: float = 120.0
) -> Dict[str, Any]:
    """Calculate exact SR, adjusted stats, max combo, and PP for 95%, 98%, 99%, 100%"""
    norm_mods = normalize_mods(mods)
    
    try:
        b = rosu_pp_py.Beatmap(bytes=beatmap_bytes)
        
        # Difficulty calculation
        diff = rosu_pp_py.Difficulty(mods=norm_mods) if norm_mods else rosu_pp_py.Difficulty()
        diff_attrs = diff.calculate(b)
        
        # Map attributes (AR, OD, CS, HP, Clock rate)
        builder = rosu_pp_py.BeatmapAttributesBuilder(map=b, mods=norm_mods) if norm_mods else rosu_pp_py.BeatmapAttributesBuilder(map=b)
        map_attrs = builder.build()
        
        clock_rate = getattr(map_attrs, "clock_rate", 1.0)
        adj_bpm = round(base_bpm * clock_rate, 1)
        stars = round(getattr(diff_attrs, "stars", 0.0), 2)
        max_combo = getattr(diff_attrs, "max_combo", 0)
        
        # Performance points calculation
        pp_values = {}
        for acc in [95.0, 98.0, 99.0, 100.0]:
            perf = rosu_pp_py.Performance(mods=norm_mods, accuracy=acc) if norm_mods else rosu_pp_py.Performance(accuracy=acc)
            res = perf.calculate(diff_attrs)
            pp_values[f"pp_{int(acc)}"] = round(getattr(res, "pp", 0.0), 1)

        return {
            "stars": stars,
            "max_combo": max_combo,
            "bpm": adj_bpm,
            "ar": round(getattr(map_attrs, "ar", 9.0), 1),
            "od": round(getattr(map_attrs, "od", 8.0), 1),
            "cs": round(getattr(map_attrs, "cs", 4.0), 1),
            "hp": round(getattr(map_attrs, "hp", 6.0), 1),
            "pp_95": pp_values.get("pp_95", 0.0),
            "pp_98": pp_values.get("pp_98", 0.0),
            "pp_99": pp_values.get("pp_99", 0.0),
            "pp_100": pp_values.get("pp_100", 0.0),
            "mods": mods or "NM"
        }
    except Exception as e:
        print(f"[PPCalc] Error calculating PP: {e}")
        return {
            "stars": 0.0,
            "max_combo": 0,
            "bpm": base_bpm,
            "ar": 0.0,
            "od": 0.0,
            "cs": 0.0,
            "hp": 0.0,
            "pp_95": 0.0,
            "pp_98": 0.0,
            "pp_99": 0.0,
            "pp_100": 0.0,
            "mods": mods or "NM"
        }
