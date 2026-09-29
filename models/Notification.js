const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide notification title'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Please provide notification message'],
    },
    type: {
      type: String,
      enum: [
        'NEW_LEAD',
        'NEW_MESSAGE',
        'NEW_CALL',
        'MISSED_CALL',
        'NEW_APPOINTMENT',
        'SERVICE_COMPLETED',
        'NEW_REVIEW',
      ],
      required: [true, 'Please provide notification type'],
    },
    read: {
      type: Boolean,
      default: false,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    referenceType: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Notification', notificationSchema);