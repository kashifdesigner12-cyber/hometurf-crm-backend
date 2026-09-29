const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * Instagram Integration Service
 */
class InstagramService {
  constructor() {
    this.accessToken =
      process.env.INSTAGRAM_ACCESS_TOKEN || '';
  }

  // =====================================================
  // INSTAGRAM MESSAGE WEBHOOK
  // =====================================================

  async handleMessageWebhook(payload) {
    const {
      igUserId,
      username,
      messageText,
      messageId,
    } = payload;

    if (!igUserId) {
      throw new Error(
        'Instagram user ID is required'
      );
    }

    // -------------------------------------------------
    // Check duplicate message
    // -------------------------------------------------

    if (messageId) {
      const existingMessage =
        await Message.findOne({
          channel: 'INSTAGRAM',
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
    // Find existing conversation
    // -------------------------------------------------

    let conversation =
      await Conversation.findOne({
        channel: 'INSTAGRAM',
        externalConversationId: igUserId,
      });

    let customer = null;
    let lead = null;

    // =================================================
    // NEW CONVERSATION
    // =================================================

    if (!conversation) {
      const leadName = username
        ? `@${username}`
        : `IG User ${igUserId}`;

      lead = await Lead.findOne({
        source: 'INSTAGRAM',
        name: leadName,
      });

      // -------------------------------------------------
      // Create lead if not found
      // -------------------------------------------------

      if (!lead) {
        lead = await Lead.create({
          name: leadName,
          phone: 'N/A',
          source: 'INSTAGRAM',
          message: messageText || '',
          notes:
            `Auto-created from Instagram DM sender ID: ${igUserId}`,
        });

        // New lead notification
        await Notification.create({
          title: 'New Instagram Lead',
          message:
            `New lead received from Instagram ${
              username ? `@${username}` : igUserId
            }`,
          type: 'NEW_LEAD',
          referenceId: lead._id,
          referenceType: 'Lead',
        });

        // Activity
        await logActivity({
          lead: lead._id,
          action: 'LEAD_CREATED',
          description:
            `New lead created from Instagram: ${
              username || igUserId
            }`,
        });
      }

      // -------------------------------------------------
      // Create conversation
      // -------------------------------------------------

      conversation =
        await Conversation.create({
          lead: lead._id,
          channel: 'INSTAGRAM',
          externalConversationId: igUserId,
          lastMessage: messageText || '',
          lastMessageAt: new Date(),
          status: 'OPEN',
        });
    }

    // =================================================
    // EXISTING CONVERSATION
    // =================================================

    else {
      customer = conversation.customer;
      lead = conversation.lead;

      conversation.lastMessage =
        messageText || '';

      conversation.lastMessageAt =
        new Date();

      await conversation.save();
    }

    // -------------------------------------------------
    // Create incoming message
    // -------------------------------------------------

    const message = await Message.create({
      conversation: conversation._id,
      customer: customer || null,
      sender: username
        ? `@${username}`
        : `IG:${igUserId}`,
      content: messageText || '',
      channel: 'INSTAGRAM',
      direction: 'INCOMING',
      externalMessageId: messageId || '',
      status: 'DELIVERED',
      sentAt: new Date(),
    });

    // -------------------------------------------------
    // New message notification
    // -------------------------------------------------

    await Notification.create({
      title: 'New Instagram Message',
      message:
        `Message received from Instagram: ${
          username ? `@${username}` : igUserId
        }`,
      type: 'NEW_MESSAGE',
      referenceId: message._id,
      referenceType: 'Message',
    });

    // -------------------------------------------------
    // Activity log
    // -------------------------------------------------

    await logActivity({
      lead: lead ? lead._id : null,
      customer: customer ? customer._id : null,
      action: 'MESSAGE_RECEIVED',
      description:
        `Instagram DM from ${
          username || igUserId
        }`,
    });

    return {
      conversation,
      message,
      duplicate: false,
    };
  }
}

module.exports = new InstagramService();