const Conversation = require('../models/Conversation');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');

// @desc    Get all conversations
// @route   GET /api/conversations
// @access  Private
const getConversations = async (req, res, next) => {
  try {
    const { channel, status, customer, lead } = req.query;
    const query = {};

    if (channel) query.channel = channel;
    if (status) query.status = status;
    if (customer) query.customer = customer;
    if (lead) query.lead = lead;

    const conversations = await Conversation.find(query)
      .populate('customer', 'name phone email')
      .populate('lead', 'name phone email source')
      .sort({ lastMessageAt: -1 });

    res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single conversation by ID
// @route   GET /api/conversations/:id
// @access  Private
const getConversationById = async (req, res, next) => {
  try {
    const conversation = await Conversation.findById(req.params.id)
      .populate('customer')
      .populate('lead');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    res.status(200).json({
      success: true,
      data: conversation,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new conversation
// @route   POST /api/conversations
// @access  Private
const createConversation = async (req, res, next) => {
  try {
    const { customer, lead, channel, externalConversationId } = req.body;

    if (!channel) {
      return res.status(400).json({
        success: false,
        message: 'Channel is required to create a conversation',
      });
    }

    if (!customer && !lead) {
      return res.status(400).json({
        success: false,
        message: 'A conversation must be linked to either a customer or a lead',
      });
    }

    const conversation = await Conversation.create({
      customer: customer || null,
      lead: lead || null,
      channel,
      externalConversationId: externalConversationId || '',
      lastMessage: '',
      lastMessageAt: new Date(),
      status: 'OPEN',
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('customer', 'name phone email')
      .populate('lead', 'name phone');

    res.status(201).json({
      success: true,
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConversations,
  getConversationById,
  createConversation,
};