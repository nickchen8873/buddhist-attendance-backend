require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER,        // 預設可用 sa
  password: process.env.DB_PASSWORD,    // sa 密碼
  server: process.env.DB_SERVER,     // 本機開發
  database: process.env.DB_DATABASE,
  options: {
    encrypt: false,        // 本地可設 false，Azure 需 true
    trustServerCertificate: true
  }
};

module.exports = { sql, config };

// 在 app.js 裡面引入使用：
// const sql = require('mssql');
// const dbConfig = require('./config/db');
// sql.connect(dbConfig).then(...).catch(...);
