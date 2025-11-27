// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const verifyJWT = require('../middlewares/auth');

// 所有 user API 都需登入
router.use(verifyJWT);

// 取得全部使用者（不含密碼欄位）
router.get('/', userController.getAllUsers);

// 取得單一使用者（不含密碼欄位）
router.get('/:id', userController.getUserById);

// 新增使用者
router.post('/', userController.createUser);

// 更新使用者
router.put('/:id', userController.updateUser);

// 刪除使用者
router.delete('/:id', userController.deleteUser);

module.exports = router;
