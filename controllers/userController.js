// controllers/userController.js
const { sql, config } = require('../config/db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

// 簡單的 admin 權限檢查（可依需求改成 middleware）
function ensureAdmin(req, res) {
  const { role } = req.body;
  if (!req.body || role !== 'admin') {
    res.status(403).json({ message: '需要管理員權限' });
    return false;
  }
  return true;
}

// 取得全部使用者（不回傳 password_hash）
exports.getAllUsers = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const pool = await sql.connect(config);
    const result = await pool.request()
      .query(`
        SELECT 
          id,
          username,
          role,
          last_login
        FROM users
        ORDER BY id ASC
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error('getAllUsers error:', err);
    res.status(500).json({ message: '伺服器錯誤' });
  }
};

// 取得單一使用者（不回傳 password_hash）
exports.getUserById = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const pool = await sql.connect(config);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          id,
          username,
          role,
          last_login
        FROM users
        WHERE id = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('getUserById error:', err);
    res.status(500).json({ message: '伺服器錯誤' });
  }
};

// 新增使用者
// 前端傳入：{ username, password, role }
exports.createUser = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'username 與 password 為必填欄位' });
    }

    const userRole = role || 'staff'; // 若沒傳 role 就用預設 staff
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const pool = await sql.connect(config);
    const request = pool.request()
      .input('username', sql.NVarChar(32), username)
      .input('password_hash', sql.NVarChar(128), passwordHash)
      .input('role', sql.NVarChar(16), userRole);

    const result = await request.query(`
      INSERT INTO users (username, password_hash, role, last_login)
      VALUES (@username, @password_hash, @role, NULL);

      SELECT 
        id,
        username,
        role,
        last_login
      FROM users
      WHERE id = SCOPE_IDENTITY();
    `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    console.error('createUser error:', err);

    // 處理 username 重複（違反 UNIQUE 約束）
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: '此 username 已被使用' });
    }

    res.status(500).json({ message: '伺服器錯誤' });
  }
};

// 更新使用者
// 前端可傳：{ username?, password?, role? }
// password 若有傳，則會重新 hash 後更新；沒傳則維持原密碼
exports.updateUser = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const { username, password, role } = req.body;

    const pool = await sql.connect(config);

    // 先確認使用者是否存在
    const existResult = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT id FROM users WHERE id = @id');

    if (!existResult.recordset.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 動態組 UPDATE 語句
    let updateSql = 'UPDATE users SET ';
    const params = [];

    if (username !== undefined) {
      updateSql += 'username = @username, ';
      params.push({ name: 'username', type: sql.NVarChar(32), value: username });
    }

    if (role !== undefined) {
      updateSql += 'role = @role, ';
      params.push({ name: 'role', type: sql.NVarChar(16), value: role });
    }

    if (password) {
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      updateSql += 'password_hash = @password_hash, ';
      params.push({ name: 'password_hash', type: sql.NVarChar(128), value: passwordHash });
    }

    // 如果什麼都沒傳就不用更新
    if (params.length === 0) {
      return res.status(400).json({ message: '沒有可更新的欄位' });
    }

    // 去掉最後一個逗號空白
    updateSql = updateSql.replace(/, $/, ' ');
    updateSql += 'WHERE id = @id;';

    const request = pool.request().input('id', sql.Int, id);
    params.forEach(p => request.input(p.name, p.type, p.value));

    await request.query(updateSql);

    // 回傳更新後的資料（依然不回傳 password_hash）
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          id,
          username,
          role,
          last_login
        FROM users
        WHERE id = @id
      `);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error('updateUser error:', err);

    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ message: '此 username 已被使用' });
    }

    res.status(500).json({ message: '伺服器錯誤' });
  }
};

// 刪除使用者
exports.deleteUser = async (req, res) => {
  try {
    if (!ensureAdmin(req, res)) return;

    const { id } = req.params;
    const pool = await sql.connect(config);

    // 可先檢查是否存在
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM users WHERE id = @id');

    // result.rowsAffected[0] === 0 代表沒刪到東西
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('deleteUser error:', err);
    res.status(500).json({ message: '伺服器錯誤' });
  }
};
