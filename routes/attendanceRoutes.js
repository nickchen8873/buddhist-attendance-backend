// routes/checkinRoutes.js
const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth');
const attendanceController = require('../controllers/attendanceController');

router.use(verifyJWT);           // 需要登入才可報到
router.post('/', attendanceController.checkinToday);
// 取得指定日期出席清單：GET /api/attendances?date=2025-11-26
router.get('/', attendanceController.getAttendancesByDate);
// 切換用餐 / 不用餐：PATCH /api/attendances/:id
// body: { with_meal: true/false }
router.patch('/:id', attendanceController.updateAttendanceMeal);
// 取消出席（移回「本次活動可設定成員」）：DELETE /api/attendances/:id
router.delete('/:id', attendanceController.deleteAttendance);
// 依 member_id / barcode / keyword 報到
router.post('/checkin', attendanceController.checkin);

module.exports = router;
