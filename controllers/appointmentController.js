const Appointment = require('../models/Appointment');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');
const automationService = require('../services/automationService');

// @desc    Create new appointment
// @route   POST /api/appointments
// @access  Private
const createAppointment = async (req, res, next) => {
  try {
    const {
      customer,
      service,
      assignedTo,
      date,
      time,
      notes,
      status,
    } = req.body;

    if (!customer || !service || !date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Please provide customer, service, date, and time',
      });
    }

    const customerDoc = await Customer.findById(customer);

    if (!customerDoc) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    if (assignedTo) {
      const assignedUser = await User.findById(assignedTo);

      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: 'Assigned staff user not found',
        });
      }

      if (assignedUser.status !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign appointment to an inactive user',
        });
      }
    }

    const appointment = await Appointment.create({
      customer,
      service,
      assignedTo: assignedTo || null,
      date,
      time,
      notes: notes || '',
      status: status || 'PENDING',
    });

    await Notification.create({
      title: 'New Appointment Scheduled',
      message: `Appointment for ${customerDoc.name} - ${service} on ${new Date(
        date
      ).toLocaleDateString()} at ${time}`,
      type: 'NEW_APPOINTMENT',
      referenceId: appointment._id,
      referenceType: 'Appointment',
    });

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customerDoc._id,
      action: 'APPOINTMENT_CREATED',
      description: `Booked appointment for ${customerDoc.name} (${service})`,
    });

    // Trigger confirmation automation if created directly as CONFIRMED
    if (appointment.status === 'CONFIRMED') {
      await automationService.onAppointmentConfirmed(
        appointment,
        customerDoc
      );
    }

    // Trigger completion automation if created directly as COMPLETED
    if (appointment.status === 'COMPLETED') {
      await automationService.onAppointmentCompleted(
        appointment,
        customerDoc
      );
    }

    const populated = await Appointment.findById(appointment._id)
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get appointments with filtering
// @route   GET /api/appointments
// @access  Private
const getAppointments = async (req, res, next) => {
  try {
    const {
      status,
      customer,
      assignedTo,
      startDate,
      endDate,
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }

    if (customer) {
      query.customer = customer;
    }

    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (startDate || endDate) {
      query.date = {};

      if (startDate) {
        query.date.$gte = new Date(startDate);
      }

      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const appointments = await Appointment.find(query)
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone')
      .sort({ date: 1, time: 1 });

    res.status(200).json({
      success: true,
      count: appointments.length,
      data: appointments,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single appointment
// @route   GET /api/appointments/:id
// @access  Private
const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('customer')
      .populate('assignedTo', 'name email phone');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update appointment
// @route   PUT /api/appointments/:id
// @access  Private
const updateAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    if (req.body.assignedTo) {
      const assignedUser = await User.findById(req.body.assignedTo);

      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: 'Assigned staff user not found',
        });
      }

      if (assignedUser.status !== 'ACTIVE') {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign appointment to an inactive user',
        });
      }
    }

    if (req.body.customer) {
      const customerDoc = await Customer.findById(req.body.customer);

      if (!customerDoc) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }
    }

    const oldStatus = appointment.status;

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone');

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: appointment.customer,
      action: 'APPOINTMENT_UPDATED',
      description: `Updated appointment details for ${
        updated.customer ? updated.customer.name : 'Customer'
      }`,
    });

    // Trigger automation if status changed to CONFIRMED
    if (
      oldStatus !== 'CONFIRMED' &&
      updated.status === 'CONFIRMED' &&
      updated.customer
    ) {
      await automationService.onAppointmentConfirmed(
        updated,
        updated.customer
      );
    }

    // Trigger automation if status changed to COMPLETED
    if (
      oldStatus !== 'COMPLETED' &&
      updated.status === 'COMPLETED' &&
      updated.customer
    ) {
      await automationService.onAppointmentCompleted(
        updated,
        updated.customer
      );
    }

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete appointment
// @route   DELETE /api/appointments/:id
// @access  Private
const deleteAppointment = async (req, res, next) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    await Appointment.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: appointment.customer,
      action: 'APPOINTMENT_DELETED',
      description: `Cancelled/deleted appointment ID: ${appointment._id}`,
    });

    res.status(200).json({
      success: true,
      message: 'Appointment deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update appointment status
// @route   PATCH /api/appointments/:id/status
// @access  Private
const updateAppointmentStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide appointment status',
      });
    }

    const appointment = await Appointment.findById(
      req.params.id
    ).populate('customer');

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    const previousStatus = appointment.status;

    appointment.status = status;

    await appointment.save();

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: appointment.customer
        ? appointment.customer._id
        : null,
      action: 'APPOINTMENT_STATUS_CHANGED',
      description: `Appointment status changed from ${previousStatus} to ${status}`,
    });

    // Appointment confirmed
    if (
      previousStatus !== 'CONFIRMED' &&
      status === 'CONFIRMED' &&
      appointment.customer
    ) {
      await automationService.onAppointmentConfirmed(
        appointment,
        appointment.customer
      );
    }

    // Appointment completed
    if (
      previousStatus !== 'COMPLETED' &&
      status === 'COMPLETED' &&
      appointment.customer
    ) {
      await automationService.onAppointmentCompleted(
        appointment,
        appointment.customer
      );
    }

    res.status(200).json({
      success: true,
      data: appointment,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign appointment to staff
// @route   PATCH /api/appointments/:id/assign
// @access  Private
const assignAppointment = async (req, res, next) => {
  try {
    const { assignedTo } = req.body;

    if (!assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Please provide staff user ID',
      });
    }

    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    const user = await User.findById(assignedTo);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Staff user not found',
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign appointment to an inactive user',
      });
    }

    appointment.assignedTo = user._id;

    await appointment.save();

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: appointment.customer,
      action: 'APPOINTMENT_ASSIGNED',
      description: `Appointment assigned to ${user.name}`,
    });

    const populated = await Appointment.findById(appointment._id)
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone');

    res.status(200).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createAppointment,
  getAppointments,
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  updateAppointmentStatus,
  assignAppointment,
};