# 前端頁面與後端 API 對照表

> 本文件用來對應「前端頁面（Vue Router routes）」與「後端 API endpoints」，  
> 讓開發者與 AI 工具（例如：Cursor、ChatGPT）能快速理解：  
> 「某一個畫面會呼叫哪些 API、有哪些資料流動」。

---

## 1. 命名與約定

- 前端 route path 以 `/` 開頭，例如：`/members`、`/check-in`。
- Vue component 名稱以目前實際檔名為準（以下為建議命名，可依專案調整）。
- API 統一以 `/api/` 為前綴，例如：`GET /api/members`。
- 表格中出現的 API，實際欄位與 query 參數以對應的 `docs/apis/*.md` 為準。

---

## 2. 對照表

### 2.1 認證 / 帳號相關

| 前端頁面名稱 | Route Path | Vue Component（建議） | 功能說明 | 使用後端 API（Method + Path） | 備註 |
| ------------ | ---------- | --------------------- | -------- | ----------------------------- | ---- |
| 登入頁       | `/login`   | `views/auth/LoginView.vue` | 使用者輸入帳號密碼登入，取得 JWT token | `POST /api/auth/login`：送出帳號密碼，取得 JWT<br>`GET /api/auth/me`（可選）：取得目前登入者資訊 | 登入成功後通常會導向 `/members` 或 `/dashboard` |
| 帳號管理列表 | `/users`   | `views/users/UserListView.vue` | 管理系統使用者帳號（Admin 權限） | `GET /api/users`：取得使用者列表 | 僅 admin 可見 |
| 新增使用者   | `/users/new` | `views/users/UserFormView.vue` | 建立新登入帳號 | `POST /api/users` | 可同一 component handling 新增/編輯 |
| 編輯使用者   | `/users/:id/edit` | `views/users/UserFormView.vue` | 編輯既有登入帳號 | `GET /api/users/:id`：取得單一使用者<br>`PUT /api/users/:id`：更新使用者資料<br>`PATCH /api/users/:id/status`（如有）：啟用/停用帳號 | 實際 status route 依後端實作 |

---

### 2.2 成員管理（Members）

| 前端頁面名稱 | Route Path | Vue Component（建議） | 功能說明 | 使用後端 API（Method + Path） | 備註 |
| ------------ | ---------- | --------------------- | -------- | ----------------------------- | ---- |
| 成員列表頁   | `/members` | `views/members/MemberListView.vue` | 顯示成員列表，支援搜尋、篩選、排序、分頁 | `GET /api/members?keyword=&status=&hasGroup=&joinDateStart=&joinDateEnd=&page=&pageSize=` | 也可以在列表中顯示「最近報到時間」與「報到次數」（後端可 join attendances） |
| 新增成員頁   | `/members/new` | `views/members/MemberFormView.vue` | 建立新成員資料 | `POST /api/members` | 新增成功後導回 `/members` 或成員詳情頁 |
| 編輯成員頁   | `/members/:id/edit` | `views/members/MemberFormView.vue` | 編輯成員基本資料與狀態 | `GET /api/members/:id`：取得成員資料<br>`PUT /api/members/:id`：更新成員資料<br>`PATCH /api/members/:id/status`：更新成員狀態（active/hidden/leave/deceased） | 前端可根據 status 顯示不同提示 |
| 成員詳情頁   | `/members/:id` | `views/members/MemberDetailView.vue` | 顯示成員詳細資料＋其出席紀錄摘要 | `GET /api/members/:id`：基本資料<br>`GET /api/members/:id/attendances` *或* `GET /api/attendances?memberId=:id`：該成員出席紀錄 | 實際採哪種 URL 依後端 API 設計為準 |
| 成員匯出頁（可選） | `/members/export` | `views/members/MemberExportView.vue` | 匯出成員列表（Excel/CSV） | `GET /api/members/export?...` | 可帶篩選條件一併匯出 |

---

### 2.3 報到 / 出席紀錄（Attendances / Check-in）

| 前端頁面名稱 | Route Path | Vue Component（建議） | 功能說明 | 使用後端 API（Method + Path） | 備註 |
| ------------ | ---------- | --------------------- | -------- | ----------------------------- | ---- |
| 報到頁（掃描模式） | `/check-in` | `views/attendances/CheckInView.vue` | 透過 QR Code 或搜尋姓名進行報到 | `POST /api/attendances`：建立一筆新的出席紀錄（body 可含 `memberId` 或 `memberCode`、`source` 等欄位）<br>`GET /api/members/:id`（可選）：掃到後顯示成員資訊 | 也可在報到成功後呼叫 `GET /api/attendances?memberId=:id&limit=3` 顯示最近幾次出席 |
| 今日出席名單頁 | `/attendances/today` | `views/attendances/TodayAttendanceView.vue` | 顯示今日報到的成員名單與人數 | `GET /api/attendances?date=YYYY-MM-DD` *或* `GET /api/attendances/by-date?date=...` | 日期可以由前端選擇或預設今天 |
| 出席紀錄查詢頁 | `/attendances/search` | `views/attendances/AttendanceSearchView.vue` | 依日期範圍、成員等條件查詢出席紀錄 | `GET /api/attendances?memberId=&dateStart=&dateEnd=&group=&...` | 主要給幹部做歷史查詢用 |
| 出席紀錄匯出頁 | `/attendances/export` | `views/attendances/AttendanceExportView.vue` | 匯出某日 / 某段期間的出席名單或統計表 | `GET /api/attendances/export?dateStart=&dateEnd=&group=&...` | 後端回傳檔案下載（Content-Type: application/vnd.*） |

---

### 2.4 儀表板 / 報表（可選）

| 前端頁面名稱 | Route Path | Vue Component（建議） | 功能說明 | 使用後端 API（Method + Path） | 備註 |
| ------------ | ---------- | --------------------- | -------- | ----------------------------- | ---- |
| 系統儀表板   | `/dashboard` | `views/dashboard/DashboardView.vue` | 顯示近期出席統計，例如最近 7 日出席趨勢、各組別出席人數 | `GET /api/attendances/stats?range=7d`：近期出席統計<br>`GET /api/attendances/stats/by-group?date=...`：依組別分布 | 具體 stats API 可在報表需求明確後再定義 |
| 報表列表頁   | `/reports` | `views/reports/ReportListView.vue` | 集中入口：連到各種匯出/統計報表 | 依實際需求使用 `attendances` / `members` 的匯出與統計 API | 類似「報表選單」 |

---

## 3. 擴充建議

- 若未來新增更多模組（例如：活動管理 `events`、小組管理 `groups`），可在本檔新增對應區塊與表格列。
- 每次新增新頁面或 API 時，請同步更新本文件，保持「前端頁面 ↔ 後端 API」的對應關係，使：
  - 前端開發者能快速知道要串哪些 API。
  - 後端開發者或 AI 能理解某個 API 會影響哪些頁面。
  - 測試人員能以此為基準撰寫測試案例。

---

## 4. 文件放置位置建議

- **後端 repo**：`docs/frontend-backend-mapping.md`（作為「權威版」）
- **前端 repo**：`docs/frontend-backend-mapping.md`（可複製同一內容，或簡短描述＋連結到後端 repo 的版本）

> 若前後端分別使用不同 AI 工具（例如：在前端專案用 Cursor、在後端專案用另一套 agent），  
> 則建議 **兩邊都保留一份同步的副本**，以便 AI 能在各自的 repo 中讀到完整對照表。  
> 更新規格時，請記得一併更新兩份文件，或考慮以腳本自動同步。
