const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');
const automationService = require('../services/automationService');

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private
const createLead = async (req, res, next) => {
  try {
    const { name, phone, email, source, service, message, notes, assignedTo } = req.body;

    if (!name || !phone) {
      return res.status(400).json({
        success: false,
        message: 'Lead name and phone number are required',
      });
    }

    let customer = await Customer.findOne({ phone });

    const lead = await Lead.create({
      name,
      phone,
      email: email || '',
      source: source || 'MANUAL',
      service: service || '',
      message: message || '',
      notes: notes || '',
      assignedTo: assignedTo || (req.user ? req.user._id : null),
      customer: customer ? customer._id : null,
    });

    await Notification.create({
      title: 'New Lead Created',
      message: `Lead ${lead.name} added from source ${lead.source}`,
      type: 'NEW_LEAD',
      referenceId: lead._id,
      referenceType: 'Lead',
    });

    await logActivity({
      user: req.user ? req.user._id : null,
      lead: lead._id,
      customer: customer ? customer._id : null,
      action: 'LEAD_CREATED',
      description: `Created lead: ${lead.name} (${lead.phone})`,
    });

    await automationService.onNewLead(lead);

    res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all leads with filtering & search
// @route   GET /api/leads
// @access  Private
const getLeads = async (req, res, next) => {
  try {
    const { status, source, assignedTo, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (source) query.source = source;
    if (assignedTo) query.assignedTo = assignedTo;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { service: { $regex: search, $options: 'i' } },
      ];
    }

    const leads = await Lead.find(query)
      .populate('assignedTo', 'name email phone role')
      .populate('customer', 'name phone email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: leads.length,
      data: leads,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single lead by ID
// @route   GET /api/leads/:id
// @access  Private
const getLeadById = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('assignedTo', 'name email phone role')
      .populate('customer');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update lead
// @route   PUT /api/leads/:id
// @access  Private
const updateLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    const updatedLead = await Lead.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('assignedTo', 'name email phone role');

    await logActivity({
      user: req.user ? req.user._id : null,
      lead: lead._id,
      action: 'LEAD_UPDATED',
      description: `Updated lead details for ${updatedLead.name}`,
    });

    res.status(200).json({
      success: true,
      data: updatedLead,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private
const deleteLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    await Lead.findByIdAndDelete(req.params.id);

    await logActivity({
      user: req.user ? req.user._id : null,
      lead: lead._id,
      action: 'LEAD_DELETED',
      description: `Deleted lead: ${lead.name}`,
    });

    res.status(200).json({
      success: true,
      message: 'Lead removed successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update lead status
// @route   PATCH /api/leads/:id/status
// @access  Private
const updateLeadStatus = async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide status',
      });
    }

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    lead.status = status;
    await lead.save();

    await logActivity({
      user: req.user ? req.user._id : null,
      lead: lead._id,
      action: 'LEAD_STATUS_CHANGED',
      description: `Changed status of lead ${lead.name} to ${status}`,
    });

    res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Assign lead to a staff member
// @route   PATCH /api/leads/:id/assign
// @access  Private
const assignLead = async (req, res, next) => {
  try {
    const { assignedTo } = req.body;

    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    lead.assignedTo = assignedTo || null;
    await lead.save();

    const populatedLead = await Lead.findById(lead._id).populate('assignedTo', 'name email role');

    await logActivity({
      user: req.user ? req.user._id : null,
      lead: lead._id,
      action: 'LEAD_ASSIGNED',
      description: `Assigned lead ${lead.name} to ${populatedLead.assignedTo ? populatedLead.assignedTo.name : 'Unassigned'}`,
    });

    res.status(200).json({
      success: true,
      data: populatedLead,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Convert lead to customer
// @route   POST /api/leads/:id/convert
// @access  Private
const convertLead = async (req, res, next) => {
  try {
    const lead = await Lead.findById(req.params.id);

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }

    let customer = await Customer.findOne({ phone: lead.phone });

    if (!customer) {
      customer = await Customer.create({
        name: lead.name,
        phone: lead.phone,
        email: lead.email || '',
        source: lead.source,
        notes: lead.notes || `Converted from Lead ID: ${lead._id}`,
        status: 'ACTIVE',
      });
    }

    lead.customer = customer._id;
    lead.status = 'BOOKED';
    await lead.save();

    await logActivity({
      user: req.user ? req.user._id : null,
      customer: customer._id,
      lead: lead._id,
      action: 'LEAD_CONVERTED',
      description: `Converted lead ${lead.name} to customer ${customer.name}`,
    });

    res.status(200).json({
      success: true,
      message: 'Lead successfully converted to customer',
      data: {
        lead,
        customer,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  updateLeadStatus,
  assignLead,
  convertLead,
};