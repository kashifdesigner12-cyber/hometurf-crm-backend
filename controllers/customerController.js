const Customer = require('../models/Customer');
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const Conversation = require('../models/Conversation');
const Call = require('../models/Call');
const Review = require('../models/Review');
const ActivityLog = require('../models/ActivityLog');
const logActivity = require('../utils/activityLogger');

// @desc    Create new customer
// @route   POST /api/customers
// @access  Private
const createCustomer = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      address,
      source,
      notes,
      status,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Customer name and phone number are required',
      });
    }

    const normalizedPhone = phone.trim();
    const normalizedEmail = email ? email.trim().toLowerCase() : '';

    // Check duplicate phone
    const existingPhone = await Customer.findOne({
      phone: normalizedPhone,
    });

    if (existingPhone) {
      return res.status(400).json({
        success: false,
        message: 'A customer with this phone number already exists',
      });
    }

    // Check duplicate email
    if (normalizedEmail) {
      const existingEmail = await Customer.findOne({
        email: normalizedEmail,
      });

      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: 'A customer with this email already exists',
        });
      }
    }

    const customer = await Customer.create({
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      address: address || {},
      source: source || 'MANUAL',
      notes: notes || '',
      status: status || 'ACTIVE',
    });

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customer._id,
      action: 'CUSTOMER_CREATED',
      description: `Created customer profile: ${customer.name} (${customer.phone})`,
    });

    res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all customers with filter and search
// @route   GET /api/customers
// @access  Private
const getCustomers = async (req, res, next) => {
  try {
    const {
      status,
      source,
      search,
    } = req.query;

    const query = {};

    if (status) {
      query.status = status.toUpperCase();
    }

    if (source) {
      query.source = source.toUpperCase();
    }

    if (search && search.trim()) {
      const searchText = search.trim();

      query.$or = [
        { name: { $regex: searchText, $options: 'i' } },
        { phone: { $regex: searchText, $options: 'i' } },
        { email: { $regex: searchText, $options: 'i' } },
      ];
    }

    const customers = await Customer.find(query)
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single customer with full relations
// @route   GET /api/customers/:id
// @access  Private
const getCustomerById = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const [
      appointments,
      services,
      conversations,
      calls,
      reviews,
      activityLogs,
    ] = await Promise.all([
      Appointment.find({
        customer: customer._id,
      })
        .sort({ date: -1 })
        .populate('assignedTo', 'name email'),

      Service.find({
        customer: customer._id,
      })
        .sort({ createdAt: -1 })
        .populate('assignedTo', 'name email'),

      Conversation.find({
        customer: customer._id,
      })
        .sort({ lastMessageAt: -1 }),

      Call.find({
        customer: customer._id,
      })
        .sort({ startedAt: -1 }),

      Review.find({
        customer: customer._id,
      })
        .sort({ createdAt: -1 }),

      ActivityLog.find({
        customer: customer._id,
      })
        .sort({ createdAt: -1 })
        .populate('user', 'name email role'),
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...customer.toObject(),
        appointments,
        services,
        conversations,
        calls,
        reviews,
        activityHistory: activityLogs,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
const updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    const {
      name,
      phone,
      email,
      address,
      source,
      notes,
      status,
    } = req.body;

    // Validate duplicate phone
    if (phone !== undefined) {
      const normalizedPhone = phone.trim();

      const phoneExists = await Customer.findOne({
        phone: normalizedPhone,
        _id: { $ne: customer._id },
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: 'A customer with this phone number already exists',
        });
      }
    }

    // Validate duplicate email
    if (email !== undefined && email.trim()) {
      const normalizedEmail = email.trim().toLowerCase();

      const emailExists = await Customer.findOne({
        email: normalizedEmail,
        _id: { $ne: customer._id },
      });

      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'A customer with this email already exists',
        });
      }
    }

    // Build update object
    const updateData = {};

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (phone !== undefined) {
      updateData.phone = phone.trim();
    }

    if (email !== undefined) {
      updateData.email = email.trim().toLowerCase();
    }

    if (address !== undefined) {
      updateData.address = address;
    }

    if (source !== undefined) {
      updateData.source = source.toUpperCase();
    }

    if (notes !== undefined) {
      updateData.notes = notes;
    }

    if (status !== undefined) {
      updateData.status = status.toUpperCase();
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    );

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customer._id,
      action: 'CUSTOMER_UPDATED',
      description: `Updated customer details for ${updatedCustomer.name}`,
    });

    res.status(200).json({
      success: true,
      data: updatedCustomer,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
const deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
      });
    }

    await Customer.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customer._id,
      action: 'CUSTOMER_DELETED',
      description: `Deleted customer ${customer.name}`,
    });

    res.status(200).json({
      success: true,
      message: 'Customer removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};