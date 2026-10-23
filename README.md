# ビジネス実務法務検定 2級 学習サイト

GitHub Pages 學習網站。題庫從 repository 內的 CSV 載入；未設定 Supabase 時，學習進度保存在使用者裝置；設定後會保留本機備援並同步至雲端。

主要功能：

- 每日 10 題新題，加上到期複習與前日苦手題
- `わからない`、`あいまい`、`わかる` 三本自評筆記本，重新評分時自動移動分類
- 保存逐次答題歷史、累積正確率、熟練題數與章節診斷
- 40 題、90 分鐘模擬考；70 分為練習合格線，依過去 9 回分野別頻出代理分布抽題並優先事例／組合題
- 題目來源層級、法令基準日與問題回報
- 匯出／匯入完整學習紀錄
- 帳號登入、雲端還原、離線補同步、使用 heartbeat 與即時管理頁
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

## 使用者提供教材：IBT・CBT 模擬問題

網站題庫「IBT・CBT 模擬問題」將提供的試題／解答 1、2、3 合併為同一個 120 題池，不分卷或章節。預設隨機模式，同一輪已提交答案的題目不再自動出現，答錯也算做過；只選答案、未提交不算。全池做完後才開始下一輪，重新整理、切換題庫或雲端備份都保留未完成的一輪。原有 80 題的 ID、內容、答案與內部題庫 key `jp-ibt-cbt-2` 保留，學習紀錄沿用；新題加入當前未完成的一輪，與剩餘舊題一起打亂。

中文題意與解說是 AI 依教材整理的摘要，另行標示；日文原文保留。題目、選項及原解說的 ○／× 已核對 120／120，現行法規尚未逐條審核，法令基準日標記為未確認。14 題要求選兩個，必須完全符合答案組合才得分。模考從同一輪未完成題目抽最多 40 題，若剩不到 40 題就只出剩餘題，不補已做題；提交模考後，已作答題目從本輪移除，未作答題目繼續保留。90 分鐘／70 分為本站練習設定。手動切換「全部」或複習模式仍可查看舊題。

來源文字 packet 保存在 `pipeline/raw/ibt-cbt-{1,2,3}/source.json`，記錄六份 Word 的 SHA-256，並還原 Word 自動編號。2026-10-05 核對發現：解答 2 第 8 題的イ解說少一個左括號，原文保留；問題 3 第 32 題末兩個自動選項編號錯為⑥、⑦，網站依八個選項的順序顯示⑦、⑧，原編號保存在 `source_options`。2026-10-17 提供的問答 1 已補齊 40 題；問題 1 第 21 題②「契契約」多一字，解答 1 第 6 題①「消費者約法」漏「契」，原文保留；解答 1 第 40 題後混入的證據調查及言詞辯論教材，已與本題解說分開，全文保存在來源 packet 及輸出的 `excluded_source_explanation`。第 36 題完整保留連續畫線文章，另設四個選項按鈕。內部 CSV／輸出檔名保留原有 `ibt-cbt-2`，內容為合併的 120 題。

跨裝置使用同一帳號並連線同步：IBT 題庫按題目合併進度，同一輪合併兩邊已提交的題目，不依整份紀錄的時間戳覆蓋。第一輪亦以已答紀錄修復錯誤的剩餘清單，恢復模考時排除已完成題目。`study-api` 儲存時以條件更新及重試避免兩台裝置同時寫入互相覆蓋；同步中新增的答案繼續排隊，刷新／離開時另送有大小限制的 keepalive 進度。回到頁面及每 30 秒重新取得雲端進度；離線裝置的作答須恢復連線後，其他裝置才會得知。背景同步比較內容時忽略 JSON 物件欄位順序及同步時間；其他題目進度變更時保留目前題卡、已選答案及展開內容，避免閱讀長題時被重新渲染捲回頂部。手動清空紀錄有重設標記，避免被舊裝置復活。發布這項修正需同時更新 GitHub Pages 與 Supabase `study-api`，無資料庫 schema 變更。重建與檢查：

```powershell
python pipeline/extract-ibt-cbt.py C:/Users/Administrator/Downloads
python pipeline/import-ibt-cbt-2.py
node pipeline/validate.mjs pipeline/output/ibt-cbt-2/questions.json
node pipeline/smoke-ibt-cbt-2.mjs
node pipeline/smoke-random-sync.mjs
node pipeline/smoke-cloud-sync.mjs
```

## 2026 官方通信講座補充教材

三個獨立題庫：`jp-ibt-cbt-4`（40 題）、`jp-whr-field-2026`（17 單元／72 題）、`jp-whr-qa-2026`（6 單元／120 題）。既有 `jp-ibt-cbt-2` 的 120 題及 storage key 保留。新增題庫預設隨機不重複，沿用複習與模考功能；模考的 90 分鐘／70 分仍是本站練習設定。題目 ID 使用課程單元與題號，不使用受驗紀錄 ID。

來源、去重與底線核對見 [來源說明](pipeline/raw/whr-2026/README.md)。日文題幹、選項、正解、原解說及原有章節參照保留；232 題另有標示為 AI 整理的繁體中文摘要，未重新審查現行法。分野別／一問一答的正解來自結果頁的 `f-correct` 標記，與當次使用者選項無關。

`materials.html` 依單位及章節列出 **29／29 份原 PDF**：教材 27 分冊共 1,468 頁，模擬題 4 題本 27 頁、解答 12 頁，合計 1,507 頁。原檔透過已登入的 PDF 閱覽器，以瀏覽器原生 `Ctrl+S` 下載並保留完整 bytes，沒有重建或列印轉檔。網站使用本機附帶的 PDF.js 閱讀，支援翻頁、指定頁碼、放大及本頁文字；另保留開啟 PDF 與原檔下載。離線閱讀應先下載原檔。

本機預覽（僅預覽伺服器停用 cloud，不改正式設定）：

```powershell
python -X utf8 pipeline/preview-whr-2026.py
# http://127.0.0.1:8770/?bank=jp-ibt-cbt-4
```

新增或替換原檔時，先逐份核對封面、章節及頁數，再按 manifest 的固定 id 登錄（需 Python 的 pypdf）：

```powershell
python -X utf8 pipeline/register-whr-pdf.py mock4-question C:/path/to/original-question.pdf
python -X utf8 pipeline/register-whr-pdf.py mock4-answer C:/path/to/original-answer.pdf
# 27 份教材分別使用 textbook-<unit_id>，詳見 data/whr-2026-materials.json
python -X utf8 pipeline/import-whr-2026.py
python -X utf8 pipeline/audit-whr-pdfs.py
node pipeline/smoke-whr-2026.mjs
node pipeline/validate.mjs pipeline/output/whr-2026/field.json pipeline/output/whr-2026/qa.json pipeline/output/whr-2026/mock4.json
node pipeline/smoke-random-sync.mjs jp-ibt-cbt-4
node pipeline/smoke-random-sync.mjs jp-whr-field-2026
node pipeline/smoke-random-sync.mjs jp-whr-qa-2026
node pipeline/check-whr-2026.mjs
```

`register-whr-pdf.py` 保留檔案原始 bytes，驗證 PDF 格式及 mock4 頁數，記錄 SHA-256；不接受以網頁登入畫面冒充 PDF，也不覆寫不同原檔。`audit-whr-pdfs.py` 檢查 29 份原檔的 hash、原站頁數、章節與所有頁面文字，並逐頁比對模擬題 4 的 38 頁題目／解說文字（題本另含封面）。`check-whr-2026.mjs` 在缺任何原檔、摘要或來源核對時回傳非零。目前一般 validator 的少題章節與解說長短警告已對照來源確認，不代表缺題。

前端與 Supabase 共用的進度合併已擴至三個新題庫。發布時須一併部署 `study-api`，無 schema 變更；本機兩裝置測試使用實際同步函式搭配模擬資料庫，不代表已完成正式帳號跨裝置驗收。驗證結果見 `pipeline/output/whr-2026/verification.json` 與 `pdf-verification.json`。

## Supabase 雲端同步

女友端不使用 Email。管理頁先建立帳號，她在學習網站輸入帳號後即可載入對應紀錄。登入 token 只儲存在她的瀏覽器，Supabase 只保存 SHA-256 hash。帳號本身等同登入憑證，知道帳號的人即可存取該學習紀錄。

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

部署網站後開啟 `admin.html`，用 `ADMIN_EMAIL` 指定的 Email 與 Supabase Auth 密碼登入。密碼只由 Supabase Auth 儲存及驗證，不寫進網站程式；錯誤帳密不會建立新帳號。既有登入狀態可沿用，後端仍核對管理員 Email；不再寄送 Magic Link，也不會受驗證信寄送額度影響。管理頁可以新增或修改學習帳號、刪除使用者，並查看在線狀態、今日題數、累積回答、正確率、模擬考、最近活動與每位使用者最近 30 天的每日使用明細。

不要把 `service_role` key、personal access token 或其他 secret 寫入 repository。Free Plan 沒有自動備份，仍保留定期「データを書き出す」。

### 六大分野弱點診斷

日本題庫的「進捗」提供六軸雷達圖、分野正確率、正解／作答題數、作答覆蓋率與優先複習分野。可選全部日本題庫或目前題庫；不包含台灣司律。既有 766 題與模擬題 1～4、分野別演習、一問一答合計 1,118 題都有固定 ID 分類。

- 使用每題最新一次有效回答，等權計算；反覆回答及自評不重複計數。這是練習正確率，不是正式考試的配分得分率，也不預測通過率。
- 未回答為資料不足，雷達圖不補零；不足 5 題為參考值，不參與優先複習排序。優先顯示正確率最低的兩個分野。
- 題庫原章節與一問一答解說參照直接對應六分野；模擬題依主題人工分類，不聲稱為出題方逐題官方分類。題庫間的類似題各算一題。AI 原創及無分類 ID 不納入。
- 從現有本機／雲端同步回來的紀錄即時計算，不另存診斷值，不清除進度。無法區分未回答與答錯的舊模考紀錄排除並顯示數量。新紀錄附帶 `answered`，明確區分兩者。
- 分類來源見 `pipeline/output/jp-field-map.csv`。更新題庫後執行 `python pipeline/build-jp-field-map.py`，再執行 `node pipeline/smoke-weakness.mjs`。後者建立明確標示為測試資料的 `.workflow/weakness/preview.html`，不寫入學習紀錄。

### 備考首頁與診斷分流（第一版）

- 首頁提供復習、弱點、診斷、教材入口；題庫來源收合，六大分野可直接篩選目前題庫。分野選擇保存在既有 study-view 中，進度與題目 ID 不變。
- 雷達圖明細的「練習」會選擇該分野苦手題最多的題庫，並只練該題庫該分野的苦手題。畫面會標示所選題庫，不把其他題庫的作答寫入錯誤的儲存區。
- 練習模試沿用原有抽題；實力診斷使用 `kind: diagnostic`，獨立顯示成績。每份 40 題、90 分鐘，各分野至少 4 題；只使用目前題庫未作答、4 個以上選項、可判分的題目。不足不補熟題，不把未答題寫成練習錯題。診斷可重整恢復原卷。
- 診斷優先挑選複選、組合、底線及案例題。`study-coach.js` 的複雜度是題型代理，不是經實測的難度，不能宣稱與正式考試同難。配題比例是練習用分配，不是官方配分；未作答也不等於從未看過。
- 診斷分流本身不生成題目；AI 發展演習另列為練習，不混入未作答診斷。
- 驗證：`node pipeline/smoke-study-coach.mjs`。本機預覽使用 `pipeline/preview-whr-2026.py`，停用雲端連線；正式學習帳號資料不受預覽測試影響。

### 考試分類、知識點與發展演習（第二、三版整合）

- 頂層分「日本法務考試」「台灣律師考試」。日本底下分既有「日本ビジネス法務」與「WHR 通信講座」。WHR 的模擬題 1～4 放在同一系列，另列分野別、一問一答及官方教材。來源連結依使用者指定的 WHR 講座網址。1～3 與 4 沿用既有儲存區，不遷移 ID 或紀錄。
- `data/study-topics.js` 由 `python pipeline/build-study-topics.py` 生成。1,118 題都有章節依據；835 題符合 35 個知識點規則，283 題僅保留章節、標示分類未確定。分類依題幹關鍵字，可多標籤，並非逐題人工驗證或官方頻率。另有 17 個章節回退分類。舊紀錄隨同步即時計算最新答題率，不回填猜測的錯因。教材只連到對應章分冊，不聲稱逐頁精確對應。
- 每次答案揭示後可自填知識不足、例外混淆、閱讀、案例應用、猜測／時間不足。`errorReason` 是原進度及該次 history 的選填欄位，沿用現有同步；再次自評不新增作答次數。知識點頁彙總最新錯因並提供教材連結。
- 個人化練習最多 10 題，以到期 4 題、弱題 4 題、未答 2 題為目標，不足由其他類補足。排除當天已答題，按弱知識點排序，同組優先複合題。這是可解釋的規則，不宣稱為統計校準的能力估計。
- 新增 `data/ai-hard-mocks-2026.json` 的 12 題 AI 發展題，六分野各 2 題，包含多條件案例及 5 題複選。逐選項以 e-Gov `asof=2025-12-01` 條文核對；取得的法令修訂 ID、條文快照在 `pipeline/output/hard-law-review.json`，可由 `python pipeline/review-hard-law.py` 重現。核對者為 agent，未經人類法律專家審題，難度尚無實測校準。
- AI 演習中心整合原有 24 題及發展 12 題，可選全部 36 題、原有題、發展題、AI 苦手、到期複習或三種自評筆記。題目 ID、成績及同步格式保留；同一題在模考與單題練習共用紀錄。全部 36 題加入知識點分類與教材連結；本次條文核對範圍為新增 12 題。
- AI 中心提供原有三份模考及新增發展模考。發展模考採 12 題新作＋28 題既有題，既有題按弱點與複雜度選取、各分野至少 4 題。全部新作保留，不會在補題後被裁掉。AI 錯題也會影響同知識點的個人化選題；AI 題數另外顯示，不併入原題六分野雷達的分母。新 AI 模考未回答的題目只影響該次試卷分數，不寫成練習錯題。舊模考無法確認是否作答的錯題紀錄仍保留，但不當作已確認弱點。
- 檢查涵蓋題目／教材 ID、複選的完整集合判分、個人練習不重複、試卷恢復、錯因自評替換及同步。原 CSV、既有 AI 24 題與後端不修改。
