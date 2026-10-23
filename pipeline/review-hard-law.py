"""Fetch dated official statute text for reproducible original-question review."""
import concurrent.futures
import json
import urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
TARGETS={
 'civil':('129AC0000000089',['541','542','543','562','563','564','566','166','150','152','466','467','468','469']),
 'patent':('334AC0000000121',['35','38','73']),
 'consumer':('412AC0000000061',['8','8_2','9','10']),
 'arbitration':('415AC0000000138',['13','14','15','44','45','46']),
 'companies':('417AC0000000086',['356','365','369','423','428']),
 'labor':('419AC0000000128',['9','10','16','19','20']),
}
def walk(n):
 if isinstance(n,dict):
  yield n
  for c in n.get('children',[]): yield from walk(c)
def text(n):
 return n if isinstance(n,str) else ''.join(text(c) for c in n.get('children',[]))
def fetch(item):
 name,(law,nums)=item
 url=f'https://laws.e-gov.go.jp/api/2/law_data/{law}?asof=2025-12-01'
 data=json.load(urllib.request.urlopen(url,timeout=60))
 main=next(n for n in walk(data['law_full_text']) if n['tag']=='MainProvision')
 articles={n['attr']['Num']:text(n) for n in walk(main) if n['tag']=='Article' and n['attr']['Num'] in nums}
 return name,{'url':url,'revision':data['revision_info']['law_revision_id'],'articles':articles}
out=dict(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(fetch,TARGETS.items()))
path=ROOT/'pipeline/output/hard-law-review.json'
path.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:{'revision':v['revision'],'articles':list(v['articles'])} for k,v in out.items()}))
