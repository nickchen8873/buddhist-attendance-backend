const { sql, config } = require('../config/db');

exports.getAll = async (req, res) => {
  try {
    // 先連線，然後查詢
    let pool = await sql.connect(config);
    let result = await pool.request().query('SELECT * FROM members');
    res.json(result.recordset);  // MSSQL 查詢結果放在 recordset
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};