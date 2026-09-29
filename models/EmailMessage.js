const mongoose = require('mongoose');

const emailMessageSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | Conversation
    |--------------------------------------------------------------------------
    */

    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmailConversation',
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Message Direction
    |--------------------------------------------------------------------------
    */

    direction: {
      type: String,
      enum: [
        'INCOMING',
        'OUTGOING',
      ],
      required: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Sender / Recipient
    |--------------------------------------------------------------------------
    */

    senderEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    recipientEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    senderName: {
      type: String,
      trim: true,
      default: '',
    },

    /*
    |--------------------------------------------------------------------------
    | Email Content
    |--------------------------------------------------------------------------
    */

    subject: {
      type: String,
      trim: true,
      default: '',
    },

    text: {
      type: String,
      default: '',
    },

    html: {
      type: String,
      default: '',
    },

    /*
    |--------------------------------------------------------------------------
    | Email Provider / Thread IDs
    |--------------------------------------------------------------------------
    |
    | messageId:
    | RFC email Message-ID used for email threading.
    |
    | gmailMessageId:
    | Gmail's internal message ID.
    |
    | gmailThreadId:
    | Gmail's internal thread ID.
    |
    | resendEmailId:
    | Resend's internal received email ID.
    |
    */

    messageId: {
      type: String,
      default: '',
      index: true,
    },

    gmailMessageId: {
      type: String,
      default: '',
      index: true,
    },

    gmailThreadId: {
      type: String,
      default: '',
      index: true,
    },

    resendEmailId: {
      type: String,
      default: '',
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Email Reply Threading
    |--------------------------------------------------------------------------
    */

    inReplyTo: {
      type: String,
      default: '',
    },

    references: {
      type: String,
      default: '',
    },

    /*
    |--------------------------------------------------------------------------
    | Auto Reply Information
    |--------------------------------------------------------------------------
    */

    isAutoReply: {
      type: Boolean,
      default: false,
    },

    autoReplyType: {
      type: String,
      enum: [
        'NONE',
        'INITIAL_REQUEST',
        'MISSING_INFORMATION',
        'INFORMATION_RECEIVED',
        'GENERAL_REPLY',
      ],
      default: 'NONE',
    },

    /*
    |--------------------------------------------------------------------------
    | Email Delivery Status
    |--------------------------------------------------------------------------
    */

    deliveryStatus: {
      type: String,
      enum: [
        'PENDING',
        'SENT',
        'DELIVERED',
        'FAILED',
      ],
      default: 'PENDING',
    },

    /*
    |--------------------------------------------------------------------------
    | Provider Message ID
    |--------------------------------------------------------------------------
    |
    | Used for outgoing emails, especially Resend.
    |
    */

    providerMessageId: {
      type: String,
      default: '',
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Error Information
    |--------------------------------------------------------------------------
    */

    errorMessage: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const EmailMessage =
  mongoose.model(
    'EmailMessage',
    emailMessageSchema
  );

module.exports =
  EmailMessage;