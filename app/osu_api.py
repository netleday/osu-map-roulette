import os
import random
import httpx
from typing import List, Dict, Any, Optional
from .config import load_config
from .playstyle import PLAYSTYLE_NAMES

_oauth_token: Optional[str] = None

async def get_osu_v2_token(client_id: str, client_secret: str) -> Optional[str]:
    """Obtain client credentials token for osu! API v2"""
    global _oauth_token
    if _oauth_token:
        return _oauth_token
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://osu.ppy.sh/oauth/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "grant_type": "client_credentials",
                    "scope": "public"
                }
            )
            if resp.status_code == 200:
                _oauth_token = resp.json().get("access_token")
                return _oauth_token
    except Exception as e:
        print(f"[osu! API v2] Failed to get OAuth token: {e}")
    return None

def format_card(set_data: Dict[str, Any], b_data: Dict[str, Any]) -> Dict[str, Any]:
    b_id = b_data.get("id") or b_data.get("beatmap_id") or 0
    set_id = set_data.get("id") or b_data.get("beatmapset_id") or 0
    covers = set_data.get("covers", {})
    
    cover_url = covers.get("cover") or covers.get("card") or f"https://assets.ppy.sh/beatmaps/{set_id}/covers/cover.jpg"
    card_url = covers.get("card") or f"https://assets.ppy.sh/beatmaps/{set_id}/covers/card.jpg"
    
    status_raw = set_data.get("status") or b_data.get("status") or "ranked"
    if isinstance(status_raw, int):
        status_map = {1: "ranked", 2: "approved", 3: "qualified", 4: "loved", 0: "pending", -1: "wip", -2: "graveyard"}
        status_str = status_map.get(status_raw, "graveyard")
    else:
        status_str = str(status_raw).lower()

    return {
        "beatmap_id": int(b_id),
        "beatmapset_id": int(set_id),
        "title": set_data.get("title", "Unknown Title"),
        "title_unicode": set_data.get("title_unicode") or set_data.get("title", ""),
        "artist": set_data.get("artist", "Unknown Artist"),
        "artist_unicode": set_data.get("artist_unicode") or set_data.get("artist", ""),
        "creator": set_data.get("creator", "Unknown Mapper"),
        "version": b_data.get("version", "Normal"),
        "difficulty_rating": round(float(b_data.get("difficulty_rating") or b_data.get("stars", 0.0)), 2),
        "bpm": round(float(b_data.get("bpm") or set_data.get("bpm") or 120.0), 1),
        "total_length": int(b_data.get("total_length") or b_data.get("hit_length") or 60),
        "cs": round(float(b_data.get("cs", 4.0)), 1),
        "ar": round(float(b_data.get("ar", 8.0)), 1),
        "od": round(float(b_data.get("accuracy", b_data.get("od", 8.0))), 1),
        "hp": round(float(b_data.get("drain", b_data.get("hp", 6.0))), 1),
        "status": status_str,
        "cover_url": cover_url,
        "card_url": card_url,
        "preview_url": f"https://b.ppy.sh/preview/{set_id}.mp3",
        "download_url": f"https://osu.direct/api/d/{set_id}",
        "playstyle": "balanced",
        "playstyle_name": "Balanced"
    }

async def search_online_beatmaps(
    star_min: float = 3.5,
    star_max: float = 4.8,
    bpm_min: float = 120.0,
    bpm_max: float = 260.0,
    length_min: int = 30,
    length_max: int = 300,
    status_filter: str = "ranked",  # ranked, loved, graveyard, any
    limit: int = 60
) -> List[Dict[str, Any]]:
    """Search beatmaps using osu! API v2 or osu.direct mirror with strict status matching"""
    cfg = load_config()
    token = None
    if cfg.client_id and cfg.client_secret:
        token = await get_osu_v2_token(cfg.client_id, cfg.client_secret)

    # Status mapping
    status_param = (status_filter or "ranked").lower()
    if status_param in ("graveyard", "pending / graveyard", "pending"):
        s_query = "graveyard"
        mirror_status = "-2"
    elif status_param == "loved":
        s_query = "loved"
        mirror_status = "4"
    elif status_param in ("any", "любой"):
        s_query = "any"
        mirror_status = ""
    else:
        s_query = "ranked"
        mirror_status = "1"

    matched_cards: List[Dict[str, Any]] = []

    # Queries for diverse rotation
    sample_queries = [
        "", "anime", "rock", "electronic", "pop", "instrumental", "game", "vocaloid", "remix"
    ]
    random.shuffle(sample_queries)

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) osu-map-roulette/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, headers=headers) as client:
        for q in sample_queries[:4]:
            if len(matched_cards) >= limit:
                break

            try:
                if token:
                    # Official osu! API v2
                    params = {
                        "m": 0,
                        "s": s_query if s_query != "any" else "",
                        "q": q,
                        "sort": "favourites_desc" if random.random() > 0.5 else "plays_desc"
                    }
                    resp = await client.get("https://osu.ppy.sh/api/v2/beatmapsets/search", params=params)
                    if resp.status_code == 200:
                        sets = resp.json().get("beatmapsets", [])
                    else:
                        sets = []
                else:
                    # osu.direct mirror
                    params = {
                        "mode": 0,
                        "q": q,
                        "amount": 50
                    }
                    if mirror_status:
                        params["status"] = mirror_status
                    resp = await client.get("https://osu.direct/api/v2/search", params=params)
                    if resp.status_code == 200:
                        sets = resp.json()
                        if not isinstance(sets, list):
                            sets = []
                    else:
                        sets = []

                for s in sets:
                    beatmaps = s.get("beatmaps", [])
                    for b in beatmaps:
                        mode = b.get("mode")
                        mode_int = b.get("mode_int")
                        if mode_int is not None and mode_int != 0:
                            continue
                        if mode is not None and str(mode) not in ("0", "osu"):
                            continue

                        sr = float(b.get("difficulty_rating") or b.get("stars", 0.0))
                        bpm = float(b.get("bpm") or s.get("bpm") or 120.0)
                        length = int(b.get("total_length") or b.get("hit_length") or 60)

                        if star_min <= sr <= star_max and bpm_min <= bpm <= bpm_max and length_min <= length <= length_max:
                            card = format_card(s, b)

                            # Strict status verification
                            c_status = card.get("status", "").lower()
                            if s_query == "ranked":
                                if c_status not in ("ranked", "approved", "qualified"):
                                    continue
                                if card["beatmap_id"] <= 0 or card["beatmapset_id"] <= 0:
                                    continue
                            elif s_query == "loved":
                                if c_status != "loved":
                                    continue
                            elif s_query == "graveyard":
                                if c_status not in ("graveyard", "pending", "wip"):
                                    continue

                            # Avoid duplicates
                            if not any(c["beatmap_id"] == card["beatmap_id"] for c in matched_cards):
                                matched_cards.append(card)

            except Exception as e:
                print(f"[API Search] Query '{q}' error: {e}")

    random.shuffle(matched_cards)
    return matched_cards[:limit]
