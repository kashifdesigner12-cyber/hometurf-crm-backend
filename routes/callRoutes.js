const express = require('express');

const router = express.Router();

const {
  handleCallWebhook,
  createCall,
  getCalls,
  getCallById,
  updateCall,
} = require('../controllers/callController');

const { protect } = require('../middleware/authMiddleware');

// Public webhook
router.post('/webhook', handleCallWebhook);

// Protected routes
router.use(protect);

// Create call
router.post('/', createCall);

// Get all calls
router.get('/', getCalls);

// Get / Update call
router
  .route('/:id')
  .get(getCallById)
  .put(updateCall);

module.exports = router;