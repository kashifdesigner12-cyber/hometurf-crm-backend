const Service = require('../models/Service');
const Customer = require('../models/Customer');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');
const automationService = require('../services/automationService');

// =====================================================
// CREATE SERVICE / JOB
// =====================================================

const createService = async (req, res, next) => {
  try {
    const {
      customer,
      appointment,
      serviceName,
      description,
      assignedTo,
      status,
      startDate,
      notes,
    } = req.body;

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required',
      });
    }

    if (!serviceName) {
      return res.status(400).json({
        success: false,
        message: 'Service name is required',
      });
    }

    const customerDoc = await Customer.findById(customer);

    if (!customerDoc) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    if (appointment) {
      const appointmentDoc = await Appointment.findById(appointment);

      if (!appointmentDoc) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found',
        });
      }
    }

    if (assignedTo) {
      const userDoc = await User.findById(assignedTo);

      if (!userDoc) {
        return res.status(404).json({
          success: false,
          message: 'Assigned user not found',
        });
      }
    }

    const service = await Service.create({
      customer,
      appointment: appointment || null,
      serviceName,
      description: description || '',
      assignedTo: assignedTo || null,
      status: status || 'NEW',
      startDate: startDate || new Date(),
      notes: notes || '',
    });

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customerDoc._id,
      action: 'SERVICE_CREATED',
      description: `Created service/job: ${serviceName} for ${customerDoc.name}`,
    });

    const populated = await Service.findById(service._id)
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone')
      .populate('appointment');

    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET ALL SERVICES / JOBS
// =====================================================

const getServices = async (req, res, next) => {
  try {
    const {
      status,
      customer,
      assignedTo,
      search,
    } = req.query;

    const query = {};

    if (status) {
      query.status = String(status).toUpperCase();
    }

    if (customer) {
      query.customer = customer;
    }

    if (assignedTo) {
      query.assignedTo = assignedTo;
    }

    if (search) {
      query.serviceName = {
        $regex: String(search).trim(),
        $options: 'i',
      };
    }

    const services = await Service.find(query)
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone')
      .populate('appointment')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: services.length,
      data: services,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET SERVICE BY ID
// =====================================================

const getServiceById = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id)
      .populate('customer')
      .populate('assignedTo', 'name email phone')
      .populate('appointment');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE SERVICE / JOB
// =====================================================

const updateService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    const allowedFields = [
      'customer',
      'appointment',
      'serviceName',
      'description',
      'assignedTo',
      'status',
      'startDate',
      'completionDate',
      'notes',
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.customer) {
      const customerDoc = await Customer.findById(
        updateData.customer
      );

      if (!customerDoc) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }
    }

    if (updateData.appointment) {
      const appointmentDoc = await Appointment.findById(
        updateData.appointment
      );

      if (!appointmentDoc) {
        return res.status(404).json({
          success: false,
          message: 'Appointment not found',
        });
      }
    }

    if (updateData.assignedTo) {
      const userDoc = await User.findById(
        updateData.assignedTo
      );

      if (!userDoc) {
        return res.status(404).json({
          success: false,
          message: 'Assigned user not found',
        });
      }
    }

    const updated = await Service.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('customer', 'name phone email address')
      .populate('assignedTo', 'name email phone')
      .populate('appointment');

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: updated.customer
        ? updated.customer._id
        : null,
      action: 'SERVICE_UPDATED',
      description: `Updated service: ${updated.serviceName}`,
    });

    res.status(200).json({
      success: true,
      message: 'Service updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// DELETE SERVICE / JOB
// =====================================================

const deleteService = async (req, res, next) => {
  try {
    const service = await Service.findById(req.params.id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    await Service.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: service.customer,
      action: 'SERVICE_DELETED',
      description: `Deleted service ${service.serviceName}`,
    });

    res.status(200).json({
      success: true,
      message: 'Service removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// UPDATE SERVICE STATUS
// =====================================================

const updateServiceStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide service status',
      });
    }

    const normalizedStatus = String(status).toUpperCase();

    const service = await Service.findById(
      req.params.id
    ).populate('customer');

    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
      });
    }

    const previousStatus = service.status;

    // Prevent duplicate COMPLETED trigger
    if (
      previousStatus === 'COMPLETED' &&
      normalizedStatus === 'COMPLETED'
    ) {
      return res.status(400).json({
        success: false,
        message: 'Service is already completed',
      });
    }

    service.status = normalizedStatus;

    if (normalizedStatus === 'COMPLETED') {
      service.completionDate = new Date();
    }

    // Save service FIRST
    await service.save();

    // =====================================================
    // SERVICE COMPLETED AUTOMATION
    // =====================================================

    if (
      normalizedStatus === 'COMPLETED' &&
      service.customer
    ) {
      await Notification.create({
        title: 'Service Completed',
        message: `Service '${service.serviceName}' for ${
          service.customer.name || 'Customer'
        } marked as completed`,
        type: 'SERVICE_COMPLETED',
        referenceId: service._id,
        referenceType: 'Service',
      });

      try {
        const automationResult =
          await automationService.onServiceCompleted(
            service,
            service.customer
          );

        console.log(
          '[ServiceController] Completion automation result:',
          JSON.stringify(
            automationResult,
            null,
            2
          )
        );
      } catch (automationError) {
        console.error(
          '[ServiceController] Completion automation failed:',
          automationError.message
        );
      }
    }

    // =====================================================
    // ACTIVITY LOG
    // =====================================================

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: service.customer
        ? service.customer._id
        : null,
      action: 'SERVICE_STATUS_UPDATED',
      description: `Service '${service.serviceName}' status changed from ${previousStatus} to ${normalizedStatus}`,
    });

    // =====================================================
    // RETURN POPULATED SERVICE
    // =====================================================

    const populated = await Service.findById(
      service._id
    )
      .populate(
        'customer',
        'name phone email address'
      )
      .populate(
        'assignedTo',
        'name email phone'
      )
      .populate('appointment');

    res.status(200).json({
      success: true,
      message: 'Service status updated successfully',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  createService,
  getServices,
  getServiceById,
  updateService,
  deleteService,
  updateServiceStatus,
};
