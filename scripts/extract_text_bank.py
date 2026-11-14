#!/usr/bin/env python3
"""Extract question blocks from selectable-text 408 exam PDFs."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "data" / "source-text"
OUTPUT_DIR = ROOT / "data" / "questions"
HEADING = re.compile(r"^\s{0,4}(\d{1,2})[.．、]\s*\S")


def extract_year(year: int) -> list[dict[str, object]]:
    text = (INPUT_DIR / f"{year}.txt").read_text(encoding="utf-8")
    lines = text.splitlines()
    starts: dict[int, int] = {}
    expected = 1
    for index, line in enumerate(lines):
        match = HEADING.match(line)
        if match and int(match.group(1)) == expected:
            starts[expected] = index
            expected += 1
            if expected == 41:
                break
    if expected != 41:
        raise ValueError(f"{year}: found sequential question headings 1-{expected - 1}, expected 1-40")

    questions: list[dict[str, object]] = []
    for number in range(1, 41):
        start = starts[number]
        end = starts[number + 1] if number < 40 else next((i for i in range(start + 1, len(lines)) if re.match(r"^\s{0,4}41[.．、]\s*", lines[i])), len(lines))
        body = "\n".join(line.rstrip() for line in lines[start:end]).strip()
        body = re.sub(r"\n{3,}", "\n\n", body)
        body = re.sub(r"(?m)^.*\d+ 年全国硕士研究生入学统一考试.*第\s*\d+\s*页.*$", "", body)
        question = {
            "id": f"q-{year}-{number:02d}",
            "year": year,
            "number": number,
            "subject": "ds" if number <= 11 else "co" if number <= 22 else "os" if number <= 32 else "cn",
            "type": "single",
            "text": body,
            "source": "neville-studio/408-exam-paper",
            "answer": None,
            "explanation": None,
            "sourceImage": None,
            "verification": "source-text-unverified",
        }
        if year == 2022 and number == 1:
            question["text"] = (
                "1. 下列程序段的时间复杂度是（ ）。\n"
                "int sum = 0;\n"
                "for (int i = 1; i < n; i *= 2)\n"
                "    for (int j = 0; j < i; j++)\n"
                "        sum++;\n"
                "A. O(log₂n)    B. O(n)    C. O(nlog₂n)    D. O(n²)"
            )
            question["source"] = "user-provided-original-pdf"
            question["sourcePage"] = 110
            question["verification"] = "checked-against-original-pdf"
        elif year == 2022 and number == 11:
            question["text"] = (
                "11. 对数据进行排序时，若采用直接插入排序而不采用快速排序，则可能的原因是（ ）。\n"
                "I. 大部分元素已有序    II. 待排序元素数量很少\n"
                "III. 要求空间复杂度为 O(1)    IV. 要求排序算法是稳定的\n"
                "A. 仅 I、II    B. 仅 III、IV    C. 仅 I、II、IV    D. I、II、III、IV"
            )
            question["source"] = "user-provided-original-pdf"
            question["sourcePage"] = 111
            question["verification"] = "checked-against-original-pdf"
        elif re.search(r"如下图|下图|右图|左图|如图|见图|图中|题图|拓扑|波形|如下表|下表|见下表|表中|图\s*[（(]?\d+", body):
            question["verification"] = "image-or-table-needs-review"
        questions.append(question)
    return questions


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for year in range(2009, 2027):
        questions = extract_year(year)
        output = OUTPUT_DIR / f"{year}.json"
        output.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"{year}: {len(questions)} questions -> {output.relative_to(ROOT)}")
        total += len(questions)
    metadata = {
        "years": list(range(2009, 2027)),
        "questionsPerYear": 40,
        "questions": total,
        "questionType": "single-choice",
        "source": "neville-studio/408-exam-paper",
    }
    (ROOT / "data" / "bank-meta.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"total: {total} questions")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
