const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const memberRoutes = require('./routes/member');
app.use(cors());
app.use(bodyParser.json());

// 路由 (後續新增到 routes 資料夾)
app.get('/', (req, res) => {
  res.send('佛堂系統 API 正常運作！');
});
app.use('/api/members', memberRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});