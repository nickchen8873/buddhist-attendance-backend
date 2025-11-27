// controllers/checkinController.js
const { sql, config } = require('../config/db');
const { formatNow, todayStart } = require('../utils/date');

exports.checkinToday = async (req, res) => {
  const { member_id, barcode, with_meal, source } = req.body;

  try {
    if (!member_id && !barcode) {
      return res.status(400).json({
        message: 'member_id 或 barcode 至少要提供一個'
      });
    }

    const pool = await sql.connect(config);

    // 1. 先找出 member id
    let memberId;
    let memberInfo;

    if (member_id) {
      const result = await pool.request()
        .input('id', sql.Int, member_id)
        .query(`
          SELECT id, name, dharma_name, barcode
          FROM members
          WHERE id = @id
        `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: 'Member not found' });
      }

      memberInfo = result.recordset[0];
      memberId = memberInfo.id;
    } else {
      // 用 barcode 找 member
      const result = await pool.request()
        .input('barcode', sql.Char, barcode)
        .query(`
          SELECT id, name, dharma_name, barcode
          FROM members
          WHERE barcode = @barcode
        `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: '查無此條碼對應的成員' });
      }

      memberInfo = result.recordset[0];
      memberId = memberInfo.id;
    }

    // 3. 檢查「今天是否已報到」
    const existed = await pool.request()
      .input('member_id', sql.Int, memberId)
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
    const withMealValue = with_meal ? 1 : 0;            // 預設 false
    const sourceValue = source || 'manual';             // 預設 manual（手動）

    const insertResult = await pool.request()
      .input('member_id', sql.Int, memberId)
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

  } catch (err) {
    // 若觸發 UNIQUE(member_id, date)，也當成「重複報到」
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
          JOIN members AS m
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