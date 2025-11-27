// routes/checkinRoutes.js
const express = require('express');
const router = express.Router();
const verifyJWT = require('../middlewares/auth');
const attendanceController = require('../controllers/attendanceController');

router.use(verifyJWT);           // 需要登入才可報到
router.post('/', attendanceController.checkinToday);

module.exports = router;
