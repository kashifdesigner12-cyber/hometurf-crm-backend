const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
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
    phoneNumber: {
      type: String,
      required: [true, 'Please provide caller phone number'],
      trim: true,
    },
    direction: {
      type: String,
      enum: ['INCOMING', 'OUTGOING'],
      default: 'INCOMING',
    },
    status: {
      type: String,
      enum: ['COMPLETED', 'MISSED', 'IN_PROGRESS', 'TRANSFERRED', 'FAILED'],
      default: 'COMPLETED',
    },
    duration: {
      type: Number,
      default: 0,
    },
    recordingUrl: {
      type: String,
      default: '',
    },
    transcript: {
      type: String,
      default: '',
    },
    summary: {
      type: String,
      default: '',
    },
    outcome: {
      type: String,
      default: '',
    },
    transferredTo: {
      type: String,
      default: '',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Call', callSchema);