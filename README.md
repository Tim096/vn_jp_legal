# ビジネス実務法務検定 2級 学習サイト

純靜態學習網站。題庫從 repository 內的 CSV 載入，學習進度保存在使用者裝置的 `localStorage`。

主要功能：

- 每日 10 題新題，加上到期複習與前日苦手題
- 保存逐次答題歷史、累積正確率、熟練題數與章節診斷
- 40 題、90 分鐘模擬考；70 分為練習合格線，依過去 9 回分野別頻出代理分布抽題並優先事例／組合題
- 題目來源層級、法令基準日與問題回報
- 匯出／匯入完整學習紀錄
- 不計分的背景私語、每日完成與正答里程碑彩蛋

## 本機預覽

在專案目錄啟動任一靜態 HTTP server，例如：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。不可直接雙擊 `index.html`，瀏覽器會阻擋 CSV `fetch()`。

## 更新題庫

從兩個指定來源機械抽取全部題目：

```powershell
node pipeline/extract-source.mjs
```

輸出：

- `pipeline/output/shikakumondai.json`：16 章、466 題
- `pipeline/output/shikaku-dojo.json`：300 題，依題號與主題映射至正式章節
- `pipeline/output/duplicates.json`：正規化去重紀錄
- `pipeline/output/all.json` 與網站使用的 `data/questions.csv`

只轉換來源頁面已有的題目、答案、解說與條文，不補寫法律內容。完整題幹與第一來源的個別陳述都會參與跨來源去重。

第一來源標記的法令基準日為 `2025-12-01`。第二來源未提供可驗證的法令基準日，因此輸出為 `unknown`，網站會顯示「未確認」。

回報按鈕使用手機原生分享；可直接用 LINE 或訊息傳送題號。桌面瀏覽器若沒有分享功能，會複製題號與題目。

使用 `?refresh=1` 可略過 24 小時題庫快取並強制重抓。

## 驗證題庫結構

```powershell
node pipeline/validate.mjs pipeline/output/all.json
```

Validator 檢查 schema、答案索引、重複題號、條文格式、`law_as_of` 與 `source_tier`。它不取代逐題法律審核。

驗證每日任務、熟練判定、模擬考規格與 HTML element 對應：

```powershell
node pipeline/smoke-app.mjs
```
