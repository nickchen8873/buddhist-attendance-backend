// tests/attendances.lastWeek.test.js
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { sql, config } = require('../config/db');

// ✅ 1. 先設定 JWT_SECRET（要和你專案裡用的一樣）
const JWT_TEST_SECRET = process.env.JWT_SECRET || 'JWT_SECRET_FOR_TEST';
process.env.JWT_SECRET = JWT_TEST_SECRET;

// ✅ 2. 再載入 app（這樣 app 裡的 auth middleware 會用到同一個 secret）
const app = require('../app');

// 產一顆測試用的 JWT，payload 隨便但要有 id / username / role 之類你驗證會用到的欄位
function generateTestToken() {
  const payload = {
    "username": "zz001",
    "password": "yourpassword"
  };

  return jwt.sign(payload, JWT_TEST_SECRET, { expiresIn: '1h' });
}

// 統一幫 request 加上 Authorization header
// function authRequest() {
//   const token = generateTestToken();
//   return app.set('Authorization', `Bearer ${token}`);
// }

describe('GET /api/attendances/last-week', () => {
  beforeAll(async () => {
    // 🔧 開 test DB 連線
    await sql.connect(config);
  });

  afterAll(async () => {
    await sql.close();
  });

  test('Case1: 指定日期 2025-12-09，應取得 2025-12-02 的出席名單', async () => {
    const token = generateTestToken();

    const res = await request(app)
      .get('/api/attendances/last-week')
      .set('Authorization', `Bearer ${token}`)
      .query({ date: '2025-12-09' }); // query string: ?date=2025-12-09

    console.log('last-week response:', res.status, res.body); // <-- 先加這行

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // 至少要有一筆，就是我們 beforeAll 插入的紀錄
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const first = res.body.data[0];
    // 下面欄位名稱依你 join 出來的 schema 調整
    expect(first).toHaveProperty('member_id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('date');

    // 確認日期真的是 2025-12-02
    expect(first.date.startsWith('2025-12-02')).toBe(true);
  });

  test('Case2: date 缺少時，應回 400', async () => {
    const token = generateTestToken();

    const res = await request(app)
      .get('/api/attendances/last-week')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.data).toHaveProperty('error');
  });

  test('Case3: date 格式錯誤，應回 400', async () => {
    const token = generateTestToken();

    const res = await request(app)
      .get('/api/attendances/last-week')
      .set('Authorization', `Bearer ${token}`)
      .query({ date: '2025/12/09' }); // 錯誤格式

    expect(res.status).toBe(400);
    expect(res.body.data).toHaveProperty('error');
  });

  test('Case4: 無效日期 (例如 2025-02-30)，應回 400', async () => {
    const token = generateTestToken();

    const res = await request(app)
      .get('/api/attendances/last-week')
      .set('Authorization', `Bearer ${token}`)
      .query({ date: '2025-02-30' });

    expect(res.status).toBe(400);
    expect(res.body.data).toHaveProperty('error');
  });
});