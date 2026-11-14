#!/usr/bin/env python3
"""Check generated 408 question-bank files for complete, unique IDs."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "data" / "questions"
errors: list[str] = []
seen: set[str] = set()
total = 0

for year in range(2009, 2027):
    path = BANK / f"{year}.json"
    try:
        questions = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        errors.append(f"{year}: cannot load JSON: {error}")
        continue
    numbers = [question.get("number") for question in questions]
    if numbers != list(range(1, 48)):
        errors.append(f"{year}: expected question numbers 1-47, got {numbers}")
    for question in questions:
        question_id = question.get("id")
        if question_id in seen:
            errors.append(f"duplicate ID: {question_id}")
        seen.add(question_id)
        if not question.get("text", "").strip():
            errors.append(f"{question_id}: empty text")
    total += len(questions)

if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f"OK: {total} questions, {len(seen)} unique IDs, years 2009-2026")
