const express = require('express');

const {
  handleIncomingEmail,
  handleResendWebhook,
  getEmailConversations,
  getEmailConversationById,
  sendManualEmailReply,
  saveGoogleTokens,
  deleteEmailConversation,
} = require('../controllers/emailController');

const { sendEmail } = require('../services/emailService');

const {
  getGoogleAuthUrl,
  getGoogleTokens,
} = require('../services/googleAuthService');

const {
  syncGmailInbox,
} = require('../services/gmailService');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Test Email
|--------------------------------------------------------------------------
| POST /api/emails/test-send
*/

router.post('/test-send', async (req, res) => {
  try {
    const recipient =
      req.body?.to ||
      process.env.EMAIL_INBOX;

    const result = await sendEmail({
      to: recipient,
      subject: 'HomeTurf CRM - Email Test',
      text: `Hello,

This is a test email from the HomeTurf CRM backend.

If you received this email, the Resend email integration is working successfully.

HomeTurf CRM Team`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #5E52B7;">HomeTurf CRM - Email Test</h2>
          <p>Hello,</p>
          <p>This is a test email from the HomeTurf CRM backend.</p>
          <p>If you received this email, the Resend email integration is working successfully.</p>
          <p><strong>HomeTurf CRM Team</strong></p>
        </div>
      `,
      autoReplyType: 'GENERAL_REPLY',
    });

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully.',
      data: {
        recipient,
        providerMessageId: result.messageId,
      },
    });
  } catch (error) {
    console.error('Test email error:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Test email could not be sent.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| Google Gmail OAuth - Connect
|--------------------------------------------------------------------------
| GET /api/emails/google/connect
*/

router.get('/google/connect', (req, res) => {
  try {
    const authUrl = getGoogleAuthUrl();
    return res.redirect(authUrl);
  } catch (error) {
    console.error('Google connect error:', error);

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Unable to start Google Gmail connection.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| Google Gmail OAuth - Callback
|--------------------------------------------------------------------------
| GET /api/emails/google/callback
*/

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; padding: 40px;">
            <h2>Google Gmail Connection Failed</h2>
            <p>Google authorization code is missing.</p>
          </body>
        </html>
      `);
    }

    const tokens = await getGoogleTokens(code);

    console.log('Google Gmail OAuth tokens received successfully.');
    console.log('Refresh token available:', Boolean(tokens.refresh_token));

    const savedConnection = await saveGoogleTokens(tokens);

    console.log('Google Gmail connection saved successfully:', {
      email: savedConnection.email,
      hasAccessToken: savedConnection.hasAccessToken,
      hasRefreshToken: savedConnection.hasRefreshToken,
      tokenExpiry: savedConnection.tokenExpiry,
    });

    return res.status(200).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px; background: #f8fafc;">
          <div style="max-width: 600px; margin: 40px auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
            <h2 style="color: #5E52B7;">HomeTurf CRM Gmail Connected Successfully</h2>
            <p>Your Gmail account has been connected successfully.</p>
            <p>Gmail account: <strong>${savedConnection.email}</strong></p>
            <p>Gmail credentials have been saved successfully.</p>
            <p>You can close this window.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google OAuth callback error:', error);

    return res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; padding: 40px;">
          <h2>Google Gmail Connection Failed</h2>
          <p>Unable to connect the Gmail account.</p>
          <p>
            ${
              process.env.NODE_ENV === 'development'
                ? error.message
                : ''
            }
          </p>
        </body>
      </html>
    `);
  }
});

/*
|--------------------------------------------------------------------------
| Gmail Inbox Sync
|--------------------------------------------------------------------------
| GET /api/emails/google/sync
*/

router.get('/google/sync', async (req, res) => {
  try {
    console.log('Starting Gmail inbox sync...');

    const result = await syncGmailInbox();

    console.log('Gmail inbox sync completed:', result);

    return res.status(200).json({
      success: true,
      message: 'Gmail inbox synced successfully.',
      data: result,
    });
  } catch (error) {
    console.error('Gmail sync route error:', error);

    return res.status(500).json({
      success: false,
      message: error.message || 'Gmail inbox sync failed.',
    });
  }
});

/*
|--------------------------------------------------------------------------
| Resend Webhook
|--------------------------------------------------------------------------
| POST /api/emails/webhook
*/

router.post('/webhook', handleResendWebhook);

/*
|--------------------------------------------------------------------------
| Manual Incoming Email
|--------------------------------------------------------------------------
| POST /api/emails/incoming
*/

router.post('/incoming', handleIncomingEmail);

/*
|--------------------------------------------------------------------------
| Get Email Conversations
|--------------------------------------------------------------------------
| GET /api/emails/conversations
*/

router.get('/conversations', getEmailConversations);

/*
|--------------------------------------------------------------------------
| Get Single Email Conversation
|--------------------------------------------------------------------------
| GET /api/emails/conversations/:id
*/

router.get('/conversations/:id', getEmailConversationById);

/*
|--------------------------------------------------------------------------
| Delete Email Conversation
|--------------------------------------------------------------------------
| DELETE /api/emails/conversations/:id
|--------------------------------------------------------------------------
| Deletes the conversation and its related messages from MongoDB.
*/

router.delete(
  '/conversations/:id',
  deleteEmailConversation
);

/*
|--------------------------------------------------------------------------
| Send Manual Email Reply
|--------------------------------------------------------------------------
| POST /api/emails/conversations/:id/reply
*/

router.post(
  '/conversations/:id/reply',
  sendManualEmailReply
);

module.exports = router;