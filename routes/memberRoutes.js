const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');
const verifyJWT = require('../middlewares/auth');

router.use(verifyJWT); // 讓所有下面的路由都套JWT
router.get('/max-id', memberController.getMaxId)           // 取得目前資料表中最大的 id（若無資料回傳 0）
router.get('/', memberController.getAllMembers);           // 取得全部成員
router.get('/:id', memberController.getMemberById);        // 取得單一成員
router.post('/', memberController.createMember);           // 新增成員
router.put('/:id', memberController.updateMember);         // 更新成員
router.delete('/:id', memberController.deleteMember);      // 刪除成員
router.patch('/:id/status', memberController.updateMemberStatus); // 更新狀態

module.exports = router;
