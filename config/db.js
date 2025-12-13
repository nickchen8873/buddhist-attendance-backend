require('dotenv').config();
const sql = require('mssql');

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Amitabha-4818',
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_DATABASE || 'buddhist',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: process.env.DB_INSTANCE || 'SQLEXPRESS'
  }
};

module.exports = { sql, config };

// 在 app.js 裡面引入使用：
// const sql = require('mssql');
// const dbConfig = require('./config/db');
// sql.connect(dbConfig).then(...).catch(...);
