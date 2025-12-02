# 佛堂報到系統架構說明

## 1. 目前資料表與關聯

### 1.1 主要資料表

#### `members` 成員資料表
- **用途**: 儲存佛堂蓮友的基本資訊
- **核心欄位**:
  - `id` (PK, int): 自動編號
  - `name` (varchar): 姓名
  - `dharma_name` (varchar): 法名/稱呼
  - `gender` (char): 性別
  - `phone` (varchar): 聯絡電話
  - `telephone` (char): 電話
  - `birthday` (date): 出生日期
  - `address` (varchar): 地址
  - `status` (varchar): 狀態 (active/hidden/leave/deceased)
  - `group` (varchar): 所屬組別
  - `role` (varchar): 角色
  - `remark` (varchar): 備註
  - `barcode` (varchar): 條碼識別碼 (用於 QR 報到)
  - `created_at` (datetime): 建立時間
  - `updated_at` (datetime): 更新時間
  - `created_by` (int): 建立者用戶 ID
  - `updated_by` (int): 更新者用戶 ID
  - `leave_date` (date): 離開日期

#### `attendances` 出席報到資料表
- **用途**: 記錄每位成員的出席情況
- **核心欄位**:
  - `id` (PK, int): 自動編號
  - `member_id` (FK → members.id): 成員 ID
  - `date` (date): 報到日期
  - `checked_in_at` (datetime): 報到時間
  - `with_meal` (bit): 是否用餐
  - `source` (nvarchar): 報到來源 (manual/qr 等)

#### `users` 系統用戶資料表
- **用途**: 系統登入帳號管理
- **核心欄位**:
  - `id` (PK, int): 自動編號
  - `username` (nvarchar): 用戶名稱
  - `password_hash` (nvarchar): 密碼雜湊
  - `role` (nvarchar): 角色 (admin/staff/viewer)
  - `last_login` (datetime): 最後登入時間

### 1.2 資料表關聯

```
users (系統帳號)
  └── 管理 members/attendances 資料

members (成員資料) ──┬── attendances (出席記錄)
                     │     ├── member_id → members.id
                     │     └── 記錄每次報到
                     │
                     └── barcode 用於 QR 報到
```

**關鍵關聯說明**:
- `attendances.member_id` → `members.id`: 每筆報到記錄對應一位成員
- `members.barcode`: 用於 QR Code 掃描報到
- 軟刪除邏輯: 使用 `members.status` 欄位控制可見性，而非實際刪除

---

## 2. 各主要 route/controller 的用途

### 2.1 成員模組 (Member Module)

#### `routes/memberRoutes.js`
```javascript
GET    /api/members/max-id      // 取得目前最大成員 ID
GET    /api/members             // 取得成員列表 (支援篩選/搜尋)
GET    /api/members/:id         // 取得單一成員
POST   /api/members             // 新增成員
PUT    /api/members/:id         // 更新成員
DELETE /api/members/:id         // 刪除成員
PATCH  /api/members/:id/status  // 更新成員狀態
```

#### `controllers/memberController.js`
- **`getAllMembers`**: 複雜查詢功能
  - 支援多條件篩選: 狀態、組別、加入日期區間、關鍵字搜尋
  - 聚合出席統計: 最近報到時間、報到總次數
  - LEFT JOIN attendances 表取得統計資料
- **`getMemberById`**: 單一成員詳細資料
- **`createMember`**: 新增成員，記錄建立者資訊
- **`updateMember`**: 更新成員資料，記錄更新者資訊
- **`deleteMember`**: 刪除成員 (實務上應改為狀態調整)
- **`updateMemberStatus`**: 狀態變更 (active ↔ hidden/leave/deceased)
- **`getMaxId`**: 取得目前最大 ID (用於編號管理)

### 2.2 報到模組 (Attendance Module)

#### `routes/attendanceRoutes.js`
```javascript
POST   /api/attendance          // 執行報到
```

#### `controllers/attendanceController.js`
- **`checkinToday`**: 核心報到功能
  - 支援雙重識別: `member_id` 或 `barcode`
  - 防重複報到: 同一天同成員只能報到一次
  - 記錄報到來源: manual/qr 等
  - 回傳完整報到資訊含成員資料

### 2.3 認證模組 (Auth Module)

#### `routes/authRoutes.js`
```javascript
POST   /api/login               // 用戶登入
```

#### `controllers/authController.js`
- **`login`**: JWT 認證
  - 驗證用戶名密碼
  - 更新最後登入時間
  - 產生 1 小時有效 JWT token
  - 回傳用戶資訊 (不含密碼)

### 2.4 用戶管理模組 (User Module)

#### `routes/userRoutes.js`
```javascript
GET    /api/user                // 取得所有用戶
GET    /api/user/:id            // 取得單一用戶
POST   /api/user                // 新增用戶
PUT    /api/user/:id            // 更新用戶
DELETE /api/user/:id            // 刪除用戶
```

#### `controllers/userController.js`
- **權限控制**: 所有操作都需要 admin 角色
- **`getAllUsers`**: 取得用戶列表 (不含密碼欄位)
- **`createUser`**: 新增用戶 (密碼雜湊處理)
- **`updateUser`**: 更新用戶資訊 (動態欄位更新)
- **`deleteUser`**: 刪除用戶
- **密碼安全**: 使用 bcrypt 雙重雜湊

---

## 3. middleware/utility 的角色

### 3.1 中介層 (Middlewares)

#### `middlewares/auth.js` - JWT 驗證中介層
- **功能**: 驗證請求中的 JWT token
- **使用範圍**:
  - 所有需要登入的 API (members, attendance, user 模組)
  - 從 Authorization header 提取 Bearer token
- **驗證流程**:
  1. 檢查 token 存在性
  2. 驗證 token 有效性
  3. 將解碼後的用戶資訊存入 `req.user`
  4. 401 錯誤回應無效 token

### 3.2 工具程式庫 (Utilities)

#### `utils/date.js` - 日期處理工具
- **`formatNow()`**: 取得當前時間字串 (YYYY-MM-DD HH:mm:ss.sss)
- **`todayStart()`**: 取得今日開始時間 (YYYY-MM-DD 00:00:00.000)
- **用途**: 統一日期格式，支援 SQL Server 日期欄位操作

---

## 4. 成員（members）模組與報到（attendances）模組的互動方式

### 4.1 資料層面的互動

#### 成員模組對報到模組的依賴
```sql
-- memberController.js 中的聚合查詢
SELECT
  m.*,
  att.last_checked_in_at AS last_checked_in,
  ISNULL(att.attendance_count, 0) AS attendance_count
FROM members AS m
LEFT JOIN (
  SELECT
    member_id,
    MAX(checked_in_at) AS last_checked_in_at,
    COUNT(*) AS attendance_count
  FROM attendances
  GROUP BY member_id
) AS att
  ON att.member_id = m.id
```

**互動特點**:
- 成員列表頁面顯示每位成員的出席統計
- LEFT JOIN 確保無出席記錄的成員仍會顯示 (attendance_count = 0)
- 提供「最近報到時間」和「累計報到次數」

#### 報到模組對成員模組的依賴
```javascript
// attendanceController.js 中的成員查詢
// 方式1: 透過 member_id
const memberInfo = await pool.request()
  .input('id', sql.Int, member_id)
  .query('SELECT id, name, dharma_name, barcode FROM members WHERE id = @id');

// 方式2: 透過 barcode
const memberInfo = await pool.request()
  .input('barcode', sql.NVarChar, barcode)
  .query('SELECT id, name, dharma_name, barcode FROM members WHERE barcode = @barcode');
```

**互動特點**:
- 支援雙重識別方式: 直接 member_id 或掃描 barcode
- 報到成功後回傳完整成員資訊
- 驗證成員存在性後才允許報到

### 4.2 業務邏輯上的互動

#### 防重複報到機制
```javascript
// 檢查今日是否已報到
const existed = await pool.request()
  .input('member_id', sql.Int, memberId)
  .input('date', sql.Date, formatNow())  // 日期部分
  .query(`
    SELECT TOP 1 a.*, m.name, m.dharma_name, m.barcode
    FROM attendances AS a
    JOIN members AS m ON a.member_id = m.id
    WHERE a.member_id = @member_id AND a.[date] = @date
  `);
```

**互動特點**:
- 基於 `(member_id, date)` 的唯一性約束
- 重複報到時返回現有記錄而非錯誤
- JOIN 確保回傳資料包含成員基本資訊

#### 條碼系統整合
- `members.barcode`: 作為 QR Code 的識別碼
- `attendances.source`: 記錄報到方式 (manual/qr)
- 支援未來擴充不同報到來源的統計分析

### 4.3 權限與安全互動

#### JWT 用戶資訊在模組間傳遞
```javascript
// 記錄操作者資訊
const userId = req.user?.id || null; // 從 JWT 取出當前登入使用者

// 用於 audit trail
.input('created_by', sql.Int, userId)
.input('updated_by', sql.Int, userId)
```

**互動特點**:
- 所有資料異動記錄操作者 ID
- 提供完整的 audit trail
- 支援權限檢查和責任追溯

### 4.4 資料一致性保障

#### 狀態管理
- 成員狀態變更影響報到可見性 (hidden 狀態的成員不顯示在一般列表)
- 軟刪除邏輯確保歷史報到記錄完整保留
- 狀態變更不會影響既有的報到統計

#### 資料完整性
- 外鍵約束: `attendances.member_id` → `members.id`
- 防止孤兒記錄 (無對應成員的報到記錄)
- 確保報到統計的準確性

---

## 技術架構總結

### 系統架構圖
```
┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Express API   │
│                 │◄──►│   (app.js)      │
└─────────────────┘    └─────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
            ┌───────▼───┐ ┌───▼───┐ ┌──▼────┐
            │ Members   │ │Attendance│ │ Users │
            │ Controller│ │Controller│ │Controller│
            └───────▲───┘ └────────┘ └────▲───┘
                    │                     │
            ┌───────┼─────────────────────┼──────┐
            │       │                     │      │
            │   ┌───▼─────────────────────▼──┐   │
            │   │       SQL Server DB         │   │
            │   │  ┌─────────┐  ┌──────────┐  │   │
            │   │  │ Members │  │Attendances│  │   │
            │   │  │  Table  │  │  Table   │  │   │
            │   │  └─────────┘  └──────────┘  │   │
            │   │  ┌─────────┐                │   │
            │   │  │  Users  │                │   │
            │   │  │  Table  │                │   │
            │   │  └─────────┘                │   │
            │   └─────────────────────────────┘   │
            └─────────────────────────────────────┘
```

### 關鍵設計原則
1. **RESTful API**: 統一的資源導向設計
2. **JWT 認證**: 無狀態的身份驗證
3. **軟刪除**: 保留完整歷史記錄
4. **聚合查詢**: 在成員列表中即時顯示出席統計
5. **雙重識別**: 支援 ID 和條碼兩種報到方式
6. **防重複機制**: 確保資料準確性
7. **權限分層**: admin/staff/viewer 三級權限設計
