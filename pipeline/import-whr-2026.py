"""Build the three independent 2026 WHR banks from captured source packets.

This does not fetch authenticated pages or modify the original IBT 1-3 bank.
"""
import argparse
import csv
import hashlib
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline/raw/whr-2026"
OUT = ROOT / "pipeline/output/whr-2026"
CIRCLES = "①②③④⑤⑥⑦⑧"
BANKS = {"field": "whr-field-2026", "qa": "whr-qa-2026", "mock4": "ibt-cbt-4"}


def compact(text):
    return re.sub(r"\s", "", text)


def clean(text):
    return re.sub(r"\n{3,}", "\n\n", text.replace("\xa0", " ")).strip()


class Underlines(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.groups = []
        self.active = None

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "img", "hr", "input", "meta", "link", "wbr"):
            return
        marked = tag == "u" or bool(re.search(r"text-decoration[^;]*underline", dict(attrs).get("style", "")))
        self.stack.append(marked)
        if marked and self.active is None:
            self.active = []

    def handle_endtag(self, tag):
        if self.stack:
            self.stack.pop()
        if self.active is not None and not any(self.stack):
            self.groups.append("".join(self.active))
            self.active = None

    def handle_data(self, text):
        if self.active is not None:
            self.active.append(text)


def underline_ranges(text, source_html):
    parser = Underlines()
    parser.feed(source_html)
    positions = [i for i, char in enumerate(text) if not char.isspace()]
    normalized = compact(text)
    ranges = []
    offset = 0
    for group in parser.groups:
        needle = compact(group)
        if not needle:
            continue
        start = normalized.find(needle, offset)
        assert start >= 0, f"Underline missing from text: {needle}"
        ranges.append([positions[start], positions[start + len(needle) - 1] + 1])
        offset = start + len(needle)
    return ranges


def row_base(qid, chapter, title, question, options, answer, explanation, source):
    assert question and options and answer and explanation, qid
    assert len(options) in (2, 4, 5, 6, 8), (qid, len(options))
    assert all(1 <= a <= len(options) for a in answer), qid
    return {
        "id": qid, "chapter": chapter, "title": title,
        "question": question, "question_zh": "", "options": options,
        "answer": answer, "answer_sets": "+".join(map(str, answer)),
        "explanation": explanation, "explanation_zh": "", "question_underlines": [],
        "law_refs": [], "tags": ["2026年度", "公式通信講座"],
        "confidence": "mid", "status": "ok", "law_as_of": "unknown",
        "source_tier": "user-supplied-material", "source_url": "",
        "question_text_source": source, "answer_source": source,
        "explanation_source": "user-supplied-material",
        "review_status": "source-consistency-checked", "reviewed_at": "2026-10-23",
        "review_result": "原題・選択肢・原解答・解説の対応を確認。現行法の逐条審査は未実施。",
        "source_text_sha256": hashlib.sha256(compact(question + "".join(options)).encode()).hexdigest(),
    }


def html_banks():
    banks = {"field": [], "qa": []}
    chapters = {"field": {}, "qa": {}}
    for kind in banks:
        unit_order = [1817243, 1817246, 1817244, 1817247, 1817245, 1817248]
        paths = sorted(RAW.glob(f"{kind}-*.json"), key=lambda p: unit_order.index(int(p.stem.split("-")[1])) if kind == "qa" else p.name)
        for path in paths:
            packet = json.loads(path.read_text(encoding="utf-8"))
            unit = packet["unit_id"]
            chapter = f"whr-{kind}-{unit}"
            chapters[kind][chapter] = packet["unit_title"]
            assert [q["number"] for q in packet["questions"]] == list(range(1, len(packet["questions"]) + 1))
            for q in packet["questions"]:
                assert not q["images"], f"Uncaptured image: {path}:{q['number']}"
                question = clean(q["question"])
                options = [re.sub(r"\s+", " ", o).strip() for o in q["options"]]
                explanation = clean(re.sub(r"^解説\s*", "", q["explanation"]))
                row = row_base(f"whr26-{kind}-{unit}-{q['number']:03}", chapter,
                               f"{packet['unit_title']} · {q['number']}", question, options,
                               q["answer"], explanation, f"{packet['source_title']}／{packet['unit_title']}／第{q['number']}問")
                row["question_underlines"] = underline_ranges(question, q["question_html"])
                assert compact(row["question"]) == compact(q["question"])
                assert all(compact(a) == compact(b) for a, b in zip(options, q["options"]))
                banks[kind].append(row)
    assert [len(banks[k]) for k in ("field", "qa")] == [72, 120]
    assert [len(chapters[k]) for k in ("field", "qa")] == [17, 6]
    return banks, chapters


def pdf_blocks(kind):
    packet = json.loads((RAW / f"mock4-{kind}-pages.json").read_text(encoding="utf-8"))
    assert [p["page"] for p in packet["pages"]] == list(range(1, (27 if kind == "question" else 12) + 1))
    text = "\n".join(p["text"] for p in packet["pages"])
    text = re.sub(r"(?m)^\s*-\s*\d+\s*-\s*$", "", text)
    text = re.sub(r"(?m)^©[^\n]*$", "", text)
    parts = re.split(r"(?:^|\n)問\s*([０-９0-9]+)", text)
    blocks = {int(unicodedata.normalize("NFKC", parts[i])): parts[i + 1].strip() for i in range(1, len(parts), 2)}
    assert list(blocks) == list(range(1, 41))
    return blocks


def join_pdf_lines(text):
    # PDF line wrapping is not a paragraph boundary; keep original section markers.
    result = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if result and re.match(r"(?:[ア-オ][．.：:]|[①-⑧])", line):
            result += "\n"
        elif result and re.search(r"[A-Za-z]$", result) and re.match(r"[A-Za-z]", line):
            result += " "
        result += line
    return result


def check_mock_answer(stem, options, answer, explanation):
    truth = dict(re.findall(r"([ア-エ])\s*[:：]\s*([○〇◯×])", explanation))
    if len(truth) == 4:
        values = {k: v in "○〇◯" for k, v in truth.items()}
        expected = []
        for index, option in enumerate(options, 1):
            table = dict(re.findall(r"([ア-エ])\s*[－−ー-]\s*([○〇◯×])", option))
            body = re.sub(r"^[①-⑧]\s*", "", option)
            if table:
                match = {k: v in "○〇◯" for k, v in table.items()} == values
            elif re.fullmatch(r"[０-４0-4]\s*個", body):
                match = int(unicodedata.normalize("NFKC", body[0])) == sum(values.values())
            else:
                assert re.fullmatch(r"[ア-エ]{2}", body), option
                match = set(body) == {k for k, v in values.items() if v}
            if match:
                expected.append(index)
    else:
        truth = dict(re.findall(r"([①-④])\s*[:：]\s*([○〇◯×])", explanation))
        assert len(truth) == 4, explanation
        negative = "適切でないもの" in compact(stem[:500])
        expected = [CIRCLES.index(k) + 1 for k, v in truth.items() if (v in "○〇◯") != negative]
    assert answer == expected, (answer, expected)


def mock_bank():
    questions, answers = pdf_blocks("question"), pdf_blocks("answer")
    reviewed_underlines = json.loads((RAW / "mock4-underlines.json").read_text(encoding="utf-8"))
    rows = []
    for number in questions:
        body = join_pdf_lines(questions[number])
        answer_body = join_pdf_lines(answers[number])
        match = re.search(r"解答\s*[:：]\s*([①-⑧]+)", answer_body)
        assert match, number
        answer = [CIRCLES.index(c) + 1 for c in match[1]]
        explanation = answer_body[match.end():].strip()
        if number in (2, 14, 27):
            stem = body
            options = [f"{c} 下線部{c}の記述" for c in CIRCLES[:4]]
        else:
            start = re.search(r"\n①(?![～〜])", body)
            assert start, number
            stem = body[:start.start()].strip()
            parts = re.split(r"([①-⑧])", body[start.start():])
            options = [parts[i] + parts[i + 1].strip() for i in range(1, len(parts), 2)]
            assert [o[0] for o in options] == list(CIRCLES[:len(options)]), number
            assert compact(stem + "".join(options)) == compact(body), number
        if "２つ選び" in compact(stem[:500]):
            assert len(answer) == 2, number
        check_mock_answer(stem, options, answer, explanation)
        row = row_base(f"ibt4-{number:03}", "ibt4-mock", f"模擬問題４ · {number}", stem, options,
                       answer, explanation, f"IBT・CBT対策模擬問題４／第{number}問")
        row["review_result"] += "PDF閲覧画面の全ページ文字層から取得。原PDFと全問題・解説ページの文字照合済み。"
        if number in (2, 14, 27):
            passages = reviewed_underlines[row["id"]]["underlined_text"]
            assert len(passages) == 4
            row["question_underlines"] = underline_ranges(stem, "".join(f"<u>{text}</u>" for text in passages))
        rows.append(row)
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit-only", action="store_true")
    args = parser.parse_args()
    banks, chapters = html_banks()
    banks["mock4"] = mock_bank()
    chapters["mock4"] = {"ibt4-mock": "IBT・CBT対策模擬問題４"}
    notes = {}
    for kind in BANKS:
        with (RAW / f"notes-{kind}.tsv").open(encoding="utf-8", newline="") as stream:
            for key, title, question_zh, explanation_zh in csv.reader(stream, delimiter="\t"):
                qid = f"ibt4-{key}" if kind == "mock4" else f"whr26-{kind}-{key}"
                assert qid not in notes, qid
                notes[qid] = dict(title=title, question_zh=question_zh, explanation_zh=explanation_zh)
    for rows in banks.values():
        for row in rows:
            note = notes.get(row["id"], {})
            for key in ("title", "question_zh", "explanation_zh"):
                if note.get(key):
                    row[key] = note[key]
    rows = [r for bank in banks.values() for r in bank]
    assert len({r["id"] for r in rows}) == 232
    assert set(notes) == {r["id"] for r in rows}, "Chinese notes must match every question id"
    report = {"counts": {k: len(v) for k, v in banks.items()}, "source_fields_complete": len(rows),
              "chinese_notes_complete": sum(bool(r["question_zh"] and r["explanation_zh"]) for r in rows),
              "pending_underline_review": [r["id"] for r in rows if r["review_status"] == "underline-review-pending"],
              "original_pdf_status": "ready" if json.loads((ROOT / "data/whr-2026-materials.json").read_text(encoding="utf-8"))["ready"] else "blocked_data"}
    print(json.dumps(report, ensure_ascii=False))
    if args.audit_only:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    for kind, rows in banks.items():
        (OUT / f"{kind}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        fields = list(rows[0])
        with (ROOT / f"data/{BANKS[kind]}-questions.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=fields)
            writer.writeheader()
            for row in rows:
                values = row.copy()
                for key in ("options", "answer", "law_refs", "tags"):
                    values[key] = ("\n" if key == "options" else ",").join(map(str, row[key]))
                values["question_underlines"] = json.dumps(row["question_underlines"], ensure_ascii=False)
                writer.writerow(values)
        with (ROOT / f"data/{BANKS[kind]}-chapters.csv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(["chapter", "name"])
            writer.writerows(chapters[kind].items())
    (OUT / "audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
