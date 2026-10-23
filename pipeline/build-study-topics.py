"""Reproducible topic hints; source chapter links are not page-level citations."""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
rules = [
    ('contract-remedies', '契約不適合・解除・損害賠償', [1], '契約不適合|追完|解除|損害賠償'),
    ('contract-formation', '意思表示・代理・契約成立', [1], '意思表示|代理|錯誤|詐欺|申込|承諾'),
    ('lease', '賃貸借・借地借家', [1,2], '賃貸|賃借|借地|借家'),
    ('services', '請負・委任・運送', [1], '請負|委任|運送'),
    ('payments', '決済・手形・保険', [1], '手形|小切手|決済|保険'),
    ('international', '国際取引・準拠法', [16], '準拠法|国際|ウィーン|外国|仲裁'),
    ('property', '所有権・登記・不動産', [2], '所有権|登記|不動産|共有|占有'),
    ('patent', '特許・職務発明', [2], '特許|発明'),
    ('copyright', '著作権', [2], '著作|著作者'),
    ('trademark', '商標・意匠', [2], '商標|意匠'),
    ('competition', '独占禁止法・競争規制', [3], '独占|カルテル|取引制限|競争|優越'),
    ('subcontract', '取適法・下請取引', [3], '下請|取適法|受託|委託'),
    ('consumer', '消費者契約・取消し', [4], '消費者契約|消費者|取消'),
    ('sales', '特定商取引・訪問販売', [4], '特定商|訪問|通信販売|クーリング'),
    ('privacy', '個人情報保護', [5], '個人情報|個人データ|個人識別|匿名加工|仮名加工'),
    ('secrets', '営業秘密・情報管理', [5], '営業秘密|不正競争|秘密保持'),
    ('digital', '電子取引・デジタル法務', [6], '電子|デジタル|インターネット|サイバー|プラットフォーム'),
    ('advertising', '広告・景品表示', [7], '景品|表示|広告|ステルス'),
    ('finance', '金融商品・インサイダー', [8], '金融|証券|インサイダー|投資'),
    ('security', '抵当権・担保権', [9], '抵当|質権|留置|先取|担保'),
    ('guarantee', '保証・連帯債務', [9], '保証|連帯債務'),
    ('assignment', '債権譲渡・対抗要件', [9,10], '債権譲渡|譲渡制限|譲受|対抗要件'),
    ('collection', '弁済・相殺・時効', [10], '弁済|相殺|時効'),
    ('preservation', '債権者代位・詐害行為', [10], '代位|詐害行為'),
    ('insolvency', '破産・再生・倒産', [11], '破産|再生|倒産|更生|否認'),
    ('litigation', '訴訟・管轄・証拠', [12], '訴訟|管轄|証拠|判決|立証|訴え'),
    ('arbitration', '仲裁・調停・和解', [12], '仲裁|調停|和解|ADR'),
    ('execution', '保全・強制執行', [12], '仮差押|仮処分|保全|強制執行|支払督促'),
    ('directors', '取締役・利益相反・責任', [13], '取締役|利益相反|競業|役員|監査役'),
    ('shareholders', '株主総会・決議', [13], '株主総会|決議|議決権'),
    ('shares', '株式・資本・組織再編', [13], '株式|株券|資本金|合併|組織再編|会社分割'),
    ('employment', '労働契約・解雇', [14], '労働契約|解雇|雇止|就業規則'),
    ('working-time', '労働時間・賃金・休暇', [14], '労働時間|賃金|残業|休暇|休日'),
    ('administration', '行政・地域社会', [15], '行政|地域|環境|許可|処分'),
    ('compliance', 'コンプライアンス・企業倫理', [0], 'コンプライアンス|企業倫理|規制|リスク|責任'),
]
topics = {key: {'label': label, 'chapters': chapters} for key,label,chapters,_ in rules}
chapters = {int(r['chapter'][2:]): r['name'] for r in csv.DictReader((ROOT/'data/chapters.csv').open(encoding='utf-8-sig'))}
for chapter,label in chapters.items():
    topics[f'chapter-{chapter}'] = {'label': label + '（その他・分類未確定）', 'chapters': [chapter]}
materials = json.loads((ROOT/'data/whr-2026-materials.json').read_text(encoding='utf-8'))['items']
books = {}
for item in materials:
    if item['kind'] != 'textbook': continue
    title = unicodedata.normalize('NFKC',item['title'])
    match = re.search(r'第(\d+)章',title)
    chapter = int(match[1]) if match else 0
    books.setdefault(chapter,[]).append({'id':item['id'],'title':item['title']})
files = {'jp-business-law':'questions','jp-ibt-cbt-2':'ibt-cbt-2-questions','jp-ibt-cbt-4':'ibt-cbt-4-questions','jp-whr-field-2026':'whr-field-2026-questions','jp-whr-qa-2026':'whr-qa-2026-questions'}
source = {(r['bank'],r['id']):r for r in csv.DictReader((ROOT/'pipeline/output/jp-field-map.csv').open(encoding='utf-8-sig'))}
banks = {}
for bank,file in files.items():
    banks[bank] = {}
    for q in csv.DictReader((ROOT/'data'/f'{file}.csv').open(encoding='utf-8-sig')):
        audit = source[(bank,q['id'])]
        ch = list(map(int,audit['chapters'].split('+')))
        text = unicodedata.normalize('NFKC', q['title'] + ' ' + q['question'])
        found = [key for key,_,allowed,pattern in rules if set(ch)&set(allowed) and re.search(pattern,text)]
        banks[bank][q['id']] = {'topicIds':found or [f'chapter-{ch[0]}'], 'chapters':ch,
            'classificationSource':'keyword-rule-v1' if found else 'source-chapter-fallback',
            'sourceKind':'whr-course' if bank != 'jp-business-law' else 'existing-study-bank',
            'reference': '\n'.join(re.findall(r'【[^】]+】|[0-9０-９]+章[^\n]*',q['explanation']))}
ai = {}
for exam in [exam for file in ['ai-mocks-2026.json','ai-hard-mocks-2026.json'] for exam in json.loads((ROOT/'data'/file).read_text(encoding='utf-8'))['exams']]:
    for q in exam['questions']:
        chapter = int(q['chapter'][2:])
        text = q['title']+' '+q['question']
        found = [key for key,_,allowed,pattern in rules if chapter in allowed and re.search(pattern,text)]
        ai[q['id']] = {'topicIds':found or [f'chapter-{chapter}'],'chapters':[chapter],'sourceKind':'ai-original','classificationSource':'keyword-rule-v1'}
manifest = {'version':1,'note':'学習用の自動分類。主催者の出題頻度・配点ではありません。教材リンクは章単位です。','topics':topics,'books':books,'banks':banks,'ai':ai}
(ROOT/'data/study-topics.js').write_text('window.STUDY_TOPICS = '+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
print(json.dumps({'questions':sum(map(len,banks.values())),'keywordClassified':sum(bool(q['classificationSource']=='keyword-rule-v1') for b in banks.values() for q in b.values()),'topics':len(topics)}))
