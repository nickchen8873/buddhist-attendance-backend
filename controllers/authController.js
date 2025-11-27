require('dotenv').config();
const jwtSecret = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sql, config } = require('../config/db');

exports.login = async (req, res) => {
  const { username, password } = req.body;

  try {
    const pool = await sql.connect(config);
    const result = await pool.request()
      .input('username', sql.VarChar, username)
      .query('SELECT * FROM users WHERE username = @username');

    if (result.recordset.length === 0) {
      return res.status(401).json({ message: '帳號或密碼錯誤' });
    }

    const user = result.recordset[0];

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: '帳號或密碼錯誤' });
    }

    // 更新登入時間
    await pool.request()
      .input('username', sql.VarChar, username)
      .query('UPDATE users SET last_login = GETDATE() WHERE username = @username');

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      last_login: new Date().toISOString()
    };

    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' });

    res.json({
      token,
      user: payload
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '伺服器錯誤' });
  }
};
