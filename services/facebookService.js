const Lead = require('../models/Lead');
const Customer = require('../models/Customer');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const logActivity = require('../utils/activityLogger');

/**
 * Facebook Integration Service
 */
class FacebookService {
  constructor() {
    this.appId = process.env.FACEBOOK_APP_ID || '';
    this.appSecret = process.env.FACEBOOK_APP_SECRET || '';
    this.accessToken = process.env.FACEBOOK_ACCESS_TOKEN || '';
    this.verifyToken =
      process.env.FACEBOOK_VERIFY_TOKEN || 'HOMETURF_FB_VERIFY_TOKEN';
  }

  // =====================================================
  // FACEBOOK WEBHOOK VERIFICATION
  // =====================================================

  verifyWebhook(mode, token, challenge) {
    if (
      mode === 'subscribe' &&
      token &&
      token === this.verifyToken
    ) {
      return {
        verified: true,
        challenge,
      };
    }

    return {
      verified: false,
    };
  }

  // =====================================================
  // FIND FACEBOOK LEAD
  // =====================================================

  async findExistingLead({
    leadId,
    phone,
    email,
  }) {
    let lead = null;

    // -------------------------------------------------
    // 1. Facebook Lead ID
    // -------------------------------------------------

    if (leadId) {
      lead = await Lead.findOne({
        source: 'FACEBOOK',
        $or: [
          { externalLeadId: leadId },
          { 'metadata.leadId': leadId },
        ],
      });
    }

    // -------------------------------------------------
    // 2. Phone
    // -------------------------------------------------

    if (!lead && phone) {
      lead = await Lead.findOne({
        source: 'FACEBOOK',
        phone,
      });
    }

    // -------------------------------------------------
    // 3. Email
    // -------------------------------------------------

    if (!lead && email) {
      lead = await Lead.findOne({
        source: 'FACEBOOK',
        email: email.toLowerCase().trim(),
      });
    }

    return lead;
  }

  // =====================================================
  // FACEBOOK LEAD WEBHOOK
  // =====================================================

  async handleLeadWebhook(leadData) {
    const {
      name,
      phone,
      email,
      formId,
      leadId,
      adId,
      message,
    } = leadData;

    const normalizedPhone = phone
      ? String(phone).trim()
      : '';

    const normalizedEmail = email
      ? String(email).trim().toLowerCase()
      : '';

    // -------------------------------------------------
    // Find existing customer
    // -------------------------------------------------

    let customer = null;

    if (normalizedPhone) {
      customer = await Customer.findOne({
        phone: normalizedPhone,
      });
    }

    if (!customer && normalizedEmail) {
      customer = await Customer.findOne({
        email: normalizedEmail,
      });
    }

    // -------------------------------------------------
    // Find existing Facebook lead
    // -------------------------------------------------

    let lead = await this.findExistingLead({
      leadId,
      phone: normalizedPhone,
      email: normalizedEmail,
    });

    // =================================================
    // EXISTING LEAD
    // =================================================

    if (lead) {
      if (name) {
        lead.name = name;
      }

      if (normalizedPhone) {
        lead.phone = normalizedPhone;
      }

      if (normalizedEmail) {
        lead.email = normalizedEmail;
      }

      if (message) {
        lead.message = message;
      }

      if (customer) {
        lead.customer = customer._id;
      }

      if (leadId) {
        // Only assign if schema supports the field.
        lead.externalLeadId = leadId;
      }

      if (adId) {
        lead.notes = `Captured via Facebook Ad: ${adId}`;
      }

      await lead.save();

      return lead;
    }

    // =================================================
    // NEW LEAD
    // =================================================

    const leadDataToCreate = {
      name: name || 'Facebook Lead',
      phone: normalizedPhone || 'N/A',
      email: normalizedEmail,
      source: 'FACEBOOK',
      message:
        message ||
        `Facebook Lead Ad (Form: ${
          formId || 'N/A'
        }, Lead: ${leadId || 'N/A'})`,
      customer: customer ? customer._id : null,
      notes: `Captured via Facebook Ad: ${
        adId || 'Direct'
      }`,
    };

    // Add externalLeadId only when Facebook provides it.
    if (leadId) {
      leadDataToCreate.externalLeadId = leadId;
    }

    lead = await Lead.create(leadDataToCreate);

    // -------------------------------------------------
    // Notification only for NEW lead
    // -------------------------------------------------

    await Notification.create({
      title: 'New Facebook Lead',
      message: `Received lead from ${lead.name} via Facebook`,
      type: 'NEW_LEAD',
      referenceId: lead._id,
      referenceType: 'Lead',
    });

    // -------------------------------------------------
    // Activity log
    // -------------------------------------------------

    await logActivity({
      lead: lead._id,
      customer: customer ? customer._id : null,
      action: 'LEAD_CREATED',
      description: `New lead created from Facebook Ad: ${lead.name}`,
    });

    return lead;
  }

  // =====================================================
  // FACEBOOK MESSENGER WEBHOOK
  // =====================================================

  async handleMessageWebhook(payload) {
    const {
      senderId,
      recipientId,
      messageText,
      messageId,
    } = payload;

    if (!senderId) {
      throw new Error(
        'Facebook sender ID is required'
      );
    }

    // -------------------------------------------------
    // Check duplicate message
    // -------------------------------------------------

    if (messageId) {
      const existingMessage =
        await Message.findOne({
          channel: 'FACEBOOK',
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
        channel: 'FACEBOOK',
        externalConversationId: senderId,
      });

    let customer = null;
    let lead = null;

    // =================================================
    // NEW CONVERSATION
    // =================================================

    if (!conversation) {
      lead = await Lead.findOne({
        source: 'FACEBOOK',
        name: `FB User ${senderId}`,
      });

      if (!lead) {
        lead = await Lead.create({
          name: `FB User ${senderId}`,
          phone: 'N/A',
          source: 'FACEBOOK',
          message: messageText || '',
          notes:
            `Auto-created from Facebook Messenger sender ID: ${senderId}`,
        });

        await Notification.create({
          title: 'New Facebook Lead',
          message:
            `New Messenger lead created from Facebook sender ${senderId}`,
          type: 'NEW_LEAD',
          referenceId: lead._id,
          referenceType: 'Lead',
        });

        await logActivity({
          lead: lead._id,
          action: 'LEAD_CREATED',
          description:
            `New lead created from Facebook Messenger sender ${senderId}`,
        });
      }

      conversation =
        await Conversation.create({
          lead: lead._id,
          channel: 'FACEBOOK',
          externalConversationId: senderId,
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
      sender: `FB:${senderId}`,
      content: messageText || '',
      channel: 'FACEBOOK',
      direction: 'INCOMING',
      externalMessageId: messageId || '',
      status: 'DELIVERED',
      sentAt: new Date(),
    });

    // -------------------------------------------------
    // Message notification
    // -------------------------------------------------

    await Notification.create({
      title: 'New Facebook Message',
      message:
        `Message received from Facebook Messenger sender ${senderId}`,
      type: 'NEW_MESSAGE',
      referenceId: message._id,
      referenceType: 'Message',
    });

    return {
      conversation,
      message,
      duplicate: false,
    };
  }
}

module.exports = new FacebookService();