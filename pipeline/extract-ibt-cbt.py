"""Extract supplied IBT/CBT Word booklets into traceable text packets."""
import hashlib
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def extract(path):
    with ZipFile(path) as archive:
        document = ET.fromstring(archive.read("word/document.xml"))
        numbering = ET.fromstring(archive.read("word/numbering.xml")) if "word/numbering.xml" in archive.namelist() else None
    assert not document.findall(f".//{W}ins") and not document.findall(f".//{W}del"), "Unresolved tracked changes"
    paragraphs = []
    counters = {}
    auto_numbering = []
    for paragraph in document.findall(f".//{W}body//{W}p"):
        text = "".join(node.text or "" if node.tag == W + "t" else "\n" if node.tag == W + "br" else "\t"
                       for node in paragraph.iter() if node.tag in (W + "t", W + "br", W + "tab"))
        num = paragraph.find(f"{W}pPr/{W}numPr")
        if num is not None:
            num_id = num.find(W + "numId").get(W + "val")
            level = num.find(W + "ilvl").get(W + "val")
            definition = numbering.find(f"{W}num[@{W}numId='{num_id}']")
            abstract_id = definition.find(W + "abstractNumId").get(W + "val")
            abstract = numbering.find(f"{W}abstractNum[@{W}abstractNumId='{abstract_id}']")
            rule = abstract.find(f"{W}lvl[@{W}ilvl='{level}']")
            assert rule.find(W + "numFmt").get(W + "val") == "decimalEnclosedCircle"
            assert definition.find(W + "lvlOverride") is None
            counter_key = (num_id, level)
            value = counters.get(counter_key, int(rule.find(W + "start").get(W + "val")) - 1) + 1
            counters[counter_key] = value
            label = chr(0x2460 + value - 1)
            auto_numbering.append({"paragraph": len(paragraphs), "label": label, "num_id": num_id})
            text = label + " " + text
        paragraphs.append(text.strip())
    blocks = []
    for index, text in enumerate(paragraphs):
        heading = re.match(r"^問\s*([0-9０-９]+)(?:\s|$)", text)
        if heading:
            blocks.append({"number": int(unicodedata.normalize("NFKC", heading[1])),
                           "paragraph": index, "heading": text, "lines": []})
        elif blocks and text and not (text.startswith("©") or re.fullmatch(r"-\s*\d+\s*-", text)
                                     or text.startswith("本ＩＢＴ・ＣＢＴ")):
            blocks[-1]["lines"].extend(text.splitlines())
    assert [block["number"] for block in blocks] == list(range(1, 41)), f"{path.name}: incomplete question numbers"
    assert all(block["lines"] for block in blocks), f"{path.name}: empty question"
    return blocks, auto_numbering


if __name__ == "__main__":
    directory = Path(sys.argv[1])
    for paper in (2, 3):
        question = directory / f"ＩＢＴ・ＣＢＴ対策模擬問題 {paper}.docx"
        answer = directory / f"ＩＢＴ・ＣＢＴ対策模擬解答 {paper}.docx"
        question_blocks, question_numbering = extract(question)
        answer_blocks, answer_numbering = extract(answer)
        packet = {"question_source": question.name, "answer_source": answer.name,
                  "question_docx_sha256": hashlib.sha256(question.read_bytes()).hexdigest(),
                  "answer_docx_sha256": hashlib.sha256(answer.read_bytes()).hexdigest(),
                  "law_as_of": "unknown", "questions": question_blocks, "answers": answer_blocks,
                  "question_auto_numbering": question_numbering, "answer_auto_numbering": answer_numbering}
        destination = ROOT / f"pipeline/raw/ibt-cbt-{paper}"
        destination.mkdir(parents=True, exist_ok=True)
        (destination / "source.json").write_text(json.dumps(packet, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"paper": paper, "questions": len(packet["questions"]), "answers": len(packet["answers"])}, ensure_ascii=False))
