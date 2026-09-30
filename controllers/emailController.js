const mongoose = require('mongoose');
const { Resend } = require('resend');

const EmailConversation = require('../models/EmailConversation');
const EmailMessage = require('../models/EmailMessage');
const GmailConnection = require('../models/GmailConnection');

const {
  sendInitialAutoReply,
} = require('../services/emailService');

const {
  sendGmailEmail,
} = require('../services/gmailService');

/*
|--------------------------------------------------------------------------
| Resend Client
|--------------------------------------------------------------------------
| Kept for the existing Resend webhook compatibility.
| Manual Gmail replies no longer use Resend.
|--------------------------------------------------------------------------
*/

const resend = new Resend(
  process.env.RESEND_API_KEY
);

/*
|--------------------------------------------------------------------------
| Save Google Gmail OAuth Tokens
|--------------------------------------------------------------------------
*/

const saveGoogleTokens = async (tokens) => {
  try {
    const gmailEmail =
      process.env.EMAIL_INBOX
        ?.trim()
        .toLowerCase();

    if (!gmailEmail) {
      throw new Error(
        'EMAIL_INBOX is not configured.'
      );
    }

    let gmailConnection =
      await GmailConnection.findOne({
        email: gmailEmail,
      }).select(
        '+accessToken +refreshToken'
      );

    if (!gmailConnection) {
      gmailConnection =
        new GmailConnection({
          email: gmailEmail,
        });
    }

    if (tokens?.access_token) {
      gmailConnection.accessToken =
        tokens.access_token;
    }

    if (tokens?.refresh_token) {
      gmailConnection.refreshToken =
        tokens.refresh_token;
    }

    if (tokens?.expiry_date) {
      gmailConnection.tokenExpiry =
        new Date(tokens.expiry_date);
    }

    gmailConnection.connected = true;

    await gmailConnection.save();

    return {
      success: true,
      email: gmailConnection.email,
      hasAccessToken: Boolean(
        gmailConnection.accessToken
      ),
      hasRefreshToken: Boolean(
        gmailConnection.refreshToken
      ),
      tokenExpiry:
        gmailConnection.tokenExpiry,
    };
  } catch (error) {
    console.error(
      'Save Google Gmail tokens error:',
      error
    );

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Handle Resend Webhook
|--------------------------------------------------------------------------
| POST /api/emails/webhook
|--------------------------------------------------------------------------
*/

const handleResendWebhook = async (req, res) => {
  try {
    if (!process.env.RESEND_WEBHOOK_SECRET) {
      console.error(
        'RESEND_WEBHOOK_SECRET is not configured.'
      );

      return res.status(500).send(
        'Webhook secret is not configured.'
      );
    }

    const payload = Buffer.isBuffer(req.body)
      ? req.body.toString('utf8')
      : typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);

    const event =
      resend.webhooks.verify({
        payload,
        headers: {
          'svix-id':
            req.headers['svix-id'],

          'svix-timestamp':
            req.headers['svix-timestamp'],

          'svix-signature':
            req.headers['svix-signature'],
        },

        secret:
          process.env.RESEND_WEBHOOK_SECRET,
      });

    if (event?.type !== 'email.received') {
      return res.status(200).json({
        success: true,
        message:
          'Webhook event ignored.',
        eventType:
          event?.type || null,
      });
    }

    const emailId =
      event?.data?.email_id;

    if (!emailId) {
      return res.status(400).json({
        success: false,
        message:
          'Received email ID is missing.',
      });
    }

    const {
      data: receivedEmail,
      error: receivedEmailError,
    } =
      await resend.emails.receiving.get(
        emailId
      );

    if (receivedEmailError) {
      console.error(
        'Unable to retrieve received email:',
        receivedEmailError
      );

      return res.status(500).json({
        success: false,
        message:
          'Unable to retrieve received email.',
      });
    }

    if (!receivedEmail) {
      return res.status(404).json({
        success: false,
        message:
          'Received email was not found.',
      });
    }

    const incomingEmailPayload = {
      from:
        receivedEmail.from ||
        event?.data?.from ||
        '',

      to:
        receivedEmail.to ||
        event?.data?.to ||
        [],

      subject:
        receivedEmail.subject ||
        event?.data?.subject ||
        'New HomeTurf Email',

      text:
        receivedEmail.text || '',

      html:
        receivedEmail.html || '',

      messageId:
        receivedEmail.message_id ||
        event?.data?.message_id ||
        '',

      inReplyTo:
        receivedEmail.in_reply_to ||
        receivedEmail.inReplyTo ||
        '',

      references:
        receivedEmail.references || '',

      emailId,
    };

    const fakeRequest = {
      body: incomingEmailPayload,
    };

    let responseStatus = 200;
    let responseData = null;

    const fakeResponse = {
      status(code) {
        responseStatus = code;
        return this;
      },

      json(data) {
        responseData = data;
        return this;
      },
    };

    await handleIncomingEmail(
      fakeRequest,
      fakeResponse
    );

    if (responseStatus >= 400) {
      console.error(
        'Incoming email processing failed:',
        responseData
      );

      return res.status(500).json({
        success: false,
        message:
          'Incoming email processing failed.',
      });
    }

    return res.status(200).json({
      success: true,
      message:
        'Resend incoming email webhook processed successfully.',
      data:
        responseData?.data || null,
    });
  } catch (error) {
    console.error(
      'Resend webhook error:',
      error
    );

    return res.status(400).json({
      success: false,
      message:
        'Invalid or failed Resend webhook.',

      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined,
    });
  }
};

/*
|--------------------------------------------------------------------------
| Handle Incoming Email
|--------------------------------------------------------------------------
| POST /api/emails/incoming
|--------------------------------------------------------------------------
*/

const handleIncomingEmail = async (req, res) => {
  try {
    const {
      from,
      to,
      subject,
      text,
      html,
      messageId,
      inReplyTo,
      references,
    } = req.body;

    const senderEmail =
      typeof from === 'string'
        ? from
        : from?.email ||
          from?.address ||
          '';

    const senderName =
      typeof from === 'object'
        ? from?.name || ''
        : '';

    const recipientEmail =
      typeof to === 'string'
        ? to
        : Array.isArray(to)
        ? typeof to[0] === 'string'
          ? to[0]
          : to[0]?.email ||
            to[0]?.address ||
            ''
        : to?.email ||
          to?.address ||
          '';

    const emailSubject =
      subject ||
      'New HomeTurf Email';

    const emailText = text || '';
    const emailHtml = html || '';

    if (!senderEmail) {
      return res.status(400).json({
        success: false,
        message:
          'Sender email is required.',
      });
    }

    const normalizedSenderEmail =
      senderEmail
        .trim()
        .toLowerCase();

    if (
      normalizedSenderEmail ===
      process.env.EMAIL_INBOX
        ?.trim()
        .toLowerCase()
    ) {
      return res.status(200).json({
        success: true,
        message:
          'Own email ignored.',
        data: {
          ignored: true,
        },
      });
    }

    if (messageId) {
      const existingMessage =
        await EmailMessage.findOne({
          messageId,
        });

      if (existingMessage) {
        return res.status(200).json({
          success: true,
          message:
            'Email message already exists.',
          data: {
            conversationId:
              existingMessage.conversation,

            messageId:
              existingMessage._id,

            duplicate: true,

            autoReplySent: false,
          },
        });
      }
    }

    let conversation =
      await EmailConversation.findOne({
        customerEmail:
          normalizedSenderEmail,
      });

    const isNewConversation =
      !conversation;

    if (!conversation) {
      conversation =
        await EmailConversation.create({
          customerName:
            senderName,

          customerEmail:
            normalizedSenderEmail,

          subject:
            emailSubject,

          status:
            'NEW',

          lastMessage:
            emailText ||
            emailSubject,

          lastMessageAt:
            new Date(),
        });
    } else {
      if (
        senderName &&
        !conversation.customerName
      ) {
        conversation.customerName =
          senderName;
      }

      if (
        emailSubject &&
        !conversation.subject
      ) {
        conversation.subject =
          emailSubject;
      }

      conversation.lastMessage =
        emailText ||
        emailSubject;

      conversation.lastMessageAt =
        new Date();

      if (
        conversation.status ===
        'IN_PROGRESS'
      ) {
        conversation.status =
          'WAITING';
      }

      await conversation.save();
    }

    const incomingMessage =
      await EmailMessage.create({
        conversation:
          conversation._id,

        direction:
          'INCOMING',

        senderEmail:
          normalizedSenderEmail,

        recipientEmail:
          recipientEmail ||
          process.env.EMAIL_INBOX ||
          '',

        senderName,

        subject:
          emailSubject,

        text:
          emailText,

        html:
          emailHtml,

        messageId:
          messageId || '',

        inReplyTo:
          inReplyTo || '',

        references:
          references || '',

        providerMessageId:
          messageId || '',

        isAutoReply:
          false,

        autoReplyType:
          'NONE',

        deliveryStatus:
          'DELIVERED',
      });

    conversation.latestMessageId =
      messageId || '';

    conversation.lastMessage =
      emailText ||
      emailSubject;

    conversation.lastMessageAt =
      new Date();

    await conversation.save();

    let autoReply = null;

    /*
    |--------------------------------------------------------------------------
    | Initial Auto Reply
    |--------------------------------------------------------------------------
    | Gmail sync has its own Gmail API auto-reply flow.
    | This remains for the existing /incoming Resend flow.
    |--------------------------------------------------------------------------
    */

    if (isNewConversation) {
      try {
        const existingInitialReply =
          await EmailMessage.findOne({
            conversation:
              conversation._id,

            direction:
              'OUTGOING',

            isAutoReply:
              true,

            autoReplyType:
              'INITIAL_REQUEST',
          });

        if (!existingInitialReply) {
          autoReply =
            await sendInitialAutoReply({
              customerEmail:
                normalizedSenderEmail,

              customerName:
                senderName,

              conversationId:
                conversation._id,

              inReplyTo:
                messageId || '',

              references:
                references ||
                messageId ||
                '',
            });

          conversation.status =
            'WAITING';

          conversation.lastMessage =
            'Automatic reply sent to customer.';

          conversation.lastMessageAt =
            new Date();

          if (
            autoReply?.providerMessageId
          ) {
            conversation.latestResendEmailId =
              autoReply.providerMessageId;
          }

          await conversation.save();

          console.log(
            `Initial automatic reply sent to ${normalizedSenderEmail}`
          );
        } else {
          autoReply = {
            success: true,
            skipped: true,
            reason:
              'Initial auto reply already exists.',
          };
        }
      } catch (autoReplyError) {
        console.error(
          `Automatic reply failed for ${normalizedSenderEmail}:`,
          autoReplyError
        );

        autoReply = {
          success: false,
          skipped: false,
          error:
            autoReplyError.message ||
            'Automatic reply failed.',
        };
      }
    }

    return res.status(200).json({
      success: true,
      message:
        'Incoming email processed successfully.',

      data: {
        conversationId:
          conversation._id,

        messageId:
          incomingMessage._id,

        customerName:
          conversation.customerName,

        customerEmail:
          conversation.customerEmail,

        isNewConversation,

        autoReplySent:
          Boolean(
            autoReply?.success &&
            !autoReply?.skipped
          ),

        autoReplySkipped:
          Boolean(
            autoReply?.skipped
          ),

        autoReplyError:
          autoReply?.error || '',
      },
    });
  } catch (error) {
    console.error(
      'Handle incoming email error:',
      error
    );

    return res.status(500).json({
      success: false,

      message:
        'Unable to process incoming email.',

      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined,
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Email Conversations
|--------------------------------------------------------------------------
| GET /api/emails/conversations
|--------------------------------------------------------------------------
*/

const getEmailConversations = async (
  req,
  res
) => {
  try {
    const conversations =
      await EmailConversation.find()
        .sort({
          lastMessageAt: -1,
        })
        .lean();

    return res.status(200).json({
      success: true,

      count:
        conversations.length,

      data:
        conversations,
    });
  } catch (error) {
    console.error(
      'Get email conversations error:',
      error
    );

    return res.status(500).json({
      success: false,

      message:
        'Unable to fetch email conversations.',

      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined,
    });
  }
};

/*
|--------------------------------------------------------------------------
| Get Single Email Conversation
|--------------------------------------------------------------------------
| GET /api/emails/conversations/:id
|--------------------------------------------------------------------------
*/

const getEmailConversationById =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            'Invalid email conversation ID.',
        });
      }

      const conversation =
        await EmailConversation.findById(
          id
        ).lean();

      if (!conversation) {
        return res.status(404).json({
          success: false,

          message:
            'Email conversation not found.',
        });
      }

      const messages =
        await EmailMessage.find({
          conversation: id,
        })
          .sort({
            createdAt: 1,
          })
          .lean();

      return res.status(200).json({
        success: true,

        data: {
          conversation,
          messages,
        },
      });
    } catch (error) {
      console.error(
        'Get email conversation error:',
        error
      );

      return res.status(500).json({
        success: false,

        message:
          'Unable to fetch email conversation.',

        error:
          process.env.NODE_ENV ===
          'development'
            ? error.message
            : undefined,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| Delete Email Conversation
|--------------------------------------------------------------------------
| DELETE /api/emails/conversations/:id
|--------------------------------------------------------------------------
|
| IMPORTANT:
| CRM deletion does NOT touch Gmail.
|
| It only:
| 1. Deletes CRM EmailMessage records.
| 2. Deletes CRM EmailConversation record.
|
| Gmail emails remain untouched.
|--------------------------------------------------------------------------
*/

const deleteEmailConversation =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            'Invalid email conversation ID.',
        });
      }

      const conversation =
        await EmailConversation.findById(
          id
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,

          message:
            'Email conversation not found.',
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Delete CRM Messages Only
      |--------------------------------------------------------------------------
      */

      const deletedMessages =
        await EmailMessage.deleteMany({
          conversation:
            conversation._id,
        });

      /*
      |--------------------------------------------------------------------------
      | Delete CRM Conversation Only
      |--------------------------------------------------------------------------
      */

      await EmailConversation.findByIdAndDelete(
        conversation._id
      );

      return res.status(200).json({
        success: true,

        message:
          'Email conversation deleted from CRM successfully. Gmail email was not changed.',

        data: {
          conversationId:
            conversation._id,

          customerEmail:
            conversation.customerEmail,

          gmailThreadId:
            conversation.gmailThreadId ||
            null,

          gmailTrashed:
            false,

          deletedMessages:
            deletedMessages.deletedCount ||
            0,
        },
      });
    } catch (error) {
      console.error(
        'Delete email conversation error:',
        error
      );

      return res.status(500).json({
        success: false,

        message:
          'Unable to delete email conversation.',

        error:
          process.env.NODE_ENV ===
          'development'
            ? error.message
            : undefined,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| Send Manual Email Reply
|--------------------------------------------------------------------------
| POST /api/emails/conversations/:id/reply
|--------------------------------------------------------------------------
|
| CRM -> Gmail API -> Customer
|
| Resend is NOT used here.
|--------------------------------------------------------------------------
*/

const sendManualEmailReply =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const {
        subject,
        text,
        html,
      } = req.body;

      if (!text && !html) {
        return res.status(400).json({
          success: false,

          message:
            'Email message is required.',
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(id)
      ) {
        return res.status(400).json({
          success: false,

          message:
            'Invalid email conversation ID.',
        });
      }

      const conversation =
        await EmailConversation.findById(
          id
        );

      if (!conversation) {
        return res.status(404).json({
          success: false,

          message:
            'Email conversation not found.',
        });
      }

      if (!conversation.customerEmail) {
        return res.status(400).json({
          success: false,

          message:
            'Customer email address not found.',
        });
      }

      /*
      |--------------------------------------------------------------------------
      | Get Last Incoming Email
      |--------------------------------------------------------------------------
      */

      const lastIncomingMessage =
        await EmailMessage.findOne({
          conversation:
            conversation._id,

          direction:
            'INCOMING',
        })
          .sort({
            createdAt: -1,
          })
          .lean();

      const inReplyTo =
        lastIncomingMessage?.messageId ||
        '';

      const references =
        lastIncomingMessage?.references ||
        lastIncomingMessage?.messageId ||
        '';

      /*
      |--------------------------------------------------------------------------
      | Prepare Subject
      |--------------------------------------------------------------------------
      */

      const emailSubject =
        subject?.trim() ||
        (
          conversation.subject
            ? conversation.subject.startsWith(
                'Re:'
              )
              ? conversation.subject
              : `Re: ${conversation.subject}`
            : 'Re: HomeTurf'
        );

      /*
      |--------------------------------------------------------------------------
      | Send Through Gmail API
      |--------------------------------------------------------------------------
      */

      const result =
        await sendGmailEmail({
          to:
            conversation.customerEmail,

          subject:
            emailSubject,

          text:
            text || '',

          html:
            html || '',

          conversationId:
            conversation._id,

          threadId:
            conversation.gmailThreadId ||
            '',

          inReplyTo,

          references,

          isAutoReply:
            false,

          autoReplyType:
            'GENERAL_REPLY',
        });

      /*
      |--------------------------------------------------------------------------
      | Update Conversation
      |--------------------------------------------------------------------------
      */

      conversation.lastMessage =
        text ||
        'Email sent to customer.';

      conversation.lastMessageAt =
        new Date();

      conversation.status =
        'IN_PROGRESS';

      if (
        result?.messageId
      ) {
        conversation.latestMessageId =
          result.messageId;
      }

      await conversation.save();

      return res.status(200).json({
        success: true,

        message:
          'Email reply sent successfully through Gmail.',

        data: {
          conversationId:
            conversation._id,

          customerEmail:
            conversation.customerEmail,

          subject:
            emailSubject,

          providerMessageId:
            result?.messageId || '',

          gmailMessageId:
            result?.messageId || '',

          gmailThreadId:
            conversation.gmailThreadId ||
            null,

          message:
            result || null,
        },
      });
    } catch (error) {
      console.error(
        'Send manual Gmail reply error:',
        error
      );

      return res.status(500).json({
        success: false,

        message:
          error.message ||
          'Unable to send email reply.',

        error:
          process.env.NODE_ENV ===
          'development'
            ? error.message
            : undefined,
      });
    }
  };

/*
|--------------------------------------------------------------------------
| Exports
|--------------------------------------------------------------------------
*/

module.exports = {
  handleIncomingEmail,
  handleResendWebhook,
  getEmailConversations,
  getEmailConversationById,
  deleteEmailConversation,
  sendManualEmailReply,
  saveGoogleTokens,
};
