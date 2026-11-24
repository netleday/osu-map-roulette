import math
from typing import Dict, Any, Optional
import rosu_pp_py

PLAYSTYLE_NAMES = {
    "aim": "Jump Aim",
    "flow_aim": "Flow Aim",
    "stream": "Streams / Speed",
    "tech": "Finger Control / Tech",
    "balanced": "Balanced"
}

def analyze_playstyle(raw_bytes: bytes, diff_attrs=None) -> Dict[str, Any]:
    """
    Precision pattern analyzer for osu!standard maps.
    Calculates aim/speed strains and parses hit objects to identify:
      - Jump Aim (Aimslop): aim > speed * 1.35, low stream count, high jump density
      - Flow Aim: aim >= 2.2 and speed >= 2.0 with <= 25% difference, spaced streams
      - Streams / Speed: speed >= aim * 0.92, high proportion of 1/4 & 1/6 notes
      - Finger Control / Tech: low slider_factor, complex rhythm alternations, bursts
      - Balanced: neither extreme
    """
    b = rosu_pp_py.Beatmap(bytes=raw_bytes)
    if b.mode != rosu_pp_py.GameMode.Osu:
        return {"style": "balanced", "name": "Balanced", "valid": False}

    if diff_attrs is None:
        diff_attrs = rosu_pp_py.Difficulty().calculate(b)

    aim = float(getattr(diff_attrs, "aim", 0.0))
    speed = float(getattr(diff_attrs, "speed", 0.0))
    slider_factor = float(getattr(diff_attrs, "slider_factor", 1.0))
    speed_notes = float(getattr(diff_attrs, "speed_note_count", 0.0))

    # Parse hit objects from text for timing & distance metrics
    text = raw_bytes.decode("utf-8", errors="ignore")
    lines = text.splitlines()
    in_hit_objects = False

    objs = []  # (time, x, y, type)
    for line in lines:
        line = line.strip()
        if not line:
            continue
        if line == "[HitObjects]":
            in_hit_objects = True
            continue
        if line.startswith("[") and in_hit_objects:
            break
        if in_hit_objects:
            p = line.split(",")
            if len(p) >= 5:
                try:
                    objs.append((float(p[2]), float(p[0]), float(p[1]), int(p[3])))
                except Exception:
                    continue

    n = len(objs)
    if n < 15:
        return {
            "style": "balanced",
            "name": "Balanced",
            "aim": round(aim, 2),
            "speed": round(speed, 2),
            "valid": True
        }

    streams_count = 0
    spaced_stream_count = 0
    jumps_count = 0
    rhythm_changes = 0

    cur_stream_len = 1
    last_dt = None

    for i in range(1, n):
        t0, x0, y0, _ = objs[i - 1]
        t1, x1, y1, _ = objs[i]
        dt = t1 - t0
        dist = math.hypot(x1 - x0, y1 - y0)

        # 1/4 rhythm note stream: dt ~ 35ms to 135ms (111 to 420 BPM 1/4)
        if 35 <= dt <= 135:
            cur_stream_len += 1
            if dist > 60:  # Spaced stream
                spaced_stream_count += 1
        else:
            if cur_stream_len >= 3:
                streams_count += cur_stream_len
            cur_stream_len = 1

        # Wide jump: 1/2 rhythm (~135-350ms) with large distance (> 135px)
        if 135 < dt <= 350 and dist > 135:
            jumps_count += 1

        # Rhythm change (transition between 1/4 and 1/2, triplets, bursts)
        if last_dt is not None:
            r = dt / (last_dt + 0.1)
            if (0.35 <= r <= 0.65) or (1.4 <= r <= 2.2):
                rhythm_changes += 1
        last_dt = dt

    if cur_stream_len >= 3:
        streams_count += cur_stream_len

    stream_ratio = streams_count / n
    jump_ratio = jumps_count / n
    rhythm_density = rhythm_changes / n

    # Classification logic
    style = "balanced"

    # 1. Jump Aim (Aimslop)
    # High aim, low/moderate speed, low stream count, large spacing
    if (aim > speed * 1.35 and stream_ratio < 0.20) or (aim > speed * 1.50):
        style = "aim"

    # 2. Flow Aim
    # High aim AND speed simultaneously (aim >= 2.2, speed >= 2.0, diff <= 25%),
    # wide spaced streams and fast curved patterns
    elif aim >= 2.2 and speed >= 2.0:
        diff_pct = abs(aim - speed) / max(aim, speed)
        if diff_pct <= 0.25 and (spaced_stream_count >= 10 or (stream_ratio >= 0.20 and jump_ratio >= 0.12)):
            style = "flow_aim"
        elif speed >= aim * 0.92 and (stream_ratio >= 0.18 or speed_notes >= 35):
            style = "stream"
        elif slider_factor < 0.92 or (rhythm_density > 0.24 and stream_ratio >= 0.08):
            style = "tech"
        else:
            style = "balanced"

    # 3. Streams / Speed
    # Speed >= 92% of aim and high density of 1/4 & 1/6 streams
    elif speed >= aim * 0.92 and (stream_ratio >= 0.18 or speed_notes >= 35 or speed >= 2.4):
        style = "stream"

    # 4. Finger Control / Tech
    # Complex sliders, low slider_factor, frequent rhythm changes
    elif slider_factor < 0.92 or (rhythm_density > 0.24 and stream_ratio >= 0.08):
        style = "tech"

    # 5. Balanced
    else:
        style = "balanced"

    return {
        "style": style,
        "name": PLAYSTYLE_NAMES.get(style, "Balanced"),
        "aim": round(aim, 2),
        "speed": round(speed, 2),
        "slider_factor": round(slider_factor, 2),
        "stream_ratio": round(stream_ratio, 2),
        "jump_ratio": round(jump_ratio, 2),
        "rhythm_density": round(rhythm_density, 2),
        "valid": True
    }
