# ビジネス実務法務検定 2級 学習サイト

純靜態學習網站。題庫由 Google Sheets 發布的 CSV 載入，學習進度保存在使用者裝置的 `localStorage`。

## 本機預覽

在專案目錄啟動任一靜態 HTTP server，例如：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。不可直接雙擊 `index.html`，瀏覽器會阻擋 CSV `fetch()`。

## 串接 Google Sheets 與 Form

最快做法：在 Google Apps Script 新專案貼上 `google/setup.gs`，執行 `setupBijihou2()`。授權後，執行記錄會輸出完整設定值。

1. 把輸出的 `questionsCsvUrl`、`chaptersCsvUrl`、`feedbackFormBaseUrl`、`feedbackQuestionEntry` 複製到 `config.js`。
2. Google Form 的 `question_id` 會預填，但 Google Forms 不支援真正的隱藏欄位。
3. 題庫 Sheet 會設為「知道連結的人可檢視」，否則網站無法直接讀取 CSV。

使用 `?refresh=1` 可略過 24 小時 CSV 快取並強制重抓。

## 驗證 AI 轉換結果

```powershell
node pipeline/validate.mjs pipeline/output/ch09.json
```

驗證成功後，才把 JSON 欄位轉入 Sheets。`data/questions.csv` 目前只有介面動作確認資料，不是正式法律題庫。
