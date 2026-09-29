const Call = require('../models/Call');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const aiCallService = require('../services/aiCallService');

// @desc    Webhook to handle incoming AI calls
// @route   POST /api/calls/webhook
// @access  Public
const handleCallWebhook = async (req, res, next) => {
  try {
    const result = await aiCallService.handleIncomingCallWebhook(req.body);

    res.status(200).json({
      success: true,
      message: 'Call webhook processed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create call manually
// @route   POST /api/calls
// @access  Private
const createCall = async (req, res, next) => {
  try {
    const {
      customer,
      lead,
      phoneNumber,
      direction,
      status,
      duration,
      summary,
      notes,
      outcome,
      aiHandled,
      recordingUrl,
      startedAt,
      endedAt,
    } = req.body;

    if (!phoneNumber && !customer && !lead) {
      return res.status(400).json({
        success: false,
        message: 'Phone number, customer, or lead is required',
      });
    }

    // Validate customer
    if (customer) {
      const customerExists = await Customer.findById(customer);

      if (!customerExists) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }
    }

    // Validate lead
    if (lead) {
      const leadExists = await Lead.findById(lead);

      if (!leadExists) {
        return res.status(404).json({
          success: false,
          message: 'Lead not found',
        });
      }
    }

    const call = await Call.create({
      customer: customer || null,
      lead: lead || null,
      phoneNumber: phoneNumber || '',
      direction: direction || 'INCOMING',
      status: status || 'COMPLETED',
      duration: duration || 0,
      summary: summary || '',
      notes: notes || '',
      outcome: outcome || '',
      aiHandled: aiHandled !== undefined ? aiHandled : false,
      recordingUrl: recordingUrl || '',
      startedAt: startedAt || new Date(),
      endedAt: endedAt || null,
    });

    const populatedCall = await Call.findById(call._id)
      .populate('customer', 'name phone email')
      .populate('lead', 'name phone email source');

    res.status(201).json({
      success: true,
      message: 'Call created successfully',
      data: populatedCall,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all calls
// @route   GET /api/calls
// @access  Private
const getCalls = async (req, res, next) => {
  try {
    const { status, direction, customer, lead } = req.query;

    const query = {};

    if (status) query.status = status;
    if (direction) query.direction = direction;
    if (customer) query.customer = customer;
    if (lead) query.lead = lead;

    const calls = await Call.find(query)
      .populate('customer', 'name phone email')
      .populate('lead', 'name phone email source')
      .sort({ startedAt: -1 });

    res.status(200).json({
      success: true,
      count: calls.length,
      data: calls,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single call by ID
// @route   GET /api/calls/:id
// @access  Private
const getCallById = async (req, res, next) => {
  try {
    const call = await Call.findById(req.params.id)
      .populate('customer')
      .populate('lead');

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found',
      });
    }

    res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update call
// @route   PUT /api/calls/:id
// @access  Private
const updateCall = async (req, res, next) => {
  try {
    const call = await Call.findById(req.params.id);

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found',
      });
    }

    const allowedFields = [
      'customer',
      'lead',
      'phoneNumber',
      'direction',
      'status',
      'duration',
      'summary',
      'notes',
      'outcome',
      'aiHandled',
      'recordingUrl',
      'startedAt',
      'endedAt',
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (updateData.customer) {
      const customerExists = await Customer.findById(
        updateData.customer
      );

      if (!customerExists) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }
    }

    if (updateData.lead) {
      const leadExists = await Lead.findById(updateData.lead);

      if (!leadExists) {
        return res.status(404).json({
          success: false,
          message: 'Lead not found',
        });
      }
    }

    const updated = await Call.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate('customer', 'name phone email')
      .populate('lead', 'name phone email source');

    res.status(200).json({
      success: true,
      message: 'Call updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleCallWebhook,
  createCall,
  getCalls,
  getCallById,
  updateCall,
};