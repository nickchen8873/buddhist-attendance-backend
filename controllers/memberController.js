const { sql, config } = require('../config/db');
const { formatNow, todayStart } = require('../utils/date');

// 取得全部成員
exports.getAllMembers = async (req, res) => {
  try {
    const { hasGroup, joinDateStart, joinDateEnd, showHidden, keyword } = req.query;
    const params = [];

    // 先對 attendances 做聚合，再 LEFT JOIN 回 members
    let query = `
      SELECT 
        m.*,
        att.last_checked_in_at AS last_checked_in,          -- 最近報到時間
        ISNULL(att.attendance_count, 0) AS attendance_count -- 報到次數（無紀錄就 0）
      FROM members AS m
      LEFT JOIN (
        SELECT 
          member_id,
          MAX(checked_in_at) AS last_checked_in_at,
          COUNT(*)           AS attendance_count
        FROM attendances
        GROUP BY member_id
      ) AS att
        ON att.member_id = m.id
      WHERE 1 = 1
    `;

    // 若沒勾「顯示隱藏」，就排除 hidden
    if (!showHidden) {
      query += ` AND m.status <> 'hidden'`;
    }

    // 有群組的成員
    if (hasGroup) {
      query += ` AND m.[group] IS NOT NULL`;
    }

    // 加入日期（這裡用 created_at 當加入日期）
    if (joinDateStart) {
      query += ` AND m.created_at >= @joinDateStart`;
      params.push({ name: 'joinDateStart', type: sql.Date, value: joinDateStart });
    }
    if (joinDateEnd) {
      query += ` AND m.created_at <= @joinDateEnd`;
      params.push({ name: 'joinDateEnd', type: sql.Date, value: joinDateEnd });
    }

    // 關鍵字搜尋：姓名 / 法號 / 手機（你要再加欄位也可以一起放）
    if (keyword) {
      query += `
        AND (
          m.name        LIKE @kw
          OR m.dharma_name LIKE @kw
          OR m.phone    LIKE @phoneKw
          OR m.[group]  LIKE @kw
          OR m.address  LIKE @kw
          OR m.barcode  LIKE @kw
        )
      `;
      params.push({ name: 'kw',      type: sql.NVarChar, value: `%${keyword}%` });
      params.push({ name: 'phoneKw', type: sql.NVarChar, value: `%${keyword}%` });
    }

    // 執行查詢
    const pool = await sql.connect(config);
    let request = pool.request();
    params.forEach(p => request.input(p.name, p.type, p.value));
    const result = await request.query(query);

    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '伺服器錯誤' });
  }
};


// 取得單一成員
exports.getMemberById = async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const { id } = req.params;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM members WHERE id = @id');
    if (!result.recordset.length) return res.status(404).json({ error: 'Member not found' });
    res.json(result.recordset[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

function normalizeDate(v) {
  if (v === '' || v == null) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 在 DB 裡確保唯一的 barcode
async function generateUniqueBarcode(pool) {
  while (true) {
    // 產生 GUID，如：'50ed4972-5efa-4e2c-94b7-fa8ff8e2ef97'
    const candidate = crypto.randomUUID();

    const check = await pool.request()
      .input('barcode', sql.NVarChar, candidate)
      .query('SELECT 1 AS existsFlag FROM members WHERE barcode = @barcode');

    if (check.recordset.length === 0) {
      // 沒撞到就用這組
      return candidate;
    }
    // 極小機率撞到就再 loop 一次
  }
}

// 新增成員
exports.createMember = async (req, res) => {
  try {
    const {
      name,
      dharma_name,
      gender,
      phone,
      birthday,
      address,
      status,
      group,
      role,
      telephone,
      remark
    } = req.body;

    const pool = await sql.connect(config);

    const userId = req.user?.id || null; // 從 JWT 取出當前登入使用者的 id

    const crypto = require('crypto');
    // 產生一個在 DB 中未被使用的 barcode
    const barcode = await generateUniqueBarcode(pool); // 這裡改長度也可以

    const result = await pool.request()
      .input('name', sql.VarChar, name)
      .input('dharma_name', sql.VarChar, dharma_name)
      .input('gender', sql.Char, gender)
      .input('phone', sql.VarChar, phone)
      .input('birthday', sql.Date, normalizeDate(birthday))
      .input('address', sql.VarChar, address)
      .input('status', sql.VarChar, status)
      .input('group', sql.VarChar, group)
      .input('role', sql.VarChar, role)
      .input('telephone', sql.Char, telephone)
      .input('remark', sql.VarChar, remark)
      .input('created_at', sql.DateTime, formatNow())
      .input('created_by', sql.Int, userId)
      .input('barcode', sql.NVarChar, barcode)
      .query(`
        INSERT INTO members 
          (name, dharma_name, gender, phone, birthday, address, status, role, [group], telephone, remark, created_at, barcode)
        VALUES 
          (@name, @dharma_name, @gender, @phone, @birthday, @address, @status, @role, @group, @telephone, @remark, @created_at, @barcode);
        SELECT SCOPE_IDENTITY() AS id;
      `);

    res.json({
      id: result.recordset[0].id,
      barcode // 你之後若想直接在前端顯示 / 產 QR，可以用到
    });
  } catch (err) {
    // 如果是 UNIQUE(barcode) 撞到（極小機率），也幫你翻成易懂訊息
    if (err.number === 2627 || err.number === 2601) {
      return res.status(500).json({
        error: 'Barcode 產生重複，請重試一次（若持續發生請通知開發者）'
      });
    }

    res.status(500).json({ error: err.message });
  }
};


// 更新成員
exports.updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, dharma_name, gender, phone, birthday, address, status, group, role, leave_date, telephone, remark, updated_at} = req.body;
    const pool = await sql.connect(config);
    
    const userId = req.user?.id || null; // 從 JWT 取出當前登入使用者的 id
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('name', sql.VarChar, name)
      .input('dharma_name', sql.VarChar, dharma_name)
      .input('gender', sql.Char, gender)
      .input('phone', sql.VarChar, phone)
      .input('birthday', sql.Date, normalizeDate(birthday))
      .input('address', sql.VarChar, address)
      .input('status', sql.VarChar, status)
      .input('group', sql.VarChar, group)
      .input('role', sql.VarChar, role)
      .input('leave_date', sql.Date, normalizeDate(leave_date))
      .input('telephone', sql.Char, telephone)
      .input('remark', sql.VarChar, remark)
      .input('updated_at', sql.DateTime, formatNow())
      .input('updated_by', sql.Int, userId)
      .query(`UPDATE members 
        SET name=@name, dharma_name=@dharma_name, gender=@gender, phone=@phone, telephone=@telephone, 
            birthday=@birthday, address=@address, status=@status, role=@role, [group]=@group, leave_date=@leave_date, 
            remark=@remark, updated_at=@updated_at 
        WHERE id=@id`);
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 刪除成員
exports.deleteMember = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await sql.connect(config);
    await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM members WHERE id = @id');
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 更新成員狀態
exports.updateMemberStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const pool = await sql.connect(config);
    await pool.request()
      .input('id', sql.Int, id)
      .input('status', sql.VarChar, status)
      .query('UPDATE members SET status=@status WHERE id=@id');
    res.json({ message: 'Status Updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMaxId = async (req, res) => {
  try {
    const pool = await sql.connect(config);
    result = await pool.request()
      .query('SELECT COALESCE(MAX(id), 0) AS maxId FROM members');
    // rows[0].maxId 會是數字，例如 158
    res.json(Number(result.recordset[0].maxId))
    // console.log(result.recordset[0].maxId)
  } catch (err) {
    console.error('取得最大ID失敗:', err)
    res.status(500).json({ error: err.message })
  }
}
