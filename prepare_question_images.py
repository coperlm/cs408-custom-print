#!/usr/bin/env python3
"""Organize the verified question crops into a year/number image library."""

from __future__ import annotations

import csv
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKUP = ROOT / "错题原图备份"
SOURCE_DIR = BACKUP / "提取题图"
FOOTER_DIR = BACKUP / "提取题图_去页脚"
OUTPUT_DIR = ROOT / "题库图片"


def main() -> None:
    if not SOURCE_DIR.is_dir():
        raise SystemExit(f"Missing source image directory: {SOURCE_DIR}")

    OUTPUT_DIR.mkdir(exist_ok=True)
    rows: list[dict[str, str]] = []
    images = sorted(SOURCE_DIR.glob("*.jpg"))
    if not images:
        raise SystemExit(f"No JPG files found in {SOURCE_DIR}")

    for source in images:
        match = re.fullmatch(r"(\d{4})-(\d{2})\.jpg", source.name)
        if not match:
            continue
        year, number = match.groups()
        destination_dir = OUTPUT_DIR / year
        destination_dir.mkdir(exist_ok=True)

        original_name = f"{year}-{number}.jpg"
        shutil.copy2(source, destination_dir / original_name)

        footer_source = FOOTER_DIR / source.name
        footer_name = ""
        if footer_source.is_file():
            footer_name = f"{year}-{number}-no-footer.jpg"
            shutil.copy2(footer_source, destination_dir / footer_name)

        rows.append(
            {
                "year": year,
                "question": number,
                "image": f"{year}/{original_name}",
                "image_no_footer": f"{year}/{footer_name}" if footer_name else "",
                "source": f"错题原图备份/提取题图/{source.name}",
            }
        )

    if not rows:
        raise SystemExit("No filenames matched the expected YYYY-NN.jpg format")

    index_path = OUTPUT_DIR / "index.csv"
    with index_path.open("w", newline="", encoding="utf-8-sig") as index_file:
        writer = csv.DictWriter(index_file, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)

    print(f"Prepared {len(rows)} question entries in {OUTPUT_DIR}")
    print(f"Index: {index_path}")


if __name__ == "__main__":
    main()
