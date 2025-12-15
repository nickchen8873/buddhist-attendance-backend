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
// body是：
// { keyword, with_meal?, source? } // ID / 姓名 / 法名 / 條碼
exports.checkin = async (req, res) => {
  let { keyword, with_meal, source } = req.body;
  const pool = await sql.connect(config);

  try {
    const now = new Date();                     // 建議直接用 Date，避免字串轉換問題

    const withMealBit = (with_meal === false) ? 0 : 1;
    const sourceValue = source || 'keyword';

    // ✅ 改成用「陣列」支援一次多筆
    let targetMemberIds = [];

    // 3. keyword 報到（✅姓名/法名完全相同 -> 多筆一起報到）
    if (!targetMemberIds.length && keyword) {
      const kw = String(keyword).trim();

      // 3-1 先找「ID/姓名/法名/barcode完全相同」（可多筆）
      const exactRes = await pool.request()
        .input('kw', sql.NVarChar, kw)
        .query(`
          SELECT id
          FROM members
          WHERE status = 'active'
            AND (TRIM(name) = @kw OR TRIM(dharma_name) = @kw OR TRIM(barcode) = @kw)
        `);

      if (exactRes.recordset.length) {
        targetMemberIds = exactRes.recordset.map(r => r.id);
      }
      //  else {
      //   // 3-2 找不到完全相同 -> fallback 手機後三碼
      //   const fallbackRes = await pool.request()
      //     .input('kw', sql.NVarChar, kw)
      //     .query(`
      //       SELECT TOP 2 id
      //       FROM members
      //       WHERE status = 'active'
      //         AND (
      //           RIGHT(phone, 3) = @kw
      //         )
      //     `);

      //   if (!fallbackRes.recordset.length) {
      //     return res.status(404).json({ message: '找不到符合關鍵字的成員' });
      //   }
      //   if (fallbackRes.recordset.length > 1) {
      //     return res.status(400).json({
      //       message: '有多位成員符合此關鍵字（手機後三碼），請輸入更完整的姓名或法名'
      //     });
      //   }
      //   targetMemberIds = [fallbackRes.recordset[0].id];
      // }
    }

    console.log("targetMemberIds:",targetMemberIds)

    if (!targetMemberIds.length) {
      return res.status(400).json({
        message: '找不到符合關鍵字的成員'
      });
    }

    // 去重
    targetMemberIds = [...new Set(targetMemberIds)];

    // 4. 先查今天已報到的（避免整批被 409 擋掉）
    const dupReq = pool.request().input('date', sql.Date, now);
    targetMemberIds.forEach((id, i) => dupReq.input(`id${i}`, sql.Int, id));
    const idIn = targetMemberIds.map((_, i) => `@id${i}`).join(',');

    const dupRes = await dupReq.query(`
      SELECT member_id
      FROM attendances
      WHERE [date] = @date
        AND member_id IN (${idIn})
    `);

    const dupSet = new Set(dupRes.recordset.map(r => Number(r.member_id)));
    const idsToInsert = targetMemberIds.filter(id => !dupSet.has(id));

    // 全部都重複 -> 回 409（但不會因為其中一個重複就整批失敗）
    if (!idsToInsert.length) {
      return res.status(409).json({
        message: '今日已報到，請勿重複報到',
        duplicated_member_ids: targetMemberIds
      });
    }

    // 5. 批次 INSERT（OUTPUT 回傳 inserted ids）
    const insReq = pool.request()
      .input('date', sql.Date, now)
      .input('checked_in_at', sql.DateTime, now)
      .input('with_meal', sql.Bit, withMealBit)
      .input('source', sql.NVarChar, sourceValue);

    idsToInsert.forEach((id, i) => insReq.input(`mid${i}`, sql.Int, id));
    const valuesSql = idsToInsert.map((_, i) =>
      `(@mid${i}, @date, @checked_in_at, @with_meal, @source)`
    ).join(',');

    const insertResult = await insReq.query(`
      INSERT INTO attendances (member_id, [date], checked_in_at, with_meal, source)
      OUTPUT inserted.id, inserted.member_id
      VALUES ${valuesSql};
    `);

    const insertedAttendanceIds = insertResult.recordset.map(r => Number(r.id));

    // 6. 查回完整資料（多筆）
    const detReq = pool.request();
    insertedAttendanceIds.forEach((id, i) => detReq.input(`aid${i}`, sql.Int, id));
    const aidIn = insertedAttendanceIds.map((_, i) => `@aid${i}`).join(',');

    const detail = await detReq.query(`
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
      WHERE a.id IN (${aidIn})
      ORDER BY a.checked_in_at DESC
    `);

    // ✅ 向下相容：如果只有 1 筆，仍提供 attendance
    const attendances = detail.recordset || [];
    return res.status(201).json({
      message: `報到成功：${attendances.length} 筆` + (dupSet.size ? `（已報到略過：${dupSet.size} 筆）` : ''),
      attendance: attendances.length === 1 ? attendances[0] : null,
      attendances,
      duplicated_member_ids: [...dupSet]
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