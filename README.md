# ビジネス実務法務検定 2級 学習サイト

GitHub Pages 學習網站。題庫從 repository 內的 CSV 載入；未設定 Supabase 時，學習進度保存在使用者裝置；設定後會保留本機備援並同步至雲端。

主要功能：

- 每日 10 題新題，加上到期複習與前日苦手題
- `わからない`、`あいまい`、`わかる` 三本自評筆記本，重新評分時自動移動分類
- 保存逐次答題歷史、累積正確率、熟練題數與章節診斷
- 40 題、90 分鐘模擬考；70 分為練習合格線，依過去 9 回分野別頻出代理分布抽題並優先事例／組合題
- 題目來源層級、法令基準日與問題回報
- 匯出／匯入完整學習紀錄
- 私人配對連結、雲端還原、使用 heartbeat 與即時管理頁
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
node pipeline/smoke-cloud-sync.mjs
```

## Supabase 雲端同步

女友端不使用 Email。管理頁建立私人配對連結後，她開啟連結並輸入名稱即可。配對 token 只儲存在她的瀏覽器，Supabase 只保存 SHA-256 hash。

1. 建立 Supabase project，記下 Project URL 與 publishable key。
2. 登入並連結 CLI：

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
```

3. 建立資料表、RLS、Realtime publication 並部署 Edge Function：

```powershell
npx supabase@latest db push
npx supabase@latest functions deploy study-api --no-verify-jwt
npx supabase@latest secrets set ADMIN_EMAIL=you@example.com SITE_URL=https://tim096.github.io/vn_jp_legal 'ALLOWED_ORIGINS=https://tim096.github.io,http://localhost:8000'
```

4. 在 Supabase Authentication 的 URL Configuration 設定：

```text
Site URL: https://tim096.github.io/vn_jp_legal/admin.html
Redirect URL: https://tim096.github.io/vn_jp_legal/admin.html
```

5. 將 Project URL 與 publishable key 寫入 `config.js`：

```js
supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
supabasePublishableKey: "sb_publishable_..."
```

部署網站後開啟 `admin.html`，用 `ADMIN_EMAIL` 指定的 Email 收取 Magic Link。管理頁可以產生配對連結、刪除使用者，並查看在線狀態、今日題數、累積回答、正確率、模擬考、最近活動與每位使用者最近 30 天的每日使用明細。

不要把 `service_role` key、personal access token 或其他 secret 寫入 repository。Free Plan 沒有自動備份，仍保留定期「データを書き出す」。
