# 佛堂報到系統（Attendance System）概觀說明

> 本文件作為「佛堂報到系統」的高階說明，提供給開發者、維運人員，以及 AI 工具（如 ChatGPT、Cursor）共同參考，避免規格只存在於對話或口頭共識中。

---

## 1. 系統目的（Purpose）

佛堂報到系統用於管理佛堂蓮友（成員）的基本資料與出席紀錄，協助道場：

- 快速完成實體現場的報到流程（掃描、勾選即完成）
- 穩定記錄每位成員的出席歷史（含日期、場次、報到方式）
- 支援匯出、簡易統計與查詢，方便幹部整理名單與追蹤出席狀況
- 管理系統登入帳號與權限，避免一般蓮友直接操作系統

本系統以「穩定、好用」為優先，介面簡單清楚，主要使用對象為佛堂的幹部或值班人員，而非一般大眾。

---

## 2. 系統角色與使用情境

### 2.1 使用角色（User Roles）

目前預期至少有以下幾種角色（實際權限細節再於 users 權限文件中定義）：

- **系統管理員（Admin）**
  - 維護帳號與權限
  - 管理所有成員資料
  - 觀看與匯出所有出席紀錄

- **幹部 / 報到值班人員（Staff）**
  - 使用報到頁面幫成員報到（掃碼 / 手動）
  - 查詢成員出席紀錄
  - 基本新增 / 編輯成員資料（依權限設定）

- **只讀使用者（Viewer / Readonly）**
  - 僅可查詢資料與匯出報表，不能修改任何資料

> 注意：**members = 佛堂蓮友 / 成員資料**，  
> **users = 能登入系統的帳號**，兩者概念不同但可以關聯（例如：幹部可能同時也是 member）。

---

## 3. 主要模組與功能（Modules & Features）

### 3.1 成員管理（Members）

對應資料表：`members`

**目的：**維護佛堂蓮友的基本資訊，作為報到與出席紀錄的核心對象。

**核心欄位（實際 schema 以 DB 文件為準）：**

- `id`（PK，自動編號）
- 姓名、法名 / 稱呼
- 性別
- 出生日（可選）
- 聯絡電話、地址
- 所屬組別（`group` / 小組 / 區域）
- 狀態 `status`：
  - `active`：正常使用中
  - `hidden`：隱藏（不在一般列表顯示，但保留歷史）
  - `leave`：離開、不常來，但仍保留紀錄
  - `deceased`：已往生，保留歷史紀錄
- 建立 / 更新時間：`created_at`, `updated_at`

**主要功能：**

- 成員列表：
  - 搜尋（姓名、電話、關鍵字…）
  - 篩選（有無組別、加入日期區間、狀態）
  - 排序（加入時間、姓名…）
- 單筆成員檢視：
  - 基本資料
  - 與出席紀錄（最近一次報到、累計報到次數）
- 成員 CRUD：
  - 新增 / 編輯 / 刪除（實務上建議使用「狀態調整」而非硬刪）
- 成員狀態變更：
  - `active ⇄ hidden / leave / deceased` 等

---

### 3.2 報到與出席紀錄（Attendances / Check-in）

對應資料表：`attendances`（名稱以 DB 實際為準）

**目的：**記錄每一位成員在每一次活動 / 法會 / 共修中的出席狀況。

**核心欄位（示意）：**

- `id`（PK）
- `member_id`（FK → `members.id`）
- `checked_in_at`（報到時間）
- `session_date` 或 `event_id`（可選，看實際設計）
- 報到方式（例如：QR 掃描 / 手動輸入）
- 建立 / 更新時間

**主要功能：**

- **報到操作：**
  - 透過掃描 QR Code 或搜尋姓名 / 電話，完成單筆報到
  - 同一成員在同一天 / 同一場次的重複報到，需要防呆（判斷是否重複）

- **出席紀錄查詢：**
  - 依成員查詢：顯示該成員所有出席紀錄
  - 依日期 / 場次查詢：某天出席名單、出席人數等
  - 成員列表上顯示：
    - 最近報到時間（`MAX(checked_in_at)`）
    - 報到次數（該成員在 `attendances` 中出現的次數）

> 注意：**出席紀錄應保留完整歷史，不做硬刪除**，若需修正以更正紀錄方式處理。

---

### 3.3 QR 報到（QR Check-in）

**目的：**讓成員透過 QR Code 快速完成報到，減輕人工尋找成員的負擔。

**基本流程（簡化概念）：**

1. 每位成員對應一組唯一識別碼（例如：`member_id` 或 `member_code`）。
2. 系統可以產生每位成員的「個人 QR Code」，供列印或存於手機。
3. 報到頁面提供掃描功能：
   - 讀取 QR → 取得 `member_id` → 寫入 `attendances` 一筆紀錄。
4. 報到成功後顯示提示（姓名＋成功訊息＋最近幾次報到摘要）。

> QR 的編碼格式與安全性（是否需要加密 / Token）可以在之後的「QR 設計文件」中細化。

---

### 3.4 匯出與列印（Export / Print）

**目的：**方便佛堂幹部將出席資訊做後續整理，如：報表、關懷名單。

**預期功能：**

- 依日期 / 場次匯出出席名單（Excel / CSV）
- 依成員列表匯出（包含基本資料＋出席統計欄位）
- 可選擇欄位（例如：是否包含電話、地址等敏感資訊）
- 日後可擴充：匯出「累計出席統計（例如一年內出席次數）」報表

---

### 3.5 帳號與權限管理（Users & Roles）

對應資料表：`users`、`roles`（名稱依實作為準）

**目的：**區分一般成員資料與「可以登入系統的人」，確保只有合適的幹部可以操作系統。

**示意欄位（users）：**

- `id`（PK）
- `username`（登入帳號，需唯一）
- `password_hash`
- `role`（admin / staff / viewer…）
- `status`（active / disabled）
- `created_at`, `updated_at`

**相關機制：**

- JWT 驗證中介層（middleware `verifyJWT`）保護後端 API
- 之後可依 `role` 做 API 授權控管

---

### 3.6 系統設定與其他

視需求可擴充的功能：

- 基本系統設定（e.g. 報到場次名稱、時間區間）
- 日誌 / 操作紀錄（Log / Audit Trail）
- 與 n8n 或其他服務整合（自動寄信、定期報表）

---

## 4. 技術架構（Technical Architecture）

### 4.1 前端（Frontend）

- Framework：**Vue 3**
- Routing：Vue Router
- 狀態管理：可使用 Pinia / 統一自訂 store（依實際專案狀況）
- UI：
  - 成員列表頁
  - 新增 / 編輯成員頁
  - 報到頁（含掃描元件）
  - 出席紀錄查詢頁
  - 登入頁、帳號管理頁等

### 4.2 後端（Backend）

- Runtime：Node.js
- Framework：Express
- 主要路由模組（示意）：
  - `/api/members`：成員管理
  - `/api/attendances`：報到與出席紀錄
  - `/api/users`：登入帳號與權限
  - `/api/auth`：登入 / refresh token 等（如有）

- 中介層（middlewares）：
  - `verifyJWT`：驗證使用者登入狀態
  - 統一錯誤處理與 log（可視需要擴充）

### 4.3 資料庫（Database）

- DB：Microsoft SQL Server
- 主要資料表（依 DB schema 文件為準）：
  - `members`：成員資料
  - `attendances`：出席紀錄
  - `users`：系統帳號
  - 其他：如 `groups`、`events` 等（若有）

- 時間戳記欄位慣例：
  - `created_at`：建立時間
  - `updated_at`：最後更新時間

> 詳細欄位與關聯請參考 `docs/db-schema.md` 或專用的 DB 文件。

---

## 5. API 設計與命名原則（High-level）

詳細會拆分至 `docs/apis/*.md`，此處只列出原則：

- RESTful 風格，統一加上 `/api/` 前綴，例如：
  - `GET /api/members`
  - `POST /api/members`
  - `GET /api/members/:id`
  - `GET /api/members/:id/attendances`（成員的出席紀錄）
- 使用標準 HTTP 狀態碼：
  - 200 / 201：成功
  - 400：參數錯誤
  - 401：未登入 / token 失效
  - 403：沒有權限
  - 404：找不到資料
  - 500：伺服器錯誤

- 回傳格式統一為 JSON，建議格式：

```json
{
  "success": true,
  "data": {...},
  "message": "optional"
}

- 發生錯誤時：
{
  "success": false,
  "error": {
    "code": "MEMBER_NOT_FOUND",
    "message": "User not found"
  }
}

---

## 6. 非功能性需求（Non-functional Requirements）

- 語系與地區設定
  - 主要使用者為台灣佛堂幹部，介面語言為繁體中文
  - 時區：Asia/Taipei
- 穩定性與資料安全
  - 出席紀錄與成員資料不可隨意刪除，盡量採用「狀態欄位」或「軟刪除」方式
  - 未來佈署到正式環境時需區分：
    - 開發環境（Dev）
    - 測試 / 試跑環境（Staging）
    - 正式環境（Prod）
- 權限與隱私
    - 一般蓮友不直接使用本系統（僅由幹部操作）
    - 匯出報表時注意隱私欄位（電話、地址）是否需要全部顯示

## 7. 文件結構與維護建議

為讓 AI 工具與開發者共享同一套規格，建議在 docs/ 底下維護以下文件：
- docs/attendance-system-overview.md（本文件，高階概觀）
- docs/db-schema.md（資料表與欄位詳細說明）
- docs/apis/members.md（成員 API 規格）
- docs/apis/attendances.md（報到 / 出席 API 規格）
- docs/apis/users.md（帳號 / 權限 API 規格）
- docs/roadmap.md（P0 / P1 任務與里程碑）

每次與 ChatGPT 或其他 AI 工具討論完新功能後，請將「最後共識版」的規格整理回這些文件，並 commit 至 repo，作為後續開發與 AI agent 的共同參考來源。