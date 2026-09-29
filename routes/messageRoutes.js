const express = require('express');
const router = express.Router();
const {
  getMessagesByConversation,
  sendMessage,
} = require('../controllers/messageController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/conversation/:conversationId', getMessagesByConversation);
router.post('/send', sendMessage);

module.exports = router;