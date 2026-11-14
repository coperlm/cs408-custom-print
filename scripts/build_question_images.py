#!/usr/bin/env python3
"""Match image/table choice questions to original PDF pages and crop each item."""

from __future__ import annotations

import csv
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "源资料" / "408真题PDF原始页"
BANK = ROOT / "data" / "questions"
OUTPUT = ROOT / "data" / "question-images"
PAGE_RANGES = {
    2009: (5, 11), 2010: (12, 19), 2011: (20, 26), 2012: (27, 34),
    2013: (35, 42), 2014: (43, 48), 2015: (49, 57), 2016: (58, 66),
    2017: (67, 75), 2018: (76, 83), 2019: (84, 91), 2020: (92, 99),
    2021: (100, 108), 2022: (109, 117), 2023: (118, 125),
    2024: (126, 135), 2025: (136, 144), 2026: (145, 153),
}
IMAGE_CUE = re.compile(
r"如下图|下图|上图|右图|左图|如图|见图|图中|图示|题\s*\d*\s*图|题图|拓扑|波形|如下表|下表|见下表|上表|表中|表格|图\s*[（(]?\d+"
)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    return "".join(char for char in text if char.isalnum() or "\u4e00" <= char <= "\u9fff")


def bigrams(text: str) -> set[str]:
    return {text[index:index + 2] for index in range(max(0, len(text) - 1))}


def read_page_text(page: int) -> str:
    image = SOURCE / f"page-{page}.jpg"
    result = subprocess.run(
        ["tesseract", str(image), "stdout", "-l", "chi_sim", "--psm", "6"],
        check=True, capture_output=True, text=True,
    )
    return result.stdout


def get_question_starts(page: int) -> dict[int, int]:
    image = SOURCE / f"page-{page}.jpg"
    result = subprocess.run(
        ["tesseract", str(image), "stdout", "-l", "chi_sim", "--psm", "6", "tsv"],
        check=True, capture_output=True, text=True,
    )
    groups: dict[tuple[str, str, str, str], list[tuple[int, str]]] = {}
    for row in csv.DictReader(result.stdout.splitlines(), delimiter="\t"):
        word = row["text"].strip()
        if not word:
            continue
        key = (row["page_num"], row["block_num"], row["par_num"], row["line_num"])
        groups.setdefault(key, []).append((int(row["left"]), int(row["top"]), word))
    starts: dict[int, int] = {}
    for words in groups.values():
        words.sort(key=lambda item: item[0])
        line = " ".join(word for _, _, word in words)
        match = re.match(r"^\s*0*(\d{1,2})\s*[.．、]", line)
        if match:
            number = int(match.group(1))
            if 1 <= number <= 40:
                starts[number] = min(top for _, top, _ in words)
    return starts


def question_key(text: str) -> str:
    lines = text.splitlines()
    text = " ".join(lines[:5])
    text = re.sub(r"^\s*\d+\s*[.．、]\s*", "", text)
    text = re.sub(r"^（[^）]*分）", "", text)
    return normalize(text)[:240]


def match_pages(year: int, question: dict[str, object], page_text: dict[int, str]) -> tuple[int, float]:
    key = question_key(str(question["text"]))
    key_grams = bigrams(key)
    first, last = PAGE_RANGES[year]
    ranked: list[tuple[float, int]] = []
    for page in range(first, last + 1):
        document_grams = bigrams(normalize(page_text[page]))
        score = len(key_grams & document_grams) / max(1, len(key_grams))
        ranked.append((score, page))
    return max(ranked)


OCR_CACHE = Path("/tmp/pelican-ocr-chi.txt")
def main() -> None:
    page_text: dict[int, str] = {}
    for line in OCR_CACHE.read_text(encoding="utf-8").splitlines():
        match = re.match(r"page-(\d+)\s+(.*)", line)
        if match:
            page_text[int(match.group(1))] = match.group(2)

    candidates: list[tuple[int, dict[str, object]]] = []
    for year in range(2009, 2027):
        questions = json.loads((BANK / f"{year}.json").read_text(encoding="utf-8"))
        for question in questions:
            if question["number"] <= 40 and IMAGE_CUE.search(str(question["text"])):
                candidates.append((year, question))
    mapped: dict[int, list[tuple[dict[str, object], float]]] = {}
    for year, question in candidates:
        score, zero_page = match_pages(year, question, page_text)
        if score < 0.48:
            print(f"UNMATCHED {year}-{question['number']:02d} score={score:.2f}")
            continue
        source_page = zero_page + 1
        question["sourcePage"] = source_page
        question["imageConfidence"] = round(score, 3)
        mapped.setdefault(source_page, []).append((question, score))

    all_starts: dict[int, dict[int, int]] = {}
    for page in mapped:
        all_starts[page] = get_question_starts(page)

    manifest = []
    for page, items in sorted(mapped.items()):
        starts = all_starts[page]
        image_path = SOURCE / f"page-{page}.jpg"
        with Image.open(image_path) as original:
            width, height = original.size
            ordered = sorted(items, key=lambda item: int(item[0]["number"]))
            for question, score in ordered:
                number = int(question["number"])
                top = starts.get(number)
                bottom = None
                if int(question["year"]) == 2025 and number == 11:
                    top, bottom = 470, 1180
                if top is None:
                    print(f"NO-BOUNDARY {question['year']}-{number:02d} source-page={page}")
                    question["sourcePage"] = None
                    question["imageConfidence"] = 0
                    continue
                if bottom is None:
                    next_tops = [y for n, y in starts.items() if number < n <= 40 and y > top]
                    bottom = min(next_tops) - 12 if next_tops else height - 120
                    bottom = max(top + 140, min(height, bottom))
                crop = original.crop((0, max(0, top - 18), width, bottom))
                filename = f"{question['year']}-{number:02d}.jpg"
                crop.save(OUTPUT / filename, quality=92, optimize=True)
                question["sourceImage"] = f"assets/question-images/{filename}"
                question["verification"] = "source-page-image-matched"
                manifest.append({
                    "id": question["id"],
                    "sourcePage": page,
                    "confidence": round(score, 3),
                    "crop": filename,
                })
                print(f"{question['id']} page={page} confidence={score:.2f} crop={crop.width}x{crop.height}")

    by_year = {year: json.loads((BANK / f"{year}.json").read_text(encoding="utf-8")) for year in range(2009, 2027)}
    for year, question in candidates:
        target = next(item for item in by_year[year] if item["number"] == question["number"])
        target.update({key: value for key, value in question.items() if key in {"sourcePage", "sourceImage", "imageConfidence", "verification"}})
    for year, questions in by_year.items():
        (BANK / f"{year}.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "data" / "question-image-map.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"matched {len(manifest)}/{len(candidates)} figure/table single-choice questions")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
