const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 路由 (後續新增到 routes 資料夾)
app.get('/', (req, res) => {
  res.send('佛堂系統 API 正常運作！');
});

app.use('/api', require('./routes/authRoutes.js'));
app.use('/api/members', require('./routes/memberRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/attendances', require('./routes/attendanceRoutes'));

//  app.listen(3000);

module.exports = app;