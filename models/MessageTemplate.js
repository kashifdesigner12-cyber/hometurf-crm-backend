const mongoose = require('mongoose');

const messageTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a template name'],
      unique: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        'WELCOME',
        'BOOKING_CONFIRMATION',
        'APPOINTMENT_CONFIRMATION',
        'APPOINTMENT_REMINDER',
        'SERVICE_COMPLETED',
        'THANK_YOU',
        'REVIEW_REQUEST',
        'REVIEW_REMINDER',
        'REVIEW_FOLLOWUP',
        'CUSTOM',
      ],
      required: [true, 'Please provide template type'],
    },

    subject: {
      type: String,
      default: '',
      trim: true,
    },

    content: {
      type: String,
      required: [true, 'Please provide template content'],
      trim: true,
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  'MessageTemplate',
  messageTemplateSchema
);