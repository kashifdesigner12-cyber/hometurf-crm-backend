const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    channel: {
      type: String,
      enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'SMS', 'EMAIL'],
      required: [true, 'Please specify conversation channel'],
    },
    externalConversationId: {
      type: String,
      trim: true,
      default: '',
    },
    lastMessage: {
      type: String,
      default: '',
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED'],
      default: 'OPEN',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Conversation', conversationSchema);