const express = require('express');

const router = express.Router();

const {
  createReview,
  getReviews,
  getReviewById,
  updateReview,
  updateReviewStatus,
  deleteReview,
} = require('../controllers/reviewController');

const { protect } = require('../middleware/authMiddleware');

router.use(protect);

// GET all reviews
// POST create review
router.route('/')
  .get(getReviews)
  .post(createReview);

// GET single review
// PUT update review
// DELETE review
router.route('/:id')
  .get(getReviewById)
  .put(updateReview)
  .delete(deleteReview);

// PATCH review status
router.patch('/:id/status', updateReviewStatus);

module.exports = router;