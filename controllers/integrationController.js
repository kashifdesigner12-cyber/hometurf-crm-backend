const Integration = require('../models/Integration');

const facebookService = require('../services/facebookService');
const instagramService = require('../services/instagramService');
const googleBusinessService = require('../services/googleBusinessService');
const whatsappService = require('../services/whatsappService');
const smsService = require('../services/smsService');
const clickyService = require('../services/clickyService');

// =====================================================
// HELPERS
// =====================================================

const providerList = [
  'FACEBOOK',
  'INSTAGRAM',
  'GOOGLE_BUSINESS',
  'WHATSAPP',
  'SMS',
  'AI_CALL',
  'CLICKY',
];

const isProviderConfigured = (provider) => {
  return Boolean(
    (provider === 'FACEBOOK' && process.env.FACEBOOK_ACCESS_TOKEN) ||
    (provider === 'INSTAGRAM' && process.env.INSTAGRAM_ACCESS_TOKEN) ||
    (provider === 'GOOGLE_BUSINESS' && process.env.GOOGLE_CLIENT_ID) ||
    (provider === 'WHATSAPP' && process.env.WHATSAPP_ACCESS_TOKEN) ||
    (provider === 'SMS' && process.env.SMS_API_KEY) ||
    (provider === 'AI_CALL' && process.env.AI_CALL_API_KEY) ||
    (provider === 'CLICKY' && process.env.CLICKY_API_KEY)
  );
};

// =====================================================
// GET ALL INTEGRATIONS
// =====================================================

// @desc    Get integration statuses and settings
// @route   GET /api/integrations
// @access  Private/Admin

const getIntegrations = async (req, res, next) => {
  try {
    const integrations = await Integration.find();

    const result = providerList.map((provider) => {
      const existing = integrations.find(
        (integration) => integration.provider === provider
      );

      return {
        provider,
        status: existing ? existing.status : 'INACTIVE',
        lastSyncedAt: existing ? existing.lastSyncedAt : null,
        configured: isProviderConfigured(provider),
      };
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GET SINGLE INTEGRATION
// =====================================================

// @desc    Get integration by provider
// @route   GET /api/integrations/:provider
// @access  Private/Admin

const getIntegrationByProvider = async (req, res, next) => {
  try {
    const provider = req.params.provider.toUpperCase();

    if (!providerList.includes(provider)) {
      return res.status(400).json({
        success: false,
        message: `Invalid integration provider. Allowed providers: ${providerList.join(
          ', '
        )}`,
      });
    }

    const integration = await Integration.findOne({ provider });

    res.status(200).json({
      success: true,
      data: {
        provider,
        status: integration ? integration.status : 'INACTIVE',
        lastSyncedAt: integration ? integration.lastSyncedAt : null,
        configured: isProviderConfigured(provider),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// FACEBOOK WEBHOOK VERIFICATION
// =====================================================

// @desc    Facebook Webhook Verification
// @route   GET /api/integrations/facebook/webhook
// @access  Public

const facebookWebhookVerify = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verification = facebookService.verifyWebhook(
    mode,
    token,
    challenge
  );

  if (verification.verified) {
    return res.status(200).send(verification.challenge);
  }

  return res.status(403).json({
    success: false,
    message: 'Verification token mismatch',
  });
};

// =====================================================
// FACEBOOK WEBHOOK
// =====================================================

// @desc    Facebook Webhook Event Handler
// @route   POST /api/integrations/facebook/webhook
// @access  Public

const facebookWebhookHandler = async (req, res, next) => {
  try {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry || []) {
        // Facebook Lead Ads
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.field === 'leadgen') {
              await facebookService.handleLeadWebhook({
                leadId: change.value.leadgen_id,
                formId: change.value.form_id,
                adId: change.value.ad_id,
                name: change.value.name,
                phone: change.value.phone_number,
                email: change.value.email,
              });
            }
          }
        }

        // Facebook Messenger
        if (entry.messaging) {
          for (const msgEvent of entry.messaging) {
            if (msgEvent.message) {
              await facebookService.handleMessageWebhook({
                senderId: msgEvent.sender
                  ? msgEvent.sender.id
                  : '',
                recipientId: msgEvent.recipient
                  ? msgEvent.recipient.id
                  : '',
                messageText: msgEvent.message.text || '',
                messageId: msgEvent.message.mid || '',
              });
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: 'EVENT_RECEIVED',
      });
    }

    // Manual/test webhook payload
    if (body.name || body.phone) {
      const lead = await facebookService.handleLeadWebhook(body);

      return res.status(200).json({
        success: true,
        data: lead,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'No actionable event found',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// INSTAGRAM WEBHOOK
// =====================================================

// @desc    Instagram Webhook Event Handler
// @route   POST /api/integrations/instagram/webhook
// @access  Public

const instagramWebhookHandler = async (req, res, next) => {
  try {
    const body = req.body;

    if (body.object === 'instagram') {
      for (const entry of body.entry || []) {
        if (entry.messaging) {
          for (const msgEvent of entry.messaging) {
            if (msgEvent.message) {
              await instagramService.handleMessageWebhook({
                igUserId: msgEvent.sender
                  ? msgEvent.sender.id
                  : '',
                username: msgEvent.sender
                  ? msgEvent.sender.username
                  : '',
                messageText: msgEvent.message.text || '',
                messageId: msgEvent.message.mid || '',
              });
            }
          }
        }
      }

      return res.status(200).json({
        success: true,
        message: 'EVENT_RECEIVED',
      });
    }

    // Manual/test webhook payload
    if (body.igUserId || body.messageText) {
      const result = await instagramService.handleMessageWebhook(body);

      return res.status(200).json({
        success: true,
        data: result,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Processed',
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// GOOGLE BUSINESS REVIEW SYNC
// =====================================================

// @desc    Google Business Review Sync
// @route   POST /api/integrations/google-business/sync
// @access  Private/Admin

const syncGoogleReviews = async (req, res, next) => {
  try {
    const { reviews = [] } = req.body;

    const synced = await googleBusinessService.syncReviews(reviews);

    await Integration.findOneAndUpdate(
      { provider: 'GOOGLE_BUSINESS' },
      {
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );

    res.status(200).json({
      success: true,
      message: 'Google Business reviews synced successfully',
      count: synced.length,
      data: synced,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// WHATSAPP WEBHOOK
// =====================================================

// @desc    WhatsApp Inbound Webhook
// @route   POST /api/integrations/whatsapp/webhook
// @access  Public

const whatsappWebhookHandler = async (req, res, next) => {
  try {
    const result = await whatsappService.receiveWebhook(req.body);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// SMS WEBHOOK
// =====================================================

// @desc    SMS Inbound Webhook
// @route   POST /api/integrations/sms/webhook
// @access  Public

const smsWebhookHandler = async (req, res, next) => {
  try {
    const result = await smsService.receiveWebhook(req.body);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// CLICKY REVIEW SYNC
// =====================================================

// @desc    Clicky Reviews Sync
// @route   POST /api/integrations/clicky/sync
// @access  Private/Admin

const syncClickyReviews = async (req, res, next) => {
  try {
    const { reviews = [] } = req.body;

    const synced = await clickyService.syncReviews(reviews);

    await Integration.findOneAndUpdate(
      { provider: 'CLICKY' },
      {
        status: 'ACTIVE',
        lastSyncedAt: new Date(),
      },
      {
        upsert: true,
        new: true,
      }
    );

    res.status(200).json({
      success: true,
      message: 'Clicky reviews synced successfully',
      count: synced.length,
      data: synced,
    });
  } catch (error) {
    next(error);
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getIntegrations,
  getIntegrationByProvider,
  facebookWebhookVerify,
  facebookWebhookHandler,
  instagramWebhookHandler,
  syncGoogleReviews,
  whatsappWebhookHandler,
  smsWebhookHandler,
  syncClickyReviews,
};