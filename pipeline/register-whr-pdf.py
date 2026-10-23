"""Register a supplied or downloaded original PDF, preserving its exact bytes."""
import argparse
import hashlib
import json
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "data/whr-2026-materials.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("id", help="Exact item id from data/whr-2026-materials.json")
    parser.add_argument("source", type=Path, help="Original PDF, not a reconstructed or printed copy")
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    item = next(item for item in manifest["items"] if item["id"] == args.id)
    content = args.source.read_bytes()
    if not content.startswith(b"%PDF-"):
        raise ValueError("Not a PDF; an HTML login page is not an original file")
    pdf = PdfReader(args.source)
    pages = len(pdf.pages)
    expected = {"mock4-question": 27, "mock4-answer": 12}.get(args.id)
    if not pages or (expected and pages != expected):
        raise ValueError(f"Unexpected page count: {pages}, expected {expected or 'nonzero'}")
    target = ROOT / f"data/materials/whr-2026/{args.id}.pdf"
    if target.exists() and target.read_bytes() != content:
        raise ValueError("Different original already registered; inspect before replacing")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    item.update(status="ready", file=f"./{target.relative_to(ROOT).as_posix()}",
                page_count=pages, sha256=hashlib.sha256(content).hexdigest())
    manifest["ready"] = all(i["status"] == "ready" for i in manifest["items"])
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"id": args.id, "pages": pages, "sha256": item["sha256"]}))


if __name__ == "__main__":
    main()
