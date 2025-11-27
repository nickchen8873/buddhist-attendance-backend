// routes/checkinRoutes.js
const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth');
const attendanceController = require('../controllers/attendanceController');

router.use(verifyJWT);           // 需要登入才可報到
router.post('/', attendanceController.checkinToday);
// 取得指定日期出席清單：GET /api/attendances?date=2025-11-26
router.get('/', attendanceController.getAttendancesByDate);

module.exports = router;
