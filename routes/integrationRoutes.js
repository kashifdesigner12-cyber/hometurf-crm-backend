const express = require('express');

const router = express.Router();

const {
  getIntegrations,
  getIntegrationByProvider,
  facebookWebhookVerify,
  facebookWebhookHandler,
  instagramWebhookHandler,
  syncGoogleReviews,
  whatsappWebhookHandler,
  smsWebhookHandler,
  syncClickyReviews,
} = require('../controllers/integrationController');

const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

// =====================================================
// PUBLIC WEBHOOKS
// =====================================================

// Facebook Webhook Verification
router
  .route('/facebook/webhook')
  .get(facebookWebhookVerify)
  .post(facebookWebhookHandler);

// Instagram Webhook
router.post('/instagram/webhook', instagramWebhookHandler);

// WhatsApp Webhook
router.post('/whatsapp/webhook', whatsappWebhookHandler);

// SMS Webhook
router.post('/sms/webhook', smsWebhookHandler);

// =====================================================
// ADMIN-ONLY INTEGRATIONS
// =====================================================

// Get all integrations
router.get(
  '/',
  protect,
  authorize('ADMIN'),
  getIntegrations
);

// Get single integration by provider
router.get(
  '/:provider',
  protect,
  authorize('ADMIN'),
  getIntegrationByProvider
);

// Google Business Reviews Sync
router.post(
  '/google-business/sync',
  protect,
  authorize('ADMIN'),
  syncGoogleReviews
);

// Clicky Reviews Sync
router.post(
  '/clicky/sync',
  protect,
  authorize('ADMIN'),
  syncClickyReviews
);

module.exports = router;