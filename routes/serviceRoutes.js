const express = require('express');

const router =
  express.Router();

const {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
  updateServiceStatus,
} = require('../controllers/serviceController');

const {
  protect,
} = require('../middleware/authMiddleware');

router.use(protect);

// GET /api/services
// POST /api/services
router
  .route('/')
  .get(getServices)
  .post(createService);

// GET /api/services/:id
// PUT /api/services/:id
// DELETE /api/services/:id
router
  .route('/:id')
  .get(getServiceById)
  .put(updateService)
  .delete(deleteService);

// PATCH /api/services/:id/status
router.patch(
  '/:id/status',
  updateServiceStatus
);

module.exports = router;