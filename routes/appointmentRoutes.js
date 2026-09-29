const express = require('express');

const router = express.Router();

const {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  updateAppointmentStatus,
  assignAppointment,
} = require('../controllers/appointmentController');

const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router
  .route('/')
  .get(getAppointments)
  .post(createAppointment);

router
  .route('/:id')
  .get(getAppointmentById)
  .put(updateAppointment)
  .delete(deleteAppointment);

router.patch('/:id/status', updateAppointmentStatus);

router.patch('/:id/assign', assignAppointment);

module.exports = router;