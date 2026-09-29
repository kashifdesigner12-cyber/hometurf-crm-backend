const mongoose = require('mongoose');

const emailConversationSchema = new mongoose.Schema(
  {
    /*
    |--------------------------------------------------------------------------
    | Customer Basic Information
    |--------------------------------------------------------------------------
    */

    customerName: {
      type: String,
      trim: true,
      default: '',
    },

    customerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Email Conversation Information
    |--------------------------------------------------------------------------
    */

    subject: {
      type: String,
      trim: true,
      default: 'New HomeTurf Email',
    },

    status: {
      type: String,
      enum: [
        'NEW',
        'IN_PROGRESS',
        'WAITING',
        'CLOSED',
      ],
      default: 'NEW',
      index: true,
    },

    lastMessage: {
      type: String,
      default: '',
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Email Thread Information
    |--------------------------------------------------------------------------
    |
    | These IDs are used to keep Gmail messages connected
    | with the CRM conversation and to allow deletion of
    | the Gmail thread later.
    |
    */

    latestMessageId: {
      type: String,
      default: '',
      index: true,
    },

    gmailThreadId: {
      type: String,
      default: '',
      index: true,
    },

    latestResendEmailId: {
      type: String,
      default: '',
      index: true,
    },

    /*
    |--------------------------------------------------------------------------
    | Customer Information
    |--------------------------------------------------------------------------
    |
    | These fields can later be automatically extracted
    | from the customer's email replies.
    |
    */

    customerInfo: {
      phone: {
        type: String,
        default: '',
      },

      address: {
        type: String,
        default: '',
      },

      service: {
        type: String,
        default: '',
      },

      preferredDate: {
        type: String,
        default: '',
      },

      lawnSize: {
        type: String,
        default: '',
      },

      notes: {
        type: String,
        default: '',
      },
    },

    /*
    |--------------------------------------------------------------------------
    | Lead Status
    |--------------------------------------------------------------------------
    */

    leadCreated: {
      type: Boolean,
      default: false,
    },

    leadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const EmailConversation =
  mongoose.model(
    'EmailConversation',
    emailConversationSchema
  );

module.exports =
  EmailConversation;