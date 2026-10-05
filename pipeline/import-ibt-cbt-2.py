"""Build one IBT/CBT bank from the supplied papers 2 and 3."""
import csv
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "pipeline/output/ibt-cbt-2"
CIRCLES = "①②③④⑤⑥⑦⑧"


def join_lines(lines):
    text = ""
    for line in lines:
        line = line.strip()
        if not line or line.startswith("©") or re.fullmatch(r"-\s*\d+\s*-", line):
            continue
        new_section = re.match(r"(?:[ア-エ][．.：:]|[①-⑧])", line)
        if text and new_section:
            text += "\n"
        elif text and re.search(r"[a-zA-Z]$", text) and re.match(r"[a-zA-Z]", line):
            text += " "
        text += line
    return text


def compact(text):
    return re.sub(r"\s", "", text)


def build_question(packet, q, a, note, paper):
    number = q["number"]
    body = join_lines(q["lines"])
    explanation = join_lines(a["lines"])
    key = re.match(r"解答\s*[:：]\s*([①-⑧]+)", explanation)
    assert key, f"Question {number}: missing answer"
    answer = [CIRCLES.index(choice) + 1 for choice in key[1]]
    explanation = explanation[key.end():].strip()

    if paper == 2 and number in (1, 28):
        # These are continuous passages with numbered underlined clauses.
        # Keep the entire passage, including connecting text, in the stem.
        stem = body
        options = [f"{choice} 下線部{choice}の記述" for choice in CIRCLES[:4]]
        assert all(choice in body for choice in CIRCLES[:4])
    else:
        start = re.search(r"(?:^|\n)①", body)
        assert start, f"Paper {paper} question {number}: missing first option"
        option_start = start.end() - 1
        stem = body[:option_start].strip()
        option_text = body[option_start:]
        pieces = re.split(r"([①-⑧])", option_text)
        options = [pieces[i] + pieces[i + 1].strip() for i in range(1, len(pieces), 2)]
        source_options = options.copy()
        if paper == 3 and number == 32:
            # Word reuses a list from earlier questions: labels 6/7 should be 7/8.
            # Keep the source labels in the audit packet; display positional labels.
            assert [option[0] for option in options] == list("①②③④⑤⑥⑥⑦")
            options = [CIRCLES[i] + option[1:] for i, option in enumerate(options)]
        else:
            assert [option[0] for option in options] == list(CIRCLES[:len(options)])
        assert compact(stem + "".join(source_options)) == compact(body), f"Question {number}: text lost"
    assert len(options) in (4, 5, 6, 8), f"Paper {paper} question {number}: {len(options)} options: {options}"
    assert all(1 <= choice <= len(options) for choice in answer)
    if "２つ選び" in compact(body[:500]):
        assert len(answer) == 2, f"Question {number}: multi-select mismatch"

    # Recompute the key from the supplied explanation's ○/× marks.
    truth = dict(re.findall(r"([ア-エ])\s*[:：]\s*([○〇◯×])", explanation))
    if len(truth) == 4:
        expected = []
        for index, option in enumerate(options, 1):
            table = dict(re.findall(r"([ア-エ])\s*[－−ー-]\s*([○〇◯×])", option))
            values = {k: v in "○〇◯" for k, v in truth.items()}
            option_body = re.sub(r"^[①-⑧]\s*", "", option)
            if table and {k: v in "○〇◯" for k, v in table.items()} == values:
                expected.append(index)
            elif re.match(r"[０-４0-4]\s*個", option_body):
                count = int(unicodedata.normalize("NFKC", re.search(r"[０-４0-4]", option)[0]))
                if count == sum(values.values()):
                    expected.append(index)
            elif re.match(r"[ア-エ]{2}$", option_body):
                if set(re.findall(r"[ア-エ]", option)) == {k for k, v in values.items() if v}:
                    expected.append(index)
    else:
        marks = dict(re.findall(r"([①-⑧])\s*[:：]\s*([○〇◯×])", explanation))
        assert len(marks) == 4
        wrong = "適切でないもの" in compact(body[:500])
        expected = [CIRCLES.index(k) + 1 for k, v in marks.items() if (v in "○〇◯") != wrong]
    assert answer == expected, f"Paper {paper} question {number}: key {answer} differs from explanation {expected}"

    row = {
        "id": f"ibt{paper}-{number:03}", "chapter": "ibt-mock",
        "title": note["title"], "question": stem,
        "question_zh": note["question_zh"], "options": options, "answer": answer,
        "answer_sets": "+".join(map(str, answer)),
        "explanation": explanation, "explanation_zh": note["explanation_zh"],
        "law_refs": [], "tags": ["IBT・CBT模擬問題", f"原題{paper}-{number}"],
        "confidence": "mid", "status": "ok", "law_as_of": "unknown",
        "source_tier": "user-supplied-material", "source_url": "",
        "question_text_source": packet["question_source"],
        "answer_source": packet["answer_source"],
        "explanation_source": "user-supplied-material",
        "review_status": "source-consistency-checked", "reviewed_at": "2026-10-05",
        "review_result": "原題・選択肢・解答・○×組合せを確認。中国語はAIによる要約。現行法の逐条審査は未実施。",
        "source_text_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
    }
    if paper == 3 and number == 32:
        row["source_options"] = source_options
        row["review_result"] += "原Word末二肢の自動番号⑥・⑦を順番どおり⑦・⑧として表示。"
    return row


rows = []
audit_only = "--audit-only" in sys.argv
for paper in (2, 3):
    raw = ROOT / f"pipeline/raw/ibt-cbt-{paper}"
    packet = json.loads((raw / "source.json").read_text(encoding="utf-8"))
    notes = ([{"number": n, "title": "", "question_zh": "", "explanation_zh": ""} for n in range(1, 41)]
             if audit_only else json.loads((raw / "chinese-notes.json").read_text(encoding="utf-8")))
    assert [q["number"] for q in packet["questions"]] == list(range(1, 41))
    assert [a["number"] for a in packet["answers"]] == list(range(1, 41))
    assert [n["number"] for n in notes] == list(range(1, 41))
    rows.extend(build_question(packet, q, a, note, paper)
                for q, a, note in zip(packet["questions"], packet["answers"], notes))
assert len({row["source_text_sha256"] for row in rows}) == len(rows), "Duplicate source questions"
print(json.dumps({"questions": len(rows), "source_consistency_matches": len(rows),
                  "option_counts": dict(Counter(len(row["options"]) for row in rows)),
                  "multiple_choice_questions": [row["id"] for row in rows if len(row["answer"]) > 1]}, ensure_ascii=False))
if audit_only:
    sys.exit(0)
assert all(row["title"] and row["question_zh"] and row["explanation_zh"] for row in rows)

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "questions.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
fields = [key for key in rows[0] if key != "source_text_sha256"]
with (ROOT / "data/ibt-cbt-2-questions.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        values = {key: row[key] for key in fields}
        for key in ("options", "answer", "law_refs", "tags"):
            values[key] = ("\n" if key == "options" else ",").join(map(str, row[key]))
        writer.writerow(values)
with (ROOT / "data/ibt-cbt-2-chapters.csv").open("w", encoding="utf-8", newline="") as stream:
    writer = csv.writer(stream)
    writer.writerow(["chapter", "name"])
    writer.writerow(["ibt-mock", "IBT・CBT 模擬問題"])
