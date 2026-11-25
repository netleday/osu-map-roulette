# osu! Map Roulette

[![Release](https://img.shields.io/badge/release-v1.1.0-ff4081.svg)](https://github.com/netleday/osu-map-roulette/releases)
[![Author](https://img.shields.io/badge/author-netleday-c026d3.svg)](https://github.com/netleday)
[![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-blue.svg)](https://microsoft.com/windows)
[![Python](https://img.shields.io/badge/python-3.11+-3776ab.svg)](https://python.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Автономное десктопное приложение для **osu!(lazer)** и **osu!stable** с рулеткой карт в стиле CS2, умным подбором под плейстайлы, пересчётом PP через `rosu-pp-py`, мультиплеер-лобби, кастомными темами и автоматическими обновлениями через GitHub.

Разработчик: **[netleday](https://github.com/netleday)**

---

## Возможности

- **CS2-рулетка карт и модов:** Плавная лента с физикой замедления, процедурным генератором звуков на Web Audio API и пересчётом PP (95%, 98%, 99%, 100% SS) через `rosu-pp-py`.
- **Умный подбор (Smart Mod Filter):** При включённом барабане модов система подбирает базовые карты так, чтобы итоговый Star Rating и BPM **после наложения модов** (`+DT`, `+HR` и др.) попадали строго в заданный диапазон.
- **Анализ 5 стилей игры (Playstyles):** `Jump Aim`, `Flow Aim`, `Streams / Speed`, `Finger Control / Tech`, `Balanced`.
- **Прямое чтение `client.realm` osu!(lazer):** Моментальная индексация установленных карт, строгая фильтрация по статусам (`Ranked`, `Loved`, `Graveyard`), профиль игрока и автоматическая проверка скоров.
- **Мультиплеер-лобби с друзьями:** Создание комнат по 6-значному коду без платных серверов, синхронная прокрутка одной карты у всех участников и живая таблица лидеров раунда.
- **Умные коллекции (`.osdb`) и Анти-тильт:** Экспорт выпавших карт сессии в бинарный формат `collections.osdb`, а также детектор тильта с предложением сбросить сложность на `-0.3★` для разминки.
- **Темы, стекло и кастомные фоны:** 5 готовых цветовых схем, конструктор своей темы с выбором цветов и прозрачности, загрузка своих обоев (`.png`, `.jpg`, `.webp`) и настройка размытия/затемнения.
- **Трей и автообновление:** Сворачивание в системный трей Windows, а также добровольная проверка и установка обновлений прямо из GitHub Releases.

---

## Установка (Windows)

1. Скачайте актуальный **`osu-Map-Roulette-Setup.exe`** со страницы [Releases](https://github.com/netleday/osu-map-roulette/releases).
2. Запустите установщик (права администратора не требуются — установка идёт в `%LOCALAPPDATA%\Programs\osu! Map Roulette`).
3. Отметьте создание ярлыка на Рабочем столе и нажмите «Установить».

---

## История изменений (Changelog)

### v1.1.0 (2026-11-25)
- Добавлена система добровольного обновления через GitHub Releases API и встроенный Changelog.
- Добавлен раздел **«Настройки»** с системными пресетами тем, конструктором своих тем и загрузкой своих изображений на фон.
- Убраны пустые стартовые заглушки рулетки: при открытии подгружаются реальные карты с обложками под текущие фильтры.
- Добавлено сворачивание левого сайдбара, системный трей (`pystray`), мультиплеер-лобби, экспорт в `.osdb` и детектор тильта.
- Полностью убраны эмодзи — интерфейс переведён на единые монохромные SVG-иконки.

### v1.0.0 (2026-11-24)
- Первый публичный релиз: CS2-рулетка, интеграция с `client.realm`, 5 плейстайлов, расчёт PP через `rosu-pp-py` и режим «Лесенка».

---

## Запуск и сборка из исходников

Требуется **Python 3.11+** и **.NET 10 SDK** (для пересборки `tools/realm_reader`).

```bash
git clone https://github.com/netleday/osu-map-roulette.git
cd osu-map-roulette
pip install -r requirements.txt
python main.py
```

Сборка `.exe` и установщика:
```bash
pyinstaller --noconfirm "osu! Map Roulette.spec"
python installer_src/build_payload.py
pyinstaller --noconfirm osu-Map-Roulette-Setup.spec --distpath dist_installer --workpath build_installer
```

---

## Лицензия

MIT License — подробности в файле [LICENSE](LICENSE).
