// controllers/checkinController.js
const { sql, config } = require('../config/db');
const { formatNow, todayStart } = require('../utils/date');

exports.checkinToday = async (req, res) => {
  const { member_id, barcode, with_meal, source } = req.body;
  const { guest_name, guest_type } = req.body; // 匿名報到用

  try {
    // 先註解掉，讓匿名報到可以正常運作
    // if (!member_id && !barcode) {
    //   return res.status(400).json({
    //     message: 'member_id 或 barcode 至少要提供一個'
    //   });
    // }

    const pool = await sql.connect(config);

    // 先註解掉，讓匿名報到可以正常運作
    // // 1. 先找出 member id
    // let memberId;
    // let memberInfo;

    // if (member_id) {
    //   const result = await pool.request()
    //     .input('id', sql.Int, member_id)
    //     .query(`
    //       SELECT id, name, dharma_name, barcode
    //       FROM members
    //       WHERE id = @id
    //     `);

    //   if (!result.recordset.length) {
    //     return res.status(500).json({ message: 'Member not found' });
    //   }

    //   memberInfo = result.recordset[0];
    //   memberId = memberInfo.id;
    // } else {
    //   // 用 barcode 找 member
    //   const result = await pool.request()
    //     .input('barcode', sql.NVarChar, barcode)
    //     .query(`
    //       SELECT id, name, dharma_name, barcode
    //       FROM members
    //       WHERE barcode = @barcode
    //     `);

    //   if (!result.recordset.length) {
    //     return res.status(404).json({ message: '查無此條碼對應的成員' });
    //   }

    //   memberInfo = result.recordset[0];
    //   memberId = memberInfo.id;
    // }

    // 3. 檢查「今天是否已報到」
    const existed = await pool.request()
      .input('member_id', sql.Int, member_id)
      .input('date', sql.Date, formatNow())  // SQL Server 的 DATE 只會存日期部分
      .query(`
        SELECT TOP 1 a.*, m.name, m.dharma_name, m.barcode
        FROM attendances AS a
        JOIN members AS m ON a.member_id = m.id
        WHERE a.member_id = @member_id AND a.[date] = @date
      `);

    if (existed.recordset.length) {
      // 已經報到過了，直接回傳現有資料
      return res.status(200).json({
        message: '今日已完成報到',
        duplicated: true,
        attendance: existed.recordset[0]
      });
    }

    // 4. 實際寫入一筆新的出席紀錄
    const withMealValue = (with_meal === false) ? 0 : 1;           // 預設 false
    const sourceValue = source || 'manual';             // 預設 manual（手動）

    // A. 正式成員
    if (member_id) {
      const insertResult = await pool.request()
        .input('member_id', sql.Int, member_id)
        .input('date', sql.Date, formatNow())
        .input('checked_in_at', sql.DateTime, formatNow())
        .input('with_meal', sql.Bit, withMealValue)
        .input('source', sql.NVarChar(16), sourceValue)
        .query(`
          INSERT INTO attendances (member_id, [date], checked_in_at, with_meal, source)
          VALUES (@member_id, @date, @checked_in_at, @with_meal, @source);
          SELECT SCOPE_IDENTITY() AS id;
        `);

      const insertedId = insertResult.recordset[0].id;

      // 5. 把剛剛插入的完整資料撈出來（順便帶 member 資料，前端比較好用）
      const inserted = await pool.request()
        .input('id', sql.Int, insertedId)
        .query(`
          SELECT a.*, m.name, m.dharma_name, m.barcode
          FROM attendances AS a
          JOIN members AS m ON a.member_id = m.id
          WHERE a.id = @id
        `);
      
      return res.status(201).json({
        message: '報到成功',
        duplicated: false,
        attendance: inserted.recordset[0]
      });
    } 
    // B. 匿名報到
    else if (guest_name) {
      const pool = await sql.connect(config);
      const result = await pool.request()
        .input('member_id', sql.Int, null)
        .input('with_meal', sql.Bit, with_meal)
        .input('source', sql.NVarChar, source || 'guest')
        .input('guest_name', sql.NVarChar, guest_name)
        .input('guest_type', sql.NVarChar, guest_type || null)
        .query(`
          INSERT INTO attendances (member_id, with_meal, source, guest_name, guest_type, checked_in_at, date)
          VALUES (@member_id, @with_meal, @source, @guest_name, @guest_type, GETDATE(), GETDATE());
          SELECT SCOPE_IDENTITY() AS id;
        `);

      return res.status(201).json({ id: result.recordset[0].id });
    }
    // C. 兩者都沒有
    else {
      return res.status(400).json({ error: 'member_id 或 guest_name 必須至少有一個' });
    }

  } catch (err) {
    // 若觸發 UNIQUE(guest_name, date)，也當成「重複報到」
    if (err.number === 2627 || err.number === 2601) {
      try {
        const pool = await sql.connect(config);

        const existed = await pool.request()
          .input('member_id', sql.Int, member_id)
          .input('date', sql.Date, formatNow())
          .query(`
            SELECT TOP 1 a.*, m.name, m.dharma_name, m.barcode
            FROM attendances AS a
            JOIN members AS m ON a.member_id = m.id
            WHERE a.member_id = @member_id AND a.[date] = @date
          `);

        if (existed.recordset.length) {
          return res.status(200).json({
            message: '今日已完成報到（unique constraint）',
            duplicated: true,
            attendance: existed.recordset[0]
          });
        }
      } catch (e2) {
        // 若補救查詢也失敗，就讓它往下走 500
      }
    }

    console.error('checkinToday error:', err);
    return res.status(500).json({
      message: '伺服器錯誤',
      error: err.message
    });
  }
};

// 取得指定日期的出席清單
exports.getAttendancesByDate = async (req, res) => {
    try {
      const pool = await sql.connect(config);
  
      let { date } = req.query;
  
      // 如果沒帶 date，就預設今天（格式：YYYY-MM-DD）
      if (!date) {
        const today = new Date();
        date = today.toISOString().slice(0, 10); // 例如 "2025-11-26"
      }
  
      const result = await pool.request()
        .input('date', sql.Date, date)
        .query(`
          SELECT
            a.id,
            a.member_id,
            a.[date],
            a.checked_in_at,
            a.with_meal,
            a.source,
            a.guest_name,
            a.guest_type,
            m.name,
            m.dharma_name,
            m.gender,
            m.phone,
            m.telephone,
            m.[group],
            m.role,
            m.status,
            m.barcode
          FROM attendances AS a
          LEFT JOIN members AS m
            ON a.member_id = m.id
          WHERE a.[date] = @date
          ORDER BY a.checked_in_at ASC, a.id ASC
        `);
  
      // 沒出席紀錄就回傳 []，前端自己判斷「今日無出席」
      res.json(result.recordset);
    } catch (err) {
      console.error('取得出席清單失敗:', err);
      res.status(500).json({
        message: '伺服器錯誤，無法取得出席清單',
        error: err.message
      });
    }
  };

  // PATCH /api/attendances/:id
// 切換 with_meal (true <-> false)
exports.updateAttendanceMeal = async (req, res) => {
  const { id } = req.params;
  const { with_meal } = req.body;

  if (typeof with_meal === 'undefined') {
    return res.status(400).json({ message: 'with_meal 欄位必填' });
  }

  const withMealBit = (with_meal === false) ? 0 : 1;

  try {
    const pool = await sql.connect(config);

    // 先確認這筆出席是否存在
    const existed = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM attendances WHERE id = @id');

    if (!existed.recordset.length) {
      return res.status(404).json({ message: 'Attendance not found' });
    }

    // 更新 with_meal
    await pool.request()
      .input('id', sql.Int, id)
      .input('with_meal', sql.Bit, withMealBit)
      .query(`
        UPDATE attendances
        SET with_meal = @with_meal
        WHERE id = @id;
      `);

    // 把更新後的完整資料（含 member 資訊）撈回去給前端
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT a.*, m.name, m.dharma_name, m.[group], m.role, m.status, m.barcode
        FROM attendances AS a
        JOIN members AS m ON a.member_id = m.id
        WHERE a.id = @id
      `);

    return res.json({
      message: 'with_meal 已更新',
      attendance: result.recordset[0]
    });
  } catch (err) {
    console.error('updateAttendanceMeal error:', err);
    return res.status(500).json({
      message: '伺服器錯誤，無法更新 with_meal',
      error: err.message
    });
  }
};

// DELETE /api/attendances/:id
// 取消今日出席（讓成員回到「本次活動可設定成員」欄）
exports.deleteAttendance = async (req, res) => {
  const { id } = req.params;

  try {
    const pool = await sql.connect(config);

    // 先確認是否存在
    const existed = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM attendances WHERE id = @id');

    if (!existed.recordset.length) {
      return res.status(404).json({ message: 'Attendance not found' });
    }

    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM attendances WHERE id = @id');

    return res.json({ message: 'Attendance 已刪除' });
  } catch (err) {
    console.error('deleteAttendance error:', err);
    return res.status(500).json({
      message: '伺服器錯誤，無法刪除出席紀錄',
      error: err.message
    });
  }
};

// POST /api/checkin
// body 可以是：
// 1) { member_id, with_meal?, source? }
// 2) { barcode, with_meal?, source? }
// 3) { keyword, with_meal?, source? } // 姓名 / 法名 / 手機後三碼 / 條碼
exports.checkin = async (req, res) => {
  let { member_id, barcode, keyword, with_meal, source } = req.body;
  const pool = await sql.connect(config);

  try {
    // 1. 先解析要報到的 member_id
    let targetMemberId = member_id ? Number(member_id) : null;

    // 1-1. 如果沒有 member_id，先試著用 barcode 找（for 專用條碼欄位）
    if (!targetMemberId && barcode) {
      const result = await pool.request()
        .input('barcode', sql.NVarChar, String(barcode).trim())
        .query(`
          SELECT TOP 2 id, name, dharma_name, phone
          FROM members
          WHERE barcode = @barcode
        `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: '找不到對應的 barcode 成員' });
      }
      if (result.recordset.length > 1) {
        return res.status(400).json({ message: '相同 barcode 有多筆成員，請聯繫管理員處理' });
      }
      targetMemberId = result.recordset[0].id;
    }

    // 1-2. 如果沒有 member_id / barcode，但有 keyword，就用姓名 / 法名 / 手機後三碼 / barcode 搜尋
    if (!targetMemberId && keyword) {
      const kw = String(keyword).trim();

      const request = pool.request()
        .input('kwLike', sql.NVarChar, `%${kw}%`)
        .input('kwExact', sql.NVarChar, kw);

      const result = await request.query(`
        SELECT TOP 3 id, name, dharma_name, phone, barcode
        FROM members
        WHERE status = 'active'
          AND (
            name LIKE @kwLike
            OR dharma_name LIKE @kwLike
            OR RIGHT(phone, 3) = @kwExact
            OR barcode like @kwExact       -- ✅ 支援 keyword 當成條碼精準比對
          )
      `);

      if (!result.recordset.length) {
        return res.status(500).json({ message: '找不到符合關鍵字的成員' });
      }
      if (result.recordset.length > 1) {
        return res.status(400).json({
          message: '有多位成員符合此關鍵字，請輸入更完整的姓名或法名或手機後三碼'
        });
      }

      targetMemberId = result.recordset[0].id;
    }

    // 1-3. 仍然沒有 member_id，就算錯誤
    if (!targetMemberId) {
      return res.status(400).json({
        message: '請提供 member_id、barcode 或 keyword 其中一種資訊'
      });
    }

    // 2. 準備一些欄位
    // const today = todayStart();      // 建議回傳 "YYYY-MM-DD" 或 "YYYY-MM-DD 00:00:00.000"
    const now = formatNow();         // datetime
    const withMealBit = (with_meal === false) ? 0 : 1;
    const sourceValue = source || 'manual';

    // 3. 先檢查今天是否已報到（用 date 欄位）
    const dupCheck = await pool.request()
      .input('member_id', sql.Int, targetMemberId)
      .input('date', sql.Date, now)
      .query(`
        SELECT id
        FROM attendances
        WHERE member_id = @member_id
          AND [date] = @date
      `);

    if (dupCheck.recordset.length) {
      return res.status(409).json({ message: '今日已報到，請勿重複報到' });
    }

    // 4. 寫入 attendances
    const insertResult = await pool.request()
      .input('member_id', sql.Int, targetMemberId)
      .input('date', sql.Date, now)       // ✅ date 存今天的 date
      .input('checked_in_at', sql.DateTime, now)
      .input('with_meal', sql.Bit, withMealBit)
      .input('source', sql.NVarChar, sourceValue)
      .query(`
        INSERT INTO attendances (member_id, [date], checked_in_at, with_meal, source)
        VALUES (@member_id, @date, @checked_in_at, @with_meal, @source);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    const newId = insertResult.recordset[0].id;

    // 5. 把剛寫入那筆完整資料（含 member 資訊）查回給前端
    const detail = await pool.request()
      .input('id', sql.Int, newId)
      .query(`
        SELECT 
          a.*,
          m.name,
          m.dharma_name,
          m.[group],
          m.role,
          m.status,
          m.barcode
        FROM attendances AS a
        JOIN members AS m ON a.member_id = m.id
        WHERE a.id = @id
      `);

    return res.status(201).json({
      message: '報到成功',
      attendance: detail.recordset[0]
    });
  } catch (err) {
    console.error('checkin error:', err);

    // UNIQUE(member_id, date) 的 constraint 也順便防一下
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: '今日已報到，請勿重複報到' });
    }

    return res.status(500).json({
      message: '伺服器錯誤，報到失敗',
      error: err.message
    });
  }
};

/**
 * GET /api/attendance/last-week?date=YYYY-MM-DD
 * 給定 date，查詢「date - 7 天」那一天的出席名單（join 成員資料）
 */
exports.getLastWeekSameDayList = async (req, res) => {
  try {
    let { date } = req.query;

    // 若沒給 date，就預設用今天
    if (!date) {
      const today = new Date();
      date = today.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    // 1) 檢查是否為未來日期（只比較日期，不比較時間）
    const now = new Date();
    const inputDate = new Date(date);
    // 檢查是否為未來日期
    if (inputDate.setHours(0,0,0,0) > now.setHours(0,0,0,0)) {
      return res.status(400).json({
        error: 'Date cannot be in the future',
      });
    }
    
    // 2) 格式檢查：YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({
        error: 'Invalid date format, expected YYYY-MM-DD',
      });
    }

    // 3) 無效日期檢查（例如 2025-02-30）
    const baseDate = new Date(date);
    if (Number.isNaN(baseDate.getTime())) {
      return res
        .status(400)
        .json({ error: "Invalid date value" });
    }

    // 計算上週同一天
    baseDate.setDate(baseDate.getDate() - 7);
    const lastWeekDate = baseDate.toISOString().slice(0, 10); // YYYY-MM-DD

    const pool = await sql.connect(config);

    const result = await pool.request()
      .input('targetDate', sql.Date, lastWeekDate)
      .query(`
        SELECT
          a.id                    AS attendance_id,
          a.member_id,
          CAST(a.[date] AS date) AS date, -- 報到日期欄位（如果叫別的名字，改這行）
          a.checked_in_at,                               -- 若有報到時間欄位就保留，沒有可刪掉
          m.name,
          m.dharma_name,
          m.gender,
          m.[group],                                      -- 你 members 裡的「組別」欄位
          m.role,
          m.phone,
          m.telephone,
          m.address,
          m.barcode,
          m.status
        FROM attendances AS a                             -- 你的報到紀錄 table 名稱
        INNER JOIN members AS m ON a.member_id = m.id
        WHERE CAST(a.[date] AS date) = @targetDate AND member_id IS NOT NULL
        ORDER BY m.[group], m.name;
      `);

    res.json({
      baseDate,                // 前端當天的日期
      targetDate: lastWeekDate, // 真正查詢的「上週同日」
      count: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    console.error('getLastWeekSameDayList error:', err);
    res.status(500).json({ error: err.message });
  }
};