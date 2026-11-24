# 🎰 osu! Map Roulette (Desktop Edition)

[![Release](https://img.shields.io/badge/release-v1.0.0-ff66aa.svg)](https://github.com/)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](https://microsoft.com/windows)
[![Python](https://img.shields.io/badge/python-3.11+-3776ab.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Автономное десктопное приложение для генерации и подбора карт в **osu!(lazer)** и **osu!stable** с анимацией открытия кейсов в стиле CS2, умным подбором под плейстайлы, интеграцией с базой данных `client.realm`, пересчётом PP через `rosu-pp-py` и режимом «Лесенка».

---

## 📸 Скриншоты и возможности

- **🎰 CS2 Case Opening рулетка:** Плавная лента на 50 карт с физикой замедления, процедурным звуковым генератором тиков на Web Audio API и победным аккордом.
- **⚡ Барабан модов:** Прокрутка модов (`NM`, `HD`, `HR`, `DT`, `HD+HR`, `HD+DT`, `DT+HR`, `DT+PF`, `HR+PF`).
- **🧠 Умный подбор карт (Smart Mod Filter):** Если включён барабан модов, система сначала определяет выпавшую комбинацию модов, а затем ищет базовые карты так, чтобы **итоговый** Star Rating и BPM с учётом модов строго попадали в ваши фильтры.
- **🎯 5 стилей игры (Playstyles):**
  - **Jump Aim (Aimslop):** Карты с высокими расстояниями между одиночными нотами и малым количеством стримов.
  - **Flow Aim:** Высокие aim и speed одновременно (широкие спейсед-стримы и быстрые дуги).
  - **Streams / Speed:** Плотные серии нот 1/4 и 1/6 ритма, где speed сопоставим или превышает aim.
  - **Finger Control / Tech:** Частая смена ритмов, тройки, сложные слайдеры с низким slider factor.
  - **Balanced:** Универсальные сбалансированные карты.
- **📂 Интеграция с базой osu!(lazer) `client.realm`:**
  - Автоматическое чтение установленных карт без задержек и конфликтов (даже при запущенном лазере).
  - Строгая фильтрация по статусу: Ranked, Loved, Graveyard / Pending.
  - **Профиль игрока:** чтение аватара, ника, рангов (SS, S, A), сыгранных и пройденных карт прямо из локальной базы.
  - **Авто-проверка прохождения:** лаунчер отслеживает таблицу `ScoreInfo` и автоматически определяет, когда вы сыграли выпавшую карту.
- **🪜 Режим «Лесенка» (Escalation / Ladder):** Начинайте с комфортного SR (например, 3.5★), нажимайте «Пройдено (+Next)» для автоматического повышения сложности на +0.15★ и накапливайте победный стрик.
- **🎧 Встроенный плеер и мгновенный запуск:**
  - Прослушивание превью трека прямо в карточке.
  - Кнопка «Играть в osu!(lazer)» (авто-скачивание `.osz` из зеркал BeatConnect/Nerinyan/Catboy или deep-link `osu://b/<id>`).

---

## 🚀 Установка для Windows

### Вариант 1: Установщик (Рекомендуется)
1. Скачайте файл **`osu-Map-Roulette-Setup.exe`** из папки `dist_installer/` (или из вкладки Releases).
2. Запустите установщик. Он установит программу в папку пользователя (`%LOCALAPPDATA%\Programs\osu! Map Roulette`) **без требования прав администратора** и создаст удобный ярлык на Рабочем столе.
3. Программа открывается в нативном окне без чёрного окна командной строки (cmd).

### Вариант 2: Запуск из исходников (Для разработчиков)
Требуется **Python 3.11+** и **.NET 10 SDK** (для пересборки `realm_reader`).

```bash
# Клонирование репозитория
git clone https://github.com/your-username/osu-map-roulette.git
cd osu-map-roulette

# Установка зависимостей
pip install -r requirements.txt

# Запуск приложения
python main.py
```

---

## 🛠 Сборка собственного установщика

1. Сгенерируйте иконки и графику для установщика:
   ```bash
   python scripts/generate_icon.py
   ```
2. Соберите автономный билд через PyInstaller:
   ```bash
   pyinstaller --noconsole --windowed --name "osu! Map Roulette" --icon "assets/icon.ico" --add-data "static;static" --add-data "assets;assets" --add-data "tools/realm_reader/bin/publish;tools/realm_reader/bin/publish" --clean --noconfirm main.py
   ```
3. Скомпилируйте Inno Setup инсталлятор:
   ```bash
   "C:\Program Files\Inno Setup 7\ISCC.exe" installer.iss
   ```
   Готовый `osu-Map-Roulette-Setup.exe` появится в директории `dist_installer/`.

---

## ⚙️ Настройки (`config.json`)

Файл конфигурации хранится в `%LOCALAPPDATA%\osu_map_roulette\config.json`:
- `source_mode`: `local` (по умолчанию, чтение из lazer) или `api` (поиск через osu! API v2 / зеркала).
- `lazer_path`: путь к папке osu!(lazer), по умолчанию `%APPDATA%\osu`.
- `preferred_mirror`: `beatconnect`, `nerinyan` или `catboy`.
- `sound_volume`: громкость звуков (0.0 - 1.0).
- `smart_mod_filter`: учитывать моды в фильтрах SR/BPM (`true`/`false`).
- `pattern_style`: выбранный плейстайл (`any`, `aim`, `flow_aim`, `stream`, `tech`).

---

## 📄 Лицензия

Распространяется под лицензией MIT. Подробности в файле [LICENSE](LICENSE).
