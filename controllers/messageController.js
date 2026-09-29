const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Customer = require('../models/Customer');
const whatsappService = require('../services/whatsappService');
const smsService = require('../services/smsService');
const logActivity = require('../utils/activityLogger');

// @desc    Get all messages for a specific conversation
// @route   GET /api/messages/conversation/:conversationId
// @access  Private
const getMessagesByConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    const conversation =
      await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    const messages = await Message.find({
      conversation: conversationId,
    }).sort({ sentAt: 1 });

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send outgoing message via selected channel
// @route   POST /api/messages/send
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const {
      conversationId,
      conversation,

      customerId,
      customer,

      channel,
      content,
      text,

      recipientPhone,
      phone,
      to,
    } = req.body;

    // -------------------------------------------------
    // Message content
    // -------------------------------------------------

    const messageContent = content || text;

    if (!messageContent) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required',
      });
    }

    // -------------------------------------------------
    // Resolve IDs
    // -------------------------------------------------

    const resolvedConversationId =
      conversationId || conversation || null;

    const resolvedCustomerId =
      customerId || customer || null;

    let conversationDoc = null;
    let customerDoc = null;

    let phoneToUse =
      recipientPhone ||
      phone ||
      to ||
      '';

    // -------------------------------------------------
    // Find conversation
    // -------------------------------------------------

    if (resolvedConversationId) {
      conversationDoc =
        await Conversation.findById(
          resolvedConversationId
        ).populate('customer');

      if (!conversationDoc) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found',
        });
      }

      if (conversationDoc.customer) {
        customerDoc =
          conversationDoc.customer;

        phoneToUse =
          phoneToUse ||
          customerDoc.phone;
      }
    }

    // -------------------------------------------------
    // Find customer
    // -------------------------------------------------

    if (!customerDoc && resolvedCustomerId) {
      customerDoc =
        await Customer.findById(
          resolvedCustomerId
        );

      if (!customerDoc) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found',
        });
      }

      phoneToUse =
        phoneToUse ||
        customerDoc.phone;
    }

    // -------------------------------------------------
    // Determine channel
    // -------------------------------------------------

    const msgChannel = (
      channel ||
      (conversationDoc
        ? conversationDoc.channel
        : 'SMS')
    ).toUpperCase();

    // =================================================
    // WHATSAPP
    // =================================================

    if (msgChannel === 'WHATSAPP') {
      if (!phoneToUse) {
        return res.status(400).json({
          success: false,
          message:
            'Recipient phone number is required for WhatsApp message',
        });
      }

      const dispatchResult =
        await whatsappService.sendMessage({
          to: phoneToUse,
          text: messageContent,
          customerId: customerDoc
            ? customerDoc._id
            : null,
          conversationId:
            conversationDoc
              ? conversationDoc._id
              : null,
        });

      await logActivity({
        user: req.user
          ? req.user._id
          : null,

        customer: customerDoc
          ? customerDoc._id
          : null,

        action: 'MESSAGE_SENT',

        description:
          `Sent WHATSAPP message to ${
            customerDoc
              ? customerDoc.name
              : phoneToUse
          }`,
      });

      return res.status(200).json({
        success: true,
        data: dispatchResult.message,
      });
    }

    // =================================================
    // SMS
    // =================================================

    if (msgChannel === 'SMS') {
      if (!phoneToUse) {
        return res.status(400).json({
          success: false,
          message:
            'Recipient phone number is required for SMS message',
        });
      }

      const dispatchResult =
        await smsService.sendMessage({
          to: phoneToUse,
          text: messageContent,
          customerId: customerDoc
            ? customerDoc._id
            : null,
          conversationId:
            conversationDoc
              ? conversationDoc._id
              : null,
        });

      await logActivity({
        user: req.user
          ? req.user._id
          : null,

        customer: customerDoc
          ? customerDoc._id
          : null,

        action: 'MESSAGE_SENT',

        description:
          `Sent SMS message to ${
            customerDoc
              ? customerDoc.name
              : phoneToUse
          }`,
      });

      return res.status(200).json({
        success: true,
        data: dispatchResult.message,
      });
    }

    // =================================================
    // OTHER CHANNELS
    // =================================================

    if (!conversationDoc) {
      conversationDoc =
        await Conversation.create({
          customer: customerDoc
            ? customerDoc._id
            : null,

          channel: msgChannel,

          externalConversationId:
            phoneToUse || '',

          lastMessage:
            messageContent,

          lastMessageAt:
            new Date(),

          status: 'OPEN',
        });
    } else {
      conversationDoc.lastMessage =
        messageContent;

      conversationDoc.lastMessageAt =
        new Date();

      await conversationDoc.save();
    }

    const msg =
      await Message.create({
        conversation:
          conversationDoc._id,

        customer: customerDoc
          ? customerDoc._id
          : null,

        sender:
          req.user
            ? req.user.name
            : 'STAFF',

        content:
          messageContent,

        channel:
          msgChannel,

        direction:
          'OUTGOING',

        status:
          'SENT',

        sentAt:
          new Date(),
      });

    await logActivity({
      user: req.user
        ? req.user._id
        : null,

      customer: customerDoc
        ? customerDoc._id
        : null,

      action:
        'MESSAGE_SENT',

      description:
        `Sent ${msgChannel} message to ${
          customerDoc
            ? customerDoc.name
            : phoneToUse
        }`,
    });

    return res.status(200).json({
      success: true,
      data: msg,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMessagesByConversation,
  sendMessage,
};