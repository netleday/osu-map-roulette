import os
import struct
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
from .paths import DATA_DIR

COLLECTIONS_DIR = DATA_DIR / "collections"
COLLECTIONS_DIR.mkdir(parents=True, exist_ok=True)


def _write_7bit_int(buf: bytearray, value: int):
    """Write a 32-bit integer in C# BinaryWriter 7-bit encoded format."""
    v = value
    while v >= 0x80:
        buf.append((v | 0x80) & 0xFF)
        v >>= 7
    buf.append(v & 0xFF)


def _write_csharp_str(buf: bytearray, text: str):
    """Write a UTF-8 string prefixed by 7-bit encoded length (C# BinaryWriter)."""
    encoded = (text or "").encode("utf-8")
    _write_7bit_int(buf, len(encoded))
    buf.extend(encoded)


def _to_ole_automation_date(dt: datetime) -> float:
    """Convert Python datetime to C# DateTime.ToOADate() double."""
    epoch = datetime(1899, 12, 30)
    delta = dt - epoch
    return delta.total_seconds() / 86400.0


def export_session_to_osdb(entries: List[Dict[str, Any]], collection_name: str = "") -> Path:
    """
    Export session beatmap entries to an .osdb file (o!dm8 format, compatible with
    osu! Collection Manager and osu!(lazer)/stable importers).
    """
    now = datetime.now()
    if not collection_name:
        collection_name = f"Roulette Drops ({now.strftime('%Y-%m-%d %H:%M')})"

    # Deduplicate by beatmap_id
    seen = set()
    unique_cards = []
    for entry in entries:
        card = entry.get("card", entry)
        bid = int(card.get("beatmap_id") or 0)
        key = bid if bid > 0 else f"{card.get('title')}_{card.get('version')}"
        if key not in seen:
            seen.add(key)
            unique_cards.append(card)

    buf = bytearray()
    # Header: o!dm8
    _write_csharp_str(buf, "o!dm8")
    # SaveDate (OADate double)
    buf.extend(struct.pack("<d", _to_ole_automation_date(now)))
    # LastEditor
    _write_csharp_str(buf, "osu! Map Roulette")
    # Number of collections
    buf.extend(struct.pack("<i", 1))

    # Collection 1
    _write_csharp_str(buf, collection_name)
    buf.extend(struct.pack("<i", 0))  # OnlineId
    buf.extend(struct.pack("<i", len(unique_cards)))  # Beatmap count

    for card in unique_cards:
        bid = int(card.get("beatmap_id") or 0)
        bsid = int(card.get("beatmapset_id") or 0)
        artist = str(card.get("artist") or "Unknown")
        title = str(card.get("title") or "Unknown")
        diff = str(card.get("version") or "Normal")
        md5 = str(card.get("beatmap_hash") or card.get("md5") or "")
        stars = float(card.get("difficulty_rating") or 0.0)

        buf.extend(struct.pack("<i", bid))
        buf.extend(struct.pack("<i", bsid))
        _write_csharp_str(buf, artist)
        _write_csharp_str(buf, title)
        _write_csharp_str(buf, diff)
        _write_csharp_str(buf, md5)
        _write_csharp_str(buf, "Dropped in osu! Map Roulette")
        buf.append(0)  # PlayMode: 0 = osu!standard
        buf.extend(struct.pack("<d", stars))

    # Beatmaps with hash only count = 0
    buf.extend(struct.pack("<i", 0))
    # Footer
    _write_csharp_str(buf, "By Piotrekol")

    filename = f"roulette_{now.strftime('%Y%m%d_%H%M%S')}.osdb"
    out_path = COLLECTIONS_DIR / filename
    out_path.write_bytes(bytes(buf))
    return out_path
