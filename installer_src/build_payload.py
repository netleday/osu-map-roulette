import os
import zipfile
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_APP_DIR = BASE_DIR / "dist" / "osu! Map Roulette"
PAYLOAD_ZIP = Path(__file__).resolve().parent / "payload.zip"

def build_payload():
    if not DIST_APP_DIR.exists():
        raise FileNotFoundError(f"Missing build directory: {DIST_APP_DIR}")

    print(f"[Payload] Packing {DIST_APP_DIR} -> {PAYLOAD_ZIP} ...")
    file_count = 0
    with zipfile.ZipFile(PAYLOAD_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for root, _, files in os.walk(DIST_APP_DIR):
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(DIST_APP_DIR)
                zf.write(full_path, arcname=str(rel_path))
                file_count += 1

    size_mb = PAYLOAD_ZIP.stat().st_size / (1024 * 1024)
    print(f"[Payload] Done! Packed {file_count} files ({size_mb:.2f} MB).")

if __name__ == "__main__":
    build_payload()
