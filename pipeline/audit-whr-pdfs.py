"""Verify downloaded WHR originals and compare mock 4 with captured page text."""
import hashlib
import json
import re
import unicodedata
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "pipeline/raw/whr-2026"


def compact(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))


def main():
    manifest = json.loads((ROOT / "data/whr-2026-materials.json").read_text(encoding="utf-8"))
    source = json.loads((RAW / "pdf-originals.json").read_text(encoding="utf-8"))
    captured = {item["id"]: item for item in source["items"]}
    assert manifest["ready"] and len(captured) == len(manifest["items"]) == 29
    assert set(captured) == {item["id"] for item in manifest["items"]}
    reports = []
    compared = 0
    for item in manifest["items"]:
        path = ROOT / item["file"]
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        assert content.startswith(b"%PDF-")
        assert digest == item["sha256"] == captured[item["id"]]["sha256"], item["id"]
        pdf = PdfReader(path)
        assert len(pdf.pages) == item["page_count"] == captured[item["id"]]["viewer_page_count"], item["id"]
        texts = [page.extract_text() or "" for page in pdf.pages]
        if item["kind"] == "textbook":
            chapter = re.search(r"第\d単位第(\d+)章", compact(item["title"]))
            expected = f"第{chapter.group(1)}章" if chapter else "序章"
            assert expected in compact(texts[0]), item["id"]
        else:
            packet = json.loads((RAW / f'{item["id"]}-pages.json').read_text(encoding="utf-8"))
            assert len(packet["pages"]) == len(texts), item["id"]
            for index, page in enumerate(packet["pages"]):
                if not page["text"]:
                    assert item["id"] == "mock4-question" and index == 0
                    continue  # The original PDF also retains the cover/instructions.
                assert compact(page["text"]) == compact(texts[index]), (item["id"], index + 1)
                compared += 1
        reports.append({"id": item["id"], "pages": len(texts), "bytes": len(content),
                        "sha256": digest, "text_characters": sum(map(len, texts)),
                        "pages_without_text": [i + 1 for i, text in enumerate(texts) if not text.strip()]})
    report = {"status": "ready", "files": len(reports),
              "pages": sum(item["pages"] for item in reports),
              "bytes": sum(item["bytes"] for item in reports),
              "mock4_content_pages_compared": compared, "items": reports}
    (ROOT / "pipeline/output/whr-2026/pdf-verification.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "items"}))


if __name__ == "__main__":
    main()
