import os
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BASE_DIR / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

def create_anime_icon(size: int = 1024) -> Image.Image:
    """
    Renders high-resolution osu! anime icon with supersampling (1024x1024 downscaled to 512x512).
    Aesthetic: Dark cyber-minimalism, neon pink/purple gradient ring,
    stylized anime girl with glowing gaming headphones.
    """
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2
    r_outer = int(size * 0.46)
    r_inner = int(size * 0.40)

    # 1. Dark circular backplate with subtle radial glow
    for r in range(r_outer + 30, r_outer - 10, -2):
        alpha = int(45 * (1 - (r - r_outer + 10) / 40))
        alpha = max(0, min(60, alpha))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(220, 38, 127, alpha))

    # Base dark badge
    draw.ellipse([cx - r_outer, cy - r_outer, cx + r_outer, cy + r_outer], fill=(14, 14, 20, 255))

    # 2. Outer Neon Gradient Ring (osu! magenta -> violet -> cyan)
    ring_width = int(size * 0.04)
    steps = 360
    for i in range(steps):
        angle = math.radians(i)
        next_angle = math.radians(i + 1.5)
        t = i / 360.0

        # Color interpolation (osu pink #ff4081 -> purple #a855f7 -> blue #3b82f6)
        if t < 0.5:
            f = t * 2.0
            r = int(255 * (1 - f) + 168 * f)
            g = int(64 * (1 - f) + 85 * f)
            b = int(129 * (1 - f) + 247 * f)
        else:
            f = (t - 0.5) * 2.0
            r = int(168 * (1 - f) + 244 * f)
            g = int(85 * (1 - f) + 63 * f)
            b = int(247 * (1 - f) + 142 * f)

        x1 = cx + (r_outer - ring_width) * math.cos(angle)
        y1 = cy + (r_outer - ring_width) * math.sin(angle)
        x2 = cx + r_outer * math.cos(angle)
        y2 = cy + r_outer * math.sin(angle)
        x3 = cx + r_outer * math.cos(next_angle)
        y3 = cy + r_outer * math.sin(next_angle)
        x4 = cx + (r_outer - ring_width) * math.cos(next_angle)
        y4 = cy + (r_outer - ring_width) * math.sin(next_angle)

        draw.polygon([(x1, y1), (x2, y2), (x3, y3), (x4, y4)], fill=(r, g, b, 255))

    # Inner dark center disc
    inner_disc_r = r_outer - ring_width - 8
    draw.ellipse([cx - inner_disc_r, cy - inner_disc_r, cx + inner_disc_r, cy + inner_disc_r], fill=(16, 16, 24, 255))

    # Subtle inner groove ring
    groove_r = inner_disc_r - 12
    draw.ellipse([cx - groove_r, cy - groove_r, cx + groove_r, cy + groove_r], outline=(40, 36, 60, 255), width=3)

    # 3. Anime Girl Silhouette & Portrait with Glowing Headphones
    # Neck and collar
    draw.polygon([
        (cx - 36, cy + 180), (cx + 36, cy + 180),
        (cx + 48, cy + 280), (cx - 48, cy + 280)
    ], fill=(245, 230, 230, 255))

    # Face / chin contour (cute rounded anime chin)
    face_pts = [
        (cx - 82, cy - 20),
        (cx - 75, cy + 60),
        (cx - 40, cy + 130),
        (cx, cy + 155),
        (cx + 40, cy + 130),
        (cx + 75, cy + 60),
        (cx + 82, cy - 20),
        (cx + 60, cy - 80),
        (cx - 60, cy - 80)
    ]
    draw.polygon(face_pts, fill=(255, 236, 232, 255))

    # Anime eyes (sleek closed happy arc eyes with lashes ^_^)
    draw.arc([cx - 56, cy + 30, cx - 18, cy + 58], start=190, end=350, fill=(35, 25, 45, 255), width=7)
    draw.arc([cx + 18, cy + 30, cx + 56, cy + 58], start=190, end=350, fill=(35, 25, 45, 255), width=7)

    # Soft anime blush
    draw.ellipse([cx - 65, cy + 60, cx - 35, cy + 74], fill=(255, 130, 160, 140))
    draw.ellipse([cx + 35, cy + 60, cx + 65, cy + 74], fill=(255, 130, 160, 140))

    # Subtle small mouth
    draw.arc([cx - 10, cy + 105, cx + 10, cy + 120], start=20, end=160, fill=(230, 80, 120, 255), width=4)

    # Hair bangs & locks (pastel purple/pink anime hair)
    hair_color = (235, 215, 245, 255)
    hair_shadow = (200, 175, 225, 255)

    # Back hair volume
    draw.ellipse([cx - 130, cy - 140, cx + 130, cy + 120], fill=hair_shadow)

    # Front bangs
    bangs = [
        # Center bang
        [(cx, cy + 25), (cx - 24, cy - 60), (cx + 24, cy - 60)],
        # Left bang
        [(cx - 32, cy + 35), (cx - 55, cy - 50), (cx - 15, cy - 60)],
        # Right bang
        [(cx + 32, cy + 35), (cx + 15, cy - 60), (cx + 55, cy - 50)],
        # Side framing locks
        [(cx - 85, cy + 120), (cx - 105, cy - 20), (cx - 65, cy - 40)],
        [(cx + 85, cy + 120), (cx + 65, cy - 40), (cx + 105, cy - 20)]
    ]
    for b_pts in bangs:
        draw.polygon(b_pts, fill=hair_color)

    # Hair top curve
    draw.chord([cx - 110, cy - 150, cx + 110, cy - 10], start=180, end=360, fill=hair_color)

    # Hair shine highlight arc
    draw.arc([cx - 70, cy - 125, cx + 70, cy - 85], start=200, end=340, fill=(255, 255, 255, 180), width=6)

    # 4. Over-Ear Gaming Headphones with Glowing Ring (osu! theme)
    # Headband
    draw.arc([cx - 145, cy - 160, cx + 145, cy + 40], start=190, end=350, fill=(35, 35, 48, 255), width=24)
    draw.arc([cx - 145, cy - 160, cx + 145, cy + 40], start=190, end=350, fill=(255, 64, 129, 255), width=6)

    # Ear cups (Left and Right)
    cup_w, cup_h = 58, 92
    for cup_cx, sign in [(cx - 130, -1), (cx + 130, 1)]:
        # Outer dark cushion
        draw.rounded_rectangle(
            [cup_cx - cup_w//2, cy - 10 - cup_h//2, cup_cx + cup_w//2, cy - 10 + cup_h//2],
            radius=20,
            fill=(28, 28, 38, 255),
            outline=(255, 64, 129, 255),
            width=5
        )
        # Inner glowing LED circle
        glow_r = 16
        draw.ellipse([cup_cx - glow_r, cy - 10 - glow_r, cup_cx + glow_r, cy - 10 + glow_r], fill=(255, 80, 145, 255))
        draw.ellipse([cup_cx - glow_r + 5, cy - 10 - glow_r + 5, cup_cx + glow_r - 5, cy - 10 + glow_r - 5], fill=(255, 220, 240, 255))

    # 5. Rhythm sparkles / music notes around
    sparkles = [
        (cx - 190, cy - 130, 14, (255, 105, 180, 255)),
        (cx + 185, cy - 140, 18, (168, 85, 247, 255)),
        (cx + 195, cy + 120, 12, (255, 215, 0, 255)),
        (cx - 180, cy + 110, 10, (59, 130, 246, 255)),
    ]
    for sx, sy, s_rad, s_col in sparkles:
        # Draw 4-point star
        star_pts = [
            (sx, sy - s_rad), (sx + s_rad*0.35, sy - s_rad*0.35),
            (sx + s_rad, sy), (sx + s_rad*0.35, sy + s_rad*0.35),
            (sx, sy + s_rad), (sx - s_rad*0.35, sy + s_rad*0.35),
            (sx - s_rad, sy), (sx - s_rad*0.35, sy - s_rad*0.35)
        ]
        draw.polygon(star_pts, fill=s_col)

    return img

def main():
    print("[IconGenerator] Generating high-resolution 1024x1024 master icon...")
    master = create_anime_icon(1024)

    # Downscale with high-quality Lanczos resampling to 512x512
    img_512 = master.resize((512, 512), Image.Resampling.LANCZOS)
    png_path = ASSETS_DIR / "icon.png"
    img_512.save(png_path, format="PNG")
    print(f"[IconGenerator] Saved PNG icon to: {png_path}")

    # Generate multi-size ICO: 16, 24, 32, 48, 64, 128, 256
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = ASSETS_DIR / "icon.ico"
    master.save(ico_path, format="ICO", sizes=ico_sizes)
    print(f"[IconGenerator] Saved multi-resolution ICO to: {ico_path}")

    # Generate Inno Setup wizard banner and small dialog bitmap
    # WizardImageFile: 164 x 314 px
    wizard_banner = Image.new("RGB", (164, 314), (16, 16, 24))
    banner_draw = ImageDraw.Draw(wizard_banner)
    # Subtle gradient background
    for y in range(314):
        t = y / 314.0
        r = int(14 * (1 - t) + 35 * t)
        g = int(14 * (1 - t) + 18 * t)
        b = int(22 * (1 - t) + 48 * t)
        banner_draw.line([(0, y), (164, y)], fill=(r, g, b))

    # Place resized icon centered at top of banner
    icon_sub = img_512.resize((120, 120), Image.Resampling.LANCZOS)
    wizard_banner.paste(icon_sub, (22, 30), mask=icon_sub.split()[3])

    banner_draw.text((22, 168), "osu!", fill=(255, 64, 129))
    banner_draw.text((22, 188), "Map Roulette", fill=(240, 240, 255))
    banner_draw.text((22, 210), "Lazer Edition", fill=(148, 163, 184))

    wizard_bmp_path = ASSETS_DIR / "wizard_banner.bmp"
    wizard_banner.save(wizard_bmp_path, format="BMP")
    print(f"[IconGenerator] Saved installer wizard banner to: {wizard_bmp_path}")

    # WizardSmallImageFile: 55 x 55 px
    small_bmp = Image.new("RGB", (55, 55), (20, 20, 28))
    icon_tiny = img_512.resize((48, 48), Image.Resampling.LANCZOS)
    small_bmp.paste(icon_tiny, (3, 3), mask=icon_tiny.split()[3])
    small_bmp_path = ASSETS_DIR / "wizard_small.bmp"
    small_bmp.save(small_bmp_path, format="BMP")
    print(f"[IconGenerator] Saved installer small image to: {small_bmp_path}")

if __name__ == "__main__":
    main()
