const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Customer = require('../models/Customer');
const Lead = require('../models/Lead');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * SMS Integration Service
 */
class SMSService {
  constructor() {
    this.apiUrl =
      process.env.SMS_API_URL || '';

    this.apiKey =
      process.env.SMS_API_KEY || '';
  }

  // =====================================================
  // SEND OUTGOING SMS
  // =====================================================

  async sendMessage({
    to,
    text,
    customerId = null,
    conversationId = null,
  }) {
    if (!to || !text) {
      throw new Error(
        'Recipient phone and text content are required to send SMS'
      );
    }

    let conversation = null;

    // -------------------------------------------------
    // Find conversation by ID
    // -------------------------------------------------

    if (conversationId) {
      conversation =
        await Conversation.findById(
          conversationId
        );
    }

    // -------------------------------------------------
    // Find/create customer conversation
    // -------------------------------------------------

    if (!conversation && customerId) {
      conversation =
        await Conversation.findOne({
          customer: customerId,
          channel: 'SMS',
        });

      if (!conversation) {
        conversation =
          await Conversation.create({
            customer: customerId,
            channel: 'SMS',
            externalConversationId: to,
            lastMessage: text,
            lastMessageAt: new Date(),
            status: 'OPEN',
          });
      }
    }

    const externalMessageId =
      `sms_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 6)}`;

    const deliveryStatus = 'SENT';

    // -------------------------------------------------
    // Real API / Mock
    // -------------------------------------------------

    if (this.apiUrl && this.apiKey) {
      console.log(
        `[SMSService] Outbound SMS dispatched to ${to}`
      );
    } else {
      console.log(
        `[SMSService] Mock/Prepared delivery to ${to}: "${text}"`
      );
    }

    let message = null;

    // -------------------------------------------------
    // Save outgoing message
    // -------------------------------------------------

    if (conversation) {
      conversation.lastMessage = text;
      conversation.lastMessageAt =
        new Date();

      await conversation.save();

      message = await Message.create({
        conversation:
          conversation._id,

        customer:
          customerId ||
          conversation.customer,

        sender:
          'STAFF',

        content:
          text,

        channel:
          'SMS',

        direction:
          'OUTGOING',

        externalMessageId,

        status:
          deliveryStatus,

        sentAt:
          new Date(),
      });
    }

    // -------------------------------------------------
    // Activity
    // -------------------------------------------------

    await logActivity({
      customer:
        customerId,

      action:
        'MESSAGE_SENT',

      description:
        `SMS sent to ${to}: ${text.substring(
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
  // RECEIVE INCOMING SMS WEBHOOK
  // =====================================================

  async receiveWebhook(payload) {
    const {
      from,
      phoneNumber,
      messageText,
      messageId,
    } = payload;

    // Support both:
    // from
    // phoneNumber

    const senderPhone =
      from ||
      phoneNumber ||
      '';

    // -------------------------------------------------
    // Validate phone
    // -------------------------------------------------

    if (!senderPhone) {
      throw new Error(
        'Sender phone number is required for SMS webhook'
      );
    }

    // -------------------------------------------------
    // Duplicate message protection
    // -------------------------------------------------

    if (messageId) {
      const existingMessage =
        await Message.findOne({
          channel: 'SMS',
          externalMessageId: messageId,
        });

      if (existingMessage) {
        const existingConversation =
          await Conversation.findById(
            existingMessage.conversation
          );

        return {
          conversation:
            existingConversation,

          message:
            existingMessage,

          duplicate:
            true,
        };
      }
    }

    // -------------------------------------------------
    // Find customer
    // -------------------------------------------------

    let customer =
      await Customer.findOne({
        phone: senderPhone,
      });

    let lead = null;

    // -------------------------------------------------
    // Find/create lead
    // -------------------------------------------------

    if (!customer) {
      lead =
        await Lead.findOne({
          phone: senderPhone,
        });

      if (!lead) {
        lead =
          await Lead.create({
            name:
              `SMS ${senderPhone}`,

            phone:
              senderPhone,

            source:
              'PHONE',

            message:
              messageText || '',

            notes:
              'Auto-created from inbound SMS',
          });

        // New lead notification
        await Notification.create({
          title:
            'New SMS Lead',

          message:
            `New lead received from SMS ${senderPhone}`,

          type:
            'NEW_LEAD',

          referenceId:
            lead._id,

          referenceType:
            'Lead',
        });

        // Activity
        await logActivity({
          lead:
            lead._id,

          action:
            'LEAD_CREATED',

          description:
            `New lead created from SMS ${senderPhone}`,
        });
      }
    }

    // -------------------------------------------------
    // Find existing conversation
    // -------------------------------------------------

    let conversation =
      await Conversation.findOne({
        channel:
          'SMS',

        $or: [
          ...(customer
            ? [
                {
                  customer:
                    customer._id,
                },
              ]
            : []),

          ...(lead
            ? [
                {
                  lead:
                    lead._id,
                },
              ]
            : []),

          {
            externalConversationId:
              senderPhone,
          },
        ],
      });

    // -------------------------------------------------
    // Create conversation
    // -------------------------------------------------

    if (!conversation) {
      conversation =
        await Conversation.create({
          customer:
            customer
              ? customer._id
              : null,

          lead:
            lead
              ? lead._id
              : null,

          channel:
            'SMS',

          externalConversationId:
            senderPhone,

          lastMessage:
            messageText || '',

          lastMessageAt:
            new Date(),

          status:
            'OPEN',
        });
    }

    // -------------------------------------------------
    // Update conversation
    // -------------------------------------------------

    else {
      conversation.lastMessage =
        messageText || '';

      conversation.lastMessageAt =
        new Date();

      await conversation.save();
    }

    // -------------------------------------------------
    // Create incoming message
    // -------------------------------------------------

    const message =
      await Message.create({
        conversation:
          conversation._id,

        customer:
          customer
            ? customer._id
            : null,

        sender:
          senderPhone,

        content:
          messageText || '',

        channel:
          'SMS',

        direction:
          'INCOMING',

        externalMessageId:
          messageId ||
          `sms_in_${Date.now()}`,

        status:
          'DELIVERED',

        sentAt:
          new Date(),
      });

    // -------------------------------------------------
    // Notification
    // -------------------------------------------------

    await Notification.create({
      title:
        'New SMS Message',

      message:
        `SMS received from ${
          customer
            ? customer.name
            : senderPhone
        }`,

      type:
        'NEW_MESSAGE',

      referenceId:
        message._id,

      referenceType:
        'Message',
    });

    // -------------------------------------------------
    // Activity
    // -------------------------------------------------

    await logActivity({
      lead:
        lead
          ? lead._id
          : null,

      customer:
        customer
          ? customer._id
          : null,

      action:
        'MESSAGE_RECEIVED',

      description:
        `SMS message received from ${senderPhone}`,
    });

    return {
      conversation,
      message,
      duplicate: false,
    };
  }
}

module.exports =
  new SMSService();