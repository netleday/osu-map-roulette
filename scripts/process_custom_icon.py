import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BASE_DIR / "assets"
CUSTOM_IMG_PATH = ASSETS_DIR / "custom_icon.png"

def process_icon():
    print(f"[IconProcessor] Loading custom image from {CUSTOM_IMG_PATH} ...")
    if not CUSTOM_IMG_PATH.exists():
        raise FileNotFoundError(f"Missing {CUSTOM_IMG_PATH}")

    src = Image.open(CUSTOM_IMG_PATH).convert("RGBA")
    w, h = src.size

    # 1. Center crop to square
    min_dim = min(w, h)
    left = (w - min_dim) // 2
    top = (h - min_dim) // 2
    square_img = src.crop((left, top, left + min_dim, top + min_dim))

    # 2. Generate icon.png (512x512)
    img_512 = square_img.resize((512, 512), Image.Resampling.LANCZOS)
    png_path = ASSETS_DIR / "icon.png"
    img_512.save(png_path, format="PNG")
    print(f"[IconProcessor] Generated: {png_path} (512x512)")

    # 3. Generate multi-resolution icon.ico (16, 24, 32, 48, 64, 128, 256)
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = ASSETS_DIR / "icon.ico"
    # To ensure highest quality for small sizes, we pre-generate images
    img_512.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"[IconProcessor] Generated: {ico_path} with sizes: {ico_sizes}")

    # 4. Generate Inno Setup wizard_banner.bmp (164 x 314 px)
    # Scale square image to height 314, then center crop horizontally to 164
    scale = 314.0 / square_img.height
    new_w = int(square_img.width * scale)
    scaled_banner = square_img.resize((new_w, 314), Image.Resampling.LANCZOS)
    b_left = (new_w - 164) // 2
    banner_crop = scaled_banner.crop((b_left, 0, b_left + 164, 314))
    
    # Add dark vignette / gradient at bottom for text contrast
    banner_rgb = banner_crop.convert("RGB")
    draw = ImageDraw.Draw(banner_rgb)
    for y in range(220, 314):
        alpha = (y - 220) / 94.0
        # Dark purple-black overlay at bottom
        for x in range(164):
            pixel = banner_rgb.getpixel((x, y))
            r = int(pixel[0] * (1 - alpha * 0.85) + 15 * alpha * 0.85)
            g = int(pixel[1] * (1 - alpha * 0.85) + 12 * alpha * 0.85)
            b = int(pixel[2] * (1 - alpha * 0.85) + 24 * alpha * 0.85)
            banner_rgb.putpixel((x, y), (r, g, b))

    # Add text overlay
    draw.text((14, 252), "osu!", fill=(255, 75, 140))
    draw.text((14, 270), "Map Roulette", fill=(245, 245, 255))
    draw.text((14, 288), "Lazer Edition", fill=(160, 165, 185))

    banner_path = ASSETS_DIR / "wizard_banner.bmp"
    banner_rgb.save(banner_path, format="BMP")
    print(f"[IconProcessor] Generated: {banner_path} (164x314)")

    # 5. Generate Inno Setup wizard_small.bmp (55 x 58 px)
    # Scale to cover 55x58
    scale_sm = max(55.0 / square_img.width, 58.0 / square_img.height)
    sm_w = int(square_img.width * scale_sm)
    sm_h = int(square_img.height * scale_sm)
    scaled_sm = square_img.resize((sm_w, sm_h), Image.Resampling.LANCZOS)
    sm_left = (sm_w - 55) // 2
    sm_top = (sm_h - 58) // 2
    small_crop = scaled_sm.crop((sm_left, sm_top, sm_left + 55, sm_top + 58)).convert("RGB")

    small_path = ASSETS_DIR / "wizard_small.bmp"
    small_crop.save(small_path, format="BMP")
    print(f"[IconProcessor] Generated: {small_path} (55x58)")

if __name__ == "__main__":
    process_icon()
