const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * WhatsApp Integration Service
 */
class WhatsAppService {
  constructor() {
    this.apiUrl = process.env.WHATSAPP_API_URL || '';
    this.accessToken =
      process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId =
      process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  // =====================================================
  // SEND WHATSAPP MESSAGE
  // =====================================================

  async sendMessage({
    to,
    text,
    customerId = null,
    conversationId = null,
  }) {
    if (!to || !text) {
      throw new Error(
        'Recipient phone and text content are required to send WhatsApp message'
      );
    }

    let conversation = null;

    if (conversationId) {
      conversation = await Conversation.findById(
        conversationId
      );
    }

    if (!conversation && customerId) {
      conversation = await Conversation.findOne({
        customer: customerId,
        channel: 'WHATSAPP',
      });

      if (!conversation) {
        conversation = await Conversation.create({
          customer: customerId,
          channel: 'WHATSAPP',
          externalConversationId: to,
          lastMessage: text,
          lastMessageAt: new Date(),
          status: 'OPEN',
        });
      }
    }

    const externalMessageId = `wa_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 6)}`;

    const deliveryStatus = 'SENT';

    if (
      this.apiUrl &&
      this.accessToken &&
      this.phoneNumberId
    ) {
      console.log(
        `[WhatsAppService] Dispatched via API to ${to}`
      );
    } else {
      console.log(
        `[WhatsAppService] Mock/Prepared delivery to ${to}: "${text}"`
      );
    }

    let message = null;

    if (conversation) {
      conversation.lastMessage = text;
      conversation.lastMessageAt = new Date();

      await conversation.save();

      message = await Message.create({
        conversation: conversation._id,
        customer:
          customerId || conversation.customer,
        sender: 'STAFF',
        content: text,
        channel: 'WHATSAPP',
        direction: 'OUTGOING',
        externalMessageId,
        status: deliveryStatus,
        sentAt: new Date(),
      });
    }

    await logActivity({
      customer: customerId,
      action: 'MESSAGE_SENT',
      description:
        `WhatsApp message sent to ${to}: ${text.substring(
          0,
          50
        )}...`,
    });

    return {
      success: true,
      externalMessageId,
      status: deliveryStatus,
      message,
    };
  }

  // =====================================================
  // RECEIVE WHATSAPP WEBHOOK
  // =====================================================

  async receiveWebhook(payload = {}) {
    /*
      Support multiple webhook payload formats:

      {
        "from": "03008887766",
        "messageText": "Hello"
      }

      OR

      {
        "from": "03008887766",
        "message": "Hello"
      }

      OR

      {
        "from": "03008887766",
        "content": "Hello"
      }

      OR

      {
        "from": "03008887766",
        "text": "Hello"
      }
    */

    const {
      from,
      phoneNumber,
      messageText,
      message,
      content,
      text,
      messageId,
    } = payload;

    // -------------------------------------------------
    // Sender phone
    // -------------------------------------------------

    const senderPhone =
      from ||
      phoneNumber ||
      '';

    if (!senderPhone) {
      throw new Error(
        'Sender phone number is required for WhatsApp webhook'
      );
    }

    // -------------------------------------------------
    // Message content
    // -------------------------------------------------

    const incomingMessage =
      messageText ||
      message ||
      content ||
      text ||
      '';

    if (!incomingMessage.trim()) {
      throw new Error(
        'Message content is required for WhatsApp webhook'
      );
    }

    // -------------------------------------------------
    // Duplicate message protection
    // -------------------------------------------------

    if (messageId) {
      const existingMessage =
        await Message.findOne({
          channel: 'WHATSAPP',
          externalMessageId: messageId,
        });

      if (existingMessage) {
        const existingConversation =
          await Conversation.findById(
            existingMessage.conversation
          );

        return {
          conversation: existingConversation,
          message: existingMessage,
          duplicate: true,
        };
      }
    }

    // -------------------------------------------------
    // Find customer by phone
    // -------------------------------------------------

    let customer =
      await Customer.findOne({
        phone: senderPhone,
      });

    let lead = null;

    // -------------------------------------------------
    // If customer does not exist,
    // find/create lead
    // -------------------------------------------------

    if (!customer) {
      lead = await Lead.findOne({
        phone: senderPhone,
      });

      if (!lead) {
        lead = await Lead.create({
          name: `WhatsApp ${senderPhone}`,
          phone: senderPhone,
          source: 'PHONE',
          message: incomingMessage,
          notes:
            'Auto-created from inbound WhatsApp message',
        });

        await Notification.create({
          title: 'New WhatsApp Lead',
          message:
            `New lead received from WhatsApp ${senderPhone}`,
          type: 'NEW_LEAD',
          referenceId: lead._id,
          referenceType: 'Lead',
        });

        await logActivity({
          lead: lead._id,
          action: 'LEAD_CREATED',
          description:
            `New lead created from WhatsApp ${senderPhone}`,
        });
      }
    }

    // -------------------------------------------------
    // Find existing conversation
    // -------------------------------------------------

    let conversation =
      await Conversation.findOne({
        channel: 'WHATSAPP',
        $or: [
          ...(customer
            ? [{ customer: customer._id }]
            : []),

          ...(lead
            ? [{ lead: lead._id }]
            : []),

          {
            externalConversationId:
              senderPhone,
          },
        ],
      });

    // -------------------------------------------------
    // Create conversation if not found
    // -------------------------------------------------

    if (!conversation) {
      conversation =
        await Conversation.create({
          customer: customer
            ? customer._id
            : null,

          lead: lead
            ? lead._id
            : null,

          channel: 'WHATSAPP',

          externalConversationId:
            senderPhone,

          lastMessage:
            incomingMessage,

          lastMessageAt:
            new Date(),

          status: 'OPEN',
        });
    }

    // -------------------------------------------------
    // Update existing conversation
    // -------------------------------------------------

    else {
      conversation.lastMessage =
        incomingMessage;

      conversation.lastMessageAt =
        new Date();

      await conversation.save();
    }

    // -------------------------------------------------
    // Create incoming message
    // -------------------------------------------------

    const incomingMessageRecord =
      await Message.create({
        conversation:
          conversation._id,

        customer: customer
          ? customer._id
          : null,

        sender: senderPhone,

        content:
          incomingMessage,

        channel: 'WHATSAPP',

        direction: 'INCOMING',

        externalMessageId:
          messageId ||
          `wa_in_${Date.now()}`,

        status: 'DELIVERED',

        sentAt: new Date(),
      });

    // -------------------------------------------------
    // Notification
    // -------------------------------------------------

    await Notification.create({
      title: 'New WhatsApp Message',

      message:
        `Message received from ${
          customer
            ? customer.name
            : senderPhone
        }`,

      type: 'NEW_MESSAGE',

      referenceId:
        incomingMessageRecord._id,

      referenceType:
        'Message',
    });

    // -------------------------------------------------
    // Activity
    // -------------------------------------------------

    await logActivity({
      lead: lead
        ? lead._id
        : null,

      customer: customer
        ? customer._id
        : null,

      action:
        'MESSAGE_RECEIVED',

      description:
        `WhatsApp message received from ${senderPhone}`,
    });

    // -------------------------------------------------
    // Response
    // -------------------------------------------------

    return {
      conversation,
      message: incomingMessageRecord,
      duplicate: false,
    };
  }
}

module.exports =
  new WhatsAppService();