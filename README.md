# ビジネス実務法務検定 2級 学習サイト

純靜態學習網站。題庫從 repository 內的 CSV 載入，學習進度保存在使用者裝置的 `localStorage`。

## 本機預覽

在專案目錄啟動任一靜態 HTTP server，例如：

```powershell
python -m http.server 8000
```

再開啟 `http://localhost:8000/`。不可直接雙擊 `index.html`，瀏覽器會阻擋 CSV `fetch()`。

## 更新題庫

從指定來源機械抽取第 4 章：

```powershell
node pipeline/extract-source.mjs
```

輸出 `pipeline/output/ch04.json` 與網站使用的 `data/questions.csv`。只轉換來源頁面已有的題目、答案、解說與條文，不補寫法律內容。

回報按鈕使用手機原生分享；可直接用 LINE 或訊息傳送題號。桌面瀏覽器若沒有分享功能，會複製題號與題目。

使用 `?refresh=1` 可略過 24 小時題庫快取並強制重抓。

## 驗證 AI 轉換結果

```powershell
node pipeline/validate.mjs pipeline/output/ch04.json
```

正式題庫必須在驗證成功後才進入 `data/questions.csv`。
