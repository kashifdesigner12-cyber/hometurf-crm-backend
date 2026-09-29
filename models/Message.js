const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Message must belong to a conversation'],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    sender: {
      type: String,
      default: 'SYSTEM',
    },
    content: {
      type: String,
      required: [true, 'Message content cannot be empty'],
    },
    channel: {
      type: String,
      enum: ['FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'SMS', 'EMAIL'],
      required: [true, 'Please specify message channel'],
    },
    direction: {
      type: String,
      enum: ['INCOMING', 'OUTGOING'],
      required: [true, 'Please specify message direction'],
    },
    externalMessageId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'FAILED'],
      default: 'SENT',
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Message', messageSchema);