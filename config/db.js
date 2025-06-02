const sql = require('mssql');

const config = {
  user: 'sa',        // 預設可用 sa
  password: 'amitabha4818',    // sa 密碼
  server: 'localhost',     // 本機開發
  database: 'buddhist',
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
