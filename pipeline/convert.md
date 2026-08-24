# 問題データ変換 Prompt

以下は日本の資格試験の問題ページのテキストです。
各問題を JSON 配列に変換してください。

## 厳守事項

- 原文にない情報は絶対に補完しない。不明な項目は `null` にする
- 解説は原文の要約のみ。新たな法的説明を加えない
- 条文番号は原文に明記されているものだけを `law_refs` に入れる
- 判断に迷った問題は `needs_review: true` を立て、`reason` に理由を書く
- 一回につき 10〜15 問だけ処理する

## 出力スキーマ

```json
{
  "id": "ch09-0012",
  "chapter": "ch09",
  "title": "原文の短い見出し、なければ null",
  "question": "原文の問題文",
  "options": ["選択肢1", "選択肢2"],
  "answer": [1],
  "explanation": "原文の解説、なければ null",
  "law_refs": ["民法370条"],
  "tags": [],
  "needs_review": false,
  "reason": null,
  "law_as_of": "unknown",
  "source_tier": "supplemental-secondary"
}
```

出力は JSON 配列のみ。説明文は不要。
