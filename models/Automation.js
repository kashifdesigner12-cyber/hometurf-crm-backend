const mongoose = require('mongoose');

const automationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide automation name'],
      trim: true,
    },

    trigger: {
      type: String,
      enum: [
        'NEW_LEAD',
        'APPOINTMENT_CONFIRMED',
        'APPOINTMENT_REMINDER',
        'SERVICE_COMPLETED',
        'REVIEW_FOLLOWUP',
      ],
      required: [true, 'Please specify automation trigger'],
      trim: true,
      uppercase: true,
    },

    action: {
      type: String,
      enum: [
        'SEND_MESSAGE',
        'SEND_REVIEW_REQUEST',
        'NOTIFY_STAFF',
      ],
      default: 'SEND_MESSAGE',
      trim: true,
      uppercase: true,
    },

    delay: {
      type: Number,
      default: 0,
      min: 0,
    },

    active: {
      type: Boolean,
      default: true,
    },

    messageTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MessageTemplate',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Automation', automationSchema);