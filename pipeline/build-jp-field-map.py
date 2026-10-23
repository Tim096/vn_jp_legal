"""Build the six-field study taxonomy without modifying source questions or IDs."""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Reviewed primary chapters for mock 1–4, in original question order.
# These are study classifications, not the publisher's per-question score allocation.
MOCK_CHAPTERS = {
    1: [1,1,2,2,3,4,4,7,9,9,10,11,12,12,12,13,13,13,16,16,
        1,1,1,1,2,5,4,5,8,9,10,11,12,12,13,13,13,13,14,16],
    2: [1,1,2,5,4,5,6,8,9,10,10,11,12,12,12,13,13,13,14,16,
        1,1,2,2,3,4,4,9,9,9,10,11,12,12,13,13,13,13,15,16],
    3: [1,1,1,1,2,2,3,4,5,6,9,10,12,12,12,12,13,13,16,16,
        1,1,1,1,2,2,4,4,5,6,9,9,11,12,12,13,13,13,14,16],
    4: [1,1,1,2,2,3,4,5,5,6,9,9,9,11,12,13,13,13,14,16,
        1,1,1,2,2,3,4,7,9,9,11,12,12,12,13,13,13,13,15,16],
}
FIELDS = [
    {'name': '企業取引・契約', 'chapters': [0,1,16], 'reference': '序章・第1章・第16章'},
    {'name': '企業財産の管理', 'chapters': [2], 'reference': '第2章'},
    {'name': '企業活動の法規制', 'chapters': [3,4,5,6,7,8,15], 'reference': '第3〜8章・第15章'},
    {'name': '債権の管理・回収', 'chapters': [9,10,11], 'reference': '第9〜11章'},
    {'name': '紛争の予防・対応', 'chapters': [12], 'reference': '第12章'},
    {'name': '会社の組織・労務', 'chapters': [13,14], 'reference': '第13・14章'},
]
chapter_field = {c: i for i, f in enumerate(FIELDS) for c in f['chapters']}
banks = {}
audit = []
for bank, file in [('jp-business-law','questions'), ('jp-ibt-cbt-2','ibt-cbt-2-questions'),
                   ('jp-ibt-cbt-4','ibt-cbt-4-questions'), ('jp-whr-field-2026','whr-field-2026-questions'),
                   ('jp-whr-qa-2026','whr-qa-2026-questions')]:
    banks[bank] = {}
    for q in csv.DictReader((ROOT / 'data' / f'{file}.csv').open(encoding='utf-8-sig')):
        if bank == 'jp-business-law':
            chapters, basis = [int(q['chapter'][2:])], 'source-chapter'
        elif bank == 'jp-whr-field-2026':
            chapters, basis = [int(q['chapter'].split('-')[-1])-1817260], 'source-chapter'
        elif bank == 'jp-whr-qa-2026':
            chapters = sorted(set(map(int, re.findall(r'(\d+)章', unicodedata.normalize('NFKC', q['explanation'])))))
            basis = 'source-explanation-reference'
        else:
            paper, number = map(int, re.fullmatch(r'ibt(\d)-(\d+)', q['id']).groups())
            chapters, basis = [MOCK_CHAPTERS[paper][number-1]], 'reviewed-primary-topic'
        fields = {chapter_field[c] for c in chapters}
        assert len(fields) == 1, (q['id'], chapters)
        banks[bank][q['id']] = fields.pop()
        audit.append([bank, q['id'], q['title'], '+'.join(map(str,chapters)), basis])
manifest = {'version': 1, 'fields': FIELDS, 'banks': banks}
(ROOT / 'data/jp-field-map.js').write_text('window.JP_FIELD_MAP = ' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
with (ROOT / 'pipeline/output/jp-field-map.csv').open('w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['bank','id','title','chapters','classification_source'])
    writer.writerows(audit)
print(json.dumps({bank: len(questions) for bank,questions in banks.items()}))
