const express = require('express');
const router = express.Router();
const {
  getConversations,
  getConversationById,
  createConversation,
} = require('../controllers/conversationController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.route('/')
  .get(getConversations)
  .post(createConversation);

router.route('/:id')
  .get(getConversationById);

module.exports = router;